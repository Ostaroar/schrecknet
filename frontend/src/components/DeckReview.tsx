import { useEffect, useState } from 'react'
import { computeDeckStats, getDeck, getDeckCardDetails, type DeckStats, type DeckSummary } from '../lib/deckStore'
import { navigate } from '../lib/route'

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
  const [deck, setDeck] = useState<DeckSummary | null>(null)
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([getDeck(id), getDeckCardDetails(id)])
      .then(async ([nextDeck, cards]) => { setDeck(nextDeck); setStats(await computeDeckStats(cards)) })
      .catch((reason: Error) => setError(reason.message))
  }, [id])
  if (error) return <p className="text-sm text-blood-hi">Couldn't review deck: {error}</p>
  if (!deck || !stats) return <p className="text-sm text-ink-dim">Loading deck review…</p>
  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <button onClick={() => navigate({ page: 'deck', id })} className="justify-self-start text-xs text-blood-hi hover:text-ink">← edit deck</button>
        <span className="text-xs uppercase tracking-[0.2em] text-blood-hi">Deck review</span>
        <h1 className="font-display text-3xl text-ink">{deck.name}</h1>
        {deck.author && <p className="text-sm text-ink-muted">by {deck.author}</p>}
        {deck.description && <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{deck.description}</p>}
      </header>
      <section className="grid gap-3 rounded-xl border border-line bg-raised p-4 sm:grid-cols-3">
        <div><span className="text-xs text-ink-dim">Crypt</span><strong className="block font-display text-2xl text-ink">{stats.cryptCount}</strong></div>
        <div><span className="text-xs text-ink-dim">Library</span><strong className="block font-display text-2xl text-ink">{stats.libraryCount}</strong></div>
        <div><span className="text-xs text-ink-dim">Capacity</span><strong className="block font-display text-2xl text-ink">{stats.capacity ? `${stats.capacity.min}–${stats.capacity.max}` : '—'}</strong>{stats.capacity && <span className="text-xs text-ink-dim">average {stats.capacity.average.toFixed(2)}</span>}</div>
      </section>
      <section className={'rounded-xl border p-4 ' + (stats.violations.length ? 'border-blood bg-blood/10' : 'border-gold/40 bg-gold/5')}>
        <h2 className="font-display text-lg text-ink">V5 legality</h2>
        {stats.violations.length ? <ul className="mt-2 grid gap-1 text-sm text-blood-hi">{stats.violations.map((item) => <li key={item}>— {item}</li>)}</ul> : <p className="mt-1 text-sm text-gold">No base-format violations found.</p>}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Distribution title="Library composition" rows={stats.types} />
        <Distribution title="Discipline footprint" rows={stats.disciplines} />
        <Distribution title="Blood-cost curve" rows={stats.bloodCosts} />
        <Distribution title="Pool-cost curve" rows={stats.poolCosts} />
      </div>
    </div>
  )
}
