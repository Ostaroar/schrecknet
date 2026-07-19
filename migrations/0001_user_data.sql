BEGIN;

CREATE TABLE IF NOT EXISTS decks(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deck_cards(
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  PRIMARY KEY (deck_id, card_id)
);

CREATE TABLE IF NOT EXISTS deck_tags(
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (deck_id, tag)
);

PRAGMA user_version = 1;
COMMIT;
