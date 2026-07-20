#!/usr/bin/env bash
# Start SchreckNet locally (backend server + frontend).
#
# Flags:
#   ./scripts/dev.sh                   Start with Vite dev server on :5173 (default)
#   ./scripts/dev.sh --prod            Serve the existing production build on :8000
#   ./scripts/dev.sh --prod --rebuild  Rebuild and serve production on :8000
#
# Node 22 LTS is recommended. If Vite hangs on a newer Node release, use
# `--prod` with an existing build or switch to Node 22 before `--rebuild`.
#
# Requires: rust toolchain, node, wasm-pack, and a built dist/cards.sqlite
# (run `schrecknet-data build` once if missing).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SERVER_PORT="${SCHRECKNET_SERVER_PORT:-8000}"
VITE_PORT="${SCHRECKNET_VITE_PORT:-5173}"

# Parse flags
PROD_MODE=false
REBUILD=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod|--server-only)
      PROD_MODE=true
      shift
      ;;
    --rebuild)
      REBUILD=true
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

# Set URL based on mode
if [ "$PROD_MODE" = true ]; then
  URL="http://localhost:${SERVER_PORT}"
else
  URL="http://localhost:${VITE_PORT}"
fi

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
WASM_ARTIFACT="frontend/src/wasm/schrecknet_core_bg.wasm"
WASM_NEEDED=false
if [ ! -f "$WASM_ARTIFACT" ]; then
  WASM_NEEDED=true
elif find core/src core/Cargo.toml -type f -newer "$WASM_ARTIFACT" -print -quit | grep -q .; then
  WASM_NEEDED=true
fi
if [ "$WASM_NEEDED" = true ]; then
  echo "→ Building wasm bindings…"
  wasm-pack build core --target web --out-dir ../frontend/src/wasm
fi

# 2. frontend deps
if [ ! -d frontend/node_modules ]; then
  echo "→ Installing frontend deps…"
  (cd frontend && npm install)
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -gt 22 ]; then
  echo "⚠ Node $(node --version) detected; Node 22 LTS is recommended if Vite hangs."
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

# 5. Handle frontend: either dev server or built production mode
if [ "$PROD_MODE" = true ]; then
  # Production mode: build frontend and serve via Rust server

  # Check if we need to build
  BUILD_NEEDED=false
  if [ ! -f frontend/dist/index.html ] || [ "$REBUILD" = true ]; then
    BUILD_NEEDED=true
  fi

  if [ "$BUILD_NEEDED" = true ]; then
    echo "→ Building frontend to dist/…"
    echo "⚠ WARNING: npm run build uses Vite and may hang on Node v26.5.0."
    echo "           If it hangs, press Ctrl-C and try downgrading to Node 22 LTS."
    (cd frontend && npm run build)
  else
    echo "→ Using existing frontend build at frontend/dist/"
    echo "   (pass --rebuild to force a rebuild)"
  fi

  # Wait for server to respond
  echo "→ Waiting for ${URL}…"
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "${URL}"; then break; fi
    sleep 1
  done
  echo "→ Opening ${URL}"
  open "${URL}" 2>/dev/null || xdg-open "${URL}" 2>/dev/null || echo "Open ${URL} manually."

  echo "Server running (serving dist/). Press Ctrl-C to stop."
  wait

else
  # Dev mode: Vite dev server on :5173 (proxies /api + /data to the backend)
  echo "→ Starting Vite dev server on :${VITE_PORT}…"
  (cd frontend && npm run dev -- --port "${VITE_PORT}" --strictPort) &
  pids+=($!)

  # Wait for Vite to answer, then open the browser
  echo "→ Waiting for ${URL}…"
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "${URL}"; then break; fi
    sleep 1
  done
  echo "→ Opening ${URL}"
  open "${URL}" 2>/dev/null || xdg-open "${URL}" 2>/dev/null || echo "Open ${URL} manually."

  echo "Both servers running. Press Ctrl-C to stop."
  wait
fi
