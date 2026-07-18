import { useEffect, useState } from 'react'
import CryptSearch from './components/CryptSearch'
import LibrarySearch from './components/LibrarySearch'
import { getCardsMeta, type CardMeta } from './lib/db'

type Tab = 'crypt' | 'library'

export default function App() {
  const [meta, setMeta] = useState<CardMeta | null>(null)
  const [tab, setTab] = useState<Tab>('crypt')

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

      <nav className="mb-4 flex gap-1">
        {(['crypt', 'library'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'rounded-lg px-3 py-1.5 font-display text-sm capitalize ' +
              (tab === t ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink')
            }
          >
            {t} search
          </button>
        ))}
      </nav>

      <main className="flex-1 pb-10">{tab === 'crypt' ? <CryptSearch /> : <LibrarySearch />}</main>

      <footer className="py-6 text-center text-xs text-ink-dim">
        Portions of the materials are the copyrights and trademarks of Paradox
        Interactive AB, and are used with permission under the Dark Pack agreement.
        All rights reserved.
      </footer>
    </div>
  )
}
