// Browser adapter for the shared Rust/WASM opening-hand simulator.

import type { DeckCardDetail } from './deckStore'
import { drawOpeningHandIds, type DeckSection, type DrawSeed } from './core'

/** Maps the Rust-selected card ids back to the browser's display records. */
export async function drawHand(
  cards: DeckCardDetail[],
  section: DeckSection,
  seed?: DrawSeed,
): Promise<DeckCardDetail[]> {
  const byId = new Map(cards.map((card) => [card.id, card]))
  const result = await drawOpeningHandIds(
    cards.map((card) => [card.id, card.qty]),
    section,
    seed,
  )
  return result.cardIds.map((id) => {
    const card = byId.get(id)
    if (!card) throw new Error(`draw returned unknown card id ${id}`)
    return card
  })
}
