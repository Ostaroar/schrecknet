# SEO / GEO / AEO (Design & Dev Plan)

Status: **S1-S5 implemented; S6 awaits a real deployment domain** (2026-07-23).
Requested directly by the project owner: the site
needs to be findable — through traditional search engines (SEO), through AI answer
engines and LLM browsing/training crawlers (GEO — Generative Engine Optimization —
and AEO — Answer Engine Optimization), and through link previews in chat apps. Target
deployment is a single Docker image on a **DigitalOcean Kubernetes "Basic" node pool**
(see § 5). Same style as [docs/inventory-plan.md](inventory-plan.md) and
[docs/game-groups-plan.md](game-groups-plan.md).

---

## 1. The actual problem

SchreckNet is a client-rendered SPA using **hash routing** (`#/cards/123`,
`#/rules`, …) deliberately chosen in `frontend/src/lib/route.ts` to avoid a router
dependency (AGENTS.md hard rule 7). That choice has a side effect nobody was
optimizing against until now: **everything after the `#` never reaches the server**.
The server (`server/src/main.rs`) serves the exact same `index.html` for every path,
and that document has one static `<title>` and no description/OG/canonical tags
(`frontend/index.html`). Client-side JS then reads `location.hash` and swaps content
in the DOM.

That's invisible to most of the audience we're trying to reach:

- **Traditional SEO (Google/Bing):** Googlebot executes JS reasonably well and *can*
  sometimes resolve hash-fragment content, but it's unreliable, slow to reindex, and
  every card "page" would report the same canonical URL (`/`) with the same generic
  title — Google explicitly deduplicates on that. Bing's JS execution is weaker still.
- **GEO/AEO (ChatGPT, Claude, Perplexity, Google's AI Overviews, etc.):** these are
  fed either by live browsing tools or by crawlers that fetch raw HTML and generally
  **do not execute JavaScript at all** (`GPTBot`, `ChatGPT-User`, `ClaudeBot`,
  `anthropic-ai`, `PerplexityBot`, `Google-Extended`, `CCBot`, …). To any of them,
  every one of our 662 card pages and the rules reference currently looks like an
  empty `<div id="root">`.
- **Chat-app link previews** (Slack/Discord/iMessage unfurls, which matter for a
  hobbyist community sharing card links) also read static `<meta>` tags without
  running JS.

So this isn't a metadata-polish task — it's a **rendering-architecture gap**. The
card database is exactly the kind of evergreen, factual, high-answer-value content
GEO/AEO crawlers want ("what does Blood-Cursed Elder do in VTES?"), but none of it is
currently reachable without executing our bundle.

## 2. Goals / non-goals

**Goals**
- Every card detail page, and a handful of reference/marketing routes (rules,
  precons, help/about, changelog), is reachable at a **real URL path** and returns
  real HTML content plus correct `<title>`/description/canonical/OG/Twitter tags on
  the **first, unauthenticated, no-JS response** — the thing every crawler class
  above actually reads.
- `robots.txt` + `sitemap.xml` exist and are correct.
- Structured data (JSON-LD) on card pages for traditional rich-snippet eligibility.
- A cheap `llms.txt` for the emerging GEO convention (§ 4.6) — low cost, unproven
  standard, so kept proportionate.
- None of this weakens the "no accounts, code-gated" trust model already shipped for
  [game-groups](game-groups-plan.md) — see the guardrail in § 7, this is the
  easiest way this effort could accidentally cause harm.

**Non-goals**
- **No framework migration.** Not adopting Next.js/Astro/Remix/SSR-everything. That
  would replace React 19 + Vite + the hand-rolled router with a completely different
  rendering model, for a codebase whose stated architecture is "offline-first SPA +
  WASM core + static Docker image." Wildly disproportionate to the problem, and
  AGENTS.md hard rule 7 would require justifying the dependency anyway — it wouldn't
  survive that bar next to the option in § 4.2.
- **No keyword-stuffing/content-farming.** The card text is Dark Pack IP (AGENTS.md
  hard rule 6) reproduced verbatim from the official database — the SEO surface is
  "make the real content reachable," not "generate more content."
- **No paid ads/analytics stack.** Out of scope for this plan; if wanted later, own
  discussion (also has privacy/offline-first implications worth its own review).

## 3. Content inventory — what should (and must not) be indexed

| Content | Indexable? | Why |
|---|---|---|
| Card detail pages (662, crypt+library) | **Yes — highest value** | Factual, evergreen, exactly what GEO/AEO answer engines want to cite |
| `#/rules` game-loop reference | **Yes** | Also factual/evergreen, the "beyond parity" differentiator (Phase 5) |
| Precons list, Help, About, Changelog | **Yes, lower priority** | Cheap wins once the mechanism exists |
| Crypt/Library search UI itself | **No** (or minimal) | It's a tool, not a document; no stable canonical URL per query today |
| Local decks (`#/decks/*`), inventory, limited format | **No — cannot be indexed anyway** | Data lives only in the visitor's own browser OPFS `user.sqlite`; the server never sees it. No action needed, just documented so nobody "fixes" this later. |
| Deck-in-URL share tokens (`#/share/<token>`) | **No — explicit `noindex`** | User-generated, unbounded, no canonical value, and indexing a token means it's now searchable, which nobody sharing a private deck link expects |
| Game-groups `#/table` + any `/api/v1/groups/*` | **No — explicit `noindex` + `robots.txt` disallow** | The whole feature's trust model (see [docs/game-groups-plan.md](game-groups-plan.md) § 1–2) is "unguessable code = private, like a shared doc link." A search engine caching or suggesting a group code would break that invariant. This is the guardrail most worth double-checking before shipping. |

## 4. Technical approach (no new runtime dependency)

### 4.1 Quick win first: per-route `<title>`/meta via a tiny head-tag hook (S1)
A small hand-rolled hook (`useDocumentHead({title, description})` called from each
page component, no dependency — just `document.title =` and upserting a couple of
`<meta>` nodes in an effect) fixes what JS-executing crawlers and share-preview bots
*can* already see, and is needed regardless of the routing migration below. Ships
first because it's cheap and immediately improves Google/social-preview behavior,
**but it does not fix GEO/AEO** — those crawlers won't run the effect. Framed
honestly as partial credit, not the fix.

### 4.2 Path-based routing migration — **needs its own ADR** (S2)
Replace `location.hash` / `hashchange` in `frontend/src/lib/route.ts` with the
History API (`history.pushState` + `popstate`) so `#/cards/123` becomes `/cards/123`.
Still zero dependencies — same hand-rolled router shape, different event source.
This is the load-bearing change: once the path *is* the route, the server can tell
requests apart and answer them differently, which hash fragments structurally
cannot do (`main.rs`'s `ServeDir::fallback(ServeFile::new(index))` already serves
`index.html` for *any* unmatched path today — that part needs no change — but
prerendering per § 4.3 needs the server to serve something *other* than the generic
shell for specific real paths).
Per AGENTS.md ("big design decisions are recorded in `docs/adr/`"), this gets
`docs/adr/0008-path-based-routing-for-seo.md` before implementation: alternatives
considered (keep hash + prerender-only-index, a router library, framework
migration), and the compatibility note that every internal link/`navigate()` call
site needs updating in the same change.

### 4.3 Build-time static prerendering for card pages (S3)
`schrecknet-data` already has every card's full row in `cards.sqlite` at build time
and already writes into `dist/` (`schrecknet-data build --out dist`, wired into the
Dockerfile's `rust-build` stage). Extend it with a prerender step that, per card,
writes a real static HTML document to e.g. `dist/cards/{id}/index.html` containing:
- Correct `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open
  Graph + Twitter Card tags (name, primary clan/discipline line as description)
- The actual card text/type/clan/disciplines/capacity as semantic HTML (headings +
  definition list — not a JS-rendered placeholder)
- JSON-LD (`schema.org/CreativeWork`, closest reasonable fit — there's no official
  "trading card" type; documented as a judgment call, not a blocker)
- A same-bundle `<script type="module" src="/src/main.tsx">` so the SPA still boots
  on top for interactivity (search, add-to-deck, language switch) — this is
  progressive enhancement, not a second rendering stack; the static markup **is**
  the first paint, React mounts over it afterward
*(As implemented: a flat `cards/{id}.html` file plus a small explicit
`GET /cards/{id}` route reading it turned out simpler than a nested
`cards/{id}/index.html` tree relying purely on `ServeDir`'s directory
semantics — see the S3 milestone note below for what actually shipped.)*

### 4.4 Prerender secondary routes (S4)
Same mechanism, much smaller: `#/rules` → `/rules/index.html` (i.e. the current
JSON-derived game-loop content rendered as static text, not just an empty shell),
`/precons/`, `/help/`, `/about/`, `/changelog/`. Lower priority than card pages
because there are 5 of these vs. 662 cards, but cheap once § 4.3's plumbing exists.

### 4.5 `robots.txt` + `sitemap.xml` (S1, mostly independent of the rest)
- `robots.txt`: allow everything by default; **explicitly allow** the named GEO/AEO
  crawler user-agents (`GPTBot`, `ChatGPT-User`, `ClaudeBot`, `anthropic-ai`,
  `PerplexityBot`, `Google-Extended`, `CCBot`, `Bytespider`, …) since the whole point
  is to be citable by them, unlike sites trying to block AI training; **disallow**
  `/table` and `/share/` per § 3.
- `sitemap.xml`: generated by `schrecknet-data` at build time (it already knows every
  card id and every static route) — one `<url>` per card + the handful of static
  routes. Regenerates automatically as the card pool grows; never hand-maintained.

### 4.6 `llms.txt` (S5, low effort, unproven standard)
A plain-text root file (emerging, informal convention — not officially adopted by
any major AI vendor yet) summarizing what the site is and linking to the sitemap /
rules reference / a few landmark card pages. Minutes of effort, explicitly flagged
as speculative so nobody over-invests if the convention doesn't stick.

## 5. Deployment: DigitalOcean Kubernetes, Basic plan

Everything above is a **build-time** change (prerendering happens once, in the
existing `schrecknet-data build` step already baked into the `rust-build` Docker
stage) plus **static files** served by the same `axum` `ServeDir`/`ServeFile`
fallback already in `server/src/main.rs`. That matters specifically for a Basic
DOKS node pool:
- **No new runtime cost.** No prerendering server, no headless-Chrome sidecar, no
  extra pod — the existing single container just ships a few hundred more static
  HTML files inside the image it already builds.
- **No new dependency, no new ADR needed for the deployment itself** — only for the
  routing change (§ 4.2). The image, `Dockerfile`, and `docker.yml` GHCR publish
  step stay exactly as they are.
- **Prerequisites this plan depends on but doesn't implement** (infra/ops, not
  application code, and no k8s manifests exist in this repo yet): a **stable custom
  domain with HTTPS** (canonical URLs matter a lot for SEO; a raw DO Load Balancer
  IP or a `*.ondigitalocean.app`-style hostname does not), and ideally a CDN in front
  (Cloudflare or DO's own) so the now-cacheable static/prerendered pages get served
  fast globally — a Basic node pool has limited pod resources, so pushing cacheable
  GET traffic to an edge cache instead of the origin is worth doing regardless of
  SEO. Neither blocks S1–S5 above; they're called out so whoever wires the k8s
  ingress knows what the app now expects.

## 6. Milestones

### S1 — Fast, low-risk wins (no architecture change) ☑
- Per-route `<title>`/description via a hand-rolled head-tag hook (§ 4.1):
  `frontend/src/lib/documentHead.ts` (the hook) + `frontend/src/lib/seo.ts` (per-route
  copy), wired into `App.tsx` for the static routes and into `CardPage.tsx` for the
  dynamic, highest-value card routes (title + a real card-text-derived description,
  once the async card fetch resolves).
- `robots.txt` (`frontend/public/robots.txt`) — allow-by-default, explicit named
  allow-list for GEO/AEO crawlers (§ 4.5), `Disallow` for `/table` and `/share/`.
- **`sitemap.xml` deliberately deferred to S3/S4.** A sitemap of hash-fragment URLs
  (`#/cards/123`) has no real value — search engines don't crawl fragments as
  separate documents, so listing 662 of them would just be noise. Shipping a
  low-value stub now would look done without being useful; it lands for real once
  S2/S3 give us real per-card paths to list.
- **DoD:** live-verified in-browser: `document.title`/`<meta name="description">`/
  `og:title` update correctly navigating between routes and on a real card page
  (confirmed against Aaradhya, The Callous Tyrant — clan/group/text-derived
  description generated correctly); `robots.txt` served as plain ASCII (an initial
  em-dash/§ draft mangled under the dev server's default text/plain encoding —
  rewritten ASCII-only, since robots.txt should be plain ASCII by convention
  anyway) with the disallow/allow-list rules present; `tsc --noEmit` + `vite build`
  both clean.

### S2 — Path-based routing (own ADR: `docs/adr/0008-path-based-routing-for-seo.md`) ☑
- Migrated `route.ts`/`navigate()`/every internal link from `#/x` to `/x`;
  `history.pushState` + `popstate` replacing `location.hash` + `hashchange`. New
  `linkProps(route)` helper spreads `{href, onClick}` onto the few raw `<a>` tags
  (`SearchDeckPanel.tsx`, `CardDetailPanel.tsx`) — plain left-click does a fast
  `pushState` nav, modifier/middle-clicks fall through to native "open in new tab."
  `lib/deckStore.ts`'s share-link builder updated to not prepend the current page's
  `pathname` (real `routeTo()` output is already a complete path).
- **DoD:** live-verified against the real server (not just the Vite dev server, to
  exercise the actual SPA-fallback path): `curl`ing `/cards/{id}` and `/table`
  directly both return 200 or via the fallback; deep-link browser load of
  `/cards/201733` resolves to the correct card title; an old `#/table` bookmark
  silently upgrades to `/table` via `replaceState`; clicking an in-app link does a
  no-reload `pushState` navigation (confirmed with a `window` marker surviving the
  click); browser back navigation correctly restores the previous route/title.
  `server/src/main.rs` needed zero changes — its existing `ServeDir` fallback
  already served `index.html` for any unmatched path. `tsc --noEmit` clean.

### S3 — Prerendered card pages ☑
- `data/src/prerender.rs` + a new `schrecknet-data prerender` subcommand: reads
  every card from `cards.sqlite`, HTML-escapes the (untrusted, externally
  sourced) card text, and writes one static file per card to
  `{out}/cards/{id}.html` — real `<title>`/description/OG/Twitter/canonical/
  JSON-LD in `<head>`, and real semantic HTML (name, clan/type summary,
  disciplines, card text, printings, artists, Dark Pack notice) inside
  `<div id="root">` instead of leaving it empty. Reuses the frontend's own
  built `index.html` as a template via plain string find/replace (own
  controlled input, no HTML-parser dependency) — its hashed `<script>`/`<link>`
  tags carry over untouched, so the SPA still boots on top for interactivity.
  `--base-url` is optional; omitted, the page just skips the canonical link and
  JSON-LD `url` rather than baking in a wrong domain (none is chosen yet, see
  § 5). A small new `GET /cards/{id}` axum handler
  (`server/src/api.rs::get_prerendered_card`) reads the matching static file
  and falls back to the SPA shell for an id with none (unknown id — the SPA's
  existing client-side "card not found" UI takes it from there). This is a
  correction to this doc's earlier "no new server code" framing: a ~15-line
  static-file-read handler was needed after all, since `ServeDir`'s directory/
  trailing-slash semantics didn't cleanly map a flat `{id}.html` file onto an
  extension-less `/cards/{id}` URL.
- **Dockerfile:** a new `prerender-build` stage (Debian trixie, matching
  `rust-build`'s glibc) runs the compiled `schrecknet-data` binary against
  `rust-build`'s `cards.sqlite` and `web-build`'s built `dist/`, writing the
  `cards/` folder into that same `dist/` before the final distroless stage
  copies it. Confirmed the `prerender` subcommand doesn't touch fastembed/ort
  (`otool -L` on a local build shows no linked ONNX runtime dylib — `ort`
  dlopens it lazily on first *use*, which `prerender` never triggers), so this
  stage doesn't need the exact ONNX-capable runtime the final image does.
  **Verified green in CI** (`docker.yml` run 29990857841, triggered by the
  commit that fixed the e2e smoke tests below — full multi-stage build
  including `prerender-build` succeeded, confirming the ONNX-dlopen
  reasoning held up in the real Debian-trixie-slim environment, not just
  locally on macOS).
- **DoD:** live-verified locally against the real (non-Docker) server binary:
  `curl http://127.0.0.1:8000/cards/201733` with no JS returns real card text,
  the correct title/description/OG tags, and valid JSON-LD (`cargo test -p
  schrecknet-data` also covers escaping + template substitution in isolation);
  an unknown id falls back to the SPA shell; opening the same URL in a real
  browser renders the full interactive SPA on top with no console errors.
  `cargo test --workspace` and `cargo clippy --workspace --all-targets -- -D
  warnings` both clean.

### S4 — Secondary pages + sitemap ☑
- `/precons`, `/rules`, `/help`, `/about`, and `/changelog` are build-time
  prerendered and served by explicit extensionless routes, with real title,
  description, social metadata, canonical URL (when configured), and semantic
  no-JS body content.
- `content/static-pages.en.json` is the single English source for
  help/about/changelog; both React's typed i18n catalog and Rust's prerenderer
  consume it. The rules page consumes the same generated `gameloop.json` as the
  interactive browser reference.
- Sitemap generation is data-driven: root + five static pages + every card
  (668 URLs for the current V5 pool). It runs only when `--base-url` (Docker
  `SITE_URL`) is set because sitemap locations must be absolute; an unknown
  production domain is never replaced with a misleading placeholder.
- Tests assert shared-copy rendering, game-loop rendering, canonical links,
  complete sitemap membership, and exclusion of `/table` and `/share/`.

### S5 — GEO/AEO-specific extras ☑
- ☑ `robots.txt` GEO/AEO crawler allow-list (§ 4.5) — shipped in S1
  (`frontend/public/robots.txt` names GPTBot/ChatGPT-User/ClaudeBot/
  anthropic-ai/PerplexityBot/Google-Extended/CCBot/Bytespider explicitly).
- ☑ `llms.txt` (§ 4.6) — `frontend/public/llms.txt`: what the site is, the Dark
  Pack attribution, links to `/precons` and the card/search/rules/decks surfaces,
  a note on the MCP+REST API, and an explicit "don't index /table or /share/*"
  note for crawlers that read it (reinforcing, not replacing, `robots.txt`'s
  `Disallow`). Kept plain ASCII after the same em-dash/encoding lesson from S1's
  `robots.txt` draft — checked with `grep` for non-ASCII bytes before shipping.
- **DoD met:** `robots.txt` already named the crawlers (verified live in S1);
  `llms.txt` verified served correctly via a real local server (`curl
  /llms.txt`) and present in `dist/` after `vite build`.

### S6 — (Optional, infra-adjacent, not blocking)
- Verify Core Web Vitals / Lighthouse SEO score on the deployed DO instance once a
  domain + CDN are in place; tune cache headers for the new static/prerendered
  paths. Overlaps with Phase 4's existing performance-budget item.

## 7. Guardrails

- **No new runtime dependency without an ADR** (AGENTS.md hard rule 7) — the plan
  above is designed to need exactly one ADR (§ 4.2's routing change) and zero new
  npm/cargo dependencies otherwise.
- **Never let a private surface become indexable.** `/table` (game-groups) and
  `/share/<token>` (deck-in-URL) must carry `noindex` and be `Disallow`'d in
  `robots.txt`, and must never appear in `sitemap.xml`. This is the one guardrail
  that, if missed, would actively undermine a feature already shipped on the "no
  accounts, unguessable code" trust model — check it explicitly before closing S1/S5.
- **Don't break the offline PWA contract.** The service worker (`frontend/src/
  sw.ts`) deliberately excludes `/api/*` and `/data/*` from its cache; the new
  prerendered static routes should fit its existing network-first-for-documents /
  stale-while-revalidate-for-assets strategy without special-casing, but confirm
  live once S3 lands.
- **Old links must keep working.** S2's hash → path migration needs a redirect (or
  a tiny compatibility shim) for existing `#/...` URLs already shared/bookmarked —
  don't silently 404 them.
- **Card text stays Dark Pack-attributed** (AGENTS.md hard rule 6) on every newly
  static, newly crawlable page — same footer notice as the SPA, not dropped just
  because it's now server-rendered HTML.
