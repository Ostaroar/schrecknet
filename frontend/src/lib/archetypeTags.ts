// A little deckbuilder's fortune-telling: heuristic archetype detection over
// a deck's own composition (library type distribution, card_traits, crypt
// shape), producing flavorful named tags a Methuselah would recognize —
// "Stealth Bleed", "Big Stick Melee", "Vote Kingdom", "Swarm", "Star
// Vampire", "Fast Master". Presentational pattern-matching over existing
// data, not a V5 rule, so it lives here rather than in core/ (same
// reasoning as inventoryStore/limitedFormat). Feeds the existing free-text
// deck-tag system (deckStore.addTag) rather than inventing a second one.

import { query as cardsQuery } from './db'
import type { DeckCardDetail, DeckStats } from './deckStore'

export interface ArchetypeMatch {
  id: string
  label: string
  blurb: string
}

export const ARCHETYPE_OPTIONS = [
  { id: 'stealth-bleed', label: 'Stealth Bleed' },
  { id: 'big-stick', label: 'Big Stick Melee' },
  { id: 'vote-kingdom', label: 'Vote Kingdom' },
  { id: 'fast-master', label: 'Fast Master' },
  { id: 'swarm', label: 'Swarm' },
  { id: 'star-vampire', label: 'Star Vampire' },
] as const

export function archetypeLabel(id: string | null | undefined): string | null {
  return ARCHETYPE_OPTIONS.find((option) => option.id === id)?.label ?? null
}

const BLEED_TRAITS = new Set(['bleed', '1 bleed', '2 bleed'])
const STEALTH_TRAITS = new Set(['stealth', '1 stealth'])
const COMBAT_TRAITS = new Set(['strength', '1 strength', '2 strength', 'combat ends', 'additional strike', 'aggravated', 'maneuver'])
const VOTE_TRAITS = new Set(['votes-title'])

async function getTraitsByCard(cardIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>()
  if (cardIds.length === 0) return map
  const placeholders = cardIds.map((_, i) => `?${i + 1}`).join(',')
  const rows = await cardsQuery<{ card_id: number; trait: string }>(
    `SELECT card_id, trait FROM card_traits WHERE card_id IN (${placeholders})`,
    cardIds,
  )
  for (const row of rows) {
    const list = map.get(row.card_id) ?? []
    list.push(row.trait)
    map.set(row.card_id, list)
  }
  return map
}

function typeShare(stats: DeckStats, type: string): number {
  if (stats.libraryCount === 0) return 0
  const entry = stats.types.find((t) => t.label === type)
  return (entry?.count ?? 0) / stats.libraryCount
}

/** Detects named archetypes from a deck's own composition. Order is display order, not confidence. */
export async function detectArchetypes(cards: DeckCardDetail[], stats: DeckStats): Promise<ArchetypeMatch[]> {
  const libraryCards = cards.filter((c) => c.kind === 'library')
  const cryptCards = cards.filter((c) => c.kind === 'crypt')
  const traitsByCard = await getTraitsByCard(libraryCards.map((c) => c.id))

  let bleedWeight = 0
  let stealthWeight = 0
  let combatWeight = 0
  let voteWeight = 0
  for (const card of libraryCards) {
    const traits = traitsByCard.get(card.id) ?? []
    if (traits.some((t) => BLEED_TRAITS.has(t))) bleedWeight += card.qty
    if (traits.some((t) => STEALTH_TRAITS.has(t))) stealthWeight += card.qty
    if (traits.some((t) => COMBAT_TRAITS.has(t))) combatWeight += card.qty
    if (traits.some((t) => VOTE_TRAITS.has(t))) voteWeight += card.qty
  }

  const libraryCount = stats.libraryCount || 1
  const matches: ArchetypeMatch[] = []

  if (bleedWeight / libraryCount >= 0.12 && stealthWeight / libraryCount >= 0.06) {
    matches.push({
      id: 'stealth-bleed',
      label: 'Stealth Bleed',
      blurb: 'Slip past the crowd unseen and drain pool quietly, turn after turn.',
    })
  }

  if (combatWeight / libraryCount >= 0.15 || typeShare(stats, 'Combat') >= 0.15) {
    matches.push({
      id: 'big-stick',
      label: 'Big Stick Melee',
      blurb: 'Beat everything in the face until it stops moving.',
    })
  }

  if (typeShare(stats, 'Political Action') >= 0.06 || voteWeight / libraryCount >= 0.05) {
    matches.push({
      id: 'vote-kingdom',
      label: 'Vote Kingdom',
      blurb: 'Rule the table through referenda, not fangs.',
    })
  }

  if (typeShare(stats, 'Master') >= 0.22) {
    matches.push({
      id: 'fast-master',
      label: 'Fast Master',
      blurb: 'Pool is a resource to spend fast, not hoard — outbuild everyone early.',
    })
  }

  const distinctVampires = new Set(cryptCards.map((c) => c.id)).size
  const avgCapacity = stats.capacity?.average ?? 0
  if (distinctVampires >= 8 && avgCapacity > 0 && avgCapacity <= 6) {
    matches.push({
      id: 'swarm',
      label: 'Swarm',
      blurb: 'Many small vampires, overwhelming the table with sheer numbers.',
    })
  }

  const starVampire = cryptCards.find((c) => c.qty >= 3)
  if (starVampire) {
    matches.push({
      id: 'star-vampire',
      label: 'Star Vampire',
      blurb: `Everything supports one vampire — ${starVampire.name} is the whole plan.`,
    })
  }

  return matches
}
