# ADR 0004 — sql.js for Phase 1 browser search (interim, not the final architecture)

**Status:** superseded 2026-07-19 — the follow-up landed: sql.js was replaced
by `@sqlite.org/sqlite-wasm` in a dedicated worker with the **opfs-sahpool**
VFS (`frontend/src/lib/dbWorker.ts`), chosen over the plain OPFS VFS because
sahpool needs no COOP/COEP headers — cross-origin isolation would have
blocked the hotlinked KRCG card scans. The DB persists in OPFS and is
re-downloaded only when `cards.meta.json` reports a new
schema_version.data_version; `db.ts`'s `query()` seam meant zero call-site
changes, as designed below. (That version comparison originally used a separate
OPFS stamp file, which could disagree with the bytes it described and stranded
clients on stale data; the version is now read from the database's own `meta`
table — ADR 0015.)

**Original status:** accepted, superseded-by-follow-up expected · 2026-07-18

## Context
ADR 0002 commits to the official SQLite WASM build with OPFS persistence for
the browser. That build's OPFS path requires a dedicated Worker, COOP/COEP
response headers, and the async "worker promiser" API — real plumbing with
several failure modes (header misconfiguration, worker bundling under Vite,
cross-origin isolation checks) that deserves its own focused pass.

Phase 1's immediate goal is narrower: prove real V5 card data is searchable
client-side, offline, from `cards.sqlite`. That doesn't yet need persistence
(anonymous decks aren't built this phase) — it needs a working query engine
in the browser today.

## Decision
Use `sql.js` (Emscripten-compiled SQLite, in-memory, `fetch`-then-load) for
Phase 1 card search. `frontend/src/lib/db.ts` fetches `/data/cards.sqlite`
once, loads it into `sql.js`, and runs `SELECT`s against it — same schema,
same FTS5 index, same SQL a native `rusqlite` caller would use.

## Consequences
- Card search is fully offline **within a session** (no network after the
  initial DB fetch) but the DB doesn't survive a reload without a re-fetch —
  no OPFS yet.
- No code written against a browser SQLite API needs to change shape when we
  swap engines: `db.ts` exposes a plain `query(sql, params)` function: moving
  to `@sqlite.org/sqlite-wasm` + OPFS later is a swap behind that seam, not a
  rewrite of call sites.
- **Follow-up required before Phase 2 (anonymous local decks need persisted
  `user.sqlite`):** replace `sql.js` with the official WASM build + OPFS per
  ADR 0002, behind the same `db.ts` interface. Track in docs/roadmap.md.
