// Local, writable user data (decks, inventory) — a separate OPFS database
// from cards.sqlite, owned by the shared dataWorker.ts. Kept as a distinct
// pool because this data is locally created and mutated, never fetched.

import { send as sendTo } from './dataWorkerClient'

let openPromise: Promise<void> | null = null
let askedToPersist = false

function send<T>(msg: Record<string, unknown>): Promise<T> {
  return sendTo<T>('user', msg)
}

function ensureOpen(): Promise<void> {
  if (!openPromise) {
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
  // The first write is the moment the user has something to lose, and the
  // moment a persistence request is both most likely to be granted and easiest
  // to justify. Fire-and-forget: a refusal changes nothing here.
  if (!askedToPersist) {
    askedToPersist = true
    void requestPersistentStorage()
  }
  return send<{ lastInsertRowid: number; changes: number }>({ kind: 'run', sql, params })
}

/** Raw `user.sqlite` bytes, for backup (docs/adr/0016). */
export async function exportUserDb(): Promise<Uint8Array> {
  await ensureOpen()
  const { bytes } = await send<{ bytes: Uint8Array }>({ kind: 'export' })
  return bytes
}

/**
 * Replaces the whole local database with `bytes`. Destructive by design —
 * restoring a backup means "make it look like the backup", not "merge into
 * whatever is here" (see docs/adr/0016 on why merge is the wrong default).
 * Migrations run on reopen, so an older backup upgrades itself.
 */
export async function importUserDb(bytes: Uint8Array): Promise<void> {
  await ensureOpen()
  await send<Record<string, never>>({ kind: 'import', bytes })
}

/** Deletes all local decks/inventory, leaving an empty migrated database. */
export async function wipeUserDb(): Promise<void> {
  await ensureOpen()
  await send<Record<string, never>>({ kind: 'wipe' })
}

/**
 * Asks the browser to stop treating this origin's storage as evictable.
 *
 * Called on first actual use of user data rather than at page load: browsers
 * weigh engagement when deciding (and Firefox may prompt), so asking while the
 * user is creating their first deck is both more likely to succeed and easier
 * to justify than asking a first-time visitor who has nothing to lose yet.
 * Best-effort — a refusal is not an error, it just means data stays evictable.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
