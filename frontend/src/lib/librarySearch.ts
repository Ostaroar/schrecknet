// Library search query builder — mirrors server/src/cards_db.rs::search_library
// exactly (same filters, same result shape) so the browser and server agree.

import { query } from './db'
import { defaultSetAge, defaultSetPrint, type SetAgeMode, type SetPrintMode } from './setFilter'

export type TextMode = 'any' | 'name' | 'text'
export type CostMode = 'at_most' | 'exact' | 'at_least'

export interface LibraryFilters {
  text: string
  textMode: TextMode
  textRegex: boolean
  cardType: string | null
  clan: string | null
  disciplines: string[]
  disciplinesSuperior: boolean
  bloodCost: number | null
  bloodCostMode: CostMode
  poolCost: number | null
  poolCostMode: CostMode
  set: string | null
  setAge: SetAgeMode
  setPrint: SetPrintMode
  precon: string | null
  artist: string | null
}

export const emptyLibraryFilters: LibraryFilters = {
  text: '',
  textMode: 'any',
  textRegex: false,
  cardType: null,
  clan: null,
  disciplines: [],
  disciplinesSuperior: false,
  bloodCost: null,
  bloodCostMode: 'at_most',
  poolCost: null,
  poolCostMode: 'at_most',
  set: null,
  setAge: defaultSetAge,
  setPrint: defaultSetPrint,
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
  // costs and the variable cost "X" (CAST('X') is 0) never match a numeric
  // filter — mirrors server/src/cards_db.rs exactly. Per-discipline EXISTS
  // clauses are built dynamically like searchCrypt — every value is bound.
  let sql = `SELECT c.id, c.name, c.types, c.clan, c.blood_cost, c.pool_cost,
            GROUP_CONCAT(cd.discipline) AS disc
     FROM cards c
     LEFT JOIN card_disciplines cd ON cd.card_id = c.id
     WHERE c.kind = 'library'
       AND (?1 = ''
            OR (?2 AND (CASE WHEN ?13 THEN regexp_match(?1, c.name_ascii)
                             ELSE c.name_ascii LIKE '%' || ?1 || '%' END))
            OR (?3 AND (CASE WHEN ?13 THEN regexp_match(?1, c.card_text)
                             ELSE c.card_text LIKE '%' || ?1 || '%' END)))
       AND (?4 IS NULL OR c.types LIKE ?4)
       AND (?5 IS NULL OR c.clan LIKE '%' || ?5 || '%')
       AND (?6 IS NULL OR (c.blood_cost IS NOT NULL AND c.blood_cost != 'X' AND
            ((?7 = 'at_most' AND CAST(c.blood_cost AS INTEGER) <= ?6) OR
             (?7 = 'exact' AND CAST(c.blood_cost AS INTEGER) = ?6) OR
             (?7 = 'at_least' AND CAST(c.blood_cost AS INTEGER) >= ?6))))
       AND (?8 IS NULL OR (c.pool_cost IS NOT NULL AND c.pool_cost != 'X' AND
            ((?9 = 'at_most' AND CAST(c.pool_cost AS INTEGER) <= ?8) OR
             (?9 = 'exact' AND CAST(c.pool_cost AS INTEGER) = ?8) OR
             (?9 = 'at_least' AND CAST(c.pool_cost AS INTEGER) >= ?8))))
       AND ((?10 IS NULL AND ?11 IS NULL) OR EXISTS (
            SELECT 1 FROM printings p JOIN sets s ON s.id = p.set_id
            WHERE p.card_id = c.id
              AND (?11 IS NULL OR p.precon LIKE '%' || ?11 || '%')
              AND (?10 IS NULL
                OR (?14 = 'exact' AND s.name = ?10)
                OR (?14 = 'or_newer' AND s.release_date >=
                    (SELECT release_date FROM sets WHERE name = ?10))
                OR (?14 = 'or_older' AND s.release_date <=
                    (SELECT release_date FROM sets WHERE name = ?10))
                OR (?14 = 'not_newer' AND NOT EXISTS (
                    SELECT 1 FROM printings pn JOIN sets sn ON sn.id = pn.set_id
                    WHERE pn.card_id = c.id AND sn.release_date >
                        (SELECT release_date FROM sets WHERE name = ?10)))
                OR (?14 = 'not_older' AND NOT EXISTS (
                    SELECT 1 FROM printings po JOIN sets so ON so.id = po.set_id
                    WHERE po.card_id = c.id AND so.release_date <
                        (SELECT release_date FROM sets WHERE name = ?10))))
              AND (?10 IS NULL OR ?15 = 'any'
                OR (?15 = 'only' AND 1 = (
                    SELECT COUNT(DISTINCT px.set_id) FROM printings px
                    WHERE px.card_id = c.id))
                OR (?15 = 'first' AND
                    (SELECT release_date FROM sets WHERE name = ?10) = (
                        SELECT MIN(sf.release_date) FROM printings pf
                        JOIN sets sf ON sf.id = pf.set_id WHERE pf.card_id = c.id))
                OR (?15 = 'reprint' AND
                    (SELECT release_date FROM sets WHERE name = ?10) > (
                        SELECT MIN(sr.release_date) FROM printings pr
                        JOIN sets sr ON sr.id = pr.set_id WHERE pr.card_id = c.id)))))
       AND (?12 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
            WHERE ca.card_id = c.id AND a.name LIKE '%' || ?12 || '%'))`
  const params: (string | number | null)[] = [
    filters.text.trim(),
    filters.textMode !== 'text' ? 1 : 0,
    filters.textMode !== 'name' ? 1 : 0,
    typePattern,
    filters.clan,
    filters.bloodCost,
    filters.bloodCostMode,
    filters.poolCost,
    filters.poolCostMode,
    filters.set,
    filters.precon,
    filters.artist,
    filters.textRegex ? 1 : 0,
    filters.setAge,
    filters.setPrint,
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
  const rows = await query<{ name: string }>(
    `SELECT DISTINCT name FROM sets ORDER BY release_date, name`,
  )
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
