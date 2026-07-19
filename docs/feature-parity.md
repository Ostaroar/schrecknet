# Feature Parity Checklist — VDB → SchreckNet

Source of truth for "no missing features". Compiled from a live survey of https://vdb.im
(2026-07-18) and the `smeea/vdb` source tree (`frontend/src/pages/`). Every item must be
checked off (or explicitly descoped with a note) before v1.0.

**Scope note (2026-07-19):** SchreckNet is card search/research + deck building only —
no tournament/community-data features. Explicitly out of scope and removed from this
list: TWD (Tournament Winning Decks) browser, TDA (Tournament Decks Archive), PDA
(Public Deck Archive), the playtest program, Hall of Fame, table seating utilities,
and any recommendation engine built on tournament co-occurrence data. Deck
import/export still supports common plaintext deck-list formats (Lackey, JOL, etc.)
since that's interop, not a tournament feature; deck-in-URL sharing (for a deck you
built) also stays — publishing to a public community archive does not.

**V5 scope (2026-07-18):** the site hosts only the V5 format. Read every item below
against the V5 card pool: filter *capabilities* are kept 1:1, but their option lists
(clans, sects, titles, disciplines, groups, sets, precons, artists) are derived from
the V5-legal pool at build time — options with zero matching cards don't render.
Legality = V5 rules (+ custom limited formats within the pool); "standard 60–90"
checks are replaced by V5 deck-construction rules.

Legend: ☐ todo · ☑ done · ✎ verify exact behavior against vdb.im during implementation

## Navigation / Shell
- ☐ Top navigation: Account/Login, About, Inventory, Decks, Crypt, Library —
      About/Decks/Crypt/Library live; Account and Inventory follow their features
- ☑ Quick card search by name — ⌘K/Ctrl+K command palette, prefix-ranked,
      across both kinds, keyboard-driven (↑↓/Enter/Esc), jumps to the card page
- ☑ Language switcher for card texts — persisted global choice, applied to
      full card pages and inline details with per-card English fallback; options
      are derived from the V5 data at build time (currently EN/ES/FR, with
      PT-BR appearing automatically when the source provides it) ✎
- ☐ Responsive mobile layout
- ☑ Installable PWA (manifest + offline app shell via hand-written service
      worker; offline card search itself is handled separately by the
      OPFS-backed dbWorker.ts)
- ☐ Changelog page
- ☑ Documentation / Help page — search, decks, offline storage, and API quick start
- ☑ About page — V5 scope, architecture summary, credits, and Dark Pack notice;
      donations/contacts intentionally omitted until the project has official ones

## Crypt Card Search (`/crypt`)
- ☑ Name / text search — MVP live (frontend/src/components/CryptSearch.tsx);
      ☑ "Only in Name" / "Only in Text" mode toggle (All/Name/Text segmented
      control; `text_mode` param on all three surfaces); ☑ Regex mode
      (`text_regex` param, case-insensitive, orthogonal to the mode toggle —
      server via the `regex` crate as a rusqlite scalar function, browser via
      native `RegExp` as a sqlite-wasm scalar function; see ADR 0005)
- ☑ Discipline filter MVP: per-discipline three-state toggle (off → required
      any level → superior only), require-ALL semantics, verified on real data
      (superior mode correctly excludes inferior matches). ☐ still missing:
      per-discipline level mixing (MVP applies "superior" to the whole
      selection), "+OR DIS" groups ✎
- ☑ Capacity filter: min/max range (inclusive) — live on all three surfaces
- ☑ Group filter: single-select MVP live, correctly limited to the V5 pool's
      groups (5–7); ☐ multi-select still needed
- ☑ Clan / Path filter — MVP live, options derived from the V5 pool (14 clans)
- ☐ Sect filter (Camarilla, Sabbat, Laibon, Independent, Anarch, Imbued)
- ☐ Votes filter (numeric)
- ☑ Title filter MVP: single-select exact match, options derived from the V5
      pool at query time (`title` param on all three surfaces); ☐ still missing:
      vote-count buckets (1 vote / 2 votes) and Non-titled option
      (vdb list: Primogen, Prince, Justicar, Inner Circle, Baron, 1 vote, 2 votes,
      Bishop, Archbishop, Priscus, Cardinal, Regent, Magaji, Non-titled; V5 pool titles seen so far: Primogen, Prince,
      Justicar, Bishop, Archbishop, Priscus, Cardinal — Baron/Inner Circle/Regent/
      Magaji not yet in the V5 pool ✎ recheck as new sets ship)
- ☐ Traits: +1 intercept, +1 stealth, +1 bleed, +2 bleed, +1 strength, +2 strength,
      Maneuver, Additional Strike, Aggravated, Prevent, Press, Enter combat, Unlock,
      Black Hand, Seraph, Infernal, Red List, Flight, Hand Size, Advancement, Banned
- ☑ Set filter: single selected set plus independent release-age modes
      (In Set / Or Newer / Or Older / Not Newer / Not Older) and printing
      modes (Any / Only In / First Print / Reprint), on browser, REST, and
      MCP (`set`, `set_age`, `set_print`). Semantics verified against vdb's
      current `SearchFormSet` + `cardFilters`; chronology intentionally uses
      only the V5 print history stored by SchreckNet
- ☑ Precon filter MVP: substring match against printing precon, any-printing
      semantics, NULL precon never matches (`precon` param on all three
      surfaces); ☐ still missing: exact-match / multi-select modes
- ☑ Artist filter — substring match against credited artist name, any-artist
      semantics (`artist` param on all three surfaces)
- ☐ Results: sortable list, card image preview on hover/tap, inline add-to-deck when a
      deck is active ("Show Deck" split view)

## Library Card Search (`/library`)
- ☑ Name / text search — MVP live (frontend/src/components/LibrarySearch.tsx);
      ☑ "Only in Name" / "Only in Text" mode toggle on browser, REST, and MCP;
      ☑ Regex mode (`text_regex`, same engine split as crypt — see ADR 0005)
- ☑ Type filter — MVP live, options derived from the V5 pool at query time
      (9 types present: Action, Action Modifier, Ally, Combat, Equipment,
      Master, Political Action, Reaction, Retainer — Event/Power/Conviction
      not yet in the V5 pool ✎ recheck as new sets ship); exact-token matching
      verified (querying "Master" does not spuriously match "Action Modifier")
- ☑ Discipline filter (incl. multi-discipline) — MVP live, 3-state toggles
      (off → required any level → superior only), require-ALL semantics;
      ☐ still missing per-discipline level mixing (MVP applies "superior" to
      the whole selection ✎, same as the crypt MVP)
- ☑ Clan / Path requirement filter — MVP live
- ☐ Sect requirement filter
- ☐ Title requirement filter
- ☑ Blood cost / Pool cost filters (`<=`, `>=`, `=`) — live independently for
      both costs on browser, REST, and MCP; cards with no numeric cost and
      variable `X` costs never match a numeric cost filter
- ☐ Capacity requirement filter
- ☐ Traits: +Intercept/-Stealth, +Stealth/-Intercept, +Bleed, +Votes/Title, +Strength,
      Block Denial, Dodge, Maneuver, Additional Strike, Aggravated, Prevent, Press,
      Combat Ends, Multi-Type, Multi-Discipline, Enter Combat, Create Vampire,
      Blood to Uncontrolled, Bounce Bleed, Reduce Bleed, Wake/Unlock, Black Hand,
      Seraph, Infernal, Burn Option, Banned, No Requirement
- ☑ Set / Precon / Artist filters (same as crypt): full set age/printing
      modes plus precon and artist matching on all three surfaces

## Card Detail (`/cards/:id`)
- ☑ Full card text — inline expand panel on search results AND a routed page
      (frontend/src/components/CardPage.tsx) with selectable translations
- ☑ Card image — MVP: single primary KRCG scan (`image_url`, hotlinked per Dark
      Pack rule) on the card page; ☐ legacy/alternate printings with set-specific
      scans still pending ✎
- ☐ Icon inline rendering within card text (disciplines, clans, costs)
- ☑ Sets & printings list (incl. precons) — live
- ☑ Rulings (KRCG rulings database) — text and authoritative source links live
- ☑ Artist credit(s) — live
- ☑ Card text translations — selected translated name + text on the card
      page and inline search details; canonical English remains the fallback
- ☑ Shareable deep link per card — `#/cards/{id}` hash routes (tiny hand-rolled
      router in frontend/src/lib/route.ts; no router dep, per AGENTS.md rule 7)

## Deck Building (`/decks`)
- ☑ Create / rename / delete decks — live, local (anonymous, OPFS-only, no
      account), including editable author and description metadata
- ☑ Crypt & library sections with quantity steppers — live
      (frontend/src/components/DeckEditor.tsx); library cards are grouped by
      canonical type combination and crypt cards can be sorted by capacity,
      clan, group, name, or quantity, matching VDB's useful deck organization
- ☑ Deck stats: crypt/library count, V5 legality, weighted crypt capacity
      min/average/max, library type distribution, discipline distribution,
      and blood/pool cost curves — all aggregation runs in the Rust WASM core
- ☐ Format legality checks: custom limited formats within the V5 pool ✎
      (limited format editor: allowed sets/cards); 2-Players variant within V5 ✎
      (keep only if the V5 pool supports it) — V5 base-format legality is live
- ☑ Deck tags: user (free-text) tags — live (frontend/src/lib/deckStore.ts,
      frontend/src/components/DeckEditor.tsx, DeckList.tsx); ☐ auto-derived
      archetype tags still not done ✎
- ☐ Branches / revisions of a deck ✎ (vdb supports deck branches)
- ☑ Clone / copy deck — live, from both the deck list and the editor
- ☑ Import: paste text, Lackey-style `"<qty>x <name>"` — live
      (core/src/dtext.rs parses; frontend resolves names against
      cards.sqlite, reports unmatched names rather than dropping them
      silently); local `.txt` file loading is also live; ☐ still missing: JOL
      format specifics and Amaranth link import
- ☑ Export: plain text (Lackey-style) with section headers, file download, and
      clipboard copy — live; ☐ still missing: JOL-specific format and XLSX
- ☑ Proxy printing — live at `#/decks/{id}/proxy`: every card in a deck
      (one image per copy, actual quantities) laid out at physical card size
      (2.5"×3.5", 9 per US Letter page). No PDF library dependency — uses
      the browser's native Print/Save-as-PDF via `window.print()` with
      print-scoped CSS (`.proxy-grid`/`@media print` in index.css) that
      hides the app chrome and shows only the sheet
- ☑ Draw simulator / test hand — live: crypt draw 4 / library draw 7,
      redrawable, respects each card's quantity in the deck
- ☑ Deck diff: compare two saved local decks card-by-card (`#/diff`), including
      additions, removals, quantity changes, and unchanged cards; comparison
      logic runs in the shared Rust core. Revision comparison follows when
      branches/revisions are implemented.
- ☐ Deck review page (`/review`) ✎ — annotated walkthrough of a deck
- ☑ Share deck via URL (deck-in-URL encoding for anonymous users) — live:
      `core/src/share.rs`, `#/share/<token>` preview + import page
- ☐ Missing cards vs. inventory ("what do I need to buy")
- ☑ Precon decks browser — live at `#/precons`, all 32 official V5 precons
      grouped by set (list_precons: MCP + REST + browser). ✎ known
      limitation, not a bug: card *quantities* per precon deck aren't
      tracked by the data source (KRCG's export records which printings
      existed, not each deck's exact copy counts), so this shows each
      precon's card pool rather than a ready-to-play decklist
- ☐ Works logged-out (localStorage decks) and logged-in (server-synced) ✎

## Inventory (`/inventory`)
- ☐ Add crypt/library cards with quantities
- ☐ Import/export inventory (text/file) ✎
- ☐ Usage view: how many copies used across decks, missing counts
- ☐ Filters mirroring card search
- ☐ Deck ↔ inventory cross-highlighting ✎

## Accounts (`/account`)
- ☐ Register: username, password, optional email (for password reset only)
- ☐ Login / logout, forgot-password flow (email reset)
- ☐ Change password / email; delete account ✎

## SchreckNet additions beyond VDB parity
- ☐ Offline semantic card search — additive local concept retrieval, never a
      tournament-data recommendation engine: pinned English ONNX model, vectors in
      `cards.sqlite`, shared Rust cosine ranking, lazy browser download with offline
      reuse, and identical browser/MCP/REST capability. Planned in ADR 0006; exact
      and regex search remain available without loading the model

## Non-functional parity
- ☑ Card data pipeline from VEKN official card list / KRCG static files, with
      update script (original updates via `misc/` scripts) — `schrecknet-data build`
      fetches KRCG's `vtes.json`, filters to the V5 pool (`data/src/v5pool.rs`),
      populates cards/disciplines/printings/artists/rulings/translations/FTS.
      ✎ still missing: VEKN official list cross-check, incremental/diff updates
- ☐ Card images served efficiently (original: pre-generated per-language images)
- ☐ Keyboard-first UX on desktop, touch-first on mobile
- ☐ Dark Pack legal notice on every page footer ✎
