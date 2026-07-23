# Multi-stage build -> single small image: server binary + frontend + cards.sqlite.

# --- stage 1: rust workspace -> server + data binaries, card database, core.wasm ---
# fastembed's pinned ONNX Runtime archive references glibc's C23 conversion
# symbols, which are not available in Debian 12/bookworm. Keep the native
# builder and final runtime on Debian 13 together so link- and run-time libc
# contracts match.
FROM rust:1-trixie AS rust-build
WORKDIR /src
RUN rustup target add wasm32-unknown-unknown && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
COPY Cargo.toml Cargo.lock ./
COPY core core
COPY server server
COPY data data
COPY models models
COPY migrations migrations
RUN cargo build --release -p schrecknet-server -p schrecknet-data
RUN ./target/release/schrecknet-data build --out /out
RUN wasm-pack build core --release --target web --out-dir /out/wasm

# --- stage 2: frontend ---
FROM node:22-bookworm AS web-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend .
COPY migrations /src/migrations
COPY --from=rust-build /out/wasm src/wasm
COPY --from=rust-build /out/models public/models
RUN npm run build

# --- stage 3: prerender card pages + precons index (docs/seo-geo-aeo-plan.md
# S3/S4) ---
# Needs cards.sqlite from rust-build (real card data) and the frontend's
# already-built index.html from web-build (its hashed script/CSS tags get
# reused verbatim in every prerendered page). Runs the already-compiled
# schrecknet-data binary rather than rebuilding it. `prerender` never touches
# fastembed/ort (it's the `build` subcommand that generates embeddings), and
# `ort`'s ONNX runtime is dlopen'd at first use rather than a hard link-time
# dependency (confirmed via `otool -L` on a local build: no onnxruntime dylib
# in the link table) -- so unlike the final image below, this stage doesn't
# need to match rust-build's exact ONNX-linked runtime, just its Debian
# release for baseline glibc compatibility. Verified green in CI (docker.yml
# run 29990857841).
# SITE_URL is optional: leave unset until a real domain is chosen (see
# docs/seo-geo-aeo-plan.md § 5) and prerendered pages simply omit the
# canonical link + JSON-LD url, rather than baking in a wrong one.
FROM debian:trixie-slim AS prerender-build
ARG SITE_URL=""
WORKDIR /out
COPY --from=rust-build /src/target/release/schrecknet-data /usr/local/bin/schrecknet-data
COPY --from=rust-build /out/cards.sqlite /out/cards.sqlite
COPY --from=web-build /src/frontend/dist /out/dist
RUN if [ -n "$SITE_URL" ]; then \
      schrecknet-data prerender --db /out/cards.sqlite --template /out/dist/index.html \
        --out /out/dist --base-url "$SITE_URL"; \
    else \
      schrecknet-data prerender --db /out/cards.sqlite --template /out/dist/index.html \
        --out /out/dist; \
    fi

# --- final image ---
FROM gcr.io/distroless/cc-debian13
WORKDIR /app
COPY --from=rust-build /src/target/release/schrecknet-server /app/server
COPY --from=rust-build /out/cards.sqlite /app/data/cards.sqlite
COPY --from=rust-build /out/cards.meta.json /app/data/cards.meta.json
COPY --from=prerender-build /out/dist /app/static
ENV SCHRECKNET_STATIC_DIR=/app/static \
    SCHRECKNET_DATA_DIR=/app/data \
    SCHRECKNET_MODEL_DIR=/app/static/models/semantic \
    SCHRECKNET_APP_DB=/data/app.sqlite \
    SCHRECKNET_BIND=0.0.0.0:8000
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/app/server"]
