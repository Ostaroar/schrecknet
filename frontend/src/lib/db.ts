// Browser card-database access. The official SQLite WASM build runs in the
// shared data worker (dataWorker.ts) with the opfs-sahpool VFS: the database
// persists in OPFS, so after the first visit searches work offline and
// reloads skip the ~900KB download (re-fetched only when the server's
// schema_version/data_version changes). This replaces the interim sql.js
// engine — docs/adr/0004-sqljs-for-phase1-browser-search.md, follow-up
// section. Every call site goes through query(), which is the seam that
// made this swap a drop-in.

import { send } from './dataWorkerClient'

let openPromise: Promise<void> | null = null
let loadedVersion: string | null = null

/** Version of the card database currently open, once known. */
export function cardDbVersion(): string | null {
  return loadedVersion
}

function ensureOpen(): Promise<void> {
  if (!openPromise) {
    openPromise = send<{ meta: Record<string, unknown> }>('cards', { kind: 'open' }).then(
      ({ meta }) => {
        loadedVersion = typeof meta?.version === 'string' ? meta.version : null
        console.info('[schrecknet] card db ready:', meta)
      },
    )
  }
  return openPromise
}

/**
 * Discards the cached card database and downloads it again.
 *
 * The user-facing escape hatch that exists so nobody ever reaches for "clear
 * site data" to fix stale cards again — that wipes decks and inventory too
 * (docs/adr/0015). Only ever touches cards.sqlite; user.sqlite is a separate
 * database in the same worker process but its own OPFS pool (dataWorker.ts).
 */
export async function refreshCardDb(): Promise<void> {
  await ensureOpen()
  // The worker discards and reopens in place. Deliberately NOT by recreating
  // the worker: the OPFS pool lease is exclusive, so a second worker would
  // block on the first one's handles instead of taking over.
  const { meta } = await send<{ meta: Record<string, unknown> }>('cards', { kind: 'refresh' })
  loadedVersion = typeof meta?.version === 'string' ? meta.version : null
  console.info('[schrecknet] card db refreshed:', meta)
}

/** Runs a parameterized SELECT in the worker and returns rows as objects. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  await ensureOpen()
  const { rows } = await send<{ rows: T[] }>('cards', { kind: 'query', sql, params })
  return rows
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
  // Always revalidate: this file is the version oracle for the card database,
  // so a cached copy defeats the point of asking (see dataWorker.ts).
  const res = await fetch('/data/cards.meta.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`failed to fetch cards.meta.json: ${res.status}`)
  return res.json()
}
