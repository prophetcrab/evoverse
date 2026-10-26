import type { AbilityScope, Attitude, Goal, Mind, SimAction, Stance, StatePatch } from './types'
import { ACTION_TOOLS } from './tools'
import type { CallPhase } from './usage'

export type ChatMessage = { role: 'system' | 'user'; content: string }
/** 宿主注入的补全函数：返回模型文本。phase 用于用量统计。 */
export type Complete = (messages: ChatMessage[], phase?: CallPhase) => Promise<string>

const SYSTEM = `你是一个封闭世界里的角色，只能依据自己的记忆和感知行动。
规则：
- 你可能记错、可能误解别人；不要扮演全知者。
- 你可以隐瞒、撒谎、试探，但每条想法都要符合你的处境。
- 只输出要求的 JSON，不要解释。`

const KINDS = new Set(['speak', 'tell', 'move', 'attack', 'ability', 'use', 'idle'])
const POLARITIES = new Set(['help', 'harm', 'neutral'])
const STATUSES = new Set(['active', 'blocked', 'done'])
const STANCES = new Set(['亲近', '中立', '戒备', '敌意', '畏惧'])
const SCOPES = new Set(['self', 'other', 'world', 'info'])

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('no json object')
  return JSON.parse(raw.slice(start, end + 1))
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

function normalizeAction(actor: string, raw: unknown): SimAction | null {
  if (raw === null || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const kind = typeof data.kind === 'string' && KINDS.has(data.kind) ? data.kind as SimAction['kind'] : null
  if (!kind) return null
  const polarity = typeof data.polarity === 'string' && POLARITIES.has(data.polarity)
    ? data.polarity as SimAction['polarity']
    : 'neutral'
  const behavior = typeof data.behavior === 'string' && data.behavior.length > 0 ? data.behavior : '行动'

  if (kind === 'move') {
    const cell = data.targetCell
    if (cell === null || typeof cell !== 'object') return null
    const c = cell as Record<string, unknown>
    if (typeof c.layer !== 'number' || typeof c.x !== 'number' || typeof c.y !== 'number') return null
    return { actor, kind, behavior, polarity, targetCell: { layer: c.layer, x: c.x, y: c.y } }
  }
  if (kind === 'tell' || kind === 'use') {
    if (typeof data.targetEntity !== 'string') return null
    return {
      actor,
      kind,
      behavior,
      polarity,
      targetEntity: data.targetEntity,
      text: typeof data.text === 'string' ? data.text : undefined,
      topics: strings(data.topics),
      mode: data.mode === '询问' || data.mode === '请求' || data.mode === '威胁' ? data.mode : '告知',
      sourceVersion: typeof data.sourceVersion === 'string' ? data.sourceVersion : undefined,
    }
  }
  if (kind === 'attack') {
    if (typeof data.targetEntity !== 'string') return null
    const method = data.method === '武器' || data.method === '推搡' ? data.method : '徒手'
    return { actor, kind, behavior, polarity: polarity === 'help' ? 'harm' : polarity, targetEntity: data.targetEntity, method }
  }
  if (kind === 'ability') {
    const raw = data.ability !== null && typeof data.ability === 'object'
      ? data.ability as Record<string, unknown>
      : data
    const scope: AbilityScope | null = typeof raw.scope === 'string' && SCOPES.has(raw.scope)
      ? raw.scope as AbilityScope
      : null
    const name = typeof raw.name === 'string' ? raw.name : null
    if (!scope || !name) return null
    const targetEntity = typeof data.targetEntity === 'string'
      ? data.targetEntity
      : typeof raw.targetEntity === 'string' ? raw.targetEntity : undefined
    if (scope === 'other' && !targetEntity) return null
    return {
      actor,
      kind,
      behavior,
      polarity,
      targetEntity,
      ability: { scope, name, text: typeof raw.text === 'string' ? raw.text : undefined, topics: strings(raw.topics) },
    }
  }
  if (kind === 'speak') {
    if (typeof data.text !== 'string' || data.text.length === 0) return null
    return { actor, kind, behavior, polarity, text: data.text, topics: strings(data.topics) }
  }
  return { actor, kind: 'idle', behavior, polarity }
}

function normalizePatch(raw: unknown): StatePatch | null {
  if (raw === null || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const patch: StatePatch = { rationale: typeof data.rationale === 'string' ? data.rationale : '' }

  if (Array.isArray(data.attitudes)) {
    const attitudes = data.attitudes
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .filter(item => typeof item.target === 'string')
      .map(item => ({
        target: item.target as string,
        stance: typeof item.stance === 'string' && STANCES.has(item.stance) ? item.stance as Stance : undefined,
        text: typeof item.text === 'string' && item.text.trim().length > 0 ? item.text.trim() : undefined,
      }))
      .filter(item => item.stance !== undefined || item.text !== undefined)
    if (attitudes.length > 0) patch.attitudes = attitudes
  }

  if (Array.isArray(data.attention)) {
    const attention = data.attention
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .filter(item => typeof item.topic === 'string' && typeof item.weight === 'number')
      .map(item => ({ topic: item.topic as string, weight: clamp(Math.round(item.weight as number), 0, 1000) }))
    if (attention.length > 0) patch.attention = attention
  }

  if (Array.isArray(data.goals)) {
    const goals = data.goals
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .filter(item => typeof item.id === 'string' && typeof item.status === 'string' && STATUSES.has(item.status))
      .map(item => ({ id: item.id as string, status: item.status as Goal['status'] }))
    if (goals.length > 0) patch.goals = goals
  }

  if (data.presentation !== null && typeof data.presentation === 'object') {
    const presentation = data.presentation as Record<string, unknown>
    if (typeof presentation.description === 'string') {
      patch.presentation = {
        description: presentation.description,
        overrides: presentation.overrides === true,
      }
    }
  }

  if (data.needs !== null && typeof data.needs === 'object') {
    const needs = data.needs as Record<string, unknown>
    const parsed: Partial<Record<'safety' | 'status' | 'curiosity', number>> = {}
    for (const key of ['safety', 'status', 'curiosity'] as const) {
      const value = needs[key]
      if (typeof value === 'number') parsed[key] = clamp(Math.round(value), -200, 200)
    }
    if (Object.keys(parsed).length > 0) patch.needs = parsed
  }

  const meaningful = patch.attitudes || patch.attention || patch.goals || patch.presentation || patch.needs
  return meaningful || patch.rationale ? patch : null
}

const list = (items: string[]): string => items.map((item, i) => `${i + 1}. ${item}`).join('\n')

function stateBlock(self: {
  name: string
  needs: Record<string, number>
  goals: Array<{ text: string; status: string; weight: number }>
  attention: Record<string, number>
  presentation: { description: string }
}): string {
  const needs = Object.entries(self.needs).map(([key, value]) => `${key}=${Math.round(value)}`).join('，')
  const goals = self.goals.map(goal => `${goal.text}（${goal.status}，权重 ${goal.weight}）`).join('；') || '无'
  const attention = Object.entries(self.attention)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, weight]) => `${topic}:${weight}`)
    .join('，')
  return `【状态】\n需求：${needs}\n目标：${goals}\n关注：${attention || '无'}\n表现：${self.presentation.description}`
}

const attitudeOf = (attitudes: Record<string, Attitude>, id: string): Attitude =>
  attitudes[id] ?? { trust: 0, fear: 0 }

export function createLlmMind(complete: Complete): Mind {
  return {
    async feel(input) {
      const candidates = input.candidates
      if (candidates.length === 0) return { remember: [] }
      const prompt = [
        stateBlock(input.self),
        `【所在位置】${input.location.name}：${input.location.note}`,
        `【你所在位置的信息】`,
        list(candidates.map(candidate => `[${candidate.versionId}] ${candidate.content}（强度 ${candidate.strength}，主题 ${candidate.topics.join('/') || '无'}）`)),
        `请从中挑出你真正会留意并记住的条目（可以一条都不选）。`,
        `输出 JSON：{"remember":["versionId", ...], "attention":[{"topic":"...","weight":0-1000}]}`,
      ].join('\n')
      try {
        const text = await complete([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 'feel')
        const data = extractJson(text) as { remember?: unknown; attention?: unknown }
        const remember = strings(data.remember).filter(id => candidates.some(c => c.versionId === id))
        const attention = Array.isArray(data.attention)
          ? (data.attention as Array<Record<string, unknown>>)
            .filter(item => typeof item.topic === 'string' && typeof item.weight === 'number')
            .map(item => ({ topic: item.topic as string, weight: clamp(Math.round(item.weight as number), 0, 1000) }))
          : undefined
        return { remember, attention }
      } catch {
        return { remember: [] }
      }
    },

    async think(input) {
      const memory = input.self.memory
      const prompt = [
        stateBlock(input.self),
        `【所在位置】${input.location.name}：${input.location.note}`,
        `【你记住的事】`,
        list(memory.map(entry => `[${entry.versionId}] ${entry.content}`)),
        `【上一轮发生在你身边的事】`,
        list(input.digest.length > 0 ? input.digest : ['没什么特别的。']),
        `【你能看见的人】`,
        list(input.visible.map(entity => {
          const attitude = attitudeOf(input.self.attitudes, entity.id)
          return `${entity.name}（你对他的态度：${attitude.stance}，${attitude.text}）：${entity.presentation}`
        })),
        `请先形成 0–4 条自己的想法（可以是对已知信息的转述、推断、谎言或计划），再决定这一轮做不做一件事。`,
        `可选动作（一轮只能选一个）：`,
        ACTION_TOOLS.map(tool => `- ${tool.name}：${tool.description}`).join('\n'),
        `同时给出你对别人的态度变化：立场从「亲近 / 中立 / 戒备 / 敌意 / 畏惧」里选，再写一句自然语言描述。`,
        `输出 JSON：
{"thoughts":[{"content":"...","topics":["..."],"derivedFrom":["versionId"]}],
 "intention":{"kind":"move|speak|tell|attack|ability|idle","targetEntity":"可选","targetCell":{"layer":0,"x":0,"y":0},"text":"可选","topics":["..."],"mode":"告知|询问|请求|威胁","sourceVersion":"转述时你记忆里的 versionId","method":"徒手|武器|推搡","ability":{"scope":"self|other|world|info","name":"...","text":"...","topics":["..."]},"behavior":"一句行为名","polarity":"help|harm|neutral"} | null,
 "patch":{"attitudes":[{"target":"...","stance":"亲近|中立|戒备|敌意|畏惧","text":"一句话描述"}],"attention":[{"topic":"...","weight":0-1000}],"goals":[{"id":"...","status":"active|blocked|done"}],"needs":{"safety":-40,"status":0,"curiosity":-60},"presentation":{"description":"...","overrides":false},"rationale":"..."} | null}`,
      ].join('\n')

      try {
        const text = await complete([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 'think')
        const data = extractJson(text) as {
          thoughts?: unknown
          intention?: unknown
          patch?: unknown
        }
        const thoughts = Array.isArray(data.thoughts)
          ? (data.thoughts as Array<Record<string, unknown>>)
            .filter(item => typeof item.content === 'string')
            .slice(0, 4)
            .map(item => ({
              content: item.content as string,
              topics: strings(item.topics),
              derivedFrom: strings(item.derivedFrom),
            }))
          : []
        return {
          thoughts,
          intention: normalizeAction(input.self.id, data.intention ?? null),
          patch: normalizePatch(data.patch ?? null),
        }
      } catch {
        return { thoughts: [], intention: null, patch: null }
      }
    },

    async act({ self, intention }) {
      if (intention.kind === 'idle') return { action: null }
      const prompt = [
        stateBlock(self),
        `【你刚决定的意图】${JSON.stringify(intention)}`,
        `【可用工具】`,
        ACTION_TOOLS.map(tool => `- ${tool.name}：${tool.description}`).join('\n'),
        `把意图落成一次工具调用。可以微调参数，但不要改变目标；如果这个意图无法执行，返回 {"action":null}。`,
        `输出 JSON：{"action":{"kind":"move|speak|tell|attack|ability|idle","targetEntity":"可选","targetCell":{"layer":0,"x":0,"y":0},"text":"可选","topics":["..."],"mode":"告知|询问|请求|威胁","sourceVersion":"可选","method":"徒手|武器|推搡","ability":{"scope":"self|other|world|info","name":"...","text":"...","topics":["..."]},"behavior":"...","polarity":"help|harm|neutral"} | null}`,
      ].join('\n')
      try {
        const text = await complete([{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 'act')
        const data = extractJson(text) as { action?: unknown }
        if (data.action === null) return { action: null }
        const action = normalizeAction(self.id, data.action ?? intention)
        return { action: action ?? intention }
      } catch {
        return { action: intention }
      }
    },
  }
}
