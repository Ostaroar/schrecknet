# Card Data Pipeline

## Sources (all community/official, same as vdb)

- **VEKN official card list** — canonical card texts (CSV)
- **KRCG static files** (`static.krcg.org`) — normalized card JSON, rulings database,
  card name index, set/precon metadata
- **Card images** — Black Chantry / Dark Pack assets; legacy scans (VTES.PL, CCGAMEZ)
  referenced by URL, not committed to this repo

## Pipeline (`data/`)

A small Rust (or Python, TBD in implementation) tool that:

1. Downloads pinned-version source files (checksums recorded in `data/lock.json`)
1a. **Filters to the V5-legal pool** — the VEKN V5 format card list (KRCG carries
    per-card legality/set data). Cards outside the pool are dropped entirely, which
    also shrinks `cards.sqlite`. Filter option lists (clans, sects, titles,
    disciplines, groups, sets, precons, artists) are emitted from the surviving
    pool, never hardcoded.
2. Normalizes into the SQLite schema below
3. Builds FTS5 indexes and integrity-checks (every crypt card has clan+group, …)
4. Emits `cards.sqlite` + `cards.meta.json` (version, counts, source products,
   and the card-text languages actually present in the filtered V5 pool)

Runs in CI weekly (`card-data.yml`) and on demand; when the output hash changes it
opens a PR bumping the data version. The app fetches `cards.sqlite` by content-hash
URL → immutable caching, and the service worker swaps versions atomically.

## Schema sketch (`cards.sqlite`, read-only)

```sql
-- shared
CREATE TABLE sets(id INTEGER PRIMARY KEY, abbrev TEXT, name TEXT, release_date TEXT);
CREATE TABLE artists(id INTEGER PRIMARY KEY, name TEXT);

CREATE TABLE cards(
  id INTEGER PRIMARY KEY,          -- stable vdb/krcg card id
  kind TEXT CHECK(kind IN ('crypt','library')),
  name TEXT, name_ascii TEXT, aka TEXT,
  card_text TEXT,
  -- crypt
  clan TEXT, sect TEXT, capacity INT, grp INT, title TEXT, votes INT,
  adv BOOLEAN, banned TEXT,
  -- library
  types TEXT,                      -- JSON array (multi-type)
  blood_cost TEXT, pool_cost TEXT, burn_option BOOLEAN,
  requirement_clan TEXT, requirement_capacity TEXT, requirement_title TEXT,
  requirement_sect TEXT,
  image_url TEXT                   -- KRCG-hosted scan, hotlinked (Dark Pack:
                                   -- URLs only, never image files) [schema v2]
);
CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior BOOLEAN);
CREATE TABLE card_traits(card_id INT, trait TEXT);         -- precomputed trait flags
CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT,
                       first_print BOOLEAN);
CREATE TABLE card_artists(card_id INT, artist_id INT);
CREATE TABLE rulings(card_id INT, text TEXT, refs TEXT);   -- KRCG rulings
CREATE TABLE translations(card_id INT, lang TEXT, name TEXT, card_text TEXT);
CREATE VIRTUAL TABLE cards_fts USING fts5(name, aka, card_text, content=cards);
```

Trait flags (`card_traits`) are precomputed by the pipeline with the same regex/rules
vdb uses (e.g. "+1 bleed", "bounce bleed", "enter combat") so client filters are pure
indexed lookups — port these rules from vdb's search code and golden-test them against
vdb.im results.

## User data

- Browser (`user.sqlite` in OPFS) and server (`app.sqlite`) share one migration set:
  the ordered SQL files under `migrations/`. The browser migration runner is in
  `frontend/src/lib/userDbWorker.ts`; `server/src/user_db.rs` applies the same
  files to `app.sqlite` at startup. Current tables are `decks`, `deck_cards`, and
  `deck_tags`; `users`, `deck_branches`, and `inventory` arrive with their owning
  features.
