import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import sqliteWasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'

type SqliteInitOptions = {
  locateFile(path: string, prefix: string): string
}

type SqliteInit = (options: SqliteInitOptions) => Promise<Sqlite3Static>

// The package's runtime accepts Emscripten initialization options even though
// its public TypeScript declaration currently exposes a zero-argument function.
// Pinning the WASM URL through Vite prevents dev dependency optimization from
// resolving it beside node_modules/.vite/deps, where no sqlite3.wasm exists.
const initWithOptions = sqlite3InitModule as unknown as SqliteInit

export function initSqlite(): Promise<Sqlite3Static> {
  return initWithOptions({
    locateFile: (path, prefix) => (path === 'sqlite3.wasm' ? sqliteWasmUrl : `${prefix}${path}`),
  })
}
