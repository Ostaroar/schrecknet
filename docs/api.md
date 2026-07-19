# API — MCP first, REST for compatibility

## MCP server

Transport: **Streamable HTTP** (current MCP spec revision) at `/mcp` — **live**, built
with the official Rust SDK (`rmcp` 2.x, `server/src/mcp.rs`), verified with a real
client handshake (`initialize` → `tools/list` → `tools/call`). **stdio** transport
(`server --mcp-stdio`) for local clients is not yet implemented.

### Tools

| Tool | Description |
| --- | --- |
| `search_crypt` | **Live.** MVP filters: text/name search, clan, group (`server/src/cards_db.rs`). Remaining vdb filters (disciplines incl. superior/inferior + OR-groups, capacity range, sect, votes, titles, traits, set/precon/artist, regex mode) land incrementally — see docs/feature-parity.md |
| `search_library` | **Live.** Text scope, exact card type, clan/path and discipline requirements, independent blood/pool cost comparisons (`at_most`, `exact`, `at_least`), set, precon, and artist. Remaining filters: capacity requirement, traits, and regex mode |
| `get_card` | **Live.** Card by id → text, printings, artists, rulings, translations (`server/src/card_detail.rs`). ☐ lookup by name |
| `list_decks` / `get_deck` | Authenticated user's decks (or a deck shared via deck-in-URL) |
| `create_deck` / `update_deck` | Create/modify a deck (add/remove cards, metadata, branch ops) |
| `validate_deck` | Legality report for V5 (site default) / custom limited formats within the V5 pool |
| `import_deck` / `export_deck` | Formats: plain text, Lackey, JOL, XLSX |
| `diff_decks` | Structured diff of two decks/revisions |
| `draw_hand` | Draw simulator: opening crypt/library hands with seeded RNG |
| `get_inventory` / `update_inventory` | Collection management |

### Resources

- `card://{id}` — card JSON
- `deck://{share_id}` — public deck JSON
- `db://cards/meta` — card database version/date

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
