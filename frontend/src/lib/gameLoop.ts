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
