# ADR 0002 — SQLite (WASM + OPFS in browser, rusqlite on server)

**Status:** accepted · 2026-07-18

## Context
vdb keeps card data as JSON bundles in the frontend and user data in server-side
SQLAlchemy. The rebuild wants SQLite "for beginning" and offline-first behavior.

## Decision
- Build-time pipeline produces a read-only `cards.sqlite` (FTS5 + indexed filter
  columns) from KRCG/VEKN data, versioned by content hash.
- Browser uses the official SQLite WASM build with OPFS persistence for both
  `cards.sqlite` and a local `user.sqlite` (anonymous decks/inventory).
- Server uses rusqlite (WAL) for the same card DB plus `app.sqlite` (accounts, sync,
  decks, inventory). One migration set shared browser/server.

## Alternatives considered
- **IndexedDB + JSON in memory** (vdb's approach, modernized): no SQL power, custom
  index code for 25+ filters, higher memory.
- **DuckDB-WASM**: heavier build, analytics-oriented, weaker persistence story.
- **Server-side Postgres now**: operational weight without need; revisit if
  account/sync write load ever demands it (schema avoids SQLite-only features
  where cheap).

## Consequences
- Full card search offline at native speed; one query builder serves UI and MCP.
- OPFS requires the browser floor vdb already sets (Safari ≥ 17.4 etc.).
