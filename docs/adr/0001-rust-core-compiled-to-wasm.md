# ADR 0001 — One Rust core, compiled to WASM and native

**Status:** accepted · 2026-07-18

## Context
The rebuild's headline requirement is WebAssembly, and vdb's most fragile surface is
duplicated logic (deck formats, legality, search semantics) drifting between client
and server.

## Decision
All domain logic (deck parse/serialize for every format, legality validation, draw
simulation, diff, seating, proxy layout, deck-URL codec, shared filter schema) lives
in one Rust crate `core/`, compiled with wasm-bindgen/wasm-pack for the browser and
linked natively into the axum server.

## Alternatives considered
- **TypeScript shared lib** (runs in browser + Node server): no WASM (a stated
  requirement), weaker typing for parser work, and forces a Node server.
- **AssemblyScript / Go WASM**: smaller ecosystems; Go WASM binaries are large.
- **Rust core + Python server (keep Flask)**: two languages plus FFI friction; loses
  the single-binary Docker story.

## Consequences
- One implementation to golden-test against vdb; zero client/server drift.
- Contributors need Rust for domain changes (mitigated by docs/domain-vtes.md and
  strong module boundaries; UI-only work stays pure TS).
