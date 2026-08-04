// Sync orchestration (docs/accounts-plan.md § 4, milestone A3). Combines the
// ADR 0016 backup envelope, client-side encryption (syncCrypto.ts), and the
// REST endpoints into push/pull operations the UI can call directly.
//
// The recovery code is never stored — not in localStorage, not in
// sessionStorage. It's held in memory only, for the current page load, via
// `setUnlockedCode`. Reloading the page forgets it; that's deliberate
// (manual-first sync, docs/accounts-plan.md § 4).

import {
  createBackup,
  readBackup,
  restoreBackup,
  summarizeLocalData,
  type BackupEnvelope,
} from './backup'
import { decryptEnvelope, deriveSyncKey, encryptEnvelope } from './syncCrypto'

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

// In-memory only — see the module comment. A module-level singleton is fine
// here: there is exactly one browser tab's worth of "am I unlocked" state.
let unlockedKey: CryptoKey | null = null

export function isUnlocked(): boolean {
  return unlockedKey !== null
}

export function lock(): void {
  unlockedKey = null
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
  return true
}
