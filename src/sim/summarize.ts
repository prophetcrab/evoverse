import type { World } from '../world/types'
import type { RoundRecord } from './types'
import type { ChatMessage, Complete } from './llm-mind'

export type RoundSummarizer = (input: { record: RoundRecord; world: World }) => Promise<string>

const nameOf = (world: World, id?: string): string =>
  id ? world.characters.find(character => character.id === id)?.name ?? id : '某人'

/** 默认总结：模板化、即时、可复现。 */
export const templateSummary: RoundSummarizer = async ({ record, world }) => {
  if (record.actions.length === 0) return `第 ${record.round} 轮：没有人行动。`
  const lines = record.actions.map(({ action, outcome }) => {
    const name = nameOf(world, action.actor)
    if (outcome === 'blocked') return `${name}想${action.behavior}，没成`
    if (action.kind === 'move') return `${name}${action.behavior}`
    if (action.kind === 'speak') return `${name}说“${action.text ?? '……'}”`
    if (action.kind === 'tell') return `${name}对${nameOf(world, action.targetEntity)}说“${action.text ?? '……'}”`
    if (action.kind === 'use') return `${name}对${nameOf(world, action.targetEntity)}${action.behavior}`
    return `${name}停着没动`
  })
  return `第 ${record.round} 轮：${lines.join('；')}。`
}

/** 用模型做总结；失败时回落到模板。 */
export function createLlmSummarizer(complete: Complete): RoundSummarizer {
  return async ({ record, world }) => {
    if (record.actions.length === 0) return `第 ${record.round} 轮：没有人行动。`
    const actions = record.actions
      .map(({ action, outcome }) => {
        const actor = nameOf(world, action.actor)
        const target = action.targetEntity ? ` → ${nameOf(world, action.targetEntity)}` : ''
        const detail = action.text ? `：「${action.text}」` : ''
        return `- ${actor} ${outcome === 'blocked' ? '尝试但失败' : '执行'} ${action.kind}${target}${detail}`
      })
      .join('\n')
    const events = record.events.map(event => `- ${event.text}`).join('\n')
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是世界观察者。只陈述这一轮发生了什么，不评价、不推测，1–3 句中文。' },
      {
        role: 'user',
        content: `回合：${record.round}\n行动：\n${actions}\n事件：\n${events || '无'}`,
      },
    ]
    try {
      const text = await complete(messages, 'summary')
      const trimmed = text.trim()
      return trimmed.length > 0 ? trimmed : templateSummary({ record, world })
    } catch {
      return templateSummary({ record, world })
    }
  }
}
