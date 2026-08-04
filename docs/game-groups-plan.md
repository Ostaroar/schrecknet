# Game Groups — Private Playgroup Tracker + Leaderboard (Design & Dev Plan)

Status: **G1–G3 shipped, G4 optional/deferred** (2026-07-23). Requested directly by the project
owner: a way for a regular friend group to log the games they play together and see
a simple leaderboard. This document is the working spec — milestone-by-milestone,
same style as [docs/inventory-plan.md](inventory-plan.md) and
[docs/gameloop/DEV-PLAN.md](gameloop/DEV-PLAN.md).

---

## 1. Scope decision — why this doesn't violate the tournament/community-data exclusion

AGENTS.md and `docs/feature-parity.md`'s scope note explicitly exclude **public**
tournament/community-data features: TWD (Tournament Winning Decks), TDA (Tournament
Decks Archive), PDA (Public Deck Archive), Hall of Fame, the playtest program, and any
recommendation engine built on tournament co-occurrence data. Those are all about
**publishing or consuming an official, public archive** of competitive results.

This feature is different in kind, not just degree: it's a **private, opt-in log for
one specific friend group's own casual games**, gated behind a random code nobody else
has, with no ranking against the outside world, no publication, and no tournament
structure (rounds, judges, prizes) — a casual, local social-play utility that sits near
the excluded category's *name* without being the excluded *thing*.
**Decision: build it, framed explicitly as a private group tool, never a public
archive** — no leaderboard-across-groups, no global rankings, no discovery of other
groups' codes.

## 2. What "no accounts" buys us — and costs us

SchreckNet has no auth system yet (Phase 3 territory, unbuilt). Rather than blocking
this feature on that work, a **group is identified by a random shareable code**
(e.g. `K7QX2M`) generated server-side. Whoever has the code can view the leaderboard
or log a game — same trust model as a shared Google Sheet link. Consequences:

- No login, no password, no per-player identity beyond a free-text name typed in per
  game. Two different people typing "Alex" are the same leaderboard row — that's a
  feature for a friend group, not a bug (matches how everyone already knows each
  other).
- Anyone with the code can add or (later) edit games — there's no permission model.
  Fine for a friend group; explicitly not fine for anything public, which is exactly
  why this must never be searchable/listable and codes must not be guessable in bulk
  (hence random generation, not sequential ids).
- If Phase 3 accounts land later, groups can gain real ownership/membership without
  a schema rewrite — `game_groups.id` is already the join key everything else hangs
  off of.

## 3. Data model

New migration `migrations/0004_game_groups.sql`, added to **both** migration arrays
(`server/src/user_db.rs` and `frontend/src/lib/userDbWorker.ts`) per the project's
single-schema-source rule — even though these tables are server-only in practice; see
the migration file's own comment for why a second migration mechanism wasn't worth it
for three small tables. Bumps `PRAGMA user_version` to 4.

```sql
CREATE TABLE game_groups(
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE group_games(
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
  played_at TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE group_game_results(
  id INTEGER PRIMARY KEY, game_id INTEGER NOT NULL REFERENCES group_games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, player_name TEXT NOT NULL, deck_name TEXT,
  vp REAL NOT NULL CHECK(vp >= 0), game_win INTEGER NOT NULL DEFAULT 0 CHECK(game_win IN (0,1))
);
```

Deliberately **no seating/predator-prey chain** in the first slice — VTES scoring is
genuinely just per-player Victory Points (0–5 in halves) plus a Game Win (GW) flag for
the player who achieved the win condition (matters for tiebreaks and for VEKN-style
scoring, even in casual play). `position` is display order only, no gameplay meaning.
Add seating later (I4+) if the group wants it — additive, not a migration risk.

## 4. Domain logic placement

The leaderboard is a **plain SQL aggregation** (`SUM`/`COUNT`/`AVG` grouped by
`player_name`) — no shared V5 rule, no WASM/browser reuse case (the frontend only ever
displays a leaderboard the server already computed; it never recomputes one from raw
game rows). Per the project's own precedent (`cards_db.rs`'s search/sort SQL lives in
`server/`, not `core/`, exactly because nothing browser-side needs it), this stays in
`server/src/game_groups.rs`, not `core/`. If a future milestone needs the *same* math
client-side (e.g. an offline preview before syncing a logged game), lift it into
`core/` then — not preemptively.

## 5. Capability shape (MCP + REST, both or neither — AGENTS.md hard rule #2)

| Capability | MCP tool | REST |
|---|---|---|
| Create a group | `create_game_group` | `POST /api/v1/groups` |
| Get group info | `get_game_group` | `GET /api/v1/groups/{code}` |
| Log a game | `log_group_game` | `POST /api/v1/groups/{code}/games` |
| List games | `list_group_games` | `GET /api/v1/groups/{code}/games` |
| Leaderboard | `get_group_leaderboard` | `GET /api/v1/groups/{code}/leaderboard` |

All five call the exact same `server/src/game_groups.rs` functions — this is the
**first server capability that reads/writes `app.sqlite`** (until now only migrated
at startup, never touched by a request handler), so `AppState` gains an `app_db: String`
field and `SchreckNetMcp` gains a matching one, mirroring how both already hold
`data_dir` for `cards.sqlite`.

Codes are generated with SQLite's own `upper(hex(randomblob(4)))` (an 8-hex-char code)
inside the `INSERT` — no new `rand` crate, matching the project's existing
hand-rolled-over-a-dependency precedent (the base64 share-token encoder). Retry on the
(astronomically unlikely) `UNIQUE` collision.

## 6. Frontend

- `frontend/src/lib/gameGroups.ts`: thin REST client (this is the first frontend
  module that talks to the server for anything other than card data/semantic
  search — no OPFS, no localStorage-as-source-of-truth; the joined group's `code` is
  cached in `localStorage` purely as a convenience so returning to the tab doesn't
  require retyping it).
- New route `#/table` (a friend group's regular game night — kept distinct from
  `#/decks`), nav tab.
- `TablePage.tsx`: create-a-group form (name → code), join-by-code form, a log-game
  form (date, notes, N players each with name/deck-name/VP/GW checkbox), a recent-games
  list, and the leaderboard table.

## 7. Milestones

### G1 — Schema + server capability (MCP + REST) + tests ☑
- Migration 0004 (both arrays). `server/src/game_groups.rs`: create/get group, log
  game, list games, leaderboard — all backed by `app.sqlite`. Wired into `api.rs` +
  `mcp.rs` per the both-or-neither rule. `AppState`/`SchreckNetMcp` gain `app_db`.
- Rust tests: code generation produces unique codes; logging a game with 4–5 players
  computes the right per-player leaderboard aggregates (hand-computed fixture);
  logging against an unknown code returns "not found", not a crash; a group's games
  are deleted when the group is (cascade).
- **DoD:** `cargo test --workspace` green; a manual `curl` round-trip (create → log →
  leaderboard) produces the expected numbers. — **Done** (2026-07-23): 5 new Rust
  unit tests plus a live 2-game/4-player curl fixture matching hand-computed VP/win
  aggregates exactly; `cargo clippy --workspace --all-targets -- -D warnings` clean.

### G2 — Frontend: create/join + leaderboard view ☑
- `lib/gameGroups.ts` REST client. `#/table` route + nav tab. Create-group and
  join-by-code forms; persist the active code in `localStorage`
  (`schrecknet.game-group-code`). Leaderboard table (games played, total VP, average
  VP, wins, win rate), sorted by wins then total VP (matches the server's
  `ORDER BY` in `game_groups::leaderboard`).
- **DoD:** live-verified: create a group, note the code, leaderboard renders empty
  state correctly. — **Done** (2026-07-23), verified in-browser.

### G3 — Log-game form + game history ☑
- Form to add a game: date (defaults to today), optional notes, dynamic list of
  players (name, optional deck name, VP, GW checkbox — validate VPs are non-negative
  client-side before submit, server is the source of truth regardless). Recent-games
  list underneath, newest first.
- **DoD:** logging a real game updates the leaderboard immediately; live-verified with
  a 4-player fixture matching a hand-computed leaderboard. — **Done** (2026-07-23):
  logged two games in-browser (create → log → leaderboard → leave/rejoin by code),
  numbers match the same fixture used in the Rust tests exactly.

### G4 — Complete ☑
- ☑ Join multiple groups — owner-requested (2026-07-23). `lib/gameGroups.ts` now
  stores a *list* of joined codes (`schrecknet.game-group-codes`, migrated
  transparently from the old single-code key) plus a separate "active code"
  pointer; `TablePage.tsx` shows a pill switcher above the active group's view and
  a "+ Join another" toggle that reveals the create/join forms without leaving the
  current group. Live-verified: joined two groups, switched between them, each
  keeps its own leaderboard/games.
- ☑ Delete a logged game, with a confirmation warning — owner-requested
  (2026-07-23). `server/src/game_groups.rs::delete_game` scopes the delete to
  `game_id AND group_id = (code)` so a game id can't be deleted via a different
  group's code even if guessed; wired into REST (`DELETE
  /api/v1/groups/{code}/games/{game_id}`) and MCP (`delete_group_game`), both
  tested including the cross-group-refusal case. Frontend: a "Delete" button per
  recent game calls the browser's native `confirm()` (same pattern as
  `DeckList.tsx`'s deck deletion) naming the date and players before deleting —
  live-verified both the cancel path (declined confirm leaves the game/leaderboard
  untouched) and the accept path (game and its leaderboard contribution disappear
  immediately).
- ☑ Localized `TablePage.tsx` in English, Spanish, French, and German through the
  same typed `lib/i18n.ts` catalog as the rest of the interface.
- ☑ Seating/predator-prey chain per game. Result order is the canonical circular
  seating order; every history entry and export names each player's predator and prey.
- ☑ Edit a logged game through atomic REST + MCP update operations. The group code
  scopes updates, and replacing metadata/results happens in one SQLite transaction.
- ☑ Optional write passphrase per group. The share code grants read access; Argon2id
  protects log/update/delete operations across REST, MCP, and the frontend. Existing
  groups remain open for backward compatibility. The passphrase is kept only for the
  browser session and only its salted hash is stored server-side. A separate optional
  read passphrase is deferred because it needs an authenticated read-session design.
- ☑ Per-deck-archetype tie-in reuses `lib/archetypeTags.ts`. Optional archetypes
  persist per result and the private group view aggregates games, average VP, wins,
  and win rate; there is no public or cross-group ranking.
- ☑ CSV/text export of complete game history, including seating, predator/prey,
  deck, archetype, VP, and game win.

## 8. Guardrails

- No new runtime dependency (group codes via SQLite `randomblob`, not a `rand` crate).
- Never make groups listable/discoverable or add any cross-group ranking — that would
  cross back into the excluded public-archive territory this design deliberately
  avoids (§ 1).
- Both MCP + REST for every capability, from the first commit — this is a new server
  capability, not a browser-only convenience, so the both-or-neither rule applies in
  full from G1.
- Keep this doc and `docs/roadmap.md` current as milestones land.
