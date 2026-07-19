// Crypt search query builder — mirrors server/src/cards_db.rs::search_crypt
// exactly (same filters, same dynamically-built EXISTS clauses per required
// discipline) so the browser and server agree. Remaining vdb filter families
// (sect, title, votes, traits, set/precon/artist — docs/feature-parity.md)
// land incrementally behind this same query() seam.

import { query } from './db'

/** Scope of the text filter: card name, card text, or either. */
export type TextMode = 'any' | 'name' | 'text'

export interface CryptFilters {
  text: string
  textMode: TextMode
  clan: string | null
  title: string | null
  group: number | null
  capacityMin: number | null
  capacityMax: number | null
  disciplines: string[]
  disciplinesSuperior: boolean
  set: string | null
  precon: string | null
  artist: string | null
}

export const emptyCryptFilters: CryptFilters = {
  text: '',
  textMode: 'any',
  clan: null,
  title: null,
  group: null,
  capacityMin: null,
  capacityMax: null,
  disciplines: [],
  disciplinesSuperior: false,
  set: null,
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
  let sql = `SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title,
            GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
     FROM cards c
     LEFT JOIN card_disciplines cd ON cd.card_id = c.id
     WHERE c.kind = 'crypt'
       AND (?1 = ''
            OR (?2 AND c.name_ascii LIKE '%' || ?1 || '%')
            OR (?3 AND c.card_text LIKE '%' || ?1 || '%'))
       AND (?4 IS NULL OR c.clan LIKE '%' || ?4 || '%')
       AND (?5 IS NULL OR c.grp = ?5)
       AND (?6 IS NULL OR c.capacity >= ?6)
       AND (?7 IS NULL OR c.capacity <= ?7)
       AND (?8 IS NULL OR c.title = ?8)
       AND (?9 IS NULL OR EXISTS (SELECT 1 FROM printings p JOIN sets s ON s.id = p.set_id
            WHERE p.card_id = c.id AND s.name = ?9))
       AND (?10 IS NULL OR EXISTS (SELECT 1 FROM printings p
            WHERE p.card_id = c.id AND p.precon LIKE '%' || ?10 || '%'))
       AND (?11 IS NULL OR EXISTS (SELECT 1 FROM card_artists ca JOIN artists a ON a.id = ca.artist_id
            WHERE ca.card_id = c.id AND a.name LIKE '%' || ?11 || '%'))`
  const params: (string | number | null)[] = [
    filters.text.trim(),
    filters.textMode !== 'text' ? 1 : 0,
    filters.textMode !== 'name' ? 1 : 0,
    filters.clan,
    filters.group,
    filters.capacityMin,
    filters.capacityMax,
    filters.title,
    filters.set,
    filters.precon,
    filters.artist,
  ]
  for (const code of filters.disciplines) {
    sql += ` AND EXISTS (SELECT 1 FROM card_disciplines cdx
       WHERE cdx.card_id = c.id AND cdx.discipline = ?${params.length + 1} AND cdx.superior >= ?${params.length + 2})`
    params.push(code.toLowerCase(), filters.disciplinesSuperior ? 1 : 0)
  }
  sql += ` GROUP BY c.id ORDER BY c.capacity DESC, c.name ASC LIMIT 200`

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
