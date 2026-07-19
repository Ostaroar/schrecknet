# Semantic model assets

`semantic.json` is the reproducibility and supply-chain lock for SchreckNet's
optional offline semantic card search (ADR 0006). It pins one exact revision of
the Apache-2.0 all-MiniLM-L6-v2 INT8 ONNX conversion and records every file size
and SHA-256.

Model binaries are deliberately not committed. `schrecknet-data build` downloads
the pinned files, rejects any checksum mismatch, caches them under
`$SCHRECKNET_DATA_CACHE/semantic/`, and emits the verified browser assets under
`<out>/models/semantic/`. Docker copies those emitted files into the static site.
Runtime code must load only the emitted local path; it must never fall back to a
mutable Hugging Face/CDN URL.

Upstream:

- Base model: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Pinned ONNX conversion: https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/751bff37182d3f1213fa05d7196b954e230abad9
- License: Apache-2.0
