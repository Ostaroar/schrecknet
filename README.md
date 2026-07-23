# SchreckNet

An independent, ground-up card-search and deck-building application for
**Vampire: The Eternal Struggle (VTES)**, with a modern engine.
[VDB](https://github.com/smeea/vdb) is used as a feature and behavior
reference; SchreckNet does not reuse or depend on its source code.

**Scope: this site hosts the V5 format exclusively**, and covers card search/research
+ deck building only — no tournament or community-data features (no TWD/TDA/PDA
archives, no playtest program). The card pool is the VEKN-defined V5-legal list
(Fifth Edition-era products); deck legality, search filters and precons all derive
from that pool. Every in-scope VDB *capability* is preserved (see the parity
checklist) — applied to the V5 pool.

- ⚡ **WebAssembly core** — one Rust crate for deck logic, running in the browser
  (WASM) and on the server (native). Search, deck building, draw simulation, diffs
  and proxy generation all work **offline**.
- 🗃️ **SQLite everywhere** — the full card database ships to your browser (SQLite
  WASM + OPFS); the server uses the same schemas for accounts, sync and archives.
- 🤖 **MCP API** — a first-class [Model Context Protocol](https://modelcontextprotocol.io)
  server (Streamable HTTP + stdio) so AI agents can search cards, build and validate
  decks; mirrored REST/OpenAPI 3.1 for everything else.
- 🐳 **Docker** — single container built and published to GHCR by GitHub Actions.
- 🎨 **Modern UI** — React 19 + TypeScript + Tailwind CSS 4 PWA, dark-first design —
  with **zero features lost** relative to VDB (see [the parity checklist](docs/feature-parity.md)).

## Status

🚧 Active development. Offline V5 card search—including exact, regex, semantic,
and VDB-compatible structured/trait filters—is complete across browser, REST, and
MCP; deck-building parity is in progress. See [docs/roadmap.md](docs/roadmap.md)
for phases and [docs/architecture.md](docs/architecture.md) for the system design.

## Documentation

| | |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | System design & repo layout |
| [docs/feature-parity.md](docs/feature-parity.md) | Complete VDB feature checklist |
| [docs/api.md](docs/api.md) | MCP tools & REST surface |
| [docs/data.md](docs/data.md) | Card data pipeline & schemas |
| [docs/domain-vtes.md](docs/domain-vtes.md) | VTES primer for contributors & agents |
| [docs/design.md](docs/design.md) | Design system |
| [AGENTS.md](AGENTS.md) | Instructions for AI coding agents |

## Run locally

From the repository root:

```bash
./scripts/dev.sh
```

This starts the Rust server at <http://localhost:8000>, starts Vite at
<http://localhost:5173>, and opens the Vite URL. Vite proxies `/api`, `/data`,
and `/models` to the Rust server. Press `Ctrl-C` once to stop both processes.

The script installs frontend packages, rebuilds the Rust WASM bindings when
needed, and creates or refreshes `dist/cards.sqlite` whenever the checked-out
data pipeline is newer than the local database. This prevents an old local
schema from surviving a pull.

To exercise the production-style single-server build instead:

```bash
./scripts/dev.sh --prod --rebuild
```

That builds the frontend and serves it from <http://localhost:8000>. Node 22 LTS
is recommended if Vite hangs on a newer Node release.

## Acknowledgments & legal

- Built on the shoulders of [smeea/vdb](https://github.com/smeea/vdb) (MIT) and the
  [KRCG](https://static.krcg.org) project's card data and rulings, with normalized
  crypt and library requirement metadata from
  [VEKN's official card lists](https://www.vekn.net/card-lists).
- Code licensed under [MIT](LICENSE).
- Portions of the materials are the copyrights and trademarks of Paradox Interactive AB,
  and are used with permission under the **Dark Pack** agreement. All rights reserved.
  For more information please visit [worldofdarkness.com](https://www.worldofdarkness.com).
