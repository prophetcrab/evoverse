import type {
  Channel, Character, Coord, InfoEntry, World, WorldFixture, WorldItem,
} from '../world/types'
import { cellAt, inBounds } from '../world/types'
import { permeabilityOf } from '../world/terrain'
import { hasLineOfSight } from '../world/field'
import { SEEDS, seedById } from './scenario'
import { createMockMind } from './mock-mind'
import type {
  MoveOption,
  Goal,
  FixtureView,
  ItemView,
  ActOutput,
  ActionRecord,
  Candidate,
  EntityId,
  MemoryEntry,
  Mind,
  RoundRecord,
  RoundResult,
  SimAction,
  SimCharacter,
  SimEvent,
  SimEventKind,
  SimView,
  StatePatch,
  VisibleEntity,
} from './types'
import { templateSummary, type RoundSummarizer } from './summarize'

interface SimInfo {
  id: string
  versionId: string
  channel: Channel
  strength: number
  origin: Coord
  label: string
  content: string
  gist: string
  topics: string[]
  ttl: number
  bornRound: number
  source?: EntityId
}

export interface SimEngine {
  round: number
  world: () => World
  view: () => SimView
  step: () => Promise<RoundResult>
  subscribe: (listener: () => void) => () => void
  /** 导出当前全部回合记录，供分析与复现。 */
  exportLog: () => string
}

const samePos = (a: Coord, b: Coord): boolean => a.layer === b.layer && a.x === b.x && a.y === b.y

const compact = (value: string): string => value.replace(/[\s，。、；：！？,.;:!?"'“”‘’（）()]/g, '')

/** LLM 常用角色称呼；解析不到实体时丢弃，避免写进脏键。 */
const ROLE_ALIASES: Record<string, EntityId> = {
  会长: 'kirisame-ren',
  学生会长: 'kirisame-ren',
  转校生: 'kirisame-transfer',
  宿舍长: 'kirisame-chinatsu',
  保健委员: 'kirisame-kanade',
  风纪委员: 'kirisame-hayato',
  老师: 'kirisame-saya',
  班主任: 'kirisame-saya',
  校医: 'kirisame-todo',
  园丁: 'kirisame-inukai',
  书记: 'kirisame-rei',
  理事长之女: 'kirisame-rin',
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const dist = (a: Coord, b: Coord): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.layer - b.layer) * 3

class Engine implements SimEngine {
  round = 0
  private readonly chars: Record<EntityId, SimCharacter> = {}
  private info: SimInfo[] = []
  private events: SimEvent[] = []
  private records: RoundRecord[] = []
  private listeners = new Set<() => void>()
  private seq = 0
  private lastActionCount = 0
  private readonly mind: Mind
  private readonly summarizer: RoundSummarizer
  private items: WorldItem[] = []
  private fixtures: WorldFixture[] = []
  private readonly assists = new Map<EntityId, number>()
  private snapshotWorld: World

  constructor(world: World, mind?: Mind, summarizer?: RoundSummarizer) {
    this.summarizer = summarizer ?? templateSummary
    this.snapshotWorld = { ...world, characters: [...world.characters] }
    this.items = (world.items ?? []).map(item => ({ ...item, at: item.at ? { ...item.at } : undefined }))
    this.fixtures = (world.fixtures ?? []).map(fixture => ({ ...fixture, at: { ...fixture.at } }))
    for (const character of world.characters) this.chars[character.id] = this.createCharacter(character)
    for (const item of this.items) {
      if (item.holder && this.chars[item.holder] && !this.chars[item.holder].inventory.includes(item.id)) {
        this.chars[item.holder].inventory.push(item.id)
      }
    }
    this.info = world.info.map(entry => ({
      id: entry.id,
      versionId: `i-init-${entry.id}`,
      channel: entry.channel,
      strength: entry.strength,
      origin: entry.origin,
      label: entry.label,
      content: entry.label,
      gist: entry.label,
      topics: [],
      ttl: entry.ttl ?? 2,
      bornRound: 0,
    }))
    const mockMind = createMockMind({
      world: () => this.snapshotWorld,
      canWalk: cell => this.canWalk(cell),
      neighbors: from => this.neighbors(from),
      stepToward: (from, to) => this.stepToward(from, to),
    })
    this.mind = mind ?? mockMind
  }

  private createCharacter(character: Character): SimCharacter {
    const seed = seedById(character.id)
    const memory: MemoryEntry[] = []
    let index = 0
    const pushMemory = (infoId: string, content: string, topics: string[], provenance: MemoryEntry['provenance']): void => {
      memory.push({
        versionId: `v-${character.id}-${index++}`,
        infoId,
        content,
        topics,
        provenance,
        derivedFrom: [],
        at: 0,
      })
    }
    if (seed) {
      seed.persona.forEach((line, i) => pushMemory(`self-${character.id}-${i}`, line, ['自我'], 'seed'))
      for (const entry of seed.creed) pushMemory(entry.infoId, entry.content, entry.topics, 'seed')
      for (const entry of seed.facts) pushMemory(entry.infoId, entry.content, entry.topics, 'seed')
      for (const entry of seed.others) pushMemory(entry.infoId, entry.content, entry.topics, 'seed')
      for (const entry of seed.past) pushMemory(entry.infoId, entry.content, entry.topics, 'seed')
      for (const entry of seed.secrets) pushMemory(entry.infoId, entry.content, entry.topics, 'seed')
      for (const entry of seed.rumors) pushMemory(entry.infoId, entry.content, entry.topics, 'seed')
    } else {
      pushMemory(`self-${character.id}`, `我是${character.name}。`, ['自我'], 'seed')
    }

    return {
      id: character.id,
      name: character.name,
      tint: character.tint,
      controller: character.controller,
      initiative: character.initiative,
      pos: { ...character.pos },
      status: 'active',
      vitals: { hp: 5, conditions: [] },
      ability: seed
        ? { ...seed.ability }
        : { name: '无', description: '没有觉醒能力。', level: 0, charge: 0, state: '稳定', limit: '' },
      needs: seed ? { ...seed.needs } : { safety: 300, status: 300, curiosity: 300 },
      goals: seed ? seed.goals.map(goal => ({ ...goal })) : [],
      attention: seed ? { ...seed.attention } : {},
      attitudes: seed ? Object.fromEntries(Object.entries(seed.attitudes).map(([id, value]) => [id, { ...value }])) : {},
      relations: {},
      presentation: { description: `${character.name}站在那里。`, overrides: false, at: 0 },
      inventory: [],
      memory,
      lastActedAt: -2,
      lastThought: null,
      lastAction: null,
      lastDigest: [],
    }
  }

  world(): World {
    return this.snapshotWorld
  }

  view(): SimView {
    const characters = Object.values(this.chars)
    const tension = characters.length === 0
      ? 0
      : characters.reduce((sum, c) => sum + Math.max(c.needs.safety, c.needs.status, c.needs.curiosity), 0) / characters.length
    return {
      round: this.round,
      characters,
      events: this.events.slice(-40),
      records: this.records,
      activity: this.lastActionCount,
      tension,
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  exportLog(): string {
    return JSON.stringify({
      version: 1,
      world: {
        preset: this.snapshotWorld.preset,
        width: this.snapshotWorld.width,
        height: this.snapshotWorld.height,
        layers: this.snapshotWorld.layers,
        round: this.round,
        items: this.items,
        fixtures: this.fixtures,
      },
      records: this.records,
      events: this.events,
    }, null, 2)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  async step(): Promise<RoundResult> {
    this.round += 1
    this.info = this.info.filter(entry => entry.bornRound + entry.ttl >= this.round)
    const infoStart = this.info.length

    const active = Object.values(this.chars).filter(character => character.status === 'active')
    const patches = new Map<EntityId, StatePatch>()
    const actions: SimAction[] = []

    const results = await Promise.all(active.map(async character => {
      const mind = this.mind
      const candidates = this.candidatesFor(character)
      const location = this.locationOf(character.pos)
      const visible = this.visibleFrom(character)
      const feel = await mind.feel({ self: character, candidates, visible, location, round: this.round })
      for (const versionId of feel.remember) {
        const entry = this.info.find(item => item.versionId === versionId)
        if (entry) this.remember(character, entry)
      }
      for (const targetId of feel.rememberPeople ?? []) {
        const target = this.chars[targetId]
        if (!target || target.status !== 'active' || !visible.some(entity => entity.id === targetId)) continue
        const infoId = `seen-${targetId}-${this.round}`
        if (character.memory.some(entry => entry.infoId === infoId)) continue
        character.memory.push({
          versionId: `i-seen-${this.seq++}`,
          infoId,
          content: `我看见${target.name}在附近：${target.presentation.description}`,
          topics: ['在场', target.name],
          provenance: 'perceived',
          derivedFrom: [],
          at: this.round,
          source: targetId,
        })
      }
      if (feel.attention) this.applyAttention(character, feel.attention)

      const moves = this.moveOptions(character)
      const items = this.itemViewsFor(character)
      const fixtures = this.fixtureViewsFor(character)
      const think = await mind.think({
        self: character,
        digest: character.lastDigest,
        visible,
        location,
        moves,
        items,
        fixtures,
        round: this.round,
      })
      for (const thought of think.thoughts) {
        const content = thought.content.trim()
        if (!content) continue
        const duplicate = character.memory.some(entry => entry.provenance === 'thought' && entry.content === content)
        if (duplicate) continue
        character.memory.push({
          versionId: `t-${this.seq++}`,
          infoId: `thought-${character.id}-${this.seq}`,
          content,
          topics: thought.topics,
          provenance: 'thought',
          derivedFrom: thought.derivedFrom ?? [],
          at: this.round,
        })
      }
      character.lastThought = think.thoughts[0]?.content ?? null
      if (think.patch) {
        const resolved = this.resolvePatch(character, think.patch)
        const hasEffect = Boolean(
          resolved.attitudes?.length || resolved.goals?.length || resolved.attention?.length
          || (resolved.needs && Object.keys(resolved.needs).length > 0)
          || resolved.presentation,
        )
        if (hasEffect) patches.set(character.id, resolved)
      }

      const act: ActOutput = think.intention
        ? await mind.act({ self: character, intention: think.intention, moves, items, fixtures, round: this.round })
        : { action: null }
      return act.action
    }))

    for (const action of results) if (action) actions.push(action)
    this.assists.clear()
    for (const action of actions) {
      if (action.kind !== 'assist') continue
      const actor = this.chars[action.actor]
      const target = this.resolveCharacterRef(action.targetEntity)
      if (actor && target && target.id !== actor.id && target.status === 'active' && this.canPerceive(actor, target)) {
        this.assists.set(target.id, (this.assists.get(target.id) ?? 0) + 1)
      }
    }
    const actionRecords = this.settle(actions)
    this.lastActionCount = actions.length

    for (const character of Object.values(this.chars)) {
      this.drift(character)
      const patch = patches.get(character.id)
      if (patch) this.applyPatch(character, patch)
    }

    const roundEvents = this.events.filter(event => event.round === this.round)
    for (const character of Object.values(this.chars)) {
      character.lastDigest = this.digestFor(character, roundEvents)
    }

    this.snapshotWorld = {
      ...this.snapshotWorld,
      round: this.round,
      characters: Object.values(this.chars).map(character => ({
        id: character.id,
        name: character.name,
        tint: character.tint,
        controller: character.controller,
        initiative: character.initiative,
        pos: { ...character.pos },
      })),
      info: this.info.map<InfoEntry>(entry => ({
        id: entry.id,
        channel: entry.channel,
        strength: entry.strength,
        origin: entry.origin,
        label: entry.label,
      })),
      items: this.items.map(item => ({ ...item, at: item.at ? { ...item.at } : undefined })),
      fixtures: this.fixtures.map(fixture => ({ ...fixture, at: { ...fixture.at } })),
    }

    const record: RoundRecord = {
      round: this.round,
      actions: actionRecords,
      events: roundEvents,
      info: this.info.slice(infoStart).map(entry => ({
        versionId: entry.versionId,
        channel: entry.channel,
        strength: entry.strength,
        origin: entry.origin,
        label: entry.label,
        source: entry.source,
      })),
      patches: [...patches.entries()].map(([actor, patch]) => ({ actor, patch })),
      summary: null,
      summaryPending: true,
    }
    this.records.push(record)
    this.notify()

    void this.summarizer({ record, world: this.snapshotWorld })
      .then(text => {
        record.summary = text
        record.summaryPending = false
        this.notify()
      })
      .catch(() => {
        record.summary = `第 ${record.round} 轮结束。`
        record.summaryPending = false
        this.notify()
      })

    return { round: this.round, events: roundEvents }
  }

  private candidatesFor(character: SimCharacter): Candidate[] {
    const known = new Set(character.memory.map(entry => entry.versionId))
    const candidates: Candidate[] = []
    for (const entry of this.info) {
      if (entry.source === character.id) continue
      if (known.has(entry.versionId)) continue
      const strength = this.perceiveStrength(entry, character.pos)
      if (strength < 50) continue
      candidates.push({
        versionId: entry.versionId,
        infoId: entry.id,
        content: strength >= 300 ? entry.content : entry.gist,
        gist: entry.gist,
        topics: entry.topics,
        strength,
        source: entry.source,
        sourceName: entry.source ? this.chars[entry.source]?.name : undefined,
      })
    }
    return candidates.sort((a, b) => b.strength - a.strength)
  }

  /** 单条信息在目标位置的强度：视觉走视线，声音/气味走距离与墙损的近似。 */
  private perceiveStrength(entry: SimInfo, to: Coord): number {
    const from = entry.origin
    if (from.layer !== to.layer) return 0
    const distance = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y))
    if (distance === 0) return entry.strength
    if (entry.channel === 'vision') {
      if (distance > 12) return 0
      return hasLineOfSight(this.snapshotWorld, from, to) ? entry.strength - 80 * distance : 0
    }
    const los = hasLineOfSight(this.snapshotWorld, from, to)
    if (entry.channel === 'sound') {
      if (distance > 15) return 0
      return entry.strength - 50 * distance - (los ? 0 : 300)
    }
    if (distance > 7) return 0
    return entry.strength - 100 * distance - (los ? 0 : 200)
  }

  private remember(character: SimCharacter, entry: SimInfo): void {
    if (character.memory.some(item => item.versionId === entry.versionId)) return
    character.memory.push({
      versionId: entry.versionId,
      infoId: entry.id,
      content: entry.content,
      gist: entry.gist,
      topics: entry.topics,
      provenance: 'perceived',
      derivedFrom: [],
      at: this.round,
      source: entry.source,
    })
  }

  private applyAttention(character: SimCharacter, updates: Array<{ topic: string; weight: number }>): void {
    for (const update of updates) character.attention[update.topic] = clamp(Math.round(update.weight), 0, 1000)
  }

  private dieOutside(actor: SimCharacter): void {
    actor.vitals.hp = 0
    actor.status = 'dead'
    const corpse = this.randomSafeCell()
    actor.pos = { ...corpse }
    actor.presentation = { description: `${actor.name}的尸体，倒在地上。`, overrides: true, at: this.round }
    const versionId = `i-death-${this.seq++}`
    this.info.push({
      id: versionId,
      versionId,
      channel: 'vision',
      strength: 800,
      origin: { ...corpse },
      label: `${actor.name}的尸体`,
      content: `${actor.name}的尸体，倒在地上。`,
      gist: `${actor.name}的尸体`,
      topics: ['尸体', '死亡'],
      ttl: 99,
      bornRound: this.round,
    })
    this.pushEvent('death', actor, undefined, `走出校门，倒在校外；尸体被移到 (${corpse.x}, ${corpse.y})`, corpse)
  }

  private randomSafeCell(): Coord {
    const bounds = this.snapshotWorld.safeBounds
    const layer = bounds?.layer ?? 0
    const minX = bounds?.x0 ?? 0
    const maxX = bounds?.x1 ?? this.snapshotWorld.width - 1
    const minY = bounds?.y0 ?? 0
    const maxY = bounds?.y1 ?? this.snapshotWorld.height - 1
    let seed = (this.seq * 2654435761 + this.round * 97) >>> 0
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < 200; i += 1) {
      const x = minX + Math.floor(next() * (maxX - minX + 1))
      const y = minY + Math.floor(next() * (maxY - minY + 1))
      const cell = { layer, x, y }
      if (!this.canWalk(cell)) continue
      if (Object.values(this.chars).some(other => other.status !== 'dead' && samePos(other.pos, cell))) continue
      return cell
    }
    return { layer, x: minX, y: minY }
  }

  private locationOf(cell: Coord): { name: string; note: string } {
    if (!inBounds(this.snapshotWorld, cell)) return { name: '未知', note: '' }
    const here = cellAt(this.snapshotWorld, cell)
    const zone = here.zone ? this.snapshotWorld.zones?.[here.zone] : undefined
    return zone ?? { name: `第 ${cell.layer} 层 (${cell.x}, ${cell.y})`, note: '' }
  }

  private visibleFrom(character: SimCharacter): VisibleEntity[] {
    return Object.values(this.chars)
      .filter(other => other.status === 'active' && other.id !== character.id && other.pos.layer === character.pos.layer)
      .filter(other => dist(other.pos, character.pos) <= 6 && hasLineOfSight(this.snapshotWorld, character.pos, other.pos))
      .map(other => ({
        id: other.id,
        name: other.name,
        pos: { ...other.pos },
        presentation: other.presentation.description,
        attitude: { ...(character.attitudes[other.id] ?? { trust: 0, fear: 0 }) },
      }))
  }

  private settle(actions: SimAction[]): ActionRecord[] {
    const ordered = [...actions].sort((a, b) => {
      const diff = this.chars[b.actor].initiative - this.chars[a.actor].initiative
      return diff !== 0 ? diff : a.actor.localeCompare(b.actor)
    })
    return ordered.map(action => this.applyAction(action))
  }

  private performMove(actor: SimCharacter, target: Coord): { outcome: 'ok' | 'blocked'; note: string; died: boolean } {
    const resolved = this.resolveMove(actor, target)
    if (!resolved) {
      this.pushEvent('blocked', actor, undefined, '路被挡住了', actor.pos)
      return { outcome: 'blocked', note: '路被挡住了', died: false }
    }
    const destination = resolved.target
    const bounds = this.snapshotWorld.safeBounds
    if (bounds && destination.layer === bounds.layer
      && (destination.x < bounds.x0 || destination.x > bounds.x1 || destination.y < bounds.y0 || destination.y > bounds.y1)) {
      this.dieOutside(actor)
      return { outcome: 'ok', note: '走出校门，死了', died: true }
    }
    actor.pos = { ...destination }
    const note = samePos(destination, target)
      ? `移动到 (${destination.layer}, ${destination.x}, ${destination.y})`
      : `向目标 (${target.layer}, ${target.x}, ${target.y}) 移动 ${resolved.steps} 格，到达 (${destination.layer}, ${destination.x}, ${destination.y})`
    this.pushEvent('move', actor, undefined, note, destination)
    return { outcome: 'ok', note, died: false }
  }

  private applyAction(action: SimAction): ActionRecord {
    const result = (outcome: ActionRecord['outcome'], note = ''): ActionRecord => ({ action, outcome, note })
    const actor = this.chars[action.actor]
    if (!actor) return result('blocked', '角色不存在')
    if (action.targetEntity) {
      const target = this.resolveCharacterRef(action.targetEntity)
      if (target) action.targetEntity = target.id
    }
    actor.lastActedAt = this.round
    actor.lastAction = action.behavior

    if (action.kind === 'idle') {
      if (!action.moveTo) return result('ok', '没有行动')
      const moved = this.performMove(actor, action.moveTo)
      return result(moved.died ? 'ok' : moved.outcome, moved.note)
    }

    if (action.kind === 'move') {
      if (!action.targetCell) {
        this.pushEvent('blocked', actor, undefined, '没有移动目标', actor.pos)
        return result('blocked', '没有移动目标')
      }
      const moved = this.performMove(actor, action.targetCell)
      return result(moved.died ? 'ok' : moved.outcome, moved.note)
    }

    // 移动 + 行为：先移动，再在处理行为时用新位置判定视线/距离
    if (action.moveTo) {
      const moved = this.performMove(actor, action.moveTo)
      if (moved.died) return result('ok', moved.note)
    }

    if (action.kind === 'speak') {
      const text = action.text ?? '……'
      this.createInfo(actor, 'sound', 600, text, action.topics ?? [], 1)
      this.pushEvent('speak', actor, undefined, text, actor.pos)
      return result('ok', text)
    }

    if (action.kind === 'tell') {
      const target = action.targetEntity ? this.chars[action.targetEntity] : undefined
      if (!target || !this.canPerceive(actor, target)) {
        this.pushEvent('blocked', actor, target?.id, '对方不在视线里', actor.pos)
        return result('blocked', '对方不在视线里')
      }
      const source = action.sourceVersion
        ? actor.memory.find(entry => entry.versionId === action.sourceVersion)
        : undefined
      target.memory.push({
        versionId: `i-told-${this.seq++}`,
        infoId: source?.infoId ?? `told-${actor.id}-${this.seq}`,
        content: action.text ?? '……',
        topics: action.topics ?? source?.topics ?? [],
        provenance: 'told',
        derivedFrom: source ? [source.versionId] : [],
        at: this.round,
        source: actor.id,
      })
      this.touchRelation(actor, target.id, action.polarity, action.text ?? '')
      this.pushEvent('tell', actor, target.id, action.text ?? '……', actor.pos)
      return result('ok', action.text ?? '……')
    }

    if (action.kind === 'attack') {
      const target = action.targetEntity ? this.chars[action.targetEntity] : undefined
      if (!target || target.status !== 'active') {
        this.pushEvent('blocked', actor, target?.id, '对方已经不能应战', actor.pos)
        return result('blocked', '对方已经不能应战')
      }
      const requested = action.itemId ? this.heldItem(actor, action.itemId) : undefined
      if (action.itemId && !requested) {
        this.pushEvent('blocked', actor, undefined, '没有拿着这件武器', actor.pos)
        return result('blocked', '没有拿着这件武器')
      }
      const weapon = requested ?? (action.method === '武器'
        ? this.heldItems(actor).find(item => item.kind === 'weapon')
        : undefined)
      if (action.method === '武器' && !weapon) {
        this.pushEvent('blocked', actor, undefined, '手里没有武器', actor.pos)
        return result('blocked', '手里没有武器')
      }
      const method = weapon ? '武器' : (action.method ?? '徒手')
      const range = weapon?.range ?? 1
      if (target.pos.layer !== actor.pos.layer
        || dist(target.pos, actor.pos) > range
        || !hasLineOfSight(this.snapshotWorld, actor.pos, target.pos)) {
        this.pushEvent('blocked', actor, target.id, `够不到（射程 ${range}）`, actor.pos)
        return result('blocked', `够不到（射程 ${range}）`)
      }
      const defense = this.heldItems(target).reduce((max, item) => Math.max(max, item.defense ?? 0), 0)
      const raw = (weapon?.damage ?? (method === '武器' ? 2 : 1)) + (this.assists.get(actor.id) ?? 0)
      const damage = Math.max(0, raw - defense)
      this.loseHp(target, damage)
      target.attitudes[actor.id] = { stance: '敌意', text: `${actor.name}对我动过手。` }
      target.memory.push({
        versionId: `t-hit-${this.seq++}`,
        infoId: `hit-${actor.id}-${this.seq}`,
        content: `${actor.name}用${weapon?.name ?? method}攻击了我。`,
        topics: ['攻击'],
        provenance: 'perceived',
        derivedFrom: [],
        at: this.round,
        source: actor.id,
      })
      this.touchRelation(actor, target.id, 'harm', `${weapon?.name ?? method}攻击`)
      if (range > 1) {
        this.createInfo(actor, 'sound', 700, `${actor.name}用${weapon?.name ?? method}开了火`, ['攻击'], 1)
      }
      const guard = defense > 0 ? `，护具挡下 ${Math.min(defense, raw)}` : ''
      const note = `${weapon?.name ?? method}攻击（${target.name} 生命 ${target.vitals.hp}/5${guard}）`
      this.pushEvent('attack', actor, target.id, note, actor.pos)
      return result('ok', note)
    }

    if (action.kind === 'ability') {
      const ability = action.ability
      if (!ability) return result('blocked', '没有指定能力')
      if (actor.ability.state === '封印') {
        this.pushEvent('blocked', actor, undefined, '能力被封印', actor.pos)
        return result('blocked', '能力被封印')
      }
      if (actor.ability.state === '暴走') {
        actor.vitals.conditions = [...new Set([...actor.vitals.conditions, '能力暴走'])]
        this.loseHp(actor, 1)
        this.pushEvent('ability', actor, undefined, `能力暴走反噬（生命 ${actor.vitals.hp}/5）`, actor.pos)
      }
      const chargeAbility = (): void => {
        const previous = actor.ability.state
        actor.ability.charge = clamp(actor.ability.charge + 20, 0, 100)
        const next = actor.ability.charge >= 80 ? '暴走' : actor.ability.charge >= 40 ? '亢进' : '稳定'
        if (next === '暴走' && previous !== '暴走') {
          this.pushEvent('ability', actor, undefined, `能力暴走（负荷 ${actor.ability.charge}）`, actor.pos)
          actor.vitals.conditions = [...new Set([...actor.vitals.conditions, '能力暴走'])]
          this.loseHp(actor, 1)
          this.pushEvent('ability', actor, undefined, `能力反噬（生命 ${actor.vitals.hp}/5）`, actor.pos)
        }
        actor.ability.state = next
      }
      if (ability.scope === 'self') {
        if (ability.name === '治疗') actor.vitals.hp = Math.min(5, actor.vitals.hp + 1)
        else if (ability.name === '镇定') actor.needs.safety = Math.max(0, actor.needs.safety - 200)
        else actor.presentation = {
          description: ability.text ?? actor.presentation.description,
          overrides: true,
          at: this.round,
        }
        this.pushEvent('ability', actor, undefined, `${ability.name}（自己）`, actor.pos)
        chargeAbility()
        return result('ok', ability.name)
      }
      if (ability.scope === 'other') {
        const target = action.targetEntity ? this.chars[action.targetEntity] : undefined
        if (!target || !this.canPerceive(actor, target)) {
          this.pushEvent('blocked', actor, target?.id, '够不到', actor.pos)
          return result('blocked', '够不到')
        }
        if (ability.name === '治疗') target.vitals.hp = Math.min(5, target.vitals.hp + 1)
        target.memory.push({
          versionId: `t-help-${this.seq++}`,
          infoId: `help-${actor.id}-${this.seq}`,
          content: `${actor.name}对我使用了${ability.name}。`,
          topics: ['帮助'],
          provenance: 'perceived',
          derivedFrom: [],
          at: this.round,
          source: actor.id,
        })
        this.touchRelation(actor, target.id, 'help', ability.name)
        this.pushEvent('ability', actor, target.id, `${ability.name}（${target.name}）`, actor.pos)
        chargeAbility()
        return result('ok', ability.name)
      }
      if (ability.scope === 'world') {
        this.createInfo(actor, 'vision', 700, ability.text ?? `${actor.name}留下的痕迹`, ability.topics ?? [], 99)
        this.pushEvent('ability', actor, undefined, ability.text ?? '留下痕迹', actor.pos)
        chargeAbility()
        return result('ok', '留下痕迹')
      }
      this.createInfo(actor, 'sound', 600, ability.text ?? `${actor.name}散布的消息`, ability.topics ?? [], 2)
      this.pushEvent('ability', actor, undefined, ability.text ?? '散布消息', actor.pos)
      chargeAbility()
      return result('ok', '散布消息')
    }

    if (action.kind === 'take') {
      const item = this.itemRef(action.itemId)
      if (!item) {
        this.pushEvent('blocked', actor, undefined, '这里没有这件东西', actor.pos)
        return result('blocked', '这里没有这件东西')
      }
      if (item.portable === false) {
        this.pushEvent('blocked', actor, undefined, '拿不动', actor.pos)
        return result('blocked', '拿不动')
      }
      if (item.holder === actor.id) {
        this.pushEvent('blocked', actor, undefined, '已经在你手上', actor.pos)
        return result('blocked', '已经在你手上')
      }
      if (item.holder) {
        const holder = this.chars[item.holder]
        if (holder?.status === 'active') {
          this.pushEvent('blocked', actor, holder.id, `${holder.name}拿着它`, actor.pos)
          return result('blocked', '在对方手上')
        }
        if (holder) holder.inventory = holder.inventory.filter(id => id !== item.id)
      }
      if (item.container) {
        const fixture = this.fixtures.find(entry => entry.id === item.container)
        if (!fixture || !this.isOpen(fixture)) {
          this.pushEvent('blocked', actor, undefined, '容器关着', actor.pos)
          return result('blocked', '容器关着')
        }
      } else if (!item.at || !samePos(item.at, actor.pos)) {
        this.pushEvent('blocked', actor, undefined, '不在这里', actor.pos)
        return result('blocked', '不在这里')
      }
      item.holder = actor.id
      item.at = undefined
      item.container = undefined
      if (!actor.inventory.includes(item.id)) actor.inventory.push(item.id)
      const note = `拿起了${item.name}`
      actor.memory.push({
        versionId: `t-take-${this.seq++}`,
        infoId: `take-${item.id}-${this.seq}`,
        content: note,
        topics: item.kind === 'document' ? ['记录'] : [],
        provenance: 'perceived',
        derivedFrom: [],
        at: this.round,
      })
      this.pushEvent('take', actor, undefined, note, actor.pos)
      return result('ok', note)
    }

    if (action.kind === 'drop') {
      const item = this.heldItem(actor, action.itemId)
      if (!item) {
        this.pushEvent('blocked', actor, undefined, '没拿着这件东西', actor.pos)
        return result('blocked', '没拿着这件东西')
      }
      item.holder = undefined
      item.container = undefined
      item.at = { ...actor.pos }
      actor.inventory = actor.inventory.filter(id => id !== item.id)
      const note = `放下了${item.name}`
      this.pushEvent('drop', actor, undefined, note, actor.pos)
      return result('ok', note)
    }

    if (action.kind === 'give') {
      const item = this.heldItem(actor, action.itemId)
      const target = this.resolveCharacterRef(action.targetEntity)
      if (!item) {
        this.pushEvent('blocked', actor, undefined, '没拿着这件东西', actor.pos)
        return result('blocked', '没拿着这件东西')
      }
      if (!target || target.id === actor.id || target.status !== 'active' || !this.canPerceive(actor, target)) {
        this.pushEvent('blocked', actor, target?.id, '对方不在视线里', actor.pos)
        return result('blocked', '对方不在视线里')
      }
      item.holder = target.id
      item.at = undefined
      item.container = undefined
      actor.inventory = actor.inventory.filter(id => id !== item.id)
      if (!target.inventory.includes(item.id)) target.inventory.push(item.id)
      target.memory.push({
        versionId: `t-give-${this.seq++}`,
        infoId: `give-${item.id}-${this.seq}`,
        content: `${actor.name}把${item.name}交给了我。`,
        topics: [],
        provenance: 'perceived',
        derivedFrom: [],
        at: this.round,
        source: actor.id,
      })
      this.touchRelation(actor, target.id, 'help', `给了${item.name}`)
      const note = `把${item.name}交给了${target.name}`
      this.pushEvent('give', actor, target.id, note, actor.pos)
      return result('ok', note)
    }

    if (action.kind === 'use') {
      const item = action.itemId ? this.heldItem(actor, action.itemId) : undefined
      if (action.itemId) {
        if (!item) {
          this.pushEvent('blocked', actor, undefined, '没拿着这件东西', actor.pos)
          return result('blocked', '没拿着这件东西')
        }
        if (item.kind === 'medicine') {
          const target = action.targetEntity ? this.resolveCharacterRef(action.targetEntity) : actor
          if (!target || (target.id !== actor.id && !this.canPerceive(actor, target))) {
            this.pushEvent('blocked', actor, target?.id, '够不到', actor.pos)
            return result('blocked', '够不到')
          }
          const heal = item.heal ?? 1
          target.vitals.hp = Math.min(5, target.vitals.hp + heal)
          target.memory.push({
            versionId: `t-med-${this.seq++}`,
            infoId: `med-${item.id}-${this.seq}`,
            content: `${actor.name}给我用了${item.name}。`,
            topics: ['治疗'],
            provenance: 'perceived',
            derivedFrom: [],
            at: this.round,
            source: actor.id,
          })
          if (target.id !== actor.id) this.touchRelation(actor, target.id, 'help', item.name)
          this.removeItem(item)
          const note = `${item.name}作用于${target.name}（生命 ${target.vitals.hp}/5）`
          this.pushEvent('use', actor, target.id, note, actor.pos)
          return result('ok', note)
        }
        if (item.kind === 'document' && item.document) {
          actor.memory.push({
            versionId: `t-read-${this.seq++}`,
            infoId: `read-${item.id}-${this.seq}`,
            content: item.document.content,
            topics: item.document.topics,
            provenance: 'perceived',
            derivedFrom: [],
            at: this.round,
          })
          const note = `读完了${item.name}`
          this.pushEvent('use', actor, undefined, note, actor.pos)
          return result('ok', note)
        }
        if (item.kind === 'key') {
          const fixture = this.fixturesAt(actor.pos).find(entry =>
            entry.keyId === item.id || item.unlocks === entry.id)
          if (!fixture) {
            this.pushEvent('blocked', actor, undefined, '这里没有对应的锁', actor.pos)
            return result('blocked', '这里没有对应的锁')
          }
          if (fixture.state !== 'locked') return result('blocked', '没有上锁')
          fixture.state = 'closed'
          const note = `用${item.name}打开了${fixture.name}`
          this.pushEvent('use', actor, undefined, note, actor.pos)
          return result('ok', note)
        }
        if (item.kind === 'weapon') {
          this.pushEvent('blocked', actor, undefined, '武器要用攻击动作', actor.pos)
          return result('blocked', '武器要用攻击动作')
        }
        if (item.kind === 'tool') {
          this.pushEvent('blocked', actor, undefined, '工具要用交互动作', actor.pos)
          return result('blocked', '工具要用交互动作')
        }
        const note = `使用了${item.name}`
        this.pushEvent('use', actor, undefined, note, actor.pos)
        return result('ok', note)
      }
      const target = action.targetEntity ? this.chars[action.targetEntity] : undefined
      if (!target || !this.canPerceive(actor, target)) {
        this.pushEvent('blocked', actor, target?.id, '够不到', actor.pos)
        return result('blocked', '够不到')
      }
      this.touchRelation(actor, target.id, action.polarity, action.behavior)
      let note = action.behavior
      if (action.polarity === 'harm') {
        this.loseHp(target, 1)
        note = `${action.behavior}（${target.name} 生命 ${target.vitals.hp}/5）`
      }
      this.pushEvent('use', actor, target.id, note, actor.pos)
      return result('ok', note)
    }

    if (action.kind === 'interact') {
      const fixture = this.fixtureRef(action.fixtureId) ?? this.fixturesAt(actor.pos)[0]
      if (!fixture) {
        this.pushEvent('blocked', actor, undefined, '这里没有可操作的设施', actor.pos)
        return result('blocked', '这里没有可操作的设施')
      }
      if (!samePos(fixture.at, actor.pos)) {
        this.pushEvent('blocked', actor, undefined, '设施不在这个格子', actor.pos)
        return result('blocked', '设施不在这个格子')
      }
      const verb = action.verb ?? (fixture.kind === 'board'
        ? action.text ? 'write' : 'read'
        : fixture.kind === 'device'
          ? 'toggle'
          : fixture.state === 'locked' ? 'unlock' : 'open')
      if (fixture.kind === 'device' && verb !== 'toggle') return result('blocked', '装置只能开关')
      if (fixture.kind === 'board' && verb !== 'write' && verb !== 'read') return result('blocked', '黑板只能读或写')
      if ((fixture.kind === 'container' || fixture.kind === 'door') && (verb === 'write' || verb === 'toggle')) {
        return result('blocked', '这个设施不能这样操作')
      }
      let note = ''
      if (verb === 'write') {
        if (fixture.kind !== 'board') return result('blocked', '这里不能写')
        if (!action.text) return result('blocked', '没有写内容')
        this.createInfo(actor, 'vision', 700, action.text, action.topics ?? ['记录'], 99)
        note = `在${fixture.name}上写下：${action.text}`
      } else if (verb === 'read') {
        if (fixture.kind !== 'board') return result('blocked', '这里没有可读的东西')
        note = `查看了${fixture.name}：${fixture.description}`
      } else if (verb === 'toggle') {
        if (fixture.kind !== 'device') return result('blocked', '这里没有开关')
        fixture.state = fixture.state === 'on' ? 'off' : 'on'
        note = `${fixture.name}已${fixture.state === 'on' ? '开启' : '关闭'}`
      } else if (verb === 'break') {
        const tool = this.heldItems(actor).find(entry => entry.kind === 'tool' || entry.kind === 'weapon')
        if (!tool) {
          this.pushEvent('blocked', actor, undefined, '需要工具或武器', actor.pos)
          return result('blocked', '需要工具或武器')
        }
        if (fixture.state === 'broken') return result('blocked', '已经坏了')
        fixture.state = 'broken'
        this.createInfo(actor, 'sound', 600, `${actor.name}用${tool.name}弄坏了${fixture.name}`, ['破坏'], 1)
        note = `用${tool.name}撬开了${fixture.name}`
      } else if (verb === 'unlock') {
        if (fixture.state !== 'locked') return result('blocked', '没有上锁')
        const key = this.heldItems(actor).find(entry =>
          entry.kind === 'key' && (entry.unlocks === fixture.id || fixture.keyId === entry.id))
        if (!key) {
          this.pushEvent('blocked', actor, undefined, '没有对应的钥匙', actor.pos)
          return result('blocked', '没有对应的钥匙')
        }
        fixture.state = 'closed'
        note = `用${key.name}打开了${fixture.name}`
      } else if (verb === 'lock') {
        if (fixture.state === 'locked') return result('blocked', '已经锁着')
        const key = this.heldItems(actor).find(entry =>
          entry.kind === 'key' && (entry.unlocks === fixture.id || fixture.keyId === entry.id))
        if (!key) return result('blocked', '没有对应的钥匙')
        fixture.state = 'locked'
        note = `锁上了${fixture.name}`
      } else if (verb === 'close') {
        if (fixture.state !== 'open') return result('blocked', '不是开着的')
        fixture.state = 'closed'
        note = `关上了${fixture.name}`
      } else {
        if (fixture.state === 'locked') {
          this.pushEvent('blocked', actor, undefined, '锁着', actor.pos)
          return result('blocked', '锁着')
        }
        if (fixture.state === 'open' || fixture.state === 'broken') {
          note = `${fixture.name}已经开着`
        } else {
          fixture.state = 'open'
          note = `打开了${fixture.name}`
        }
      }
      actor.memory.push({
        versionId: `t-fix-${this.seq++}`,
        infoId: `fixture-${fixture.id}-${this.seq}`,
        content: note,
        topics: ['设施'],
        provenance: 'perceived',
        derivedFrom: [],
        at: this.round,
      })
      this.pushEvent('interact', actor, undefined, note, actor.pos)
      return result('ok', note)
    }

    if (action.kind === 'assist') {
      const target = this.resolveCharacterRef(action.targetEntity)
      if (!target || target.id === actor.id || target.status !== 'active' || !this.canPerceive(actor, target)) {
        this.pushEvent('blocked', actor, target?.id, '没有能协助的对象', actor.pos)
        return result('blocked', '没有能协助的对象')
      }
      this.touchRelation(actor, target.id, 'help', action.behavior)
      target.memory.push({
        versionId: `t-assist-${this.seq++}`,
        infoId: `assist-${actor.id}-${this.seq}`,
        content: `${actor.name}在帮我。`,
        topics: ['协助'],
        provenance: 'perceived',
        derivedFrom: [],
        at: this.round,
        source: actor.id,
      })
      const note = `${actor.name}协助${target.name}`
      this.pushEvent('assist', actor, target.id, note, actor.pos)
      return result('ok', note)
    }

    return result('ok')
  }

  private touchRelation(actor: SimCharacter, targetId: EntityId, polarity: SimAction['polarity'], note: string): void {
    const relation = actor.relations[targetId] ?? { help: 0, harm: 0, contact: 0, lastAt: 0 }
    relation.contact += 1
    if (polarity === 'help') relation.help += 1
    if (polarity === 'harm') relation.harm += 1
    relation.lastAt = this.round
    actor.relations[targetId] = relation
    if (!actor.memory.some(entry => entry.content === note && entry.provenance === 'thought')) {
      actor.memory.push({
        versionId: `t-act-${this.seq++}`,
        infoId: `action-${actor.id}-${this.seq}`,
        content: note,
        topics: [],
        provenance: 'thought',
        derivedFrom: [],
        at: this.round,
        source: targetId,
      })
    }
  }

  private removeItem(item: WorldItem): void {
    for (const character of Object.values(this.chars)) {
      character.inventory = character.inventory.filter(id => id !== item.id)
    }
    this.items = this.items.filter(entry => entry.id !== item.id)
  }

  private loseHp(target: SimCharacter, amount: number): void {
    if (amount <= 0) return
    target.vitals.hp = Math.max(0, target.vitals.hp - amount)
    if (target.vitals.hp === 0 && target.status === 'active') {
      target.status = 'incapacitated'
      this.pushEvent('blocked', target, undefined, '倒下了，无法行动', target.pos)
    }
  }

  private canPerceive(actor: SimCharacter, target: SimCharacter): boolean {
    return target.pos.layer === actor.pos.layer
      && dist(target.pos, actor.pos) <= 7
      && hasLineOfSight(this.snapshotWorld, actor.pos, target.pos)
  }

  private createInfo(actor: SimCharacter, channel: Channel, strength: number, content: string, topics: string[], ttl: number): void {
    const versionId = `i-${this.seq++}`
    this.info.push({
      id: versionId,
      versionId,
      channel,
      strength,
      origin: { ...actor.pos },
      label: content,
      content,
      gist: content,
      topics,
      ttl,
      bornRound: this.round,
      source: actor.id,
    })
  }

  /** 把 id、姓名、称呼解析成实体；解析不到返回 undefined。 */
  private resolveCharacterRef(ref?: string): SimCharacter | undefined {
    if (!ref) return undefined
    if (this.chars[ref]) return this.chars[ref]
    const wanted = compact(ref)
    if (!wanted) return undefined
    const alias = ROLE_ALIASES[wanted]
    if (alias && this.chars[alias]) return this.chars[alias]
    const exact = Object.values(this.chars).find(character => compact(character.name) === wanted)
    if (exact) return exact
    const prefixed = Object.values(this.chars).filter(character => compact(character.name).startsWith(wanted))
    return prefixed.length === 1 ? prefixed[0] : undefined
  }

  /** 目标 id 或目标文本都能匹配；模糊包含只有唯一解时才采用。 */
  private resolveGoal(character: SimCharacter, ref: string): Goal | undefined {
    const wanted = compact(ref)
    if (!wanted) return undefined
    const exact = character.goals.find(goal => goal.id === ref || compact(goal.text) === wanted)
    if (exact) return exact
    const loose = character.goals.filter(goal => {
      const text = compact(goal.text)
      return text.includes(wanted) || wanted.includes(text)
    })
    return loose.length === 1 ? loose[0] : undefined
  }

  /** 归一化 LLM 的 patch：丢弃自指/无法解析的态度，目标文本转成 goal id。 */
  private resolvePatch(character: SimCharacter, patch: StatePatch): StatePatch {
    const next: StatePatch = { ...patch }
    if (patch.attitudes) {
      const attitudes = patch.attitudes.flatMap(update => {
        const target = this.resolveCharacterRef(update.target)
        if (!target || target.id === character.id) return []
        return [{ ...update, target: target.id }]
      })
      if (attitudes.length > 0) next.attitudes = attitudes
      else delete next.attitudes
    }
    if (patch.goals) {
      const goals = patch.goals.flatMap(update => {
        const goal = this.resolveGoal(character, update.id)
        return goal ? [{ id: goal.id, status: update.status }] : []
      })
      if (goals.length > 0) next.goals = goals
      else delete next.goals
    }
    return next
  }

  private applyPatch(character: SimCharacter, patch: StatePatch): void {
    if (patch.attitudes) {
      for (const update of patch.attitudes) {
        const current = character.attitudes[update.target] ?? { stance: '中立' as const, text: '还没打过交道。' }
        character.attitudes[update.target] = {
          stance: update.stance ?? current.stance,
          text: update.text ?? current.text,
        }
      }
    }
    if (patch.attention) this.applyAttention(character, patch.attention)
    if (patch.goals) {
      for (const update of patch.goals) {
        const goal = character.goals.find(item => item.id === update.id)
        if (goal) goal.status = update.status
      }
    }
    if (patch.presentation) {
      character.presentation = { ...patch.presentation, at: this.round }
    }
    if (patch.needs) {
      for (const [key, delta] of Object.entries(patch.needs)) {
        if (typeof delta !== 'number' || !(key in character.needs)) continue
        const needKey = key as keyof typeof character.needs
        character.needs[needKey] = clamp(character.needs[needKey] + delta, 0, 1000)
      }
    }
    if (patch.rationale) {
      this.pushEvent('reflect', character, undefined, patch.rationale, character.pos)
    }
  }

  private drift(character: SimCharacter): void {
    character.needs.safety = clamp(character.needs.safety + 6, 0, 1000)
    character.needs.status = clamp(character.needs.status + 4, 0, 1000)
    character.needs.curiosity = clamp(character.needs.curiosity + 8, 0, 1000)
    const ability = character.ability
    if (ability.state !== '封印') {
      ability.charge = clamp(ability.charge - 5, 0, 100)
      ability.state = ability.charge >= 80 ? '暴走' : ability.charge >= 40 ? '亢进' : '稳定'
    }
  }

  private digestFor(character: SimCharacter, events: SimEvent[]): string[] {
    const lines: string[] = []
    for (const event of events) {
      if (event.actor === character.id) {
        lines.push(`你${event.kind === 'speak' ? '说' : event.kind === 'tell' ? '对某人说' : event.kind === 'move' ? '移动了' : '做了'}：${event.text}`)
      } else if (event.target === character.id && event.actor) {
        lines.push(`${this.chars[event.actor]?.name ?? '有人'}对你：${event.text}`)
      } else if (event.at.layer === character.pos.layer && dist(event.at, character.pos) <= 6) {
        lines.push(`${event.actor ? this.chars[event.actor]?.name ?? '有人' : '有人'}${event.kind === 'speak' ? '说' : '在附近'}：${event.text}`)
      }
    }
    return lines
  }

  private pushEvent(kind: SimEventKind, actor: SimCharacter | undefined, target: EntityId | undefined, text: string, at: Coord): void {
    this.events.push({
      seq: this.seq++,
      round: this.round,
      kind,
      actor: actor?.id,
      target,
      text,
      at: { ...at },
    })
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300)
  }

  private canWalk(cell: Coord): boolean {
    if (!inBounds(this.snapshotWorld, cell)) return false
    if (cellAt(this.snapshotWorld, cell).terrain === 'void') return false
    return permeabilityOf(cellAt(this.snapshotWorld, cell)).move > 0
  }

  private neighbors(from: Coord): Coord[] {
    const options: Coord[] = [
      { layer: from.layer, x: from.x + 1, y: from.y },
      { layer: from.layer, x: from.x - 1, y: from.y },
      { layer: from.layer, x: from.x, y: from.y + 1 },
      { layer: from.layer, x: from.x, y: from.y - 1 },
    ]
    const cell = inBounds(this.snapshotWorld, from) ? cellAt(this.snapshotWorld, from) : undefined
    if (cell?.stair && cell.stair.state === 'open') {
      options.push({ layer: cell.stair.to, x: from.x, y: from.y })
    }
    return options.filter(option => this.canWalk(option))
  }

  private blockedCells(exceptId: EntityId): Set<string> {
    const blocked = new Set<string>()
    for (const character of Object.values(this.chars)) {
      if (character.id === exceptId || character.status !== 'active') continue
      blocked.add(`${character.pos.layer},${character.pos.x},${character.pos.y}`)
    }
    return blocked
  }

  private reachable(from: Coord, maxSteps: number, blocked?: Set<string>): Coord[] {
    const key = (cell: Coord): string => `${cell.layer},${cell.x},${cell.y}`
    const seen = new Set([key(from)])
    const found: Coord[] = []
    let frontier: Coord[] = [from]
    for (let step = 1; step <= maxSteps; step += 1) {
      const next: Coord[] = []
      for (const cell of frontier) {
        for (const neighbor of this.neighbors(cell)) {
          const neighborKey = key(neighbor)
          if (blocked?.has(neighborKey)) continue
          if (seen.has(neighborKey)) continue
          seen.add(neighborKey)
          next.push(neighbor)
          if (!this.occupiedBy(neighbor)) found.push(neighbor)
        }
      }
      frontier = next
    }
    return found
  }

  private moveOptions(character: SimCharacter): MoveOption[] {
    const blocked = this.blockedCells(character.id)
    return this.reachable(character.pos, 6, blocked)
      .map(pos => ({ pos, name: this.locationOf(pos).name }))
  }

  /** 目标附近（同层）可走的格子，按到目标的直线距离排序。 */
  private walkableNear(target: Coord, radius: number, blocked: Set<string>): Coord[] {
    if (target.layer < 0 || target.layer >= this.snapshotWorld.layers) return []
    const key = (cell: Coord): string => `${cell.layer},${cell.x},${cell.y}`
    const x0 = Math.max(0, target.x - radius)
    const x1 = Math.min(this.snapshotWorld.width - 1, target.x + radius)
    const y0 = Math.max(0, target.y - radius)
    const y1 = Math.min(this.snapshotWorld.height - 1, target.y + radius)
    const found: Coord[] = []
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const cell = { layer: target.layer, x, y }
        if (!this.canWalk(cell) || blocked.has(key(cell))) continue
        found.push(cell)
      }
    }
    return found.sort((a, b) => dist(a, target) - dist(b, target))
  }

  /**
   * 目标可走时直接规划路径；目标在墙里/被占/不可达时，
   * 在目标附近找可走格，按“路径长度 + 到目标距离”选最优，再沿路走 3 格。
   */
  private resolveMove(actor: SimCharacter, requested: Coord): { target: Coord; steps: number } | null {
    const blocked = this.blockedCells(actor.id)
    const requestedKey = `${requested.layer},${requested.x},${requested.y}`
    if (this.canWalk(requested) && !blocked.has(requestedKey)) {
      const path = this.shortestPath(actor.pos, requested, 1024, blocked)
      if (path) {
        if (path.length === 0) return { target: { ...actor.pos }, steps: 0 }
        const steps = Math.min(6, path.length)
        return { target: path[steps - 1], steps }
      }
    }
    const candidates = this.walkableNear(requested, 8, blocked).slice(0, 10)
    let best: { path: Coord[]; score: number } | null = null
    for (const candidate of candidates) {
      const path = this.shortestPath(actor.pos, candidate, 1024, blocked)
      if (!path || path.length === 0) continue
      const score = path.length + dist(candidate, requested)
      if (!best || score < best.score) best = { path, score }
    }
    if (best) {
      const steps = Math.min(6, best.path.length)
      return { target: best.path[steps - 1], steps }
    }
    const options = this.reachable(actor.pos, 6, blocked)
    if (options.length === 0) return null
    const target = options.sort((a, b) => dist(a, requested) - dist(b, requested))[0]
    if (!target) return null
    const path = this.shortestPath(actor.pos, target, 6, blocked)
    return path && path.length > 0 ? { target, steps: path.length } : null
  }

  private itemRef(ref?: string): WorldItem | undefined {
    if (!ref) return undefined
    const byId = this.items.find(item => item.id === ref)
    if (byId) return byId
    const wanted = compact(ref)
    if (!wanted) return undefined
    const exact = this.items.find(item => compact(item.name) === wanted)
    if (exact) return exact
    const prefixed = this.items.filter(item => compact(item.name).startsWith(wanted))
    return prefixed.length === 1 ? prefixed[0] : undefined
  }

  private fixtureRef(ref?: string): WorldFixture | undefined {
    if (!ref) return undefined
    const byId = this.fixtures.find(fixture => fixture.id === ref)
    if (byId) return byId
    const wanted = compact(ref)
    if (!wanted) return undefined
    const exact = this.fixtures.find(fixture => compact(fixture.name) === wanted)
    if (exact) return exact
    const prefixed = this.fixtures.filter(fixture => compact(fixture.name).startsWith(wanted))
    return prefixed.length === 1 ? prefixed[0] : undefined
  }

  private heldItems(character: SimCharacter): WorldItem[] {
    return character.inventory
      .map(id => this.items.find(item => item.id === id))
      .filter((item): item is WorldItem => item !== undefined)
  }

  private heldItem(character: SimCharacter, ref?: string): WorldItem | undefined {
    const item = this.itemRef(ref)
    return item && character.inventory.includes(item.id) ? item : undefined
  }

  private itemsAt(pos: Coord): WorldItem[] {
    return this.items.filter(item => !item.holder && !item.container && item.at && samePos(item.at, pos))
  }

  private fixturesAt(pos: Coord): WorldFixture[] {
    return this.fixtures.filter(fixture => samePos(fixture.at, pos))
  }

  private contentsOf(fixture: WorldFixture): WorldItem[] {
    return this.items.filter(item => item.container === fixture.id)
  }

  private isOpen(fixture: WorldFixture): boolean {
    return fixture.state === 'open' || fixture.state === 'broken'
  }

  private itemViewsFor(character: SimCharacter): ItemView[] {
    const views: ItemView[] = []
    const push = (item: WorldItem, place: ItemView['place'], container?: string): void => {
      views.push({
        id: item.id,
        name: item.name,
        kind: item.kind,
        description: item.description,
        place,
        ...(container ? { container } : {}),
      })
    }
    for (const item of this.heldItems(character)) push(item, 'held')
    for (const item of this.itemsAt(character.pos)) push(item, 'ground')
    for (const fixture of this.fixturesAt(character.pos)) {
      if (!this.isOpen(fixture)) continue
      for (const item of this.contentsOf(fixture)) push(item, 'container', fixture.id)
    }
    return views
  }

  private fixtureViewsFor(character: SimCharacter): FixtureView[] {
    return this.fixturesAt(character.pos).map(fixture => ({
      id: fixture.id,
      name: fixture.name,
      kind: fixture.kind,
      state: fixture.state,
      description: fixture.description,
      contents: this.isOpen(fixture) ? this.contentsOf(fixture).map(item => item.id) : [],
    }))
  }

  private occupiedBy(cell: Coord): boolean {
    return Object.values(this.chars).some(character =>
      character.status === 'active' && samePos(character.pos, cell))
  }

  /** BFS 最短路径（不含起点）；超出 maxSteps 返回 null。 */
  private shortestPath(from: Coord, to: Coord, maxSteps: number, blocked?: Set<string>): Coord[] | null {
    if (samePos(from, to)) return []
    const key = (cell: Coord): string => `${cell.layer},${cell.x},${cell.y}`
    const parent = new Map<string, Coord | null>()
    parent.set(key(from), null)
    let frontier: Coord[] = [from]
    for (let step = 1; step <= maxSteps; step += 1) {
      const next: Coord[] = []
      for (const cell of frontier) {
        for (const neighbor of this.neighbors(cell)) {
          const neighborKey = key(neighbor)
          if (blocked?.has(neighborKey)) continue
          if (parent.has(neighborKey)) continue
          parent.set(neighborKey, cell)
          if (samePos(neighbor, to)) {
            const path: Coord[] = []
            let cursor: Coord | null = neighbor
            while (cursor && !samePos(cursor, from)) {
              path.push(cursor)
              cursor = parent.get(key(cursor)) ?? null
            }
            return path.reverse()
          }
          next.push(neighbor)
        }
      }
      frontier = next
    }
    return null
  }

  private stepToward(from: Coord, to: Coord): Coord | null {
    const direct = this.shortestPath(from, to, 3)
    if (direct && direct.length > 0) return direct[direct.length - 1]
    const ahead = this.shortestPath(from, to, 12)
    if (ahead && ahead.length > 0) return ahead[Math.min(2, ahead.length - 1)]
    const options = this.neighbors(from)
    if (options.length === 0) return null
    return options.sort((a, b) => dist(a, to) - dist(b, to))[0] ?? null
  }
}

export function createEngine(world: World, mind?: Mind, summarizer?: RoundSummarizer): SimEngine {
  return new Engine(world, mind, summarizer)
}

export const SIM_CHARACTER_IDS = SEEDS.map(seed => seed.id)
