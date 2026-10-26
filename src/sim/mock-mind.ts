import type { Coord, World } from '../world/types'
import type { Mind, StatePatch, SimAction, ThinkInput, ThinkOutput } from './types'

export interface MindContext {
  world: () => World
  canWalk: (c: Coord) => boolean
  neighbors: (from: Coord) => Coord[]
  stepToward: (from: Coord, to: Coord) => Coord | null
}

function rngFor(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hash = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 确定性 mock 思考层：不调用模型，用需求与态度驱动，用来验证整条流水线。
 * 它不是占位符——每个机制（感受、思考、行动、态度更新）都会真实发生。
 */
export function createMockMind(ctx: MindContext): Mind {
  return {
    async feel({ candidates }) {
      return { remember: candidates.map(candidate => candidate.versionId) }
    },

    async think({ self, visible, round }: ThinkInput): Promise<ThinkOutput> {
      const rng = rngFor(hash(self.id) ^ (round * 7919))
      const nearby = visible[0]
      const attitude = nearby ? self.attitudes[nearby.id] ?? { stance: '中立' as const, text: '' } : null
      const thoughts: ThinkOutput['thoughts'] = []
      let intention: SimAction | null = null
      let patch: StatePatch | null = null

      const rememberSomething = (): { content: string; topics: string[]; versionId: string | null } => {
        const candidates = self.memory.filter(entry => entry.provenance !== 'thought')
        const pick = candidates[Math.floor(rng() * Math.max(1, candidates.length))]
        return pick
          ? { content: pick.content, topics: pick.topics, versionId: pick.versionId }
          : { content: '这里有点不对劲。', topics: ['观察'], versionId: null }
      }

      if (nearby && attitude && attitude.stance === '敌意') {
        const adjacent = nearby.pos.layer === self.pos.layer
          && Math.abs(nearby.pos.x - self.pos.x) + Math.abs(nearby.pos.y - self.pos.y) === 1
        thoughts.push({ content: `我得让${nearby.name}退开。`, topics: ['对峙', nearby.name] })
        intention = adjacent
          ? { actor: self.id, kind: 'attack', targetEntity: nearby.id, method: '徒手', behavior: `攻击${nearby.name}`, polarity: 'harm' }
          : { actor: self.id, kind: 'speak', text: `你最好离那块地方远一点，${nearby.name}。`, topics: ['对峙'], behavior: `质问${nearby.name}`, polarity: 'harm' }
        patch = {
          attitudes: [{ target: nearby.id, stance: '敌意', text: '他逼我动手了。' }],
          needs: { status: -40 },
          rationale: `我对${nearby.name}不放心，先把话挑明。`,
        }
      } else if (nearby && attitude && attitude.stance === '亲近') {
        const said = rememberSomething()
        thoughts.push({ content: `也许该提醒${nearby.name}一声。`, topics: said.topics })
        intention = {
          actor: self.id,
          kind: 'tell',
          targetEntity: nearby.id,
          text: said.content,
          topics: said.topics,
          mode: '告知',
          ...(said.versionId ? { sourceVersion: said.versionId } : {}),
          behavior: `提醒${nearby.name}`,
          polarity: 'help',
        }
        patch = {
          attitudes: [{ target: nearby.id, stance: '亲近', text: '和他说话让我踏实。' }],
          needs: { curiosity: -80, status: -20 },
          rationale: `${nearby.name}是自己人，多说一句无妨。`,
        }
      } else if (nearby && (attitude?.stance === '畏惧' || self.needs.safety > 620)) {
        const distanceFrom = (cell: Coord): number =>
          Math.abs(cell.x - nearby.pos.x) + Math.abs(cell.y - nearby.pos.y) + Math.abs(cell.layer - nearby.pos.layer) * 3
        const target = ctx.neighbors(self.pos).sort((a, b) => distanceFrom(b) - distanceFrom(a))[0]
        if (target) {
          thoughts.push({ content: '这里让我不安，先退一步。', topics: ['安全'] })
          intention = { actor: self.id, kind: 'move', targetCell: target, behavior: '退避', polarity: 'neutral' }
          patch = { needs: { safety: -120 }, rationale: '' }
        }
      } else if (self.vitals.hp <= 3) {
        thoughts.push({ content: '得先把伤处理一下。', topics: ['治疗'] })
        intention = {
          actor: self.id,
          kind: 'ability',
          ability: { scope: 'self', name: '治疗' },
          behavior: '治疗自己',
          polarity: 'help',
        }
        patch = { needs: { safety: -60 }, rationale: '' }
      } else if (self.needs.status > 600) {
        thoughts.push({ content: '场面有点乱，得有人站出来。', topics: ['秩序'] })
        intention = {
          actor: self.id,
          kind: 'speak',
          text: '都别慌，按我说的来。',
          topics: ['秩序'],
          behavior: '维持场面',
          polarity: 'neutral',
        }
        patch = { needs: { status: -100 }, rationale: '' }
      } else if (self.needs.curiosity > 520) {
        const sources = ctx.world().info.map(entry => entry.origin)
        const nearest = sources
          .filter(source => source.layer === self.pos.layer)
          .sort((a, b) => Math.abs(a.x - self.pos.x) + Math.abs(a.y - self.pos.y) - (Math.abs(b.x - self.pos.x) + Math.abs(b.y - self.pos.y)))[0]
        if (nearest) {
          const next = ctx.stepToward(self.pos, nearest)
          if (next) {
            thoughts.push({ content: '那边有动静，过去看看。', topics: ['好奇'] })
            intention = { actor: self.id, kind: 'move', targetCell: next, behavior: '查看动静', polarity: 'neutral' }
            patch = { needs: { curiosity: -80 }, rationale: '' }
          }
        }
      }

      if (!intention) {
        const goals = [...self.goals]
          .filter(item => item.status === 'active' && item.target)
          .sort((a, b) => b.weight - a.weight)
        for (const goal of goals) {
          const target = goal.target
          if (!target) continue
          const distance = Math.abs(target.x - self.pos.x) + Math.abs(target.y - self.pos.y) + Math.abs(target.layer - self.pos.layer) * 3
          if (distance === 0) {
            patch = { goals: [{ id: goal.id, status: 'done' }], rationale: `${goal.text}，已经到位。` }
            thoughts.push({ content: `${goal.text}——先到这里。`, topics: ['目标'] })
            break
          }
          const next = ctx.stepToward(self.pos, target)
          if (next) {
            thoughts.push({ content: `该去${goal.text}了。`, topics: ['目标'] })
            intention = { actor: self.id, kind: 'move', targetCell: next, behavior: goal.text, polarity: 'neutral' }
            patch = { needs: { curiosity: -30 }, rationale: '' }
            break
          }
        }
      }

      if (!intention && Math.max(self.needs.safety, self.needs.status, self.needs.curiosity) > 600) {
        const options = ctx.neighbors(self.pos)
        const target = options[Math.floor(rng() * Math.max(1, options.length))]
        if (target) {
          thoughts.push({ content: '待着也是待着，走两步。', topics: ['走动'] })
          intention = { actor: self.id, kind: 'move', targetCell: target, behavior: '随便走走', polarity: 'neutral' }
          patch = { needs: { curiosity: -40 }, rationale: '' }
        }
      }

      return { thoughts, intention, patch }
    },

    async act({ intention }) {
      return { action: intention }
    },
  }
}
