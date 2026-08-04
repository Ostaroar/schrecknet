# SchreckNet

**→ [schreck-net.com](https://schreck-net.com)**

An independent, ground-up card-search and deck-building application for
**Vampire: The Eternal Struggle (VTES)**, with a modern engine.
[VDB](https://github.com/smeea/vdb) is used as a feature and behavior
reference; SchreckNet does not reuse or depend on its source code.

**Scope: this site hosts the V5 format exclusively**, and covers card search/research
+ deck building only — no tournament or community-data features (no TWD/TDA/PDA
archives, no playtest program). The card pool is
[Black Chantry's official V5 format](https://www.blackchantry.com/2025/09/16/introducing-the-official-vampire-the-eternal-struggle-v5-format/)
— 28 products plus the promo cards they legalise individually — not simply
"everything released in the V5 era", a distinction that has bitten this project
more than once (see [ADR 0014](docs/adr/0014-v5-pool-from-krcg-formats.md)).
Deck legality, search filters and precons all derive from that pool. Preserving
every in-scope VDB *capability* — applied to the V5 pool — is the goal the
parity checklist measures against.

- ⚡ **WebAssembly core** — one Rust crate for deck logic, running in the browser
  (WASM) and on the server (native). Search, deck building, draw simulation, diffs
  and proxy generation all work **offline**.
- 🗃️ **SQLite everywhere** — the full card database ships to your browser (SQLite
  WASM + OPFS), and your decks and inventory live in a second local database that
  never leaves the device. The server shares the same migrations.
- 🤖 **MCP API** — a first-class [Model Context Protocol](https://modelcontextprotocol.io)
  server (Streamable HTTP + stdio) so AI agents can search cards, inspect precons
  and draw hands; every capability is mirrored on REST, neither surface ships one
  alone.
- 🐳 **Docker** — single container built and published to GHCR by GitHub Actions.
- 🎨 **Modern UI** — React 19 + TypeScript + Tailwind CSS 4 PWA, dark-first design.
  Losing no VDB capability is the explicit goal; the
  [parity checklist](docs/feature-parity.md) tracks it honestly — see that file for
  the current done/open/to-verify counts (they move often enough that a number here
  goes stale faster than the checklist itself).

## Status

🚧 Active development, but live and usable at
[schreck-net.com](https://schreck-net.com). Offline V5 card search — exact,
regex, semantic, and VDB-compatible structured/trait filters — is complete
across browser, REST and MCP, along with deck building, a local inventory with
precon ownership, and game groups. Account-based sync is not built yet.

**Your data stays on your device.** Decks and inventory live in the browser and
are never uploaded, so nothing is recoverable for you either — take a backup
from the *Data & backup* page ([ADR 0016](docs/adr/0016-local-backup-envelope.md)).

See [docs/roadmap.md](docs/roadmap.md) for phases and
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
| [docs/adr/](docs/adr/) | Why the significant decisions were made, including the ones that turned out wrong |
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
