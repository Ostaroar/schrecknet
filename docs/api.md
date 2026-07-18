# API — MCP first, REST for compatibility

## MCP server

Transport: **Streamable HTTP** (current MCP spec revision) at `/mcp`, plus **stdio**
(`server --mcp-stdio`) for local clients. Implemented with the official Rust MCP SDK
(`rmcp`). Sessions are stateless-capable so the endpoint scales horizontally.

### Tools (initial surface)

| Tool | Description |
| --- | --- |
| `search_crypt` | Search crypt cards; input mirrors every UI filter (disciplines incl. superior/inferior + OR-groups, capacity, clan/path, sect, votes, titles, groups, traits, set/precon/artist, text/name/regex) |
| `search_library` | Search library cards; full filter parity likewise |
| `get_card` | Card by id/name → text, sets, printings, artists, rulings, translations, TWD stats |
| `list_decks` / `get_deck` | Authenticated user's decks (or public deck by share id) |
| `create_deck` / `update_deck` | Create/modify a deck (add/remove cards, metadata, branch ops) |
| `validate_deck` | Legality report for standard / V5 / 2-Players / custom limited formats |
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

`/api/v1/…` mirrors the MCP tools 1:1 (same handler layer). An **OpenAPI 3.1**
document is generated from code (`utoipa`) and served at `/api/openapi.json` with
Swagger UI at `/api/docs`. Cursor pagination, ETag caching on card data, JSON only.

## Design rule

Every capability ships in **both** surfaces or neither — handlers live in one service
layer in `server/src/service/`, with MCP and REST as thin adapters. Adding a feature
without exposing it through MCP is a review blocker (see AGENTS.md).
