# Roadmap

Phases are vertical slices — each ends with a deployable Docker image and a demo.
Feature-parity items (docs/feature-parity.md) get checked off as they land.

**Scope:** card search/research + deck building only — no tournament/community-data
phase (TWD/TDA/PDA/playtest program are explicitly out of scope, see
docs/feature-parity.md's scope note).

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
- ☑ Set / precon / artist filters (crypt + library, all three surfaces):
  exact set-name match, precon substring, artist substring — each via
  bound-param EXISTS subqueries over printings/sets/artists; ☐ still missing
  set filter's Or Newer/Or Older/Only In/First Print/Reprint modes
- ☐ Remaining crypt filters (sect, votes, traits, per-discipline level mixing,
  OR-groups) + remaining library filters (capacity requirement, traits,
  per-discipline level mixing) + regex search
- ☑ ⌘K command palette (name search, prefix-ranked, keyboard-driven) + routed
  card page with shareable `#/cards/{id}` deep links, full translations,
  printings + rulings UI; hash router hand-rolled to avoid a router dep
- ☑ Card images and rulings source links
- ☑ Official SQLite WASM + OPFS (opfs-sahpool VFS, worker-hosted) replacing
  sql.js — DB persists across reloads, downloads once per version bump (one
  cards.sqlite fetch vs. a meta.json probe per load, verified via network
  log); searches work offline after first visit. Unblocks Phase 2 local decks
- ☑ PWA install manifest + service worker for the app shell (`frontend/public/
  manifest.webmanifest`, `frontend/src/sw.ts` built as a separate Vite entry
  at a fixed `/sw.js` path, hand-written stale-while-revalidate cache over
  same-origin GET requests, `/api` and `/data` explicitly excluded so it
  doesn't fight the OPFS-backed `dbWorker.ts` for `cards.sqlite`). Verified
  live: built + served with `vite preview`, confirmed the SW registers and
  populates the cache on first load, then killed the preview server and
  reloaded — the app shell (HTML/JS/CSS/wasm) rendered fully offline. Icon is
  a self-contained inline placeholder SVG (`frontend/public/icon.svg`), not a
  real brand asset.
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
- ☑ MCP resources: `card://{id}` template and `db://cards/meta`; routed card
  detail page with shareable deep links is also live
- ✎ Known gap to close before Phase 1 is "done": `sect` is NULL (no reliable
  clan→sect source found yet in KRCG's export — see `data/src/ingest.rs` doc
  comment); `votes`/`banned`/`requirement_*`/`burn_option` also NULL
- 🐛 Fixed (found building the Phase 2 precon browser, data_version bumped to
  3 to force OPFS re-download): `printings`/`sets` were storing a card's
  *entire* print history, including classic-era sets explicitly out of scope
  (`v5pool.rs::V5_SET_NAMES` deliberately excludes "Anarchs"/"Sabbat War" as
  original-era KRCG names) — a V5-legal card with an old pre-V5 printing
  leaked that non-V5 product name into card detail pages and precon
  listings. `ingest.rs::insert_printings` now skips non-V5 sets entirely.
  Also fixed: `search_crypt`/`search_library`'s `set`+`precon` filters used
  two independent EXISTS clauses, so a card with printing A (matching set)
  and a *different* printing B (matching precon) would wrongly match both
  filters together even though no single printing satisfied them jointly —
  now one EXISTS clause requiring both on the same printing row.

## Phase 2 — Deck builder
- ☑ Local (anonymous) decks MVP, verified live in-browser: create/rename/delete,
  add/remove cards with qty steppers via inline search, live stats (crypt/library
  counts, V5 legality) — persisted in a separate writable OPFS database
  (`user.sqlite`, frontend/src/lib/userDbWorker.ts) alongside the read-only
  `cards.sqlite`. Legality is the **actual compiled Rust core** running as WASM
  (`core/src/legality.rs` → `frontend/src/lib/core.ts`), not a JS
  reimplementation — verified the group-rule violation renders the exact
  string the Rust unit tests assert. `core.wasm` build wired into CI and the
  Dockerfile (was a manual-only step through Phase 1).
- ☑ Rich deck statistics through Rust/WASM: weighted capacity min/average/max,
  library type and discipline distributions, and blood/pool cost curves
- ☑ VDB-style deck organization: library grouped by canonical type combination
  and crypt sortable by capacity, clan, group, name, or quantity
- ☑ Editable deck author/description metadata + clipboard text export; local
  user-data schema is now upgraded through the shared `migrations/` SQL set
- ☑ Local `.txt` deck import (browser-only file read; nothing uploaded)
- ☑ Responsive About and Help routes covering V5 scope, offline storage,
  credits/legal context, keyboard search, deck workflows, and MCP/REST access
- ☑ Clone deck (name + card quantities) — live in both the deck list and editor
- ☑ Draw simulator — live (frontend/src/lib/drawHand.ts): draws a crypt hand
  of 4 / library hand of 7 respecting each card's quantity in the deck,
  redrawable. Plain shuffle-and-take, not core/ domain logic (a random draw
  has no legal/illegal outcome to validate) — Math.random is fine here, no
  need for seeded/crypto-grade RNG for a personal test-hand tool
- ☑ User tags — live (frontend/src/lib/deckStore.ts: listTags/addTag/removeTag,
  frontend/src/components/DeckEditor.tsx, DeckList.tsx); ☐ auto-derived
  archetype tags and branches/revisions still not done (larger items, out of
  scope for the user-tags pass)
- ☑ Deck-in-URL sharing — live: `core/src/share.rs` (compiled to WASM, same as
  legality) encodes crypt+library (card_id, qty) pairs into a compact,
  URL-safe base64url token; `#/share/<token>` decodes and previews it, with a
  "Save as new deck" import that never touches the source deck. No server,
  no account — matches vdb's deck-in-URL. Verified round-trip live in the
  browser, including hand-computing a token in Python and confirming the
  compiled Rust core decoded it correctly.
- ☑ Text import/export — live: `core/src/dtext.rs` (compiled to WASM) parses
  and formats plain-text/Lackey-style deck lists (`"<qty>x <name>"` per
  line, headers/comments ignored); name -> card_id resolution is a frontend
  concern (needs `cards.sqlite`), case-insensitive + ASCII-folded, with
  unresolved names reported rather than silently dropped. Export downloads a
  `.txt` file. Verified live: imported a pasted list with a comment, a
  header line, and one deliberately-invalid card name — got back
  "Added 2 cards. Couldn't match: Not A Real Card.", and the exported text
  round-tripped exactly. ☐ still missing: JOL-specific format, XLSX
- ☑ Deck diff — compare any two saved local decks at `#/diff`; shared Rust
  core classifies additions, removals, quantity changes, and unchanged cards
- ☑ Table seating tool — `#/seating`, 4-6 players, random turn order with
  derived predator/prey per seat; plain shuffle, not core/ domain logic
  (same tier as the draw simulator — no legal/illegal outcome to validate)
- ☑ Precon browser — `#/precons`, all 3 surfaces (`list_precons` in
  cards_db.rs), 32 real V5 precons grouped by set (verified live: matches
  the actual V5 product lineup — 7 Fifth Edition clan starters, 4 Anarch/
  Companion, 5×New Blood I-III, 4 Sabbat V5 Paths). Building this surfaced
  and fixed two pre-existing data-correctness bugs (see below); card
  quantities per precon aren't tracked by the source data (✎ noted, not a
  bug) — precon detail shows the deck's card pool, not exact copy counts
- ☑ Proxy printing — `#/decks/{id}/proxy`, one image per physical copy at
  2.5"×3.5" (real card size), 9 per US Letter page via CSS grid. Deliberately
  no PDF-generation library: `window.print()` (browser's native Print/Save-
  as-PDF) plus print-scoped CSS is the entire "PDF" story — no new runtime
  dependency, no ADR needed. Verified live: a 3-copy card correctly renders
  3 identical images, `@media print` rule confirmed present in the built
  stylesheet with the app chrome scoped out via `.proxy-sheet-wrapper`
- ☐ MCP: deck tools (`create_deck` … `draw_hand`) — not needed yet since decks
  are local-only; becomes relevant with Phase 3 server sync

## Phase 3 — Accounts & sync
- Register/login/reset (parity) + passkeys; server-synced decks & branches
- Inventory management with deck cross-referencing
- MCP/REST authenticated surface

## Phase 4 — Polish & v1.0
- Full feature-parity audit vs vdb.im (side-by-side golden tests)
- Performance budget: search < 16ms p95 local; first load < 200KB JS gzipped
  (excl. wasm+db which stream/cache separately)
- Accessibility pass (WCAG AA), keyboard map, docs
