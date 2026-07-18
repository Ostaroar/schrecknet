`sql-wasm.wasm` and `sql-wasm-browser.wasm` are vendored copies of sql.js's
WASM binary (see docs/adr/0004-sqljs-for-phase1-browser-search.md). Vite's
bundler resolves the `browser` package export, which requests
`sql-wasm-browser.wasm` specifically — both variants are kept here since which
one gets requested has depended on bundler resolution details before. When
bumping the `sql.js` version in package.json, re-copy both files from
`node_modules/sql.js/dist/`.
