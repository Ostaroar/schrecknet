// Table seating randomizer. VTES tables seat 4-5 (up to 6) players in a
// turn order where each player's "prey" is their clockwise neighbor (whose
// pool they bleed) and "predator" is their counter-clockwise neighbor (who
// bleeds them) — docs/domain-vtes.md. A random seating is just a shuffle of
// turn order, so this is a generic algorithm (like the draw simulator), not
// VTES domain rules logic — plain Math.random, no core/ involvement needed.

export interface Seat {
  player: string
  predator: string
  prey: string
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Shuffles players into a random turn order and derives each seat's predator/prey. */
export function randomSeating(players: string[]): Seat[] {
  const order = shuffle(players)
  const n = order.length
  return order.map((player, i) => ({
    player,
    predator: order[(i - 1 + n) % n],
    prey: order[(i + 1) % n],
  }))
}
