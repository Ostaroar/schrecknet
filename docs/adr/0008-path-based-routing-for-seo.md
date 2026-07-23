# ADR 0008 — path-based routing (replacing hash routing) for SEO/GEO/AEO

**Status:** accepted · 2026-07-23

## Context
`frontend/src/lib/route.ts` has used hash routing (`#/cards/123`, `#/rules`, …) since
Phase 1, chosen specifically to avoid a router library dependency (AGENTS.md hard
rule 7) — a `hashchange` listener plus a hand-rolled `parseHash`/`routeTo` pair is
enough for ~15 routes.

That choice has a side effect nobody was optimizing against until
[docs/seo-geo-aeo-plan.md](../seo-geo-aeo-plan.md): **everything after `#` never
reaches the server.** `server/src/main.rs` serves the identical `index.html` for
every path today, so every card "page" reports the same canonical URL (`/`) to any
crawler, and the vast majority of GEO/AEO crawlers (`GPTBot`, `ClaudeBot`,
`PerplexityBot`, …) never execute JS at all, so they never see anything past the
generic shell regardless. Real per-card URLs are the prerequisite for S3's
build-time prerendering (serving distinct static HTML per `/cards/{id}`) — hash
fragments structurally cannot do that, since the fragment is never sent in the HTTP
request.

This is a "big design decision" under AGENTS.md ("record it in `docs/adr/`, don't
relitigate it silently"), so it gets its own ADR before implementation, per the plan
document's own S2 milestone.

## Decision
- Replace `location.hash`/`hashchange` with the History API
  (`history.pushState`/`popstate`) in `frontend/src/lib/route.ts`. Same hand-rolled
  shape as before — `parseHash` becomes `parsePath` (reads `window.location.pathname`
  instead of the hash), `routeTo` returns real paths (`/cards/123` instead of
  `#/cards/123`), and `navigate()` calls `history.pushState` then manually dispatches
  a `popstate` event (browsers don't fire one automatically for `pushState`, only for
  back/forward). **Zero new dependencies** — this is the same "not a router library"
  reasoning as the original hash-routing choice, just a different event source.
- **Legacy-link redirect:** on first load, if `window.location.hash` still looks like
  an old `#/...` route, convert it to the equivalent real path via
  `history.replaceState` (not `pushState`, so it doesn't add a spurious back-button
  entry) before the initial route is resolved. Anyone with an old bookmarked or
  shared `#/cards/123` link keeps working, silently upgraded to `/cards/123`.
- **Click interception via a `linkProps(route)` helper**, not a `<Link>` component:
  spreads `{ href: routeTo(route), onClick }` onto a plain `<a>`, where `onClick`
  calls `history.pushState` + `navigate()` for a plain left-click but does nothing
  (letting the browser handle it natively) for modifier-clicks/middle-clicks, so
  ctrl/cmd-click-to-open-in-new-tab keeps working. The existing `<button onClick={()
  => navigate(...)}>` call sites (the majority of in-app navigation) are unaffected —
  they were never anchor tags and don't need `href`/interception at all.
- `server/src/main.rs` needs **no change**: `Router::new()...fallback_service(ServeDir::new(&static_dir).fallback(ServeFile::new(index)))`
  already serves `index.html` for any path that doesn't match a real static asset or
  an explicit `/api`/`/data`/`/models`/`/mcp` route — that's exactly the SPA-fallback
  behavior a real path like `/cards/123` needs on first load/deep-link/reload. This
  was already true before this ADR; it simply wasn't being exercised by anything
  other than `/`, since every other "route" was a hash fragment the server never saw.
  Verified live post-migration by curling a deep path directly.

## Alternatives considered
- **Keep hash routing, prerender only `/`:** doesn't solve the actual problem —
  crawlers still can't distinguish one card from another by URL, so there's nothing
  to prerender *to*. Rejected as not actually addressing the SEO/GEO/AEO goal.
- **A router library** (e.g. a minimal one like `wouter`, or full React Router):
  would be a new runtime dependency for a problem ~15 routes and a ~100-line
  hand-rolled module already solve; doesn't survive the AGENTS.md hard-rule-7 bar
  next to "just swap the event source."
- **Framework migration (Next.js/Astro/Remix) for real SSR:** already rejected in
  [docs/seo-geo-aeo-plan.md](../seo-geo-aeo-plan.md) § 2 (non-goals) as wildly
  disproportionate to an offline-first SPA + WASM-core + single-Docker-image
  architecture; restated here since it's the alternative this ADR is most often
  compared against.

## Consequences
- Every route gets a real, shareable, bookmarkable URL that matches what the SPA
  itself navigates to — no divergence between the "app route" and the "SEO route."
- Old `#/...` links (already shared, e.g. in the changelog or externally) keep
  working via the one-time redirect; no link rot.
- `lib/deckStore.ts`'s share-link builder (`${origin}${pathname}${routeTo(...)}`)
  must drop the `pathname` concatenation — with real paths, `routeTo()` already
  returns the complete path, and blindly prepending the *current* page's pathname
  (no longer always `/`) would produce a broken URL when a share link is generated
  from anywhere other than the deck list.
- Three raw `<a href="#/...">` tags (`SearchDeckPanel.tsx`) and one `routeTo()`-based
  `href` (`CardDetailPanel.tsx`) move to the new `linkProps()` helper.
- This is a prerequisite for S3 (prerendered card pages), not a complete SEO fix by
  itself — a crawler that doesn't run JS still sees an empty `<div id="root">` at
  `/cards/123` until S3 lands real static HTML there. Framed accurately in the plan
  doc as "the load-bearing change," not "the fix."
