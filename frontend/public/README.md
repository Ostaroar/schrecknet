This directory holds static assets copied verbatim into the build. The
sql.js wasm binaries that used to live here are gone — the app now uses
`@sqlite.org/sqlite-wasm` (bundled by Vite from node_modules, persisted via
OPFS; see docs/adr/0004-sqljs-for-phase1-browser-search.md's follow-up note
and frontend/src/lib/dbWorker.ts).
