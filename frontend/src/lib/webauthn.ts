// Browser-side WebAuthn glue. The only job here is converting between the
// browser's native ArrayBuffer-based Credential Management API and the exact
// JSON shape the server's webauthn-rs expects — verified against
// webauthn-rs-proto 0.5.5's own source (attest.rs/auth.rs), not guessed:
//
// - Binary fields (challenge, ids, attestationObject, clientDataJSON,
//   authenticatorData, signature, userHandle) are `Base64UrlSafeData`, which
//   always serializes as a URL-safe, unpadded base64 string.
// - `type_` is renamed to `"type"` on the wire.
// - `extensions` is optional with a default, so it's simply omitted rather
//   than round-tripped.
//
// docs/adr/0019-passkey-only-accounts-no-email.md

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(withPadding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** True once, cached: whether this browser can do a passkey ceremony at all. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential
}

/**
 * Runs a WebAuthn *registration* ceremony against the server's challenge JSON
 * (the `challenge` field of a `CeremonyChallenge`) and returns the browser's
 * response, JSON-shaped exactly as `RegisterPublicKeyCredential` expects.
 */
export async function createPasskey(challenge: unknown): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pk = (challenge as any).publicKey

  const options: CredentialCreationOptions = {
    publicKey: {
      ...pk,
      challenge: base64UrlToBytes(pk.challenge),
      user: { ...pk.user, id: base64UrlToBytes(pk.user.id) },
      excludeCredentials: (pk.excludeCredentials ?? []).map(
        (c: { type: string; id: string; transports?: string[] }) => ({
          ...c,
          id: base64UrlToBytes(c.id),
        }),
      ),
    },
  }

  const credential = (await navigator.credentials.create(options)) as PublicKeyCredential | null
  if (!credential) throw new Error('passkey creation was cancelled')
  const response = credential.response as AuthenticatorAttestationResponse

  return {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: 'public-key',
    response: {
      attestationObject: bytesToBase64Url(response.attestationObject),
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
    },
  }
}

/**
 * Runs a WebAuthn *authentication* ceremony and returns the browser's
 * response, JSON-shaped exactly as `PublicKeyCredential` (the auth one, not
 * the browser's own type of the same name) expects.
 */
export async function getPasskey(challenge: unknown): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pk = (challenge as any).publicKey

  const options: CredentialRequestOptions = {
    publicKey: {
      ...pk,
      challenge: base64UrlToBytes(pk.challenge),
      allowCredentials: (pk.allowCredentials ?? []).map(
        (c: { type: string; id: string; transports?: string[] }) => ({
          ...c,
          id: base64UrlToBytes(c.id),
        }),
      ),
    },
  }

  const credential = (await navigator.credentials.get(options)) as PublicKeyCredential | null
  if (!credential) throw new Error('passkey sign-in was cancelled')
  const response = credential.response as AuthenticatorAssertionResponse

  return {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: 'public-key',
    response: {
      authenticatorData: bytesToBase64Url(response.authenticatorData),
      clientDataJSON: bytesToBase64Url(response.clientDataJSON),
      signature: bytesToBase64Url(response.signature),
      userHandle: response.userHandle ? bytesToBase64Url(response.userHandle) : null,
    },
  }
}
