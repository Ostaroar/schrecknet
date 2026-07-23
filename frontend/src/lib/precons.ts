// Precon (official starter deck) browsing — mirrors server/src/cards_db.rs::
// list_precons/precon_card_counts exactly (same grouping, same query) so the
// browser and server agree. Browsing a precon's actual cards reuses
// searchCrypt/searchLibrary's existing set+precon filters rather than a
// second query path.

import { query } from './db'

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
