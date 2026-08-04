// REST client for passkey accounts (docs/adr/0019, docs/accounts-plan.md).
// Every call relies on the browser sending the __Host- session cookie
// automatically (same-origin fetch), so none of this ever touches the token
// directly.

import { createPasskey, getPasskey } from './webauthn'

export interface AccountInfo {
  display_name: string
  created_at: string
  passkey_count: number
}

export interface PasskeySummary {
  id: number
  nickname: string | null
  created_at: string
  last_used_at: string | null
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return asJson<T>(response)
}

/** Register a brand-new account: creates the passkey ceremony, then the account. */
export async function register(
  displayName: string,
): Promise<{ display_name: string; recovery_code: string }> {
  const challenge = await postJson<{ ceremony_id: string; challenge: unknown }>(
    '/api/v1/account/register/start',
    { display_name: displayName },
  )
  const credential = await createPasskey(challenge.challenge)
  return postJson('/api/v1/account/register/finish', {
    ceremony_id: challenge.ceremony_id,
    credential,
  })
}

/** Sign in with an existing passkey. */
export async function login(displayName: string): Promise<AccountInfo> {
  const challenge = await postJson<{ ceremony_id: string; challenge: unknown }>(
    '/api/v1/account/login/start',
    { display_name: displayName },
  )
  const credential = await getPasskey(challenge.challenge)
  return postJson('/api/v1/account/login/finish', {
    ceremony_id: challenge.ceremony_id,
    credential,
  })
}

export async function logout(): Promise<void> {
  await fetch('/api/v1/account/logout', { method: 'POST' })
}

/** `null` when not signed in, rather than throwing — every caller checks this. */
export async function getAccount(): Promise<AccountInfo | null> {
  const response = await fetch('/api/v1/account')
  if (response.status === 401) return null
  return asJson<AccountInfo>(response)
}

/** Add a passkey from a live session — the safeguard to use before it's needed. */
export async function addPasskeyFromSession(
  nickname?: string,
): Promise<{ passkey_count: number }> {
  const challenge = await postJson<{ ceremony_id: string; challenge: unknown }>(
    '/api/v1/account/passkeys/start',
    {},
  )
  const credential = await createPasskey(challenge.challenge)
  return postJson('/api/v1/account/passkeys/finish', {
    ceremony_id: challenge.ceremony_id,
    credential,
    nickname: nickname || null,
  })
}

/**
 * Redeem a recovery code to register a replacement passkey — the locked-out
 * path. Rotates the code: the returned `new_recovery_code` must be shown once,
 * the same way as at registration, since the old one is now spent.
 */
export async function recoverWithCode(
  displayName: string,
  recoveryCode: string,
): Promise<{ passkey_count: number; new_recovery_code: string | null }> {
  const challenge = await postJson<{ ceremony_id: string; challenge: unknown }>(
    '/api/v1/account/recover/start',
    { display_name: displayName, recovery_code: recoveryCode },
  )
  const credential = await createPasskey(challenge.challenge)
  return postJson('/api/v1/account/passkeys/finish', {
    ceremony_id: challenge.ceremony_id,
    credential,
  })
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  return asJson(await fetch('/api/v1/account/passkeys'))
}

export async function renamePasskey(id: number, nickname: string | null): Promise<void> {
  const response = await fetch(`/api/v1/account/passkeys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  })
  if (!response.ok && response.status !== 204) {
    throw new Error(await response.text().catch(() => `request failed with status ${response.status}`))
  }
}

/** Throws if this is the account's only passkey — the server refuses it. */
export async function removePasskey(id: number): Promise<void> {
  const response = await fetch(`/api/v1/account/passkeys/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `request failed with status ${response.status}`))
  }
}
