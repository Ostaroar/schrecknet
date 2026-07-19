// Offline browser semantic search. SQLite applies structured filters first,
// a dedicated worker embeds the English query, and shared Rust/WASM performs
// BLOB decoding plus deterministic cosine ranking.

import { rankSemanticCards } from './core'
import { filterCrypt, type CryptCard, type CryptFilters } from './cryptSearch'
import { query } from './db'
import { filterLibrary, type LibraryCard, type LibraryFilters } from './librarySearch'

const RESULT_LIMIT = 20
const MAX_QUERY_CHARS = 512
const TRANSFORMERS_CACHE = 'transformers-cache'

export type SemanticProgress = {
  phase: 'idle' | 'loading' | 'downloading' | 'ready' | 'error'
  file?: string
  loaded?: number
  total?: number
  percent?: number
  error?: string
}

export type SemanticResult<T> = T & {
  semanticScore: number
  semanticModelId: string
}

type WorkerMessage =
  | {
      id: number
      kind: 'progress'
      phase: 'loading' | 'downloading' | 'ready'
      file?: string
      loaded?: number
      total?: number
      percent?: number
    }
  | { id: number; kind: 'result'; embedding: Float32Array }
  | { id: number; kind: 'error'; error: string }

interface PendingEmbedding {
  resolve: (embedding: Float32Array) => void
  reject: (error: Error) => void
  onProgress?: (progress: SemanticProgress) => void
}

interface EmbeddingMetaRow {
  model_id: string
  dimensions: number
}

interface EmbeddingRow {
  card_id: number
  dimensions: number
  embedding: unknown
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, PendingEmbedding>()

function failWorker(message: string): void {
  for (const request of pending.values()) request.reject(new Error(message))
  pending.clear()
  worker?.terminate()
  worker = null
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./semanticWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    const request = pending.get(message.id)
    if (!request) return
    if (message.kind === 'progress') {
      request.onProgress?.({
        phase: message.phase,
        file: message.file,
        loaded: message.loaded,
        total: message.total,
        percent: message.percent,
      })
      return
    }
    pending.delete(message.id)
    if (message.kind === 'result') {
      request.onProgress?.({ phase: 'ready' })
      request.resolve(message.embedding)
    } else {
      request.onProgress?.({ phase: 'error', error: message.error })
      request.reject(new Error(message.error))
      // A fresh worker makes initialization failures retryable.
      worker?.terminate()
      worker = null
    }
  }
  worker.onerror = (event) => failWorker(event.message || 'semantic worker failed')
  return worker
}

function embedQuery(
  queryText: string,
  modelId: string,
  dimensions: number,
  onProgress?: (progress: SemanticProgress) => void,
): Promise<Float32Array> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress })
    ensureWorker().postMessage({
      id,
      kind: 'embed',
      query: queryText,
      modelId,
      dimensions,
    })
  })
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry))) {
    return new Uint8Array(value as number[])
  }
  throw new Error('card database returned an unsupported embedding BLOB')
}

async function embeddingContract(): Promise<EmbeddingMetaRow> {
  const rows = await query<EmbeddingMetaRow>(
    `SELECT model_id, dimensions FROM card_embeddings
     GROUP BY model_id, dimensions ORDER BY model_id`,
  )
  if (rows.length !== 1) {
    throw new Error(`expected one semantic embedding contract, found ${rows.length}`)
  }
  return rows[0]
}

async function rankCandidates<T extends { id: number; name: string }>(
  queryText: string,
  candidates: T[],
  onProgress?: (progress: SemanticProgress) => void,
): Promise<SemanticResult<T>[]> {
  const semanticQuery = queryText.trim()
  if (!semanticQuery) return []
  if ([...semanticQuery].length > MAX_QUERY_CHARS) {
    throw new Error(`semantic query must be at most ${MAX_QUERY_CHARS} characters`)
  }
  if (candidates.length === 0) return []

  const contract = await embeddingContract()
  const rows = await query<EmbeddingRow>(
    `SELECT card_id, dimensions, embedding FROM card_embeddings
     WHERE model_id = ?1 ORDER BY card_id`,
    [contract.model_id],
  )
  const candidateById = new Map(candidates.map((card) => [card.id, card]))
  const selected = rows.filter((row) => candidateById.has(row.card_id))
  if (selected.length !== candidates.length) {
    throw new Error(
      `${candidates.length} filtered cards but ${selected.length} matching semantic embeddings`,
    )
  }

  const bytesPerVector = contract.dimensions * Float32Array.BYTES_PER_ELEMENT
  const matrix = new Uint8Array(selected.length * bytesPerVector)
  const ids: number[] = []
  const names: string[] = []
  selected.forEach((row, index) => {
    if (row.dimensions !== contract.dimensions) {
      throw new Error(
        `card ${row.card_id} has ${row.dimensions} dimensions; expected ${contract.dimensions}`,
      )
    }
    const bytes = asBytes(row.embedding)
    if (bytes.length !== bytesPerVector) {
      throw new Error(
        `card ${row.card_id} embedding has ${bytes.length} bytes; expected ${bytesPerVector}`,
      )
    }
    const card = candidateById.get(row.card_id)
    if (!card) throw new Error(`embedding references unknown card ${row.card_id}`)
    matrix.set(bytes, index * bytesPerVector)
    ids.push(card.id)
    names.push(card.name)
  })

  const queryEmbedding = await embedQuery(
    semanticQuery,
    contract.model_id,
    contract.dimensions,
    onProgress,
  )
  const ranked = await rankSemanticCards(
    queryEmbedding,
    matrix,
    ids,
    names,
    RESULT_LIMIT,
  )
  return ranked.map((hit) => {
    const card = candidateById.get(hit.cardId)
    if (!card) throw new Error(`semantic ranker returned unknown card ${hit.cardId}`)
    return {
      ...card,
      semanticScore: hit.score,
      semanticModelId: contract.model_id,
    }
  })
}

export async function searchSemanticCrypt(
  queryText: string,
  filters: CryptFilters,
  onProgress?: (progress: SemanticProgress) => void,
): Promise<SemanticResult<CryptCard>[]> {
  const candidates = await filterCrypt({ ...filters, text: '', textRegex: false })
  return rankCandidates(queryText, candidates, onProgress)
}

export async function searchSemanticLibrary(
  queryText: string,
  filters: LibraryFilters,
  onProgress?: (progress: SemanticProgress) => void,
): Promise<SemanticResult<LibraryCard>[]> {
  const candidates = await filterLibrary({ ...filters, text: '', textRegex: false })
  return rankCandidates(queryText, candidates, onProgress)
}

/** Removes downloaded model/tokenizer responses; exact search is unaffected. */
export async function removeSemanticModel(): Promise<void> {
  failWorker('semantic model was removed')
  if ('caches' in globalThis) await caches.delete(TRANSFORMERS_CACHE)
}
