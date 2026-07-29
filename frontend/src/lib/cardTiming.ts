import type { GameLoop, GameLoopHook } from './gameLoop'

/**
 * Card type -> game-loop hook ids that can legally fire it. Frontend-only, presentational
 * mapping (not a server capability, nothing to mirror through MCP/REST): distilled by hand
 * from V5 rules text since `gameloop.json`'s hooks don't yet carry `cardTypes` data from the
 * DOT source. Revisit here if the distiller starts populating `hook.cardTypes`.
 */
const CARD_TYPE_HOOK_IDS: Record<string, string[]> = {
  Master: ['HK_MASTER', 'HK_OOT'],
  Action: ['HK_ASANN'],
  'Action Modifier': ['HK_AMOD', 'HK_BLEED'],
  Reaction: ['HK_REACT'],
  Combat: ['HK_CMB_RANGE', 'HK_CMB_STRIKE', 'HK_CMB_PRESS', 'HK_CMB_END'],
  Equipment: ['HK_INPLAY'],
  Ally: ['HK_INPLAY'],
  Retainer: ['HK_INPLAY'],
  Event: ['HK_ASPLAYED'],
  'Political Action': ['HK_REF'],
  Power: ['HK_ASANN'],
  Conviction: ['HK_ASPLAYED'],
}

export function getTimingWindowsForCard(gameLoop: GameLoop, types: string[]): GameLoopHook[] {
  const hookIds = new Set(types.flatMap((type) => CARD_TYPE_HOOK_IDS[type] ?? []))
  return gameLoop.hooks.filter((hook) => hookIds.has(hook.id))
}

const HOOK_DESCRIPTIONS: Record<string, string> = {
  HK_UNLOCK: 'During the unlock phase.',
  HK_MASTER: 'During your master phase, once per turn.',
  HK_INFLUENCE: 'During your influence phase.',
  HK_DISCARD: 'During your discard phase.',
  HK_ASANN: 'As you announce an action.',
  HK_AMOD: 'After an action is declared, before it resolves.',
  HK_REACT: 'In reaction to an action directed at you or your allies.',
  HK_BLOCK: 'When declaring or contesting a block attempt.',
  HK_REF: 'While a referendum or vote is open.',
  HK_BLEED: 'Specifically while bleed damage is being determined.',
  HK_CMB_RANGE: 'At the start of a combat round, when range is set.',
  HK_CMB_STRIKE: 'During the strike step of a combat round.',
  HK_CMB_PRESS: 'During the press step, when continuing combat.',
  HK_CMB_END: 'As combat ends.',
  HK_OOT: "Out of turn, as though it were a master card during someone else's turn.",
  HK_INPLAY: 'Continuously, once in play.',
  HK_ASPLAYED: 'Immediately, as it is played.',
}

export function describeHook(hook: GameLoopHook): string {
  return HOOK_DESCRIPTIONS[hook.id] ?? hook.label.replace(/_/g, ' ').toLowerCase()
}

/**
 * Deck-wide version of `getTimingWindowsForCard`: buckets a whole library by
 * when its cards can be played, weighted by quantity. A card contributes to
 * each of its timing windows once per copy — never twice for the same card
 * even when two of its types map to the same hook (e.g. a Combat card with
 * both HK_CMB_STRIKE and HK_CMB_PRESS eligibility still counts once per
 * window, not once per matching type).
 */
export function getDeckTimingDistribution(
  gameLoop: GameLoop,
  cards: { types: string[]; qty: number }[],
): { label: string; qty: number }[] {
  const totals = new Map<string, number>()
  for (const card of cards) {
    const windows = getTimingWindowsForCard(gameLoop, card.types)
    const seen = new Set<string>()
    for (const hook of windows) {
      const label = describeHook(hook)
      if (seen.has(label)) continue
      seen.add(label)
      totals.set(label, (totals.get(label) ?? 0) + card.qty)
    }
  }
  return [...totals.entries()].map(([label, qty]) => ({ label, qty }))
}
