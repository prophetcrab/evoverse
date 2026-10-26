import type { Cell, Channel, Permeability, TerrainKind } from './types'

/** 地形默认渗透率：1 = 全通，0 = 全阻。 */
export const TERRAIN_PERMEABILITY: Record<TerrainKind, Permeability> = {
  floor: { move: 1, opacity: 1, acoustic: 1, scent: 1 },
  wall: { move: 0, opacity: 0, acoustic: 0.3, scent: 0.4 },
  door: { move: 0, opacity: 0, acoustic: 0.6, scent: 0.7 },
  window: { move: 0, opacity: 1, acoustic: 0.8, scent: 0.9 },
  void: { move: 0, opacity: 0, acoustic: 0, scent: 0 },
}

/** 每格损耗（强度千分制）。 */
export const CHANNEL_STEP_COST: Record<Channel, number> = { vision: 80, sound: 50, smell: 100 }
/** 满损耗（渗透率为 0 时）的墙损。 */
export const CHANNEL_WALL_COST: Record<Channel, number> = { vision: 400, sound: 600, smell: 400 }
/** 格/回合；视觉同轮到达。 */
export const CHANNEL_SPEED: Record<Channel, number> = { vision: Infinity, sound: 300, smell: 3 }
export const CHANNEL_TTL: Record<Channel, number> = { vision: 1, sound: 1, smell: 4 }

/** 可察觉 / 可辨认阈值。 */
export const NOTICE = 50
export const DETAIL = 300

export const S0 = {
  whisper: 250,
  speech: 600,
  shout: 1000,
  action: 800,
  strongSmell: 700,
  trace: 700,
} as const

export const TERRAIN_LABEL: Record<TerrainKind, string> = {
  floor: '地面',
  wall: '墙',
  door: '门',
  window: '窗',
  void: '虚空',
}

export const STAIR_LABEL = {
  open: '通行',
  blocked: '堵住',
  destroyed: '拆毁',
} as const

export const CHANNEL_LABEL: Record<Channel, string> = {
  vision: '视觉',
  sound: '声音',
  smell: '气味',
}

/** 楼梯状态覆盖地形渗透率。 */
export function permeabilityOf(cell: Cell): Permeability {
  const base = TERRAIN_PERMEABILITY[cell.terrain]
  if (!cell.stair) return base
  if (cell.stair.state === 'blocked') {
    return { ...base, move: 0, acoustic: Math.min(base.acoustic, 0.3) }
  }
  if (cell.stair.state === 'destroyed') {
    return { ...base, move: base.move }
  }
  return base
}

export function chromaOf(cell: Cell): string {
  if (cell.stair) {
    if (cell.stair.state === 'blocked') return '#a8752f'
    if (cell.stair.state === 'destroyed') return '#6b3b3b'
    return '#3fb6a8'
  }
  switch (cell.terrain) {
    case 'wall': return '#59616f'
    case 'door': return '#8a6a42'
    case 'window': return '#3f6b7d'
    case 'void': return '#0b0e12'
    default: return '#262b33'
  }
}
