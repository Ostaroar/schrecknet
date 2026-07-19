import { useEffect, useState } from 'react'
import { previewSharedDeck, importSharedDeck, type DeckCardDetail } from '../lib/deckStore'
import { navigate } from '../lib/route'

export default function SharedDeckPreview({ token }: { token: string }) {
  const [cards, setCards] = useState<DeckCardDetail[] | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('Imported deck')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    previewSharedDeck(token)
      .then(setCards)
      .catch((e: Error) => setError(e.message))
  }, [token])

  if (error) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-blood-hi">This share link isn't valid: {error}</p>
        <button onClick={() => navigate({ page: 'decks' })} className="justify-self-start text-blood-hi underline">
          Back to decks
        </button>
      </div>
    )
  }
  if (!cards) return <p className="text-sm text-ink-dim">Loading shared deck…</p>

  const cryptCards = cards.filter((c) => c.kind === 'crypt')
  const libraryCards = cards.filter((c) => c.kind === 'library')
  const cryptCount = cryptCards.reduce((sum, c) => sum + c.qty, 0)
  const libraryCount = libraryCards.reduce((sum, c) => sum + c.qty, 0)

  const save = async () => {
    setSaving(true)
    const id = await importSharedDeck(token, name.trim() || 'Imported deck')
    navigate({ page: 'deck', id })
  }

  return (
    <div className="grid gap-5">
      <h1 className="font-display text-2xl">Shared deck</h1>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-xs">
        <span className="text-ink-muted">
          <span className="font-mono text-ink">{cryptCount}</span> crypt ·{' '}
          <span className="font-mono text-ink">{libraryCount}</span> library
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder="Name this deck"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          onClick={save}
          disabled={saving || cards.length === 0}
          className="rounded-lg bg-blood px-4 py-2 text-sm font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
        >
          Save as new deck
        </button>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-ink-dim">This share link points to an empty deck.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <section className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Crypt</h2>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
              {cryptCards.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="w-6 text-right font-mono text-xs text-ink-dim">{c.qty}×</span>
                  <span className="flex-1 truncate">{c.name}</span>
                </li>
              ))}
              {cryptCards.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-dim">None</li>}
            </ul>
          </section>
          <section className="grid gap-2">
            <h2 className="text-xs uppercase tracking-wide text-ink-dim">Library</h2>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface text-sm">
              {libraryCards.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="w-6 text-right font-mono text-xs text-ink-dim">{c.qty}×</span>
                  <span className="flex-1 truncate">{c.name}</span>
                </li>
              ))}
              {libraryCards.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-dim">None</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
