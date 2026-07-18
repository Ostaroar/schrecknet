// ⌘K quick search: name-first match across crypt + library, ranked so
// prefix matches beat mid-word matches (vdb's quick search behaves likewise).

import { query } from './db'

export interface QuickHit {
  id: number
  name: string
  kind: 'crypt' | 'library'
  clan: string | null
  capacity: number | null
}

export async function quickSearch(text: string): Promise<QuickHit[]> {
  const q = text.trim()
  if (!q) return []
  const rows = await query<QuickHit & { clan: string }>(
    `SELECT id, name, kind, clan, capacity FROM cards
     WHERE name_ascii LIKE '%' || ?1 || '%' COLLATE NOCASE
     ORDER BY (name_ascii LIKE ?1 || '%' COLLATE NOCASE) DESC, name ASC
     LIMIT 20`,
    [q],
  )
  return rows.map((r) => ({ ...r, clan: r.clan || null }))
}
