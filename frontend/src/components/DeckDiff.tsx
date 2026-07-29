import { useEffect, useState } from 'react'
import { compareDecks, listDecks, type DeckDiff as DiffResult, type DeckDiffEntry, type DeckSummary } from '../lib/deckStore'
import { navigate } from '../lib/route'
import { useUiStrings } from '../lib/i18n'

function DiffSection({ title, entries, tone }: { title: string; entries: DeckDiffEntry[]; tone: string }) {
  if (entries.length === 0) return null
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className={`border-b border-line-soft px-4 py-2 font-display text-sm ${tone}`}>
        {title} · {entries.length}
      </h2>
      <div className="divide-y divide-line-soft">
        {entries.map(({ card, qtyA, qtyB }) => (
          <button
            key={card.id}
            onClick={() => navigate({ page: 'card', id: card.id })}
            className="grid w-full grid-cols-[1fr_3rem_3rem] items-center gap-3 px-4 py-2 text-left text-sm hover:bg-raised"
          >
            <span className="truncate">{card.name}</span>
            <span className="text-center font-mono text-xs text-ink-muted">{qtyA || '—'}</span>
            <span className="text-center font-mono text-xs text-ink-muted">{qtyB || '—'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function DeckDiff() {
  const ui = useUiStrings().deckDiff
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [deckA, setDeckA] = useState(0)
  const [deckB, setDeckB] = useState(0)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listDecks()
      .then((items) => {
        setDecks(items)
        setDeckA(items[0]?.id ?? 0)
        setDeckB(items[1]?.id ?? items[0]?.id ?? 0)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!deckA || !deckB) return
    setDiff(null)
    compareDecks(deckA, deckB).then(setDiff).catch((e: Error) => setError(e.message))
  }, [deckA, deckB])

  const changedCount = diff ? diff.onlyInA.length + diff.onlyInB.length + diff.changed.length : 0

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ page: 'decks' })} className="text-xs text-ink-dim hover:text-ink-muted">
          {ui.backToDecks}
        </button>
        <h1 className="font-display text-xl">{ui.title}</h1>
      </div>

      {error && <p className="rounded-lg border border-blood bg-surface p-3 text-sm text-blood-hi">{error}</p>}
      {decks.length < 2 ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted">{ui.needTwoDecks}</p>
      ) : (
        <>
          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
            {[
              { label: ui.deckA, value: deckA, set: setDeckA },
              { label: ui.deckB, value: deckB, set: setDeckB },
            ].map((field) => (
              <label key={field.label} className="grid gap-1 text-xs text-ink-muted">
                {field.label}
                <select
                  value={field.value}
                  onChange={(e) => field.set(Number(e.target.value))}
                  className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:border-blood focus:outline-none"
                >
                  {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                </select>
              </label>
            ))}
          </div>

          {diff && (
            <>
              <div className="grid grid-cols-[1fr_3rem_3rem] px-4 text-xs text-ink-dim">
                <span>{changedCount === 0 ? ui.identical : ui.changedCount(changedCount)}</span>
                <span className="text-center">A</span>
                <span className="text-center">B</span>
              </div>
              <DiffSection title={ui.quantityChanged} entries={diff.changed} tone="text-gold" />
              <DiffSection title={ui.onlyInA} entries={diff.onlyInA} tone="text-blood-hi" />
              <DiffSection title={ui.onlyInB} entries={diff.onlyInB} tone="text-ok" />
              <DiffSection title={ui.unchanged} entries={diff.same} tone="text-ink-muted" />
            </>
          )}
        </>
      )}
    </div>
  )
}
