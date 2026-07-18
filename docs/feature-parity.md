# Feature Parity Checklist — VDB → SchreckNet

Source of truth for "no missing features". Compiled from a live survey of https://vdb.im
(2026-07-18) and the `smeea/vdb` source tree (`frontend/src/pages/`). Every item must be
checked off (or explicitly descoped with a note) before v1.0.

**V5 scope (2026-07-18):** the site hosts only the V5 format. Read every item below
against the V5 card pool: filter *capabilities* are kept 1:1, but their option lists
(clans, sects, titles, disciplines, groups, sets, precons, artists) are derived from
the V5-legal pool at build time — options with zero matching cards don't render.
Legality = V5 rules (+ custom limited formats within the pool); "standard 60–90"
checks are replaced by V5 deck-construction rules. TWD/TDA/PDA hold only V5-legal
decks.

Legend: ☐ todo · ☑ done · ✎ verify exact behavior against vdb.im during implementation

## Navigation / Shell
- ☐ Top navigation: Account/Login, About, PDA, TDA, TWD, Inventory, Decks, Crypt, Library
- ☐ Quick card search by name (global, keyboard-accessible — rebuild as ⌘K command palette)
- ☐ Language switcher for card texts (EN/ES/FR/PT-BR) ✎
- ☐ Responsive mobile layout + installable PWA (offline card search)
- ☐ Changelog page
- ☐ Documentation / Help page
- ☐ About page (credits, Dark Pack notice, related projects, donations/contacts)

## Crypt Card Search (`/crypt`)
- ☐ Name / text search, with "Only in Name", "Only in Text", and Regex modes
- ☐ Discipline filter: per-discipline icon toggle, superior/inferior levels, "+OR DIS" groups
- ☐ Capacity filter: `<=`, `>=`, `=` with value range (two slots)
- ☐ Group filter: groups 1–7, multi-select (grouping rules: group X and X±1 legal together)
- ☐ Clan / Path filter
- ☐ Sect filter (Camarilla, Sabbat, Laibon, Independent, Anarch, Imbued)
- ☐ Votes filter (numeric)
- ☐ Title filter: Primogen, Prince, Justicar, Inner Circle, Baron, 1 vote, 2 votes,
      Bishop, Archbishop, Priscus, Cardinal, Regent, Magaji, Non-titled
- ☐ Traits: +1 intercept, +1 stealth, +1 bleed, +2 bleed, +1 strength, +2 strength,
      Maneuver, Additional Strike, Aggravated, Prevent, Press, Enter combat, Unlock,
      Black Hand, Seraph, Infernal, Red List, Flight, Hand Size, Advancement,
      Banned, Not in TWD
- ☐ Set filter: Any / Or Newer / Or Older / Not Newer / Not Older / Only In /
      First Print / Reprint
- ☐ Precon filter (same modes)
- ☐ Artist filter
- ☐ Results: sortable list, card image preview on hover/tap, inline add-to-deck when a
      deck is active ("Show Deck" split view)

## Library Card Search (`/library`)
- ☐ Name / text / regex search (same modes as crypt)
- ☐ Type filter (Master, Action, Action Modifier, Ally, Combat, Equipment, Event,
      Political Action, Power, Reaction, Retainer, Conviction, multi-type combos)
- ☐ Discipline filter (incl. multi-discipline)
- ☐ Clan / Path requirement filter
- ☐ Sect requirement filter
- ☐ Title requirement filter
- ☐ Blood cost / Pool cost filters (`<=`, `>=`, `=`)
- ☐ Capacity requirement filter
- ☐ Traits: +Intercept/-Stealth, +Stealth/-Intercept, +Bleed, +Votes/Title, +Strength,
      Block Denial, Dodge, Maneuver, Additional Strike, Aggravated, Prevent, Press,
      Combat Ends, Multi-Type, Multi-Discipline, Enter Combat, Create Vampire,
      Blood to Uncontrolled, Bounce Bleed, Reduce Bleed, Wake/Unlock, Black Hand,
      Seraph, Infernal, Burn Option, Banned, Not in TWD, No Requirement
- ☐ Set / Precon / Artist filters (same as crypt)

## Card Detail (`/cards/:id`)
- ☐ Card image (incl. legacy/alternate printings) with set-specific scans ✎
- ☐ Full card text with icon inline rendering (disciplines, clans, costs)
- ☐ Sets & printings list (incl. precons)
- ☐ Rulings (KRCG rulings database) with links
- ☐ Artist credit(s)
- ☐ TWD appearances / usage statistics ✎
- ☐ Card text translations ✎
- ☐ Shareable deep link per card

## Deck Building (`/decks`)
- ☐ Create / rename / delete decks; deck name, author, description
- ☐ Crypt & library sections with quantity steppers, grouped by card type
- ☐ Deck stats: crypt count + avg/min/max capacity, group legality, library count,
      type distribution, discipline distribution, cost curves (blood/pool)
- ☐ Format legality checks: V5 (site default — the only base format), plus custom
      limited formats within the V5 pool ✎ (limited format editor: allowed sets/cards);
      2-Players variant within V5 ✎ (keep only if the V5 pool supports it)
- ☐ Deck tags (auto-derived archetype tags + user tags) ✎
- ☐ Branches / revisions of a deck ✎ (vdb supports deck branches)
- ☐ Clone / copy deck
- ☐ Import: paste text, Lackey `.txt`, JOL, TWD format, Amaranth link ✎, file upload
- ☐ Export: text, Lackey, JOL, TWD, XLSX ✎, clipboard, file download
- ☐ Proxy printing: select cards/quantities → print-ready PDF sheets ✎
- ☐ Draw simulator / playtest hand (crypt draw 4, library draw 7, redraws) ✎
- ☐ Deck diff: compare two decks/revisions (`/diff`)
- ☐ Deck review page (`/review`) ✎ — annotated walkthrough of a (TWD) deck
- ☐ Share deck via public URL (deck-in-URL encoding for anonymous users) ✎
- ☐ Publish deck to Public Deck Archive (PDA)
- ☐ Missing cards vs. inventory ("what do I need to buy")
- ☐ Precon decks browser (all official preconstructed decks)
- ☐ Table Seating randomizer tool
- ☐ Recommendation engine (cards frequently played with the current deck) ✎
- ☐ Works logged-out (localStorage decks) and logged-in (server-synced) ✎

## Tournament Winning Decks (`/twd`)
*(V5 scope: the archive ingests only V5-legal decks — filtered by event format tag
where available, else by validating the deck list against the V5 pool ✎)*
- ☐ TWD search: year range, players range, contains crypt card(s) (+ "with star"),
      contains library card(s), library size buckets (60–67/68–75/76–83/84–90),
      clan/path (+ mono-clan), sect, capacity average buckets (1-4/4-6/6-8/8-11),
      library discipline % sliders, library card-type % sliders (custom %),
      tags (Acceleration, Ally, Bleed, Block, Combat, MMPA, Rush, Stealth, Swarm, Vote),
      event name, location (country/city), winner name
- ☐ Random TWD, New TWDs, load-more pagination
- ☐ TWD deck view with full deck list + tournament metadata
- ☐ TWD Cards History (`/twd/cards_history`): when each card first won ✎
- ☐ TWD Check (`/twd/check`): validate a deck list against TWD archive format ✎
- ☐ TWD Hall of Fame — Cards (`/twd/hall_of_fame_cards`) ✎
- ☐ TWD Hall of Fame — Tournaments (`/twd/hall_of_fame_tournaments`) ✎

## Tournament Decks Archive (`/tda`)
- ☐ Browse/search archive of tournament decks (incl. non-winning) ✎

## Public Deck Archive (`/pda`)
- ☐ Browse/search community-published decks; sort by date/popularity ✎
- ☐ Favorite/star decks ✎

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
- ☐ Playtest program area (`/playtest`): admin-granted access, playtest cards,
      report forms ✎ (behind role flag)

## Non-functional parity
- ☐ Card data pipeline from VEKN official card list / KRCG static files, with
      update script (original updates via `misc/` scripts)
- ☐ Card images served efficiently (original: pre-generated per-language images)
- ☐ Keyboard-first UX on desktop, touch-first on mobile
- ☐ Dark Pack legal notice on every page footer ✎
