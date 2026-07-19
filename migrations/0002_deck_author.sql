BEGIN;
ALTER TABLE decks ADD COLUMN author TEXT;
PRAGMA user_version = 2;
COMMIT;
