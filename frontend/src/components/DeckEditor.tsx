import { useEffect, useMemo, useState } from 'react'
import {
  getDeck,
  getDeckCardDetails,
  setCardQty,
  renameDeck,
  deleteDeck,
  cloneDeck,
  buildShareUrl,
  computeDeckStats,
  type DeckSummary,
  type DeckCardDetail,
  type DeckStats,
} from '../lib/deckStore'
import { drawHand, CRYPT_HAND_SIZE, LIBRARY_HAND_SIZE } from '../lib/drawHand'
import { searchCrypt, emptyCryptFilters } from '../lib/cryptSearch'
import { searchLibrary, emptyLibraryFilters } from '../lib/librarySearch'
import { navigate } from '../lib/route'

function QtyStepper({ qty, onChange }: { qty: number; onChange: (next: number) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(qty - 1)}
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        −
      </button>
      <span className="w-4 text-center font-mono text-xs text-ink">{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        className="grid size-5 place-items-center rounded border border-line text-xs text-ink-dim hover:text-ink-muted"
      >
        +
      </button>
    </span>
  )
}

function AddCardBox({
  kind,
  onAdd,
}: {
  kind: 'crypt' | 'library'
  onAdd: (cardId: number) => void
}) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<{ id: number; name: string; sub: string }[]>([])

  useEffect(() => {
    if (!text.trim()) {
      setResults([])
      return
    }
    if (kind === 'crypt') {
      searchCrypt({ ...emptyCryptFilters, text }).then((rows) =>
        setResults(rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, sub: `${r.clan} · cap ${r.capacity}` }))),
      )
    } else {
      searchLibrary({ ...emptyLibraryFilters, text }).then((rows) =>
        setResults(rows.slice(0, 8).map((r) => ({ id: r.id, name: r.name, sub: r.types.join(' / ') }))),
      )
    }
  }, [text, kind])

  return (
    <div className="grid gap-2">
      <input
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
        placeholder={`Add ${kind} card by name…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {results.length > 0 && (
        <div className="grid gap-1 rounded-lg border border-line-soft bg-ground p-1.5">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onAdd(r.id)
                setText('')
                setResults([])
              }}
              className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-raised"
            >
              <span className="flex-1 truncate text-ink">{r.name}</span>
              <span className="shrink-0 text-ink-dim">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TestHandPanel({ cryptCards, libraryCards }: { cryptCards: DeckCardDetail[]; libraryCards: DeckCardDetail[] }) {
  const [cryptHand, setCryptHand] = useState<DeckCardDetail[] | null>(null)
  const [libraryHand, setLibraryHand] = useState<DeckCardDetail[] | null>(null)

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs uppercase tracking-wide text-ink-dim">Test hand</h2>
        <button
          onClick={() => setCryptHand(drawHand(cryptCards, CRYPT_HAND_SIZE))}
          disabled={cryptCards.length === 0}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          Draw crypt ({CRYPT_HAND_SIZE})
        </button>
        <button
          onClick={() => setLibraryHand(drawHand(libraryCards, LIBRARY_HAND_SIZE))}
          disabled={libraryCards.length === 0}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
        >
          Draw library ({LIBRARY_HAND_SIZE})
        </button>
      </div>
      {(cryptHand || libraryHand) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cryptHand && (
            <ul className="grid gap-1 text-xs text-ink-muted">
              {cryptHand.map((c, i) => (
                <li key={i}>
                  {c.name} <span className="text-ink-dim">· cap {c.capacity}</span>
                </li>
              ))}
            </ul>
          )}
          {libraryHand && (
            <ul className="grid gap-1 text-xs text-ink-muted">
              {libraryHand.map((c, i) => (
                <li key={i}>{c.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CardRow({ card, onQty }: { card: DeckCardDetail; onQty: (qty: number) => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
      <button
        onClick={() => navigate({ page: 'card', id: card.id })}
        className="flex-1 truncate text-left hover:text-blood-hi"
      >
        {card.name}
      </button>
      <span className="text-xs text-ink-dim">
        {card.kind === 'crypt' ? `${card.clan} · cap ${card.capacity}` : ''}
      </span>
      <QtyStepper qty={card.qty} onChange={onQty} />
    </div>
  )
}

export default function DeckEditor({ id }: { id: number }) {
  const [deck, setDeck] = useState<DeckSummary | null>(null)
  const [cards, setCards] = useState<DeckCardDetail[]>([])
  const [stats, setStats] = useState<DeckStats | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [error, setError] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const refresh = async () => {
    try {
      const [d, c] = await Promise.all([getDeck(id), getDeckCardDetails(id)])
      if (!d) {
        setStatus('missing')
        return
      }
      setDeck(d)
      setNameDraft(d.name)
      setCards(c)
      setStats(await computeDeckStats(c))
      setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const addCard = async (cardId: number) => {
    const existing = cards.find((c) => c.id === cardId)
    await setCardQty(id, cardId, (existing?.qty ?? 0) + 1)
    refresh()
  }

  const changeQty = async (cardId: number, qty: number) => {
    await setCardQty(id, cardId, qty)
    refresh()
  }

  const cryptCards = useMemo(() => cards.filter((c) => c.kind === 'crypt'), [cards])
  const libraryCards = useMemo(() => cards.filter((c) => c.kind === 'library'), [cards])

  if (status === 'loading') return <p className="text-sm text-ink-dim">Loading deck…</p>
  if (status === 'error') return <p className="text-sm text-blood-hi">Couldn't load deck: {error}</p>
  if (status === 'missing' || !deck)
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-ink-muted">No deck with id {id}.</p>
        <button onClick={() => navigate({ page: 'decks' })} className="justify-self-start text-blood-hi underline">
          Back to decks
        </button>
      </div>
    )

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ page: 'decks' })} className="text-xs text-ink-dim hover:text-ink-muted">
          ← decks
        </button>
        <input
          className="flex-1 rounded-lg border border-transparent bg-transparent px-1 font-display text-2xl text-ink hover:border-line-soft focus:border-blood focus:outline-none"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && nameDraft !== deck.name && renameDeck(id, nameDraft.trim()).then(refresh)}
        />
        <button
          onClick={async () => {
            try {
              const url = await buildShareUrl(id)
              await navigator.clipboard.writeText(url)
              setShareStatus('copied')
              setTimeout(() => setShareStatus('idle'), 2000)
            } catch {
              setShareStatus('error')
            }
          }}
          className="text-xs text-ink-dim hover:text-ink-muted"
        >
          {shareStatus === 'copied' ? 'Link copied!' : shareStatus === 'error' ? "Couldn't copy" : 'Share'}
        </button>
        <button
          onClick={async () => navigate({ page: 'deck', id: await cloneDeck(id) })}
          className="text-xs text-ink-dim hover:text-ink-muted"
        >
          Clone
        </button>
        <button
          onClick={async () => {
            if (confirm(`Delete "${deck.name}"? This can't be undone.`)) {
              await deleteDeck(id)
              navigate({ page: 'decks' })
            }
          }}
          className="text-xs text-ink-dim hover:text-blood-hi"
        >
          Delete deck
        </button>
      </div>

      {stats && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface px-4 py-2.5 text-xs">
          <span className="text-ink-muted">
            <span className="font-mono text-ink">{stats.cryptCount}</span> crypt ·{' '}
            <span className="font-mono text-ink">{stats.libraryCount}</span> library
          </span>
          {stats.violations.length === 0 ? (
            <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold">V5 Legal</span>
          ) : (
            <ul className="grid gap-0.5 text-blood-hi">
              {stats.violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <TestHandPanel cryptCards={cryptCards} libraryCards={libraryCards} />

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Crypt</h2>
          <AddCardBox kind="crypt" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {cryptCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">No crypt cards yet.</p>}
            {cryptCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} />
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-dim">Library</h2>
          <AddCardBox kind="library" onAdd={addCard} />
          <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
            {libraryCards.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-dim">No library cards yet.</p>}
            {libraryCards.map((c) => (
              <CardRow key={c.id} card={c} onQty={(qty) => changeQty(c.id, qty)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
