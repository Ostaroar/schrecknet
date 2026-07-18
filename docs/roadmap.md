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
- Crypt + Library search with **all** filters; results list + card detail page
- Quick-search command palette (⌘K); card images; rulings; sets/printings
- PWA install + offline; i18n scaffolding for card translations
- MCP: `search_crypt`, `search_library`, `get_card` + REST mirrors

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
