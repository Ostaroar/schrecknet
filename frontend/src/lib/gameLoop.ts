export type GameLoopLevel = 'basic' | 'advanced'
export type GameLoopStateKind = 'state' | 'decision' | 'window' | 'note' | 'hook'
export type GameLoopTransitionKind = 'flow' | 'conditional' | 'annotation' | 'bridge'

export interface GameLoopRegion {
  id: string
  label: string
  level: GameLoopLevel
  orthogonal: boolean
}

export interface GameLoopState {
  id: string
  label: string
  detail: string
  kind: GameLoopStateKind
  level: GameLoopLevel
  parent: string | null
  hooks: string[]
}

export interface GameLoopTransition {
  from: string
  to: string
  label: string | null
  guard: string | null
  kind: GameLoopTransitionKind
  level: GameLoopLevel
}

export interface GameLoopHook {
  id: string
  label: string
  window: string
  anchor: string
  cardTypes: string[]
}

export interface GameLoopImpulseOrder {
  id: string
  state: string
  contexts: string[]
  actingFirst: boolean
  afterActing: string[]
}

export interface GameLoop {
  version: string
  source: string
  meta: { title: string; players: number }
  regions: GameLoopRegion[]
  states: GameLoopState[]
  transitions: GameLoopTransition[]
  hooks: GameLoopHook[]
  impulseOrders: GameLoopImpulseOrder[]
}

let gameLoopRequest: Promise<GameLoop> | null = null

function isGameLoop(value: unknown): value is GameLoop {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.version === '1' &&
    Array.isArray(candidate.regions) &&
    Array.isArray(candidate.states) &&
    Array.isArray(candidate.transitions) &&
    Array.isArray(candidate.hooks) &&
    Array.isArray(candidate.impulseOrders)
  )
}

export function loadGameLoop(): Promise<GameLoop> {
  if (!gameLoopRequest) {
    gameLoopRequest = fetch(`${import.meta.env.BASE_URL}gameloop.json`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Game-loop data returned ${response.status}`)
        const value: unknown = await response.json()
        if (!isGameLoop(value)) throw new Error('Game-loop data has an unsupported schema')
        return value
      })
      .catch((error: unknown) => {
        gameLoopRequest = null
        throw error
      })
  }
  return gameLoopRequest
}

export function listTurnPhases(gameLoop: GameLoop): GameLoopState[] {
  const states = new Map(gameLoop.states.map((state) => [state.id, state]))
  const phases: GameLoopState[] = []
  const visited = new Set<string>()
  let current = 'TURN_BEGIN'

  while (!visited.has(current)) {
    visited.add(current)
    const next = gameLoop.transitions.find((transition) => {
      if (transition.from !== current || transition.kind !== 'flow' || transition.level !== 'basic') return false
      const target = states.get(transition.to)
      return target?.parent === 'TURN'
    })
    if (!next || next.to === 'TURN_END') break
    const phase = states.get(next.to)
    if (!phase) break
    phases.push(phase)
    current = phase.id
  }

  return phases
}

export function listPhaseEntryStates(gameLoop: GameLoop, phaseId: string): GameLoopState[] {
  const states = new Map(gameLoop.states.map((state) => [state.id, state]))
  return gameLoop.transitions
    .filter(
      (transition) =>
        transition.from === phaseId &&
        transition.kind !== 'annotation' &&
        transition.kind !== 'bridge',
    )
    .map((transition) => states.get(transition.to))
    .filter(
      (state): state is GameLoopState =>
        state !== undefined && state.parent !== 'TURN' && state.kind !== 'hook',
    )
    .filter((state, index, entries) => entries.findIndex((entry) => entry.id === state.id) === index)
}
