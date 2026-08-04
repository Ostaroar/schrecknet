// Sync orchestration (docs/accounts-plan.md § 4, milestone A3). Combines the
// ADR 0016 backup envelope, client-side encryption (syncCrypto.ts), and the
// REST endpoints into push/pull operations the UI can call directly.
//
// The recovery code itself is never stored — not in localStorage, not in
// sessionStorage. The *derived* key is a non-extractable CryptoKey (see
// deriveSyncKey), so persisting it via syncKeyStore.ts across reloads never
// exposes it as bytes; it just means "unlock" only has to happen once per
// browser instead of once per page load. See startAutoSync() below for the
// background push loop this enables.

import {
  createBackup,
  readBackup,
  restoreBackup,
  summarizeLocalData,
  type BackupEnvelope,
} from './backup'
import { decryptEnvelope, deriveSyncKey, encryptEnvelope } from './syncCrypto'
import { saveSyncKey, loadSyncKey, clearSyncKey } from './syncKeyStore'

export interface SyncBlob {
  version: number
  updated_at: string
  device_label: string | null
  ciphertext: string
  nonce: string
  byte_size: number
}

export type SyncState =
  | { kind: 'never-synced' }
  | { kind: 'up-to-date'; version: number; updatedAt: string }
  | {
      kind: 'conflict'
      local: { decks: number; inventory_cards: number }
      remote: { blob: SyncBlob; envelope: BackupEnvelope }
    }

// A module-level singleton is fine here: there is exactly one browser tab's
// worth of "am I unlocked" state. Persisted to IndexedDB (syncKeyStore.ts)
// so it survives reloads — see restoreUnlock().
let unlockedKey: CryptoKey | null = null

export function isUnlocked(): boolean {
  return unlockedKey !== null
}

export async function lock(): Promise<void> {
  unlockedKey = null
  await clearSyncKey().catch(() => {})
}

/** Throws if the code is wrong AND a remote blob already exists (caught by
 * attempting a decrypt); for a brand-new account any code "works" since
 * there's nothing to verify against yet. */
export async function unlock(recoveryCode: string): Promise<void> {
  const key = await deriveSyncKey(recoveryCode)
  const remote = await pullRaw()
  if (remote) {
    await decryptEnvelope(remote.ciphertext, remote.nonce, key) // throws if wrong
  }
  unlockedKey = key
  await saveSyncKey(key).catch(() => {})
}

/** Restores a persisted unlock from a previous page load, if any — call once
 * at app startup (see startAutoSync). Never verifies against the remote
 * blob; a key that was good enough to save is trusted on this device. */
export async function restoreUnlock(): Promise<boolean> {
  if (unlockedKey) return true
  const key = await loadSyncKey().catch(() => null)
  if (!key) return false
  unlockedKey = key
  return true
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function pullRaw(): Promise<SyncBlob | null> {
  const response = await fetch('/api/v1/account/sync')
  if (response.status === 404) return null
  return asJson<SyncBlob>(response)
}

const LAST_SEEN_VERSION_KEY = 'schrecknet.sync-last-seen-version'

function lastSeenVersion(): number | null {
  const raw = localStorage.getItem(LAST_SEEN_VERSION_KEY)
  return raw ? Number(raw) : null
}

function rememberVersion(version: number): void {
  localStorage.setItem(LAST_SEEN_VERSION_KEY, String(version))
}

/** Checks remote state against what this device last saw. Never writes. */
export async function checkSyncState(): Promise<SyncState> {
  if (!unlockedKey) throw new Error('sync is locked — call unlock() with the recovery code first')
  const remote = await pullRaw()
  if (!remote) return { kind: 'never-synced' }

  const seen = lastSeenVersion()
  if (seen === remote.version) {
    return { kind: 'up-to-date', version: remote.version, updatedAt: remote.updated_at }
  }

  const envelope = await decryptEnvelope(remote.ciphertext, remote.nonce, unlockedKey)
  const parsed = readBackup(JSON.stringify(envelope))
  const localCounts = await summarizeLocalData()
  return {
    kind: 'conflict',
    local: localCounts,
    remote: { blob: remote, envelope: parsed },
  }
}

/** "Keep this device": encrypts the current local state and pushes it,
 * overwriting whatever is remote. */
/**
 * `expectedVersionOverride` is for resolving a known conflict: "keep this
 * device" must push against the remote version the conflict actually reported,
 * not the stale value this browser last remembered — pushing against the
 * stale value would just 409 again.
 */
export async function pushLocal(
  deviceLabel: string,
  appDataVersion?: string,
  expectedVersionOverride?: number,
): Promise<SyncBlob> {
  if (!unlockedKey) throw new Error('sync is locked — call unlock() with the recovery code first')
  const envelope = await createBackup(appDataVersion)
  const { ciphertext, nonce } = await encryptEnvelope(envelope, unlockedKey)
  const response = await fetch('/api/v1/account/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expected_version: expectedVersionOverride ?? lastSeenVersion(),
      device_label: deviceLabel,
      ciphertext,
      nonce,
    }),
  })
  if (response.status === 409) {
    const current = await asJson<SyncBlob>(response)
    throw new SyncConflictError(current)
  }
  const blob = await asJson<SyncBlob>(response)
  rememberVersion(blob.version)
  return blob
}

/** Resolves a conflict already reported by `checkSyncState`: restores an
 * envelope already decrypted for display, without re-fetching/re-decrypting. */
export async function acceptRemote(envelope: BackupEnvelope, version: number): Promise<void> {
  await restoreBackup(envelope)
  rememberVersion(version)
}

export class SyncConflictError extends Error {
  current: SyncBlob
  constructor(current: SyncBlob) {
    super('another device pushed a newer version')
    this.current = current
  }
}

/**
 * Re-encrypts the existing sync blob under a freshly rotated recovery code.
 * Called right after redeeming a recovery code (which rotates it,
 * docs/accounts-plan.md § A2) — without this, the old blob becomes
 * permanently unreadable the moment the old code is gone, since the server
 * never has a way to re-encrypt it itself.
 *
 * A no-op if there's nothing synced yet, or if this device was never unlocked
 * with the old code (nothing to re-encrypt with).
 */
export async function reencryptAfterRotation(
  oldCode: string,
  newCode: string,
): Promise<boolean> {
  const remote = await pullRaw()
  if (!remote) return false
  const oldKey = await deriveSyncKey(oldCode)
  const envelope = await decryptEnvelope(remote.ciphertext, remote.nonce, oldKey)
  const newKey = await deriveSyncKey(newCode)
  const { ciphertext, nonce } = await encryptEnvelope(envelope, newKey)
  const response = await fetch('/api/v1/account/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expected_version: remote.version,
      device_label: remote.device_label,
      ciphertext,
      nonce,
    }),
  })
  if (!response.ok) return false
  const blob = await asJson<SyncBlob>(response)
  rememberVersion(blob.version)
  unlockedKey = newKey
  await saveSyncKey(newKey).catch(() => {})
  return true
}

let autoSyncTimer: ReturnType<typeof setInterval> | null = null

/** Best-effort background push while unlocked — captures local edits without
 * a manual "Sync now" click. Only ever pushes, never pulls: pulling could
 * silently overwrite local data, so an actual conflict (remote changed on
 * another device) is left for the Account page's own conflict UI instead of
 * being auto-resolved here. Any other failure (offline, locked) is swallowed
 * silently; this is a convenience loop, not the source of truth. */
async function autoSyncTick(): Promise<void> {
  if (!unlockedKey) return
  try {
    const result = await checkSyncState()
    if (result.kind !== 'conflict') {
      await pushLocal(navigator.userAgent.slice(0, 40))
    }
  } catch {
    // best-effort
  }
}

/** Call once at app startup. Restores a persisted unlock (if any) and starts
 * the background auto-sync loop; a no-op (still unlocked or not) if never
 * unlocked on this device. Safe to call more than once — later calls are no-ops. */
export async function startAutoSync(): Promise<void> {
  await restoreUnlock()
  if (autoSyncTimer) return
  await autoSyncTick()
  autoSyncTimer = setInterval(autoSyncTick, 2 * 60 * 1000)
}
