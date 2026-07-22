// Loads the schrecknet-core WASM module once and re-exports its bindings.
// `frontend/src/wasm/` is a build artifact (gitignored) produced by
// `wasm-pack build core --target web --out-dir ../frontend/src/wasm` — run
// automatically in CI/Docker, and required once locally before `npm run dev`
// (see AGENTS.md commands).

import init, {
  validate_deck as validateDeckWasm,
  parse_card_text as parseCardTextWasm,
  discipline_symbol as disciplineSymbolWasm,
  card_type_symbol as cardTypeSymbolWasm,
  encode_deck_share as encodeDeckShareWasm,
  decode_deck_share as decodeDeckShareWasm,
  parse_deck_text as parseDeckTextWasm,
  format_deck_text as formatDeckTextWasm,
  compare_decks as compareDecksWasm,
  draw_opening_hand as drawOpeningHandWasm,
  plan_crypt_search as planCryptSearchWasm,
  plan_library_search as planLibrarySearchWasm,
  sort_crypt_cards as sortCryptCardsWasm,
  sort_library_cards as sortLibraryCardsWasm,
  capacity_stats as capacityStatsWasm,
  category_distribution as categoryDistributionWasm,
  rank_semantic_cards as rankSemanticCardsWasm,
  inventory_missing as inventoryMissingWasm,
} from '../wasm/schrecknet_core.js'

let ready: Promise<void> | null = null
let initialized = false

function ensureReady(): Promise<void> {
  if (!ready) {
    ready = init().then(() => {
      initialized = true
    })
  }
  return ready
}

/** Loads the mandatory shared Rust core before React renders. */
export function initializeCore(): Promise<void> {
  return ensureReady()
}

function requireInitialized(): void {
  if (!initialized) throw new Error('schrecknet-core was used before initialization')
}

/** Synchronous post-initialization bridge used by card-text rendering. */
export function parseCardTextSegments(input: string): unknown {
  requireInitialized()
  return JSON.parse(parseCardTextWasm(input))
}

/** Synchronous post-initialization bridge for discipline-symbol metadata. */
export function getDisciplineSymbol(code: string, superior: boolean): unknown {
  requireInitialized()
  return JSON.parse(disciplineSymbolWasm(code, superior))
}

/** Synchronous post-initialization bridge for card-type-symbol metadata. */
export function getCardTypeSymbol(cardType: string): unknown {
  requireInitialized()
  return JSON.parse(cardTypeSymbolWasm(cardType))
}

export type SqlParameter = string | number | null

export interface QueryPlan {
  sql: string
  params: SqlParameter[]
}

/** Builds crypt SQL and bound values in the shared Rust core. */
export async function planCryptSearch(input: unknown): Promise<QueryPlan> {
  await ensureReady()
  return JSON.parse(planCryptSearchWasm(JSON.stringify(input))) as QueryPlan
}

/** Builds library SQL and bound values in the shared Rust core. */
export async function planLibrarySearch(input: unknown): Promise<QueryPlan> {
  await ensureReady()
  return JSON.parse(planLibrarySearchWasm(JSON.stringify(input))) as QueryPlan
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

export type DeckSection = 'crypt' | 'library'
export type DrawSeed = readonly [high: number, low: number]

function randomDrawSeed(): DrawSeed {
  const words = crypto.getRandomValues(new Uint32Array(2))
  return [words[0], words[1]]
}

/** Draws a seeded opening hand in the shared Rust core and returns card ids in draw order. */
export async function drawOpeningHandIds(
  cards: CardQty[],
  section: DeckSection,
  seed: DrawSeed = randomDrawSeed(),
): Promise<{ cardIds: number[]; seed: DrawSeed }> {
  await ensureReady()
  const cardIds = drawOpeningHandWasm(
    new Uint32Array(cards.map(([id]) => id)),
    new Uint16Array(cards.map(([, quantity]) => quantity)),
    section,
    seed[0],
    seed[1],
  )
  return { cardIds: Array.from(cardIds), seed }
}

export type CryptSortMode = 'capacity_desc' | 'capacity_asc' | 'clan' | 'group' | 'name' | 'sect'

interface CryptSortable {
  id: number
  name: string
  clan: string
  capacity: number
  grp: number
  sect: string | null
}

function reorderByIds<T extends { id: number }>(cards: T[], orderedIds: Uint32Array): T[] {
  const byId = new Map(cards.map((card) => [card.id, card]))
  return Array.from(orderedIds, (id) => {
    const card = byId.get(id)
    if (!card) throw new Error(`sort returned unknown card id ${id}`)
    return card
  })
}

/** Applies the same Rust crypt ordering used by the native search service. */
export async function orderCryptCards<T extends CryptSortable>(
  cards: T[],
  mode: CryptSortMode,
  sortNames: ReadonlyMap<number, string> = new Map(),
): Promise<T[]> {
  await ensureReady()
  const orderedIds = sortCryptCardsWasm(
    new Uint32Array(cards.map((card) => card.id)),
    cards.map((card) => sortNames.get(card.id) ?? card.name),
    cards.map((card) => card.clan),
    new Int32Array(cards.map((card) => card.capacity)),
    new Int32Array(cards.map((card) => card.grp)),
    cards.map((card) => card.sect ?? ''),
    mode,
  )
  return reorderByIds(cards, orderedIds)
}

export type LibrarySortMode = 'requirement' | 'cost_desc' | 'cost_asc' | 'name' | 'type'

interface LibrarySortable {
  id: number
  name: string
  types: string[]
  clan: string | null
  disciplines: string[]
  blood_cost: string | null
  pool_cost: string | null
}

/** Applies the same Rust library ordering used by the native search service. */
export async function orderLibraryCards<T extends LibrarySortable>(
  cards: T[],
  mode: LibrarySortMode,
  sortNames: ReadonlyMap<number, string> = new Map(),
): Promise<T[]> {
  await ensureReady()
  const separator = '\u001f'
  const orderedIds = sortLibraryCardsWasm(
    new Uint32Array(cards.map((card) => card.id)),
    cards.map((card) => sortNames.get(card.id) ?? card.name),
    cards.map((card) => card.types.join(separator)),
    cards.map((card) => card.clan ?? ''),
    cards.map((card) => card.disciplines.join(separator)),
    cards.map((card) => card.blood_cost ?? ''),
    cards.map((card) => card.pool_cost ?? ''),
    mode,
  )
  return reorderByIds(cards, orderedIds)
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

/**
 * Missing copies for one card: `fixedQtys` sum (exclusive claims), `flexibleQtys`
 * take the max (shared pool), then subtract `owned`, floored at zero. Ported from
 * vdb's own algorithm — see core/src/inventory.rs and docs/inventory-plan.md § 1a.
 */
export async function computeMissingQty(fixedQtys: number[], flexibleQtys: number[], owned: number): Promise<number> {
  await ensureReady()
  return inventoryMissingWasm(new Uint16Array(fixedQtys), new Uint16Array(flexibleQtys), owned)
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

export interface SemanticRank {
  cardId: number
  score: number
}

/** Ranks raw little-endian SQLite embedding BLOBs in the shared Rust core. */
export async function rankSemanticCards(
  query: Float32Array,
  embeddingBytes: Uint8Array,
  cardIds: number[],
  names: string[],
  limit: number,
  minScore = -1,
): Promise<SemanticRank[]> {
  await ensureReady()
  const raw = rankSemanticCardsWasm(
    query,
    embeddingBytes,
    new Uint32Array(cardIds),
    names,
    limit,
    minScore,
  )
  if (!raw) return []
  return raw.split('\n').map((line) => {
    const [cardId, score] = line.split('\t')
    return { cardId: Number(cardId), score: Number(score) }
  })
}
