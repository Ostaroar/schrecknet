// Dedicated worker owning the SQLite database. Uses the official
// @sqlite.org/sqlite-wasm build with the **opfs-sahpool** VFS: persistent
// OPFS storage WITHOUT cross-origin isolation (no COOP/COEP headers), which
// matters because COEP would block the hotlinked KRCG card scans.
//
// Protocol (request/response paired by `id`):
//   in:  { id, kind: 'open' }                → { id, ok, meta? , error? }
//   in:  { id, kind: 'query', sql, params }  → { id, ok, rows?, error? }
//
// On open: compare the server's cards.meta.json (schema_version+data_version)
// with the version stamped in OPFS; on mismatch (or no local DB) fetch
// cards.sqlite once and import it into the pool. If the network is down but
// a local DB exists, serve it — that is the offline path.

import { initSqlite } from './sqlite'

type OpenMsg = { id: number; kind: 'open' }
type QueryMsg = { id: number; kind: 'query'; sql: string; params: (string | number | null)[] }
type InMsg = OpenMsg | QueryMsg

const DB_NAME = '/cards.sqlite'
const VERSION_KEY = 'schrecknet-cards-version'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

// Companion to server/src/cards_db.rs::register_regexp — same case-
// insensitive semantics (docs/adr/0005-regex-crate-for-search.md), but no
// new dependency: JS's native RegExp is a full regex engine already present
// in every browser. An invalid pattern throws, which sqlite-wasm turns into
// a normal query error for the caller, same as the server side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerRegexp(database: any) {
  database.createFunction({
    name: 'regexp_match',
    arity: 2,
    xFunc: (_ctx: unknown, pattern: string, text: string) => (new RegExp(pattern, 'i').test(text) ? 1 : 0),
  })
}

function versionOf(meta: { schema_version: number; data_version: number }): string {
  return `${meta.schema_version}.${meta.data_version}`
}

async function open(): Promise<Record<string, unknown>> {
  const sqlite3 = await initSqlite()
  const pool = await sqlite3.installOpfsSAHPoolVfs({})

  let serverMeta: { schema_version: number; data_version: number } | null = null
  try {
    const res = await fetch('/data/cards.meta.json', { cache: 'no-cache' })
    if (res.ok) serverMeta = await res.json()
  } catch {
    // offline — fall through to whatever OPFS has
  }

  const localVersion = (await getStoredVersion()) ?? 'none'
  const haveLocal = pool.getFileNames().includes(DB_NAME)
  const wantVersion = serverMeta ? versionOf(serverMeta) : null

  if (haveLocal && (wantVersion === null || wantVersion === localVersion)) {
    db = new pool.OpfsSAHPoolDb(DB_NAME)
    registerRegexp(db)
    return { source: 'opfs', version: localVersion }
  }

  if (serverMeta === null && !haveLocal) {
    throw new Error('offline and no local card database yet — connect once to download it')
  }

  const res = await fetch('/data/cards.sqlite')
  if (!res.ok) throw new Error(`failed to fetch cards.sqlite: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await pool.importDb(DB_NAME, bytes)
  await setStoredVersion(wantVersion ?? 'unknown')
  db = new pool.OpfsSAHPoolDb(DB_NAME)
  registerRegexp(db)
  return { source: 'network', version: wantVersion ?? 'unknown', bytes: bytes.length }
}

// The version stamp lives in its own tiny OPFS file (not localStorage —
// workers don't have it; not the pool — importDb replaces the whole file).
async function getStoredVersion(): Promise<string | null> {
  try {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle(VERSION_KEY)
    return (await (await handle.getFile()).text()) || null
  } catch {
    return null
  }
}

async function setStoredVersion(v: string): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const handle = await root.getFileHandle(VERSION_KEY, { create: true })
  const writable = await handle.createWritable()
  await writable.write(v)
  await writable.close()
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

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.kind === 'open') {
      const meta = await open()
      self.postMessage({ id: msg.id, ok: true, meta })
    } else {
      const rows = runQuery(msg.sql, msg.params)
      self.postMessage({ id: msg.id, ok: true, rows })
    }
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
