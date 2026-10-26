/**
 * 冒烟测试：直接驱动引擎，验证攻击、能力与 LLM 意图解析。
 * 运行：pnpm exec esbuild scripts/smoke.ts --bundle --format=esm --platform=node --outfile=/tmp/evoverse-smoke.mjs && node /tmp/evoverse-smoke.mjs
 */
import { createManorWorld } from '../src/world/manor'
import { createEngine } from '../src/sim/engine'
import { createLlmMind } from '../src/sim/llm-mind'
import type { Mind, SimCharacter } from '../src/sim/types'

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok: ${message}`)
}

// 1. 攻击：把访客挪到护卫旁边，让护卫用武器攻击
{
  const world = createManorWorld()
  const guard = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const guest = world.characters.find(character => character.id === 'kirisame-transfer')
  if (!guard || !guest) throw new Error('missing characters')
  guest.pos = { layer: guard.pos.layer, x: guard.pos.x + 1, y: guard.pos.y }

  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [{ content: '动手。', topics: ['攻击'] }],
          intention: {
            actor: self.id,
            kind: 'attack',
            targetEntity: 'kirisame-transfer',
            method: '武器',
            behavior: '攻击访客',
            polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }

  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-transfer')
  assert(after?.vitals.hp === 3, `武器攻击造成 2 点伤害（实际 ${after?.vitals.hp}）`)
  assert(after?.attitudes['kirisame-ryunosuke']?.stance === '敌意', '被打者对攻击者转为敌意')
  const attacked = engine.view().records[0].events.some(event => event.kind === 'attack')
  assert(attacked, '记录中出现 attack 事件')
}

// 2. 能力：在自己的格子上留下持久痕迹
{
  const world = createManorWorld()
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-moe'
        ? {
          thoughts: [{ content: '留个记号。', topics: ['痕迹'] }],
          intention: {
            actor: self.id,
            kind: 'ability',
            ability: { scope: 'world', name: '留痕', text: '井边墙上的记号' },
            behavior: '留下记号',
            polarity: 'neutral',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const marked = engine.world().info.some(entry => entry.label === '井边墙上的记号')
  assert(marked, '世界中出现持久痕迹信息')
}

// 3. LLM 意图解析：攻击与能力字段
{
  const self = {
    id: 'test', name: '测试', memory: [],
    needs: { safety: 300, status: 300, curiosity: 300 },
    goals: [], attention: {}, presentation: { description: '站着。', overrides: false, at: 0 },
  } as unknown as SimCharacter
  const attackMind = createLlmMind(async () => JSON.stringify({
    thoughts: [],
    intention: { kind: 'attack', targetEntity: 'kirisame-transfer', method: '武器', behavior: '攻击', polarity: 'harm' },
    patch: null,
  }))
  const attack = await attackMind.think({
    self,
    digest: [],
    visible: [],
    round: 1,
  })
  assert(attack.intention?.kind === 'attack' && attack.intention.method === '武器', 'LLM 攻击意图解析')

  const abilityMind = createLlmMind(async () => JSON.stringify({
    thoughts: [],
    intention: { kind: 'ability', ability: { scope: 'self', name: '治疗' }, behavior: '治疗自己', polarity: 'help' },
    patch: null,
  }))
  const ability = await abilityMind.think({ self, digest: [], visible: [], round: 1 })
  assert(ability.intention?.ability?.scope === 'self', 'LLM 能力意图解析')
}

console.log('smoke: all checks passed')
