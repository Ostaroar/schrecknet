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
| `search_library` | **Live.** MVP filters: text/name search, exact card type, clan/path requirement. Remaining vdb filters (discipline, blood/pool cost range, capacity requirement, traits, set/precon/artist, regex mode) land incrementally |
| `get_card` | Card by id/name → text, sets, printings, artists, rulings, translations, TWD stats |
| `list_decks` / `get_deck` | Authenticated user's decks (or public deck by share id) |
| `create_deck` / `update_deck` | Create/modify a deck (add/remove cards, metadata, branch ops) |
| `validate_deck` | Legality report for V5 (site default) / custom limited formats within the V5 pool |
| `import_deck` / `export_deck` | Formats: VDB URL, plain text, Lackey, JOL, TWD, XLSX |
| `diff_decks` | Structured diff of two decks/revisions |
| `draw_hand` | Draw simulator: opening crypt/library hands with seeded RNG |
| `search_twd` | TWD archive search (all UI filters: year, players, cards, tags, …) |
| `search_pda` | Public Deck Archive search |
| `get_inventory` / `update_inventory` | Collection management |
| `recommend_cards` | Cards frequently co-played with a given deck (TWD co-occurrence) |

### Resources

- `card://{id}` — card JSON
- `deck://{share_id}` — public deck JSON
- `db://cards/meta` — card database version/date

Auth: MCP requests carry the same bearer/session token as REST; anonymous access is
allowed for read-only card/TWD tools.

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
