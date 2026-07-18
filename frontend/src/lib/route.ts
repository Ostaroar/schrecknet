// Minimal hash routing (#/crypt, #/library, #/cards/123). Deliberately not a
// router library — AGENTS.md requires an ADR for new runtime deps, and Phase 1
// only needs three routes. Revisit if Phase 2's deck URLs outgrow this.

import { useEffect, useState } from 'react'

export type Route = { page: 'crypt' } | { page: 'library' } | { page: 'card'; id: number }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const cardMatch = /^cards\/(\d+)$/.exec(path)
  if (cardMatch) return { page: 'card', id: Number(cardMatch[1]) }
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
