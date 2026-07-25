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
// with the version of the locally stored database; on mismatch (or no local
// DB) fetch cards.sqlite once and import it into the pool. If the network is
// down but a local DB exists, serve it — that is the offline path.
//
// The local version is read from the database's OWN `meta` table rather than
// from a separate stamp file, so the version and the bytes it describes are
// always the same artifact. An earlier design kept the stamp in its own OPFS
// file, which let the two disagree: a cached (stale) cards.sqlite could be
// imported while the *new* version number was stamped over it, after which
// every later load saw "versions match" and served stale cards forever. Only
// clearing site data escaped that — which also wipes the user's decks and
// inventory. Reading the version out of the database makes that state
// unrepresentable, and heals clients already stuck in it. See docs/adr/0015.

import { initSqlite } from './sqlite'
import { installExclusiveOpfsPool } from './opfsLease'

type OpenMsg = { id: number; kind: 'open' }
type QueryMsg = { id: number; kind: 'query'; sql: string; params: (string | number | null)[] }
type RefreshMsg = { id: number; kind: 'refresh' }
type InMsg = OpenMsg | QueryMsg | RefreshMsg

const DB_NAME = '/cards.sqlite'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null
// Held so `refresh` can unlink the cached database in place. Recreating the
// worker instead would deadlock: the OPFS pool lease is exclusive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any = null

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

// The database states its own version in the `meta` table the data pipeline
// writes (data/src/main.rs). Reading it back is what makes a stale-bytes /
// fresh-version-stamp mismatch impossible — see the module comment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versionOfDb(database: any): string | null {
  try {
    const schema = database.selectValue("SELECT value FROM meta WHERE key = 'schema_version'")
    const data = database.selectValue("SELECT value FROM meta WHERE key = 'data_version'")
    if (schema == null || data == null) return null
    return `${schema}.${data}`
  } catch {
    // No meta table at all: a truncated or pre-v2 download. Treat as unknown
    // so the caller re-fetches rather than trusting it.
    return null
  }
}

// The SAH pool owns exclusive OPFS access handles for the worker's lifetime.
// During a rapid reload Chromium may start the replacement worker before the
// old worker has released those handles. A Web Lock serializes worker
// generations without introducing an arbitrary startup delay. Terminating the
// old worker automatically releases its lock and lets the replacement proceed.
function installPool(
  sqlite3: Awaited<ReturnType<typeof initSqlite>>,
): Promise<Awaited<ReturnType<typeof sqlite3.installOpfsSAHPoolVfs>>> {
  return installExclusiveOpfsPool('schrecknet-card-db-opfs', () =>
    sqlite3.installOpfsSAHPoolVfs({}),
  )
}

async function open(): Promise<Record<string, unknown>> {
  const sqlite3 = await initSqlite()
  pool = await installPool(sqlite3)

  let serverMeta: { schema_version: number; data_version: number } | null = null
  try {
    const res = await fetch('/data/cards.meta.json', { cache: 'no-cache' })
    if (res.ok) serverMeta = await res.json()
    // A non-ok status used to fall through silently and serve stale cards with
    // no trace. Still degrade to the local copy, but say so.
    else console.warn(`cards.meta.json responded ${res.status}; using local card data`)
  } catch {
    // offline — fall through to whatever OPFS has
  }

  const wantVersion = serverMeta ? versionOf(serverMeta) : null
  const haveLocal = pool.getFileNames().includes(DB_NAME)

  if (haveLocal) {
    const local = new pool.OpfsSAHPoolDb(DB_NAME)
    const localVersion = versionOfDb(local)
    // Offline (wantVersion null) keeps whatever we have, even if unreadable —
    // it is still the user's only card data.
    if (wantVersion === null || (localVersion !== null && localVersion === wantVersion)) {
      db = local
      registerRegexp(db)
      return { source: 'opfs', version: localVersion ?? 'unknown' }
    }
    // Stale or unreadable: close before importDb replaces the file underneath.
    local.close()
  }

  if (serverMeta === null && !haveLocal) {
    throw new Error('offline and no local card database yet — connect once to download it')
  }

  // `cache: 'reload'` bypasses the HTTP cache for this request regardless of
  // what the server said about caching, so a stale intermediary can never be
  // what we import.
  const res = await fetch('/data/cards.sqlite', { cache: 'reload' })
  if (!res.ok) throw new Error(`failed to fetch cards.sqlite: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await pool.importDb(DB_NAME, bytes)
  db = new pool.OpfsSAHPoolDb(DB_NAME)

  // Trust the bytes, not the fetch: confirm the database we just stored really
  // is the version the server advertised, rather than persisting that claim
  // unverified the way the old version-stamp file did.
  const storedVersion = versionOfDb(db)
  if (wantVersion !== null && storedVersion !== wantVersion) {
    db.close()
    db = null
    throw new Error(
      `downloaded card database reports version ${storedVersion ?? 'unknown'}, expected ${wantVersion} — refusing to use it`,
    )
  }

  registerRegexp(db)
  return { source: 'network', version: storedVersion ?? 'unknown', bytes: bytes.length }
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

// Throws away the cached card database and downloads it again. Only ever
// touches DB_NAME — user.sqlite lives in a different pool owned by
// userDbWorker.ts, and losing it is precisely the harm this escape hatch
// exists to prevent (docs/adr/0015).
async function refresh(): Promise<Record<string, unknown>> {
  if (!pool) return open()
  if (db) {
    db.close()
    db = null
  }
  pool.unlink(DB_NAME)
  return open()
}

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.kind === 'open') {
      const meta = await open()
      self.postMessage({ id: msg.id, ok: true, meta })
    } else if (msg.kind === 'refresh') {
      const meta = await refresh()
      self.postMessage({ id: msg.id, ok: true, meta })
    } else {
      const rows = runQuery(msg.sql, msg.params)
      self.postMessage({ id: msg.id, ok: true, rows })
    }
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
