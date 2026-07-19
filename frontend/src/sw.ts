// Hand-written app-shell service worker (no workbox / vite-plugin-pwa — see
// docs/adr for the "no new runtime deps without an ADR" rule; this file has
// zero dependencies so it doesn't need one).
//
// Scope: caches the built app shell (JS/CSS/wasm/HTML/manifest/icons) so a
// repeat visit loads and renders with no network. It deliberately does NOT
// touch /api/* or /data/* — those are dynamic/live endpoints, and
// /data/cards.sqlite specifically already has its own offline story via the
// OPFS-backed dbWorker.ts; caching it here too would be redundant and could
// race with that mechanism.
//
// Strategy: stale-while-revalidate for same-origin GET requests outside
// /api and /data. Vite's output filenames are content-hashed, so we don't
// (and can't) know them at SW-write time — nothing is precached on
// 'install'; the cache fills in as the app is used, which is enough for the
// "second visit works offline" requirement.

/// <reference lib="webworker" />
export {}

declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = 'schrecknet-shell-v1'

const isExcludedPath = (pathname: string): boolean =>
  pathname.startsWith('/api') || pathname.startsWith('/data')

self.addEventListener('install', () => {
  // No filename-based precaching possible (hashed build output). Activate
  // immediately so the new SW takes over without waiting on old tabs.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isExcludedPath(url.pathname)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(() => undefined)

      if (cached) {
        // Stale-while-revalidate: serve cache immediately, refresh in bg.
        event.waitUntil(network)
        return cached
      }

      const fresh = await network
      if (fresh) return fresh

      // Offline + no cache entry: for navigations, fall back to the cached
      // app shell root so SPA routing still renders.
      if (request.mode === 'navigate') {
        const shell = await cache.match('/index.html')
        if (shell) return shell
      }

      return new Response('Offline', { status: 503, statusText: 'Offline' })
    })(),
  )
})
