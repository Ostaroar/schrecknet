# ADR 0006 — offline semantic card search

**Status:** accepted and implemented · 2026-07-19

## Context

SchreckNet already supports exact substring, scoped name/text, and regular-expression
search over the 662-card V5 pool. Semantic search is additive: it should answer concept
queries such as "wake and block", "gain pool", or "punish actions" even when those
words do not appear verbatim on a card.

This feature crosses every architectural boundary in the project:

- the browser must still work with the network unplugged;
- MCP and REST must expose the same capability as the browser;
- model weights, tokenizer, pooling, and normalization must agree across native and
  browser inference;
- the normal card-search path must not pay a roughly 24 MB model download or startup
  cost unless semantic mode is used;
- model and runtime dependencies require an ADR under AGENTS.md hard rule 7.

The V5 pool is small enough that vector indexing is not the hard problem. A 384-value
`f32` embedding for every current card occupies about 1.0 MB before SQLite overhead,
and ranking all 662 vectors requires only 254,208 multiply-add pairs per query. Model
inference and reproducibility matter more than approximate-nearest-neighbour indexing.

## Decision

### Model and document

- Use the Apache-2.0 `sentence-transformers/all-MiniLM-L6-v2` model, through one
  pinned, quantized ONNX artifact. It produces 384-dimensional sentence embeddings
  and has a small browser-appropriate INT8 build (about 23 MB).
- A checked-in model manifest will pin the model repository revision, every required
  file's SHA-256, dimensions, pooling, normalization, maximum input length, source
  URL, and license. Builds fail on a checksum mismatch. Model binaries are fetched at
  build time and served by SchreckNet; query-time code never falls back to a mutable
  Hub/CDN URL.
- Version 1 embeds canonical English only. Each deterministic card document contains
  the canonical name, kind, clan/path, type, disciplines, title/capacity/cost fields,
  and English rules text. Structured filters remain filters rather than prose added
  to the query. Spanish/French semantic queries are a later, explicitly benchmarked
  multilingual-model migration; translated card display remains available now.
- The selected INT8 graph uses dynamic activation quantization. Corpus cards and
  user queries therefore run one text per inference; mixing batch-dependent output
  ranges would make precomputed and query vectors subtly incompatible.

### Storage and ranking

- The data pipeline precomputes one normalized vector per V5 card and stores it in
  `cards.sqlite` as a little-endian `f32` BLOB:

  ```sql
  CREATE TABLE card_embeddings(
    card_id INTEGER NOT NULL REFERENCES cards(id),
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    embedding BLOB NOT NULL,
    PRIMARY KEY(card_id, model_id)
  ) WITHOUT ROWID;
  ```

- `cards.meta.json` records the semantic model id, model revision, dimensions,
  document-format version, and checksums. Adding the table bumps `schema_version`;
  changing card documents or vectors bumps `data_version` and the semantic document
  version so OPFS receives fresh data.
- Candidate filtering happens first using the existing crypt/library structured
  filters. Shared Rust in `core/` then validates vectors, computes exact cosine scores,
  applies `min_score`, and returns a deterministic top-k ordering (score descending,
  canonical name then card id as tie-breakers). No vector-search SQLite extension is
  added for this pool size.
- Golden tests use fixed vectors for ranking and a small set of VTES concept queries
  whose expected top-card sets are reviewed and checked in. Native and browser query
  embeddings must have equal dimensions and agree within a documented numeric
  tolerance; ranked result ids must match.

### Runtime split

- **Browser:** add `@huggingface/transformers` in a dedicated Web Worker. It uses
  ONNX Runtime Web's WebAssembly CPU backend as the compatibility baseline. Model and
  runtime WASM paths are local, and remote model loading is disabled. WebGPU may be an
  opt-in acceleration later, never the only path.
- **Server and data builder:** add `fastembed` (and its ONNX Runtime backend), pointed
  at the same checksum-verified local model assets. The server initializes one lazy,
  reusable model instance; it does not download weights on the first API request.
- **Shared core:** model inference is a platform adapter, while vector validation,
  scoring, top-k selection, and deterministic tie-breaking live in `core/` and compile
  to native Rust and WASM. TypeScript does not reimplement ranking.
- Docker and release builds include the pinned model and ONNX runtime artifacts. The
  PWA caches a versioned `/models/semantic/<model-id>/` asset set only when semantic
  search is first enabled. Existing substring/regex search neither downloads nor
  initializes the model.

### API and UX

- Add one `semantic_search` MCP tool and an identical
  `POST /api/v1/cards/semantic` REST mirror over the same service function. The request
  contains `query`, optional `kind` (`crypt`, `library`, or both), the applicable
  structured filters, `limit` (bounded, default 20), and optional `min_score`. Results
  contain normal card summary fields plus a cosine `score` and `model_id`.
- Crypt and Library pages gain an explicit **Semantic** mode, not a silent change to
  the existing text box. The first use explains the one-time model download, shows
  progress and size, and allows retry/removal. If the model is unavailable, normal
  search keeps working and the UI reports that semantic mode is not installed.
- Semantic search is local retrieval, not generated rules advice. Scores are exposed
  for ordering/debugging but the UI does not label them as probabilities.

## Delivery sequence

1. **Shared ranking — complete:** `core/src/semantic.rs` owns little-endian BLOB
   decoding, vector validation, exact cosine/top-k ranking, thresholds, and
   deterministic ties. Native unit tests, strict Clippy, the WASM target, wasm-pack,
   and the consuming frontend build pass.
2. **Embedded corpus — complete:** `models/semantic.json` pins revision
   `751bff37182d3f1213fa05d7196b954e230abad9` and all six file checksums;
   `schrecknet-data` emits schema/data v4 with deterministic document-v1 vectors and
   browser-local assets. A real build verifies all 662 cards have one 384-dimensional,
   1,536-byte normalized embedding; SQLite integrity passes.
3. **Machine APIs — complete:** `core::semantic_native` owns the checksum-verified
   local model contract shared by the data builder and server. One lazy server
   embedder feeds a filter-first service used identically by the `semantic_search`
   MCP tool and `POST /api/v1/cards/semantic`; bounded schemas, error mappings, and
   real REST + Streamable HTTP MCP calls were verified against the generated corpus.
4. **Offline browser — complete:** a dedicated worker runs local-only
   Transformers.js/ONNX Runtime Web inference, while shared Rust/WASM decodes the
   SQLite BLOB matrix and ranks it. Crypt + Library expose explicit semantic mode,
   preserve every structured filter, show first-use/progress/error/removal states,
   and leave exact/regex search untouched. The built app was loaded once, its server
   was stopped, the page was reloaded, and a fresh semantic query returned results
   from the PWA/OPFS/model caches with no browser warnings or errors.
5. **Quality gate — complete:** five reviewed VTES-domain concepts cover crypt and
   library retrieval. The checked-in Playwright smoke compares the browser and REST
   top 10 ids exactly, permits at most 0.005 score drift, enforces reviewed relevance
   windows, and kills the server before a full reload plus fresh query. The local
   reference run measured 46,193,713 first-use bytes, 1.65 s cold, and 0.36–0.41 s
   warm queries. CI rebuilds the real corpus/model/frontend and runs the same gate.

Each step was delivered as a separate reviewable milestone. Browser, MCP, REST,
Docker, reviewed relevance, parity, and true-offline behavior are now covered.

## Alternatives considered

- **Hosted embedding API:** rejected because it needs credentials, leaks queries,
  introduces recurring cost/vendor availability, and breaks offline-first behavior.
- **Browser-only embeddings:** rejected because it would violate the MCP + REST parity
  rule and leave machine clients with different search capabilities.
- **`sqlite-vec`:** capable and portable, but currently pre-1.0 and unnecessary for an
  exact scan of 662 vectors. It would add native and WASM extension loading plus a new
  storage contract without a measurable product benefit at this scale. Reconsider if
  the searchable corpus grows by orders of magnitude.
- **WebGPU-only inference:** rejected because browser support is narrower than the
  WebAssembly backend. WebGPU remains an optional acceleration after parity is proven.
- **Bundling the model in the initial app shell:** rejected because every user would
  pay the model cost even if they only use exact search or deck building.
- **A larger multilingual model now:** rejected for the first slice because it raises
  the offline download and memory budget before domain relevance is benchmarked.

## Consequences

- Two justified runtime dependencies are approved for implementation:
  `@huggingface/transformers` in the frontend worker and `fastembed` in native Rust.
- The shared native core takes `sha2` to enforce the manifest's supply-chain
  checksums for both builder and server; model acquisition continues to use the data
  builder's existing `ureq`.
- The first semantic search use downloads roughly 24 MB of model assets plus a
  roughly 22 MB ONNX Runtime Web WASM asset (about 46 MB uncompressed in total);
  subsequent use is offline from local caches. The app-shell service worker retains
  the separately owned model cache across upgrades. Exact/regex search behavior is
  unchanged.
- `cards.sqlite` grows by roughly 1 MB plus table overhead.
- Semantic relevance is model-dependent and English-only in version 1, so checked-in
  domain benchmarks in `frontend/e2e/fixtures/semantic-golden.json` are part of the
  compatibility contract.
- The exact scan keeps the architecture simple and deterministic; an ANN/vector
  extension remains an evidence-driven future optimization rather than a prerequisite.

## References

- [all-MiniLM-L6-v2 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [Transformers.js custom/local model settings](https://huggingface.co/docs/transformers.js/custom_usage)
- [ONNX Runtime Web compatibility](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- [fastembed-rs](https://github.com/Anush008/fastembed-rs)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
