import type { World } from '../world/types'
import type { SimView } from './types'

export interface MetricPoint {
  round: number
  /** 人均行动：本轮行动数 / 活跃角色数 */
  activity: number
  /** 注意力加权的共享信息势，0..1 */
  potential: number
  /** 记忆主题熵均值，0..1 */
  topicEntropy: number
  /** 共享信息的版本熵均值，0..1 */
  versionEntropy: number
  /** 同时持有同一信息多个版本的 (角色, 信息) 计数 */
  conflicts: number
  /** 共享信息持有率均值，0..1 */
  penetration: number
  /** 最大派系占比均值，0..1 */
  consensus: number
  /** 空间信息强度总和 */
  fieldMass: number
  /** 空间信息在来源之间的归一化熵，0..1 */
  spatialEntropy: number
  /** 最高信息影响力，0..1 */
  influence: number
  /** 信息枢纽角色名 */
  hub: string | null
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

function entropyNormalized(counts: number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (total <= 0) return 0
  const distinct = counts.filter(count => count > 0).length
  if (distinct <= 1) return 0
  let entropy = 0
  for (const count of counts) {
    if (count <= 0) continue
    const p = count / total
    entropy -= p * Math.log(p)
  }
  return clamp01(entropy / Math.log(distinct))
}

/** 从当前快照计算一组世界演进度量。 */
export function computeMetrics(view: SimView, world: World): MetricPoint {
  const active = view.characters.filter(character => character.status === 'active')
  const activeIds = new Set(active.map(character => character.id))
  const activity = active.length === 0 ? 0 : clamp01(view.activity / active.length)

  // ---- 第一遍：每个角色对每条信息的最新说法 ----
  const beliefs = new Map<string, Map<string, string>>()
  const holderCounts = new Map<string, Map<string, number>>()
  let conflicts = 0
  for (const character of active) {
    const perId = new Map<string, Array<{ content: string; at: number }>>()
    for (const entry of character.memory) {
      const list = perId.get(entry.infoId) ?? []
      list.push({ content: entry.content, at: entry.at })
      perId.set(entry.infoId, list)
    }
    const belief = new Map<string, string>()
    for (const [infoId, entries] of perId) {
      if (new Set(entries.map(entry => entry.content)).size > 1) conflicts += 1
      const latest = entries.reduce((a, b) => (b.at >= a.at ? b : a))
      belief.set(infoId, latest.content)
      const holders = holderCounts.get(infoId) ?? new Map<string, number>()
      holders.set(latest.content, (holders.get(latest.content) ?? 0) + 1)
      holderCounts.set(infoId, holders)
    }
    beliefs.set(character.id, belief)
  }
  const shared = [...holderCounts.entries()]
    .map(([infoId, holders]) => ({
      infoId,
      holders: [...holders.values()].reduce((sum, count) => sum + count, 0),
      entries: holders,
    }))
    .filter(item => item.holders >= 2)
  const sharedIds = new Set(shared.map(item => item.infoId))

  // ---- 信息势：只在共享信息上算，按关注主题加权 ----
  let potentialSum = 0
  let potentialCount = 0
  for (const a of active) {
    const subscribed = Object.entries(a.attention)
      .filter(([, weight]) => weight > 0)
      .map(([topic]) => topic)
    const belief = beliefs.get(a.id) ?? new Map<string, string>()
    const weights = new Map<string, number>()
    for (const entry of a.memory) {
      if (!sharedIds.has(entry.infoId)) continue
      const weight = subscribed.length === 0 || entry.topics.some(topic => subscribed.includes(topic)) ? 1 : 0.3
      weights.set(entry.infoId, Math.max(weights.get(entry.infoId) ?? 0, weight))
    }
    void belief
    const ids = [...weights.keys()]
    const weightSum = [...weights.values()].reduce((sum, weight) => sum + weight, 0)
    if (ids.length === 0 || weightSum === 0) continue
    let perAgent = 0
    let weightTotal = 0
    for (const b of active) {
      if (b.id === a.id) continue
      const relation = a.relations[b.id]
      const interactions = relation ? relation.help + relation.harm + relation.contact : 0
      const W = 0.2 + 0.8 * Math.min(1, interactions / 5)
      let diff = 0
      const other = beliefs.get(b.id) ?? new Map<string, string>()
      for (const infoId of ids) {
        if (belief.get(infoId) !== other.get(infoId)) diff += weights.get(infoId) ?? 0
      }
      perAgent += W * (diff / weightSum)
      weightTotal += W
    }
    if (weightTotal === 0) continue
    potentialSum += clamp01(perAgent / weightTotal)
    potentialCount += 1
  }
  const potential = potentialCount === 0 ? 0 : clamp01(potentialSum / potentialCount)

  // ---- 主题熵 ----
  let topicSum = 0
  for (const character of active) {
    const counts = new Map<string, number>()
    for (const entry of character.memory) {
      const topics = entry.topics.length > 0 ? entry.topics : ['未分类']
      for (const topic of topics) counts.set(topic, (counts.get(topic) ?? 0) + 1 / topics.length)
    }
    topicSum += entropyNormalized([...counts.values()])
  }
  const topicEntropy = active.length === 0 ? 0 : topicSum / active.length

  // ---- 版本熵 / 穿透 / 共识 ----
  const versionEntropy = shared.length === 0
    ? 0
    : shared.reduce((sum, item) => sum + entropyNormalized([...item.entries.values()]), 0) / shared.length
  const penetration = shared.length === 0 || active.length === 0
    ? 0
    : shared.reduce((sum, item) => sum + Math.min(1, item.holders / active.length), 0) / shared.length
  const consensus = shared.length === 0
    ? 0
    : shared.reduce((sum, item) => sum + Math.max(...item.entries.values()) / item.holders, 0) / shared.length

  // ---- 空间信息 ----
  const fieldMass = world.info.reduce((sum, entry) => sum + entry.strength, 0) / 1000
  const spatialEntropy = world.info.length <= 1
    ? 0
    : entropyNormalized(world.info.map(entry => entry.strength))

  // ---- 信息流：谁的说法被谁记住 ----
  const inflow = new Map<string, number>()
  let sourced = 0
  for (const character of active) {
    for (const entry of character.memory) {
      if (!entry.source || !activeIds.has(entry.source)) continue
      inflow.set(entry.source, (inflow.get(entry.source) ?? 0) + 1)
      sourced += 1
    }
  }
  let influence = 0
  let hub: string | null = null
  if (sourced > 0) {
    for (const [id, count] of inflow) {
      const score = count / sourced
      if (score > influence) {
        influence = score
        hub = active.find(character => character.id === id)?.name ?? id
      }
    }
  }

  return {
    round: view.round,
    activity,
    potential,
    topicEntropy,
    versionEntropy,
    conflicts,
    penetration,
    consensus,
    fieldMass,
    spatialEntropy,
    influence,
    hub,
  }
}

const round2 = (value: number): string => value.toFixed(2)
const percent = (value: number): string => `${Math.round(value * 100)}%`

function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 4) return null
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n
  let cov = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    cov += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  if (varX === 0 || varY === 0) return null
  return cov / Math.sqrt(varX * varY)
}

/** 把度量序列翻译成几句可读结论。 */
export function concludeMetrics(points: MetricPoint[]): string[] {
  if (points.length === 0) return ['还没有观测数据：先运行一轮。']
  const latest = points[points.length - 1]
  const lines: string[] = []

  if (latest.potential < 0.15 && latest.activity < 0.25) {
    lines.push('热寂：信息势与行动率同时趋零，世界已经停下来。')
  } else if (latest.potential > 0.6 && latest.activity < 0.25) {
    lines.push('停滞：还有明显的信息落差，但没有人行动——检查成本、规则或提示词。')
  } else if (latest.potential > 0.4 && latest.activity > 0.5) {
    lines.push('演进中：信息差与行动同时在较高水平。')
  } else if (latest.potential > 0.6) {
    lines.push(`高落差：信息势 ${round2(latest.potential)}，但行动率只有 ${percent(latest.activity)}，势能泄放不充分。`)
  } else if (latest.potential < 0.2) {
    lines.push('趋同：共享信息上的说法已经基本一致。')
  } else {
    lines.push('运转中：信息势与行动都在中等水平。')
  }

  if (points.length >= 3) {
    const recent = points.slice(-3)
    const delta = recent[recent.length - 1].versionEntropy - recent[0].versionEntropy
    if (delta > 0.03) lines.push(`版本熵上升 ${round2(delta)}：同一信息正在分化成多个说法。`)
    if (delta < -0.03) lines.push(`版本熵下降 ${round2(-delta)}：说法正在收敛。`)
  }

  if (latest.conflicts > 0) {
    lines.push(`认知冲突：有 ${latest.conflicts} 处角色同时持有同一信息的不同版本。`)
  }
  if (latest.consensus > 0 && latest.consensus < 0.5) {
    lines.push(`共识度 ${percent(latest.consensus)}：没有哪个版本占多数，谣言已经分裂。`)
  }
  if (latest.hub && latest.influence > 0.25) {
    lines.push(`信息枢纽：${latest.hub}（影响力 ${percent(latest.influence)}）。`)
  }
  if (latest.fieldMass === 0) {
    lines.push('空间中已经没有留存信息：所有事件型信息都已过期。')
  }

  if (points.length >= 5) {
    const r = pearson(
      points.slice(0, -1).map(point => point.potential),
      points.slice(1).map(point => point.activity),
    )
    if (r !== null && r > 0.5) lines.push(`势领先于行动：V(t) 与活动(t+1) 相关 r=${round2(r)}。`)
    else if (r !== null && r < -0.5) lines.push(`行动在消耗势能：V(t) 与活动(t+1) 负相关 r=${round2(r)}。`)
  }

  return lines
}
