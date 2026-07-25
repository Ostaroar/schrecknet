# ADR 0015 — the card database states its own version; `/data` is never `immutable`

## Status

Accepted.

## Context

For a few hours the site served stale card data that no reload could fix. The
project owner only escaped it by clearing "cookies and site data" in the
browser — which also destroys every deck and the whole inventory, because those
live in OPFS (`user.sqlite`). Being told to wipe your own data to see a bug fix
is not an acceptable recovery path.

Three things combined. Only the first was intentional, and it was wrong:

1. `server/src/main.rs` applied `Cache-Control: public, max-age=31536000,
   immutable` to `/data`, justified in the commit as "the DB is
   content-versioned". It is not: `/data/cards.sqlite` and
   `/data/cards.meta.json` are **stable** paths whose bytes change on every
   data build. `immutable` promises the exact opposite. (`docs/data.md` claimed
   a "content-hash URL" that the code never implemented, and the header was
   added trusting that claim rather than the code.)
2. `frontend/src/lib/dbWorker.ts` fetched `cards.meta.json` with
   `{cache:'no-cache'}` — so the client *did* learn the new version — but
   fetched `cards.sqlite` with the default cache mode, which the browser
   happily satisfied from its HTTP cache with the old bytes.
3. It then wrote the *expected* version into a separate OPFS stamp file
   (`schrecknet-cards-version`) unconditionally, without checking what it had
   actually downloaded.

The result was a **self-confirming poisoned state**: the stamp claimed 9.13
while the bytes were 9.12, so every later load found "versions match", took the
reuse branch, and never tried again. Nothing short of evicting the HTTP cache
recovered.

The deeper design flaw is (3), independent of any header: keeping the version
in a *different artifact* from the bytes it describes lets the two disagree.
Meanwhile `cards.sqlite` already carries `schema_version` and `data_version` in
its own `meta` table (written by `data/src/main.rs`) — the authoritative answer
was inside the file the whole time and simply went unread.

## Decision

**1. `immutable` only where filenames carry their version.** A single
`cache_control_for_mount()` maps `/assets` (Vite content-hashes) and
`/models/semantic` (path carries the pinned model hash) to `immutable`, and
everything else — including `/data` — to `no-cache`. Unknown mounts default to
revalidating, so a future mount added without thinking about caching is merely
slower, never wrong.

`no-cache` means "revalidate before use", not "don't cache", so an unchanged
file still costs only a 304. It is nearly free here because the client
re-downloads the 4.5 MB database *only* when `cards.meta.json` reports a new
version.

**2. The database is the single source of truth for its own version.** The
separate stamp file is gone. `dbWorker.ts` reads
`SELECT value FROM meta WHERE key IN ('schema_version','data_version')` from
whatever database it actually has, so the version and the bytes it describes
can no longer disagree — the poisoned state is now unrepresentable rather than
merely unlikely.

**3. Verify the download before trusting it.** After importing, the worker
re-reads the stored database's own version and refuses it if it does not match
what the server advertised, instead of persisting an unverified claim. The
fetch also passes `{cache:'reload'}`, so no intermediary can substitute stale
bytes regardless of what any header says.

**4. Fail loudly, degrade honestly.** A non-ok `cards.meta.json` response used
to fall through silently and serve stale cards with no trace; it now warns. The
offline path is unchanged: no server metadata plus a local database still means
"use the local database", because it is the user's only card data.

Existing poisoned clients **heal themselves on the next load**: their database
reports 9.12, the server says 9.13, so they re-download. No user action, and
specifically no clearing of site data. Verified in a real browser by making the
version difference observable in the data (deleting crypt cards and bumping the
version): the page went from 265 to 180 cards on a plain reload, and back again
on a downgrade.

## Alternatives considered

- **A version-bearing DB URL (`/data/cards-9.13.sqlite`) kept `immutable`.**
  Structurally appealing and it is what `docs/data.md` always claimed. Rejected
  as unnecessary here: the client already re-downloads only on version change,
  so `immutable` on the DB buys almost nothing, while a versioned path means
  touching the data pipeline, the `Dockerfile`, the prerender step and CI. With
  decision (2), correctness no longer depends on the header being right at all,
  which was the real reason to want the versioned URL. Worth revisiting only if
  repeat-visit revalidation ever shows up in measurements.
- **Keeping the stamp file but validating it.** Strictly worse than deleting it:
  the same fact stored twice can always drift, and there is no reason to store
  it twice when the database already answers.
- **Cache-busting query strings (`?v=9.13`).** Solves the header symptom but
  leaves the stamp/bytes mismatch — the actual bug — in place.

## Consequences

- `/data` now costs one conditional request per load (~300 bytes for
  `cards.meta.json`). The 4.5 MB database is still fetched only on a version
  change.
- `schrecknet-cards-version` is no longer written. Existing copies are harmless
  orphans and are ignored; they are left in place rather than adding cleanup
  code for a few bytes.
- The service worker's `CACHE_NAME` went to `schrecknet-shell-v4`. The SW never
  touched `/data`, but its stale-while-revalidate shell cache would otherwise
  hand one more load the old bundle — i.e. the very worker being fixed. This was
  observed during verification: the first reload after the fix still ran the old
  `dbWorker` chunk.
- `db.ts::getCardsMeta()` also revalidates now. It feeds the header card counts,
  which were silently stale for the same reason.
- This does not make local data durable — it only stops us from ever *asking*
  users to destroy it. Real backup/restore is ADR 0016.
