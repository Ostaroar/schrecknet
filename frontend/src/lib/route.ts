// Minimal hash routing (#/crypt, #/library, #/cards/123, #/decks, #/decks/5).
// Deliberately not a router library — AGENTS.md requires an ADR for new
// runtime deps, and this many routes still doesn't justify one.

import { useEffect, useState } from 'react'

export type Route =
  | { page: 'crypt' }
  | { page: 'library' }
  | { page: 'card'; id: number }
  | { page: 'decks' }
  | { page: 'deck'; id: number }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const cardMatch = /^cards\/(\d+)$/.exec(path)
  if (cardMatch) return { page: 'card', id: Number(cardMatch[1]) }
  const deckMatch = /^decks\/(\d+)$/.exec(path)
  if (deckMatch) return { page: 'deck', id: Number(deckMatch[1]) }
  if (path === 'decks') return { page: 'decks' }
  if (path === 'library') return { page: 'library' }
  return { page: 'crypt' }
}

export function routeTo(route: Route): string {
  switch (route.page) {
    case 'crypt':
      return '#/crypt'
    case 'library':
      return '#/library'
    case 'card':
      return `#/cards/${route.id}`
    case 'decks':
      return '#/decks'
    case 'deck':
      return `#/decks/${route.id}`
  }
}

export function navigate(route: Route) {
  window.location.hash = routeTo(route)
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
