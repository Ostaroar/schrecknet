import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import init, { organize_deck } from '../src/wasm/schrecknet_core.js'

const wasm = await readFile(new URL('../src/wasm/schrecknet_core_bg.wasm', import.meta.url))
await init({ module_or_path: wasm })

const cards = {
  crypt: [
    { id: 3, name: 'Zulu', clan: 'Ventrue', capacity: 5, group: 7, qty: 4 },
    { id: 2, name: 'alpha', clan: 'Banu Haqim', capacity: 5, group: 6, qty: 1 },
    { id: 1, name: 'Alpha', clan: 'Ventrue', capacity: 6, group: 6, qty: 2 },
  ],
  library: [
    { id: 10, types: ['Combat'], qty: 3 },
    { id: 11, types: ['Master'], qty: 2 },
    { id: 12, types: ['Combat'], qty: 4 },
    { id: 13, types: [], qty: 1 },
  ],
}

const organize = (sort) => JSON.parse(organize_deck(JSON.stringify(cards), sort))

assert.deepEqual(organize('capacity').crypt_ids, [1, 2, 3])
assert.deepEqual(organize('clan').crypt_ids, [2, 1, 3])
assert.deepEqual(organize('group').crypt_ids, [1, 2, 3])
assert.deepEqual(organize('name').crypt_ids, [1, 2, 3])
assert.deepEqual(organize('quantity').crypt_ids, [3, 1, 2])
assert.deepEqual(organize('capacity').library_groups, [
  { card_type: 'Master', card_ids: [11], quantity: 2 },
  { card_type: 'Combat', card_ids: [10, 12], quantity: 7 },
  { card_type: 'Other', card_ids: [13], quantity: 1 },
])

assert.throws(() => organize('future'), /unknown deck crypt sort mode/)

console.log('deck-organization WASM contract passed')
