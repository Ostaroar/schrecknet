import { query } from './db'

export type CardKind = 'crypt' | 'library'

const labels: Record<string, string> = {
  '1 intercept': '+1 intercept',
  '1 stealth': '+1 stealth',
  '1 bleed': '+1 bleed',
  '2 bleed': '+2 bleed',
  '1 strength': '+1 strength',
  '2 strength': '+2 strength',
  maneuver: 'Maneuver',
  'additional strike': 'Additional Strike',
  aggravated: 'Aggravated',
  prevent: 'Prevent',
  press: 'Press',
  'enter combat': 'Enter Combat',
  unlock: 'Wake / Unlock',
  'black hand': 'Black Hand',
  seraph: 'Seraph',
  infernal: 'Infernal',
  'red list': 'Red List',
  flight: 'Flight',
  'hand size': 'Hand Size',
  advancement: 'Advancement',
  banned: 'Banned',
  intercept: '+Intercept / -Stealth',
  stealth: '+Stealth / -Intercept',
  bleed: '+Bleed',
  'votes-title': '+Votes / Title',
  strength: '+Strength',
  'block denial': 'Block Denial',
  dodge: 'Dodge',
  'combat ends': 'Combat Ends',
  'multi-type': 'Multi-Type',
  'multi-discipline': 'Multi-Discipline',
  embrace: 'Create Vampire',
  'put blood': 'Blood to Uncontrolled',
  'bounce bleed': 'Bounce Bleed',
  'reduce bleed': 'Reduce Bleed',
  burn: 'Burn Option',
  'no-requirements': 'No Requirement',
}

export function traitLabel(value: string): string {
  return labels[value] ?? value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export async function listCardTraits(kind: CardKind): Promise<string[]> {
  const rows = await query<{ trait: string }>(
    `SELECT DISTINCT ct.trait FROM card_traits ct
     JOIN cards c ON c.id = ct.card_id
     WHERE c.kind = ?1 ORDER BY ct.trait`,
    [kind],
  )
  return rows.map((row) => row.trait)
}

/** Adds VDB's AND-across-selected-traits semantics to a card query. */
export function appendTraitFilters(
  sql: string,
  params: Array<string | number | null>,
  traits: string[],
): string {
  for (const trait of traits) {
    params.push(trait)
    sql += ` AND EXISTS (SELECT 1 FROM card_traits ct
              WHERE ct.card_id = c.id AND ct.trait = ?${params.length})`
  }
  return sql
}
