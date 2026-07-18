# ADR 0003 — MCP as primary machine API, REST/OpenAPI as mirror

**Status:** accepted · 2026-07-18

## Context
The project explicitly wants an MCP API using the most compatible and modern protocol
variant, while staying usable from ordinary HTTP clients.

## Decision
- MCP server over **Streamable HTTP** (current spec revision; stateless-capable) at
  `/mcp`, plus stdio transport for local agent use. Implemented with the official
  Rust SDK (`rmcp`).
- Every capability is implemented once in `server/src/service/` and exposed through
  both MCP tools and `/api/v1` REST endpoints (OpenAPI 3.1 generated via utoipa).
  "Both or neither" is a review rule (AGENTS.md).
- Read-only card/TWD tools work unauthenticated; user tools use the same token as
  REST sessions.

## Alternatives considered
- **REST only**: not what was asked; agents get no typed tool surface.
- **GraphQL**: adds a second query language while SQLite+filter-schema already covers
  flexible querying; poor fit for agent tool-calling.
- **SSE (legacy MCP transport) only**: deprecated in favor of Streamable HTTP;
  we support Streamable HTTP as the modern, most compatible transport.

## Consequences
- AI assistants can drive the full app (search → build → validate → export).
- Thin-adapter discipline keeps the two surfaces from drifting.
