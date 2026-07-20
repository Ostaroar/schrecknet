import { useEffect, useMemo, useState } from 'react'
import {
  drilldownForEntryState,
  listPhaseEntryStates,
  listTurnPhases,
  loadGameLoop,
  type GameLoop,
  type GameLoopComplexity,
  type GameLoopDrilldownId,
  type GameLoopState,
} from '../lib/gameLoop'
import GameLoopDrilldown from './GameLoopDrilldown'
import RuleDetailList from './RuleDetailList'

function phaseName(label: string): string {
  return label.replace(/^\d+\)\s*/, '')
}

function EntryPreview({ state, onClose }: { state: GameLoopState; onClose: () => void }) {
  return (
    <section className="rounded-2xl border border-gold/30 bg-ground/60 p-4 sm:p-5" aria-live="polite">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">Sub-loop entry</p>
          <h3 className="mt-1 font-display text-lg text-ink">{state.label}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-line-soft hover:text-ink"
        >
          Close
        </button>
      </div>
      <RuleDetailList detail={state.detail} />
      <p className="mt-4 text-xs text-ink-dim">This branch is summarized here because it sits outside the four core drill-downs.</p>
    </section>
  )
}

export default function RulesPage() {
  const [gameLoop, setGameLoop] = useState<GameLoop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [complexity, setComplexity] = useState<GameLoopComplexity>('basic')
  const [drilldown, setDrilldown] = useState<GameLoopDrilldownId | null>(null)

  useEffect(() => {
    let active = true
    loadGameLoop()
      .then((value) => {
        if (!active) return
        setGameLoop(value)
        setSelectedId((current) => current ?? listTurnPhases(value)[0]?.id ?? null)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the rules data')
      })
    return () => {
      active = false
    }
  }, [])

  const phases = useMemo(() => (gameLoop ? listTurnPhases(gameLoop) : []), [gameLoop])
  const selectedIndex = Math.max(0, phases.findIndex((phase) => phase.id === selectedId))
  const selected = phases[selectedIndex]
  const entries = useMemo(() => {
    if (!gameLoop || !selected) return []
    return listPhaseEntryStates(gameLoop, selected.id).filter(
      (candidate) => complexity === 'advanced' || candidate.level === 'basic',
    )
  }, [complexity, gameLoop, selected])
  const entry = entries.find((candidate) => candidate.id === entryId) ?? null

  const selectPhase = (id: string) => {
    setSelectedId(id)
    setEntryId(null)
    setDrilldown(null)
  }

  const openEntry = (candidate: GameLoopState) => {
    const nextDrilldown = drilldownForEntryState(candidate.id)
    if (nextDrilldown) {
      setDrilldown(nextDrilldown)
      setEntryId(null)
    } else {
      setEntryId(candidate.id)
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-blood/50 bg-surface p-6">
        <h1 className="font-display text-2xl">Rules reference unavailable</h1>
        <p className="mt-2 text-sm text-ink-muted">{error}</p>
      </div>
    )
  }

  if (!gameLoop || !selected) {
    return <p className="py-16 text-center text-sm text-ink-muted">Opening the V5 rules reference…</p>
  }

  return (
    <div className="grid min-w-0 gap-6 pb-8">
      <header className="overflow-hidden rounded-3xl border border-line bg-surface px-5 py-7 sm:px-8 sm:py-9">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-blood-hi">VTES V5 rules reference</p>
          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-5xl">A turn, in five clear phases.</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Follow one Methuselah’s turn from unlock to discard. Choose a phase to see what happens and where its
            deeper rules loop begins.
          </p>
        </div>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-raised px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Rules complexity</p>
          <p className="text-xs text-ink-dim">
            {complexity === 'basic' ? 'Core flow for learning and play.' : 'Full timing detail for experienced players and judges.'}
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-ground p-1" role="group" aria-label="Rules complexity">
          {(['basic', 'advanced'] as const).map((level) => (
            <button
              type="button"
              key={level}
              aria-pressed={complexity === level}
              onClick={() => setComplexity(level)}
              className={
                'rounded-lg px-3 py-1.5 text-sm transition ' +
                (complexity === level ? 'bg-blood text-white' : 'text-ink-muted hover:text-ink')
              }
            >
              {level === 'basic' ? 'Basic' : 'Advanced / Judge'}
            </button>
          ))}
        </div>
      </section>

      {drilldown ? (
        <GameLoopDrilldown
          gameLoop={gameLoop}
          id={drilldown}
          complexity={complexity}
          onBack={() => setDrilldown(null)}
          onNavigate={setDrilldown}
        />
      ) : (
        <>

      <section className="min-w-0 rounded-3xl border border-line bg-surface p-4 sm:p-6" aria-label="Turn phases">
        <div className="max-w-full overflow-x-auto pb-2">
          <ol className="relative grid min-w-[44rem] grid-cols-5 gap-2 before:absolute before:left-[10%] before:right-[10%] before:top-5 before:h-px before:bg-line">
            {phases.map((phase, index) => {
              const active = phase.id === selected.id
              const complete = index < selectedIndex
              return (
                <li key={phase.id} className="relative z-10">
                  <button
                    type="button"
                    onClick={() => selectPhase(phase.id)}
                    aria-current={active ? 'step' : undefined}
                    className="group flex w-full flex-col items-center gap-2 rounded-xl px-2 py-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blood-hi"
                  >
                    <span
                      className={
                        'grid size-10 place-items-center rounded-full border font-mono text-sm transition ' +
                        (active
                          ? 'border-blood-hi bg-blood text-white shadow-[0_0_0_4px_rgba(179,46,64,0.16)]'
                          : complete
                            ? 'border-gold bg-raised text-gold'
                            : 'border-line bg-ground text-ink-dim group-hover:border-ink-dim group-hover:text-ink')
                      }
                    >
                      {index + 1}
                    </span>
                    <span className={'font-display text-sm ' + (active ? 'text-ink' : 'text-ink-muted')}>
                      {phaseName(phase.label)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-line bg-raised p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              Phase {selectedIndex + 1} of {phases.length}
            </p>
            <h2 className="mt-1 font-display text-2xl text-ink sm:text-3xl">{phaseName(selected.label)}</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={selectedIndex === 0}
              onClick={() => selectPhase(phases[selectedIndex - 1].id)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={selectedIndex === phases.length - 1}
              onClick={() => selectPhase(phases[selectedIndex + 1].id)}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>

        <RuleDetailList detail={selected.detail} />

        {entries.length > 0 && (
          <div className="border-t border-line-soft pt-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-ink-dim">Continue into this phase</p>
            <div className="flex flex-wrap gap-2">
              {entries.map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  onClick={() => openEntry(candidate)}
                  className={
                    'rounded-full border px-3 py-1.5 text-sm transition ' +
                    (entryId === candidate.id
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-line bg-surface text-ink-muted hover:border-gold/50 hover:text-ink')
                  }
                >
                  {candidate.label} →
                </button>
              ))}
            </div>
          </div>
        )}

        {entry && <EntryPreview state={entry} onClose={() => setEntryId(null)} />}
      </section>
        </>
      )}

      <p className="text-center text-xs text-ink-dim">
        Source: the canonical SchreckNet V5 game-loop statechart · available offline
      </p>
    </div>
  )
}
