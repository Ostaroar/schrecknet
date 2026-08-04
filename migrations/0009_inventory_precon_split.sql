BEGIN;

-- Two fixes to `inventory` in one pass:
--
-- 1. Drop the `qty > 0` check. A row is now allowed to record a deficit
--    (qty <= 0) — e.g. singles lost or sold after a precon bulk-add — kept
--    independently of the precon's own owned count (frontend/src/lib/
--    inventoryStore.ts::setInventoryQty). SQLite has no ALTER TABLE DROP
--    CONSTRAINT, so the table is rebuilt.
-- 2. Split "owned via a precon" from "owned individually" into two columns
--    instead of one merged `qty`, so the UI can show both instead of an
--    indistinguishable total. Existing rows can't be split retroactively —
--    they start at precon_qty = 0, i.e. everything already owned reads as
--    "individually owned" until the precon is re-added.
CREATE TABLE inventory_new(
  card_id INTEGER PRIMARY KEY,
  qty INTEGER NOT NULL DEFAULT 0,
  precon_qty INTEGER NOT NULL DEFAULT 0
);
INSERT INTO inventory_new (card_id, qty, precon_qty)
  SELECT card_id, qty, 0 FROM inventory;
DROP TABLE inventory;
ALTER TABLE inventory_new RENAME TO inventory;

PRAGMA user_version = 9;
COMMIT;
