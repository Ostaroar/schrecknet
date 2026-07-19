// Browser card-database access. The official SQLite WASM build runs in a
// dedicated worker (dbWorker.ts) with the opfs-sahpool VFS: the database
// persists in OPFS, so after the first visit searches work offline and
// reloads skip the ~900KB download (re-fetched only when the server's
// schema_version/data_version changes). This replaces the interim sql.js
// engine — docs/adr/0004-sqljs-for-phase1-browser-search.md, follow-up
// section. Every call site goes through query(), which is the seam that
// made this swap a drop-in.

interface Pending {
  resolve: (value: never) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()
let openPromise: Promise<void> | null = null

function send<T>(msg: Record<string, unknown>): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject })
    worker!.postMessage({ ...msg, id })
  })
}

function ensureOpen(): Promise<void> {
  if (!openPromise) {
    worker = new Worker(new URL('./dbWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { id, ok, rows, meta, error } = event.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok) p.resolve((rows ?? meta) as never)
      else p.reject(new Error(error))
    }
    openPromise = send<Record<string, unknown>>({ kind: 'open' }).then((meta) => {
      console.info('[schrecknet] card db ready:', meta)
    })
  }
  return openPromise
}

/** Runs a parameterized SELECT in the worker and returns rows as objects. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  await ensureOpen()
  return send<T[]>({ kind: 'query', sql, params })
}

export interface CardMeta {
  schema_version: number
  data_version: number
  scope: string
  cards: number
  crypt: number
  library: number
  languages?: string[]
}

export async function getCardsMeta(): Promise<CardMeta> {
  const res = await fetch('/data/cards.meta.json')
  if (!res.ok) throw new Error(`failed to fetch cards.meta.json: ${res.status}`)
  return res.json()
}
