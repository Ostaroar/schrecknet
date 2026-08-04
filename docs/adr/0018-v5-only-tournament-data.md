# ADR 0018 — reactivate tournament data, scoped to confirmed-V5 only

**Status:** accepted and implemented · 2026-08-04

## Context

`AGENTS.md` and `docs/feature-parity.md` (2026-07-19) explicitly excluded all
tournament/community-data features (TWD, TDA, PDA, playtest program, Hall of
Fame, seating utilities, co-occurrence recommendations) as out of scope for a
card-search-and-deckbuilding tool. The project owner has since asked to bring
tournament data back — **with a hard constraint**: only *confirmed* V5 data,
for both cards and tournaments. A tournament result that includes even one
non-V5-legal card is not in scope.

This reverses a decision recorded as a hard rule, hence an ADR rather than a
silent edit (AGENTS.md hard rule 7's spirit, applied to a scope decision).

## Decision

- **Reactivate**: a read-only **Tournament Winning Decks (TWD)** browser —
  search/browse tournament-winning decklists, view a deck's full crypt +
  library breakdown, filter by player/card/date.
- **Source**: `api.krcg.org`'s public TWDA (Tournament Winning Deck Archive)
  endpoints (`/twda/list`, `/twda/{id}`) — KRCG is already this project's
  card-data source (`data/src/krcg.rs`), and critically, **TWDA card ids use
  the exact same KRCG numbering scheme our own `cards.sqlite` already uses**
  (100xxx library, 200xxx crypt) — confirmed against the live OpenAPI spec.
  No id-translation layer is needed, unlike Amaranth (see the deferred
  Amaranth-import investigation in this same work session).
- **V5-confirmation rule**: the KRCG API has no format/edition filter — a
  `date_from` heuristic was considered and rejected, for the same reason
  `data/src/v5pool.rs`'s doc comment warns against: release date does not
  imply V5 (that file documents three real incidents from exactly this
  mistake). Instead, a fetched TWDA deck is only ingested if **100% of its
  crypt and library card ids already exist in our own V5-filtered `cards`
  table** — the same pool `v5pool.rs` builds, joined at ingestion time, not
  guessed at. A deck with even one non-V5 card is dropped entirely, never
  partially imported.
- **Storage**: two new tables in the same `cards.sqlite` (versioned and
  redeployed together with card data, not a separate file/pool) —
  `twda_decks` (id, name, event, place, date, player, author, players_count,
  tournament_format, score, comments) and `twda_deck_cards` (deck_id,
  card_id, section, quantity), FK'd to `cards.id`.
- **Still out of scope for this batch** (unchanged from the original
  exclusion, revisit separately if wanted): Hall of Fame, PDA (Public Deck
  Archive — user-published, not tournament-sourced), the playtest program,
  table-seating utilities (SchreckNet already has an unrelated seating
  randomizer at `#/table`, per docs/roadmap.md — not a tournament feature),
  and any co-occurrence recommendation engine. TWD is the concrete,
  well-defined, verifiably-V5-filterable piece; the rest are separate
  features with their own scope questions.
- Both MCP and REST expose `search_twda_decks` / `get_twda_deck`, per
  AGENTS.md hard rule 2 — the same `twda_db.rs` service module both surfaces
  call.

## Alternatives considered

- **Amaranth as the tournament-adjacent source** — rejected for TWD
  specifically; Amaranth is a deck *builder* mirroring vdb's own deck-import
  feature, not a tournament archive, and (per the earlier investigation in
  this session) needs its own id-mapping data we don't have. Unrelated to
  this decision.
- **`date_from` heuristic instead of card-membership confirmation** —
  rejected; `v5pool.rs` already documents three real incidents where a
  release-date guess silently leaked non-V5 cards into the pool. The
  card-membership join costs one extra ingestion-time check and eliminates
  the whole failure class.
- **Separate `twda.sqlite`** — rejected; TWDA decks reference card ids
  directly, so keeping them in the same file as `cards.sqlite` means no
  second OPFS pool, no second version-sync problem, and the existing
  `cards_db::open()` connection already has access.

## Consequences

- Ingestion depends on a live third-party API (`api.krcg.org`) at pipeline
  build time — same trust tier as the existing KRCG/VEKN dependencies in
  `data/src/krcg.rs` and `data/src/vekn.rs`, no new trust boundary.
- A tournament whose winning decklist includes a since-banned or non-V5 card
  (rare, but possible for older or transitional-era results even within a
  V5-dated tournament) is silently excluded rather than shown with a caveat —
  deliberate, matches "only confirmed V5" literally.
