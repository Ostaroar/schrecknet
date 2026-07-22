// Local, writable user data (decks, inventory) — a separate OPFS database
// from cards.sqlite, owned by userDbWorker.ts. Same worker-per-DB pattern as
// db.ts; kept as a distinct file/worker/pool because this data is locally
// created and mutated, never fetched from the server.

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
    worker = new Worker(new URL('./userDbWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { id, ok, ...rest } = event.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok) p.resolve(rest as never)
      else p.reject(new Error(rest.error))
    }
    openPromise = send<Record<string, unknown>>({ kind: 'open' }).then(() => undefined)
  }
  return openPromise
}

/** Runs a parameterized SELECT and returns rows as plain objects. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  await ensureOpen()
  const { rows } = await send<{ rows: T[] }>({ kind: 'query', sql, params })
  return rows
}

/** Runs an INSERT/UPDATE/DELETE; returns the new rowid (for INSERT) and row count. */
export async function run(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<{ lastInsertRowid: number; changes: number }> {
  await ensureOpen()
  return send<{ lastInsertRowid: number; changes: number }>({ kind: 'run', sql, params })
}
