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

Legend: ☐ todo · 🌓 partial · ☑ done · ✎ verify exact behavior against vdb.im during implementation

## Navigation / Shell
- 🌓 Top navigation: Account/Login, About, Inventory, Decks, Crypt, Library —
      About/Decks/Crypt/Library/Inventory live; Account is Phase 3 (needs
      server auth first)
- ☑ Quick card search by name — ⌘K/Ctrl+K command palette, prefix-ranked,
      across both kinds, keyboard-driven (↑↓/Enter/Esc), jumps to the card page
- ☑ Language switcher for card texts — persisted global choice, applied to
      full card pages and inline details with per-card English fallback; options
      are derived from the V5 data at build time (currently EN/ES/FR, with
      PT-BR appearing automatically when the source provides it) ✎
- ☑ Interface localization — navigation, shell, Help/About/Changelog, both
      Crypt/Library search surfaces (controls, results, active-deck sidebar),
      the deck editor, deck review, inventory, precons, the limited-format
      editor, deck diff, shared-deck preview, the proxy sheet, the command
      palette, the full rules reference (turn stepper, drill-downs, impulse-
      order widget, deck-aware timing windows), the card detail page, and
      shared badges/tooltips are all translated in EN/ES/FR/**DE** via one
      typed catalog (`tsc` fails the build if any language is missing a key);
      a flag-button switcher (🇬🇧🇪🇸🇫🇷🇩🇪) sits next to the header's card-count/
      "V5 only" badge. German is UI-only — the card database has no German
      card-text translations, so card pages fall back to English per card
      (existing graceful fallback, unaffected); the language switcher itself
      no longer resets to English when a UI language lacks card-data
      coverage. Browser smoke coverage switches languages on both search
      routes. Deliberately English-only by design: `LegalPage.tsx` (binding
      German legal text) and gameloop.json-sourced rules content (state/
      branch/transition labels are data, not UI chrome).
- ☑ Responsive mobile layout — measured at 320px and 360px across Crypt,
      Library, Decks (including a populated editor), Inventory, Precons,
      Rules, Changelog, Help, About, and Card Detail; CI rejects viewport overflow and
      coarse-pointer controls below 40px
- ☑ Installable PWA (manifest + offline app shell via hand-written service
      worker; offline card search itself is handled separately by the
      OPFS-backed dbWorker.ts)
- ☑ Changelog page — offline `#/changelog` timeline with curated product
      milestones, localized in EN/ES/FR and included in responsive browser
      coverage
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
- ☑ Discipline filter: independent per-discipline three-state toggles
      (off → required any level → superior only), ordinary requirements ANDed;
      VDB-style "+OR DIS" rows support two independently leveled alternatives,
      OR within each row and AND between rows. Verified against VDB's
      `cardFilters.js` behavior and a real-V5 browser/REST golden fixture ✎
- ☑ Capacity filter: min/max range (inclusive) — live on all three surfaces
- ☑ Group filter: multi-select with OR semantics, options derived from the V5
      pool (currently groups 5–7); legacy single-group API remains compatible
- ☑ Clan / Path filter — MVP live, options derived from the V5 pool (14 clans)
- ☑ Sect filter — official VEKN metadata, pool-derived options, and VDB-compatible
      All/Any/Not multi-selection on browser, REST, MCP, and semantic filtering ✎
- ☑ Votes filter — VDB-compatible None / 1+ / 2+ / 3+ / 4+ thresholds derived
      from official titles in shared Rust, on all search surfaces ✎
- ☑ Title filter — exact pool-derived title plus synthetic Non-titled option on
      all three surfaces. The generic 1-vote/2-vote titles remain supported by
      normalization/listing if they enter V5; current V5 titles are Archbishop,
      Baron, Bishop, Cardinal, Justicar, Primogen, Prince, and Priscus ✎
- ☑ Traits: +1 intercept, +1 stealth, +1 bleed, +2 bleed, +1 strength, +2 strength,
      Maneuver, Additional Strike, Aggravated, Prevent, Press, Enter combat, Unlock,
      Black Hand, Seraph, Infernal, Red List, Flight, Hand Size, Advancement, Banned.
      VDB's exact text regexes and structured Advancement/Banned cases run once
      in shared native Rust during ingestion; selections are ANDed on browser,
      REST, MCP, and semantic search. Options with no V5 matches are omitted
      (11 currently render); real-VEKN per-trait counts and compositions are
      golden-tested ✎
- ☑ Set filter: single selected set plus independent release-age modes
      (In Set / Or Newer / Or Older / Not Newer / Not Older) and printing
      modes (Any / Only In / First Print / Reprint), on browser, REST, and
      MCP (`set`, `set_age`, `set_print`). Semantics verified against vdb's
      current `SearchFormSet` + `cardFilters`; chronology intentionally uses
      only the V5 print history stored by SchreckNet
- ☑ Precon filter: VDB-compatible exact `set:precon` identities, repeatable
      OR selection, and Any / Only In / First Print / Reprint modes on browser,
      REST, MCP, and semantic candidate filtering. Options are V5-pool-derived;
      legacy substring `precon` remains API-compatible and NULL never matches ✎
- ☑ Artist filter — substring match against credited artist name, any-artist
      semantics (`artist` param on all three surfaces)
- ☑ Results: VDB sort modes on browser, REST, and MCP (capacity/clan/group/name/
      sect for crypt; requirement/cost/name/type for library), card-image preview
      on hover or tap, and inline add-to-deck with remembered active local deck,
      quantity feedback, and a responsive "Show Deck" split panel. Every sort
      mode and image URL is locked to real-V5 browser/REST fixtures ✎

## Library Card Search (`/library`)
- ☑ Name / text search — MVP live (frontend/src/components/LibrarySearch.tsx);
      ☑ "Only in Name" / "Only in Text" mode toggle on browser, REST, and MCP;
      ☑ Regex mode (`text_regex`, same engine split as crypt — see ADR 0005)
- ☑ Type filter — MVP live, options derived from the V5 pool at query time
      (9 types present: Action, Action Modifier, Ally, Combat, Equipment,
      Master, Political Action, Reaction, Retainer — Event/Power/Conviction
      not yet in the V5 pool ✎ recheck as new sets ship); exact-token matching
      verified (querying "Master" does not spuriously match "Action Modifier")
- ☑ Discipline filter (incl. multi-discipline): VDB's actual level-neutral
      library requirement model with All / Any / Not / Only set logic and a
      "No requirement" option. The earlier three-state superior UI was removed:
      VDB does not apply crypt discipline levels to library requirements, and
      KRCG's V5 library rows confirm that no such level data exists ✎
- ☑ Clan / Path requirement filter — MVP live
- ☑ Sect requirement filter — official VEKN tokens plus VDB-compatible implied
      title sects; pool-derived selections, All/Any/Not logic, and Not Required
      on browser, REST, MCP, and semantic filtering ✎
- ☑ Title requirement filter — exact V5 title tokens plus VDB's synthetic
      `titled_specific` selection (any specific title), with All/Any/Not logic
      on browser, REST, MCP, and semantic filtering ✎
- ☑ Blood cost / Pool cost filters (`<=`, `>=`, `=`) — live independently for
      both costs on browser, REST, and MCP; cards with no numeric cost and
      variable `X` costs never match a numeric cost filter
- ☑ Capacity requirement filter — `capacity_requirement` plus ≤/≥ mode on
      browser, REST, MCP, and semantic candidate filtering. Shared Rust
      ingestion matches vdb's four same-line forms (`less than N`, `N or less`,
      `N or more`, `above N`) and stores inclusive min/max bounds; a real-V5
      golden rejects cross-line false positives ✎
- ☑ Traits: +Intercept/-Stealth, +Stealth/-Intercept, +Bleed, +Votes/Title, +Strength,
      Block Denial, Dodge, Maneuver, Additional Strike, Aggravated, Prevent, Press,
      Combat Ends, Multi-Type, Multi-Discipline, Enter Combat, Create Vampire,
      Blood to Uncontrolled, Bounce Bleed, Reduce Bleed, Wake/Unlock, Black Hand,
      Seraph, Infernal, Burn Option, Banned, No Requirement. Same shared build-time
      classifier and all-selected AND behavior as crypt; Multi-Type,
      Multi-Discipline, Burn Option, Banned, and No Requirement use VDB's structured
      fields rather than text guesses. The official VEKN library CSV supplies Burn
      Option/Banned (23 traits currently render; Sight Beyond Sight is the current
      V5 Burn Option card) ✎
- ☑ Set / Precon / Artist filters (same as crypt): full set age/printing
      modes plus precon and artist matching on all three surfaces
- ☑ Results use the same responsive image-preview, active-deck, and machine-
      mirrored sorting workflow documented under Crypt Card Search

## Card Detail (`/cards/:id`)
- ☑ Full card text — inline expand panel on search results AND a routed page
      (frontend/src/components/CardPage.tsx) with selectable translations
- ☑ Card image — MVP: single primary KRCG scan (`image_url`, hotlinked per Dark
      Pack rule) on the card page; ☑ legacy/alternate printings with set-specific
      scans (`printings.scan_url`, schema v10): one scan per (card, set) pair, not
      per precon variant within a set — a precon reprint sharing a named set with
      its base release shares that set's single scan entry, confirmed against live
      KRCG data. The card page's printings list shows a preview affordance
      (reusing `CardImagePreview`) on every printing that has one.
- ☑ Icon inline rendering within card text — every bracket token present in
      the current V5 pool renders on both the full page and inline detail panel:
      all 18 disciplines present in the V5 pool at basic/superior level plus
      all 10 library card-type glyphs, colorized through the SchreckNet design
      tokens and precached offline.
      English, Spanish, and French use the same safe parser; unknown future
      tokens remain verbatim rather than losing rules text. Clan/cost bracket
      tokens do not occur in the current V5 export. The same accessible local
      glyphs also accompany structured discipline filters/results, library types,
      card headers, inventory rows, precon lists, and deck statistics. Clan and
      path assets use the same contrast-safe mask renderer; sects stay text because
      no official KRCG sect icon set exists. The pool-derived token inventory is
      locked by a parser contract and representative browser fixtures ✎
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
- 🌓 Format legality checks: custom limited formats within the V5 pool ✎ —
      ☑ limited format editor (`#/limited`): allowed sets + per-card allow/ban
      overrides, ported from vdb's `LimitedStore.js` (banned wins over allowed,
      allowed wins over set membership — verified by reading the source
      directly), local-only (`localStorage`, single active format, matching
      vdb's one-format-at-a-time model), JSON import/export, a deck-editor
      legality line alongside V5 legality, and an "Out of format" badge +
      "Only in format" toggle in crypt/library search (mirrors the inventory
      "owned" badge/filter, composes with every other search filter). ☐ still
      open: 2-Players variant within V5 ✎ (keep only if the V5 pool supports
      it) — separate, unstarted. V5 base-format legality is live.
- ☑ Deck tags: user (free-text) tags — live (frontend/src/lib/deckStore.ts,
      frontend/src/components/DeckEditor.tsx, DeckList.tsx). ☑ Auto-derived
      archetype tags — `lib/archetypeTags.ts` heuristically names Stealth
      Bleed, Big Stick Melee, Vote Kingdom, Fast Master, Swarm, and Star
      Vampire from a deck's own library-type distribution, `card_traits`, and
      crypt shape, each with a flavor blurb and a one-click "+ tag" into the
      existing free-text tag system (no new tagging mechanism)
- ☐ Branches / revisions of a deck ✎ (vdb supports deck branches)
- ☑ Clone / copy deck — live, from both the deck list and the editor
- ☑ Import: paste text, Lackey-style `"<qty>x <name>"` **and** JOL's actual
      `"<qty> x <name>"` variant (space before `x` is optional independently
      of `x` itself — verified against smeea/vdb#40 and its fix, commit
      fe3feb8, whose parser regex `^\s*([0-9]+) ?x?\s*(.*)` this mirrors) —
      live (core/src/dtext.rs parses; frontend resolves names against
      cards.sqlite, reports unmatched names rather than dropping them
      silently); local `.txt` file loading is also live; ☐ still missing:
      Amaranth link import
- ☑ Export: plain text (Lackey-style) with section headers, file download, and
      clipboard copy — live; ☐ still missing: XLSX
- ☑ Proxy printing — live at `#/decks/{id}/proxy`: every card in a deck
      (one image per copy, actual quantities) laid out at physical card size
      (2.5"×3.5", 9 per US Letter page). No PDF library dependency — uses
      the browser's native Print/Save-as-PDF via `window.print()` with
      print-scoped CSS (`.proxy-grid`/`@media print` in index.css) that
      hides the app chrome and shows only the sheet
- ☑ Draw simulator / test hand — live: crypt draw 4 / library draw 7,
      redrawable, respects each card's quantity in the deck; seeded draw logic
      lives in shared Rust and is available offline through WASM plus MCP/REST
- ☑ Deck diff: compare two saved local decks card-by-card (`#/diff`), including
      additions, removals, quantity changes, and unchanged cards; comparison
      logic runs in the shared Rust core. Revision comparison follows when
      branches/revisions are implemented.
- ☑ Deck review page (`#/decks/{id}/review`) — local/offline walkthrough of
      deck size, capacity range/average, V5 legality, library composition,
      discipline footprint, and blood/pool cost curves; all aggregates reuse
      the existing Rust/WASM statistics pipeline
- ☑ Share deck via URL (deck-in-URL encoding for anonymous users) — live:
      `core/src/share.rs`, `#/share/<token>` preview + import page
- ☑ Missing cards vs. inventory ("what do I need to buy") — deck editor's
      expandable missing-cards list + inventory page's collection-wide,
      exportable want-list (see [inventory-plan.md](inventory-plan.md) I4)
- ☑ Precon decks browser — live at `#/precons`, all 43 official modern BCP/V5
      precons grouped by set (list_precons: MCP + REST + browser), including
      First Blood, 2019 Sabbat, 25th Anniversary, and 30th Anniversary. Real per-card copy
      counts within one physical copy of each precon are also tracked
      (`precon_card_counts`/`get_precon_card_counts`: MCP + REST + browser),
      sourced from KRCG's own per-printing `copies` field (schema v7,
      2026-07-23) — some V5 precon crypts do ship a vampire twice
- ☑ Physical precon ownership overview — product quantities are stored
      separately from loose card inventory and shown as a total plus per-precon
      badges, avoiding false ownership inferred from overlapping cards
- ☐ Works logged-out (localStorage decks) and logged-in (server-synced) ✎

## Inventory (`/inventory`)
_Design & milestone plan: [docs/inventory-plan.md](inventory-plan.md) — local-first
(no account needed), synced later in Phase 3. All five planned local milestones
(I1–I5) are complete._
- ☑ Add crypt/library cards with quantities — `#/inventory`, add-by-name, qty
      steppers, remove, precon bulk add/remove with a "how many precons do you
      own" quantity field, applying each card's real per-precon copy count
      (not a flat amount — see the precon browser entry above)
- ☑ Import/export inventory (text/file) — Lackey/JOL-style `<qty>x <name>`
      (both spacing variants, verified against smeea/vdb#40 — see the deck
      import entry above), unresolved names reported rather than dropped,
      matches deck import/export
- ☑ Usage view: how many copies used across decks, missing counts — deck
      editor shows per-card Fixed/Flexible badges + an expandable missing-cards
      list; inventory page shows the collection-wide want-list (exportable)
- ☑ Filters mirroring card search — "Owned" badge + "only owned" toggle in
      crypt/library search, composes with every existing filter (regex,
      semantic, etc.)
- ☑ Deck ↔ inventory cross-highlighting ✎ — per-deck inventory mode
      (excluded/fixed/flexible) + per-card override, verified against vdb's
      own hard/soft claiming algorithm (see inventory-plan.md § 1a)

## Accounts (`/account`)
- ☐ Register: username, password, optional email (for password reset only)
- ☐ Login / logout, forgot-password flow (email reset)
- ☐ Change password / email; delete account ✎

## SchreckNet additions beyond VDB parity
- ☑ Offline semantic card search — additive local concept retrieval, never a
      tournament-data recommendation engine: pinned English ONNX model, vectors in
      `cards.sqlite`, shared Rust cosine ranking, lazy browser download with offline
      reuse, and identical browser/MCP/REST capability. Five reviewed crypt/library
      concepts enforce browser/native top-10 membership, material-order parity, and
      score tolerance in CI; the smoke test also kills the server before reloading and
      querying again. See ADR 0006; exact and regex search remain available without
      loading the model
- ☑ Game groups: private, code-gated playgroup game log + leaderboard — owner-requested
      (2026-07-23), explicitly scoped as private/non-public so it stays clear of the
      tournament/community-data exclusion (same tier as the seating randomizer). Core
      (create/join a group, log games, leaderboard) shipped 2026-07-23; localization,
      seating chain, edit/delete, and archetype tie-in remain optional follow-ups. See
      [docs/game-groups-plan.md](game-groups-plan.md); tracked in roadmap.md Phase 6
- ☑ SEO / GEO / AEO — owner-requested (2026-07-23), ahead of shipping on a
      DigitalOcean Kubernetes Basic node pool. Not a vdb-parity item (vdb.im has no
      notable SEO surface either) — tracked here because it's a real SchreckNet
      capability: real path-based URLs, build-time-prerendered card pages, structured
      data, `robots.txt`/`sitemap.xml`, and a GEO/AEO crawler allow-list. No new
      runtime dependency; S1–S6 all shipped (roadmap.md Phase 7); a full Lighthouse
      run against the live domain remains a Phase 4 follow-up. See
      [docs/seo-geo-aeo-plan.md](seo-geo-aeo-plan.md)

## Non-functional parity
- ☑ Card data pipeline from VEKN official card list / KRCG static files, with
      update script (original updates via `misc/` scripts) — `schrecknet-data build`
      fetches KRCG's `vtes.json`, filters to the V5 pool (`data/src/v5pool.rs`),
      joins VEKN's official crypt metadata, library Burn Option/Banned flags, and
      normalized requirements, then populates cards/disciplines/requirements/
      traits/printings/artists/rulings/translations/FTS.
      ✎ still missing: full canonical-text cross-check against VEKN, incremental/
      diff updates
- ☐ Card images served efficiently (original: pre-generated per-language images)
- 🌓 Keyboard-first UX on desktop, touch-first on mobile — command palette and
      search keyboard flows are live; mobile layout, coarse-pointer form
      controls, and icon-button targets are CI-verified at 320/360px. ☑ Keyboard
      map (docs/design.md § Keyboard map, audited against actual `onKeyDown`
      usage, not assumed) and ☑ WCAG audit (docs/roadmap.md Phase 4, 2026-07-24)
      are both done; no `/`-to-focus-search binding exists yet if that's ever
      wanted
- ☑ Dark Pack legal notice on every page footer ✎ — required elements per the
      [Dark Pack Agreement](https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement):
      logo, copyright/trademark notice, and a "not official World of Darkness
      material" disclaimer, all three now rendering in the site-wide footer
      (and the copyright/disclaimer text also in the About page's credits),
      localized in en/es/fr. There's no license/signup for this agreement —
      per the agreement page itself, placing the logo on the site is what
      binds you to its terms; the free asset pack (including the logo) is
      linked from that same page. `frontend/public/dark-pack-logo.png` is the
      official red-circle mark from that pack, downsized for web (240×240,
      ~45KB) — full pack kept out of the repo (`.gitignore`'d) since it's
      hundreds of MB and only this one asset is needed. Copyright/disclaimer
      wording verified via a fetched summary of the agreement page, not a
      lawyer review — double-check before relying on it for anything beyond
      this hobby project.
