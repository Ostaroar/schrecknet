// Precon (official starter deck) browsing — mirrors server/src/cards_db.rs::
// list_precons/precon_card_counts exactly (same grouping, same query) so the
// browser and server agree. Browsing a precon's actual cards reuses
// searchCrypt/searchLibrary's existing set+precon filters rather than a
// second query path.

import { query } from './db'
import { query as userQuery, run as userRun } from './userDb'

export interface PreconSummary {
  set: string
  precon: string
  card_count: number
}

// "set" is a reserved SQLite keyword and breaks as a bare column alias
// (`SELECT ... AS set` is a syntax error) — alias to set_name and remap.
export async function listPrecons(): Promise<PreconSummary[]> {
  const rows = await query<{ set_name: string; precon: string; card_count: number }>(
    `SELECT s.name AS set_name, p.precon AS precon, COUNT(DISTINCT p.card_id) AS card_count
     FROM printings p JOIN sets s ON s.id = p.set_id
     WHERE p.precon IS NOT NULL
     GROUP BY s.name, p.precon
     ORDER BY s.name, p.precon`,
  )
  return rows.map((r) => ({ set: r.set_name, precon: r.precon, card_count: r.card_count }))
}

/**
 * Real per-card copy counts for one physical copy of a precon — sourced from
 * KRCG's own per-printing "copies" field (some V5 precon crypts do ship a
 * vampire twice), not just which distinct cards belong to it.
 */
export async function getPreconCardCounts(set: string, precon: string): Promise<Map<number, number>> {
  const rows = await query<{ card_id: number; copies: number }>(
    `SELECT p.card_id AS card_id, SUM(COALESCE(p.precon_copies, 1)) AS copies
     FROM printings p JOIN sets s ON s.id = p.set_id
     WHERE s.name = ?1 AND p.precon = ?2
     GROUP BY p.card_id`,
    [set, precon],
  )
  return new Map(rows.map((r) => [r.card_id, r.copies]))
}

export interface OwnedPrecon {
  set: string
  precon: string
  qty: number
}

export async function listOwnedPrecons(): Promise<OwnedPrecon[]> {
  return userQuery<OwnedPrecon>(
    `SELECT set_name AS "set", precon, qty
     FROM inventory_precons
     ORDER BY set_name, precon`,
  )
}

export async function getOwnedPreconQty(set: string, precon: string): Promise<number> {
  const rows = await userQuery<{ qty: number }>(
    'SELECT qty FROM inventory_precons WHERE set_name = ?1 AND precon = ?2',
    [set, precon],
  )
  return rows[0]?.qty ?? 0
}

/** Records physical product ownership independently from loose card counts. */
export async function adjustOwnedPreconQty(
  set: string,
  precon: string,
  delta: number,
): Promise<number> {
  const next = Math.max(0, (await getOwnedPreconQty(set, precon)) + delta)
  if (next === 0) {
    await userRun('DELETE FROM inventory_precons WHERE set_name = ?1 AND precon = ?2', [set, precon])
  } else {
    await userRun(
      `INSERT INTO inventory_precons (set_name, precon, qty) VALUES (?1, ?2, ?3)
       ON CONFLICT(set_name, precon) DO UPDATE SET qty = ?3`,
      [set, precon, next],
    )
  }
  return next
}
