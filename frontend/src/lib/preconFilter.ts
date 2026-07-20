import { query } from './db'
import type { SetPrintMode } from './setFilter'

export interface PreconSelection {
  set: string
  precon: string
}

export interface PreconOption extends PreconSelection {
  value: string
}

export async function listSearchPrecons(): Promise<PreconOption[]> {
  const rows = await query<{ set_name: string; precon: string }>(
    `SELECT s.name AS set_name, p.precon
     FROM printings p JOIN sets s ON s.id = p.set_id
     WHERE p.precon IS NOT NULL
     GROUP BY s.name, p.precon
     ORDER BY s.release_date, s.name, p.precon`,
  )
  return rows.map((row) => ({
    set: row.set_name,
    precon: row.precon,
    value: `${row.set_name}:${row.precon}`,
  }))
}

/**
 * VDB's precon selector uses exact set + precon identities, OR-composes
 * multiple selections, then optionally restricts printing history. This SQL
 * mirrors server/src/cards_db.rs; every user-derived value remains bound.
 */
export function appendExactPreconFilter(
  sql: string,
  params: Array<string | number | null>,
  precons: PreconSelection[],
  printMode: SetPrintMode,
): string {
  const selections = precons.filter(
    (selection) => selection.set.trim() && selection.precon.trim(),
  )
  if (selections.length === 0) return sql

  params.push(printMode)
  const printIndex = params.length
  sql += ' AND ('
  selections.forEach((selection, index) => {
    if (index > 0) sql += ' OR '
    params.push(selection.set.trim())
    const setIndex = params.length
    params.push(selection.precon.trim())
    const preconIndex = params.length
    sql += `EXISTS (SELECT 1 FROM printings pp
      JOIN sets sp ON sp.id = pp.set_id
      WHERE pp.card_id = c.id
        AND sp.name = ?${setIndex}
        AND pp.precon = ?${preconIndex}
        AND (?${printIndex} = 'any'
          OR (?${printIndex} = 'only'
            AND 1 = (SELECT COUNT(DISTINCT po.set_id) FROM printings po
                     WHERE po.card_id = c.id)
            AND 1 = (SELECT COUNT(DISTINCT COALESCE(po.precon, ''))
                     FROM printings po
                     WHERE po.card_id = c.id AND po.set_id = pp.set_id))
          OR (?${printIndex} = 'first'
            AND sp.release_date = (SELECT MIN(sf.release_date)
              FROM printings pf JOIN sets sf ON sf.id = pf.set_id
              WHERE pf.card_id = c.id))
          OR (?${printIndex} = 'reprint'
            AND sp.release_date > (SELECT MIN(sr.release_date)
              FROM printings pr JOIN sets sr ON sr.id = pr.set_id
              WHERE pr.card_id = c.id))))`
  })
  return sql + ')'
}
