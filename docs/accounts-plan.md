# Accounts & Sync — Design Pass (Phase 3)

**Status: design only. Nothing here is implemented.** The authentication
decision — passkeys only, no email, no OAuth — is
[ADR 0019](adr/0019-passkey-only-accounts-no-email.md); this document is the
data model, auth boundary, sync semantics and milestone breakdown that turns
the vague Phase 3 backlog into estimable work.

Same shape as [docs/game-groups-plan.md](game-groups-plan.md) and
[docs/inventory-plan.md](inventory-plan.md).

## 1. Scope — what an account is and is not

An account exists for exactly one reason: **your decks and inventory follow you
to another device.** It is not a profile, not a social feature, not a
prerequisite for anything.

| | Logged out (default, unchanged) | Logged in |
| --- | --- | --- |
| Card search, semantic search, card pages | ✔ | ✔ |
| Deck building, inventory, limited formats | ✔ (local `user.sqlite`) | ✔ (same, plus sync) |
| Precons, TWD browser, deck tools, draw sim | ✔ | ✔ |
| Game groups | ✔ (code-gated) | ✔ (unchanged — deliberately *not* tied to accounts) |
| Backup/restore | ✔ | ✔ |
| Sync across devices | ✘ | ✔ |

**Hard requirement: every row above must stay ✔ in the logged-out column
forever.** "Search fast. Build locally. Keep control." is the product, and an
account is an optional convenience bolted on top. A regression here is a
release blocker, not a bug.

Game groups deliberately stay account-free. They already work, their trust model
(shareable code + optional Argon2id passphrase) is coherent, and coupling them to
accounts would break existing groups for zero gain.

## 2. Data model

One new shared migration, `migrations/0008_accounts.sql`. Note the existing
quirk: `migrations/` is applied to **both** the browser's `user.sqlite` and the
server's `app.sqlite` (`server/src/user_db.rs` `include_str!`s the same files),
so these tables will also be created — empty and unused — in every user's
browser. That is already true of the `game_groups` tables from migration 0004,
so this follows established precedent rather than introducing a new oddity.

```sql
CREATE TABLE users(
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- Argon2id, exact hash/verify pattern from game_groups.rs. Never the code.
  recovery_code_hash TEXT NOT NULL
);

-- One row per passkey. Several per user is the normal case, not an edge case:
-- it is the primary multi-device and device-loss story (ADR 0019).
--
-- Refined during A1: the credential is stored as webauthn-rs's own serialized
-- `Passkey` (which is Serialize/Deserialize) rather than hand-unpacked
-- public-key/sign-count columns. The internals are opaque by design and
-- reaching into them needs the crate's `danger-credential-internals` feature;
-- `Passkey::update_credential()` also maintains the signature counter for us.
CREATE TABLE user_credentials(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id BLOB NOT NULL UNIQUE,   -- lookup key WebAuthn hands back
  passkey_json TEXT NOT NULL,
  nickname TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX user_credentials_user_idx ON user_credentials(user_id);

-- Browser sessions. The token itself is never stored, only its SHA-256.
CREATE TABLE user_sessions(
  token_hash BLOB PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX user_sessions_user_idx ON user_sessions(user_id);

-- Bearer tokens for MCP/REST clients, which have neither cookies nor an
-- authenticator. Separate table so they can be listed and revoked individually
-- and carry strictly fewer privileges than a session (see § 3).
CREATE TABLE user_api_tokens(
  token_hash BLOB PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT
);

-- The synced payload: one AES-GCM ciphertext per user, holding the ADR 0016
-- envelope. Opaque to the server by construction.
CREATE TABLE user_sync_blobs(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  device_label TEXT,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  byte_size INTEGER NOT NULL
);
```

Randomness (recovery codes, session tokens, API tokens) comes from SQLite's
`randomblob`, matching `game_groups.rs`'s deliberate "no new `rand` crate"
choice. Hashing reuses the existing `argon2` dependency. The single new runtime
dependency is `webauthn-rs`, authorized by ADR 0019.

**Pending WebAuthn ceremonies** (registration and authentication are each two
round-trips) are held in an in-memory map with a ~60 s TTL rather than a table.
Correct today because the deployment is deliberately single-replica
(`k8s/deployment.yaml`, `Recreate` strategy, one RWO volume). A deploy landing
mid-ceremony costs the user one retry.
`ponytail: in-memory ceremony state, single-replica only — move to a table if the deployment ever scales out.`

## 3. Auth boundary

The genuinely new risk surface: the first identity-bound data this project has
ever stored. Everything below is unchanged from today unless marked **new**.

**Stays public and unauthenticated** — all of it, forever: card and semantic
search, card detail, precons, the TWD browser, deck tools
(validate/diff/import/export), `draw_hand`, `cards.meta.json`, the OpenAPI spec
and Swagger UI, and the code-gated game-group endpoints.

**New, authenticated:** sync pull/push, listing/renaming/revoking passkeys,
creating/revoking API tokens, and account deletion.

**Two credential types, deliberately unequal:**

| | Session cookie (browser) | Bearer token (MCP/REST) |
| --- | --- | --- |
| Read/write sync blob | ✔ | ✔ |
| Read account info | ✔ | ✔ |
| Register/remove a passkey | ✔ | ✘ |
| Create/revoke API tokens | ✔ | ✘ |
| Delete the account | ✔ | ✘ |

A leaked API token must not be able to escalate into permanent account
takeover — it can read and write the (encrypted) blob, and nothing else. Only a
live passkey ceremony can change *who can log in*.

- **Cookie:** `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, opaque
  random token, hashed at rest, sliding expiry with an absolute cap. Strictly
  necessary → **no consent banner** (ADR 0019 § 6).
- **CSRF:** `SameSite=Lax` plus JSON-only, non-GET state changes. Any future
  form-encoded endpoint would need an explicit token.
- **Rate limiting (new):** on both ceremony endpoints and recovery-code
  redemption. The code is 128-bit so brute force is infeasible on paper; the
  limit exists so a burst is cheap to absorb and visible in logs.
- **`sign_count`:** stored and compared for clone detection, tolerating
  authenticators that always report `0` (common, and not an error).

## 4. Sync semantics

The payload is the **ADR 0016 envelope, unchanged** — that ADR explicitly
reserved it for this ("Phase 3 can ingest this same envelope server-side").
Encrypted client-side with WebCrypto AES-GCM before upload; key material derived
from the recovery code via HKDF with two distinct `info` strings so the
identity-proving value and the decryption key are independent (ADR 0019 § 5).

- **Pull:** returns `{version, updated_at, device_label, nonce, ciphertext}`.
- **Push:** carries the `expected_version` the client last saw. A mismatch is a
  **409** with the server's version, timestamp and device label — never a silent
  overwrite.
- **Conflicts are resolved by the user, never merged.** The UI presents "this
  device" vs "*iPhone*, 2 hours ago" and requires a choice, exactly mirroring
  ADR 0016's "restore replaces; it never merges" — and doubly forced here, since
  the server cannot read the blob to merge it even if we wanted that.
- **No CRDT.** One human with a handful of devices, blobs a few hundred KB at
  most. Whole-payload replace with an explicit conflict prompt is the right
  size; revisit only if real users report real conflict pain.
- **Size cap** (~8 MB) rejected loudly rather than truncated.
- Sync is **manual-first** (an explicit button, plus on login). Background
  auto-sync is a later refinement, not v1 — it multiplies conflicts.

## 5. Capability shape (MCP + REST)

AGENTS.md hard rule 2 — both surfaces or neither — with one honest exception.

REST (`/api/v1/account/…`): `register/start`, `register/finish`, `login/start`,
`login/finish`, `logout`, `GET /account`, `DELETE /account`,
`GET|PUT /account/sync`, `GET|POST|DELETE /account/credentials`,
`GET|POST|DELETE /account/tokens`.

MCP: `get_account`, `get_sync_blob`, `put_sync_blob`, `revoke_api_token`.

**The exception, stated plainly:** the four WebAuthn ceremony endpoints have no
MCP equivalent, because a ceremony requires a browser-resident authenticator —
there is nothing an MCP client could do with them. This is a transport
limitation, not a capability shipped on one surface only: every *capability*
(read/write your data, inspect your account, revoke access) exists on both.
Recorded here so a future reviewer doesn't read it as a hard-rule violation.

## 6. Frontend

- New `/account` route: signed-out shows what an account is for and what it
  costs; signed-in shows display name, passkey list (nickname, added, last
  used), API tokens, sync status, and delete.
- Recovery code shown **once**, at signup, with copy/print and a required
  "I've saved it" confirmation — same "treat it like a password" framing as the
  ADR 0016 backup file.
- Sync status surfaces in `/settings` next to backup/restore, since they are the
  same concern (durability) from the user's point of view.
- Localized en/es/fr/de like every other page.
- Nav placement: footer, next to Settings — not a 13th top-level tab.

## 7. Milestones

Each ends deployable. A1–A2 ship no user-visible feature; that is intentional.

- **A1 — schema + WebAuthn ceremonies. ☑ shipped 2026-08-04.**
  `migrations/0008_accounts.sql` (all five tables), `server/src/accounts.rs`,
  `webauthn-rs` wired, register/login/logout/whoami over REST, sessions with
  SHA-256-hashed tokens and a `__Host-` cookie. Recovery-code *generation*
  landed here too rather than in A2, because `users.recovery_code_hash` is
  `NOT NULL`; A2 adds redemption.
  Tests cover display-name normalization and case-insensitive collision,
  recovery code stored only as an Argon2id hash, session round-trip/logout,
  raw token never persisted, expired sessions rejected and swept, and
  ceremony single-use + TTL.
  **Not yet covered:** a full ceremony round-trip needs a virtual authenticator
  (`webauthn-authenticator-rs` as a dev-dependency) — worth adding in A2 rather
  than leaving the happy path untested forever.
- **A2 — recovery code + credential management. ☑ shipped 2026-08-04.**
  Redeem a recovery code to register a replacement passkey (locked-out path, no
  session needed); add a passkey from a live session (the "second device" path,
  and the one users should reach for *before* they need the code); list, rename
  and remove passkeys, with removal of the last one refused.
  Redeeming **rotates** the recovery code, so a used one is never valid twice.
  Recovery attempts are throttled per display name — not because 128 random bits
  are guessable, but because verifying one costs a full Argon2id hash, which
  makes an unthrottled endpoint a cheap CPU-exhaustion lever.
  One `passkeys/finish` endpoint completes both add paths: the server-side
  ceremony already records which account it is for and how it was authorised,
  so a client-supplied hint would be strictly weaker.
  Tests additionally cover recovery-code verify/reject, the throttle being
  per-account, the last-passkey guard, cross-account credential isolation
  (row ids are global, so passing someone else's must fail on ownership),
  rename/clear, and `ON DELETE CASCADE` actually firing.
  **Still deferred: the full ceremony round-trip test.** `webauthn-authenticator-rs`
  exposes only the low-level `AuthenticatorBackendHashedClientData` trait, which
  needs hand-built client-data hashes — enough version-sensitive plumbing that
  it is its own task rather than a rider on this one. The happy path is
  currently proven by hand in a browser, which is not good enough long-term.
- **A3 — sync. ☑ shipped 2026-08-04.** `server/src/sync.rs`: blob push/pull,
  optimistic-concurrency version conflict → 409 (carrying the current blob so
  the client can show a real conflict, not a bare error), an 8&nbsp;MB
  ciphertext cap. `frontend/src/lib/syncCrypto.ts`: HKDF-SHA256 (empty salt,
  purpose-specific `info` string — standard practice once the input keying
  material, our 128-bit recovery code, already has its own entropy) deriving
  an AES-256-GCM key that never leaves the browser.
  Server-side tests: version accepted/advances, a stale version is a conflict
  carrying the current blob, pushing "first" when a blob already exists is
  also a conflict, an oversized ciphertext is refused, two users' blobs are
  independent.
  **The recovery-code-rotation trap, closed:** A2's recovery flow rotates the
  code on redemption, which would otherwise permanently orphan any existing
  sync blob — it was encrypted under the old code, and the server has no key
  to re-encrypt it with. `reencryptAfterRotation()` decrypts under the old
  code and re-encrypts under the new one client-side, in the same window both
  codes are known, wired into `AccountPage.tsx`'s recovery flow.
  Conflict UI is manual-first, matching § 4: "keep this device" pushes against
  the *reported* conflicting version (not the stale locally-remembered one,
  which would just 409 again); "use the other device" restores the
  already-decrypted envelope without a redundant re-fetch.
- **A4 — frontend. ☑ shipped 2026-08-04.** `/account`, recovery-code UI, sync
  controls, conflict resolution UI, four languages.
  **Must correct a specific misconception, because it is the one people
  actually have** (raised by the project owner, 2026-08-04): *"do I lose my
  account if I clear browser data?"* The answer is no, and the UI has to say so,
  because the truth is counter-intuitive and inverted:
  - **Passkey — survives.** It lives in the authenticator (platform keychain,
    1Password/Bitwarden, hardware key), not in site storage. Nothing we control.
  - **Session — lost.** You get signed out. Sign in again, that's all.
  - **Decks and inventory — destroyed.** This is the real risk, and it predates
    accounts entirely (ADR 0015/0016). The backup is the mitigation.

  So the account page should push **"add a second passkey"** as the primary
  safeguard (it is the one that works before anything goes wrong), present the
  recovery code as the fallback, and *not* imply that having an account protects
  local data — only sync (A3) does that. Mentioning that passkeys can live in
  1Password/iCloud/Google is worth a line: it requires nothing from us, it is
  entirely the user's choice, and it is what makes device loss a non-event.
- **A5 — MCP + API tokens. ☑ shipped 2026-08-04.** `user_api_tokens` was
  already in the A1 schema, unused until now. Bearer tokens are deliberately
  less privileged than a session (§ 3): they can read/write the sync blob and
  read account info, and nothing else — creating/listing/revoking tokens,
  managing passkeys, and deleting the account all stay session-only, so a
  leaked token cannot escalate into account takeover, verified directly by
  `credentials_of_other_accounts_are_untouchable`-style ownership checks and
  by the REST layer never accepting a bearer token on those routes.
  MCP tools (`get_account`, `get_sync_blob`, `put_sync_blob`,
  `revoke_api_token`) authenticate via `Extension<http::request::Parts>` —
  rmcp's documented way to reach the incoming HTTP request from inside a tool
  handler — reading `Authorization: Bearer <token>`, since MCP's transport has
  no cookie jar. `create_api_token`/`account_create_token` intentionally has
  **no** MCP tool: minting a token needs a session, which MCP callers don't
  have by construction.
- **A6 — legal + deletion. ☑ shipped 2026-08-04.** `DELETE /api/v1/account`
  (session-only, no MCP mirror — the same reasoning as token creation) hard-
  deletes the user row; `ON DELETE CASCADE` on all four child tables does the
  rest. Verified by `deleting_a_user_removes_every_row_across_all_five_account_tables`,
  which populates all five tables (not just the two credentials/sessions
  covered before A3/A5 gave the other three anything to hold) and asserts zero
  rows remain in each — guardrail 4 from § 8, now actually true rather than
  aspirational.
  `LegalPage.tsx`'s Datenschutzerklärung gained § 4 (account/passkey/sync data,
  what's stored, that WebAuthn never sends biometrics to the server, that sync
  ciphertext is technically unreadable by us) and § 3 now says "sofern Sie
  keine Synchronisierung aktivieren" instead of an unqualified "never leaves
  your device" — sections 4-8 renumbered accordingly.

## 8. Guardrails

1. **Logged-out parity never regresses.** An e2e test must assert the core
   routes work with no account and no network calls to `/api/v1/account/…`.
2. **No email column may ever enter this schema** without superseding ADR 0019.
   Same for any third-party identity provider.
3. **The privacy text ships in the same change as sync**, not after it.
4. **Account deletion is a hard delete**, verified by a test that asserts zero
   rows remain across all five tables.
5. **The server must never be able to read a sync blob** — enforced by test, not
   by intention.
6. Do not let accounts creep into game groups, TWD, or anything currently public.
