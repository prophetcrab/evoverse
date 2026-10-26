import type { ChatMessage, Complete } from './llm-mind'
import type { CallPhase, UsageMeter } from './usage'

interface BridgeResponse {
  text?: unknown
  model?: unknown
  usage?: {
    inputTokens?: unknown
    outputTokens?: unknown
    totalTokens?: unknown
    cacheReadTokens?: unknown
  }
}

/**
 * 宿主补全通道：POST /evoverse/chat。
 * 密钥由宿主在页面启动时注入到 globalThis.EVOVERSE_BRIDGE_KEY；
 * 独立开发页没有密钥，返回 null，调用方回落到 mock。
 */
export function createHostComplete(meter: UsageMeter, currentRound: () => number): Complete | null {
  const key = (globalThis as { EVOVERSE_BRIDGE_KEY?: string }).EVOVERSE_BRIDGE_KEY
  if (typeof key !== 'string' || key.length === 0) return null

  return async (messages: ChatMessage[], phase: CallPhase = 'think') => {
    try {
      const response = await fetch('/evoverse/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-evoverse-key': key,
        },
        body: JSON.stringify({ messages }),
      })
      if (!response.ok) throw new Error(`bridge ${response.status}`)
      const data = await response.json() as BridgeResponse
      const usage = data.usage ?? {}
      meter.record({
        phase,
        model: typeof data.model === 'string' ? data.model : 'unknown',
        input: typeof usage.inputTokens === 'number' ? usage.inputTokens : 0,
        output: typeof usage.outputTokens === 'number' ? usage.outputTokens : 0,
        total: typeof usage.totalTokens === 'number' ? usage.totalTokens : 0,
        cacheRead: typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0,
        ok: true,
        round: currentRound(),
      })
      if (typeof data.text !== 'string') throw new Error('bridge returned no text')
      return data.text
    } catch (error: unknown) {
      meter.record({
        phase,
        model: 'unknown',
        input: 0,
        output: 0,
        total: 0,
        cacheRead: 0,
        ok: false,
        round: currentRound(),
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
