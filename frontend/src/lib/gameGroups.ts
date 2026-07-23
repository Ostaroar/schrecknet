// REST client for the private game-groups tracker (docs/game-groups-plan.md).
// Unlike every other lib/*.ts here, this data lives only on the server's
// app.sqlite — there's no local/offline copy, since a leaderboard is only
// meaningful shared across the whole group.

export interface GroupInfo {
  code: string
  name: string
  created_at: string
  write_protected: boolean
}

export interface PlayerResult {
  player_name: string
  deck_name?: string | null
  archetype_id?: string | null
  vp: number
  game_win: boolean
}

export interface GameRecord {
  id: number
  played_at: string
  notes?: string | null
  results: PlayerResult[]
}

export interface LeaderboardEntry {
  player_name: string
  games_played: number
  total_vp: number
  average_vp: number
  wins: number
  win_rate: number
}

// A player can be in more than one playgroup (Thursday coterie, con pickup
// games, ...), so the joined codes are a list, not a single value. The
// pre-multi-group key is migrated in transparently on first read.
const CODES_KEY = 'schrecknet.game-group-codes'
const ACTIVE_KEY = 'schrecknet.game-group-active-code'
const LEGACY_SINGLE_CODE_KEY = 'schrecknet.game-group-code'
const WRITE_PASSPHRASE_PREFIX = 'schrecknet.game-group-write-passphrase.'

function readCodes(): string[] {
  const raw = localStorage.getItem(CODES_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.every((c) => typeof c === 'string')) return parsed
    } catch {
      // fall through to legacy/empty
    }
  }
  const legacy = localStorage.getItem(LEGACY_SINGLE_CODE_KEY)
  return legacy ? [legacy] : []
}

function writeCodes(codes: string[]): void {
  localStorage.setItem(CODES_KEY, JSON.stringify(codes))
  localStorage.removeItem(LEGACY_SINGLE_CODE_KEY)
}

export function getStoredGroupCodes(): string[] {
  return readCodes()
}

export function addStoredGroupCode(code: string): void {
  const codes = readCodes()
  if (!codes.includes(code)) writeCodes([...codes, code])
  setActiveGroupCode(code)
}

export function removeStoredGroupCode(code: string): void {
  writeCodes(readCodes().filter((c) => c !== code))
  if (getActiveGroupCode() === code) setActiveGroupCode(null)
}

export function getActiveGroupCode(): string | null {
  const active = localStorage.getItem(ACTIVE_KEY)
  if (active && readCodes().includes(active)) return active
  return readCodes()[0] ?? null
}

export function setActiveGroupCode(code: string | null): void {
  if (code) localStorage.setItem(ACTIVE_KEY, code)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function getSessionWritePassphrase(code: string): string {
  return sessionStorage.getItem(`${WRITE_PASSPHRASE_PREFIX}${code}`) ?? ''
}

export function setSessionWritePassphrase(code: string, passphrase: string): void {
  if (passphrase) sessionStorage.setItem(`${WRITE_PASSPHRASE_PREFIX}${code}`, passphrase)
  else sessionStorage.removeItem(`${WRITE_PASSPHRASE_PREFIX}${code}`)
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function createGameGroup(name: string, writePassphrase: string): Promise<GroupInfo> {
  const response = await fetch('/api/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, write_passphrase: writePassphrase || null }),
  })
  return asJson<GroupInfo>(response)
}

export async function getGameGroup(code: string): Promise<GroupInfo | null> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(code)}`)
  if (response.status === 404) return null
  return asJson<GroupInfo>(response)
}

export async function logGroupGame(
  code: string,
  writePassphrase: string,
  game: { played_at: string; notes?: string | null; results: PlayerResult[] },
): Promise<GameRecord | null> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(code)}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...game, write_passphrase: writePassphrase || null }),
  })
  if (response.status === 404) return null
  return asJson<GameRecord>(response)
}

export async function listGroupGames(code: string): Promise<GameRecord[] | null> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(code)}/games`)
  if (response.status === 404) return null
  return asJson<GameRecord[]>(response)
}

export async function getGroupLeaderboard(code: string): Promise<LeaderboardEntry[] | null> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(code)}/leaderboard`)
  if (response.status === 404) return null
  return asJson<LeaderboardEntry[]>(response)
}

/** Returns false if the code or game id didn't match anything. Irreversible. */
export async function deleteGroupGame(
  code: string,
  writePassphrase: string,
  gameId: number,
): Promise<boolean> {
  const response = await fetch(
    `/api/v1/groups/${encodeURIComponent(code)}/games/${gameId}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ write_passphrase: writePassphrase || null }),
    },
  )
  if (response.status === 404) return false
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `request failed with status ${response.status}`)
  }
  return true
}

export async function updateGroupGame(
  code: string,
  writePassphrase: string,
  gameId: number,
  game: { played_at: string; notes?: string | null; results: PlayerResult[] },
): Promise<GameRecord | null> {
  const response = await fetch(
    `/api/v1/groups/${encodeURIComponent(code)}/games/${gameId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...game, write_passphrase: writePassphrase || null }),
    },
  )
  if (response.status === 404) return null
  return asJson<GameRecord>(response)
}
