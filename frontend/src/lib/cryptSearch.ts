// Crypt search query builder — mirrors server/src/cards_db.rs::search_crypt
// exactly (same filters, same dynamically-built EXISTS clauses per required
// discipline) so the browser and server agree. Remaining vdb filter families
// (sect, votes, traits — docs/feature-parity.md) land incrementally behind
// this same query() seam.

import { query } from './db'
import {
  appendDisciplineFilters,
  type DisciplineRequirement,
} from './disciplineFilter'
import { defaultSetAge, defaultSetPrint, type SetAgeMode, type SetPrintMode } from './setFilter'

/** Scope of the text filter: card name, card text, or either. */
export type TextMode = 'any' | 'name' | 'text'

export interface CryptFilters {
  text: string
  textMode: TextMode
  textRegex: boolean
  clan: string | null
  title: string | null
  group: number | null
  groups: number[]
  capacityMin: number | null
  capacityMax: number | null
  disciplines: string[]
  disciplinesSuperior: boolean
  disciplineRequirements: DisciplineRequirement[]
  disciplineOr: DisciplineRequirement[][]
  set: string | null
  setAge: SetAgeMode
  setPrint: SetPrintMode
  precon: string | null
  artist: string | null
}

export const emptyCryptFilters: CryptFilters = {
  text: '',
  textMode: 'any',
  textRegex: false,
  clan: null,
  title: null,
  group: null,
  groups: [],
  capacityMin: null,
  capacityMax: null,
  disciplines: [],
  disciplinesSuperior: false,
  disciplineRequirements: [],
  disciplineOr: [],
  set: null,
  setAge: defaultSetAge,
  setPrint: defaultSetPrint,
  precon: null,
  artist: null,
}

export interface Discipline {
  code: string
  superior: boolean
}

export interface CryptCard {
  id: number
  name: string
  clan: string
  capacity: number
  grp: number
  title: string | null
  disciplines: Discipline[]
}

interface CryptRow {
  id: number
  name: string
  clan: string
  capacity: number
  grp: number
  title: string | null
  disc: string | null
}

function parseDisciplines(disc: string | null): Discipline[] {
  if (!disc) return []
  return disc
    .split(',')
    .filter(Boolean)
    .map((entry) => {
      const [code, superior] = entry.split(':')
      return { code, superior: superior === '1' }
    })
    .sort((a, b) => Number(b.superior) - Number(a.superior))
}

export async function searchCrypt(filters: CryptFilters): Promise<CryptCard[]> {
  return searchCryptInner(filters, true)
}

/** Applies every structured crypt filter without the 200-row UI cap. */
export async function filterCrypt(filters: CryptFilters): Promise<CryptCard[]> {
  return searchCryptInner(filters, false)
}

async function searchCryptInner(filters: CryptFilters, limited: boolean): Promise<CryptCard[]> {
  const singleGroup = filters.groups.length === 0 ? filters.group : null
  let sql = `SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title,
            GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
     FROM cards c
     LEFT JOIN card_disciplines cd ON cd.card_id = c.id
     WHERE c.kind = 'crypt'
       AND (?1 = ''
            OR (?2 AND (CASE WHEN ?12 THEN regexp_match(?1, c.name_ascii)
                             ELSE c.name_ascii LIKE '%' || ?1 || '%' END))
            OR (?3 AND (CASE WHEN ?12 THEN regexp_match(?1, c.card_text)
                             ELSE c.card_text LIKE '%' || ?1 || '%' END)))
       AND (?4 IS NULL OR c.clan LIKE '%' || ?4 || '%')
       AND (?5 IS NULL OR c.grp = ?5)
       AND (?6 IS NULL OR c.capacity >= ?6)
       AND (?7 IS NULL OR c.capacity <= ?7)
       AND (?8 IS NULL OR c.title = ?8)
       AND ((?9 IS NULL AND ?10 IS NULL) OR EXISTS (
            SELECT 1 FROM printings p JOIN sets s ON s.id = p.set_id
            WHERE p.card_id = c.id
              AND (?10 IS NULL OR p.precon LIKE '%' || ?10 || '%')
              AND (?9 IS NULL
                OR (?13 = 'exact' AND s.name = ?9)
                OR (?13 = 'or_newer' AND s.release_date >=
                    (SELECT release_date FROM sets WHERE name = ?9))
                OR (?13 = 'or_older' AND s.release_date <=
                    (SELECT release_date FROM sets WHERE name = ?9))
                OR (?13 = 'not_newer' AND NOT EXISTS (
                    SELECT 1 FROM printings pn JOIN sets sn ON sn.id = pn.set_id
                    WHERE pn.card_id = c.id AND sn.release_date >
                        (SELECT release_date FROM sets WHERE name = ?9)))
                OR (?13 = 'not_older' AND NOT EXISTS (
                    SELECT 1 FROM printings po JOIN sets so ON so.id = po.set_id
                    WHERE po.card_id = c.id AND so.release_date <
                        (SELECT release_date FROM sets WHERE name = ?9))))
              AND (?9 IS NULL OR ?14 = 'any'
                OR (?14 = 'only' AND 1 = (
                    SELECT COUNT(DISTINCT px.set_id) FROM printings px
                    WHERE px.card_id = c.id))
                OR (?14 = 'first' AND
                    (SELECT release_date FROM sets WHERE name = ?9) = (
                        SELECT MIN(sf.release_date) FROM printings pf
                        JOIN sets sf ON sf.id = pf.set_id WHERE pf.card_id = c.id))
                OR (?14 = 'reprint' AND
                    (SELECT release_date FROM sets WHERE name = ?9) > (
                        SELECT MIN(sr.release_date) FROM printings pr
                        JOIN sets sr ON sr.id = pr.set_id WHERE pr.card_id = c.id)))))
       AND (?11 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
            WHERE ca.card_id = c.id AND a.name LIKE '%' || ?11 || '%'))`
  const params: (string | number | null)[] = [
    filters.text.trim(),
    filters.textMode !== 'text' ? 1 : 0,
    filters.textMode !== 'name' ? 1 : 0,
    filters.clan,
    singleGroup,
    filters.capacityMin,
    filters.capacityMax,
    filters.title,
    filters.set,
    filters.precon,
    filters.artist,
    filters.textRegex ? 1 : 0,
    filters.setAge,
    filters.setPrint,
  ]
  if (filters.groups.length > 0) {
    const placeholders: string[] = []
    for (const group of filters.groups) {
      placeholders.push(`?${params.length + 1}`)
      params.push(group)
    }
    sql += ` AND c.grp IN (${placeholders.join(',')})`
  }
  sql = appendDisciplineFilters(
    sql,
    params,
    filters.disciplineRequirements,
    filters.disciplines,
    filters.disciplinesSuperior,
    filters.disciplineOr,
  )
  sql += ` GROUP BY c.id ORDER BY c.capacity DESC, c.name ASC`
  if (limited) sql += ` LIMIT 200`

  const rows = await query<CryptRow>(sql, params)
  return rows.map((r) => ({ ...r, disciplines: parseDisciplines(r.disc) }))
}

export async function listClans(): Promise<string[]> {
  const rows = await query<{ clan: string }>(
    `SELECT DISTINCT clan FROM cards WHERE kind = 'crypt' AND clan != '' ORDER BY clan`,
  )
  return rows.map((r) => r.clan)
}

export async function listTitles(): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `SELECT DISTINCT title FROM cards WHERE kind = 'crypt' AND title IS NOT NULL ORDER BY title`,
  )
  return rows.map((r) => r.title)
}

export async function listGroups(): Promise<number[]> {
  const rows = await query<{ grp: number }>(
    `SELECT DISTINCT grp FROM cards WHERE kind = 'crypt' ORDER BY grp`,
  )
  return rows.map((r) => r.grp)
}

export async function listCryptDisciplines(): Promise<string[]> {
  const rows = await query<{ discipline: string }>(
    `SELECT DISTINCT cd.discipline FROM card_disciplines cd
     JOIN cards c ON c.id = cd.card_id WHERE c.kind = 'crypt' ORDER BY cd.discipline`,
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
