# ADR 0019 — accounts: passkeys only, no email, no OAuth

**Status:** accepted (design only — no implementation) · 2026-08-04

Design pass for Phase 3. This ADR fixes the *authentication* decision; the data
model, auth boundary and milestones are in [docs/accounts-plan.md](../accounts-plan.md).

## Context

Phase 3 adds optional accounts so decks and inventory can follow a user across
devices. Everything shipped so far works with zero login and must keep doing so
("Search fast. Build locally. Keep control.").

The roadmap's Phase 3 entry, written before this pass, assumed the conventional
shape: *"Register/login/reset (parity) + passkeys"* plus *"Login via
Google/Apple OAuth"*. Both assumptions are re-examined here, because each one
drags in infrastructure and a compliance surface that this project would
otherwise not have.

Three properties of SchreckNet make the conventional shape a poor fit:

1. **The server is a replica, not the source of truth.** Decks and inventory
   live in the browser's `user.sqlite` (OPFS) and keep working offline. ADR 0016
   already ships a complete local backup envelope and explicitly reserves it as
   the Phase 3 sync payload. Losing account access therefore does **not** lose
   data — unlike a conventional web app, where the server holds the only copy.
2. **The privacy statement is currently absolute.** `LegalPage.tsx` states that
   local data *"verlässt Ihr Gerät nicht und ist für uns nicht einsehbar."*
   Anything that uploads readable user content makes that sentence false and
   turns a short Datenschutzerklärung into a longer one.
3. **There is no mail infrastructure, and adding it is not cheap.** A
   `noreply@` sender needs SPF, DKIM and DMARC records, reputation warm-up, and
   realistically a transactional-mail provider — which is a new runtime
   dependency, a recurring cost, and a **GDPR sub-processor** requiring a DPA
   and a named entry in the Datenschutzerklärung. A cold domain's first reset
   mails routinely land in spam, which is worst precisely when a locked-out user
   needs them.

## Decision

### 1. Passkeys (WebAuthn) are the only authentication method

No passwords, therefore no "forgot password", therefore **no email address is
collected at all** — not required, not optional.

Passkeys are already synced by the platform keychains most users have (iCloud
Keychain, Google Password Manager, 1Password, Bitwarden), so "new phone" is
normally a non-event. An account may register **several** passkeys (the data
model supports it from day one), which is the primary multi-device story.

The browser floor this app already requires — OPFS, SQLite WASM, Web Locks — is
at or above the floor for WebAuthn, so a password fallback would exist only for
browsers that cannot run the app anyway. Omitting it costs nothing real and
removes the entire password/reset/email branch.

### 2. Recovery is a one-time recovery code, not an email link

At signup the user is shown a single high-entropy recovery code, generated with
SQLite's `randomblob` (the same "no new `rand` crate" trick `game_groups.rs`
already uses) and stored **only** as an Argon2id hash — reusing the exact
hash/verify pattern already in `game_groups.rs`. Presenting it reuses the
established "treat it like a password" framing from the ADR 0016 backup file.

The code's only power is to register a new passkey on an account. It is not a
login method and cannot be used to read data on its own.

### 3. Losing everything is survivable, because the data is local

If a user loses both their passkeys and their recovery code, the account is
unreachable — and that is acceptable *here*, because their decks and inventory
are still in their browser and still exportable via ADR 0016. The remedy is
"make a new account, upload again", not "please email support". This is the
property that makes email recovery unnecessary; it would not hold for a
server-authoritative app.

### 4. No Google/Apple OAuth

Dropped, reversing the roadmap's Phase 3 bullet:

- It discloses to a third party that a person uses SchreckNet — the opposite of
  this project's posture, and a new sub-processor in the Datenschutzerklärung.
- It requires registering OAuth clients and holding client secrets, plus
  handling provider-side account changes and outages taking login down.
- Its main selling point — "no new password to manage" — is already delivered by
  passkeys, which on those same devices *are* the Apple/Google-synced credential.

### 5. Sync uploads ciphertext, not readable decks

The synced payload is the ADR 0016 envelope, encrypted **in the browser** before
upload with WebCrypto (AES-GCM; native platform API, no new dependency). Key
material is derived from the recovery code via HKDF with two distinct `info`
strings, so the value proving identity to the server and the value decrypting
the blob are independent: the server stores an Argon2id hash of the first and
ciphertext under the second, and holds nothing that helps it read the content.

This keeps *"für uns nicht einsehbar"* literally true even for sync users, and
reduces a server breach to leaking opaque blobs plus display names. The cost is
honest and must be stated in the UI: **we cannot recover your synced data if you
lose the recovery code** — acceptable only because of point 3.

### 6. The session cookie is strictly necessary, so no consent banner

Authentication uses an opaque random session token in a `__Host-`-prefixed,
`HttpOnly`, `Secure`, `SameSite=Lax` cookie, stored hashed server-side. A cookie
used solely to keep a user logged in at their own request is "strictly
necessary" under ePrivacy/§ 25 TTDSG and needs **no** consent banner. No
analytics, no tracking, no third-party cookies — the existing "keine Cookies zu
Tracking- oder Werbezwecken" claim survives intact.

## Alternatives considered

- **Username + password + optional email reset (vdb parity).** The literal
  parity item. Rejected: it is the branch that forces mail infrastructure, makes
  account security equal to inbox security (undoing passkeys' phishing
  resistance), and stores personal data this project otherwise never touches.
- **Passwords with *no* reset path at all.** Avoids email too, but a forgotten
  password is far likelier than a lost passkey *and* a lost recovery code, and
  users reasonably expect passwords to be resettable. Strictly worse than
  passkeys for the same infrastructure cost (zero).
- **Magic-link email login (no password).** Still email, so it inherits every
  deliverability and sub-processor problem while also making every single login
  depend on mail arriving promptly.
- **Plaintext blobs server-side.** Simpler, and would allow server-side merge or
  a future web-only viewer. Rejected: it invalidates the privacy statement for
  sync users and turns any breach into a content breach, for a benefit
  (server-side merge) the sync design does not use anyway.
- **Self-hosted SMTP.** Cheapest on paper, worst on deliverability — exactly the
  concern that prompted this pass.

## Consequences

- **One new runtime dependency**, authorized by this ADR: `webauthn-rs`
  (server-side WebAuthn ceremony verification). Randomness comes from SQLite's
  `randomblob`, hashing from the existing `argon2`, and browser crypto from
  native WebCrypto — so nothing else is added.
- `app.sqlite` gains the project's **first identity-bound tables**. Until now it
  held only code-gated, account-free game-group data. Detailed in
  [docs/accounts-plan.md](../accounts-plan.md).
- The Datenschutzerklärung needs a new section covering the account tables and
  encrypted blobs, and § 3's absolute wording needs a "sofern Sie Sync
  aktivieren" qualifier. The logged-out promise stays unchanged and unqualified.
- GDPR obligations stay small by construction: no email means no marketing data
  and a minimal Art. 30 record; Art. 20 (portability) is already satisfied by
  the existing backup export; Art. 17 (erasure) is a hard delete of a handful of
  rows, with no third-party processor to propagate it to.
- Passkeys are worse on borrowed/shared devices and in locked-down enterprise
  environments. Mitigated by multiple passkeys per account and the recovery
  code; not fully solvable, and accepted.
- **Nothing here is implemented.** This ADR and the plan are the Phase 3 design
  artifact; shipping it is separate, milestone-gated work.
