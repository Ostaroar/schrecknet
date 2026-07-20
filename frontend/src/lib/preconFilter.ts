import { query } from './db'

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
