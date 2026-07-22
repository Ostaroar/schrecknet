# Inventory Management — Design & Dev Plan (for agents)

Status: **planned** (2026-07-22). This document is the working spec for the inventory
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

## 2. Data model

New migration `migrations/0003_inventory.sql` (browser `userDbWorker.ts` MIGRATIONS
array **and** `server/src/user_db.rs` MIGRATIONS — the shared-migrations invariant;
bump `PRAGMA user_version` to 3):

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS inventory(
  card_id INTEGER PRIMARY KEY,          -- cards.sqlite id (crypt or library)
  qty INTEGER NOT NULL CHECK(qty > 0)   -- owned copies; delete row instead of qty=0
);

-- Per-deck inventory participation, vdb-style. ✎ verify exact vdb semantics:
-- vdb decks carry an "inventory type": excluded (default) / flexible / fixed.
-- Fixed decks claim their copies exclusively; flexible decks share the pool.
ALTER TABLE decks ADD COLUMN inventory_mode TEXT NOT NULL DEFAULT 'excluded'
  CHECK(inventory_mode IN ('excluded','flexible','fixed'));

PRAGMA user_version = 3;
COMMIT;
```

Notes:
- No `updated_at`/notes columns until a feature needs them (keep the schema minimal;
  a follow-up migration is cheap).
- `card_id` is not FK-constrained (cards live in a different database file); the app
  layer resolves names/details against `cards.sqlite` exactly like `deck_cards` does.
- The server's `app.sqlite` gets the same table for free via shared migrations — it
  simply stays empty until Phase 3 writes to it.

## 3. Domain logic placement (core/ Rust → WASM)

The *storage* is plain CRUD (frontend `inventoryStore.ts`, patterned on
`deckStore.ts`). The *math* is domain logic and goes in `core/src/inventory.rs`,
compiled to WASM like `legality.rs`/`stats.rs`/`diff.rs`:

```
usage(inventory, decks) -> per-card { owned, used_flexible, used_fixed, missing }
```

- `used_fixed` = sum of qty over decks with `inventory_mode='fixed'`.
- `used_flexible` = **max** (not sum) of qty over flexible decks — flexible decks
  share copies. ✎ verify against vdb's `useInventory` logic in `smeea/vdb` before
  freezing this; encode whatever vdb actually does in a Rust unit test with a
  hand-computed fixture.
- `missing` = max(0, used_fixed + used_flexible − owned) per card.
- Deck-level view: for one deck, per-card `owned_free` (after other decks' claims)
  and a deck summary (how many cards/copies missing).

Rationale: Phase 3's server needs the identical computation for synced inventories;
putting it in `core/` now means the server calls the same function later and the
browser/server can never disagree (the project's standing one-rules-engine principle).

## 4. Integration map — how inventory touches every existing feature

Work through these explicitly; each is either part of a milestone below or
consciously deferred with a note.

| Existing feature | Interaction | Milestone |
|---|---|---|
| **Deck editor** (`DeckEditor.tsx`) | Per-card owned/missing badge; deck `inventory_mode` selector; deck summary "N copies missing". The mockup (`docs/mockups/design-r1.html`) already shows "Inventory: 4 cards missing ▾" in the builder — follow it. | I3 |
| **Deck list** (`DeckList.tsx`) | Show each deck's inventory mode + missing count chip. | I3 |
| **Missing-cards view** ("what do I need to buy", feature-parity § Deck) | Per-deck and global: aggregated missing list, exportable as text. Cross-references `usage()`. | I4 |
| **Crypt/Library search** | "Owned" badge on result rows; an "only owned" / "in inventory" filter toggle. Frontend-only filter (post-filter on the result set or JOIN into the local query) — **do not** add an inventory param to server search: the server has no inventory until Phase 3, and both-or-neither forbids a browser-only search param on the shared surface. The browser's SQL runs locally, so a local JOIN against `user.sqlite` is fine — but note the two DBs are separate SQLite files in separate workers: fetch the inventory id-set first and filter in TS, don't try cross-database JOINs. | I5 |
| **Card page** (`CardPage.tsx`) | "You own N" line + quick +/− stepper (same interaction tier as deck steppers). | I2 |
| **Precon browser** | "How much of this precon do I already own" is tempting but precon *quantities* aren't in the data (known limitation, see feature-parity § precons) — show owned/not-owned per card only, no copy math. Defer; note in UI if added. | deferred |
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

### I1 — Schema + store + core math
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

### I2 — Inventory page (`#/inventory`)
- Route + nav tab (+ i18n strings). Table of owned cards: name (localized), type/clan
  chips (reuse `VtesSymbol`), qty stepper, remove; add-by-name using the existing
  inline-search pattern from the deck editor; total counts (crypt/library).
- Text import/export (`<qty>x <name>`, reusing `resolveByName` + dtext-style
  parsing; report unresolved names like deck import does). ✎ vdb import behaviors.
- Card page: "You own N" + stepper.
- **DoD:** add/edit/remove/import/export verified live in the browser; reload
  persistence confirmed; works offline.

### I3 — Deck ↔ inventory cross-referencing
- Deck editor: `inventory_mode` selector (excluded/flexible/fixed — label them
  human-readably, e.g. "not in inventory / shares copies / owns copies" ✎ vdb's
  wording), per-card owned/missing badges driven by `core` usage math, deck summary
  missing count. Deck list chips. Clone resets mode to excluded (tested).
- **DoD:** two decks sharing a card in flexible mode show shared (not doubled)
  usage; a fixed deck claims copies exclusively; verified live with a constructed
  example; qty edits update badges reactively.

### I4 — Missing cards & proxy synergy
- Global "missing" view (on the inventory page): union of all inventory-participating
  decks' missing cards, exportable as a text want-list.
- Per-deck missing list in the editor (expandable, per the mockup).
- Proxy sheet: "only missing copies" toggle.
- **DoD:** want-list export matches a hand-computed fixture; proxy toggle prints
  exactly `missing` copies (live-verified with a 3x-owned-1 example).

### I5 — Search integration
- "Owned" badge in crypt/library result rows; "only owned" toggle. Implementation:
  fetch inventory card-id set from the user-db worker, filter/badge in the component —
  no server search param, no cross-worker SQL.
- **DoD:** toggle composes correctly with existing filters (including regex and
  semantic modes); badge counts match the inventory page; live-verified.

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
