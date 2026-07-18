# Multi-stage build -> single small image: server binary + frontend + cards.sqlite.
# The core WASM bundle joins the web stage in Phase 1 when the frontend consumes it.

# --- stage 1: rust workspace -> server + data binaries, card database ---
FROM rust:1-bookworm AS rust-build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY core core
COPY server server
COPY data data
RUN cargo build --release -p schrecknet-server -p schrecknet-data
RUN ./target/release/schrecknet-data build --out /out

# --- stage 2: frontend ---
FROM node:22-bookworm AS web-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# --- final image ---
FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=rust-build /src/target/release/schrecknet-server /app/server
COPY --from=rust-build /out/cards.sqlite /app/data/cards.sqlite
COPY --from=web-build /src/frontend/dist /app/static
ENV SCHRECKNET_STATIC_DIR=/app/static \
    SCHRECKNET_CARDS_DB=/app/data/cards.sqlite \
    SCHRECKNET_APP_DB=/data/app.sqlite \
    SCHRECKNET_BIND=0.0.0.0:8000
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/app/server"]
