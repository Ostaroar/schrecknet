// Proxy print sheet data — one row per card in a deck plus its image URL,
// expanded to one entry per physical copy for printing. Deliberately not
// folded into deckStore.ts's DeckCardDetail (shared by DeckEditor/DeckDiff/
// SharedDeckPreview, none of which need image_url) — a small dedicated
// query keeps those call sites free of an unused column.

import { query as cardsQuery } from './db'
import { getDeckCardDetails } from './deckStore'

export interface ProxyCard {
  id: number
  name: string
  qty: number
  imageUrl: string | null
}

export async function getProxyCards(deckId: number): Promise<ProxyCard[]> {
  const cards = await getDeckCardDetails(deckId)
  if (cards.length === 0) return []
  const placeholders = cards.map((_, i) => `?${i + 1}`).join(',')
  const rows = await cardsQuery<{ id: number; image_url: string | null }>(
    `SELECT id, image_url FROM cards WHERE id IN (${placeholders})`,
    cards.map((c) => c.id),
  )
  const imageById = new Map(rows.map((r) => [r.id, r.image_url]))
  return cards.map((c) => ({ id: c.id, name: c.name, qty: c.qty, imageUrl: imageById.get(c.id) ?? null }))
}
