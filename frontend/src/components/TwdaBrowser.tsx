import { useEffect, useState } from 'react'
import {
  getTwdaDeck,
  searchTwdaDecks,
  type TwdaDeckDetail,
  type TwdaDeckSummary,
  type TwdaSearchFilters,
} from '../lib/twda'
import { navigate } from '../lib/route'
import { useUiStrings } from '../lib/i18n'

function DeckDetail({ id, ui, onBack }: { id: string; ui: ReturnType<typeof useUiStrings>['twda']; onBack: () => void }) {
  const [deck, setDeck] = useState<TwdaDeckDetail | null | undefined>(undefined)

  useEffect(() => {
    setDeck(undefined)
    getTwdaDeck(id).then(setDeck)
  }, [id])

  if (deck === undefined) return <p className="text-sm text-ink-dim">{ui.loading}</p>
  if (deck === null) return <p className="text-sm text-blood-hi">{ui.notFound}</p>

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-xs text-ink-dim hover:text-ink-muted">
          {ui.backToSearch}
        </button>
        <h1 className="font-display text-xl">{deck.name ?? deck.id}</h1>
      </div>
      <p className="text-xs text-ink-dim">
        {[deck.event, deck.place, deck.date, deck.player, deck.players_count != null ? ui.playersCount(deck.players_count) : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {deck.comments && <p className="text-sm text-ink-muted">{deck.comments}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.cryptCount(deck.crypt.length)}</h2>
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
            {deck.crypt.map((c) => (
              <li key={c.card_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <button onClick={() => navigate({ page: 'card', id: c.card_id })} className="truncate text-left hover:text-blood-hi">
                  {c.name}
                </button>
                <span className="shrink-0 font-mono text-xs text-ink-dim">{c.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">{ui.libraryCount(deck.library.length)}</h2>
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
            {deck.library.map((c) => (
              <li key={c.card_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <button onClick={() => navigate({ page: 'card', id: c.card_id })} className="truncate text-left hover:text-blood-hi">
                  {c.name}
                </button>
                <span className="shrink-0 font-mono text-xs text-ink-dim">{c.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default function TwdaBrowser({ deckId }: { deckId?: string }) {
  const strings = useUiStrings()
  const ui = strings.twda
  const [filters, setFilters] = useState<TwdaSearchFilters>({})
  const [results, setResults] = useState<TwdaDeckSummary[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (deckId) return
    setResults(null)
    setError('')
    searchTwdaDecks(filters)
      .then(setResults)
      .catch((reason: Error) => setError(reason.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  if (deckId) {
    return <DeckDetail id={deckId} ui={ui} onBack={() => navigate({ page: 'twda' })} />
  }

  const runSearch = () => {
    setResults(null)
    setError('')
    searchTwdaDecks(filters)
      .then(setResults)
      .catch((reason: Error) => setError(reason.message))
  }

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="font-display text-xl">{ui.title}</h1>
        <p className="max-w-2xl text-sm text-ink-muted">{ui.intro}</p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          runSearch()
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="grid gap-1 text-xs text-ink-dim">
          {ui.playerLabel}
          <input
            value={filters.player ?? ''}
            onChange={(e) => setFilters({ ...filters, player: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink-dim">
          {ui.cardLabel}
          <input
            value={filters.cardName ?? ''}
            onChange={(e) => setFilters({ ...filters, cardName: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink-dim">
          {ui.dateFromLabel}
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink-dim">
          {ui.dateToLabel}
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
        </label>
        <button type="submit" className="rounded-md bg-blood-hi px-3 py-1.5 text-sm text-white">
          {ui.search}
        </button>
      </form>
      {error && <p className="text-sm text-blood-hi">{ui.loadError(error)}</p>}
      {results === null ? (
        <p className="text-sm text-ink-dim">{ui.loading}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-ink-dim">{ui.none}</p>
      ) : (
        <div className="grid gap-2">
          <p className="text-xs text-ink-dim">{ui.resultsCount(results.length)}</p>
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
            {results.map((deck) => (
              <li key={deck.id}>
                <button
                  onClick={() => navigate({ page: 'twda-deck', id: deck.id })}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-raised"
                >
                  <span className="min-w-0 truncate">{deck.name ?? deck.id}</span>
                  <span className="shrink-0 text-xs text-ink-dim">
                    {[deck.player, deck.date].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
