import type { ActionKind } from './types'

/** 角色一轮只能调用其中一个工具；这里同时供 mock、LLM 提示词与未来的 dsh 工具注册使用。 */
export interface ToolDef {
  name: Exclude<ActionKind, 'idle'>
  description: string
  params: Array<{ name: string; type: string; required?: boolean; description: string }>
}

export const ACTION_TOOLS: ToolDef[] = [
  {
    name: 'move',
    description: '只移动用 move（targetCell）；如果想移动后行动，在意图里加 moveTo，再给行为。每轮最多走 6 格，自动寻路绕开墙和其他角色。',
    params: [
      { name: 'targetCell', type: '{layer,x,y}', required: true, description: '目标格' },
    ],
  },
  {
    name: 'speak',
    description: '在当前格公开说话，产生可被附近听见的声音信息。',
    params: [
      { name: 'text', type: 'string', required: true, description: '说出口的话' },
      { name: 'topics', type: 'string[]', description: '话题标签' },
    ],
  },
  {
    name: 'tell',
    description: '对看得见的某个角色定向交流；内容会写入对方记忆。',
    params: [
      { name: 'targetEntity', type: 'string', required: true, description: '目标角色 id' },
      { name: 'text', type: 'string', required: true, description: '说的内容' },
      { name: 'mode', type: "'告知'|'询问'|'请求'|'威胁'", description: '交流类型' },
      { name: 'topics', type: 'string[]', description: '话题标签' },
    ],
  },
  {
    name: 'attack',
    description: '攻击看得见的角色；徒手/推搡 1 点伤害，武器按物品伤害与射程结算，护具可减伤。',
    params: [
      { name: 'targetEntity', type: 'string', required: true, description: '目标角色 id' },
      { name: 'method', type: "'徒手'|'武器'|'推搡'", description: '攻击手段；选武器时必须持有武器' },
      { name: 'itemId', type: 'string', description: '指定使用的武器 id；缺省自动用身上的武器' },
    ],
  },
  {
    name: 'take',
    description: '拿走当前格地面或已打开容器里的物品。',
    params: [
      { name: 'itemId', type: 'string', required: true, description: '物品 id' },
    ],
  },
  {
    name: 'drop',
    description: '把身上的物品放到当前格。',
    params: [
      { name: 'itemId', type: 'string', required: true, description: '物品 id' },
    ],
  },
  {
    name: 'give',
    description: '把身上的物品交给看得见的角色。',
    params: [
      { name: 'itemId', type: 'string', required: true, description: '物品 id' },
      { name: 'targetEntity', type: 'string', required: true, description: '目标角色 id' },
    ],
  },
  {
    name: 'use',
    description: '使用身上的物品：药品治疗、文件阅读、钥匙开锁；物品不会因使用而消失（药品除外）。',
    params: [
      { name: 'itemId', type: 'string', required: true, description: '物品 id' },
      { name: 'targetEntity', type: 'string', description: '药品的目标角色；缺省为自己' },
    ],
  },
  {
    name: 'interact',
    description: '操作当前格的设施：开/关/锁/解锁/撬开容器、读/写黑板、开关装置。',
    params: [
      { name: 'fixtureId', type: 'string', required: true, description: '设施 id' },
      { name: 'verb', type: "'open'|'close'|'lock'|'unlock'|'break'|'write'|'read'|'toggle'", required: true, description: '操作方式' },
      { name: 'text', type: 'string', description: 'write 时写下的内容' },
      { name: 'topics', type: 'string[]', description: '话题标签' },
    ],
  },
  {
    name: 'assist',
    description: '协助看得见的同伙：本轮他若攻击，伤害 +1。',
    params: [
      { name: 'targetEntity', type: 'string', required: true, description: '目标角色 id' },
    ],
  },
  {
    name: 'ability',
    description: '使用你角色的能力。name 必须用【你的能力】里的名称；目标是角色/格子/设施/物品时按能力卡填 targetEntity/targetCell/fixtureId/itemId。该用的时候就用，不要因为负荷而完全不用；负荷到 80 才暴走。',
    params: [
      { name: 'name', type: 'string', required: true, description: '能力名，必须用【你的能力】里的名称' },
      { name: 'targetEntity', type: 'string', description: '目标角色 id（角色目标时）' },
      { name: 'targetCell', type: '{layer,x,y}', description: '目标格（传送/地形时）' },
      { name: 'fixtureId', type: 'string', description: '目标设施 id（如需要）' },
      { name: 'itemId', type: 'string', description: '目标物品 id（如需要）' },
      { name: 'text', type: 'string', description: '要说的话/广播内容/痕迹描述' },
      { name: 'topics', type: 'string[]', description: '话题标签' },
      { name: 'scope', type: "'self'|'other'|'world'|'info'", description: '仅兼容旧能力，可不填' },
    ],
  },
]
