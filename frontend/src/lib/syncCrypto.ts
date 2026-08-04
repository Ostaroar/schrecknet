// Client-side encryption for account sync (docs/adr/0019 § 5, milestone A3).
// The server stores ciphertext + nonce and never sees a key, a recovery code,
// or plaintext — everything here runs in the browser via native WebCrypto
// (no new dependency).
//
// Key derivation: HKDF-SHA256 from the recovery code, with a purpose-specific
// `info` string as domain separation and an empty salt — standard HKDF
// practice when the input keying material (our 128-bit recovery code) already
// has sufficient entropy of its own; see RFC 5869 §3.1.
//
// Encryption: AES-256-GCM with a fresh random 96-bit (12-byte) IV per
// encryption, which is the size AES-GCM is specified and optimized for
// (a longer IV is hashed down internally, a shorter one is invalid).

import type { BackupEnvelope } from './backup'

const HKDF_INFO = new TextEncoder().encode('schrecknet-sync-v1')

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

/** Derives the AES-GCM sync key from a recovery code. Never leaves this call. */
export async function deriveSyncKey(recoveryCode: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(recoveryCode.trim()),
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptEnvelope(
  envelope: BackupEnvelope,
  key: CryptoKey,
): Promise<{ ciphertext: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), nonce: toBase64(iv) }
}

/**
 * Throws if `key` is wrong (a wrong recovery code) — AES-GCM authenticates the
 * ciphertext, so decryption with the wrong key fails loudly rather than
 * returning garbage. Callers should surface that as "wrong recovery code",
 * not a generic error.
 */
export async function decryptEnvelope(
  ciphertext: string,
  nonce: string,
  key: CryptoKey,
): Promise<BackupEnvelope> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(nonce) },
    key,
    fromBase64(ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as BackupEnvelope
}
