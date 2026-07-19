// Minimal hash routing (#/crypt, #/library, #/cards/123, #/decks, #/decks/5,
// #/share/<token>, #/diff, #/seating, #/precons, #/help, #/about).
// Deliberately not a router library — AGENTS.md requires an ADR for new
// runtime deps, and this many routes still doesn't justify one.

import { useEffect, useState } from 'react'

export type Route =
  | { page: 'crypt' }
  | { page: 'library' }
  | { page: 'card'; id: number }
  | { page: 'decks' }
  | { page: 'deck'; id: number }
  | { page: 'share'; token: string }
  | { page: 'diff' }
  | { page: 'seating' }
  | { page: 'precons' }
  | { page: 'help' }
  | { page: 'about' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const cardMatch = /^cards\/(\d+)$/.exec(path)
  if (cardMatch) return { page: 'card', id: Number(cardMatch[1]) }
  const deckMatch = /^decks\/(\d+)$/.exec(path)
  if (deckMatch) return { page: 'deck', id: Number(deckMatch[1]) }
  const shareMatch = /^share\/(.+)$/.exec(path)
  if (shareMatch) return { page: 'share', token: shareMatch[1] }
  if (path === 'decks') return { page: 'decks' }
  if (path === 'diff') return { page: 'diff' }
  if (path === 'seating') return { page: 'seating' }
  if (path === 'precons') return { page: 'precons' }
  if (path === 'help') return { page: 'help' }
  if (path === 'about') return { page: 'about' }
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
    case 'share':
      return `#/share/${route.token}`
    case 'diff':
      return '#/diff'
    case 'seating':
      return '#/seating'
    case 'precons':
      return '#/precons'
    case 'help':
      return '#/help'
    case 'about':
      return '#/about'
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
