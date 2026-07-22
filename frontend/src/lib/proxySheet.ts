// Proxy print sheet data — one row per card in a deck plus its image URL,
// expanded to one entry per physical copy for printing. Deliberately not
// folded into deckStore.ts's DeckCardDetail (shared by DeckEditor/DeckDiff/
// SharedDeckPreview, none of which need image_url) — a small dedicated
// query keeps those call sites free of an unused column.

import { query as cardsQuery } from './db'
import { getDeckCardDetails } from './deckStore'
import { getInventoryQtyMap } from './inventoryStore'

export interface ProxyCard {
  id: number
  name: string
  qty: number
  imageUrl: string | null
}

/**
 * `onlyMissing` prints `max(0, deck qty − owned)` per card instead of the
 * full deck quantity — a simple owned-vs-wanted comparison for THIS deck,
 * deliberately not the pooled fixed/flexible claim math other decks might
 * contribute (`inventoryStore.computeDeckMissing`): most decks default to
 * `inventory_mode: 'excluded'`, where that pooled math would report 0 missing
 * regardless of what's owned, which isn't useful for "what do I still need to
 * print for this deck". See docs/inventory-plan.md § I4.
 */
export async function getProxyCards(deckId: number, onlyMissing = false): Promise<ProxyCard[]> {
  const cards = await getDeckCardDetails(deckId)
  if (cards.length === 0) return []
  const placeholders = cards.map((_, i) => `?${i + 1}`).join(',')
  const rows = await cardsQuery<{ id: number; image_url: string | null }>(
    `SELECT id, image_url FROM cards WHERE id IN (${placeholders})`,
    cards.map((c) => c.id),
  )
  const imageById = new Map(rows.map((r) => [r.id, r.image_url]))
  const ownedById = onlyMissing ? await getInventoryQtyMap(cards.map((c) => c.id)) : null
  return cards
    .map((c) => ({
      id: c.id,
      name: c.name,
      qty: ownedById ? Math.max(0, c.qty - (ownedById.get(c.id) ?? 0)) : c.qty,
      imageUrl: imageById.get(c.id) ?? null,
    }))
    .filter((c) => c.qty > 0)
}
