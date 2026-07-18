// Crypt search query builder. Phase 1 MVP covers text/name search, clan, and
// group — the remaining vdb filter families (sect, title, capacity range,
// traits, set/precon/artist — see docs/feature-parity.md) land incrementally
// behind this same query() seam.

import { query } from './db'

export interface CryptFilters {
  text: string
  clan: string | null
  group: number | null
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
  const rows = await query<CryptRow>(
    `SELECT c.id, c.name, c.clan, c.capacity, c.grp, c.title,
            GROUP_CONCAT(cd.discipline || ':' || cd.superior) AS disc
     FROM cards c
     LEFT JOIN card_disciplines cd ON cd.card_id = c.id
     WHERE c.kind = 'crypt'
       AND (?1 = '' OR c.name_ascii LIKE '%' || ?1 || '%' OR c.card_text LIKE '%' || ?1 || '%')
       AND (?2 IS NULL OR c.clan LIKE '%' || ?2 || '%')
       AND (?3 IS NULL OR c.grp = ?3)
     GROUP BY c.id
     ORDER BY c.capacity DESC, c.name ASC
     LIMIT 200`,
    [filters.text.trim(), filters.clan, filters.group],
  )
  return rows.map((r) => ({ ...r, disciplines: parseDisciplines(r.disc) }))
}

export async function listClans(): Promise<string[]> {
  const rows = await query<{ clan: string }>(
    `SELECT DISTINCT clan FROM cards WHERE kind = 'crypt' AND clan != '' ORDER BY clan`,
  )
  return rows.map((r) => r.clan)
}

export async function listGroups(): Promise<number[]> {
  const rows = await query<{ grp: number }>(
    `SELECT DISTINCT grp FROM cards WHERE kind = 'crypt' ORDER BY grp`,
  )
  return rows.map((r) => r.grp)
}
