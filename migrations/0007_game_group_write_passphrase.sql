BEGIN;

-- Optional write protection for shared game groups. The share code remains
-- sufficient for reading; mutations require the passphrase when this hash is
-- present. Only an Argon2 PHC string is stored, never the passphrase itself.
ALTER TABLE game_groups ADD COLUMN write_passphrase_hash TEXT;

PRAGMA user_version = 7;
COMMIT;
