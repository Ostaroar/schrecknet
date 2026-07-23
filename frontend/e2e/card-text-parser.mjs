import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import init, {
  card_type_symbol,
  discipline_symbol,
  parse_card_text,
} from '../src/wasm/schrecknet_core.js'

const wasm = await readFile(new URL('../src/wasm/schrecknet_core_bg.wasm', import.meta.url))
await init({ module_or_path: wasm })

const parseCardText = (text) => JSON.parse(parse_card_text(text))
const disciplineSymbol = (code, superior = false) =>
  JSON.parse(discipline_symbol(code, superior))
const cardTypeSymbol = (type) => JSON.parse(card_type_symbol(type))

const disciplines = [
  ['abo', 'Abombwe', 'abo'],
  ['ani', 'Animalism', 'ani'],
  ['aus', 'Auspex', 'aus'],
  ['cel', 'Celerity', 'cel'],
  ['chi', 'Chimerstry', 'chi'],
  ['dem', 'Dementation', 'dem'],
  ['dom', 'Dominate', 'dom'],
  ['for', 'Fortitude', 'for'],
  ['nec', 'Necromancy', 'nec'],
  ['obf', 'Obfuscate', 'obf'],
  ['obl', 'Oblivion', 'obl'],
  ['obt', 'Obtenebration', 'obt'],
  ['pot', 'Potence', 'pot'],
  ['pre', 'Presence', 'pre'],
  ['pro', 'Protean', 'pro'],
  ['ser', 'Serpentis', 'ser'],
  ['tha', 'Blood Sorcery', 'tha'],
  ['vic', 'Vicissitude', 'vic'],
]

for (const [code, label, asset] of disciplines) {
  await readFile(new URL(`../public/images/disciplines/${asset}.svg`, import.meta.url))
  await readFile(new URL(`../public/images/disciplines/${asset}sup.svg`, import.meta.url))
  const basic = parseCardText(`[${code}]`)
  assert.deepEqual(basic, [
    { kind: 'discipline', token: code, code, label, asset, superior: false },
  ])
  assert.deepEqual(disciplineSymbol(code), basic[0])

  const superior = parseCardText(`[${code.toUpperCase()}]`)
  assert.deepEqual(superior, [
    {
      kind: 'discipline',
      token: code.toUpperCase(),
      code,
      label,
      asset,
      superior: true,
    },
  ])
  assert.deepEqual(disciplineSymbol(code.toUpperCase(), true), superior[0])
}

const cardTypes = {
  ACTION: ['action', 'Action'],
  'ACTION MODIFIER': ['actionmodifier', 'Action Modifier'],
  ALLY: ['ally', 'Ally'],
  COMBAT: ['combat', 'Combat'],
  EQUIPMENT: ['equipment', 'Equipment'],
  EVENT: ['event', 'Event'],
  MASTER: ['master', 'Master'],
  'POLITICAL ACTION': ['politicalaction', 'Political Action'],
  REACTION: ['reaction', 'Reaction'],
  RETAINER: ['retainer', 'Retainer'],
}

for (const [token, [asset, label]] of Object.entries(cardTypes)) {
  await readFile(new URL(`../public/images/types/${asset}.svg`, import.meta.url))
  const expected = { kind: 'card-type', token, asset, label }
  assert.deepEqual(parseCardText(`[${token}]`), [expected])
  assert.deepEqual(cardTypeSymbol(label), expected)
}

assert.equal(disciplineSymbol('future'), null)
assert.equal(cardTypeSymbol('Future card type'), null)

assert.deepEqual(parseCardText('before [FUTURE TOKEN]\nafter <b>safe</b>'), [
  { kind: 'text', value: 'before ' },
  { kind: 'text', value: '[FUTURE TOKEN]' },
  { kind: 'text', value: '\nafter <b>safe</b>' },
])

console.log('card-text parser contract passed')
