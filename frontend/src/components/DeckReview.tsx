import { useEffect, useState } from 'react'
import { computeDeckStats, getDeck, getDeckCardDetails, type DeckStats, type DeckSummary } from '../lib/deckStore'
import { navigate } from '../lib/route'
import { useUiStrings } from '../lib/i18n'

function Distribution({ title, rows }: { title: string; rows: DeckStats['types'] }) {
  if (rows.length === 0) return null
  const maximum = Math.max(...rows.map((row) => row.count), 1)
  return (
    <section className="grid gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <div className="grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
            <span className="truncate text-ink-muted">{row.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-blood-hi" style={{ width: `${row.count / maximum * 100}%` }} /></span>
            <span className="text-right font-mono text-ink-dim">{row.count}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function DeckReview({ id }: { id: number }) {
  const ui = useUiStrings().deckReview
  const [deck, setDeck] = useState<DeckSummary | null>(null)
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([getDeck(id), getDeckCardDetails(id)])
      .then(async ([nextDeck, cards]) => { setDeck(nextDeck); setStats(await computeDeckStats(cards)) })
      .catch((reason: Error) => setError(reason.message))
  }, [id])
  if (error) return <p className="text-sm text-blood-hi">{ui.loadError(error)}</p>
  if (!deck || !stats) return <p className="text-sm text-ink-dim">{ui.loading}</p>
  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <button onClick={() => navigate({ page: 'deck', id })} className="justify-self-start text-xs text-blood-hi hover:text-ink">{ui.backToEdit}</button>
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">{ui.title}</span>
        <h1 className="font-display text-3xl text-ink">{deck.name}</h1>
        {deck.author && <p className="text-sm text-ink-muted">{ui.byAuthor(deck.author)}</p>}
        {deck.description && <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{deck.description}</p>}
      </header>
      <section className="grid gap-3 rounded-xl border border-line bg-raised p-4 sm:grid-cols-3">
        <div><span className="text-xs text-ink-dim">{ui.crypt}</span><strong className="block font-display text-2xl text-ink">{stats.cryptCount}</strong></div>
        <div><span className="text-xs text-ink-dim">{ui.library}</span><strong className="block font-display text-2xl text-ink">{stats.libraryCount}</strong></div>
        <div><span className="text-xs text-ink-dim">{ui.capacity}</span><strong className="block font-display text-2xl text-ink">{stats.capacity ? `${stats.capacity.min}–${stats.capacity.max}` : '—'}</strong>{stats.capacity && <span className="text-xs text-ink-dim">{ui.average(stats.capacity.average.toFixed(2))}</span>}</div>
      </section>
      <section className={'rounded-xl border p-4 ' + (stats.violations.length ? 'border-blood bg-blood/10' : 'border-gold/40 bg-gold/5')}>
        <h2 className="font-display text-lg text-ink">{ui.legality}</h2>
        {stats.violations.length ? <ul className="mt-2 grid gap-1 text-sm text-blood-hi">{stats.violations.map((item) => <li key={item}>— {item}</li>)}</ul> : <p className="mt-1 text-sm text-gold">{ui.noViolations}</p>}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Distribution title={ui.libraryComposition} rows={stats.types} />
        <Distribution title={ui.disciplineFootprint} rows={stats.disciplines} />
        <Distribution title={ui.bloodCostCurve} rows={stats.bloodCosts} />
        <Distribution title={ui.poolCostCurve} rows={stats.poolCosts} />
        <Distribution title={ui.timingWindows} rows={stats.timingWindows} />
      </div>
    </div>
  )
}
