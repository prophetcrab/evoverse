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
  world.items = [
    ...(world.items ?? []),
    {
      id: 'test-blade', name: '测试短刀', kind: 'weapon', description: '测试用',
      holder: guard.id, damage: 2, range: 1,
    },
  ]

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
    location: { name: '测试', note: '' },
    moves: [],
    items: [],
    fixtures: [],
    round: 1,
  })
  assert(attack.intention?.kind === 'attack' && attack.intention.method === '武器', 'LLM 攻击意图解析')

  const abilityMind = createLlmMind(async () => JSON.stringify({
    thoughts: [],
    intention: { kind: 'ability', ability: { scope: 'self', name: '治疗' }, behavior: '治疗自己', polarity: 'help' },
    patch: null,
  }))
  const ability = await abilityMind.think({ self, digest: [], visible: [], location: { name: '测试', note: '' }, moves: [], items: [], fixtures: [], round: 1 })
  assert(ability.intention?.ability?.scope === 'self', 'LLM 能力意图解析')

  const moveMind = createLlmMind(async () => JSON.stringify({
    thoughts: [],
    intention: {
      kind: 'tell', targetEntity: 'kirisame-ren', moveTo: { layer: 1, x: 39, y: 52 },
      text: '走过去说', behavior: '走近传话', polarity: 'neutral',
    },
    patch: null,
  }))
  const moved = await moveMind.think({ self, digest: [], visible: [], location: { name: '测试', note: '' }, moves: [], items: [], fixtures: [], round: 1 })
  assert(moved.intention?.moveTo?.y === 52, 'LLM 解析移动+行为 moveTo')

  const abilitySpecMind = createLlmMind(async () => JSON.stringify({
    thoughts: [],
    intention: {
      kind: 'ability', ability: { name: '发火' }, targetEntity: 'kirisame-ren',
      behavior: '对会长发火', polarity: 'harm',
    },
    patch: null,
  }))
  const abilitySpec = await abilitySpecMind.think({ self, digest: [], visible: [], location: { name: '测试', note: '' }, moves: [], items: [], fixtures: [], round: 1 })
  assert(abilitySpec.intention?.ability?.name === '发火' && abilitySpec.intention.targetEntity === 'kirisame-ren', 'LLM 解析角色能力 tool call')
}

// 4. 校门越界死亡 + 尸体随机刷新 + 无门
{
  const world = createManorWorld()
  assert(world.cells.every(cell => cell.terrain !== 'door'), '地图中没有门格')
  const victim = world.characters.find(character => character.id === 'kirisame-ren')
  if (!victim) throw new Error('missing victim')
  victim.pos = { layer: 1, x: 39, y: 52 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ren'
        ? {
          thoughts: [],
          intention: {
            actor: self.id,
            kind: 'move',
            targetCell: { layer: 1, x: 39, y: 53 },
            behavior: '走出校门',
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
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.status === 'dead' && after.vitals.hp === 0, '走出校门即死亡')
  const bounds = world.safeBounds
  assert(
    bounds !== undefined && after !== undefined
      && after.pos.x >= bounds.x0 && after.pos.x <= bounds.x1
      && after.pos.y >= bounds.y0 && after.pos.y <= bounds.y1,
    '尸体被刷回安全区域内',
  )
  assert(engine.world().info.some(entry => entry.label.includes('尸体')), '尸体作为世界信息出现')
}

// 5. 三轮内移动：目标 3 格可到，4 格被拒
{
  const world = createManorWorld()
  const walker = world.characters.find(character => character.id === 'kirisame-hayato')
  if (!walker) throw new Error('missing walker')
  walker.pos = { layer: 1, x: 39, y: 49 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-hayato'
        ? {
          thoughts: [],
          intention: {
            actor: self.id,
            kind: 'move',
            targetCell: { layer: 1, x: 39, y: 52 },
            behavior: '向前走三格',
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
  const after = engine.view().characters.find(character => character.id === 'kirisame-hayato')
  assert(after?.pos.y === 52, '三格移动成功')
}
{
  const world = createManorWorld()
  const walker = world.characters.find(character => character.id === 'kirisame-hayato')
  if (!walker) throw new Error('missing walker')
  walker.pos = { layer: 1, x: 39, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-hayato'
        ? {
          thoughts: [],
          intention: {
            actor: self.id,
            kind: 'move',
            targetCell: { layer: 1, x: 39, y: 42 },
            behavior: '往长走廊走',
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
  const after = engine.view().characters.find(character => character.id === 'kirisame-hayato')
  assert(after?.pos.y === 44, '超过 6 格时向目标走 6 格')
}

// 5.5 目标落在墙里：不直接失败，向最近的可达格移动
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-genzo')
  if (!actor) throw new Error('missing actor')
  actor.pos = { layer: 1, x: 61, y: 14 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-genzo'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'move', targetCell: { layer: 0, x: 63, y: 14 },
            behavior: '朝地下室走', polarity: 'neutral',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-genzo')
  assert(after?.pos.layer === 1 && (after.pos.x !== 61 || after.pos.y !== 14), '目标在墙里时向最近可达格移动')
  for (let round = 2; round <= 8; round += 1) await engine.step()
  const later = engine.view().characters.find(character => character.id === 'kirisame-genzo')
  assert(later?.pos.layer === 0, '墙目标经楼梯寻路到达目标层')
}

// 6. 状态 patch 归一化：名字 -> 实体 id，目标文本 -> goal id，自指态度丢弃
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  if (!actor) throw new Error('missing actor')
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      if (self.id !== 'kirisame-ryunosuke') return { thoughts: [], intention: null, patch: null }
      return {
        thoughts: [],
        intention: null,
        patch: {
          attitudes: [
            { target: '神代莲', stance: '敌意', text: '测试：名字应解析到实体 id。' },
            { target: '灰谷', stance: '畏惧', text: '测试：自指态度应被丢弃。' },
          ],
          goals: [{ id: '打开阁楼的档案箱', status: 'done' }],
          rationale: '测试状态归一化',
        },
      }
    },
    async act() { return { action: null } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ryunosuke')
  if (!after) throw new Error('missing actor after step')
  assert(after.attitudes['kirisame-ren']?.stance === '敌意', '态度目标名字解析到实体 id')
  assert(!after.attitudes['灰谷'] && !after.attitudes['灰谷龙之介'], '自指态度被丢弃')
  assert(after.goals.find(goal => goal.id === 'open-box')?.status === 'done', '目标文本解析到 goal id')
}

// 7. 行动目标归一化：tell 的 targetEntity 用姓名也能解析
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: {
            actor: self.id,
            kind: 'tell',
            targetEntity: '神代 莲',
            text: '测试传话',
            behavior: '传话',
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
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.memory.some(entry => entry.content === '测试传话') === true, '行动目标姓名解析到实体 id')
}

// 8. 物品：拿取 / 放下 / 给予
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 3, x: 60, y: 20 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: { actor: self.id, kind: 'take', itemId: 'item-crowbar', behavior: '拿撬棍', polarity: 'neutral' },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ryunosuke')
  assert(after?.inventory.includes('item-crowbar') === true, '拿取地面物品')
  assert(engine.world().items?.find(item => item.id === 'item-crowbar')?.holder === 'kirisame-ryunosuke', '物品持有人同步')
}
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const crowbar = world.items?.find(item => item.id === 'item-crowbar')
  if (!crowbar) throw new Error('missing crowbar')
  crowbar.holder = actor.id
  crowbar.at = undefined
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: { actor: self.id, kind: 'give', itemId: 'item-crowbar', targetEntity: '神代莲', behavior: '交撬棍', polarity: 'help' },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const receiver = engine.view().characters.find(character => character.id === 'kirisame-ren')
  const giver = engine.view().characters.find(character => character.id === 'kirisame-ryunosuke')
  assert(receiver?.inventory.includes('item-crowbar') === true, '给予物品到对方背包')
  assert(giver?.inventory.includes('item-crowbar') === false, '给予后从自己背包移除')
}
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  if (!actor) throw new Error('missing actor')
  actor.pos = { layer: 1, x: 39, y: 50 }
  const crowbar = world.items?.find(item => item.id === 'item-crowbar')
  if (!crowbar) throw new Error('missing crowbar')
  crowbar.holder = actor.id
  crowbar.at = undefined
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: { actor: self.id, kind: 'drop', itemId: 'item-crowbar', behavior: '放下撬棍', polarity: 'neutral' },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const item = engine.world().items?.find(entry => entry.id === 'item-crowbar')
  assert(item?.at?.x === 39 && item.at.y === 50 && item.holder === undefined, '放下物品到当前格')
}

// 9. 设施：钥匙解锁、开柜取物
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-todo')
  if (!actor) throw new Error('missing doctor')
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-todo'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'interact', fixtureId: 'fx-medicine', verb: 'unlock',
            behavior: '解锁药柜', polarity: 'neutral',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const fixture = engine.world().fixtures?.find(entry => entry.id === 'fx-medicine')
  assert(fixture?.state === 'closed', '钥匙解锁设施')
}
{
  const world = createManorWorld()
  const doctor = world.characters.find(character => character.id === 'kirisame-todo')
  if (!doctor) throw new Error('missing doctor')
  const cabinet = world.fixtures?.find(entry => entry.id === 'fx-medicine')
  if (!cabinet) throw new Error('missing cabinet')
  cabinet.state = 'open'
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-todo'
        ? {
          thoughts: [],
          intention: { actor: self.id, kind: 'take', itemId: 'item-archive-key', behavior: '取档案钥匙', polarity: 'neutral' },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-todo')
  assert(after?.inventory.includes('item-archive-key') === true, '从打开的容器取物')
}

// 10. 武器射程与护具减伤
{
  const world = createManorWorld()
  const shooter = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!shooter || !target) throw new Error('missing characters')
  shooter.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 42, y: 50 }
  const gun = world.items?.find(item => item.id === 'item-signal-gun')
  if (!gun) throw new Error('missing gun')
  gun.holder = shooter.id
  gun.container = undefined
  gun.at = undefined
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'attack', targetEntity: '神代莲', method: '武器', itemId: 'item-signal-gun',
            behavior: '开枪', polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.vitals.hp === 3, '远距离武器命中')
}
{
  const world = createManorWorld()
  const shooter = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!shooter || !target) throw new Error('missing characters')
  shooter.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const gun = world.items?.find(item => item.id === 'item-signal-gun')
  const shield = world.items?.find(item => item.id === 'item-riot-shield')
  if (!gun || !shield) throw new Error('missing equipment')
  gun.holder = shooter.id
  gun.container = undefined
  gun.at = undefined
  shield.holder = target.id
  shield.at = undefined
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'attack', targetEntity: '神代莲', method: '武器', itemId: 'item-signal-gun',
            behavior: '开枪', polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.vitals.hp === 4, '护具减伤')
}
{
  const world = createManorWorld()
  const shooter = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!shooter || !target) throw new Error('missing characters')
  shooter.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 41, y: 50 }
  const axe = world.items?.find(item => item.id === 'item-fire-axe')
  if (!axe) throw new Error('missing axe')
  axe.holder = shooter.id
  axe.at = undefined
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'attack', targetEntity: '神代莲', method: '武器', itemId: 'item-fire-axe',
            behavior: '挥斧', polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.vitals.hp === 5, '近战武器够不到远处目标')
}

// 11. 移动碰撞：不能穿过中间的人
{
  const world = createManorWorld()
  const mover = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const blocker = world.characters.find(character => character.id === 'kirisame-ren')
  if (!mover || !blocker) throw new Error('missing characters')
  mover.pos = { layer: 1, x: 39, y: 49 }
  blocker.pos = { layer: 1, x: 39, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'move', targetCell: { layer: 1, x: 39, y: 51 },
            behavior: '向前走', polarity: 'neutral',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ryunosuke')
  assert(after?.pos.y === 51, '绕开中间的人继续前进')
}

// 12. 能力暴走反噬
{
  const world = createManorWorld()
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-hino'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'ability', ability: { scope: 'self', name: '镇定' },
            behavior: '压住能力', polarity: 'neutral',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  const actor = engine.view().characters.find(character => character.id === 'kirisame-hino')
  if (!actor) throw new Error('missing actor')
  actor.ability.charge = 85
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-hino')
  assert(after?.vitals.hp === 4, '能力暴走反噬 1 点生命')
  assert(after?.vitals.conditions.includes('能力暴走') === true, '记录能力暴走状态')
}

// 13. 协作：assist 让同伙本轮攻击 +1
{
  const world = createManorWorld()
  const helper = world.characters.find(character => character.id === 'kirisame-saya')
  const attacker = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const victim = world.characters.find(character => character.id === 'kirisame-transfer')
  if (!helper || !attacker || !victim) throw new Error('missing characters')
  helper.pos = { layer: 1, x: 39, y: 50 }
  attacker.pos = { layer: 1, x: 40, y: 50 }
  victim.pos = { layer: 1, x: 41, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      if (self.id === 'kirisame-saya') {
        return {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'assist', targetEntity: 'kirisame-ryunosuke',
            behavior: '协助灰谷', polarity: 'help',
          },
          patch: null,
        }
      }
      if (self.id === 'kirisame-ryunosuke') {
        return {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'attack', targetEntity: 'kirisame-transfer', method: '徒手',
            behavior: '攻击转校生', polarity: 'harm',
          },
          patch: null,
        }
      }
      return { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-transfer')
  assert(after?.vitals.hp === 3, '协作攻击造成 2 点伤害')
}

// 14. feel 能看到视野内的人，并写入私人记忆
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const observer = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !observer) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  observer.pos = { layer: 1, x: 40, y: 50 }
  let visibleIds: string[] = []
  const mind: Mind = {
    async feel(input) {
      if (input.self.id === 'kirisame-ren') {
        visibleIds = input.visible.map(entity => entity.id)
        return { remember: [], rememberPeople: input.visible.map(entity => entity.id) }
      }
      return { remember: [] }
    },
    async think() { return { thoughts: [], intention: null, patch: null } },
    async act() { return { action: null } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(visibleIds.includes('kirisame-ryunosuke'), 'feel 收到视野内的人')
  assert(after?.memory.some(entry => entry.infoId === 'seen-kirisame-ryunosuke-1') === true, '看见的人写入 feel 记忆')
}

// 15. 说话的声音进入附近角色的 feel 候选，并带来源
{
  const world = createManorWorld()
  const speaker = world.characters.find(character => character.id === 'kirisame-saya')
  const listener = world.characters.find(character => character.id === 'kirisame-ren')
  if (!speaker || !listener) throw new Error('missing characters')
  speaker.pos = { layer: 1, x: 39, y: 50 }
  listener.pos = { layer: 1, x: 40, y: 50 }
  const heard: Array<{ content: string; sourceName?: string }> = []
  const mind: Mind = {
    async feel(input) {
      if (input.self.id === 'kirisame-ren' && input.round === 2) {
        for (const candidate of input.candidates) heard.push({ content: candidate.content, sourceName: candidate.sourceName })
      }
      return { remember: [] }
    },
    async think({ self, round }) {
      return self.id === 'kirisame-saya' && round === 1
        ? {
          thoughts: [],
          intention: { actor: self.id, kind: 'speak', text: '测试声音', behavior: '说话', polarity: 'neutral' },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  await engine.step()
  assert(heard.some(item => item.content === '测试声音' && item.sourceName === '桐生 沙耶'), '说话声音进入 feel 候选并带说话人')
}

// 16. 移动 + 行为：先走到目标附近，再 tell
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 39, y: 53 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ryunosuke'
        ? {
          thoughts: [],
          intention: {
            actor: self.id,
            kind: 'tell',
            targetEntity: 'kirisame-ren',
            moveTo: { layer: 1, x: 39, y: 52 },
            text: '测试移动后传话',
            behavior: '走近后说',
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
  const mover = engine.view().characters.find(character => character.id === 'kirisame-ryunosuke')
  const receiver = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(mover?.pos.y === 52, '先移动到行为位置')
  assert(receiver?.memory.some(entry => entry.content === '测试移动后传话') === true, '移动后行为生效')
}

// 17. 能力 tool call：发火造成伤害 + 燃烧持续伤害
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-hino')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self, round }) {
      return self.id === 'kirisame-hino' && round === 1
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'ability',
            ability: { name: '发火' },
            targetEntity: 'kirisame-ren',
            behavior: '对会长发火', polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  const state = engine.view().characters.find(character => character.id === 'kirisame-hino')
  if (state) { state.ability.charge = 0; state.ability.state = '稳定' }
  await engine.step()
  let after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.vitals.hp === 3, '发火能力造成 2 点伤害')
  assert(after?.statuses.some(status => status.kind === 'burning') === true, '发火附加燃烧')
  await engine.step()
  after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.vitals.hp === 2, '燃烧在下一回合持续造成伤害')
}

// 18. 防御能力减伤
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-hino')
  const target = world.characters.find(character => character.id === 'kirisame-ryunosuke')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-hino'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'ability', ability: { name: '发火' }, targetEntity: 'kirisame-ryunosuke',
            behavior: '攻击灰谷', polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  const state = engine.view().characters.find(character => character.id === 'kirisame-hino')
  if (state) { state.ability.charge = 0; state.ability.state = '稳定' }
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ryunosuke')
  assert(after?.vitals.hp === 4, '硬化减伤 1 点')
}

// 19. 治疗/控制/暴走不额外反噬
{
  const world = createManorWorld()
  const healer = world.characters.find(character => character.id === 'kirisame-kanade')
  if (!healer) throw new Error('missing healer')
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-kanade'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'ability', ability: { name: '治愈' },
            behavior: '治疗自己', polarity: 'help',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  const state = engine.view().characters.find(character => character.id === 'kirisame-kanade')
  if (state) state.vitals.hp = 4
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-kanade')
  assert(after?.vitals.hp === 5, '治愈恢复 1 点生命')
}
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-rin')
  const target = world.characters.find(character => character.id === 'kirisame-ren')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-rin'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'ability', ability: { name: '暗示' }, targetEntity: 'kirisame-ren',
            behavior: '暗示会长', polarity: 'neutral',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.statuses.some(status => status.kind === 'suggested') === true, '暗示附加状态')
}
{
  const world = createManorWorld()
  const actor = world.characters.find(character => character.id === 'kirisame-ren')
  const target = world.characters.find(character => character.id === 'kirisame-hino')
  if (!actor || !target) throw new Error('missing characters')
  actor.pos = { layer: 1, x: 39, y: 50 }
  target.pos = { layer: 1, x: 40, y: 50 }
  const mind: Mind = {
    async feel() { return { remember: [] } },
    async think({ self }) {
      return self.id === 'kirisame-ren'
        ? {
          thoughts: [],
          intention: {
            actor: self.id, kind: 'ability', ability: { name: '重力' }, targetEntity: 'kirisame-hino',
            behavior: '压制火野', polarity: 'harm',
          },
          patch: null,
        }
        : { thoughts: [], intention: null, patch: null }
    },
    async act({ intention }) { return { action: intention } },
  }
  const engine = createEngine(world, mind)
  const state = engine.view().characters.find(character => character.id === 'kirisame-ren')
  if (state) { state.ability.charge = 100; state.ability.state = '暴走' }
  await engine.step()
  const after = engine.view().characters.find(character => character.id === 'kirisame-ren')
  assert(after?.vitals.hp === 5, '暴走状态使用能力不再每回合反噬')
}

console.log('smoke: all checks passed')
