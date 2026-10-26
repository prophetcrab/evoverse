import type { ActionKind } from './types'

/** 角色一轮只能调用其中一个工具；这里同时供 mock、LLM 提示词与未来的 dsh 工具注册使用。 */
export interface ToolDef {
  name: Exclude<ActionKind, 'idle' | 'use'>
  description: string
  params: Array<{ name: string; type: string; required?: boolean; description: string }>
}

export const ACTION_TOOLS: ToolDef[] = [
  {
    name: 'move',
    description: '移动到相邻的可通行格；上下楼必须站在对应的楼梯格上。',
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
    description: '攻击看得见的角色；徒手/推搡造成 1 点伤害，武器造成 2 点。生命归零会失能。',
    params: [
      { name: 'targetEntity', type: 'string', required: true, description: '目标角色 id' },
      { name: 'method', type: "'徒手'|'武器'|'推搡'", description: '攻击手段' },
    ],
  },
  {
    name: 'ability',
    description: '能力：修改自己、他人或世界的信息。self 治疗自己 1 点；other 治疗他人 1 点；world 在当前格留下持久痕迹；info 在当前格散布一条消息。',
    params: [
      { name: 'scope', type: "'self'|'other'|'world'|'info'", required: true, description: '作用域' },
      { name: 'name', type: 'string', required: true, description: '能力名，如 治疗 / 镇定 / 留痕 / 传话' },
      { name: 'targetEntity', type: 'string', description: 'scope=other 时的目标' },
      { name: 'text', type: 'string', description: '痕迹或消息内容' },
      { name: 'topics', type: 'string[]', description: '话题标签' },
    ],
  },
]
