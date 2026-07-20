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
| `search_crypt` | **Live.** Text/name search (`text_mode` scope + `text_regex` regex mode), clan, official VEKN sects (`sects` CSV/array + `sect_logic=all\|any\|none`), exact title (`non-titled` is the synthetic no-title value), VDB vote threshold (`votes=0` means none; `1`–`4` mean at least), VDB traits (`traits` CSV/array, all selected required), multi-group, capacity range, independently leveled discipline requirements and VDB-style OR rows, V5 set history, precon, artist, and VDB result ordering (`sort=capacity_desc\|capacity_asc\|clan\|group\|name\|sect`; default `capacity_desc`). Results include the hotlink-safe `image_url` used by browser previews. `groups` supersedes legacy `group`; `discipline_requirements` supersedes legacy `disciplines` + `disciplines_superior`; every `discipline_or` row requires one alternative. Set history accepts `set_age=exact\|or_newer\|or_older\|not_newer\|not_older` and `set_print=any\|only\|first\|reprint`. |
| `search_library` | **Live.** Text scope + regex mode (`text_regex`), exact card type, clan/path and discipline requirements, VDB discipline logic (`discipline_logic=all\|any\|none\|only`, plus `include_no_discipline`), official VEKN sect/title requirement tokens with All/Any/Not composition (`sect_requirements`, `title_requirements`, `*_requirement_logic`, and `include_no_sect_requirement`; `titled_specific` matches any specific title), derived vampire-capacity requirements (`capacity_requirement` + `capacity_requirement_mode=at_most\|at_least`), independent blood/pool cost comparisons (`at_most`, `exact`, `at_least`), VDB traits (`traits`, all selected required), the same V5 set age/printing modes, precon, artist, and `sort=requirement\|cost_desc\|cost_asc\|name\|type` (default `name`). Results include `image_url`. |
| `semantic_search` | **Live.** Local semantic retrieval over canonical English V5 card documents, optional crypt/library kind and existing structured filters, `limit` (1–50, default 20), and `min_score` (-1–1). The lazy native model and exact shared-Rust ranker return card summaries with cosine `score` + `model_id`. REST mirror: `POST /api/v1/cards/semantic` |
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
`GET /api/v1/crypt/search` and `GET /api/v1/library/search` mirror their exact-search
tools. `POST /api/v1/cards/semantic` is live and accepts JSON because nested
structured filters would be unwieldy in a query string. A minimal request is:

```json
{"query":"wake and block","kind":"library","limit":10}
```

`crypt` and `library` may contain the same filter objects accepted by their exact
search tools. Semantic retrieval is canonical-English-only in v1; the operation is
local and read-only. Invalid bounds return HTTP 400 and a missing model bundle returns
HTTP 503. OpenAPI 3.1 generation (`utoipa`) and Swagger UI are not yet wired up.

REST encodes advanced crypt composition compactly in the query string:

```text
groups=6,7
discipline_requirements=dom:superior,for:any
discipline_or=cel:superior|obf:any;ani:any|pro:superior
traits=enter%20combat,unlock
sort=clan
```

MCP uses the schema-native equivalents: number arrays, arrays of
`{"code":"dom","superior":true}` objects, and nested arrays for OR rows.

## Design rule

Every capability ships in **both** surfaces or neither. Today that means
`server/src/cards_db.rs` (the one service function) called identically from
`server/src/mcp.rs` (MCP adapter) and `server/src/api.rs` (REST adapter) — this
splits into a proper `server/src/service/` module once there's more than one
capability to organize. Adding a feature without exposing it through MCP is a
review blocker (see AGENTS.md).
