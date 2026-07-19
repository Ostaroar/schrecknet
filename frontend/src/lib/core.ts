// Loads the schrecknet-core WASM module once and re-exports its bindings.
// `frontend/src/wasm/` is a build artifact (gitignored) produced by
// `wasm-pack build core --target web --out-dir ../frontend/src/wasm` — run
// automatically in CI/Docker, and required once locally before `npm run dev`
// (see AGENTS.md commands).

import init, {
  validate_deck as validateDeckWasm,
  encode_deck_share as encodeDeckShareWasm,
  decode_deck_share as decodeDeckShareWasm,
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
