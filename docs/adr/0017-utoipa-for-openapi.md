# ADR 0017 — `utoipa` for the OpenAPI 3.1 surface

**Status:** accepted and implemented · 2026-08-03

## Context

`AGENTS.md` describes the architecture as "a mirrored REST/OpenAPI 3.1 surface" and
ADR 0003 is titled "MCP as primary machine API, REST/OpenAPI as mirror" — but until
now no `openapi`/`swagger` crate existed anywhere in the workspace, and there was no
machine-readable spec for the ~14 REST handlers in `server/src/api.rs`. That's a
documented architectural claim that wasn't true; this ADR closes the gap and, per
AGENTS.md hard rule 7, records the new runtime dependency it takes to do it.

## Decision

- Add `utoipa` (path/schema annotation macros, derives `IntoParams`/`ToSchema` off
  the same `Deserialize`/`Serialize`/`JsonSchema` structs already used by MCP) and
  `utoipa-swagger-ui` (serves interactive docs from the generated spec, embedded —
  no CDN fetch, keeping the offline-first rule intact for anyone browsing the docs
  from the deployed instance).
- Annotate the REST handlers directly in `server/src/api.rs` with `#[utoipa::path]`;
  assemble the spec with a single `#[derive(OpenApi)]` struct in `server/src/main.rs`.
  No new files, no service-layer duplication — the annotations describe the existing
  handlers, they don't wrap them.
- Serve the generated `openapi.json` at `/api/v1/openapi.json` and mount Swagger UI
  at `/api/v1/docs`.
- MCP tool schemas (`schemars::JsonSchema`) and REST OpenAPI schemas
  (`utoipa::ToSchema`) are two separate derives on the same param/result structs —
  not one generated from the other. `schemars` targets JSON-RPC tool input schemas;
  `utoipa` targets OpenAPI 3.1 component schemas. The shapes are identical because
  the underlying Rust struct is identical (AGENTS.md hard rule 2); the derives just
  serve two different consumers.

## Alternatives considered

- **`aide`** (axum-native OpenAPI via typed extractors) — would mean swapping every
  handler's `Json<T>`/`Query<T>` extractors for `aide`'s own types, a much larger
  diff across 14 handlers for a wrapper this project doesn't otherwise need.
- **Hand-written OpenAPI YAML** — no compile-time link to the actual Rust types;
  the exact kind of doc/code drift this ADR exists to close (see the false
  "REST/OpenAPI" claim above).
- **No spec at all, keep `docs/api.md` as the only reference** — leaves the
  documented architecture claim false and gives MCP-only clients (and this repo's
  own REST consumers) no machine-readable contract or interactive try-it surface.

## Consequences

- One more compile-time dependency (`utoipa`, `utoipa-swagger-ui`), both widely used,
  Apache-2.0/MIT, no runtime network calls.
- Every future REST handler needs a `#[utoipa::path]` annotation alongside its MCP
  `#[tool]` annotation, or the spec silently under-reports — same discipline as hard
  rule 2's "missing MCP tool is a review blocker", mirrored for REST/OpenAPI.
