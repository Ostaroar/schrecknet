// Full local backup + restore for everything the user owns (docs/adr/0016).
//
// Why this exists: decks, inventory and owned-precon counts live only in the
// browser (OPFS `user.sqlite`). Clearing "cookies and site data" destroys all
// of it, and the pre-existing text exports were piecemeal — they covered loose
// card quantities and one deck at a time, and silently omitted owned precons,
// deck tags/description/author, per-deck inventory modes and card overrides.
//
// The design goal is therefore completeness BY CONSTRUCTION, not by
// remembering: we copy the whole database file and every `schrecknet.`-prefixed
// localStorage key, so a new migration or a new setting is in backups the day
// it lands with no code here to update.

import { exportUserDb, importUserDb, query } from './userDb'

export const BACKUP_FORMAT = 'schrecknet-backup'
/** Bump only for a breaking envelope change; readBackup rejects anything newer. */
export const BACKUP_VERSION = 1

/**
 * Everything this app persists outside SQLite uses this prefix, including
 * per-group keys built at runtime (`schrecknet.game-group-write-passphrase.<code>`).
 * Matching on the prefix rather than an enumerated list is deliberate: an
 * allowlist is exactly the kind of thing that silently falls behind.
 */
const LOCAL_STORAGE_PREFIX = 'schrecknet.'

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT
  version: number
  created_at: string
  /** Card-data version at backup time — diagnostic only, never enforced. */
  app_data_version?: string
  user_db_base64: string
  local_storage: Record<string, string>
}

export interface BackupSummary {
  created_at: string | null
  decks: number
  inventory_cards: number
  owned_precons: number
}

function collectLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith(LOCAL_STORAGE_PREFIX)) continue
    const value = localStorage.getItem(key)
    if (value !== null) out[key] = value
  }
  return out
}

// Chunked to avoid blowing the argument limit on String.fromCharCode for a
// database that is hundreds of KB.
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Counts read from the live database, so a summary can never overstate what is there. */
export async function summarizeLocalData(): Promise<Omit<BackupSummary, 'created_at'>> {
  const one = async (sql: string): Promise<number> => {
    const rows = await query<{ n: number }>(sql)
    return Number(rows[0]?.n ?? 0)
  }
  return {
    decks: await one('SELECT COUNT(*) AS n FROM decks'),
    inventory_cards: await one('SELECT COUNT(*) AS n FROM inventory'),
    owned_precons: await one('SELECT COUNT(*) AS n FROM inventory_precons'),
  }
}

export async function createBackup(appDataVersion?: string): Promise<BackupEnvelope> {
  const bytes = await exportUserDb()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    app_data_version: appDataVersion,
    user_db_base64: toBase64(bytes),
    local_storage: collectLocalStorage(),
  }
}

/**
 * Parses and validates an envelope. Rejects rather than importing partially —
 * a half-restored database is worse than a refused one.
 */
export function readBackup(text: string): BackupEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('not a SchreckNet backup file (invalid JSON)')
  }
  const env = parsed as Partial<BackupEnvelope>
  if (env?.format !== BACKUP_FORMAT) {
    throw new Error('not a SchreckNet backup file')
  }
  if (typeof env.version !== 'number' || typeof env.user_db_base64 !== 'string') {
    throw new Error('backup file is missing required fields')
  }
  if (env.version > BACKUP_VERSION) {
    throw new Error(
      `this backup was made by a newer version of SchreckNet (format ${env.version}, this app reads ${BACKUP_VERSION})`,
    )
  }
  return {
    format: BACKUP_FORMAT,
    version: env.version,
    created_at: typeof env.created_at === 'string' ? env.created_at : '',
    app_data_version: env.app_data_version,
    user_db_base64: env.user_db_base64,
    local_storage: env.local_storage ?? {},
  }
}

/**
 * Replaces all local data with the backup's contents. Caller is responsible for
 * confirming with the user first — this is not undoable.
 */
export async function restoreBackup(env: BackupEnvelope): Promise<void> {
  await importUserDb(fromBase64(env.user_db_base64))
  // Only our own keys are cleared, so an unrelated key from another tool on
  // the same origin is left alone.
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i)
    if (key?.startsWith(LOCAL_STORAGE_PREFIX)) localStorage.removeItem(key)
  }
  for (const [key, value] of Object.entries(env.local_storage)) {
    if (key.startsWith(LOCAL_STORAGE_PREFIX)) localStorage.setItem(key, value)
  }
}

export function backupFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `schrecknet-backup-${stamp}.json`
}
