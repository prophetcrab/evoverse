import type { Channel, Coord, FixtureKind, FixtureState, ItemKind } from '../world/types'

export type EntityId = string
export type NeedKey = 'safety' | 'status' | 'curiosity'

/** 一条私人记忆（版本）。只增不改；空间信息不在这里，进记忆即私有。 */
export interface MemoryEntry {
  versionId: string
  infoId: string
  content: string
  /** 模糊档：强度不足时只给这个 */
  gist?: string
  topics: string[]
  provenance: 'seed' | 'perceived' | 'thought' | 'told'
  derivedFrom: string[]
  at: number
  source?: EntityId
}

export type Stance = '亲近' | '中立' | '戒备' | '敌意' | '畏惧'

export type AbilityStateName = '稳定' | '亢进' | '暴走' | '封印'

export type StatusKind =
  | 'burning' | 'frozen' | 'stunned' | 'rooted'
  | 'slowed' | 'blinded' | 'calm' | 'suggested'

export interface StatusEffect {
  kind: StatusKind
  /** 到这一轮结束前有效（含） */
  until: number
  source?: EntityId
}

/** 角色的能力状态：名称、等级、负荷与当前状态。 */
export interface AbilityState {
  name: string
  description: string
  level: number
  /** 0–100 负荷 */
  charge: number
  state: AbilityStateName
  limit: string
}

/** 对他人的态度：一个可变的立场标签 + 一句自然语言描述。 */
export interface Attitude {
  stance: Stance
  text: string
}

export interface Relation {
  help: number
  harm: number
  contact: number
  lastAt: number
}

export interface Goal {
  id: string
  text: string
  weight: number
  status: 'active' | 'blocked' | 'done'
  /** mock mind 用它寻路；LLM 时代可忽略 */
  target?: Coord
}

export interface SimCharacter {
  id: EntityId
  name: string
  tint: string
  controller: 'agent' | 'sim'
  initiative: number
  pos: Coord
  status: 'active' | 'incapacitated' | 'dead'
  /** 生命值：0..5，归零即失去行动能力 */
  vitals: { hp: number; conditions: string[] }
  ability: AbilityState
  needs: Record<NeedKey, number>
  goals: Goal[]
  attention: Record<string, number>
  attitudes: Record<EntityId, Attitude>
  relations: Record<EntityId, Relation>
  presentation: { description: string; overrides: boolean; at: number }
  /** 状态效果：燃烧、冻结、眩晕、定身等 */
  statuses: StatusEffect[]
  /** 携带的物品 id */
  inventory: string[]
  memory: MemoryEntry[]
  lastActedAt: number
  lastThought: string | null
  lastAction: string | null
  lastDigest: string[]
}

export type ActionKind =
  | 'move' | 'speak' | 'tell' | 'attack' | 'ability'
  | 'take' | 'drop' | 'give' | 'use' | 'interact' | 'assist' | 'idle'

export type TellMode = '告知' | '询问' | '请求' | '威胁'
export type AttackMethod = '徒手' | '武器' | '推搡'
export type AbilityScope = 'self' | 'other' | 'world' | 'info'
export type InteractVerb = 'open' | 'close' | 'lock' | 'unlock' | 'break' | 'write' | 'read' | 'toggle'

export interface Ability {
  scope?: AbilityScope
  name: string
  text?: string
  topics?: string[]
}

export interface SimAction {
  actor: EntityId
  kind: ActionKind
  targetEntity?: EntityId
  targetCell?: Coord
  text?: string
  topics?: string[]
  /** tell 的交流类型 */
  mode?: TellMode
  /** tell 时引用的来源版本（转述沿用其 infoId 与谱系） */
  sourceVersion?: string
  /** attack 的手段，决定伤害 */
  method?: AttackMethod
  /** ability 的作用域、名称与内容 */
  ability?: Ability
  /** 物品动作的 id */
  itemId?: string
  /** 设施交互的 id */
  fixtureId?: string
  /** 设施交互方式 */
  verb?: InteractVerb
  /** 本轮先移动到这里，再执行上面的行为；move-only 用 kind=move + targetCell */
  moveTo?: Coord
  behavior: string
  polarity: 'help' | 'harm' | 'neutral'
}

export interface StatePatch {
  attitudes?: Array<{ target: EntityId | string; stance?: Stance; text?: string }>
  attention?: Array<{ topic: string; weight: number }>
  goals?: Array<{ id: string; status: Goal['status'] }>
  /** 需求增量：行动会释放压力，所以这里通常是负值 */
  needs?: Partial<Record<NeedKey, number>>
  presentation?: { description: string; overrides: boolean }
  rationale: string
}

export interface Candidate {
  versionId: string
  infoId: string
  content: string
  gist: string
  topics: string[]
  strength: number
  source?: EntityId
  /** 声音等信息的来源角色名，便于 feel 识别“谁说的” */
  sourceName?: string
}

export interface FeelInput {
  self: SimCharacter
  candidates: Candidate[]
  /** 当前视野内的角色（同层、视线内、6 格内） */
  visible: VisibleEntity[]
  location: { name: string; note: string }
  round: number
}

export interface FeelOutput {
  remember: string[]
  /** 选择真正会留意的在场角色，写成私人记忆 */
  rememberPeople?: EntityId[]
  attention?: Array<{ topic: string; weight: number }>
}

export interface VisibleEntity {
  id: EntityId
  name: string
  pos: Coord
  presentation: string
  attitude: Attitude
}

export interface MoveOption {
  pos: Coord
  name: string
}

export interface ItemView {
  id: string
  name: string
  kind: ItemKind
  description: string
  place: 'held' | 'ground' | 'container'
  container?: string
}

export interface FixtureView {
  id: string
  name: string
  kind: FixtureKind
  state: FixtureState
  description: string
  contents: string[]
}

export interface ThinkInput {
  self: SimCharacter
  digest: string[]
  visible: VisibleEntity[]
  location: { name: string; note: string }
  /** 本轮最多 3 步可到达的空格（目标格用 pos） */
  moves: MoveOption[]
  /** 背包、当前格地面与打开容器里的物品 */
  items: ItemView[]
  /** 当前格的设施 */
  fixtures: FixtureView[]
  round: number
}

export interface ThinkOutput {
  thoughts: Array<{
    content: string
    topics: string[]
    derivedFrom?: string[]
    supersedes?: string[]
  }>
  intention: SimAction | null
  patch: StatePatch | null
}

export interface ActInput {
  self: SimCharacter
  intention: SimAction
  moves: MoveOption[]
  items: ItemView[]
  fixtures: FixtureView[]
  round: number
}

export interface ActOutput {
  action: SimAction | null
}

/** 思考层：三个方法对应三个阶段，可替换（mock / LLM）。 */
export interface Mind {
  feel(input: FeelInput): Promise<FeelOutput>
  think(input: ThinkInput): Promise<ThinkOutput>
  act(input: ActInput): Promise<ActOutput>
}

export type SimEventKind =
  | 'speak' | 'tell' | 'move' | 'attack' | 'ability'
  | 'take' | 'drop' | 'give' | 'use' | 'interact' | 'assist'
  | 'think' | 'reflect' | 'death' | 'blocked'

export interface SimEvent {
  seq: number
  round: number
  kind: SimEventKind
  actor?: EntityId
  target?: EntityId
  text: string
  at: Coord
}

export interface ActionRecord {
  action: SimAction
  outcome: 'ok' | 'blocked'
  note: string
}

export interface InfoRecord {
  versionId: string
  channel: Channel
  strength: number
  origin: Coord
  label: string
  source?: EntityId
}

export interface RoundRecord {
  round: number
  actions: ActionRecord[]
  events: SimEvent[]
  info: InfoRecord[]
  patches: Array<{ actor: EntityId; patch: StatePatch }>
  /** 异步生成的剧本变化摘要；null 表示还没生成完 */
  summary: string | null
  summaryPending: boolean
}

export interface SimView {
  round: number
  characters: SimCharacter[]
  events: SimEvent[]
  records: RoundRecord[]
  /** 世界活性观测：势与活动率 */
  activity: number
  tension: number
}

/** 一轮结束后返回给 UI 的新世界快照与视图数据。 */
export interface RoundResult {
  round: number
  events: SimEvent[]
}
