import { useEffect, useState } from 'react'
import {
  getPreconCardCounts,
  listOwnedPrecons,
  listPrecons,
  type PreconSummary,
} from '../lib/precons'
import { searchCrypt, emptyCryptFilters, type CryptCard } from '../lib/cryptSearch'
import { searchLibrary, emptyLibraryFilters, type LibraryCard } from '../lib/librarySearch'
import { navigate } from '../lib/route'
import { useUiStrings, type UiStrings } from '../lib/i18n'
import { CardTypeSummary, DisciplineSymbol } from './VtesSymbol'

function PreconDetail({
  set,
  precon,
  onClose,
  ui,
}: {
  set: string
  precon: string
  onClose: () => void
  ui: UiStrings['precons']
}) {
  const [crypt, setCrypt] = useState<CryptCard[] | null>(null)
  const [library, setLibrary] = useState<LibraryCard[] | null>(null)
  const [copies, setCopies] = useState<Map<number, number>>(new Map())

  useEffect(() => {
    setCrypt(null)
    setLibrary(null)
    Promise.all([
      searchCrypt({ ...emptyCryptFilters, precons: [{ set, precon }] }),
      searchLibrary({ ...emptyLibraryFilters, precons: [{ set, precon }] }),
      getPreconCardCounts(set, precon),
    ]).then(([c, l, cardCopies]) => {
      setCrypt(c)
      setLibrary(l)
      setCopies(cardCopies)
    })
  }, [set, precon])

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-xs text-ink-dim hover:text-ink-muted">
          {ui.backToPrecons}
        </button>
        <h1 className="font-display text-xl">{precon}</h1>
        <span className="text-xs text-ink-dim">{set}</span>
      </div>
      <p className="text-xs text-ink-dim">{ui.cardCountNote}</p>
      {crypt === null || library === null ? (
        <p className="text-sm text-ink-dim">{ui.loading}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <section className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.cryptCount(crypt.length)}</h2>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
              {crypt.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate({ page: 'card', id: c.id })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised"
                  >
                    <span className="w-6 text-right font-mono text-xs text-blood-hi">{c.capacity}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-xs text-ink-dim">×{copies.get(c.id) ?? 1}</span>
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
              {crypt.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-dim">{ui.none}</li>}
            </ul>
          </section>
          <section className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.libraryCount(library.length)}</h2>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
              {library.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate({ page: 'card', id: c.id })}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-raised"
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="font-mono text-xs text-ink-dim">×{copies.get(c.id) ?? 1}</span>
                    <CardTypeSummary types={c.types} className="shrink-0 text-xs text-ink-dim" />
                  </button>
                </li>
              ))}
              {library.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-dim">{ui.none}</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}

export default function PreconBrowser() {
  const ui = useUiStrings().precons
  const [precons, setPrecons] = useState<PreconSummary[] | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<PreconSummary | null>(null)
  const [owned, setOwned] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    Promise.all([listPrecons(), listOwnedPrecons()])
      .then(([allPrecons, ownedPrecons]) => {
        setPrecons(allPrecons)
        setOwned(new Map(ownedPrecons.map((item) => [`${item.set}:${item.precon}`, item.qty])))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  if (selected) {
    return <PreconDetail set={selected.set} precon={selected.precon} onClose={() => setSelected(null)} ui={ui} />
  }

  if (error) return <p className="text-sm text-blood-hi">{ui.loadError(error)}</p>
  if (!precons) return <p className="text-sm text-ink-dim">{ui.loading}</p>

  const bySet = new Map<string, PreconSummary[]>()
  for (const p of precons) {
    const list = bySet.get(p.set)
    if (list) list.push(p)
    else bySet.set(p.set, [p])
  }
  const ownedEntries = [...owned.values()].filter((qty) => qty > 0)
  const ownedCopies = ownedEntries.reduce((sum, qty) => sum + qty, 0)

  return (
    <div className="grid gap-4">
      <h1 className="font-display text-xl">{ui.title}</h1>
      <p className="text-xs text-ink-dim">{ui.intro}</p>
      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <p className="font-display text-lg text-ink">{ui.ownedOverview(ownedCopies, ownedEntries.length)}</p>
        <p className="mt-1 text-xs text-ink-dim">{ui.ownedOverviewNote}</p>
      </div>
      {[...bySet.entries()].map(([set, items]) => (
        <section key={set} className="grid min-w-0 gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{set}</h2>
          <div className="min-w-0 divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {items.map((p) => {
              const ownedQty = owned.get(`${p.set}:${p.precon}`) ?? 0
              return (
                <button
                  key={p.precon}
                  onClick={() => setSelected(p)}
                  className="flex min-w-0 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-raised sm:gap-3 sm:px-4"
                >
                  <span className="min-w-0 flex-1 truncate">{p.precon}</span>
                  <span
                    className={
                      ownedQty > 0
                        ? 'rounded-full bg-blood/20 px-2 py-0.5 text-xs text-blood-hi'
                        : 'text-xs text-ink-dim'
                    }
                  >
                    {ownedQty > 0 ? ui.ownedCopies(ownedQty) : ui.notOwned}
                  </span>
                  <span className="text-xs text-ink-dim">{ui.cardsSuffix(p.card_count)}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
