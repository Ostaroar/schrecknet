# ADR 0016 — local backup format: raw `user.sqlite` in a JSON envelope

## Status

Accepted.

## Context

Decks, inventory and owned-precon counts exist only in the browser
(`user.sqlite` in OPFS, `userDbWorker.ts`). Nothing is uploaded — that is a
deliberate promise, stated in `LegalPage.tsx` — but it also means nothing is
recoverable. Clearing "cookies and site data" destroys all of it, and that is
not a hypothetical: the project owner did exactly that as a workaround for the
stale-card-data bug in ADR 0015.

Two problems, only one of which ADR 0015 addresses. ADR 0015 removes the
*reason* anyone would clear site data. It does nothing about the fact that the
data has no backup at all, and browsers may evict "best effort" storage on their
own — `navigator.storage.persist()` was never called anywhere.

The exports that existed were piecemeal and text-only:
`exportDeckText` (one deck), `buildShareUrl` (one deck, ids and quantities
only), `exportInventoryText` (loose card quantities), `exportGlobalMissingText`
(a want list). Between them they covered *none* of: `inventory_precons` (owned
precons), `deck_tags`, `decks.description`, `decks.author`,
`decks.inventory_mode`, `deck_card_inventory_overrides`, or any localStorage
key. `importInventoryText` also *adds* quantities, so importing twice doubles an
inventory — acceptable for merging a shared list, wrong for restoring a backup.

The `inventory_precons` omission is the important signal: that table arrived in
migration 0006 and every exporter was written before it and never updated. Any
format that enumerates what to save will drift the same way.

## Decision

**Copy the whole database file, not table-by-table rows.** The backup embeds the
raw `user.sqlite` bytes (via the SAH pool's `exportFile`). This is complete *by
construction*: a table added by a future migration is in backups the day it
lands, with no export code to remember. Restoring an older backup is already
safe because `userDbWorker.ts` migrates on open — `PRAGMA user_version` plus
`MIGRATIONS.slice(currentVersion)` — so a pre-0006 backup upgrades itself.

**Wrap it in a JSON envelope, because localStorage is load-bearing and outside
the database.** Game-group codes and per-group write passphrases live only in
localStorage; losing them loses access to a server-side group outright, and no
amount of SQLite copying recovers that.

```json
{
  "format": "schrecknet-backup",
  "version": 1,
  "created_at": "…",
  "app_data_version": "9.13",
  "user_db_base64": "…",
  "local_storage": { "schrecknet.…": "…" }
}
```

**Select localStorage by prefix, not by list.** Every key this app writes starts
with `schrecknet.`, including runtime-built ones
(`schrecknet.game-group-write-passphrase.<code>`). A prefix match cannot fall
behind the way an allowlist would — the same argument as copying the whole
database. Restore clears only `schrecknet.`-prefixed keys, so an unrelated key
from anything else on the origin is left alone.

**Restore replaces; it never merges.** Merging is where
`importInventoryText`'s doubling bug lives, and a backup whose restore silently
doubles an inventory is worse than no backup. The UI states current-vs-incoming
counts, requires confirmation, and — because the overwrite is irreversible —
automatically downloads a backup of the current state first. A malformed or
too-new envelope is refused outright rather than half-imported.

**JSON + base64, not zip.** A zip means a new runtime dependency (AGENTS.md
rule 7) to save ~25% on a file written by hand a few times a year. Not worth it.

**TypeScript, not `core/`.** Base64 of opaque bytes plus a string map is
orchestration, not domain logic. The one thing genuinely shared with the server
is the migration set, and `migrations/` is already shared (`server/src/user_db.rs`
compiles the same files via `include_str!`).

Also decided here: call `navigator.storage.persist()` on the first *write* to
user data rather than at page load. Browsers weigh engagement, so asking when
the user is creating their first deck is both likelier to be granted and easier
to justify than prompting a first-time visitor who has nothing to lose.

## Alternatives considered

- **Structured per-table JSON dump.** More readable and mergeable, and it would
  allow partial restore. Rejected as the primary format precisely because it
  reintroduces the enumeration that already failed — someone must remember to
  add each new table. Readability is not worth a format that silently loses data.
- **A bare `.sqlite` download.** Simplest of all, but cannot carry the
  localStorage keys, and the game-group passphrases are the one thing that is
  genuinely unrecoverable without them.
- **Wait for Phase 3 accounts/sync.** That is the real fix for durability, but it
  needs identity, auth and conflict resolution. Leaving data unbacked-up until
  then was not acceptable given a user had just been told to wipe it.

## Consequences

- A new `/settings` page ("Data & backup") holds backup, restore, storage status
  and the card-data reload escape hatch from ADR 0015. Reached from the footer
  rather than the main nav, which already has eleven tabs.
- The backup file contains game-group write passphrases, so it is sensitive.
  The UI says so plainly ("treat it like a password"); this ADR is the record
  that the exposure is intentional and why.
- A quiet, dismissible reminder appears on the deck and inventory pages when the
  user has data and no backup in the last 30 days. Not a modal, and never shown
  to someone with nothing to lose.
- The existing text exporters stay as they are: sharing a decklist with another
  player is a different job from taking a backup, and the share/interop formats
  are still the right tool for it.
- Forward compatibility: `readBackup` refuses `version > 1` with an explanatory
  message instead of guessing. Phase 3 can ingest this same envelope server-side
  — the embedded database conforms to the shared `migrations/` set the server
  already compiles — so this is not a dead end.
- Verified by `npm run test:backup`, which seeds a database in Node from the real
  migrations, restores it through the actual Settings UI in a fresh browser
  profile, exports again, and compares every table from `sqlite_master` plus
  `user_version` — so the completeness property is enforced generically rather
  than against a hand-written list of tables.
