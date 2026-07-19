# SchreckNet

A ground-up rebuild of [VDB](https://github.com/smeea/vdb) — card search and
deck building for **Vampire: The Eternal Struggle (VTES)** — with a modern
engine.

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

🚧 Planning/bootstrap. See [docs/roadmap.md](docs/roadmap.md) for phases and
[docs/architecture.md](docs/architecture.md) for the system design.

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

## Acknowledgments & legal

- Built on the shoulders of [smeea/vdb](https://github.com/smeea/vdb) (MIT) and the
  [KRCG](https://static.krcg.org) project's card data and rulings, with normalized
  requirement metadata from [VEKN's official card lists](https://www.vekn.net/card-lists).
- Code licensed under [MIT](LICENSE).
- Portions of the materials are the copyrights and trademarks of Paradox Interactive AB,
  and are used with permission under the **Dark Pack** agreement. All rights reserved.
  For more information please visit [worldofdarkness.com](https://www.worldofdarkness.com).
