import assert from 'node:assert/strict'
import { cardTypeSymbol, disciplineSymbol, parseCardText } from '../src/lib/cardText.ts'

const disciplines = [
  ['ani', 'Animalism', 'animalism'],
  ['aus', 'Auspex', 'auspex'],
  ['cel', 'Celerity', 'celerity'],
  ['dom', 'Dominate', 'dominate'],
  ['for', 'Fortitude', 'fortitude'],
  ['obf', 'Obfuscate', 'obfuscate'],
  ['obl', 'Oblivion', 'oblivion'],
  ['pot', 'Potence', 'potence'],
  ['pre', 'Presence', 'presence'],
  ['pro', 'Protean', 'protean'],
  ['tha', 'Blood Sorcery', 'bloodsorcery'],
]

for (const [code, label, asset] of disciplines) {
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
  COMBAT: ['combat', 'Combat'],
  'POLITICAL ACTION': ['politicalaction', 'Political Action'],
  REACTION: ['reaction', 'Reaction'],
}

for (const [token, [asset, label]] of Object.entries(cardTypes)) {
  const expected = { kind: 'card-type', token, asset, label }
  assert.deepEqual(parseCardText(`[${token}]`), [expected])
  assert.deepEqual(cardTypeSymbol(label), expected)
}

assert.equal(disciplineSymbol('future'), null)
assert.equal(cardTypeSymbol('Master'), null)

assert.deepEqual(parseCardText('before [FUTURE TOKEN]\nafter <b>safe</b>'), [
  { kind: 'text', value: 'before ' },
  { kind: 'text', value: '[FUTURE TOKEN]' },
  { kind: 'text', value: '\nafter <b>safe</b>' },
])

console.log('card-text parser contract passed')
