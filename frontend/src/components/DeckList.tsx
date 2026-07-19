import { useEffect, useState } from 'react'
import { listDecks, createDeck, deleteDeck, cloneDeck, type DeckSummary } from '../lib/deckStore'
import { navigate } from '../lib/route'

export default function DeckList() {
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')

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

  const create = async () => {
    const name = newName.trim() || 'Untitled deck'
    const id = await createDeck(name)
    navigate({ page: 'deck', id })
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-blood-hi">
        Couldn't load your decks: {error}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-3">
        <input
          className="min-w-48 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
          placeholder="New deck name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button onClick={create} className="rounded-lg bg-blood px-4 py-2 text-sm font-semibold text-white hover:bg-blood-hi">
          Create deck
        </button>
      </div>

      {status === 'loading' ? (
        <p className="text-sm text-ink-dim">Loading decks…</p>
      ) : decks.length === 0 ? (
        <p className="px-1 text-sm text-ink-dim">
          No decks yet — decks are stored locally in this browser (no account needed).
        </p>
      ) : (
        <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
          {decks.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <button
                onClick={() => navigate({ page: 'deck', id: d.id })}
                className="flex-1 truncate text-left hover:text-blood-hi"
              >
                {d.name}
              </button>
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
                Clone
              </button>
              <button
                onClick={async () => {
                  if (confirm(`Delete "${d.name}"? This can't be undone.`)) {
                    await deleteDeck(d.id)
                    refresh()
                  }
                }}
                className="text-xs text-ink-dim hover:text-blood-hi"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
