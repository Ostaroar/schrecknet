# ADR 0011 — `tracing`/`tracing-subscriber` for HTTP access logs

## Status

Accepted.

## Context

The server has no request logging at all — `kubectl logs` on the live pod shows
only the startup line. The project owner asked whether DigitalOcean shows any
sign of real visitors; the honest answer was "not per-request, and the app
itself doesn't log requests either." Basic access logging (method, path,
status, latency) is a reasonable, low-risk thing to have regardless of that
specific question — it's the first thing anyone reaches for when diagnosing a
live deploy.

`tower_http::trace::TraceLayer` already ships in the `tower-http` dependency
already used for compression/caching (ADR-less, same crate); its "trace"
feature is a one-line addition. But `TraceLayer` only *emits* `tracing` events
— nothing renders them unless a subscriber is installed. `tracing` itself was
already transitively present (via `rmcp`/`tokio`), but `tracing-subscriber`
(the crate that actually formats and writes events) was not, so AGENTS.md hard
rule 7 applies.

## Decision

Add `tracing-subscriber` (with the `env-filter` feature, so `RUST_LOG` can
tune verbosity without a rebuild) and wire `tower_http::trace::TraceLayer::new_for_http()`
around the whole router. The subscriber writes to **stderr**, not the default
stdout — `--mcp-stdio` mode uses stdout for the JSON-RPC transport, and
mixing log lines into that stream would corrupt it. Default level is `info`
(one line per request: method, path, status, latency) unless `RUST_LOG`
overrides it.

## Alternatives considered

- **Hand-rolled middleware** (a plain `axum` middleware function logging via
  `println!`): would still need to go through the same stdout/stdio conflict
  reasoning, and reinvents exactly what `TraceLayer` already does correctly
  (span-per-request, status/latency capture) for no real benefit — this isn't
  the kind of small, fixed-shape algorithm (like the base64 share-token
  encoder) where hand-rolling beats a dependency; it's exactly the ecosystem
  each of those tools was built for.
- **No logging, point at Cloudflare/DO Load Balancer analytics instead**: those
  cover aggregate traffic but not "what actually happened on this request" —
  useful for a different question than "is the app behaving," which access
  logs answer directly.

## Consequences

- One new direct dependency (`tracing-subscriber`); `tracing` was already
  transitively present. No change to `--mcp-stdio` output.
- `kubectl logs -n schrecknet deployment/schrecknet-server` now shows one line
  per HTTP request. No request bodies, headers, or query strings are logged —
  just method/path/status/latency — so this doesn't create a new place
  personal data could leak into logs.
