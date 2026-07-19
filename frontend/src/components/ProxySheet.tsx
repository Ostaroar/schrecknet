import { useEffect, useState } from 'react'
import { getProxyCards, type ProxyCard } from '../lib/proxySheet'
import { navigate } from '../lib/route'

export default function ProxySheet({ deckId }: { deckId: number }) {
  const [cards, setCards] = useState<ProxyCard[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getProxyCards(deckId)
      .then(setCards)
      .catch((e: Error) => setError(e.message))
  }, [deckId])

  if (error) return <p className="text-sm text-blood-hi">Couldn't load deck: {error}</p>
  if (!cards) return <p className="text-sm text-ink-dim">Loading…</p>

  const copies = cards.flatMap((c) => Array.from({ length: c.qty }, () => c))

  return (
    <div className="proxy-sheet-wrapper">
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <button onClick={() => navigate({ page: 'deck', id: deckId })} className="text-xs text-ink-dim hover:text-ink-muted">
          ← Back to deck
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blood px-4 py-2 text-sm font-semibold text-white hover:bg-blood-hi"
        >
          Print / Save as PDF
        </button>
        <span className="text-xs text-ink-dim">
          {copies.length} card{copies.length === 1 ? '' : 's'} at 2.5"×3.5" (standard card size) — 9 per
          US Letter page. For personal proxy use only.
        </span>
      </div>
      <div className="proxy-grid">
        {copies.map((c, i) => (
          <div key={`${c.id}-${i}`} className="proxy-card">
            {c.imageUrl ? (
              <img src={c.imageUrl} alt={c.name} />
            ) : (
              <div className="proxy-card-fallback">{c.name}</div>
            )}
          </div>
        ))}
        {copies.length === 0 && (
          <p className="text-sm text-ink-dim">This deck has no cards to print yet.</p>
        )}
      </div>
    </div>
  )
}
