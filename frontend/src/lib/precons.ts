// Precon (official starter deck) browsing — mirrors server/src/cards_db.rs::
// list_precons exactly (same grouping, same query) so the browser and server
// agree. Card *quantities* per precon aren't tracked by the data pipeline —
// KRCG's export records which printings existed, not each deck's exact copy
// counts — so this only lists precons and their distinct card pool; browsing
// a precon's actual cards reuses searchCrypt/searchLibrary's existing
// set+precon filters rather than a second query path.

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
