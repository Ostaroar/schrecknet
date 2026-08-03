// Single worker owning BOTH local SQLite databases — the read-only card
// database (cards.sqlite, downloaded from the server) and the read-write user
// database (decks/inventory, created locally, never fetched). Merged from what
// used to be two separate workers (dbWorker.ts + userDbWorker.ts) purely to
// stop shipping the ~65KB @sqlite.org/sqlite-wasm glue twice — each worker is
// an independent bundle, so two workers meant two full copies of that glue in
// the first-load JS (docs/roadmap.md Phase 4 perf budget).
//
// NOT a chunk-sharing trick: that was tried (dynamic import + worker
// format:'es') and took production down — see docs/roadmap.md's correction
// under "Attempted and reverted". This sidesteps the whole class of problem by
// having only one worker bundle to begin with.
//
// Every message carries a `target: 'cards' | 'user'` telling this file which
// database it's for. The two databases keep fully separate state (own pool,
// own OPFS lock, own lifecycle) — merging the WORKER PROCESS is not merging
// the DATA. cards.sqlite is fetched/versioned/re-downloaded; user.sqlite is
// local-only and migrated in place. Neither semantic changes.
//
// Protocol (request/response paired by `id`), same shape as before per target:
//   cards: { id, target:'cards', kind:'open' }                      → { id, ok, meta?, error? }
//          { id, target:'cards', kind:'query', sql, params }        → { id, ok, rows?, error? }
//          { id, target:'cards', kind:'refresh' }                   → { id, ok, meta?, error? }
//   user:  { id, target:'user',  kind:'open' }                      → { id, ok, error? }
//          { id, target:'user',  kind:'query'|'run', sql, params }  → { id, ok, rows?|lastInsertRowid?/changes?, error? }
//          { id, target:'user',  kind:'export'|'import'|'wipe' }    → { id, ok, bytes?, error? }

import { initSqlite } from './sqlite'
import { installExclusiveOpfsPool } from './opfsLease'
import migration001 from '../../../migrations/0001_user_data.sql?raw'
import migration002 from '../../../migrations/0002_deck_author.sql?raw'
import migration003 from '../../../migrations/0003_inventory.sql?raw'
import migration004 from '../../../migrations/0004_game_groups.sql?raw'
import migration005 from '../../../migrations/0005_game_group_archetypes.sql?raw'
import migration006 from '../../../migrations/0006_inventory_precons.sql?raw'
import migration007 from '../../../migrations/0007_game_group_write_passphrase.sql?raw'

type Params = (string | number | null)[]
type CardsMsg =
  | { id: number; target: 'cards'; kind: 'open' }
  | { id: number; target: 'cards'; kind: 'query'; sql: string; params: Params }
  | { id: number; target: 'cards'; kind: 'refresh' }
type UserMsg =
  | { id: number; target: 'user'; kind: 'open' }
  | { id: number; target: 'user'; kind: 'query'; sql: string; params: Params }
  | { id: number; target: 'user'; kind: 'run'; sql: string; params: Params }
  | { id: number; target: 'user'; kind: 'export' }
  | { id: number; target: 'user'; kind: 'import'; bytes: Uint8Array }
  | { id: number; target: 'user'; kind: 'wipe' }
type InMsg = CardsMsg | UserMsg

// ---------------------------------------------------------------------------
// cards.sqlite (read-only, server-versioned) — verbatim from the old
// dbWorker.ts, only renamed to avoid colliding with the user-db state below.
// ---------------------------------------------------------------------------

const CARDS_DB_NAME = '/cards.sqlite'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cardsDb: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cardsPool: any = null

function registerRegexp(database: { createFunction: (opts: unknown) => void }) {
  database.createFunction({
    name: 'regexp_match',
    arity: 2,
    xFunc: (_ctx: unknown, pattern: string, text: string) => (new RegExp(pattern, 'i').test(text) ? 1 : 0),
  })
}

function versionOf(meta: { schema_version: number; data_version: number }): string {
  return `${meta.schema_version}.${meta.data_version}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versionOfDb(database: any): string | null {
  try {
    const schema = database.selectValue("SELECT value FROM meta WHERE key = 'schema_version'")
    const data = database.selectValue("SELECT value FROM meta WHERE key = 'data_version'")
    if (schema == null || data == null) return null
    return `${schema}.${data}`
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function installCardsPool(sqlite3: any): Promise<any> {
  return installExclusiveOpfsPool('schrecknet-card-db-opfs', () =>
    sqlite3.installOpfsSAHPoolVfs({}),
  )
}

async function openCards(): Promise<Record<string, unknown>> {
  const sqlite3 = await initSqlite()
  cardsPool = await installCardsPool(sqlite3)

  let serverMeta: { schema_version: number; data_version: number } | null = null
  try {
    const res = await fetch('/data/cards.meta.json', { cache: 'no-cache' })
    if (res.ok) serverMeta = await res.json()
    else console.warn(`cards.meta.json responded ${res.status}; using local card data`)
  } catch {
    // offline — fall through to whatever OPFS has
  }

  const wantVersion = serverMeta ? versionOf(serverMeta) : null
  const haveLocal = cardsPool.getFileNames().includes(CARDS_DB_NAME)

  if (haveLocal) {
    const local = new cardsPool.OpfsSAHPoolDb(CARDS_DB_NAME)
    const localVersion = versionOfDb(local)
    if (wantVersion === null || (localVersion !== null && localVersion === wantVersion)) {
      cardsDb = local
      registerRegexp(cardsDb)
      return { source: 'opfs', version: localVersion ?? 'unknown' }
    }
    local.close()
  }

  if (serverMeta === null && !haveLocal) {
    throw new Error('offline and no local card database yet — connect once to download it')
  }

  const res = await fetch('/data/cards.sqlite', { cache: 'reload' })
  if (!res.ok) throw new Error(`failed to fetch cards.sqlite: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await cardsPool.importDb(CARDS_DB_NAME, bytes)
  cardsDb = new cardsPool.OpfsSAHPoolDb(CARDS_DB_NAME)

  const storedVersion = versionOfDb(cardsDb)
  if (wantVersion !== null && storedVersion !== wantVersion) {
    cardsDb.close()
    cardsDb = null
    throw new Error(
      `downloaded card database reports version ${storedVersion ?? 'unknown'}, expected ${wantVersion} — refusing to use it`,
    )
  }

  registerRegexp(cardsDb)
  return { source: 'network', version: storedVersion ?? 'unknown', bytes: bytes.length }
}

function runCardsQuery(sql: string, params: Params): Record<string, unknown>[] {
  if (!cardsDb) throw new Error('database not open')
  const rows: Record<string, unknown>[] = []
  const stmt = cardsDb.prepare(sql)
  try {
    if (params.length) stmt.bind(params)
    while (stmt.step()) rows.push(stmt.get({}))
  } finally {
    stmt.finalize()
  }
  return rows
}

async function refreshCards(): Promise<Record<string, unknown>> {
  if (!cardsPool) return openCards()
  if (cardsDb) {
    cardsDb.close()
    cardsDb = null
  }
  cardsPool.unlink(CARDS_DB_NAME)
  return openCards()
}

// ---------------------------------------------------------------------------
// user.sqlite (local, read-write, migrated) — verbatim from the old
// userDbWorker.ts.
// ---------------------------------------------------------------------------

const USER_DB_NAME = '/user.sqlite'
const USER_MIGRATIONS = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let userDb: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let userPool: any = null

async function openUser(): Promise<void> {
  const sqlite3 = await initSqlite()
  userPool = await installExclusiveOpfsPool('schrecknet-user-db-opfs', () =>
    sqlite3.installOpfsSAHPoolVfs({ name: 'schrecknet-user-pool' }),
  )
  openUserDb()
}

function openUserDb(): void {
  userDb = new userPool.OpfsSAHPoolDb(USER_DB_NAME)
  const currentVersion = Number(userDb.selectValue('PRAGMA user_version'))
  for (const migration of USER_MIGRATIONS.slice(currentVersion)) userDb.exec(migration)
}

function closeUserDb(): void {
  if (userDb) {
    userDb.close()
    userDb = null
  }
}

async function exportUser(): Promise<Uint8Array> {
  if (!userPool) throw new Error('database not open')
  closeUserDb()
  try {
    return await userPool.exportFile(USER_DB_NAME)
  } finally {
    openUserDb()
  }
}

async function importUser(bytes: Uint8Array): Promise<void> {
  if (!userPool) throw new Error('database not open')
  closeUserDb()
  try {
    await userPool.importDb(USER_DB_NAME, bytes)
  } finally {
    openUserDb()
  }
}

async function wipeUser(): Promise<void> {
  if (!userPool) throw new Error('database not open')
  closeUserDb()
  try {
    userPool.unlink(USER_DB_NAME)
  } finally {
    openUserDb()
  }
}

function runUserQuery(sql: string, params: Params): Record<string, unknown>[] {
  if (!userDb) throw new Error('database not open')
  const rows: Record<string, unknown>[] = []
  const stmt = userDb.prepare(sql)
  try {
    if (params.length) stmt.bind(params)
    while (stmt.step()) rows.push(stmt.get({}))
  } finally {
    stmt.finalize()
  }
  return rows
}

function runUserMutation(sql: string, params: Params): { lastInsertRowid: number; changes: number } {
  if (!userDb) throw new Error('database not open')
  userDb.exec({ sql, bind: params })
  return {
    lastInsertRowid: userDb.selectValue('SELECT last_insert_rowid()') as number,
    changes: userDb.changes(),
  }
}

// ---------------------------------------------------------------------------
// Dispatch. Two independent databases sharing one worker process, so a slow
// or failed operation on one target never blocks the other's messages —
// each message is handled and replied to independently, same as before.
// ---------------------------------------------------------------------------

self.onmessage = async (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.target === 'cards') {
      if (msg.kind === 'open') {
        self.postMessage({ id: msg.id, ok: true, meta: await openCards() })
      } else if (msg.kind === 'refresh') {
        self.postMessage({ id: msg.id, ok: true, meta: await refreshCards() })
      } else {
        self.postMessage({ id: msg.id, ok: true, rows: runCardsQuery(msg.sql, msg.params) })
      }
    } else {
      if (msg.kind === 'open') {
        await openUser()
        self.postMessage({ id: msg.id, ok: true })
      } else if (msg.kind === 'query') {
        self.postMessage({ id: msg.id, ok: true, rows: runUserQuery(msg.sql, msg.params) })
      } else if (msg.kind === 'export') {
        const bytes = await exportUser()
        self.postMessage({ id: msg.id, ok: true, bytes }, { transfer: [bytes.buffer] })
      } else if (msg.kind === 'import') {
        await importUser(msg.bytes)
        self.postMessage({ id: msg.id, ok: true })
      } else if (msg.kind === 'wipe') {
        await wipeUser()
        self.postMessage({ id: msg.id, ok: true })
      } else {
        self.postMessage({ id: msg.id, ok: true, ...runUserMutation(msg.sql, msg.params) })
      }
    }
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
