// Persists the derived sync CryptoKey across page loads via IndexedDB's
// native structured-clone support for CryptoKey objects. The key is
// non-extractable (see deriveSyncKey in syncCrypto.ts) — storing it here
// doesn't expose it as readable bytes, it just survives a reload instead of
// forcing the recovery code to be re-entered every time. Scoped to this
// browser profile only; never synced anywhere.

const DB_NAME = 'schrecknet-sync-key'
const STORE = 'keys'
const KEY_ID = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveSyncKey(key: CryptoKey): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(key, KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadSyncKey(): Promise<CryptoKey | null> {
  const db = await openDb()
  const key = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY_ID)
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return key
}

export async function clearSyncKey(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY_ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
