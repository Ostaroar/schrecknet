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

export type GameLoopComplexity = GameLoopLevel
export type GameLoopDrilldownId = 'action' | 'block' | 'combat' | 'referendum'

export interface GameLoopDrilldownDefinition {
  id: GameLoopDrilldownId
  label: string
  eyebrow: string
  summary: string
  parent: string
  entryState: string
}

export interface GameLoopVisibleTransition {
  to: string
  label: string | null
  kind: GameLoopTransitionKind
  hiddenSteps: number
}

export interface GameLoopBranch {
  from: string
  to: GameLoopState
  label: string | null
  drilldown: GameLoopDrilldownId | null
}

export const GAME_LOOP_DRILLDOWNS: GameLoopDrilldownDefinition[] = [
  {
    id: 'action',
    label: 'Action resolution',
    eyebrow: 'Minion phase',
    summary: 'Declare an action, open its timing window, resolve block attempts, then follow the blocked or successful path.',
    parent: 'MINION',
    entryState: 'ACTION_DECLARE',
  },
  {
    id: 'block',
    label: 'Block resolution',
    eyebrow: 'Action resolution',
    summary: 'Choose an eligible blocker, compare stealth and intercept, then resolve the early-end, no-combat, or combat path.',
    parent: 'BLOCK',
    entryState: 'BLOCK_START',
  },
  {
    id: 'combat',
    label: 'Combat rounds',
    eyebrow: 'Blocked action',
    summary: 'Move through strike, damage, press, and repeat. Advanced mode reveals the complete seven-step round and timing details.',
    parent: 'COMBAT',
    entryState: 'COMBAT_START_NODE',
  },
  {
    id: 'referendum',
    label: 'Referendum',
    eyebrow: 'Successful political action',
    summary: 'Open polling, cast votes and ballots by impulse, tally the result, and apply the terms only if the referendum passes.',
    parent: 'REF',
    entryState: 'REF_START',
  },
]

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

export function getDrilldownDefinition(id: GameLoopDrilldownId): GameLoopDrilldownDefinition {
  const definition = GAME_LOOP_DRILLDOWNS.find((candidate) => candidate.id === id)
  if (!definition) throw new Error(`Unknown game-loop drill-down: ${id}`)
  return definition
}

export function drilldownForEntryState(stateId: string): GameLoopDrilldownId | null {
  if (stateId === 'MINION_READY' || stateId === 'ACTION_DECLARE') return 'action'
  return GAME_LOOP_DRILLDOWNS.find((definition) => definition.entryState === stateId)?.id ?? null
}

function belongsToDrilldown(state: GameLoopState, definition: GameLoopDrilldownDefinition): boolean {
  if (definition.id === 'action') return state.parent === definition.parent && state.id.startsWith('ACTION_')
  return state.parent === definition.parent
}

export function listDrilldownStates(
  gameLoop: GameLoop,
  id: GameLoopDrilldownId,
  complexity: GameLoopComplexity,
): GameLoopState[] {
  const definition = getDrilldownDefinition(id)
  return gameLoop.states.filter(
    (state) => belongsToDrilldown(state, definition) && (complexity === 'advanced' || state.level === 'basic'),
  )
}

function firstVisibleTargets(
  gameLoop: GameLoop,
  currentId: string,
  allIds: Set<string>,
  visibleIds: Set<string>,
  visited: Set<string>,
  label: string | null,
  kind: GameLoopTransitionKind,
  hiddenSteps: number,
  includeHiddenConditionals: boolean,
): GameLoopVisibleTransition[] {
  if (visited.has(currentId)) return []
  if (visibleIds.has(currentId)) return [{ to: currentId, label, kind, hiddenSteps }]

  const nextVisited = new Set(visited).add(currentId)
  return gameLoop.transitions
    .filter(
      (transition) =>
        transition.from === currentId &&
        transition.kind !== 'bridge' &&
        allIds.has(transition.to) &&
        (includeHiddenConditionals || transition.kind !== 'conditional'),
    )
    .flatMap((transition) =>
      firstVisibleTargets(
        gameLoop,
        transition.to,
        allIds,
        visibleIds,
        nextVisited,
        label ?? transition.label,
        kind === 'flow' ? transition.kind : kind,
        hiddenSteps + 1,
        includeHiddenConditionals,
      ),
    )
}

export function listVisibleTransitions(
  gameLoop: GameLoop,
  id: GameLoopDrilldownId,
  from: string,
  complexity: GameLoopComplexity,
): GameLoopVisibleTransition[] {
  const definition = getDrilldownDefinition(id)
  const allIds = new Set(
    gameLoop.states.filter((state) => belongsToDrilldown(state, definition)).map((state) => state.id),
  )
  const visibleIds = new Set(listDrilldownStates(gameLoop, id, complexity).map((state) => state.id))
  const includeHiddenConditionals = complexity === 'advanced'

  const targets = gameLoop.transitions
    .filter(
      (transition) =>
        transition.from === from &&
        transition.kind !== 'bridge' &&
        allIds.has(transition.to) &&
        (includeHiddenConditionals || visibleIds.has(transition.to) || transition.kind !== 'conditional'),
    )
    .flatMap((transition) =>
      firstVisibleTargets(
        gameLoop,
        transition.to,
        allIds,
        visibleIds,
        new Set([from]),
        transition.label,
        transition.kind,
        visibleIds.has(transition.to) ? 0 : 1,
        includeHiddenConditionals,
      ),
    )

  return targets.filter(
    (target, index) =>
      targets.findIndex(
        (candidate) => candidate.to === target.to && candidate.label === target.label && candidate.kind === target.kind,
      ) === index,
  )
}

export function listDrilldownBranches(gameLoop: GameLoop, id: GameLoopDrilldownId): GameLoopBranch[] {
  const definition = getDrilldownDefinition(id)
  const sourceIds = new Set(
    gameLoop.states.filter((state) => belongsToDrilldown(state, definition)).map((state) => state.id),
  )
  const states = new Map(gameLoop.states.map((state) => [state.id, state]))
  const branchParents = new Set(['BLEED', 'HUNT', 'BLOCK', 'COMBAT', 'REF'])

  return gameLoop.transitions
    .filter(
      (transition) =>
        sourceIds.has(transition.from) &&
        !sourceIds.has(transition.to) &&
        transition.kind !== 'annotation' &&
        transition.kind !== 'bridge',
    )
    .map((transition) => {
      const target = states.get(transition.to)
      if (!target || !target.parent || !branchParents.has(target.parent)) return null
      return {
        from: transition.from,
        to: target,
        label: transition.label,
        drilldown: drilldownForEntryState(target.id),
      }
    })
    .filter((branch): branch is GameLoopBranch => branch !== null && branch.to.kind !== 'hook')
}
