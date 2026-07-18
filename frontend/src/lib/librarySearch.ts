// Library search query builder — mirrors server/src/cards_db.rs::search_library
// exactly (same filters, same result shape) so the browser and server agree.

import { query } from './db'

export interface LibraryFilters {
  text: string
  cardType: string | null
  clan: string | null
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
  const rows = await query<LibraryRow>(
    `SELECT c.id, c.name, c.types, c.clan, c.blood_cost, c.pool_cost,
            GROUP_CONCAT(cd.discipline) AS disc
     FROM cards c
     LEFT JOIN card_disciplines cd ON cd.card_id = c.id
     WHERE c.kind = 'library'
       AND (?1 = '' OR c.name_ascii LIKE '%' || ?1 || '%' OR c.card_text LIKE '%' || ?1 || '%')
       AND (?2 IS NULL OR c.types LIKE ?2)
       AND (?3 IS NULL OR c.clan LIKE '%' || ?3 || '%')
     GROUP BY c.id
     ORDER BY c.name ASC
     LIMIT 200`,
    [filters.text.trim(), typePattern, filters.clan],
  )
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
