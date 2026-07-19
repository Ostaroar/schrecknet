// Loads the schrecknet-core WASM module once and re-exports its bindings.
// `frontend/src/wasm/` is a build artifact (gitignored) produced by
// `wasm-pack build core --target web --out-dir ../frontend/src/wasm` — run
// automatically in CI/Docker, and required once locally before `npm run dev`
// (see AGENTS.md commands).

import init, { validate_deck as validateDeckWasm } from '../wasm/schrecknet_core.js'

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
