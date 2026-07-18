import { useEffect, useState } from 'react'

interface ServerMeta {
  name: string
  version: string
  scope: string
}

export default function App() {
  const [meta, setMeta] = useState<ServerMeta | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    fetch('/api/v1/meta')
      .then((r) => (r.ok ? (r.json() as Promise<ServerMeta>) : Promise.reject(new Error(`${r.status}`))))
      .then(setMeta)
      .catch(() => setOffline(true))
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <header className="flex items-center gap-3 py-6">
        <span className="grid size-8 place-items-center rounded-lg bg-blood font-display text-lg font-bold text-white">
          S
        </span>
        <span className="font-display text-xl tracking-wide">SchreckNet</span>
        <span className="ml-auto rounded-full border border-line px-3 py-0.5 text-xs text-ink-muted">
          V5 only
        </span>
      </header>

      <main className="grid flex-1 place-items-center">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6">
          <h1 className="font-display text-2xl">Phase 0</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Scaffold is up: Rust core (native + WASM), server, data pipeline, this
            frontend. Card search arrives in Phase 1.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-ink-dim">server</dt>
            <dd className="text-right font-mono">
              {meta ? (
                <span className="text-ok">v{meta.version}</span>
              ) : offline ? (
                <span className="text-ink-dim">offline</span>
              ) : (
                '…'
              )}
            </dd>
            <dt className="text-ink-dim">scope</dt>
            <dd className="text-right font-mono">{meta?.scope ?? 'v5'}</dd>
          </dl>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-ink-dim">
        Portions of the materials are the copyrights and trademarks of Paradox
        Interactive AB, and are used with permission under the Dark Pack agreement.
        All rights reserved.
      </footer>
    </div>
  )
}
