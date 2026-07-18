# Multi-stage build → single small image serving frontend + REST + MCP.
# Stages activate as the corresponding source directories land (see docs/roadmap.md).

# --- stage 1: rust core → wasm + server binary ---
FROM rust:1-bookworm AS rust-build
RUN cargo install wasm-pack --locked
WORKDIR /src
COPY core/ core/
COPY server/ server/
RUN cd core && wasm-pack build --target web --out-dir /out/wasm
RUN cd server && cargo build --release && cp target/release/server /out/server

# --- stage 2: frontend ---
FROM node:22-bookworm AS web-build
WORKDIR /src
COPY frontend/ frontend/
COPY --from=rust-build /out/wasm frontend/src/wasm/
RUN cd frontend && npm ci && npm run build

# --- stage 3: card database ---
FROM rust:1-bookworm AS data-build
WORKDIR /src
COPY data/ data/
RUN cd data && cargo run --release -- build --out /out/cards.sqlite

# --- final image ---
FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=rust-build /out/server /app/server
COPY --from=web-build /src/frontend/dist /app/static
COPY --from=data-build /out/cards.sqlite /app/data/cards.sqlite
ENV VTES_STATIC_DIR=/app/static \
    VTES_CARDS_DB=/app/data/cards.sqlite \
    VTES_APP_DB=/data/app.sqlite \
    VTES_BIND=0.0.0.0:8000
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/app/server"]
