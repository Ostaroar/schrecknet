BEGIN;

CREATE TABLE IF NOT EXISTS inventory(
  card_id INTEGER PRIMARY KEY,
  qty INTEGER NOT NULL CHECK(qty > 0)
);

-- Deck-level default claim on its own cards: 'excluded' decks never touch
-- inventory math; 'fixed' claims sum across decks (exclusive), 'flexible'
-- claims take the max across decks (shared pool). Verified against vdb's
-- own algorithm — see core/src/inventory.rs's doc comment.
ALTER TABLE decks ADD COLUMN inventory_mode TEXT NOT NULL DEFAULT 'excluded'
  CHECK(inventory_mode IN ('excluded','fixed','flexible'));

-- Per-card override of the deck's default, matching vdb's individually
-- pinnable/shareable cards. Only rows that differ from the deck default are
-- stored; changing a deck's inventory_mode clears its overrides (app-layer
-- responsibility, mirroring vdb's reset-on-toggle behavior).
CREATE TABLE IF NOT EXISTS deck_card_inventory_overrides(
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('fixed','flexible')),
  PRIMARY KEY (deck_id, card_id)
);

PRAGMA user_version = 3;
COMMIT;
