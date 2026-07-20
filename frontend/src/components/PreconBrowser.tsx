import { useEffect, useState } from 'react'
import { listPrecons, type PreconSummary } from '../lib/precons'
import { searchCrypt, emptyCryptFilters, type CryptCard } from '../lib/cryptSearch'
import { searchLibrary, emptyLibraryFilters, type LibraryCard } from '../lib/librarySearch'
import { navigate } from '../lib/route'
import { CardTypeSummary, DisciplineSymbol } from './VtesSymbol'

function PreconDetail({ set, precon, onClose }: { set: string; precon: string; onClose: () => void }) {
  const [crypt, setCrypt] = useState<CryptCard[] | null>(null)
  const [library, setLibrary] = useState<LibraryCard[] | null>(null)

  useEffect(() => {
    setCrypt(null)
    setLibrary(null)
    Promise.all([
      searchCrypt({ ...emptyCryptFilters, precons: [{ set, precon }] }),
      searchLibrary({ ...emptyLibraryFilters, precons: [{ set, precon }] }),
    ]).then(([c, l]) => {
      setCrypt(c)
      setLibrary(l)
    })
  }, [set, precon])

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-xs text-ink-dim hover:text-ink-muted">
          ← Precons
        </button>
        <h1 className="font-display text-xl">{precon}</h1>
        <span className="text-xs text-ink-dim">{set}</span>
      </div>
      <p className="text-xs text-ink-dim">
        Card pool for this precon — quantities aren't tracked by the data source, so this shows
        which cards belong to it, not a ready-to-play decklist.
      </p>
      {crypt === null || library === null ? (
        <p className="text-sm text-ink-dim">Loading…</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <section className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Crypt · {crypt.length}</h2>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
              {crypt.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate({ page: 'card', id: c.id })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised"
                  >
                    <span className="w-6 text-right font-mono text-xs text-blood-hi">{c.capacity}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="hidden items-center gap-0.5 sm:flex">
                      {c.disciplines.map((discipline) => (
                        <DisciplineSymbol
                          key={discipline.code}
                          code={discipline.code}
                          superior={discipline.superior}
                          className="size-3.5"
                        />
                      ))}
                    </span>
                  </button>
                </li>
              ))}
              {crypt.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-dim">None</li>}
            </ul>
          </section>
          <section className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Library · {library.length}</h2>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
              {library.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate({ page: 'card', id: c.id })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised"
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <CardTypeSummary types={c.types} className="shrink-0 text-xs text-ink-dim" />
                  </button>
                </li>
              ))}
              {library.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-dim">None</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}

export default function PreconBrowser() {
  const [precons, setPrecons] = useState<PreconSummary[] | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<PreconSummary | null>(null)

  useEffect(() => {
    listPrecons()
      .then(setPrecons)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (selected) {
    return <PreconDetail set={selected.set} precon={selected.precon} onClose={() => setSelected(null)} />
  }

  if (error) return <p className="text-sm text-blood-hi">Couldn't load precons: {error}</p>
  if (!precons) return <p className="text-sm text-ink-dim">Loading precons…</p>

  const bySet = new Map<string, PreconSummary[]>()
  for (const p of precons) {
    const list = bySet.get(p.set)
    if (list) list.push(p)
    else bySet.set(p.set, [p])
  }

  return (
    <div className="grid gap-4">
      <h1 className="font-display text-xl">Precon decks</h1>
      <p className="text-xs text-ink-dim">
        Official preconstructed decks from the V5 pool, grouped by set. Card quantities per deck
        aren't tracked by the data source — each entry shows the deck's known card pool.
      </p>
      {[...bySet.entries()].map(([set, items]) => (
        <section key={set} className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{set}</h2>
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {items.map((p) => (
              <button
                key={p.precon}
                onClick={() => setSelected(p)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised"
              >
                <span className="flex-1 truncate">{p.precon}</span>
                <span className="text-xs text-ink-dim">{p.card_count} cards</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
