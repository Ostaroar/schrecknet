// REST client for the private game-groups tracker (docs/game-groups-plan.md).
// Unlike every other lib/*.ts here, this data lives only on the server's
// app.sqlite — there's no local/offline copy, since a leaderboard is only
// meaningful shared across the whole group.

export interface GroupInfo {
  code: string
  name: string
  created_at: string
}

export interface PlayerResult {
  player_name: string
  deck_name?: string | null
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

const STORAGE_KEY = 'schrecknet.game-group-code'

export function getStoredGroupCode(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setStoredGroupCode(code: string): void {
  localStorage.setItem(STORAGE_KEY, code)
}

export function clearStoredGroupCode(): void {
  localStorage.removeItem(STORAGE_KEY)
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function createGameGroup(name: string): Promise<GroupInfo> {
  const response = await fetch('/api/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
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
  game: { played_at: string; notes?: string | null; results: PlayerResult[] },
): Promise<GameRecord | null> {
  const response = await fetch(`/api/v1/groups/${encodeURIComponent(code)}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(game),
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
