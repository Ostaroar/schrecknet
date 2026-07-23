BEGIN;

-- Optional, private per-result archetype label for a group's own casual-game
-- analysis. Never used for public discovery or cross-group rankings.
ALTER TABLE group_game_results ADD COLUMN archetype_id TEXT;

PRAGMA user_version = 5;
COMMIT;
