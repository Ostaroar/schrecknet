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

/** Translated hook descriptions, keyed by hook id — sourced from i18n.ts's `gameLoopHooks` section by the caller. Kept as a plain parameter rather than an i18n.ts import so this module stays frontend-only/presentational per the doc comment above. */
export function describeHook(hook: GameLoopHook, translations: Record<string, string>): string {
  return translations[hook.id] ?? hook.label.replace(/_/g, ' ').toLowerCase()
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
  translations: Record<string, string>,
): { label: string; qty: number }[] {
  const totals = new Map<string, number>()
  for (const card of cards) {
    const windows = getTimingWindowsForCard(gameLoop, card.types)
    const seen = new Set<string>()
    for (const hook of windows) {
      const label = describeHook(hook, translations)
      if (seen.has(label)) continue
      seen.add(label)
      totals.set(label, (totals.get(label) ?? 0) + card.qty)
    }
  }
  return [...totals.entries()].map(([label, qty]) => ({ label, qty }))
}
