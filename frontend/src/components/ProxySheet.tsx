import { useEffect, useState } from 'react'
import { getProxyCards, type ProxyCard } from '../lib/proxySheet'
import { navigate } from '../lib/route'
import { useUiStrings } from '../lib/i18n'

export default function ProxySheet({ deckId }: { deckId: number }) {
  const strings = useUiStrings()
  const ui = strings.proxy
  const [cards, setCards] = useState<ProxyCard[] | null>(null)
  const [error, setError] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)

  useEffect(() => {
    setCards(null)
    getProxyCards(deckId, onlyMissing)
      .then(setCards)
      .catch((e: Error) => setError(e.message))
  }, [deckId, onlyMissing])

  if (error) return <p className="text-sm text-blood-hi">{strings.deckEditor.loadError(error)}</p>
  if (!cards) return <p className="text-sm text-ink-dim">{strings.deckEditor.loadingDeck}</p>

  const copies = cards.flatMap((c) => Array.from({ length: c.qty }, () => c))

  return (
    <div className="proxy-sheet-wrapper">
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <button onClick={() => navigate({ page: 'deck', id: deckId })} className="text-xs text-ink-dim hover:text-ink-muted">
          {ui.backToDeck}
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blood px-4 py-2 text-sm font-semibold text-white hover:bg-blood-hi"
        >
          {ui.print}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {ui.onlyMissing}
        </label>
        <span className="text-xs text-ink-dim">{ui.caption(copies.length)}</span>
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
        {copies.length === 0 && <p className="text-sm text-ink-dim">{ui.empty}</p>}
      </div>
    </div>
  )
}
