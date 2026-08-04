// REST client for API tokens (docs/accounts-plan.md milestone A5) — bearer
// tokens for MCP/REST clients, deliberately less privileged than a session:
// creating/listing/revoking tokens still requires the session cookie itself
// (never a token), so a leaked token cannot mint or revoke other tokens.

export interface ApiTokenSummary {
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

/** The raw `token` value is shown exactly once — only its hash is stored. */
export async function createApiToken(nickname?: string): Promise<{ token: string; id: number }> {
  const response = await fetch('/api/v1/account/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nickname || null }),
  })
  return asJson(response)
}

export async function listApiTokens(): Promise<ApiTokenSummary[]> {
  return asJson(await fetch('/api/v1/account/tokens'))
}

export async function revokeApiToken(id: number): Promise<void> {
  const response = await fetch(`/api/v1/account/tokens/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `request failed with status ${response.status}`))
  }
}
