import type { EntityId, StatusKind } from './types'

export type AbilityKind = 'damage' | 'control' | 'support' | 'info' | 'movement' | 'terrain'
export type AbilityTarget = 'self' | 'character' | 'cell' | 'fixture' | 'item'

/** 每个角色一张能力卡：tool call 的 name、目标类型、射程与效果都以这里为准。 */
export interface AbilitySpec {
  name: string
  kind: AbilityKind
  description: string
  target: AbilityTarget
  range: number
  damage?: number
  status?: StatusKind
  duration?: number
  defense?: number
  heal?: number
  cleanse?: boolean
  tags: string[]
}

const spec = (value: AbilitySpec): AbilitySpec => value

export const ABILITY_SPECS: Record<EntityId, AbilitySpec> = {
  'kirisame-ren': spec({
    name: '重力', kind: 'damage', target: 'character', range: 5, damage: 2, status: 'rooted', duration: 1,
    tags: ['gravity'], description: '改变视野内目标的重力方向，压住或拽动对方。',
  }),
  'kirisame-mio': spec({
    name: '预知梦', kind: 'info', target: 'self', range: 0,
    tags: ['dream', 'precog'], description: '看见未来的一小段碎片，提前知道危险或选择。',
  }),
  'kirisame-hino': spec({
    name: '发火', kind: 'damage', target: 'character', range: 3, damage: 2, status: 'burning', duration: 2,
    tags: ['fire'], description: '点燃看得见的目标，火焰会持续灼烧。',
  }),
  'kirisame-yuki': spec({
    name: '读心', kind: 'info', target: 'character', range: 6,
    tags: ['mind'], description: '读到目标此刻的念头或一段记忆。',
  }),
  'kirisame-hayato': spec({
    name: '疾风', kind: 'damage', target: 'character', range: 6, damage: 1, status: 'slowed', duration: 1,
    tags: ['wind'], description: '借助风势冲刺、击退或牵制目标。',
  }),
  'kirisame-moe': spec({
    name: '植物对话', kind: 'control', target: 'character', range: 4, status: 'rooted', duration: 1,
    tags: ['plant'], description: '让藤蔓和根须缠住目标。',
  }),
  'kirisame-transfer': spec({
    name: '时间减速', kind: 'control', target: 'character', range: 5, status: 'slowed', duration: 1,
    tags: ['time'], description: '拖慢目标的时间感与动作。',
  }),
  'kirisame-kanade': spec({
    name: '治愈', kind: 'support', target: 'character', range: 6, heal: 1, cleanse: true,
    tags: ['heal'], description: '治疗伤口、清除部分负面状态。',
  }),
  'kirisame-hikaru': spec({
    name: '声波', kind: 'damage', target: 'character', range: 6, damage: 1, status: 'stunned', duration: 1,
    tags: ['sound', 'broadcast'], description: '用声波冲击目标，也能把声音送到远处。',
  }),
  'kirisame-genzo': spec({
    name: '记忆回溯', kind: 'info', target: 'character', range: 5,
    tags: ['memory'], description: '读取地点、物品或目标留下的一段过去。',
  }),
  'kirisame-saya': spec({
    name: '结界', kind: 'support', target: 'character', range: 4, defense: 1,
    tags: ['barrier'], description: '在目标周围立起屏障，减伤并挡住通道。',
  }),
  'kirisame-rei': spec({
    name: '冰', kind: 'damage', target: 'character', range: 4, damage: 1, status: 'frozen', duration: 1,
    tags: ['ice'], description: '冻结目标或地面，也能封住文件与门缝。',
  }),
  'kirisame-ryunosuke': spec({
    name: '硬化', kind: 'damage', target: 'character', range: 1, damage: 2, defense: 1,
    tags: ['harden'], description: '硬化身体与拳脚，硬碰硬地撞开或砸碎东西。',
  }),
  'kirisame-chinatsu': spec({
    name: '照明', kind: 'control', target: 'character', range: 6, status: 'blinded', duration: 1,
    tags: ['light'], description: '制造强光，照亮暗处或晃盲目标。',
  }),
  'kirisame-todo': spec({
    name: '精神安定', kind: 'support', target: 'character', range: 5, cleanse: true,
    tags: ['calm'], description: '压住恐惧、暴走和精神类状态。',
  }),
  'kirisame-shiori': spec({
    name: '空间转移', kind: 'movement', target: 'character', range: 5,
    tags: ['space'], description: '把自己或看得见的人传送到附近的空格。',
  }),
  'kirisame-inukai': spec({
    name: '嗅觉强化', kind: 'info', target: 'character', range: 8,
    tags: ['scent'], description: '追踪人或物品的气味，嗅出药物、泥土与隐藏物。',
  }),
  'kirisame-rin': spec({
    name: '暗示', kind: 'control', target: 'character', range: 6, status: 'suggested', duration: 1,
    tags: ['mind'], description: '用一句话让目标做或不做某件简单的事。',
  }),
}

export function abilitySpecFor(id: EntityId, name?: string): AbilitySpec | undefined {
  const found = ABILITY_SPECS[id]
  if (!found) return undefined
  if (!name) return found
  const compact = (value: string): string => value.replace(/\s+/g, '')
  return compact(found.name) === compact(name) ? found : undefined
}
