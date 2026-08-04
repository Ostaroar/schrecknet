# Inventory Management — Design & Dev Plan (for agents)

Status: **shipped** — local milestones I1–I5 are complete (see roadmap.md Phase 2.5).
Only I6, server-side sync, remains and is Phase 3 work gated on accounts.
Originally written 2026-07-22. This document is the working spec for the inventory
(collection) feature: what to build, in which order, and how it touches every existing
feature. Follow it milestone-by-milestone; each milestone is a self-contained vertical
slice with its own DoD. Update this file and `docs/feature-parity.md` as slices land.

Parity target: vdb.im's `/inventory` (see `docs/feature-parity.md` § Inventory).
Items marked ✎ must be verified against https://vdb.im or `smeea/vdb` sources
*during* implementation — do not guess semantics.

---

## 1. Scope & phasing decision

vdb.im's inventory is an account feature (server-stored). SchreckNet's roadmap parks
"inventory management with deck cross-referencing" in Phase 3 (accounts & sync). But
**nothing about the core feature needs an account**: like decks, an inventory is
per-user data that works fully offline in the browser's `user.sqlite` (OPFS).

**Decision: build inventory local-first now (same tier as anonymous decks), and let
Phase 3 sync pick it up together with decks.** This mirrors how vdb works logged-out
vs. logged-in and avoids blocking a Phase-2-quality feature on auth. When Phase 3
lands, inventory syncs through the same mechanism as decks — design nothing
inventory-specific for sync beyond "it's one more user-data table".

Consequence for the **both-or-neither rule** (AGENTS.md hard rule #2): while inventory
is browser-local there is *no server capability* — `get_inventory`/`update_inventory`
listed in `docs/api.md` are Phase 3 tools, exposed via MCP + REST together *when the
server actually stores inventories*. Until then, do not add a server surface. Pure
derived computations (usage/missing math) go in shared Rust `core/` from day one so
the server reuses them unchanged in Phase 3.

## 1a. ✎ Verified against `smeea/vdb` (2026-07-22)

Read directly: `frontend/src/utils/getMissing.js`, `commons.js`'s `getHardTotal`/
`getSoftMax`, `hooks/useDeckMissing.js`, `context/DeckStore.js`'s
`deckToggleInventoryState`/`cardToggleInventoryState`. Confirmed model:

- Each deck has a default claim mode, cycled `'' (excluded) → S (soft) → H (hard) → ''`
  by `deckToggleInventoryState`. Toggling the deck default **clears every per-card
  override** on that deck (`DeckStore.js`'s switch on `field === INVENTORY_TYPE`).
- **Individual cards within a deck can override the deck's default** — a small pin
  (hard) / shuffle (soft) icon per card, toggled independently
  (`cardToggleInventoryState`). This is more granular than originally assumed; the
  data model below carries it as an overrides table.
- Math (`getHardTotal`/`getSoftMax`, `getMissing`): hard/fixed claims **sum** across
  decks (exclusive reservation); soft/flexible claims take the **max** across decks
  (shared pool). `missing = hard_total + soft_max − owned`, and vdb clamps the
  *reported* missing count to the deck's own requested qty (`miss > q ? q : miss`) —
  i.e. a deck never asks you to buy more than it itself needs, even if other decks'
  claims inflate the raw missing number. This clamp is a **presentation-layer**
  concern (per-deck view only); the raw `core::inventory::missing_for_card` value is
  what a global want-list (I4) should use.
- Confirms the originally-planned sum-vs-max split was correct; the per-card override
  granularity was the piece this note updates.

This resolves the ✎ that gated I1. `core/src/inventory.rs` ships with this verified
algorithm and cites this section in its doc comment.

## 2. Data model

Migration `migrations/0003_inventory.sql` (browser `userDbWorker.ts` MIGRATIONS array
**and** `server/src/user_db.rs` MIGRATIONS — the shared-migrations invariant; bumps
`PRAGMA user_version` to 3). **Shipped as of I1:**

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS inventory(
  card_id INTEGER PRIMARY KEY,          -- cards.sqlite id (crypt or library)
  qty INTEGER NOT NULL CHECK(qty > 0)   -- owned copies; delete row instead of qty=0
);

-- Deck-level default claim (verified against vdb, § 1a above).
ALTER TABLE decks ADD COLUMN inventory_mode TEXT NOT NULL DEFAULT 'excluded'
  CHECK(inventory_mode IN ('excluded','fixed','flexible'));

-- Per-card override of the deck default (vdb's pin/shuffle toggle, § 1a).
-- Only rows that differ from the deck default are stored; changing a deck's
-- inventory_mode clears its overrides (inventoryStore.setDeckInventoryMode does this).
CREATE TABLE IF NOT EXISTS deck_card_inventory_overrides(
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('fixed','flexible')),
  PRIMARY KEY (deck_id, card_id)
);

PRAGMA user_version = 3;
COMMIT;
```

Notes:
- No `updated_at`/notes columns until a feature needs them (keep the schema minimal;
  a follow-up migration is cheap).
- `card_id` is not FK-constrained (cards live in a different database file); the app
  layer resolves names/details against `cards.sqlite` exactly like `deck_cards` does.
- The server's `app.sqlite` gets the same tables for free via shared migrations — they
  simply stay empty until Phase 3 writes to them.

## 3. Domain logic placement (core/ Rust → WASM) — shipped as of I1

The *storage* is plain CRUD (`frontend/src/lib/inventoryStore.ts`, patterned on
`deckStore.ts`: `listInventory`, `getInventoryQty`, `setInventoryQty`,
`adjustInventoryQty`, `getDeckInventoryMode`, `setDeckInventoryMode`,
`listDeckCardOverrides`, `setDeckCardOverride`). The *math* is domain logic and lives
in `core/src/inventory.rs`, compiled to WASM (`inventory_missing` in `wasm.rs`,
verified building for `wasm32-unknown-unknown`) like `legality.rs`/`stats.rs`/`diff.rs`:

```rust
pub fn missing_for_card(claims: &[(u16 /* qty */, ClaimMode)], owned: u16) -> u16
```

- Fixed claims sum, flexible claims take the max, combined additively, then
  saturating-subtract `owned`, floored at zero (see § 1a for the citation). 5 Rust
  unit tests cover: flexible-max-not-sum, fixed-sum, fixed+flexible combined, owning
  enough, and no claims.
- Deck-id attribution (which decks use a card, for per-deck UI) is **not** part of
  this function — callers resolve claims per card from `deck_cards` +
  `inventory_mode` + `deck_card_inventory_overrides` and pass in the resulting
  `(qty, mode)` list. Keeps the core function a pure, easily-tested reduction.
- vdb's per-deck presentation clamp (`min(missing, deck's own qty)`) is **not** in
  `core/` — it's a view concern for I3's deck editor, applied on top of the raw
  `missing_for_card` result.

Rationale: Phase 3's server needs the identical computation for synced inventories;
putting it in `core/` now means the server calls the same function later and the
browser/server can never disagree (the project's standing one-rules-engine principle).

## 4. Integration map — how inventory touches every existing feature

Work through these explicitly; each is either part of a milestone below or
consciously deferred with a note.

| Existing feature | Interaction | Milestone |
|---|---|---|
| **Deck editor** (`DeckEditor.tsx`) | Per-card owned/missing badge; deck `inventory_mode` selector; per-card pin (fixed) / shuffle (flexible) override icon, matching vdb's granularity (§ 1a); deck summary "N copies missing" using vdb's per-deck clamp (missing capped at the deck's own qty). The mockup (`docs/mockups/design-r1.html`) already shows "Inventory: 4 cards missing ▾" in the builder — follow it. | I3 |
| **Deck list** (`DeckList.tsx`) | Show each deck's inventory mode + missing count chip. | I3 |
| **Missing-cards view** ("what do I need to buy", feature-parity § Deck) | Per-deck and global: aggregated missing list, exportable as text. Cross-references `usage()`. | I4 |
| **Crypt/Library search** | "Owned" badge on result rows; an "only owned" / "in inventory" filter toggle. Frontend-only filter (post-filter on the result set or JOIN into the local query) — **do not** add an inventory param to server search: the server has no inventory until Phase 3, and both-or-neither forbids a browser-only search param on the shared surface. The browser's SQL runs locally, so a local JOIN against `user.sqlite` is fine — but note the two DBs are separate SQLite files in separate workers: fetch the inventory id-set first and filter in TS, don't try cross-database JOINs. | I5 |
| **Card page** (`CardPage.tsx`) | "You own N" line + quick +/− stepper (same interaction tier as deck steppers). | I2 |
| **Precon browser** | Physical product quantities are stored separately from loose cards and shown as total/per-product ownership. This avoids counting the same overlapping loose cards as multiple precons. | shipped |
| **Proxy printing** (`ProxySheet.tsx`) | High-value synergy: "print only missing copies" toggle — proxy exactly `missing` per card instead of full qty. | I4 |
| **Deck import/export, share URLs** (`dtext.rs`, `share.rs`) | Unchanged. An imported/shared deck defaults to `inventory_mode='excluded'` so it never silently claims copies. Inventory *itself* gets text import/export (I2) reusing the same `<qty>x <name>` line format and name-resolution helper (`resolveByName`) — one parser family, no new format. ✎ check what vdb's inventory import accepts (it has file + text import). | I2 |
| **Deck diff / clone** | Clone copies `inventory_mode`? No — cloned decks default to `excluded` (a clone would double-claim fixed copies). State this in a test. Diff is unaffected. | I3 |
| **Draw simulator, seating, stats** | Unaffected (simulation ≠ ownership). | — |
| **Semantic search** | Unaffected; the "only owned" toggle composes as a post-filter like other filters. | I5 |
| **Command palette** | Optional: show owned count in results. Low priority. | deferred |
| **UI localization** (`lib/i18n.ts`) | New UI strings go through the en/es/fr dictionary from the start — don't add English-only strings to localized chrome. | all |
| **PWA/offline** | Nothing to do: `user.sqlite` is already OPFS-resident and offline. | — |
| **MCP/REST** | Nothing until Phase 3 (see § 1). When Phase 3 arrives: `get_inventory`/`update_inventory` MCP tools + `/api/v1/inventory` REST mirror, both delegating to the same service, plus usage math from `core/`. | Phase 3 |
| **Nav/shell** | New top-level tab `inventory` (route `#/inventory`), placed per vdb's nav order. Update `route.ts`, `App.tsx` TABS, i18n nav strings. | I2 |

## 5. Milestones (vertical slices, in order)

### I1 — Schema + store + core math  ☑ complete
- Migration 0003 (both migration arrays), `frontend/src/lib/inventoryStore.ts`
  (list/get/setQty CRUD following `deckStore.ts` conventions), `core/src/inventory.rs`
  with the usage/missing computation compiled to WASM and exposed via
  `frontend/src/lib/core.ts`.
- Rust unit tests: hand-computed fixture covering fixed-vs-flexible claiming,
  the max-not-sum rule for flexible decks (✎ verified against vdb first), missing
  clamping at 0, and empty-inventory behavior. Browser: verify migration runs on an
  existing user.sqlite without data loss (mirror `migrations_upgrade_legacy_decks_
  without_data_loss`).
- **DoD:** all Rust tests green; live check that an existing deck database migrates
  cleanly and CRUD round-trips through the worker.

Shipped: `migrations/0003_inventory.sql` (`inventory` table, `decks.inventory_mode`,
`deck_card_inventory_overrides`), `core/src/inventory.rs::missing_for_card` (5 unit
tests, all green) + `wasm.rs::inventory_missing` binding + `core.ts::computeMissingQty`
wrapper, `frontend/src/lib/inventoryStore.ts` (list/get/set/adjust qty, deck mode +
per-card override CRUD). `cargo test --workspace` (83 tests) and
`cargo clippy --workspace --all-targets -- -D warnings` both clean; wasm32 target
builds. Live-verified in the browser: `computeMissingQty([2,2],[3,4],3) === 5`
(4 fixed + 4 flexible-max − 3 owned) matching the Rust test fixture exactly, and
`inventoryStore` CRUD (`setInventoryQty`/`listInventory`/`getInventoryQty`) round-trips
through the OPFS worker with no existing-data-loss on migration. § 1a's vdb
verification is folded into the schema (per-card overrides) and the core doc comment.

### I2 — Inventory page (`#/inventory`)  ☑ complete
- Route + nav tab (+ i18n strings). Table of owned cards: name (localized), type/clan
  chips (reuse `VtesSymbol`), qty stepper, remove; add-by-name using the existing
  inline-search pattern from the deck editor; total counts (crypt/library).
- Text import/export (`<qty>x <name>`, reusing `resolveByName` + dtext-style
  parsing; report unresolved names like deck import does). ✎ vdb import behaviors.
- Card page: "You own N" + stepper.
- **DoD:** add/edit/remove/import/export verified live in the browser; reload
  persistence confirmed; works offline.

Shipped: `#/inventory` route (`route.ts`, `App.tsx` nav tab, `i18n.ts` nav string in
en/es/fr — plain-text card names/labels on the page itself stay English-only for now,
matching the honest partial-localization scope noted elsewhere in the roadmap),
`InventoryPage.tsx` (add-by-name, qty stepper, remove, crypt/library totals),
`inventoryStore.getInventoryCardDetails/exportInventoryText/importInventoryText`
(mirrors `deckStore`'s equivalent functions and the shared dtext format —
unresolved names are reported, not dropped), `AddCardBox.tsx` (extracted from
`DeckEditor.tsx`, now shared by both pages), and `InventoryOwnedControl.tsx`
("You own N" + stepper on `CardPage.tsx`, both crypt and library cards).
Live-verified: add/adjust/remove via the inventory page (header counts update
reactively), mixed valid/invalid text import (resolved card added at the right
qty, unresolved name surfaced), export text round-trips, and a card page's owned
count stays in sync with the inventory page for the same card id. Deferred (not
in this slice, no vdb parity gap yet since vdb itself doesn't expose it as a
distinct UI surface either): "only owned" filtering lives with I5, not here.

**Follow-up (2026-07-22): add/remove precon parity**, matching vdb's
`InventoryAddPreconModal.jsx` — `AddPreconPanel` in `InventoryPage.tsx` plus
`inventoryStore.adjustInventoryQtyForCards(cardIds, delta)`, reusing
`lib/precons.ts` and the same `searchCrypt`/`searchLibrary` precon filter
`PreconBrowser.tsx` already uses (no new query path). Explicitly adds/removes
each card's real KRCG `copies` quantity; physical product ownership is tracked
separately so the precon overview remains exact rather than inferred from the
overlapping loose-card pool. The UI states this rather than implying a
ready-to-play count.
Live-verified: adding Fifth Edition — Malkavian (30 cards) took the inventory
from empty to 9 crypt/21 library at qty 1 each; Remove reversed it exactly.

### I3 — Deck ↔ inventory cross-referencing  ☑ complete
- Deck editor: `inventory_mode` selector (excluded/flexible/fixed — label them
  human-readably, e.g. "not in inventory / shares copies / owns copies" ✎ vdb's
  wording), per-card owned/missing badges driven by `core` usage math, deck summary
  missing count. Deck list chips. Clone resets mode to excluded (tested).
- **DoD:** two decks sharing a card in flexible mode show shared (not doubled)
  usage; a fixed deck claims copies exclusively; verified live with a constructed
  example; qty edits update badges reactively.

Shipped: `inventoryStore.getClaimsForCards`/`computeDeckMissing`/`getInventoryQtyMap`
(pooled claims across every non-excluded deck, per-card override winning over the
deck default), `DeckEditor.tsx`'s `InventoryModeSelector` (labels per DEV-PLAN's
suggestion), per-card `InventoryBadge` (Fixed/Flexible pill, click-to-override,
raw missing count) and a deck-summary total clamped to the deck's own qty per
vdb's presentation rule (§ 1a) — the raw per-card number and the clamped deck
total are deliberately shown side by side so the distinction is visible, not
hidden. `DeckList.tsx` mode + missing chips per deck. `createDeck`/`cloneDeck`
never set `inventory_mode` explicitly, so the schema's `DEFAULT 'excluded'`
already gives clone-resets-to-excluded for free — verified rather than assumed.
Live-verified with a constructed two-deck fixture (Deflection: Deck A flexible
qty 3, Deck B fixed qty 2, 0 owned) — deck list showed 3/2 missing respectively
(flexible max 3 + fixed sum 2 = 5, clamped to each deck's own qty); the
per-card override toggle cycled Flexible → Fixed → cleared correctly; a clone
of Deck A came back `inventory_mode: 'excluded'`. tsc --noEmit clean.

### I4 — Missing cards & proxy synergy  ☑ complete
- Global "missing" view (on the inventory page): union of all inventory-participating
  decks' missing cards, exportable as a text want-list.
- Per-deck missing list in the editor (expandable, per the mockup).
- Proxy sheet: "only missing copies" toggle.
- **DoD:** want-list export matches a hand-computed fixture; proxy toggle prints
  exactly `missing` copies (live-verified with a 3x-owned-1 example).

Shipped: `inventoryStore.computeGlobalMissing`/`exportGlobalMissingText` (raw,
unclamped pooled missing per card across every non-excluded deck — a
deliberately different number from any one deck's own clamped report, since
this answers "what do I need to buy overall") surfaced in `InventoryPage.tsx`'s
new `MissingCardsPanel`; `DeckEditor.tsx`'s missing-count summary is now an
expandable disclosure listing each missing card; `ProxySheet.tsx`'s "Only
missing copies" checkbox, backed by a **simple** owned-vs-deck-qty comparison
in `proxySheet.ts` — intentionally NOT the pooled claim math, because most
decks default to `inventory_mode: 'excluded'` where that math reports 0
regardless of ownership, which would make the toggle useless on ordinary
decks. Two different definitions of "missing" now coexist by design; both are
documented at their call sites to keep that legible. Live-verified: a
Deflection fixture (deck qty 3, owned 1, deck mode fixed) showed "2 copies
missing" in both the deck editor's disclosure and the inventory page's
want-list (exported as "2x Deflection"), and the proxy toggle went from
printing 3 copies to exactly 2 — the literal 3-owned-1 DoD example.

### I5 — Search integration  ☑ complete
- "Owned" badge in crypt/library result rows; "only owned" toggle. Implementation:
  fetch inventory card-id set from the user-db worker, filter/badge in the component —
  no server search param, no cross-worker SQL.
- **DoD:** toggle composes correctly with existing filters (including regex and
  semantic modes); badge counts match the inventory page; live-verified.

Shipped: `lib/useInventoryOwnedMap.ts` (loads the owned-quantity map once from
the user-db worker), `components/OwnedBadge.tsx` (shared "Owned N" pill), and
an "Only owned" toggle in both `CryptSearch.tsx`/`LibrarySearch.tsx` that
post-filters `displayResults` — composes with every existing filter for free
since it never touches the shared search plan/params. Live-verified: a
regex search (`^(Deflection|Cats)`) returned 2 matches, then 1 after enabling
"Only owned" (the owned card only); badge counts matched the inventory page
in both crypt and library search.

**This completes all five local-first inventory milestones (I1–I5).** Only
I6 (Phase 3 server sync — `get_inventory`/`update_inventory` MCP+REST once
accounts land) remains, explicitly deferred per § 1's phasing decision.

### I6 — (Phase 3, not now) server sync
- When accounts land: inventory rides the deck-sync mechanism; `get_inventory` /
  `update_inventory` MCP tools + REST mirror appear together, backed by the same
  service and `core/` math. Update `docs/api.md` from "planned" to live then.

## 6. Guardrails

- **No new runtime dependency** is expected for any milestone; if one appears
  necessary, ADR first (AGENTS.md hard rule).
- **Schema changes only via `migrations/*.sql`** appended to both MIGRATIONS arrays;
  never edit an existing shipped migration.
- **✎ items block their milestone** until verified against vdb.im / `smeea/vdb`
  (browser tools or source reading) — especially the flexible/fixed claiming
  semantics, which are the one place a wrong guess silently corrupts every
  downstream number.
- Keep `docs/feature-parity.md` § Inventory and `docs/roadmap.md` updated as each
  slice lands; keep this file's milestone checkboxes current (☑ + a short
  "shipped as…" note, matching `docs/gameloop/DEV-PLAN.md`'s style).
- Every new user-visible string goes through `lib/i18n.ts` (en/es/fr).

## 7. Suggested first commit

I1 alone (migration + store + core math + tests). It's invisible to users, unblocks
everything else, and forces the ✎ verification of vdb's claiming semantics before any
UI exists to bake a wrong assumption into.
