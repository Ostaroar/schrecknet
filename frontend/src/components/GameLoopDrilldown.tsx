import {
  getDrilldownDefinition,
  listDrilldownBranches,
  listDrilldownStates,
  listVisibleTransitions,
  type GameLoop,
  type GameLoopComplexity,
  type GameLoopDrilldownId,
  type GameLoopState,
} from '../lib/gameLoop'
import RuleDetailList from './RuleDetailList'

interface GameLoopDrilldownProps {
  gameLoop: GameLoop
  id: GameLoopDrilldownId
  complexity: GameLoopComplexity
  onBack: () => void
  onNavigate: (id: GameLoopDrilldownId) => void
}

function stateKindLabel(state: GameLoopState): string {
  if (state.kind === 'decision') return 'Decision'
  if (state.kind === 'note') return 'Timing note'
  if (state.kind === 'window') return 'Play window'
  return 'Step'
}

export default function GameLoopDrilldown({
  gameLoop,
  id,
  complexity,
  onBack,
  onNavigate,
}: GameLoopDrilldownProps) {
  const definition = getDrilldownDefinition(id)
  const states = listDrilldownStates(gameLoop, id, complexity)
  const statesById = new Map(gameLoop.states.map((state) => [state.id, state]))
  const branches = listDrilldownBranches(gameLoop, id)

  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label="Rules breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ink-dim">
        <button type="button" onClick={onBack} className="hover:text-ink">
          Turn phases
        </button>
        <span aria-hidden="true">›</span>
        {id !== 'action' && (
          <>
            <button type="button" onClick={() => onNavigate('action')} className="hover:text-ink">
              Action resolution
            </button>
            <span aria-hidden="true">›</span>
          </>
        )}
        <span className="text-ink" aria-current="page">
          {definition.label}
        </span>
      </nav>

      <header className="rounded-3xl border border-line bg-surface px-5 py-6 sm:px-7">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-blood-hi">{definition.eyebrow}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl text-ink sm:text-4xl">{definition.label}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">{definition.summary}</p>
          </div>
          <span className="rounded-full border border-line bg-raised px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            {states.length} visible nodes
          </span>
        </div>
      </header>

      <ol className="grid gap-3" aria-label={`${definition.label} flow`}>
        {states.map((state, index) => {
          const outgoing = listVisibleTransitions(gameLoop, id, state.id, complexity)
          const stateBranches = branches.filter((branch) => branch.from === state.id)
          return (
            <li key={state.id} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[3rem_minmax(0,1fr)]">
              {index < states.length - 1 && (
                <span
                  className="absolute bottom-[-0.75rem] left-[1.2rem] top-10 w-px bg-line sm:left-[1.45rem]"
                  aria-hidden="true"
                />
              )}
              <span
                className={
                  'relative z-10 grid size-10 place-items-center rounded-full border font-mono text-xs sm:size-12 ' +
                  (state.kind === 'decision'
                    ? 'border-gold/60 bg-gold/10 text-gold'
                    : 'border-line bg-raised text-ink-muted')
                }
              >
                {index + 1}
              </span>

              <article className="min-w-0 rounded-2xl border border-line bg-raised p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim">
                        {stateKindLabel(state)}
                      </span>
                      {state.level === 'advanced' && (
                        <span className="rounded-full border border-gold/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold">
                          Advanced
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 font-display text-xl text-ink">{state.label}</h3>
                  </div>
                  <span className="font-mono text-[9px] text-ink-dim">{state.id}</span>
                </div>

                {state.detail && (
                  <div className="mt-3 border-t border-line-soft pt-3">
                    <RuleDetailList detail={state.detail} />
                  </div>
                )}

                {(outgoing.length > 0 || stateBranches.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-3" aria-label="Next paths">
                    {outgoing.map((transition) => {
                      const target = statesById.get(transition.to)
                      if (!target) return null
                      return (
                        <span
                          key={`${transition.to}-${transition.label ?? ''}-${transition.kind}`}
                          className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted"
                        >
                          {transition.label && <span className="mr-1 text-gold">{transition.label}:</span>}
                          {target.label} →
                        </span>
                      )
                    })}
                    {stateBranches.map((branch) =>
                      branch.drilldown ? (
                        <button
                          type="button"
                          key={`${branch.from}-${branch.to.id}`}
                          onClick={() => onNavigate(branch.drilldown as GameLoopDrilldownId)}
                          className="rounded-full border border-blood-hi/60 bg-blood/15 px-2.5 py-1 text-xs text-ink hover:bg-blood/25"
                        >
                          {branch.label && <span className="mr-1 text-blood-hi">{branch.label}:</span>}
                          Open {branch.to.label} →
                        </button>
                      ) : (
                        <span
                          key={`${branch.from}-${branch.to.id}`}
                          className="rounded-full border border-blood-hi/30 bg-blood/10 px-2.5 py-1 text-xs text-ink-muted"
                        >
                          {branch.label && <span className="mr-1 text-blood-hi">{branch.label}:</span>}
                          {branch.to.label} →
                        </span>
                      ),
                    )}
                  </div>
                )}
              </article>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
