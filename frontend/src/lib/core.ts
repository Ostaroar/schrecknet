// Loads the schrecknet-core WASM module once and re-exports its bindings.
// `frontend/src/wasm/` is a build artifact (gitignored) produced by
// `wasm-pack build core --target web --out-dir ../frontend/src/wasm` — run
// automatically in CI/Docker, and required once locally before `npm run dev`
// (see AGENTS.md commands).

import init, {
  validate_deck as validateDeckWasm,
  encode_deck_share as encodeDeckShareWasm,
  decode_deck_share as decodeDeckShareWasm,
  parse_deck_text as parseDeckTextWasm,
  format_deck_text as formatDeckTextWasm,
  compare_decks as compareDecksWasm,
  capacity_stats as capacityStatsWasm,
  category_distribution as categoryDistributionWasm,
} from '../wasm/schrecknet_core.js'

let ready: Promise<void> | null = null

function ensureReady(): Promise<void> {
  if (!ready) ready = init().then(() => undefined)
  return ready
}

/** Deck-construction violations as human-readable strings (empty = legal). */
export async function validateDeck(
  groups: number[],
  cryptCount: number,
  libraryCount: number,
): Promise<string[]> {
  await ensureReady()
  return validateDeckWasm(new Uint8Array(groups), cryptCount, libraryCount)
}

export type CardQty = [id: number, qty: number]

/** Encodes a deck's crypt+library card lists into a compact, URL-safe token. */
export async function encodeDeckShare(crypt: CardQty[], library: CardQty[]): Promise<string> {
  await ensureReady()
  return encodeDeckShareWasm(
    new Uint32Array(crypt.map(([id]) => id)),
    new Uint16Array(crypt.map(([, qty]) => qty)),
    new Uint32Array(library.map(([id]) => id)),
    new Uint16Array(library.map(([, qty]) => qty)),
  )
}

function parseSection(s: string): CardQty[] {
  if (!s) return []
  return s.split(',').map((entry) => {
    const [id, qty] = entry.split(':').map(Number)
    return [id, qty]
  })
}

/** Decodes a share token back into crypt/library (card_id, qty) lists. Throws on a malformed token. */
export async function decodeDeckShare(token: string): Promise<{ crypt: CardQty[]; library: CardQty[] }> {
  await ensureReady()
  const plain = decodeDeckShareWasm(token)
  const [cryptPart, libraryPart] = plain.split('|')
  return { crypt: parseSection(cryptPart), library: parseSection(libraryPart) }
}

export interface NamedQty {
  name: string
  qty: number
}

/** Parses a plain-text deck list ("<qty>x <name>" per line) into (name, qty) pairs, in file order. */
export async function parseDeckText(text: string): Promise<NamedQty[]> {
  await ensureReady()
  const raw = parseDeckTextWasm(text)
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [qty, ...rest] = line.split('\t')
    return { name: rest.join('\t'), qty: Number(qty) }
  })
}

/** Formats resolved crypt/library (name, qty) pairs as a plain-text deck list. */
export async function formatDeckText(crypt: NamedQty[], library: NamedQty[]): Promise<string> {
  await ensureReady()
  return formatDeckTextWasm(
    crypt.map((c) => c.name),
    new Uint16Array(crypt.map((c) => c.qty)),
    library.map((c) => c.name),
    new Uint16Array(library.map((c) => c.qty)),
  )
}

export type DiffChange = 'only_a' | 'only_b' | 'changed' | 'same'

export interface CardQtyDiff {
  cardId: number
  qtyA: number
  qtyB: number
  change: DiffChange
}

/** Compares card quantities using the shared Rust domain core. */
export async function compareCardQtys(a: CardQty[], b: CardQty[]): Promise<CardQtyDiff[]> {
  await ensureReady()
  const raw = compareDecksWasm(
    new Uint32Array(a.map(([id]) => id)),
    new Uint16Array(a.map(([, qty]) => qty)),
    new Uint32Array(b.map(([id]) => id)),
    new Uint16Array(b.map(([, qty]) => qty)),
  )
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [cardId, qtyA, qtyB, change] = line.split('\t')
    return { cardId: Number(cardId), qtyA: Number(qtyA), qtyB: Number(qtyB), change: change as DiffChange }
  })
}

export interface CapacityStats {
  count: number
  min: number
  max: number
  average: number
}

export interface WeightedEntry {
  label: string
  qty: number
}

export interface DistributionEntry {
  label: string
  count: number
}

export async function computeCapacityStats(entries: { capacity: number; qty: number }[]): Promise<CapacityStats | null> {
  await ensureReady()
  const raw = capacityStatsWasm(
    new Uint8Array(entries.map((entry) => entry.capacity)),
    new Uint16Array(entries.map((entry) => entry.qty)),
  )
  if (!raw) return null
  const [count, min, max, averageHundredths] = raw.split('\t').map(Number)
  return { count, min, max, average: averageHundredths / 100 }
}

export async function computeDistribution(entries: WeightedEntry[]): Promise<DistributionEntry[]> {
  await ensureReady()
  const raw = categoryDistributionWasm(
    entries.map((entry) => entry.label),
    new Uint16Array(entries.map((entry) => entry.qty)),
  )
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [label, count] = line.split('\t')
    return { label, count: Number(count) }
  })
}
