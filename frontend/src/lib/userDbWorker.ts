// Dedicated worker owning the LOCAL, WRITABLE user database — decks and
// (later) inventory. Same opfs-sahpool VFS as dbWorker.ts (cards.sqlite),
// but a separate pool name so the two don't collide, and no network fetch:
// this database is created locally on first open and never downloaded.
//
// Protocol (request/response paired by `id`):
//   in:  { id, kind: 'open' }                        → { id, ok, error? }
//   in:  { id, kind: 'query', sql, params }           → { id, ok, rows?, error? }
//   in:  { id, kind: 'run', sql, params }             → { id, ok, lastInsertRowid?, changes?, error? }

import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

type OpenMsg = { id: number; kind: 'open' }
type QueryMsg = { id: number; kind: 'query'; sql: string; params: (string | number | null)[] }
type RunMsg = { id: number; kind: 'run'; sql: string; params: (string | number | null)[] }
type InMsg = OpenMsg | QueryMsg | RunMsg

const DB_NAME = '/user.sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS decks(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deck_cards(
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  PRIMARY KEY (deck_id, card_id)
);
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

async function open(): Promise<void> {
  const sqlite3 = await sqlite3InitModule()
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'schrecknet-user-pool' })
  db = new pool.OpfsSAHPoolDb(DB_NAME)
  db.exec(SCHEMA)
}

function runQuery(sql: string, params: (string | number | null)[]): Record<string, unknown>[] {
  if (!db) throw new Error('database not open')
  const rows: Record<string, unknown>[] = []
  const stmt = db.prepare(sql)
  try {
    if (params.length) stmt.bind(params)
    while (stmt.step()) rows.push(stmt.get({}))
  } finally {
    stmt.finalize()
  }
  return rows
}

function runMutation(
  sql: string,
  params: (string | number | null)[],
): { lastInsertRowid: number; changes: number } {
  if (!db) throw new Error('database not open')
  db.exec({ sql, bind: params })
  return {
    lastInsertRowid: db.selectValue('SELECT last_insert_rowid()') as number,
    changes: db.changes(),
  }
}

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.kind === 'open') {
      await open()
      self.postMessage({ id: msg.id, ok: true })
    } else if (msg.kind === 'query') {
      const rows = runQuery(msg.sql, msg.params)
      self.postMessage({ id: msg.id, ok: true, rows })
    } else {
      const result = runMutation(msg.sql, msg.params)
      self.postMessage({ id: msg.id, ok: true, ...result })
    }
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
