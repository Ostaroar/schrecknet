// Library search query builder — mirrors server/src/cards_db.rs::search_library
// exactly (same filters, same result shape) so the browser and server agree.

import { query } from './db'

export interface LibraryFilters {
  text: string
  cardType: string | null
  clan: string | null
  disciplines: string[]
  disciplinesSuperior: boolean
  bloodCostMax: number | null
  poolCostMax: number | null
  set: string | null
  precon: string | null
  artist: string | null
}

export const emptyLibraryFilters: LibraryFilters = {
  text: '',
  cardType: null,
  clan: null,
  disciplines: [],
  disciplinesSuperior: false,
  bloodCostMax: null,
  poolCostMax: null,
  set: null,
  precon: null,
  artist: null,
}

export interface LibraryCard {
  id: number
  name: string
  types: string[]
  clan: string | null
  blood_cost: string | null
  pool_cost: string | null
  disciplines: string[]
}

interface LibraryRow {
  id: number
  name: string
  types: string
  clan: string | null
  blood_cost: string | null
  pool_cost: string | null
  disc: string | null
}

export async function searchLibrary(filters: LibraryFilters): Promise<LibraryCard[]> {
  const typePattern = filters.cardType ? `%"${filters.cardType}"%` : null
  // Costs are stored as TEXT (e.g. "2"); CAST for numeric comparison. NULL
  // costs and the variable cost "X" (CAST('X') is 0) never match a max
  // filter — mirrors server/src/cards_db.rs exactly. Per-discipline EXISTS
  // clauses are built dynamically like searchCrypt — every value is bound.
  let sql = `SELECT c.id, c.name, c.types, c.clan, c.blood_cost, c.pool_cost,
            GROUP_CONCAT(cd.discipline) AS disc
     FROM cards c
     LEFT JOIN card_disciplines cd ON cd.card_id = c.id
     WHERE c.kind = 'library'
       AND (?1 = '' OR c.name_ascii LIKE '%' || ?1 || '%' OR c.card_text LIKE '%' || ?1 || '%')
       AND (?2 IS NULL OR c.types LIKE ?2)
       AND (?3 IS NULL OR c.clan LIKE '%' || ?3 || '%')
       AND (?4 IS NULL OR (c.blood_cost IS NOT NULL AND c.blood_cost != 'X'
            AND CAST(c.blood_cost AS INTEGER) <= ?4))
       AND (?5 IS NULL OR (c.pool_cost IS NOT NULL AND c.pool_cost != 'X'
            AND CAST(c.pool_cost AS INTEGER) <= ?5))
       AND (?6 IS NULL OR EXISTS (SELECT 1 FROM printings p JOIN sets s ON s.id = p.set_id
            WHERE p.card_id = c.id AND s.name = ?6))
       AND (?7 IS NULL OR EXISTS (SELECT 1 FROM printings p
            WHERE p.card_id = c.id AND p.precon LIKE '%' || ?7 || '%'))
       AND (?8 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
            WHERE ca.card_id = c.id AND a.name LIKE '%' || ?8 || '%'))`
  const params: (string | number | null)[] = [
    filters.text.trim(),
    typePattern,
    filters.clan,
    filters.bloodCostMax,
    filters.poolCostMax,
    filters.set,
    filters.precon,
    filters.artist,
  ]
  for (const code of filters.disciplines) {
    sql += ` AND EXISTS (SELECT 1 FROM card_disciplines cdx
       WHERE cdx.card_id = c.id AND cdx.discipline = ?${params.length + 1} AND cdx.superior >= ?${params.length + 2})`
    params.push(code.toLowerCase(), filters.disciplinesSuperior ? 1 : 0)
  }
  sql += ` GROUP BY c.id ORDER BY c.name ASC LIMIT 200`

  const rows = await query<LibraryRow>(sql, params)
  return rows.map((r) => ({
    ...r,
    types: JSON.parse(r.types) as string[],
    clan: r.clan || null,
    disciplines: r.disc ? r.disc.split(',') : [],
  }))
}

export async function listLibraryTypes(): Promise<string[]> {
  const rows = await query<{ types: string }>(`SELECT DISTINCT types FROM cards WHERE kind = 'library'`)
  const set = new Set<string>()
  for (const row of rows) {
    for (const t of JSON.parse(row.types) as string[]) set.add(t)
  }
  return [...set].sort()
}

export async function listLibraryClans(): Promise<string[]> {
  const rows = await query<{ clan: string }>(
    `SELECT DISTINCT clan FROM cards WHERE kind = 'library' AND clan != '' ORDER BY clan`,
  )
  return rows.map((r) => r.clan)
}

export async function listLibraryDisciplines(): Promise<string[]> {
  const rows = await query<{ discipline: string }>(
    `SELECT DISTINCT cd.discipline FROM card_disciplines cd
     JOIN cards c ON c.id = cd.card_id WHERE c.kind = 'library' ORDER BY cd.discipline`,
  )
  return rows.map((r) => r.discipline)
}

export async function listSets(): Promise<string[]> {
  const rows = await query<{ name: string }>(`SELECT DISTINCT name FROM sets ORDER BY name`)
  return rows.map((r) => r.name)
}

export async function listPrecons(): Promise<string[]> {
  const rows = await query<{ precon: string }>(
    `SELECT DISTINCT precon FROM printings WHERE precon IS NOT NULL ORDER BY precon`,
  )
  return rows.map((r) => r.precon)
}

export async function listArtists(): Promise<string[]> {
  const rows = await query<{ name: string }>(`SELECT DISTINCT name FROM artists ORDER BY name`)
  return rows.map((r) => r.name)
}
