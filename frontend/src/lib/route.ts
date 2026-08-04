// Path-based routing (/crypt, /library, /cards/123, /decks, /decks/5,
// /decks/5/proxy, /share/<token>, /diff, /precons, /inventory, /table, /help,
// /rules, /changelog, /about). Deliberately not a router library — AGENTS.md
// requires an ADR for new runtime deps, and this many routes still doesn't
// justify one; see docs/adr/0008-path-based-routing-for-seo.md for why this
// uses the History API instead of the hash routing it replaces.

import { useEffect, useState, type MouseEvent } from 'react'

export type Route =
  | { page: 'crypt' }
  | { page: 'library' }
  | { page: 'card'; id: number }
  | { page: 'decks' }
  | { page: 'deck'; id: number }
  | { page: 'proxy'; deckId: number }
  | { page: 'review'; deckId: number }
  | { page: 'share'; token: string }
  | { page: 'diff' }
  | { page: 'precons' }
  | { page: 'twda' }
  | { page: 'twda-deck'; id: string }
  | { page: 'inventory' }
  | { page: 'limited' }
  | { page: 'table' }
  | { page: 'rules' }
  | { page: 'changelog' }
  | { page: 'help' }
  | { page: 'about' }
  | { page: 'legal' }
  // Backup/restore + storage status (docs/adr/0016). Not `/data`, which is the
  // server's static mount for cards.sqlite.
  | { page: 'settings' }
  | { page: 'account' }

export function parsePath(pathname: string): Route {
  const path = pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  const cardMatch = /^cards\/(\d+)$/.exec(path)
  if (cardMatch) return { page: 'card', id: Number(cardMatch[1]) }
  const proxyMatch = /^decks\/(\d+)\/proxy$/.exec(path)
  if (proxyMatch) return { page: 'proxy', deckId: Number(proxyMatch[1]) }
  const reviewMatch = /^decks\/(\d+)\/review$/.exec(path)
  if (reviewMatch) return { page: 'review', deckId: Number(reviewMatch[1]) }
  const deckMatch = /^decks\/(\d+)$/.exec(path)
  if (deckMatch) return { page: 'deck', id: Number(deckMatch[1]) }
  const shareMatch = /^share\/(.+)$/.exec(path)
  if (shareMatch) return { page: 'share', token: shareMatch[1] }
  if (path === 'decks') return { page: 'decks' }
  if (path === 'diff') return { page: 'diff' }
  if (path === 'precons') return { page: 'precons' }
  const twdaDeckMatch = /^twda\/(.+)$/.exec(path)
  if (twdaDeckMatch) return { page: 'twda-deck', id: twdaDeckMatch[1] }
  if (path === 'twda') return { page: 'twda' }
  if (path === 'inventory') return { page: 'inventory' }
  if (path === 'limited') return { page: 'limited' }
  if (path === 'table') return { page: 'table' }
  if (path === 'rules') return { page: 'rules' }
  if (path === 'changelog') return { page: 'changelog' }
  if (path === 'help') return { page: 'help' }
  if (path === 'about') return { page: 'about' }
  if (path === 'settings') return { page: 'settings' }
  if (path === 'account') return { page: 'account' }
  // German legal-notice aliases: an Impressum must be easy to find, so the
  // obvious German URLs all resolve to the same page.
  if (path === 'legal' || path === 'imprint' || path === 'impressum' || path === 'datenschutz')
    return { page: 'legal' }
  if (path === 'library') return { page: 'library' }
  return { page: 'crypt' }
}

export function routeTo(route: Route): string {
  switch (route.page) {
    case 'crypt':
      return '/crypt'
    case 'library':
      return '/library'
    case 'card':
      return `/cards/${route.id}`
    case 'decks':
      return '/decks'
    case 'deck':
      return `/decks/${route.id}`
    case 'proxy':
      return `/decks/${route.deckId}/proxy`
    case 'review':
      return `/decks/${route.deckId}/review`
    case 'share':
      return `/share/${route.token}`
    case 'diff':
      return '/diff'
    case 'precons':
      return '/precons'
    case 'twda':
      return '/twda'
    case 'twda-deck':
      return `/twda/${route.id}`
    case 'inventory':
      return '/inventory'
    case 'limited':
      return '/limited'
    case 'table':
      return '/table'
    case 'rules':
      return '/rules'
    case 'changelog':
      return '/changelog'
    case 'help':
      return '/help'
    case 'about':
      return '/about'
    case 'legal':
      return '/legal'
    case 'settings':
      return '/settings'
    case 'account':
      return '/account'
  }
}

export function navigate(route: Route) {
  const path = routeTo(route)
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Spread onto an <a>: keeps a real href (right-click/open-in-new-tab/a11y all
 * work), but a plain left-click does a fast pushState navigation instead of a
 * full page reload. Modifier-clicks (ctrl/cmd/shift/alt) and middle-click are
 * left alone so "open in new tab" keeps working natively. */
export function linkProps(route: Route) {
  return {
    href: routeTo(route),
    onClick: (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      navigate(route)
    },
  }
}

/** Old `#/...` bookmarks/shared links still work: silently upgraded to the
 * equivalent real path via replaceState (no extra back-button entry) before
 * the first route is resolved. */
function resolveInitialPath(): string {
  const hash = window.location.hash
  if (hash.startsWith('#/')) {
    const legacyPath = '/' + hash.slice(2)
    window.history.replaceState(null, '', legacyPath || '/')
    return legacyPath
  }
  return window.location.pathname
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parsePath(resolveInitialPath()))
  useEffect(() => {
    const onChange = () => setRoute(parsePath(window.location.pathname))
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return route
}
