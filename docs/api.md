# API — MCP first, REST for compatibility

## MCP server

Transport: **Streamable HTTP** (current MCP spec revision) at `/mcp` — **live**, built
with the official Rust SDK (`rmcp` 2.x, `server/src/mcp.rs`), verified with a real
client handshake (`initialize` → `tools/list` → `tools/call`). **stdio** transport is
also live for local clients via `schrecknet-server --mcp-stdio`; both transports
instantiate the identical `SchreckNetMcp` handler and expose the same tools/resources.

### Tools

| Tool | Description |
| --- | --- |
| `search_crypt` | **Live.** Text/name search (`text_mode` scope + `text_regex` regex mode), clan, title, group, capacity range, disciplines (superior/inferior), V5 set history, precon, artist (`server/src/cards_db.rs`). Set history accepts `set_age=exact\|or_newer\|or_older\|not_newer\|not_older` and `set_print=any\|only\|first\|reprint`. Remaining vdb filters (OR-discipline-groups, sect, votes, traits) land incrementally — see docs/feature-parity.md |
| `search_library` | **Live.** Text scope + regex mode (`text_regex`), exact card type, clan/path and discipline requirements, independent blood/pool cost comparisons (`at_most`, `exact`, `at_least`), the same V5 set age/printing modes, precon, and artist. Remaining filters: capacity requirement, traits |
| `get_card` | **Live.** Card by id → text, printings, artists, rulings, translations (`server/src/card_detail.rs`) |
| `get_card_by_name` | **Live.** Exact case-insensitive canonical/ASCII name lookup; REST mirror: `GET /api/v1/cards/lookup?name=…` |
| `list_precons` | **Live.** Every V5 precon grouped by (set, precon) with a distinct-card count; REST mirror: `GET /api/v1/precons`. Card quantities per precon aren't tracked by the data source |
| `list_decks` / `get_deck` | Authenticated user's decks (or a deck shared via deck-in-URL) |
| `create_deck` / `update_deck` | Create/modify a deck (add/remove cards, metadata, branch ops) |
| `validate_deck` | Legality report for V5 (site default) / custom limited formats within the V5 pool |
| `import_deck` / `export_deck` | Formats: plain text, Lackey, JOL, XLSX |
| `diff_decks` | Structured diff of two decks/revisions |
| `draw_hand` | Draw simulator: opening crypt/library hands with seeded RNG |
| `get_inventory` / `update_inventory` | Collection management |

### Resources

- `card://{id}` — **Live.** Full V5 card JSON through an MCP resource template;
  calls the same `card_detail::get_card` service as the `get_card` tool and REST
- `deck://{share_id}` — public deck JSON
- `db://cards/meta` — **Live.** Card database schema/data versions, V5 counts,
  source, and included product names (same `cards.meta.json` served over HTTP)

Auth: MCP requests carry the same bearer/session token as REST; anonymous access is
allowed for read-only card tools.

## REST API

`/api/v1/…` mirrors the MCP tools 1:1, calling the same service functions.
`GET /api/v1/crypt/search` is **live** (`server/src/api.rs`), mirroring the
`search_crypt` MCP tool exactly. OpenAPI 3.1 generation (`utoipa`) and Swagger UI
are not yet wired up — tracked for when the REST surface grows past one endpoint.

## Design rule

Every capability ships in **both** surfaces or neither. Today that means
`server/src/cards_db.rs` (the one service function) called identically from
`server/src/mcp.rs` (MCP adapter) and `server/src/api.rs` (REST adapter) — this
splits into a proper `server/src/service/` module once there's more than one
capability to organize. Adding a feature without exposing it through MCP is a
review blocker (see AGENTS.md).
