// Browser card-database access. Interim sql.js engine — see
// docs/adr/0004-sqljs-for-phase1-browser-search.md for why, and the planned
// swap to the official SQLite WASM build + OPFS. Every call site below goes
// through `query()`, which is the seam that swap happens behind.

import initSqlJs, { type Database } from 'sql.js'

let dbPromise: Promise<Database> | null = null

async function loadDb(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: (file) => `/${file}` })
  const res = await fetch('/data/cards.sqlite')
  if (!res.ok) throw new Error(`failed to fetch cards.sqlite: ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return new SQL.Database(buf)
}

/** Fetches + loads cards.sqlite on first call; reuses the same instance after. */
export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = loadDb()
  return dbPromise
}

export interface CardMeta {
  schema_version: number
  data_version: number
  scope: string
  cards: number
  crypt: number
  library: number
}

export async function getCardsMeta(): Promise<CardMeta> {
  const res = await fetch('/data/cards.meta.json')
  if (!res.ok) throw new Error(`failed to fetch cards.meta.json: ${res.status}`)
  return res.json()
}

/** Runs a parameterized SELECT and returns rows as plain objects. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  const db = await getDb()
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}
