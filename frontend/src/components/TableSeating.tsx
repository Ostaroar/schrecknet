import { useState } from 'react'
import { randomSeating, type Seat } from '../lib/seating'
import { navigate } from '../lib/route'

export default function TableSeating() {
  const [names, setNames] = useState<string[]>(['', '', '', ''])
  const [seats, setSeats] = useState<Seat[] | null>(null)

  const setName = (i: number, value: string) => {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)))
    setSeats(null)
  }

  const addPlayer = () => {
    if (names.length >= 6) return
    setNames((prev) => [...prev, ''])
    setSeats(null)
  }

  const removePlayer = (i: number) => {
    setNames((prev) => prev.filter((_, idx) => idx !== i))
    setSeats(null)
  }

  const players = names.map((n) => n.trim()).filter(Boolean)
  const canSeat = players.length >= 4 && players.length === new Set(players).size

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ page: 'decks' })} className="text-xs text-ink-dim hover:text-ink-muted">
          ← Decks
        </button>
        <h1 className="font-display text-xl">Table seating</h1>
      </div>

      <p className="text-xs text-ink-dim">
        VTES tables seat 4–6 players. Enter names, then shuffle for a random turn order — each
        player's prey is their clockwise neighbor (whose pool they bleed); their predator is the
        counter-clockwise neighbor (who bleeds them).
      </p>

      <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
        {names.map((name, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-ink placeholder:text-ink-dim focus:border-blood focus:outline-none"
              placeholder={`Player ${i + 1}`}
              value={name}
              onChange={(e) => setName(i, e.target.value)}
            />
            {names.length > 4 && (
              <button
                onClick={() => removePlayer(i)}
                className="grid size-6 place-items-center rounded border border-line text-xs text-ink-dim hover:text-blood-hi"
                aria-label={`Remove player ${i + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={addPlayer}
            disabled={names.length >= 6}
            className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-40"
          >
            Add player
          </button>
          <button
            onClick={() => setSeats(randomSeating(players))}
            disabled={!canSeat}
            className="rounded-lg bg-blood px-3 py-1.5 text-xs font-semibold text-white hover:bg-blood-hi disabled:opacity-50"
          >
            Shuffle seats
          </button>
          {!canSeat && players.length > 0 && (
            <span className="text-xs text-ink-dim">
              {players.length < 4 ? 'Need at least 4 named players.' : 'Player names must be unique.'}
            </span>
          )}
        </div>
      </div>

      {seats && (
        <div className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
          {seats.map((seat, i) => (
            <div key={seat.player} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono text-xs text-ink-dim">{i + 1}</span>
              <span className="font-semibold text-ink">{seat.player}</span>
              <span className="text-xs text-ink-muted">
                predator <span className="text-ink">{seat.predator}</span> · prey{' '}
                <span className="text-ink">{seat.prey}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
