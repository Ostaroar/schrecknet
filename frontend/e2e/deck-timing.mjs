// Contract test for the deck-wide "when can I play this?" distribution
// (frontend/src/lib/cardTiming.ts::getDeckTimingDistribution, added alongside
// the single-card CardTimingWindows.tsx view — docs/roadmap.md Phase 5).
//
// cardTiming.ts is deliberately pure TS with no wasm/network dependency, so it
// runs here via esbuild's transform (already a Vite devDependency, no new
// package) rather than needing a live browser.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await readFile(new URL('../src/lib/cardTiming.ts', import.meta.url), 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm' })
const module = await import(`data:text/javascript,${encodeURIComponent(code)}`)
const { getDeckTimingDistribution, getTimingWindowsForCard, describeHook } = module

function hook(id, label) {
  return { id, label, window: '', anchor: '', cardTypes: [] }
}

// Stands in for i18n.ts's `gameLoopHooks` section, which callers now supply —
// cardTiming.ts stays free of a direct i18n.ts import (see its doc comment).
const translations = {
  HK_MASTER: 'During your master phase, once per turn.',
  HK_CMB_STRIKE: 'During the strike step of a combat round.',
  HK_CMB_PRESS: 'During the press step, when continuing combat.',
  HK_REACT: 'In reaction to an action directed at you or your allies.',
}

const gameLoop = {
  version: '1',
  source: 'test',
  meta: { title: 't', players: 5 },
  regions: [],
  states: [],
  transitions: [],
  hooks: [
    hook('HK_MASTER', 'Master'),
    hook('HK_CMB_STRIKE', 'Combat strike'),
    hook('HK_CMB_PRESS', 'Combat press'),
    hook('HK_REACT', 'Reaction'),
  ],
  impulseOrders: [],
  drilldowns: [],
}

// A Combat card maps to two hooks (strike + press) but must count once per
// hook, not skip either — getTimingWindowsForCard already proves this; the
// deck-level test below proves quantities are summed correctly on top of it.
assert.deepEqual(
  getTimingWindowsForCard(gameLoop, ['Combat']).map((h) => h.id).sort(),
  ['HK_CMB_PRESS', 'HK_CMB_STRIKE'],
  'a Combat card should map to both combat hooks',
)

const cards = [
  { types: ['Master'], qty: 3 },
  { types: ['Combat'], qty: 2 }, // maps to HK_CMB_STRIKE and HK_CMB_PRESS
  { types: ['Reaction'], qty: 1 },
  { types: ['Ally'], qty: 4 }, // no hook mapping in this fixture -> ignored
]

const distribution = getDeckTimingDistribution(gameLoop, cards, translations)
const byLabel = Object.fromEntries(distribution.map((d) => [d.label, d.qty]))

assert.equal(byLabel[describeHook(hook('HK_MASTER', 'Master'), translations)], 3, 'Master count')
assert.equal(
  byLabel[describeHook(hook('HK_CMB_STRIKE', 'Combat strike'), translations)],
  2,
  'the 2 Combat copies must count once each toward the strike window, not double',
)
assert.equal(
  byLabel[describeHook(hook('HK_CMB_PRESS', 'Combat press'), translations)],
  2,
  'and once each toward the press window too (two distinct hooks, same card)',
)
assert.equal(byLabel[describeHook(hook('HK_REACT', 'Reaction'), translations)], 1, 'Reaction count')
// Master, Combat-strike, Combat-press, Reaction — Combat legitimately produces
// two entries (it has two distinct timing windows); Ally has none in this
// fixture and must not add a fifth.
assert.equal(Object.keys(byLabel).length, 4, 'Ally (no hook mapping) must not appear at all')

console.log(JSON.stringify({ distribution }, null, 2))
console.log('deck-timing distribution contract passed')
