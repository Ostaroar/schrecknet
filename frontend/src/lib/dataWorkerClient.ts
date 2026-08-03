// One shared Worker for both local databases (see dataWorker.ts for why they
// share a process). db.ts and userDb.ts each tag their messages with a
// `target` and get back whatever fields that target's handler replied with.

interface Pending {
  resolve: (value: never) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./dataWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event) => {
    const { id, ok, ...rest } = event.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (ok) p.resolve(rest as never)
    else p.reject(new Error(rest.error))
  }
  return worker
}

/** Sends one request to the shared worker; resolves with everything the reply carried besides `id`/`ok`. */
export function send<T>(target: 'cards' | 'user', msg: Record<string, unknown>): Promise<T> {
  const id = nextId++
  const w = ensureWorker()
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject })
    w.postMessage({ ...msg, target, id })
  })
}
