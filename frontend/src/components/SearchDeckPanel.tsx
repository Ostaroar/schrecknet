import { useId, useMemo, useState, type MouseEvent } from 'react'
import type { DeckCardDetail } from '../lib/deckStore'
import type { SearchDeckController } from '../lib/useSearchDeck'

export interface AddToDeckButtonProps {
  cardId: number
  deck: SearchDeckController
  className?: string
}

/** Compact search-row action that never triggers the row's detail interaction. */
export function AddToDeckButton({ cardId, deck, className = '' }: AddToDeckButtonProps) {
  const qty = deck.quantities.get(cardId) ?? 0
  const disabled = deck.activeDeck === null || deck.loading
  const label = deck.activeDeck
    ? qty > 0
      ? `Add another copy to ${deck.activeDeck.name}; currently ${qty}`
      : `Add card to ${deck.activeDeck.name}`
    : 'Create or select a deck before adding cards'

  const add = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    void deck.increment(cardId)
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid min-w-7 place-items-center rounded-md border px-2 py-1 font-mono text-xs font-semibold transition-colors ${
        qty > 0
          ? 'border-blood bg-blood text-white hover:bg-blood-hi'
          : 'border-line bg-surface text-ink-muted hover:border-blood hover:text-ink'
      } disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <span aria-live="polite">{qty > 0 ? qty : '+'}</span>
    </button>
  )
}

function QuantityStepper({ card, deck }: { card: DeckCardDetail; deck: SearchDeckController }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => void deck.decrement(card.id)}
        aria-label={`Remove one copy of ${card.name}`}
        className="grid size-6 place-items-center rounded border border-line text-xs text-ink-dim hover:border-blood hover:text-ink"
      >
        −
      </button>
      <span className="w-5 text-center font-mono text-xs text-ink" aria-label={`${card.qty} copies`}>
        {card.qty}
      </span>
      <button
        type="button"
        onClick={() => void deck.increment(card.id)}
        aria-label={`Add one copy of ${card.name}`}
        className="grid size-6 place-items-center rounded border border-line text-xs text-ink-dim hover:border-blood hover:text-ink"
      >
        +
      </button>
    </span>
  )
}

function DeckGroup({ label, cards, deck }: { label: string; cards: DeckCardDetail[]; deck: SearchDeckController }) {
  const count = cards.reduce((total, card) => total + card.qty, 0)
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface" aria-label={`${label} cards`}>
      <header className="flex items-center justify-between border-b border-line-soft bg-raised px-3 py-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-ink-dim">{label}</h3>
        <span className="font-mono text-[10px] text-ink-muted">{count}</span>
      </header>
      {cards.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-ink-dim">No {label.toLowerCase()} cards yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {cards.map((card) => (
            <li key={card.id} className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm">
              <a
                href={`#/cards/${card.id}`}
                className="min-w-0 flex-1 truncate font-display text-ink hover:text-blood-hi"
              >
                {card.name}
              </a>
              <QuantityStepper card={card} deck={deck} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface SearchDeckPanelProps {
  deck: SearchDeckController
  defaultOpen?: boolean
  className?: string
}

/** Active local deck controls shared by crypt and library search pages. */
export function SearchDeckPanel({ deck, defaultOpen = false, className = '' }: SearchDeckPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const cryptCards = useMemo(() => deck.cards.filter((card) => card.kind === 'crypt'), [deck.cards])
  const libraryCards = useMemo(() => deck.cards.filter((card) => card.kind === 'library'), [deck.cards])
  const cryptCount = cryptCards.reduce((total, card) => total + card.qty, 0)
  const libraryCount = libraryCards.reduce((total, card) => total + card.qty, 0)

  return (
    <aside className={`rounded-xl border border-line bg-surface p-3 sm:p-4 ${className}`} aria-label="Search deck">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid min-w-0 gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
          Active deck
          <select
            value={deck.activeDeck?.id ?? ''}
            onChange={(event) => void deck.select(Number(event.target.value))}
            disabled={deck.decks.length === 0 || deck.loading}
            className="min-w-0 rounded-lg border border-line bg-raised px-3 py-2 text-sm normal-case tracking-normal text-ink focus:border-blood focus:outline-none disabled:opacity-50"
          >
            {deck.decks.length === 0 && <option value="">No local decks</option>}
            {deck.decks.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          disabled={deck.activeDeck === null}
          aria-expanded={open}
          aria-controls={panelId}
          className="rounded-lg border border-line bg-raised px-3 py-2 text-xs font-semibold text-ink-muted hover:border-blood hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {open ? 'Hide Deck' : 'Show Deck'}
        </button>
      </div>

      {deck.loading && (
        <p className="mt-3 text-xs text-ink-dim" role="status">
          Loading local decks…
        </p>
      )}
      {deck.error && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-blood-hi" role="alert">
          <span>Couldn't update the local deck: {deck.error}</span>
          <button type="button" onClick={() => void deck.refresh()} className="underline hover:text-ink">
            Try again
          </button>
        </div>
      )}

      {!deck.loading && deck.decks.length === 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-line bg-ground px-4 py-5 text-center">
          <p className="text-sm text-ink-muted">Create a local deck to add cards while searching.</p>
          <a
            href="#/decks"
            className="mt-2 inline-flex rounded-lg bg-blood px-3 py-2 text-xs font-semibold text-white hover:bg-blood-hi"
          >
            Go to decks
          </a>
        </div>
      )}

      {deck.activeDeck && open && (
        <div id={panelId} className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <a href={`#/decks/${deck.activeDeck.id}`} className="font-display text-base text-ink hover:text-blood-hi">
              {deck.activeDeck.name}
            </a>
            <span className="font-mono">
              {cryptCount} crypt · {libraryCount} library · {cryptCount + libraryCount} total
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <DeckGroup label="Crypt" cards={cryptCards} deck={deck} />
            <DeckGroup label="Library" cards={libraryCards} deck={deck} />
          </div>
          {deck.updating && (
            <p className="sr-only" role="status">
              Saving deck changes…
            </p>
          )}
        </div>
      )}
    </aside>
  )
}

export default SearchDeckPanel
