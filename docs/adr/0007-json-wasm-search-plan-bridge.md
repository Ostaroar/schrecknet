# ADR 0007 — JSON bridge for shared WASM search plans

**Status:** accepted · 2026-07-21

## Context

Exact card-search SQL had grown independently in the native server and the
TypeScript browser adapter. Both copies were tested, but every new VDB-compatible
filter still required matching edits to two dynamic query builders. The query
planner is card-domain behavior and belongs in `schrecknet-core`; SQLite execution
and row mapping remain platform adapters.

The browser needs to pass a structured filter object into WASM and receive a query
plus a heterogeneous list of bound SQLite values. `wasm-bindgen` does not directly
support these nested Rust structures without either a serialization layer or a very
wide, brittle function signature.

## Decision

- `core::search_plan` owns a platform-neutral `QueryPlan { sql, params }` and the
  crypt and library filter models. All user-derived values remain bound parameters.
- The native server constructs the Rust input directly and converts plan values to
  `rusqlite::types::Value`.
- The browser sends and receives JSON through one thin WASM binding. We use the
  workspace's existing `serde_json` dependency in both native and WASM builds.
- TypeScript continues to own UI state and SQLite result mapping, not query
  semantics.

## Alternatives considered

- A many-argument WASM function would avoid JSON but duplicate the nested filter
  shape in a fragile ABI and make optional fields and OR-discipline rows awkward.
- `serde-wasm-bindgen` would provide direct JavaScript object conversion but adds a
  second serialization dependency for no functional gain at this boundary.
- A custom delimiter format would be smaller but error-prone for arbitrary names,
  nested lists, and future filters.

## Consequences

- Crypt and library exact-search planning are implemented once in Rust and
  exercised by both platforms.
- The core WASM artifact grows modestly due to `serde_json`; this is accepted in
  exchange for a typed, extensible boundary and removal of duplicated query logic.
- TypeScript search modules are reduced to UI-state translation, SQLite execution,
  and row mapping; they no longer assemble card-filter SQL.
