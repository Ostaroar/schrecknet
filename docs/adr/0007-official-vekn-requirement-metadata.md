# ADR 0007 — official VEKN requirement metadata

**Status:** accepted and implemented · 2026-07-19

## Context

KRCG's browser-friendly `vtes.json` is SchreckNet's main card source, but it omits
the normalized library `Requirement` field used by VDB's sect and title filters.
Deriving every requirement from prose would be fragile: effect text can mention a
sect or title without requiring it, and VDB itself does not use such regexes.

VEKN publishes an official ZIP of current UTF-8 CSV card lists. Its
`vteslibmeta.csv` contains stable card ids and normalized comma-separated
requirements. VDB consumes this file, then adds implied sect tokens for specific
title requirements before applying All/Any/Not filters.

Reading the official archive and CSV safely requires format-aware code. Hand-written
ZIP or CSV parsing would add critical parser risk for no product benefit, while
shelling out to `unzip` would make local, CI, and Docker builds environment-dependent.

## Decision

- The data builder downloads VEKN's official `vtescsv_utf8.zip` alongside KRCG's
  JSON and caches both for 24 hours under `SCHRECKNET_DATA_CACHE`.
- Add build-time Rust dependencies `zip` (read-only Deflate support) and `csv` with
  Serde decoding. Neither dependency ships in the browser or server runtime.
- Join `vteslibmeta.csv` to the already-filtered V5 pool by stable numeric card id;
  metadata for cards outside the V5 pool is discarded, and fail the build if the
  join produces zero V5 requirement cards.
- Shared Rust in `core/src/requirements.rs` lowercases, trims, deduplicates, and
  classifies tokens, reproduces VDB's title-to-sect implication table, and emits
  the synthetic `titled_specific` token used by VDB's “Titled (specific)” filter.
- Store normalized rows in `card_requirements`; filter options are queried from the
  surviving V5 rows, never from a hardcoded full-universe UI list.
- Keep the existing card-text capacity parser. The official requirement metadata is
  an independent source for sect/title filters, while the real-V5 golden gate guards
  capacity behavior against VDB's line-scoped regex semantics.

## Alternatives considered

- **Parse canonical card text:** rejected because ordinary effects produce false
  positives and VDB uses normalized metadata instead.
- **Fetch VDB's checked-in copy:** rejected in favor of the upstream official VEKN
  source VDB derives from.
- **Vendor the CSV:** rejected because it would become stale and duplicate the
  existing scheduled data-refresh workflow.
- **Hand-write CSV/ZIP parsers or call system tools:** rejected for correctness and
  portability.

## Consequences

- Data builds make one additional small, cached official-source request.
- `Cargo.lock` grows by the transitive dependencies needed for safe Deflate and CSV
  decoding; frontend/server dependency profiles are unchanged.
- A VEKN outage affects a cache-cold data rebuild, just as a KRCG outage already
  does. A warm cache remains usable for local development.
- Requirement source provenance is recorded in `cards.meta.json` and documented in
  `docs/data.md`.

## References

- [VEKN official card lists](https://www.vekn.net/card-lists)
- [VDB requirement filtering](https://github.com/smeea/vdb/blob/master/frontend/src/utils/cardFilters.js)
- [VDB requirement normalization](https://github.com/smeea/vdb/blob/master/misc/cards-update/generate_library.py)
