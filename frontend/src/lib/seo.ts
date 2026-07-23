// Per-route title/description for useDocumentHead (docs/seo-geo-aeo-plan.md § 4.1).
// English-only for now, like TablePage — crawler-facing document metadata, not
// interactive UI copy; full i18n here would mean hreflang tags too, deferred.
import type { Route } from './route'
import type { DocumentHead } from './documentHead'

const SITE_NAME = 'SchreckNet'
const SITE_TAGLINE = 'VTES V5 card search and deck building'

function withSite(title: string): string {
  return `${title} — ${SITE_NAME}`
}

const STATIC_HEAD: Partial<Record<Route['page'], DocumentHead>> = {
  crypt: {
    title: withSite('Crypt search'),
    description: `Search all 218 V5 crypt (vampire) cards by clan, discipline, group, capacity, sect, title, and text. ${SITE_TAGLINE}.`,
  },
  library: {
    title: withSite('Library search'),
    description: `Search all 444 V5 library cards by type, discipline, clan requirement, cost, and text. ${SITE_TAGLINE}.`,
  },
  decks: {
    title: withSite('Decks'),
    description: `Build and manage VTES V5 decks offline in your browser. ${SITE_TAGLINE}.`,
  },
  inventory: {
    title: withSite('Inventory'),
    description: 'Track which VTES V5 cards you own and see what your decks are missing.',
  },
  limited: {
    title: withSite('Limited format'),
    description: 'Build a custom allowed/banned card pool for a VTES V5 limited or draft event.',
  },
  table: {
    title: withSite('Table'),
    description: 'Track games with your VTES playgroup and keep a shared leaderboard — no account needed.',
  },
  precons: {
    title: withSite('Precons'),
    description: 'Browse every official VTES V5 preconstructed starter deck by set.',
  },
  rules: {
    title: withSite('Rules reference'),
    description: 'An interactive VTES V5 turn structure and combat reference, derived from the official rules.',
  },
  changelog: {
    title: withSite('Changelog'),
    description: `What's new in ${SITE_NAME}.`,
  },
  help: {
    title: withSite('Help'),
    description: `How to find cards, build decks, and use ${SITE_NAME} offline.`,
  },
  about: {
    title: withSite('About'),
    description: `About ${SITE_NAME}, a VTES V5 card search and deck-building tool.`,
  },
  legal: {
    title: withSite('Impressum & Datenschutz'),
    description: `Impressum und Datenschutzerklärung für ${SITE_NAME} (Angaben gemäß § 5 DDG und DSGVO).`,
  },
}

const DEFAULT_HEAD: DocumentHead = {
  title: `${SITE_NAME} — ${SITE_TAGLINE}`,
  description: `${SITE_TAGLINE}. Search, build, and share VTES Fifth Edition decks offline.`,
}

/** Returns null for dynamic-id routes (card/deck/proxy/review/share) — those
 * set their own, more specific head once their async data loads; returning
 * null here means useDocumentHead no-ops instead of overwriting it. */
export function routeDocumentHead(route: Route): DocumentHead | null {
  return STATIC_HEAD[route.page] ?? null
}

export { DEFAULT_HEAD }
