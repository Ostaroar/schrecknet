import { useEffect, useState } from 'react'
import { listDecks, getDeckCardDetails, createDeck, deleteDeck, cloneDeck, type DeckSummary } from '../lib/deckStore'
import { computeDeckMissing } from '../lib/inventoryStore'
import { navigate } from '../lib/route'
import { useUiStrings } from '../lib/i18n'

export default function DeckList() {
  const ui = useUiStrings().decks
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [missingByDeck, setMissingByDeck] = useState<Map<number, number>>(new Map())

  const INVENTORY_MODE_LABEL = { excluded: null, fixed: ui.ownsCopies, flexible: ui.sharesCopies } as const

  const refresh = () => {
    listDecks()
      .then((d) => {
        setDecks(d)
        setStatus('ready')
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }

  useEffect(refresh, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const map = new Map<number, number>()
      for (const deck of decks) {
        if (deck.inventory_mode === 'excluded') continue
        const cards = await getDeckCardDetails(deck.id)
        const missing = await computeDeckMissing(cards.map((c) => c.id))
        map.set(
          deck.id,
          cards.reduce((sum, c) => sum + Math.min(missing.get(c.id) ?? 0, c.qty), 0),
        )
      }
      if (active) setMissingByDeck(map)
    })()
    return () => {
      active = false
    }
  }, [decks])

  const create = async () => {
    const name = newName.trim() || 'Untitled deck'
    const id = await createDeck(name)
    navigate({ page: 'deck', id })
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-blood-hi">
        {ui.loadError(error)}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-3">
        <input
          className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder={ui.newDeckPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button onClick={create} className="rounded-lg bg-blood px-4 py-2 text-sm font-semibold text-white hover:bg-blood-hi">
          {ui.createDeck}
        </button>
      </div>

      {decks.length >= 2 && (
        <button onClick={() => navigate({ page: 'diff' })} className="justify-self-start text-sm text-blood-hi hover:underline">
          {ui.compareTwoDecks}
        </button>
      )}

      {status === 'loading' ? (
        <p className="text-sm text-ink-dim">{ui.loading}</p>
      ) : decks.length === 0 ? (
        <p className="px-1 text-sm text-ink-dim">{ui.noDecks}</p>
      ) : (
        <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
          {decks.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <button
                onClick={() => navigate({ page: 'deck', id: d.id })}
                className="grid min-w-0 flex-1 gap-0.5 text-left hover:text-blood-hi"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{d.name}</span>
                  {d.tags.length > 0 && (
                    <span className="flex shrink-0 gap-1">
                      {d.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-line bg-raised px-1.5 py-0.5 text-[10px] text-ink-dim"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                {(d.author || d.description) && (
                  <span className="truncate text-xs text-ink-dim">
                    {d.author && <>{ui.byAuthor(d.author)}</>}
                    {d.author && d.description && ' · '}
                    {d.description}
                  </span>
                )}
              </button>
              {INVENTORY_MODE_LABEL[d.inventory_mode] && (
                <span className="shrink-0 rounded-full border border-line bg-raised px-1.5 py-0.5 text-[10px] text-ink-dim">
                  {INVENTORY_MODE_LABEL[d.inventory_mode]}
                </span>
              )}
              {(missingByDeck.get(d.id) ?? 0) > 0 && (
                <span className="shrink-0 rounded-full bg-blood/20 px-1.5 py-0.5 text-[10px] font-semibold text-blood-hi">
                  {ui.missingSuffix(missingByDeck.get(d.id) ?? 0)}
                </span>
              )}
              <span className="text-xs text-ink-dim">
                {new Date(d.updated_at).toLocaleDateString()}
              </span>
              <button
                onClick={async () => {
                  await cloneDeck(d.id)
                  refresh()
                }}
                className="text-xs text-ink-dim hover:text-ink-muted"
              >
                {ui.clone}
              </button>
              <button
                onClick={async () => {
                  if (confirm(ui.confirmDelete(d.name))) {
                    await deleteDeck(d.id)
                    refresh()
                  }
                }}
                className="text-xs text-ink-dim hover:text-blood-hi"
              >
                {ui.delete}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
