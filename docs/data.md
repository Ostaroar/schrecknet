# Card Data Pipeline

## Sources (all community/official, same as vdb)

- **VEKN official card lists** — canonical CSV bundle; `vtescrypt.csv` supplies
  crypt sect/title/vote/advancement/banned metadata, `vteslib.csv` supplies
  library Burn Option/Banned flags, and `vteslibmeta.csv`
  supplies normalized library requirements used by VDB's sect/title filters
- **KRCG static files** (`static.krcg.org`) — normalized card JSON, rulings database,
  card name index, set/precon metadata
- **Card images** — Black Chantry / Dark Pack assets; legacy scans (VTES.PL, CCGAMEZ)
  referenced by URL, not committed to this repo

## Pipeline (`data/`)

A Rust tool that:

1. Downloads pinned-version source files (checksums recorded in `data/lock.json`)
1a. **Filters to the V5-legal pool** (`data/src/v5pool.rs`, ADR 0014). A card is in
    the pool if either (a) one of its KRCG set names is in `V5_SET_NAMES` — the 10
    KRCG names covering Black Chantry's 28 official V5 products — or (b) Black
    Chantry legalised it individually, which is read from the `formats` field of
    `static.krcg.org/data/v5/vtes.json` rather than hardcoded, because those promo
    cards' only printings are in classic sets and no set rule can express them.
    KRCG has no field marking a *set* as V5, so `V5_SET_NAMES` stays curated and is
    guarded by `every_krcg_set_is_classified`, which fails the build when KRCG
    publishes a set that is in neither `V5_SET_NAMES` nor `KNOWN_NON_V5_SETS`.
    Cards outside the pool are dropped entirely, which also shrinks
    `cards.sqlite`. Filter option lists (clans, sects, titles, disciplines, groups,
    sets, precons, artists) are emitted from the surviving pool, never hardcoded.
2. Joins official VEKN metadata by stable card id, reproduces VDB's crypt
   sect/title-vote normalization and library title-implied sect tokens in shared
   Rust, and normalizes into the schema below
3. Builds FTS5 indexes and integrity-checks (every crypt card has clan+group, …)
4. Downloads the exact ONNX files locked by `models/semantic.json`, verifies every
   size + SHA-256, constructs deterministic English card documents, and generates
   one normalized 384-dimensional embedding per V5 card. The INT8 model runs one
   document per inference so its dynamic activation quantization matches query-time
   inference (ADR 0006)
5. Emits `cards.sqlite` + `cards.meta.json` (version, counts, source products,
   card-text languages, and semantic model metadata) plus browser-ready verified
   model assets under `models/semantic/`

Runs in CI weekly (`card-data.yml`) and on demand; when the output hash changes it
opens a PR bumping the data version.

`cards.sqlite` and `cards.meta.json` are served from **stable** paths under `/data`
with `Cache-Control: no-cache`, i.e. revalidated rather than `immutable` — the
filenames do not carry their version, so a cached copy can be wrong (ADR 0015; an
earlier revision of this paragraph claimed a content-hash URL that was never
implemented, and marking `/data` immutable on the strength of that claim stranded
clients on stale card data). The browser downloads the database only when
`cards.meta.json` reports a new `schema_version.data_version`, and decides that by
reading the version out of its *own* stored database, never from a separate stamp.
The service worker deliberately does not touch `/data` at all.

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
  clan TEXT, sect TEXT, path TEXT,  -- KRCG morality path, when present [schema v8]
  capacity INT, grp INT, title TEXT, votes INT,
  adv BOOLEAN, banned TEXT,
  -- library
  types TEXT,                      -- JSON array (multi-type)
  blood_cost TEXT, pool_cost TEXT, burn_option BOOLEAN,
  requirement_clan TEXT, requirement_title TEXT, requirement_sect TEXT,
  image_url TEXT                   -- KRCG-hosted scan, hotlinked (Dark Pack:
                                   -- URLs only, never image files) [schema v2]
);
CREATE TABLE card_disciplines(card_id INT, discipline TEXT, superior BOOLEAN);
CREATE INDEX card_disciplines_card_idx ON card_disciplines(card_id); -- schema v9;
                       -- search_plan.rs's discipline filters are correlated
                       -- subqueries against this table per candidate row —
                       -- unindexed, `discipline_logic=only` search was ~50ms
                       -- server-side (server/src/main.rs's TraceLayer access
                       -- log measured it); indexed, ~2ms
CREATE TABLE card_capacity_requirements(
  card_id INT PRIMARY KEY,
  min_capacity INT,                -- “N or more” / “above N” normalized bound
  max_capacity INT                 -- “N or less” / “less than N” normalized bound
);                                 -- schema v5
CREATE TABLE card_requirements(
  card_id INT,
  requirement TEXT,                -- normalized/derived VDB-compatible token
  kind TEXT CHECK(kind IN ('sect','title','other')),
  PRIMARY KEY(card_id, requirement)
) WITHOUT ROWID;                    -- schema v6; V5 rows only
CREATE TABLE card_traits(card_id INT, trait TEXT);         -- precomputed trait flags
CREATE TABLE printings(card_id INT, set_id INT, precon TEXT, rarity TEXT,
                       first_print BOOLEAN,
                       precon_copies INT);  -- schema v7; how many copies of
                       -- this card one physical copy of `precon` contains
                       -- (KRCG's own per-printing "copies" field; NULL when
                       -- `precon` is NULL, defaults to 1 when precon is set
                       -- but "copies" was omitted from the source; anniversary
                       -- products are normalized to their official 100-card
                       -- deck, excluding separately packaged bonus cards)
CREATE INDEX printings_card_idx ON printings(card_id); -- schema v9; same
                       -- correlated-subquery reasoning as card_disciplines above
CREATE TABLE card_artists(card_id INT, artist_id INT);
CREATE TABLE rulings(card_id INT, text TEXT, refs TEXT);   -- KRCG rulings
CREATE TABLE translations(card_id INT, lang TEXT, name TEXT, card_text TEXT);
CREATE TABLE card_embeddings(
  card_id INT NOT NULL REFERENCES cards(id),
  model_id TEXT NOT NULL,
  dimensions INT NOT NULL,
  embedding BLOB NOT NULL,         -- normalized little-endian float32 values
  PRIMARY KEY(card_id, model_id)
) WITHOUT ROWID;                   -- schema v4; compact vectors for the V5 pool
CREATE VIRTUAL TABLE cards_fts USING fts5(name, aka, card_text, content=cards);
```

Library capacity requirements are derived from canonical English card text at build
time by shared Rust code in `core/src/capacity.rs`. It deliberately matches vdb's
same-line `Requires … of/with capacity …` grammar and normalizes strict forms
(`less than N`, `above N`) to inclusive bounds. Text merely mentioning another
card's capacity is not treated as a requirement.

Sect/title requirements come from VEKN's official `vtescsv_utf8.zip`, cached beside
KRCG's JSON for 24 hours. `core/src/requirements.rs` lowercases, deduplicates, and
classifies only the rows that survive the V5 pool filter, then adds VDB-compatible
title→sect implications. This keeps filter options pool-derived while avoiding
false positives from ordinary card text; see ADR 0007.

Crypt sect, canonical title, vote value, advancement, and banned fields come from
the same archive's `vtescrypt.csv`. `core/src/crypt_metadata.rs` reproduces VDB's
official-text-prefix sect rule (including `Advanced, <sect>` and Imbued) and its
title-to-vote table. The build fails unless all 265 current V5 crypt cards join,
so search never silently falls back to guessed clan→sect mappings.

The model is not fetched at query time and its binary is not committed. The lock
records one immutable Hugging Face revision plus checksums; the data build caches it
under `$SCHRECKNET_DATA_CACHE/semantic/` (default `.cache/semantic/`) and rejects
changed bytes. `SCHRECKNET_SEMANTIC_MANIFEST` may point a development build at a
different manifest, but production changes require an ADR/model-quality review.

Set age/printing filters compare `sets.release_date` values only across rows
that survive the V5-pool ingest. Consequently, "first print" means first V5
printing in SchreckNet, never an older classic-era printing that is outside the
site's scope.

Trait flags (`card_traits`) are precomputed by native shared Rust with VDB's exact
`traitsRegexMaps.js`/`missingTrait` rules (including structured Multi-Type,
Multi-Discipline, Advancement, Burn Option, Banned, and No Requirement cases), so
client filters are pure indexed lookups. KRCG's `Ⓓ` directed-action glyph is
normalized to VEKN/VDB's `(D)` exclusion semantics. The real-data smoke suite locks
every positive trait's V5 cardinality and exact representative AND-compositions;
an independent source-oracle comparison covers all 749 current cards.

## User data

- Browser (`user.sqlite` in OPFS) and server (`app.sqlite`) share one migration set:
  the ordered SQL files under `migrations/`. The browser migration runner is in
  `frontend/src/lib/userDbWorker.ts`; `server/src/user_db.rs` applies the same
  files to `app.sqlite` at startup. Current tables are `decks`, `deck_cards`, and
  `deck_tags`; `users`, `deck_branches`, and `inventory` arrive with their owning
  features.
