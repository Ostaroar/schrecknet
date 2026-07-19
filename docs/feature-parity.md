# Feature Parity Checklist — VDB → SchreckNet

Source of truth for "no missing features". Compiled from a live survey of https://vdb.im
(2026-07-18) and the `smeea/vdb` source tree (`frontend/src/pages/`). Every item must be
checked off (or explicitly descoped with a note) before v1.0.

**Scope note (2026-07-19):** SchreckNet is card search/research + deck building only —
no tournament/community-data features. Explicitly out of scope and removed from this
list: TWD (Tournament Winning Decks) browser, TDA (Tournament Decks Archive), PDA
(Public Deck Archive), the playtest program, Hall of Fame, and any recommendation
engine built on tournament co-occurrence data. Deck import/export still supports
common plaintext deck-list formats (Lackey, JOL, etc.) since that's interop, not a
tournament feature; deck-in-URL sharing (for a deck you built) also stays — publishing
to a public community archive does not.

**V5 scope (2026-07-18):** the site hosts only the V5 format. Read every item below
against the V5 card pool: filter *capabilities* are kept 1:1, but their option lists
(clans, sects, titles, disciplines, groups, sets, precons, artists) are derived from
the V5-legal pool at build time — options with zero matching cards don't render.
Legality = V5 rules (+ custom limited formats within the pool); "standard 60–90"
checks are replaced by V5 deck-construction rules.

Legend: ☐ todo · ☑ done · ✎ verify exact behavior against vdb.im during implementation

## Navigation / Shell
- ☐ Top navigation: Account/Login, About, Inventory, Decks, Crypt, Library
- ☑ Quick card search by name — ⌘K/Ctrl+K command palette, prefix-ranked,
      across both kinds, keyboard-driven (↑↓/Enter/Esc), jumps to the card page
- ☐ Language switcher for card texts (EN/ES/FR/PT-BR) ✎
- ☐ Responsive mobile layout
- ☑ Installable PWA (manifest + offline app shell via hand-written service
      worker; offline card search itself is handled separately by the
      OPFS-backed dbWorker.ts)
- ☐ Changelog page
- ☐ Documentation / Help page
- ☐ About page (credits, Dark Pack notice, related projects, donations/contacts)

## Crypt Card Search (`/crypt`)
- ☑ Name / text search — MVP live (frontend/src/components/CryptSearch.tsx);
      ☑ "Only in Name" / "Only in Text" mode toggle (All/Name/Text segmented
      control; `text_mode` param on all three surfaces); ☐ Regex mode still missing
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
- ☑ Set filter MVP: single-select exact set-name match, any-printing semantics
      (`set` param on all three surfaces); ☐ still missing: Or Newer / Or Older /
      Not Newer / Not Older / Only In / First Print / Reprint modes
- ☑ Precon filter MVP: substring match against printing precon, any-printing
      semantics, NULL precon never matches (`precon` param on all three
      surfaces); ☐ still missing: exact-match / multi-select modes
- ☑ Artist filter — substring match against credited artist name, any-artist
      semantics (`artist` param on all three surfaces)
- ☐ Results: sortable list, card image preview on hover/tap, inline add-to-deck when a
      deck is active ("Show Deck" split view)

## Library Card Search (`/library`)
- ☑ Name / text search — MVP live (frontend/src/components/LibrarySearch.tsx);
      ☐ still missing "Only in Name"/"Only in Text" mode toggle and Regex mode
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
- ☐ Blood cost / Pool cost filters (`<=`, `>=`, `=`) — partial: `<=` (max)
      live for both costs (cards with no cost never match a cost filter);
      `>=` and `=` modes not built yet
- ☐ Capacity requirement filter
- ☐ Traits: +Intercept/-Stealth, +Stealth/-Intercept, +Bleed, +Votes/Title, +Strength,
      Block Denial, Dodge, Maneuver, Additional Strike, Aggravated, Prevent, Press,
      Combat Ends, Multi-Type, Multi-Discipline, Enter Combat, Create Vampire,
      Blood to Uncontrolled, Bounce Bleed, Reduce Bleed, Wake/Unlock, Black Hand,
      Seraph, Infernal, Burn Option, Banned, No Requirement
- ☑ Set / Precon / Artist filters (same as crypt) MVP: same semantics and
      caveats as the crypt filters above (`set`/`precon`/`artist` params on
      all three surfaces)

## Card Detail (`/cards/:id`)
- ☑ Full card text — inline expand panel on search results AND a routed page
      (frontend/src/components/CardPage.tsx) with full translations shown
- ☑ Card image — MVP: single primary KRCG scan (`image_url`, hotlinked per Dark
      Pack rule) on the card page; ☐ legacy/alternate printings with set-specific
      scans still pending ✎
- ☐ Icon inline rendering within card text (disciplines, clans, costs)
- ☑ Sets & printings list (incl. precons) — live
- ☑ Rulings (KRCG rulings database) — text live; ☐ links to source not rendered yet
- ☑ Artist credit(s) — live
- ☑ Card text translations — full translated name + text on the card page
- ☑ Shareable deep link per card — `#/cards/{id}` hash routes (tiny hand-rolled
      router in frontend/src/lib/route.ts; no router dep, per AGENTS.md rule 7)

## Deck Building (`/decks`)
- ☑ Create / rename / delete decks — MVP live, local (anonymous, OPFS-only, no
      account); ☐ author/description fields not yet exposed in the UI
- ☑ Crypt & library sections with quantity steppers — MVP live
      (frontend/src/components/DeckEditor.tsx); grouped-by-type display within
      each section still pending
- ☑ Deck stats: crypt count, library count, V5 legality (group rule + size
      bounds, via the real core/legality.rs compiled to WASM) — live; ☐ still
      missing avg/min/max capacity, type distribution, discipline
      distribution, cost curves
- ☐ Format legality checks: custom limited formats within the V5 pool ✎
      (limited format editor: allowed sets/cards); 2-Players variant within V5 ✎
      (keep only if the V5 pool supports it) — V5 base-format legality is live
- ☐ Deck tags (auto-derived archetype tags + user tags) ✎
- ☐ Branches / revisions of a deck ✎ (vdb supports deck branches)
- ☑ Clone / copy deck — live, from both the deck list and the editor
- ☑ Import: paste text, Lackey-style `"<qty>x <name>"` — live
      (core/src/dtext.rs parses; frontend resolves names against
      cards.sqlite, reports unmatched names rather than dropping them
      silently); ☐ still missing: JOL format specifics, Amaranth link, file
      upload (paste-only for now)
- ☑ Export: plain text (Lackey-style) with section headers, file download —
      live; ☐ still missing: JOL-specific format, XLSX, clipboard copy
- ☐ Proxy printing: select cards/quantities → print-ready PDF sheets ✎
- ☑ Draw simulator / test hand — live: crypt draw 4 / library draw 7,
      redrawable, respects each card's quantity in the deck
- ☐ Deck diff: compare two decks/revisions (`/diff`)
- ☐ Deck review page (`/review`) ✎ — annotated walkthrough of a deck
- ☑ Share deck via URL (deck-in-URL encoding for anonymous users) — live:
      `core/src/share.rs`, `#/share/<token>` preview + import page
- ☐ Missing cards vs. inventory ("what do I need to buy")
- ☐ Precon decks browser (all official preconstructed decks)
- ☐ Table Seating randomizer tool
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

## Non-functional parity
- ☑ Card data pipeline from VEKN official card list / KRCG static files, with
      update script (original updates via `misc/` scripts) — `schrecknet-data build`
      fetches KRCG's `vtes.json`, filters to the V5 pool (`data/src/v5pool.rs`),
      populates cards/disciplines/printings/artists/rulings/translations/FTS.
      ✎ still missing: VEKN official list cross-check, incremental/diff updates
- ☐ Card images served efficiently (original: pre-generated per-language images)
- ☐ Keyboard-first UX on desktop, touch-first on mobile
- ☐ Dark Pack legal notice on every page footer ✎
