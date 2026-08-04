# AGENTS.md — instructions for AI agents working in this repo

This file is the canonical, tool-agnostic instruction set for any AI coding agent
(Claude Code, Copilot, Cursor, Codex, …). `CLAUDE.md` points here.

## What this project is

**SchreckNet** — an independent, ground-up VTES card-search and deck-building
application. [smeea/vdb](https://github.com/smeea/vdb) (vdb.im) is a feature
and behavior reference; SchreckNet does not reuse or depend on its source code.
Its architecture consists of:

- **WebAssembly**: one Rust `core/` crate for all domain logic, compiled to WASM for
  the browser and linked natively into the server
- **SQLite** as the only storage tech (browser: SQLite WASM + OPFS; server: rusqlite)
- **MCP** (Model Context Protocol, Streamable HTTP + stdio) as the primary machine
  API, with a mirrored REST/OpenAPI 3.1 surface
- **React 19 + TypeScript + Vite + Tailwind CSS 4** PWA frontend, modern design,
  offline-first
- **Docker** image built by GitHub Actions → GHCR

**Scope: V5 only, everywhere — cards and tournament data alike.** The site hosts
exclusively the V5 format of VTES: the card pool is the VEKN V5-legal list
(Fifth Edition-era products). The data pipeline filters to that pool; legality
checking implements V5 rules (plus custom limited formats *within* the V5
pool); filter options (clans, sects, titles, disciplines, sets, precons) are
derived from the pool at build time, never hardcoded from the full VTES
universe. **Tournament data (TWD)** — a read-only browser over
Tournament-Winning Decks — is in scope as of docs/adr/0018, sourced from
`api.krcg.org`'s TWDA endpoints and **confirmed V5 by card-membership check
against our own pool at ingestion time, never by release-date guessing**
(see `data/src/v5pool.rs`'s doc comment for why guessing is a real, repeated
incident class). TDA, PDA, the playtest program, Hall of Fame, seating
utilities, and co-occurrence recommendations remain out of scope — see ADR
0018 for the line between "reactivated" and "still excluded." Deck-in-URL
sharing and common plaintext import/export formats (Lackey, JOL) stay in
scope — that's deck building interop, not a tournament feature.

**Prime directive: feature parity.** The independent implementation must not lose a single in-scope vdb feature.
`docs/feature-parity.md` is the authoritative checklist — when you implement something,
check it off there in the same PR. When behavior is ambiguous, verify against the live
site (https://vdb.im) and the original source (https://github.com/smeea/vdb); items
marked ✎ specifically need that verification.

## Read before coding

| Doc | Purpose |
| --- | --- |
| `docs/architecture.md` | System design, repo layout, runtime topology |
| `docs/feature-parity.md` | The checklist. The definition of done for v1.0 |
| `docs/domain-vtes.md` | VTES rules/glossary — read before touching deck logic |
| `docs/data.md` | Card data pipeline + SQLite schemas |
| `docs/api.md` | MCP tools + REST rules |
| `docs/design.md` | Design tokens, component conventions, mockups |
| `docs/adr/` | Why the big decisions were made — don't relitigate silently |

## Hard rules

1. **Domain logic goes in `core/` (Rust), never duplicated in TS.** If the browser and
   server both need it, it belongs in `core/`. TS may orchestrate, not re-implement.
2. **Every user-facing capability ships through MCP + REST or not at all.** Handlers
   live in flat modules under `server/src/` (`cards_db.rs`, `deck_tools.rs`,
   `game_groups.rs`, `twda_db.rs`, `accounts.rs`, …); MCP (`mcp.rs`) and REST
   (`api.rs`) are thin adapters over the same service functions.
3. **SQLite only.** No ORM; hand-written SQL through the typed data layer. One shared
   migration set for browser `user.sqlite` and server `app.sqlite`.
4. **Offline-first.** Card search, deck editing, stats, draw sim, diff, proxies must
   work with the network unplugged. Server-only features degrade gracefully.
5. **Golden tests against vdb.** For search filters, format import/export, legality
   checks and deck-URL encoding: capture fixtures from vdb/vdb.im and assert byte/set
   equality. Parser bugs here corrupt users' decks — treat as critical.
6. **Dark Pack compliance.** Card images/names © Paradox Interactive AB. Keep the Dark
   Pack notice in the footer and README; never commit card images to the repo.
7. **No new runtime dependencies without an ADR** (one short markdown file in
   `docs/adr/`, numbered, with alternatives considered).

## Conventions

- Rust: 2021+ edition, `cargo clippy -- -D warnings`, `cargo fmt`; errors via
  `thiserror`; no `unwrap()` outside tests.
- TypeScript: strict mode, no `any` in `src/` (CI enforces); components function-style;
  state via TanStack Query (server) + Zustand (local); styling exclusively Tailwind
  tokens from `docs/design.md`.
- Commits: Conventional Commits (`feat:`, `fix:`, `data:`, `docs:` …).
- Tests colocated; `cargo test` + `vitest` + Playwright smoke run in `ci.yml`.
- i18n: all UI strings through the i18n layer from day one; card-text translations
  come from the data pipeline, not the UI bundle.

## Commands (keep this section updated!)

```bash
# rust workspace (core + server + data)
cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# core to wasm — REQUIRED before any frontend build/dev (deck legality runs
# as real compiled Rust, not a JS reimplementation; frontend/src/wasm/ is a
# gitignored build artifact, wired into ci.yml and the Dockerfile already)
cargo build -p schrecknet-core --target wasm32-unknown-unknown   # fast sanity check
wasm-pack build core --target web --out-dir ../frontend/src/wasm # actual bindings frontend imports

# server (serves frontend/dist + /healthz + /api/v1/meta + /data/* on :8000)
cargo run -p schrecknet-server
# local MCP clients over stdin/stdout (same tools/resources as HTTP /mcp)
cargo run -p schrecknet-server -- --mcp-stdio
# env: SCHRECKNET_BIND, SCHRECKNET_STATIC_DIR, SCHRECKNET_DATA_DIR (dir
# containing cards.sqlite + cards.meta.json, served at /data/*),
# SCHRECKNET_MODEL_DIR (verified local ONNX bundle), SCHRECKNET_APP_DB

# data pipeline -> dist/cards.sqlite + cards.meta.json
# fetches KRCG vtes.json + VEKN's official card-list ZIP (needs network);
# both cached 24h under .cache/ (gitignored) via SCHRECKNET_DATA_CACHE.
# Also fetches and
# checksum-verifies the ~23 MB semantic ONNX model pinned by
# models/semantic.json, caches it under .cache/semantic/, embeds all V5 cards,
# and emits browser-ready assets under dist/models/semantic/.
cargo run -p schrecknet-data -- build --out dist

# canonical V5 rules DOT -> typed frontend statechart data
cargo run -p schrecknet-data -- gameloop

# frontend — run wasm-pack (above) once, and the server first (`cargo run -p
# schrecknet-server`, needs dist/cards.sqlite built above) so /api and /data
# proxy correctly
cd frontend && npm install && npm run dev   # Vite dev server, proxies /api + /data to :8000
npm run build                               # tsc --noEmit && vite build

# semantic end-to-end quality gate — requires dist/ from the data command,
# frontend/dist from npm run build, target/debug/schrecknet-server, and either
# `npx playwright install chromium-headless-shell` or
# SCHRECKNET_CHROME_CHANNEL=chrome. Spawns/stops its own test server.
npm run test:semantic

# local backup/restore round-trip: seeds a user.sqlite from migrations/, restores
# it through the real Settings UI in a fresh browser profile, exports again, and
# compares every table + PRAGMA user_version. Same prerequisites as
# test:semantic. Uses node:sqlite, hence the --experimental-sqlite in the script
# (a no-op on newer Node, required on the 22 line CI pins).
npm run test:backup

# deck-wide "when can I play this?" distribution contract (cardTiming.ts) —
# pure TS, no wasm/server/browser needed; runs via esbuild's transform (already
# a Vite devDependency) directly against the source file.
npm run test:deck-timing

# full container
docker build -t schrecknet . && docker run -p 8000:8000 schrecknet
```

## Definition of done for any PR

1. Checklist item(s) ticked in `docs/feature-parity.md` (or none touched)
2. Tests for new logic (golden tests if it's parser/filter/legality territory)
3. MCP + REST surface updated together
4. `docs/` updated if behavior or commands changed
5. CI green, including the Docker build
