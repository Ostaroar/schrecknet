#!/usr/bin/env bash
# Start SchreckNet locally (server on :8000 + Vite dev on :5173) and open the site.
#
#   ./scripts/dev.sh
#
# Ctrl-C stops both processes. Requires: rust toolchain, node, wasm-pack,
# and a built dist/cards.sqlite (run `schrecknet-data build` once if missing).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER_PORT="${SCHRECKNET_SERVER_PORT:-8000}"
VITE_PORT="${SCHRECKNET_VITE_PORT:-5173}"
URL="http://localhost:${VITE_PORT}"

# rustup lives outside the default PATH on this machine.
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"

pids=()
cleanup() {
  echo
  echo "Shutting down…"
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. wasm bindings (frontend imports these; gitignored build artifact)
if [ ! -f frontend/src/wasm/schrecknet_core_bg.wasm ]; then
  echo "→ Building wasm bindings…"
  wasm-pack build core --target web --out-dir ../frontend/src/wasm
fi

# 2. frontend deps
if [ ! -d frontend/node_modules ]; then
  echo "→ Installing frontend deps…"
  (cd frontend && npm install)
fi

# 3. card data (server serves this at /data/*)
if [ ! -f dist/cards.sqlite ]; then
  echo "✗ dist/cards.sqlite is missing — run the data pipeline first:"
  echo "    cargo run -p schrecknet-data -- build"
  exit 1
fi

# 4. backend on :8000 (serves /data/* + /api/*)
echo "→ Starting server on :${SERVER_PORT}…"
SCHRECKNET_BIND="127.0.0.1:${SERVER_PORT}" cargo run -p schrecknet-server &
pids+=($!)

# 5. Vite dev server on :5173 (proxies /api + /data to the backend)
echo "→ Starting Vite dev server on :${VITE_PORT}…"
(cd frontend && npm run dev -- --port "${VITE_PORT}" --strictPort) &
pids+=($!)

# 6. wait for Vite to answer, then open the browser
echo "→ Waiting for ${URL}…"
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "${URL}"; then break; fi
  sleep 1
done
echo "→ Opening ${URL}"
open "${URL}" 2>/dev/null || xdg-open "${URL}" 2>/dev/null || echo "Open ${URL} manually."

echo "Both servers running. Press Ctrl-C to stop."
wait
