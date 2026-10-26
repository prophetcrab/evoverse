import type { Coord } from '../world/types'

export type Selection =
  | { kind: 'character'; id: string }
  | { kind: 'cell'; at: Coord }
