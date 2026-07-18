import { useEffect, useState } from 'react'
import CryptSearch from './components/CryptSearch'
import { getCardsMeta, type CardMeta } from './lib/db'

export default function App() {
  const [meta, setMeta] = useState<CardMeta | null>(null)

  useEffect(() => {
    getCardsMeta().then(setMeta).catch(() => setMeta(null))
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <header className="flex items-center gap-3 py-6">
        <span className="grid size-8 place-items-center rounded-lg bg-blood font-display text-lg font-bold text-white">
          S
        </span>
        <span className="font-display text-xl tracking-wide">SchreckNet</span>
        <span className="ml-auto rounded-full border border-line px-3 py-0.5 text-xs text-ink-muted">
          {meta ? `${meta.crypt} crypt · ${meta.library} library` : 'V5 only'}
        </span>
      </header>

      <main className="flex-1 pb-10">
        <h1 className="mb-4 font-display text-2xl">Crypt search</h1>
        <CryptSearch />
      </main>

      <footer className="py-6 text-center text-xs text-ink-dim">
        Portions of the materials are the copyrights and trademarks of Paradox
        Interactive AB, and are used with permission under the Dark Pack agreement.
        All rights reserved.
      </footer>
    </div>
  )
}
