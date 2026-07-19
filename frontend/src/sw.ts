// Hand-written app-shell service worker (no workbox / vite-plugin-pwa — see
// docs/adr for the "no new runtime deps without an ADR" rule; this file has
// zero dependencies so it doesn't need one).
//
// Scope: caches the built app shell (JS/CSS/wasm/HTML/manifest/icons) so a
// repeat visit loads and renders with no network. It deliberately does NOT
// touch /api/*, /data/*, or /models/* — the first two are dynamic/live, and
// /data/cards.sqlite specifically already has its own offline story via the
// OPFS-backed dbWorker.ts; caching it here too would be redundant and could
// race with that mechanism. Transformers.js owns a separate lazy model cache
// for /models/*, avoiding a second ~24 MB copy in this shell cache. Its local,
// content-hashed ONNX Runtime assets are normal static assets here.
//
// Strategy: network-first for document navigations, stale-while-revalidate
// for content-hashed static assets. A successful navigation is also stored
// under the stable /index.html key for offline SPA fallback. Vite's output
// filenames are content-hashed, so we don't (and can't) know them at SW-write
// time — nothing is precached on 'install'; the cache fills in as the app is
// used, which is enough for the "second visit works offline" requirement.

/// <reference lib="webworker" />
export {}

declare const self: ServiceWorkerGlobalScope

const CACHE_NAME = 'schrecknet-shell-v1'
// Owned by Transformers.js (see semanticSearch.ts). Keep it across shell SW
// upgrades; otherwise installing a new app build would silently force users
// to download the optional ~24 MB model again.
const SEMANTIC_MODEL_CACHE = 'transformers-cache'

const isExcludedPath = (pathname: string): boolean =>
  pathname.startsWith('/api') || pathname.startsWith('/data') || pathname.startsWith('/models')

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
        names
          .filter((name) => name !== CACHE_NAME && name !== SEMANTIC_MODEL_CACHE)
          .map((name) => caches.delete(name)),
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

      if (request.mode === 'navigate') {
        try {
          const response = await fetch(request)
          if (response.ok) await cache.put('/index.html', response.clone())
          return response
        } catch {
          const shell = await cache.match('/index.html')
          return shell ?? new Response('Offline', { status: 503, statusText: 'Offline' })
        }
      }

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

      return new Response('Offline', { status: 503, statusText: 'Offline' })
    })(),
  )
})
