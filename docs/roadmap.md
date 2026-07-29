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
  the modern BCP/V5 pool (829 cards: 299 crypt / 530 library), populates cards,
  disciplines (superior/inferior), official VEKN crypt/requirement metadata, printings, sets,
  artists, rulings, translations, and an FTS5 index — verified end-to-end with
  `sqlite3` queries
- ☑ Crypt search MVP, verified live in-browser: text/name search, clan filter,
  group filter, capacity-sorted results, superior/inferior discipline badges —
  server serves `cards.sqlite` at `/data/`, frontend loads it via sql.js
  (docs/adr/0004) and queries it client-side after the initial fetch
- ☑ Library search MVP, verified live in-browser + REST + MCP: text/name search,
  type filter (exact-token, pool-derived options), clan requirement filter,
  discipline + blood/pool cost display
- ☑ Readable compact result rows with locally bundled official KRCG symbols:
  all 18 pool disciplines at both levels, all 10 library card types, clans,
  and paths use one contrast-safe renderer across search, card, deck,
  inventory, and precon views. KRCG `path` metadata is preserved in schema v8 and exposed by
  browser search, REST, MCP, and card detail for both crypt and library cards;
  sects remain text because KRCG publishes no corresponding sect symbol set.
- ☑ Crypt discipline filter (3-state toggle: any/superior, require-ALL via
  dynamic EXISTS clauses — bound params only) + capacity min/max range, on all
  three surfaces; REST accepts `disciplines=dom,for` CSV, MCP takes a JSON array
- ☑ Set / precon / artist filters (crypt + library, all three surfaces):
  full vdb-compatible release-age modes (exact/newer/older/not-newer/
  not-older) and printing modes (any/only/first/reprint), evaluated against
  SchreckNet's V5-only print history; precon and artist filters remain bound-
  parameter lookups over printings/sets/artists
- ☑ Regex search mode (`text_regex`, all three surfaces) — first justified new
  dependency (the `regex` crate, server-side only; browser reuses native
  `RegExp`), documented in docs/adr/0005-regex-crate-for-search.md
- ☑ Shared native/WASM result ordering: crypt and library sort modes now use
  `core/src/search_sort.rs` on both server and browser, replacing duplicated
  TypeScript and SQL `ORDER BY` implementations
- ☑ Shared native/WASM exact-search planning: `core/src/search_plan.rs` owns
  every crypt and library filter plus every bound parameter; the server executes
  Rust plans directly and the browser receives the same plans through WASM
  (ADR 0007), removing both duplicated TypeScript/SQL query builders
- ☑ Offline semantic card search (additive, not vdb parity): lazy local
  all-MiniLM-L6-v2 ONNX inference, checksum-pinned build assets, ~1 MB of
  precomputed vectors in `cards.sqlite`, exact cosine ranking in shared Rust,
  explicit Semantic mode on Crypt + Library, and one `semantic_search` MCP
  tool with a `POST /api/v1/cards/semantic` REST mirror. Delivery is split into
  ☑ shared ranking → ☑ embedded corpus → ☑ machine APIs → ☑ offline browser →
  ☑ VTES relevance/parity gates; see docs/adr/0006-offline-semantic-card-search.md
- ☑ Advanced discipline/group composition: crypt group multi-select,
  independently leveled AND requirements, two-alternative VDB `+OR DIS` rows;
  library All/Any/Not/Only discipline-set logic plus No Requirement. Browser,
  REST, MCP, semantic candidate filtering, and real-V5 golden coverage agree
- ☑ Library vampire-capacity requirement filter: shared Rust ingestion derives
  VDB's four same-line `Requires … capacity …` forms into inclusive min/max
  bounds; browser, REST, MCP, semantic filtering, and a real-V5 golden agree
- ☑ Library sect/title requirement filters: official VEKN metadata is joined
  to the V5 pool, shared Rust reproduces VDB's title-implied sects, and
  pool-derived All/Any/Not controls agree across browser, REST, MCP, semantic
  filtering, and a real-V5 golden
- ☑ Crypt sect, vote, and completed title filters: official VEKN crypt metadata,
  pool-derived All/Any/Not sect controls, VDB's None/1+/2+/3+/4+ vote semantics,
  and Non-titled agree across browser, REST, MCP, semantic filtering, and a
  real-V5 golden
- ☑ Crypt + library traits: VDB's regex maps and structured special cases are
  ported to shared native Rust and precomputed into indexed `card_traits` rows;
  pool-derived controls, REST/MCP arrays, semantic candidate filtering, exact
  multi-trait result sets, and all current per-trait counts agree with the
  original source over all 829 modern BCP/V5 cards
- ☑ ⌘K command palette (name search, prefix-ranked, keyboard-driven) + routed
  card page with shareable `#/cards/{id}` deep links, full translations,
  printings + rulings UI; hash router hand-rolled to avoid a router dep
- ☑ Card images and rulings source links
- ☑ Inline VTES symbols in card text: shared native/WASM bracket-token parsing
  and canonical metadata, bundled and offline-precached basic/superior
  discipline and card-type glyphs, translated-text support, and identical
  accessible rendering on full pages plus inline result details
- ☑ VDB search-result workflow: explicit stable sort modes on browser/REST/MCP,
  hotlinked image previews on hover/tap, responsive rows, and a remembered local
  active-deck rail with inline quantity-aware add controls and "Show Deck"
- ☑ VDB precon filter parity: exact set + precon identities, OR-composed
  multi-selection, and Any/Only/First/Reprint history modes across exact search,
  semantic candidate filtering, REST, and MCP; legacy substring API retained
- ☑ Card-text language switcher: build-time pool-derived options from
  `cards.meta.json`, a persisted global preference, and English fallback per
  card (currently EN/ES/FR; future source languages appear automatically)
- ☑ Official SQLite WASM + OPFS (opfs-sahpool VFS, worker-hosted) replacing
  sql.js — DB persists across reloads, downloads once per version bump (one
  cards.sqlite fetch vs. a meta.json probe per load, verified via network
  log); searches work offline after first visit. Unblocks Phase 2 local decks
- ☑ PWA install manifest + service worker for the app shell (`frontend/public/
  manifest.webmanifest`, `frontend/src/sw.ts` built as a separate Vite entry
  at a fixed `/sw.js` path, hand-written network-first navigation cache plus
  stale-while-revalidate content-hashed assets, `/api` and `/data` explicitly
  excluded so it doesn't fight the OPFS-backed `dbWorker.ts` for
  `cards.sqlite`). Verified
  live: built + served with `vite preview`, confirmed the SW registers and
  populates the cache on first load, then killed the preview server and
  reloaded — the app shell (HTML/JS/CSS/wasm) rendered fully offline. Icon is
  a self-contained inline placeholder SVG (`frontend/public/icon.svg`), not a
  real brand asset.
- ☑ Responsive/touch layout: no horizontal page overflow across eleven primary
  routes at 320px/360px, including a populated deck editor; coarse-pointer
  controls and icon buttons have CI-enforced 40px targets
- ☑ Offline changelog route: curated product milestones at `#/changelog`,
  localized in EN/ES/FR and covered by the responsive browser contract
- ☑ UI localization: nav, header, footer, Help/About/Changelog, Crypt + Library
  search (controls, results, active-deck sidebar), deck builder, deck review,
  inventory, precons, limited format, deck diff, shared-deck preview, proxy
  sheet, command palette, the rules reference (turn stepper, drill-downs,
  impulse-order widget, deck-aware timing windows), the card detail page, and
  small shared badges (out-of-format, rulings/printings headings, image
  previews) are all localized in en/es/fr/de through the typed
  `frontend/src/lib/i18n.ts` contract (`tsc` fails the build if any of the
  four languages is missing a key), reusing the existing card-text language
  selector (no new UI control). A browser smoke contract exercises both search
  surfaces in Spanish and French. Deliberately untranslated by design:
  `LegalPage.tsx` (binding German legal text, see its own doc comment) and
  gameloop.json-sourced rules content (state/branch/transition labels — data,
  not chrome). `frontend/src/lib/cardTiming.ts`'s `describeHook` takes a
  translations map from its caller rather than importing i18n.ts directly, to
  stay a frontend-only presentational module.
  Card-text translation selection is complete separately using the pipeline's
  `translations` table
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
- ☑ Official metadata columns are complete for the V5 pool: crypt `sect`,
  `title`, `votes`, `adv`, and `banned`, plus library `burn_option` and `banned`,
  come from VEKN CSV rows with complete id coverage. Legacy scalar
  `requirement_*` columns remain intentionally NULL; capacity and official
  sect/title requirements live in normalized `card_capacity_requirements` and
  `card_requirements` tables
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
  and crypt sortable by capacity, clan, group, name, or quantity; ordering,
  grouping, and quantity totals are shared native/WASM Rust behavior
- ☑ Deck review route: offline readable summary of Rust/WASM-derived legality,
  capacity, type, discipline, and cost distributions at `#/decks/{id}/review`
- ☑ Editable deck author/description metadata + clipboard text export; local
  user-data schema is now upgraded through the shared `migrations/` SQL set
- ☑ Local `.txt` deck import (browser-only file read; nothing uploaded)
- ☑ Responsive About and Help routes covering V5 scope, offline storage,
  credits/legal context, keyboard search, deck workflows, and MCP/REST access
- ☑ Clone deck (name + card quantities) — live in both the deck list and editor
- ☑ Draw simulator — shared `core/src/draw.rs` owns opening-hand sizes,
  quantity expansion, seeded shuffle, and draw order for native + WASM callers.
  The frontend adapter supplies a browser-generated seed and remains fully
  offline; `draw_hand` exposes the same deterministic operation through MCP and
  `POST /api/v1/decks/draw-hand` so a returned seed can reproduce a draw.
- ☑ User tags — live (frontend/src/lib/deckStore.ts: listTags/addTag/removeTag,
  frontend/src/components/DeckEditor.tsx, DeckList.tsx). ☑ Auto-derived
  archetype tags — heuristic scan over library types/card_traits/crypt shape
  (`lib/archetypeTags.ts`) names Stealth Bleed, Big Stick Melee, Vote Kingdom,
  Fast Master, Swarm, Star Vampire with one-click "+ tag" into the same
  free-text tag system; deck editor's new Archetype Scan panel. ☐
  branches/revisions still not done (larger item, tied to Phase 3 sync)
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
- ☑ Precon browser — `#/precons`, all 3 surfaces (`list_precons` in
  cards_db.rs), 43 official modern BCP/V5 precons grouped by set. This includes
  First Blood, the 2019 Sabbat decks, 25th Anniversary's "Reign of Stanislava",
  30th Anniversary's "The Endless Dance", Fifth Edition, New Blood, and Sabbat
  V5. KRCG supplies real per-card quantities; the anniversary products are
  normalized against Black Chantry's official 100-card lists so their separate
  bonus cards are not presented as part of the playable decks.
- ☑ Proxy printing — `#/decks/{id}/proxy`, one image per physical copy at
  2.5"×3.5" (real card size), 9 per US Letter page via CSS grid. Deliberately
  no PDF-generation library: `window.print()` (browser's native Print/Save-
  as-PDF) plus print-scoped CSS is the entire "PDF" story — no new runtime
  dependency, no ADR needed. Verified live: a 3-copy card correctly renders
  3 identical images, `@media print` rule confirmed present in the built
  stylesheet with the app chrome scoped out via `.proxy-sheet-wrapper`
- ☑ Search-to-deck bridge: crypt/library results add directly to a selected
  anonymous OPFS deck, serialize fast quantity changes, remember only the active
  deck id in localStorage, and expose the live deck in a responsive split panel
- ◐ MCP deck tools — `draw_hand` is live without requiring server-side deck
  storage; authenticated create/update/import/export tools remain Phase 3 work

## Phase 3 — Accounts & sync
_Direction confirmed by the project owner (2026-07-23): "Search fast. Build locally.
Keep control." stays the default, account-free experience — everything shipped so
far (search, decks, inventory, limited format, game-groups) keeps working with zero
login. Accounts/cloud sync are purely additive on top, for whoever wants their decks
follow them across devices._
- Register/login/reset (parity) + passkeys; server-synced decks & branches
- **Login via Google/Apple OAuth** (in addition to email/password) — the two
  providers users actually already have on their phone/desktop, avoiding yet another
  password to manage. Needs its own design pass when picked up: OAuth client
  registration/secrets handling, and a real server-side user-account store (today
  `app.sqlite` only holds the code-gated, account-free game-groups tables — this
  would be the first *identity-bound* server data, a meaningfully bigger trust
  boundary than anything shipped so far).
- Inventory **sync** (the inventory feature itself is local-first and pulled
  forward — full design & milestones in [docs/inventory-plan.md](inventory-plan.md);
  Phase 3 only adds server storage + the `get_inventory`/`update_inventory`
  MCP+REST surface)
- MCP/REST authenticated surface

## Phase 2.5 — Local inventory (pulled forward from Phase 3)
_Design decision (2026-07-22): inventory needs no account — like decks it lives in
the browser's `user.sqlite` (OPFS) and works offline; Phase 3 later syncs it
unchanged. Plan, data model, core-math placement, and the full integration map
across deck editor / proxy / search / card pages:
[docs/inventory-plan.md](inventory-plan.md)._
- ☑ I1 schema + `inventoryStore` + `core/src/inventory.rs` usage/missing math.
  ✎ vdb's claiming semantics verified by reading `smeea/vdb` source directly
  (sum for fixed, max for flexible, plus a per-card override granularity this
  session's design missed at first) — see docs/inventory-plan.md § 1a
- ☑ I2 `#/inventory` page: add/edit/remove, text import/export, card-page owned count
- ☑ I3 deck ↔ inventory cross-referencing (per-deck mode, owned/missing badges)
- ☑ I4 missing-cards want-list + "print only missing" proxy toggle
- ☑ I5 search integration (owned badge, only-owned filter — browser-local only)

**Phase 2.5 complete (I1–I5).** Only I6 (Phase 3 server sync) remains, by design.

**Local durability (2026-07-25, ADR 0016).** Deferring all durability to Phase 3
accounts turned out to be too late: local-only data with no backup path meant a
user clearing site data — which we had effectively asked them to do, see ADR 0015 —
lost every deck, their inventory and their owned-precon counts, none of which the
piecemeal text exports covered. `/settings` now offers a full backup (the raw
`user.sqlite` plus every `schrecknet.`-prefixed localStorage key, so it is complete
by construction rather than by enumeration), replace-only restore with a forced
safety export, `navigator.storage.persist()` on first write, and a dismissible
reminder. Account-based sync is still Phase 3 and consumes the same envelope.

- ☑ Physical precon ownership overview: adding/removing a product through
  Inventory records its identity and quantity separately from loose cards;
  `#/precons` shows total and per-product ownership without double-counting
  overlapping loose cards as several physical decks.

## Phase 4 — Polish & v1.0
- Full feature-parity audit vs vdb.im (side-by-side golden tests)
- ◐ Performance budget: search < 16ms p95 local; first load < 200KB JS gzipped
  (excl. wasm+db which stream/cache separately). **First real measurement**
  (2026-07-24, against the live `/crypt` page, real gzip/br transfer sizes via
  `curl -w`): `main.js` 137.5 KB + `dbWorker.js` 68.0 KB + `userDbWorker.js`
  69.3 KB ≈ **275 KB gzipped JS on first load — over the 200 KB budget**.
  `userDbWorker.js` loads eagerly because the crypt page's Active Deck panel
  needs `user.sqlite` (local decks) immediately, not because of dead
  eagerness — `lib/userDb.ts::ensureOpen()` is already lazy-per-call, this is
  the page's real first-paint content, not something to casually defer without
  a UX cost. `wasm`/`cards.sqlite` are correctly excluded per the budget's own
  wording (stream/cache separately, verified immutable-cached since S6).
  Search-latency **now measured** (2026-07-24, server-side processing time via
  `TraceLayer`'s access-log latency against a local build, exact/regex/filtered
  crypt+library queries): found and fixed a real budget miss — filtered
  library search (`discipline_logic=only`) was **~50ms p95**, filtered crypt
  ~28ms, because `card_disciplines`/`printings` had no index on `card_id` and
  `core/src/search_plan.rs`'s correlated subqueries did a full table scan per
  candidate row. Added `card_disciplines_card_idx`/`printings_card_idx`
  (schema v9, docs/data.md) — all six representative queries (exact-name,
  regex, filtered, crypt+library) now sit at **2-9ms p95**, under budget.
  Client-perceived latency (add network/browser overhead) isn't measured, but
  the dominant cost — server processing — now has real headroom.
  **JS-bundle fix (2026-07-29):** the real cause of the 275 KB miss was that
  `App.tsx` eagerly imported every route (crypt/library/decks/settings/rules/
  table/legal/precons/…) into one bundle, so visiting `/crypt` paid for
  `SettingsPage`, `DeckEditor`, `RulesPage`, `TablePage`, and everything else
  it never renders. Converted every route-gated component to `React.lazy()` +
  one `<Suspense>` boundary around the route outlet (chrome — header, nav,
  footer, `CommandPalette`, `KofiButton` — stays eager, it's on every page).
  Vite now emits one content-hashed chunk per route instead of a single
  `main.js`; the service worker's fetch handler is already generic
  (`sw.ts` caches any same-origin static asset via stale-while-revalidate by
  URL, no static manifest), so the new chunks need no SW changes and still
  work offline after first visit. **Live remeasurement** (2026-07-29, same
  `curl -w` methodology against schreck-net.com/crypt, real br transfer
  sizes): `main.js` 107.0 KB + `dbWorker.js` 66.6 KB + `userDbWorker.js`
  67.9 KB + the `/crypt` route's own chunk 4.6 KB ≈ **246 KB gzipped/br JS
  on first load** — down from 275 KB (−29 KB, ~10%) but still over the
  200 KB budget.
  **`dbWorker.js`/`userDbWorker.js` fix (2026-07-29, same day):** the two
  were the dominant remaining cost, and both bundle the exact same
  `@sqlite.org/sqlite-wasm` Emscripten glue in full — each is an
  independent `new Worker(url, {type:'module'})` entry, so a static
  `import sqlite3InitModule from '@sqlite.org/sqlite-wasm'` in the shared
  `lib/sqlite.ts` wrapper got duplicated into *both* worker bundles by
  Rollup rather than shared. Confirmed by diffing the two built files: both
  started with the same minified `sqlite3Worker1Promiser` glue, just
  different local variable names from two independent bundling passes.
  Fixed by making that import dynamic (`await import('@sqlite.org/sqlite-wasm')`)
  and setting `worker: { format: 'es' }` in `vite.config.ts` (the previous
  default, `'iife'`, doesn't support code-split chunks — Rollup errors
  outright if a worker entry dynamically imports something under it).
  `dbWorker.js` 218 KB → 2.7 KB raw, `userDbWorker.js` 222 KB → 6.3 KB raw;
  the glue is now one shared chunk (`index-*.js`, 65.6 KB gzip) both
  workers reference. Confirmed the dedup is real, not just theoretical, via
  the server's own access log against a real production build: the shared
  chunk was fetched **exactly once** even though both workers (and both
  needed it) loaded in the same session. New total ≈ **182 KB — under the
  200 KB budget** for the first time (main.js 108.2 + shared sqlite glue
  65.6 + dbWorker.js 1.3 + userDbWorker.js 2.5 + crypt-route chunk 4.6).
  Verified end-to-end before shipping — this touches the load path for
  *both* SQLite databases, so a break here would break search, decks, and
  inventory outright: `tsc`, all six e2e suites (`test:card-text`,
  `test:deck-organization`, `test:deck-timing`, `test:mobile`,
  `test:backup`, `test:semantic` — including its offline-reload check) all
  pass against a real server + browser, plus a manual check against the
  actual built `dist/` (not dev mode, which doesn't chunk) confirming
  correct rendering and the single shared fetch.
- ◐ Accessibility pass (WCAG AA). **First real audit** (2026-07-24, axe-core
  4.9 against every route with `runOnly: wcag2a/wcag2aa/wcag21a/wcag21aa`):
  found and fixed two real classes of violation — 4 unlabeled `<select>`s
  (crypt clan/title, library clan-requirement, inventory precon-picker; the
  votes/set/precon-add/sort selects already had `aria-label`s, these four
  didn't) and `--color-ink-dim`/`--color-blood-hi` (design tokens used
  pervasively — 50 flagged elements on the crypt page alone) falling short of
  4.5:1 against the surface/raised/blood-badge backgrounds they actually
  render on. Both tokens brightened same-hue to clear 4.5:1 with margin
  (docs/design.md's tokens are the values in frontend/src/index.css). All 12
  routes now audit clean. ☑ Keyboard map documented (docs/design.md §
  Keyboard map, audited against actual `onKeyDown` usage, not assumed); no
  `/`-to-focus-search binding exists yet if that's ever wanted.

## Phase 5 — VTES v5 game-loop / rules reference (additive, beyond vdb parity)
_Independent of Phases 3–4; could be pulled earlier. Additive reference tooling in the
spirit of "card research" — rules-level and card-agnostic, not a play server, so it
stays clear of the tournament/community-data scope exclusion. **Direction set
(2026-07-20):** serve both a human teaching aid and a formal/engine spec from **one
source of truth** (a statechart JSON distilled from the owner's existing game-loop DOT —
preserved, not replaced), with **readability as the primary success criterion**. Full
design, decisions, and visualization options in
[docs/gameloop-visualizer.md](gameloop-visualizer.md)._
- ☑ M1 source/schema: dependency-free Rust distiller converts the canonical DOT
  into a typed, committed `frontend/public/gameloop.json` (18 regions, 136 states,
  195 transitions, 17 hooks, three structured impulse orders). Golden tests lock
  the five turn phases, seven combat steps, impulse orderings, representative
  transitions, and exact DOT→JSON structural equality
- ☑ M2 readable turn-stepper at `#/rules`: five source-derived phase controls,
  authored phase detail, immediate sub-loop entry previews, responsive horizontal
  navigation, and explicit PWA precaching of the statechart JSON
- ☑ M3 interactive drill-downs: breadcrumb-linked action, block, combat, and
  referendum flow views plus a source-driven Basic vs Advanced/Judge switch; Basic
  combat compresses to round → strike → damage → press → repeat while Advanced
  exposes the full seven-step timing and exception graph
- ☑ Impulse / priority interactive widget: a 5-seat table with predator/prey, stepping
  and animating the context-specific pass orders (combat / directed-at-one /
  directed-at-set / undirected), sourced from `gameloop.json`'s `impulseOrders`
- ☑ Card-DB integration (the differentiator): card pages show "when can I play this?"
  from a hand-distilled card-type → hook mapping (frontend-only, `lib/cardTiming.ts`).
  ☑ Deck-aware view (2026-07-29): `getDeckTimingDistribution` aggregates a whole
  deck's library cards into a qty-weighted "Timing windows" panel on
  `#/decks/{id}/review`, reusing the existing `Distribution` component and
  `computeDistribution` WASM aggregation — no new UI pattern. Deduplicates
  per-card so a Combat card with two matching hooks doesn't double-count
  either window past its own quantity. Localized (en/es/fr/de); covered by
  `npm run test:deck-timing` (pure-TS contract, no browser needed).
- ☐ (Optional, own ADR) executable statechart (e.g. XState) as one source of truth for
  the diagram, the trainer's step engine, and rules-consistency tests

## Phase 6 — Game groups: private playgroup tracker + leaderboard (additive, owner-requested) — core shipped 2026-07-23
_Requested directly by the project owner (2026-07-23): their regular friend group wants
to log the games they play together and see a leaderboard. **Explicitly scoped as a
private, code-gated tool — never a public archive or cross-group ranking** — so it
stays clear of the tournament/community-data exclusion; same tier as the seating
randomizer. No accounts needed: a random shareable code identifies a group, same trust
model as a shared document link. Full design, data model, and milestone breakdown in
[docs/game-groups-plan.md](game-groups-plan.md)._
- ☑ G1 schema (`migrations/0004_game_groups.sql`) + `server/src/game_groups.rs`
  (create/get group, log game, list games, leaderboard) + MCP `create_game_group`/
  `get_game_group`/`log_group_game`/`list_group_games`/`get_group_leaderboard` +
  matching REST under `/api/v1/groups` — this is the **first server capability that
  reads/writes `app.sqlite`** (previously migrated at startup only, never queried).
  `cargo test --workspace` green + manual curl round-trip verified.
- ☑ G2 frontend: `lib/gameGroups.ts` REST client, `#/table` route + nav tab,
  create-group/join-by-code forms, leaderboard table. Live-verified in-browser.
- ☑ G3 log-game form (date, notes, per-player name/deck/VP/game-win) + recent-games
  history list. Live-verified: 4-player 2-game fixture, leaderboard matches
  hand-computed numbers exactly; leave/rejoin by code round-trips.
- ☑ G4 complete: localized table page (en/es/fr/de), circular seating with
  predator/prey display, atomic edit/delete over matching REST + MCP operations,
  private archetype-performance summaries reusing `lib/archetypeTags.ts`, and
  complete CSV/text history export. No public or cross-group rankings.
- ☑ G5 optional group write protection: migration 0007 stores only a salted
  Argon2id hash; all REST/MCP mutations enforce the passphrase while the group
  code remains a read-only share capability. Existing groups stay writable.
  Optional read protection remains a separate future access-session milestone.

## Phase 7 — SEO / GEO / AEO (additive, owner-requested)
_Requested directly by the project owner (2026-07-23): the site needs to be findable
through traditional search (SEO) and AI answer engines/crawlers (GEO/AEO — GPTBot,
ClaudeBot, PerplexityBot, Google-Extended, etc.), ahead of shipping on a
**DigitalOcean Kubernetes Basic node pool**. Root problem: the SPA's hash routing
(`#/cards/123`) means every route serves the same generic `index.html` to any
crawler that doesn't execute JS — which is most of the GEO/AEO audience. No new
runtime dependency and no framework migration (no Next.js/Astro/SSR rewrite); the
existing `schrecknet-data` build step and the server's static-file serving already
do the heavy lifting once card pages are prerendered. Full plan, content inventory,
and milestone breakdown in [docs/seo-geo-aeo-plan.md](seo-geo-aeo-plan.md)._
- ☑ S1 per-route `<title>`/description (hand-rolled head-tag hook, no dependency;
  `lib/documentHead.ts` + `lib/seo.ts`, wired into `App.tsx` + `CardPage.tsx`) and
  `robots.txt` (allow-by-default + named GEO/AEO crawler allow-list + disallow
  `/table`/`/share/`). Live-verified in-browser. `sitemap.xml` deliberately deferred
  to S3/S4 — hash-fragment URLs have no crawl value, see plan doc § S1.
- ☑ S2 path-based routing migration (`#/x` → `/x`, History API) — ADR
  `docs/adr/0008-path-based-routing-for-seo.md`. Old `#/x` links redirect via
  `replaceState` instead of 404ing. Live-verified against the real server: deep
  link reload, no-reload in-app navigation, browser back/forward, legacy-hash
  redirect all confirmed working.
- ☑ S3 build-time static prerendering for all 829 card pages (real HTML + title/
  description/OG/Twitter/JSON-LD, new `schrecknet-data prerender` subcommand,
  served by a small new `GET /cards/{id}` handler — corrected from this doc's
  earlier "no new server code" claim). Live-verified locally against the real
  server binary + a real browser; the new Dockerfile `prerender-build` stage
  is confirmed green in CI (`docker.yml` run 29990857841 — full multi-stage
  build succeeded).
- ☑ S4 prerender secondary routes: `/precons`, `/rules`, `/help`, `/about`, and
  `/changelog` return real no-JS HTML. English help/about/changelog copy lives in
  one shared JSON source consumed by React and Rust; rules HTML uses the same
  generated game-loop JSON as the browser. The data build generates an 835-URL
  sitemap (root + five static routes + 829 cards) when `SITE_URL`/`--base-url`
  supplies the real deployment origin; without one it deliberately emits no
  invalid placeholder sitemap.
- ☑ S5 GEO/AEO-specific: `robots.txt` explicit allow-list for named AI crawlers
  (shipped in S1) + `llms.txt` (informal/unproven convention, kept low-effort;
  plain ASCII, verified served correctly).
- ☑ S6: checking the live site directly found two real gaps — no response
  compression at all, and no cache headers on content-hashed assets despite
  ADR 0004 claiming otherwise. Fixed: `CompressionLayer` (gzip/br/deflate,
  whole router) + immutable `Cache-Control` on `/assets`, `/data`,
  `/models/semantic`. Main JS bundle 477 KB → 137 KB. A full Lighthouse run
  against the live domain is still open, tracked as a Phase 4 follow-up.
- **Guardrail carried over from [docs/game-groups-plan.md](game-groups-plan.md):**
  `/table` and `/share/<token>` must stay `noindex` + `robots.txt`-disallowed and
  never appear in the sitemap — indexing either would break their "unguessable
  code = private" trust model
