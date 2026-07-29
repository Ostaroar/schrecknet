import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm'

type SqliteInitOptions = {
  locateFile(path: string, prefix: string): string
}

type SqliteInit = (options: SqliteInitOptions) => Promise<Sqlite3Static>

// Dynamically imported rather than statically: dbWorker.ts and userDbWorker.ts
// are two independent Worker entry points, each built as its own bundle, so a
// static import here would duplicate the (large) sqlite3InitModule Emscripten
// glue into both worker chunks in full. A dynamic import lets Vite emit it as
// one shared chunk both workers reference — the browser fetches it once.
export async function initSqlite(): Promise<Sqlite3Static> {
  const [{ default: sqlite3InitModule }, { default: sqliteWasmUrl }] = await Promise.all([
    import('@sqlite.org/sqlite-wasm'),
    import('@sqlite.org/sqlite-wasm/sqlite3.wasm?url'),
  ])
  // The package's runtime accepts Emscripten initialization options even though
  // its public TypeScript declaration currently exposes a zero-argument function.
  // Pinning the WASM URL through Vite prevents dev dependency optimization from
  // resolving it beside node_modules/.vite/deps, where no sqlite3.wasm exists.
  const initWithOptions = sqlite3InitModule as unknown as SqliteInit
  return initWithOptions({
    locateFile: (path, prefix) => (path === 'sqlite3.wasm' ? sqliteWasmUrl : `${prefix}${path}`),
  })
}
