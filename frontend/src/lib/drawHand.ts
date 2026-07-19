// Opening-hand draw simulator. Pure shuffle-and-take over the deck's actual
// card list (respecting quantities) — not VTES rules logic (there's no legal/
// illegal outcome to a random draw), so this stays in the frontend rather
// than core/ (AGENTS.md hard rule #1 is about domain *rules*, not generic
// algorithms). Uses Math.random: fine for "show me a plausible test hand",
// no need for crypto-grade or seeded randomness here.

import type { DeckCardDetail } from './deckStore'

export const CRYPT_HAND_SIZE = 4
export const LIBRARY_HAND_SIZE = 7

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Expands qty>1 cards into individual entries, then draws `size` at random (without replacement). */
export function drawHand(cards: DeckCardDetail[], size: number): DeckCardDetail[] {
  const pool = cards.flatMap((c) => Array<DeckCardDetail>(c.qty).fill(c))
  return shuffle(pool).slice(0, size)
}
