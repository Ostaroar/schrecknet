BEGIN;

-- Private friend-group casual play log (docs/game-groups-plan.md). No
-- accounts: a group is identified by a random shareable `code`; whoever
-- has it can log games or read the leaderboard. Server-only data (lives in
-- app.sqlite) — the browser's local user.sqlite gets these tables too via
-- the shared migration set (see AGENTS.md's single-schema-source rule) but
-- never uses them; that's a deliberate, accepted bit of waste rather than a
-- second migration mechanism for three small tables.
CREATE TABLE IF NOT EXISTS game_groups(
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_games(
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
  played_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_game_results(
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES group_games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  deck_name TEXT,
  vp REAL NOT NULL CHECK(vp >= 0),
  game_win INTEGER NOT NULL DEFAULT 0 CHECK(game_win IN (0,1))
);

PRAGMA user_version = 4;
COMMIT;
