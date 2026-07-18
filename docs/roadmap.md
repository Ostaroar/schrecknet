# Roadmap

Phases are vertical slices — each ends with a deployable Docker image and a demo.
Feature-parity items (docs/feature-parity.md) get checked off as they land.

## Phase 0 — Foundations (repo bootstrap)
- Monorepo scaffolding: `core/` (Rust, wasm-pack), `server/` (axum), `frontend/`
  (Vite + React 19 + TS + Tailwind 4), `data/` pipeline skeleton
- CI: lint + test + build; Docker workflow → GHCR; card-data workflow
- `cards.sqlite` v1 built from KRCG/VEKN, **filtered to the V5-legal pool**;
  loads in browser via SQLite WASM + OPFS

## Phase 1 — Card search (offline-first)
- ☑ Real `cards.sqlite`: `schrecknet-data` fetches KRCG's live export, filters to
  the V5 pool (662 cards: 218 crypt / 444 library, groups 5–7), populates cards,
  disciplines (superior/inferior), printings, sets, artists, rulings,
  translations, and an FTS5 index — verified end-to-end with `sqlite3` queries
- ☑ Crypt search MVP, verified live in-browser: text/name search, clan filter,
  group filter, capacity-sorted results, superior/inferior discipline badges —
  server serves `cards.sqlite` at `/data/`, frontend loads it via sql.js
  (docs/adr/0004) and queries it client-side after the initial fetch
- ☑ Library search MVP, verified live in-browser + REST + MCP: text/name search,
  type filter (exact-token, pool-derived options), clan requirement filter,
  discipline + blood/pool cost display
- ☑ Crypt discipline filter (3-state toggle: any/superior, require-ALL via
  dynamic EXISTS clauses — bound params only) + capacity min/max range, on all
  three surfaces; REST accepts `disciplines=dom,for` CSV, MCP takes a JSON array
- ☐ Remaining crypt filters (sect, title, votes, traits, set/precon/artist,
  per-discipline level mixing, OR-groups) + remaining library filters
  (discipline, costs, traits) + routed card detail page
- ☑ ⌘K command palette (name search, prefix-ranked, keyboard-driven) + routed
  card page with shareable `#/cards/{id}` deep links, full translations,
  printings + rulings UI; hash router hand-rolled to avoid a router dep
- ☐ Card images; rulings source links
- ☐ PWA install + true offline (swap sql.js → official SQLite WASM + OPFS per
  docs/adr/0004's follow-up)
- ☐ i18n UI using the `translations` table already populated by the pipeline
- ☑ MCP `search_crypt` + `search_library` tools live (rmcp, Streamable HTTP at
  `/mcp`), verified with a real client handshake (initialize → tools/list →
  tools/call) returning correct V5 data; `/api/v1/crypt/search` and
  `/api/v1/library/search` REST mirrors call the identical
  `server/src/cards_db.rs` service functions (AGENTS.md hard rule #2)
- ☑ `get_card` MCP tool + `/api/v1/cards/{id}` REST mirror + click-to-expand
  detail panel in the browser (crypt/library field gating verified against
  two real bugs found live: `types` leaking onto crypt cards, and library
  cards' clan *requirement* wrongly nulled — both fixed with regression tests)
- ☐ MCP resources (`card://`, `db://cards/meta`); a routed detail page with
  shareable deep links (needs a router — not added yet)
- ✎ Known gap to close before Phase 1 is "done": `sect` is NULL (no reliable
  clan→sect source found yet in KRCG's export — see `data/src/ingest.rs` doc
  comment); `votes`/`banned`/`requirement_*`/`burn_option` also NULL

## Phase 2 — Deck builder
- Local (anonymous) decks in OPFS; full editor with stats, V5 legality, tags
- Import/export all formats; deck-in-URL sharing; clone; diff; draw simulator
- Proxy PDF generation; precon browser; table seating tool
- MCP: deck tools (`create_deck` … `draw_hand`)

## Phase 3 — Accounts & sync
- Register/login/reset (parity) + passkeys; server-synced decks & branches
- Inventory management with deck cross-referencing
- MCP/REST authenticated surface

## Phase 4 — Community data
- TWD browser with all filters + cards history + hall of fame + TWD check
- TDA archive; PDA publish/browse/favorite; recommendation engine
- Playtest program area (role-gated)

## Phase 5 — Polish & v1.0
- Full feature-parity audit vs vdb.im (side-by-side golden tests)
- Performance budget: search < 16ms p95 local; first load < 200KB JS gzipped
  (excl. wasm+db which stream/cache separately)
- Accessibility pass (WCAG AA), keyboard map, docs
