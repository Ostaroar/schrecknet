import { useEffect, useMemo, useState } from 'react'
import {
  computeImpulseSeatOrder,
  getImpulseOrder,
  IMPULSE_CONTEXTS,
  type GameLoop,
  type ImpulseContext,
  type ImpulseSeat,
} from '../lib/gameLoop'

const SEAT_LABELS: Record<ImpulseSeat['role'], string> = {
  acting: 'Acting Methuselah',
  defender: 'Defender',
  targeted_clockwise: 'Targeted',
  clockwise_others: 'Passes',
  prey: 'Prey',
  predator: 'Predator',
}

function seatPosition(seat: number): { left: string; top: string } {
  const angle = (Math.PI / 180) * (-90 + seat * 72)
  const left = 50 + 40 * Math.cos(angle)
  const top = 50 + 40 * Math.sin(angle)
  return { left: `${left}%`, top: `${top}%` }
}

interface ImpulseOrderWidgetProps {
  gameLoop: GameLoop
  onBack: () => void
}

export default function ImpulseOrderWidget({ gameLoop, onBack }: ImpulseOrderWidgetProps) {
  const [context, setContext] = useState<ImpulseContext>('combat')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const order = getImpulseOrder(gameLoop, context)
  const sequence = useMemo(() => (order ? computeImpulseSeatOrder(order) : []), [order])

  useEffect(() => {
    setStep(0)
    setPlaying(false)
  }, [context])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setStep((current) => {
        if (current >= sequence.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, 1100)
    return () => clearInterval(id)
  }, [playing, sequence.length])

  const activeRole = sequence[step]?.role ?? null
  const activeSeats = new Set(sequence.slice(0, step + 1).map((entry) => entry.seat))
  const currentSeat = sequence[step]?.seat ?? 0

  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label="Rules breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ink-dim">
        <button type="button" onClick={onBack} className="hover:text-ink">
          Turn phases
        </button>
        <span aria-hidden="true">›</span>
        <span className="text-ink" aria-current="page">
          Impulse &amp; priority order
        </span>
      </nav>

      <header className="rounded-3xl border border-line bg-surface px-5 py-6 sm:px-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blood-hi">Priority window</p>
        <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Who passes impulse next?</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Impulse always returns to the acting Methuselah after any play. Pick a context to see who gets priority,
          and in what order, once they pass.
        </p>
      </header>

      <section className="flex flex-wrap gap-2 rounded-2xl border border-line bg-raised p-3" role="group" aria-label="Context">
        {IMPULSE_CONTEXTS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={context === candidate.id}
            onClick={() => setContext(candidate.id)}
            className={
              'rounded-lg px-3 py-1.5 text-sm transition ' +
              (context === candidate.id ? 'bg-blood text-white' : 'border border-line bg-ground text-ink-muted hover:text-ink')
            }
          >
            {candidate.label}
          </button>
        ))}
      </section>

      <section className="grid gap-5 rounded-3xl border border-line bg-surface p-5 sm:p-7 md:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="relative mx-auto aspect-square w-full max-w-[20rem]">
          {[0, 1, 2, 3, 4].map((seat) => {
            const position = seatPosition(seat)
            const isCurrent = seat === currentSeat
            const hasPassed = activeSeats.has(seat)
            const role =
              seat === 0
                ? 'Acting'
                : seat === 1
                  ? 'Prey'
                  : seat === 4
                    ? 'Predator'
                    : null
            return (
              <div
                key={seat}
                className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center gap-1 text-center"
                style={position}
              >
                <span
                  className={
                    'grid size-12 place-items-center rounded-full border font-mono text-sm transition ' +
                    (isCurrent
                      ? 'border-blood-hi bg-blood text-white shadow-[0_0_0_5px_rgba(179,46,64,0.18)]'
                      : hasPassed
                        ? 'border-gold bg-raised text-gold'
                        : 'border-line bg-ground text-ink-dim')
                  }
                >
                  {seat + 1}
                </span>
                {role && <span className="text-[10px] uppercase tracking-wide text-ink-dim">{role}</span>}
              </div>
            )
          })}
        </div>

        <div className="grid content-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              Step {step + 1} of {sequence.length}
            </p>
            <p className="mt-1 font-display text-xl text-ink">
              {activeRole ? SEAT_LABELS[activeRole] : ''} — seat {currentSeat + 1}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {step === 0
                ? 'The acting Methuselah has priority first.'
                : 'Impulse snaps back to the acting Methuselah as soon as anyone plays — this is the pass order if everyone declines in turn.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => {
                setPlaying(false)
                setStep((current) => Math.max(0, current - 1))
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={step >= sequence.length - 1}
              onClick={() => {
                setPlaying(false)
                setStep((current) => Math.min(sequence.length - 1, current + 1))
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next →
            </button>
            <button
              type="button"
              onClick={() => {
                if (step >= sequence.length - 1) setStep(0)
                setPlaying((current) => !current)
              }}
              className="rounded-lg border border-gold/50 bg-gold/10 px-3 py-1.5 text-sm text-gold hover:border-gold"
            >
              {playing ? 'Pause' : 'Animate'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
