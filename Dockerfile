# Multi-stage build -> single small image: server binary + frontend + cards.sqlite.

# --- stage 1: rust workspace -> server + data binaries, card database, core.wasm ---
FROM rust:1-bookworm AS rust-build
WORKDIR /src
RUN rustup target add wasm32-unknown-unknown && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
COPY Cargo.toml Cargo.lock ./
COPY core core
COPY server server
COPY data data
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
RUN npm run build

# --- final image ---
FROM gcr.io/distroless/cc-debian12
WORKDIR /app
COPY --from=rust-build /src/target/release/schrecknet-server /app/server
COPY --from=rust-build /out/cards.sqlite /app/data/cards.sqlite
COPY --from=web-build /src/frontend/dist /app/static
ENV SCHRECKNET_STATIC_DIR=/app/static \
    SCHRECKNET_DATA_DIR=/app/data \
    SCHRECKNET_APP_DB=/data/app.sqlite \
    SCHRECKNET_BIND=0.0.0.0:8000
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/app/server"]
