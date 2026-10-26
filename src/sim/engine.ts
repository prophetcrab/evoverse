import type { Channel, Character, Coord, InfoEntry, World } from '../world/types'
import { cellAt, inBounds } from '../world/types'
import { permeabilityOf } from '../world/terrain'
import { hasLineOfSight } from '../world/field'
import { SEEDS, seedById } from './scenario'
import { createMockMind } from './mock-mind'
import type {
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
  private readonly mockMind: Mind
  private readonly summarizer: RoundSummarizer
  private readonly options: EngineOptions
  private snapshotWorld: World

  constructor(world: World, mind?: Mind, summarizer?: RoundSummarizer, options: EngineOptions = {}) {
    this.summarizer = summarizer ?? templateSummary
    this.options = options
    this.snapshotWorld = { ...world, characters: [...world.characters] }
    for (const character of world.characters) this.chars[character.id] = this.createCharacter(character)
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
    this.mockMind = createMockMind({
      world: () => this.snapshotWorld,
      canWalk: cell => this.canWalk(cell),
      neighbors: from => this.neighbors(from),
      stepToward: (from, to) => this.stepToward(from, to),
    })
    this.mind = mind ?? this.mockMind
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

    const eligible = Object.values(this.chars).filter(character => this.eligible(character))
    const budget = this.options.budgetPerRound
    const ordered = budget === undefined
      ? eligible
      : [...eligible].sort((a, b) => this.urgency(b) - this.urgency(a))
    const assignments = ordered.map((character, index) => ({
      character,
      mind: budget !== undefined && index >= budget ? this.mockMind : this.mind,
    }))
    const patches = new Map<EntityId, StatePatch>()
    const actions: SimAction[] = []

    const results = await Promise.all(assignments.map(async ({ character, mind }) => {
      const candidates = this.candidatesFor(character)
      const location = this.locationOf(character.pos)
      const feel = await mind.feel({ self: character, candidates, location, round: this.round })
      for (const versionId of feel.remember) {
        const entry = this.info.find(item => item.versionId === versionId)
        if (entry) this.remember(character, entry)
      }
      if (feel.attention) this.applyAttention(character, feel.attention)

      const visible = this.visibleFrom(character)
      const think = await mind.think({ self: character, digest: character.lastDigest, visible, location, round: this.round })
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
      if (think.patch) patches.set(character.id, think.patch)

      const act: ActOutput = think.intention
        ? await mind.act({ self: character, intention: think.intention, round: this.round })
        : { action: null }
      return act.action
    }))

    for (const action of results) if (action) actions.push(action)
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

  private urgency(character: SimCharacter): number {
    return Math.max(character.needs.safety, character.needs.status, character.needs.curiosity)
      + character.initiative / 10
  }

  private eligible(character: SimCharacter): boolean {
    if (character.status !== 'active') return false
    if (this.candidatesFor(character).length > 0) return true
    if (Object.values(character.needs).some(value => value > 700)) return true
    if (character.goals.some(goal => goal.status === 'blocked')) return true
    const hasActiveGoal = character.goals.some(goal => goal.status === 'active')
    return hasActiveGoal && this.round - character.lastActedAt >= 2
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

  private locationOf(cell: Coord): { name: string; note: string } {
    if (!inBounds(this.snapshotWorld, cell)) return { name: '未知', note: '' }
    const here = cellAt(this.snapshotWorld, cell)
    const zone = here.zone ? this.snapshotWorld.zones?.[here.zone] : undefined
    return zone ?? { name: `第 ${cell.layer} 层 (${cell.x}, ${cell.y})`, note: '' }
  }

  private visibleFrom(character: SimCharacter): VisibleEntity[] {
    return Object.values(this.chars)
      .filter(other => other.id !== character.id && other.pos.layer === character.pos.layer)
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

  private applyAction(action: SimAction): ActionRecord {
    const result = (outcome: ActionRecord['outcome'], note = ''): ActionRecord => ({ action, outcome, note })
    const actor = this.chars[action.actor]
    if (!actor) return result('blocked', '角色不存在')
    actor.lastActedAt = this.round
    actor.lastAction = action.behavior

    if (action.kind === 'idle') return result('ok', '没有行动')

    if (action.kind === 'move') {
      const target = action.targetCell
      if (!target || !this.canWalk(target)) {
        this.pushEvent('blocked', actor, undefined, '路被挡住了', actor.pos)
        return result('blocked', '路被挡住了')
      }
      if (target.layer !== actor.pos.layer) {
        const here = cellAt(this.snapshotWorld, actor.pos)
        if (!here.stair || here.stair.state !== 'open' || here.stair.to !== target.layer) {
          this.pushEvent('blocked', actor, undefined, '这里上不去', actor.pos)
          return result('blocked', '这里上不去')
        }
      } else if (dist(target, actor.pos) !== 1) {
        this.pushEvent('blocked', actor, undefined, '太远了，走不到', actor.pos)
        return result('blocked', '太远了，走不到')
      }
      if (Object.values(this.chars).some(other => other.id !== actor.id && samePos(other.pos, target))) {
        this.pushEvent('blocked', actor, undefined, '有人挡在前面', actor.pos)
        return result('blocked', '有人挡在前面')
      }
      actor.pos = { ...target }
      this.pushEvent('move', actor, undefined, `移动到 (${target.layer}, ${target.x}, ${target.y})`, target)
      return result('ok', `移动到 (${target.layer}, ${target.x}, ${target.y})`)
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
      if (!target || !this.canPerceive(actor, target)) {
        this.pushEvent('blocked', actor, target?.id, '对方不在视线里', actor.pos)
        return result('blocked', '对方不在视线里')
      }
      const method = action.method ?? '徒手'
      const damage = method === '武器' ? 2 : 1
      target.vitals.hp = Math.max(0, target.vitals.hp - damage)
      target.attitudes[actor.id] = { stance: '敌意', text: `${actor.name}对我动过手。` }
      target.memory.push({
        versionId: `t-hit-${this.seq++}`,
        infoId: `hit-${actor.id}-${this.seq}`,
        content: `${actor.name}用${method}攻击了我。`,
        topics: ['攻击'],
        provenance: 'perceived',
        derivedFrom: [],
        at: this.round,
        source: actor.id,
      })
      this.touchRelation(actor, target.id, 'harm', `${method}攻击`)
      const note = `${method}攻击（${target.name} 生命 ${target.vitals.hp}/5）`
      this.pushEvent('attack', actor, target.id, note, actor.pos)
      if (target.vitals.hp === 0) {
        target.status = 'incapacitated'
        this.pushEvent('blocked', target, undefined, '倒下了，无法行动', target.pos)
      }
      return result('ok', note)
    }

    if (action.kind === 'ability') {
      const ability = action.ability
      if (!ability) return result('blocked', '没有指定能力')
      if (actor.ability.state === '封印') {
        this.pushEvent('blocked', actor, undefined, '能力被封印', actor.pos)
        return result('blocked', '能力被封印')
      }
      const chargeAbility = (): void => {
        actor.ability.charge = clamp(actor.ability.charge + 20, 0, 100)
        const next = actor.ability.charge >= 80 ? '暴走' : actor.ability.charge >= 40 ? '亢进' : '稳定'
        if (next === '暴走' && actor.ability.state !== '暴走') {
          this.pushEvent('ability', actor, undefined, `能力暴走（负荷 ${actor.ability.charge}）`, actor.pos)
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

    if (action.kind === 'use') {
      const target = action.targetEntity ? this.chars[action.targetEntity] : undefined
      if (!target || !this.canPerceive(actor, target)) {
        this.pushEvent('blocked', actor, target?.id, '够不到', actor.pos)
        return result('blocked', '够不到')
      }
      this.touchRelation(actor, target.id, action.polarity, action.behavior)
      let note = action.behavior
      if (action.polarity === 'harm') {
        target.vitals.hp = Math.max(0, target.vitals.hp - 1)
        note = `${action.behavior}（${target.name} 生命 ${target.vitals.hp}/5）`
        if (target.vitals.hp === 0) {
          target.status = 'incapacitated'
          this.pushEvent('blocked', target, undefined, '倒下了，无法行动', target.pos)
        }
      }
      this.pushEvent('use', actor, target.id, note, actor.pos)
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

  private stepToward(from: Coord, to: Coord): Coord | null {
    if (from.layer !== to.layer) {
      const cell = inBounds(this.snapshotWorld, from) ? cellAt(this.snapshotWorld, from) : undefined
      if (cell?.stair && cell.stair.state === 'open') {
        const next = { layer: cell.stair.to, x: from.x, y: from.y }
        return this.canWalk(next) ? next : null
      }
      return null
    }
    const options = this.neighbors(from)
    if (options.length === 0) return null
    return options.sort((a, b) => dist(a, to) - dist(b, to))[0] ?? null
  }
}

export interface EngineOptions {
  /** 每轮最多多少个角色使用传入的 mind；超出预算的角色回落 mock。 */
  budgetPerRound?: number
}

export function createEngine(world: World, mind?: Mind, summarizer?: RoundSummarizer, options?: EngineOptions): SimEngine {
  return new Engine(world, mind, summarizer, options)
}

export const SIM_CHARACTER_IDS = SEEDS.map(seed => seed.id)
