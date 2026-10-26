/** 世界模型的纯数据类型。所有强度为 0..1000 的整数，保证回放哈希稳定。 */

export type Channel = 'vision' | 'sound' | 'smell'
export type TerrainKind = 'floor' | 'wall' | 'door' | 'window' | 'void'
export type StairState = 'open' | 'blocked' | 'destroyed'
export type PresetId = '100x100' | '40x60' | '30x30' | '20x20'
export type WorldId = PresetId | 'manor'

export interface Permeability {
  move: number
  opacity: number
  acoustic: number
  scent: number
}

export interface Stair {
  /** 相邻层。双向边由两侧格子各自声明。 */
  to: number
  state: StairState
}

export interface Cell {
  terrain: TerrainKind
  stair: Stair | null
  /** 所属区域 id；对应 World.zones */
  zone?: string
}

export interface Coord {
  layer: number
  x: number
  y: number
}

export interface Character {
  id: string
  name: string
  /** 光标颜色 */
  tint: string
  controller: 'agent' | 'sim'
  pos: Coord
  initiative: number
}

/** 世界里的信息条目（事件型）。视角上目前只用来画场。 */
export interface InfoEntry {
  id: string
  channel: Channel
  strength: number
  origin: Coord
  label: string
  /** 存活回合数；缺省按 2 处理 */
  ttl?: number
}

export type ItemKind = 'weapon' | 'medicine' | 'document' | 'key' | 'tool' | 'misc'

/** 可携带物品：在地面上、被角色持有，或装在设施里。 */
export interface WorldItem {
  id: string
  name: string
  kind: ItemKind
  description: string
  portable?: boolean
  at?: Coord
  holder?: string
  container?: string
  /** 武器伤害与射程 */
  damage?: number
  range?: number
  /** 持有时的减伤 */
  defense?: number
  /** 使用后恢复的生命 */
  heal?: number
  /** 可打开的设施 id */
  unlocks?: string
  /** 阅读后写入私人记忆的内容 */
  document?: { content: string; topics: string[] }
}

export type FixtureKind = 'container' | 'door' | 'board' | 'device'
export type FixtureState = 'closed' | 'open' | 'locked' | 'broken' | 'on' | 'off'

/** 固定在格子上的设施：档案箱、药柜、黑板、井口、阀门、封印等。 */
export interface WorldFixture {
  id: string
  name: string
  at: Coord
  kind: FixtureKind
  state: FixtureState
  /** 上锁时需要的物品 id */
  keyId?: string
  description: string
}

export interface World {
  name: string
  preset: WorldId
  width: number
  height: number
  layers: number
  layerNames?: string[]
  /** 区域表：id -> 名称与一句静态描述 */
  zones?: Record<string, { name: string; note: string }>
  /** 安全边界；越界移动即死亡（仅对该层生效） */
  safeBounds?: { layer: number; x0: number; y0: number; x1: number; y1: number }
  /** 索引：layer * height * width + y * width + x */
  cells: Cell[]
  characters: Character[]
  info: InfoEntry[]
  /** 物品与设施；程序生成的空世界为空数组 */
  items?: WorldItem[]
  fixtures?: WorldFixture[]
  round: number
}

export const cellIndex = (world: World, c: Coord): number =>
  (c.layer * world.height + c.y) * world.width + c.x

export const coordOf = (world: World, index: number): Coord => ({
  layer: Math.floor(index / (world.width * world.height)),
  y: Math.floor((index % (world.width * world.height)) / world.width),
  x: index % world.width,
})

export const inBounds = (world: World, c: Coord): boolean =>
  c.layer >= 0 && c.layer < world.layers && c.x >= 0 && c.x < world.width && c.y >= 0 && c.y < world.height

export const cellAt = (world: World, c: Coord): Cell => world.cells[cellIndex(world, c)]

export const characterAt = (world: World, c: Coord): Character | undefined =>
  world.characters.find(ch => ch.pos.layer === c.layer && ch.pos.x === c.x && ch.pos.y === c.y)
