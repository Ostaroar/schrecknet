-- Physical preconstructed products are tracked separately from loose card
-- quantities. This avoids falsely claiming that the same overlapping cards
-- constitute several different owned precons at once.
CREATE TABLE IF NOT EXISTS inventory_precons(
  set_name TEXT NOT NULL,
  precon TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  PRIMARY KEY(set_name, precon)
) WITHOUT ROWID;

PRAGMA user_version = 6;
