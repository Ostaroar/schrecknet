// REST client for the confirmed-V5 tournament-winning-deck (TWDA) browser
// (docs/adr/0018). Server-only, read-only data — every deck returned has
// already been confirmed 100% V5 at build time (data/src/twda.rs); nothing
// here re-checks that.

export interface TwdaDeckSummary {
  id: string
  name: string | null
  event: string | null
  place: string | null
  date: string
  player: string | null
  players_count: number | null
}

export interface TwdaDeckCard {
  card_id: number
  name: string
  quantity: number
}

export interface TwdaDeckDetail {
  id: string
  name: string | null
  event: string | null
  place: string | null
  date: string
  player: string | null
  author: string | null
  players_count: number | null
  tournament_format: string | null
  score: string | null
  comments: string | null
  crypt: TwdaDeckCard[]
  library: TwdaDeckCard[]
}

export interface TwdaSearchFilters {
  player?: string
  cardName?: string
  dateFrom?: string
  dateTo?: string
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function searchTwdaDecks(filters: TwdaSearchFilters): Promise<TwdaDeckSummary[]> {
  const params = new URLSearchParams()
  if (filters.player) params.set('player', filters.player)
  if (filters.cardName) params.set('card_name', filters.cardName)
  if (filters.dateFrom) params.set('date_from', filters.dateFrom)
  if (filters.dateTo) params.set('date_to', filters.dateTo)
  const response = await fetch(`/api/v1/twda/search?${params.toString()}`)
  return asJson<TwdaDeckSummary[]>(response)
}

export async function getTwdaDeck(id: string): Promise<TwdaDeckDetail | null> {
  const response = await fetch(`/api/v1/twda/${encodeURIComponent(id)}`)
  if (response.status === 404) return null
  return asJson<TwdaDeckDetail>(response)
}
