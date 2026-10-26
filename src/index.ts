/**
 * Node 半：插件配置解析 + 模型补全桥。
 * 浏览器侧通过 POST /evoverse/chat 调用宿主 llm；密钥在页面启动时注入。
 */

import { MODEL_LABEL, resolveConfig, type EvoverseConfig } from './config'

export const name = 'evoverse'

export interface Config extends Partial<EvoverseConfig> {}

interface LlmUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cacheReadTokens?: number
}

interface LlmChunk {
  type: string
  text?: string
  usage?: LlmUsage
}

interface LlmService {
  stream(options: {
    provider: string
    model: string
    reasoningEffort?: string
    system?: string
    messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>
  }): AsyncIterable<LlmChunk>
}

interface WebRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  on(event: 'data', listener: (chunk: unknown) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  destroy(error?: Error): void
}

interface WebResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

interface HostContext {
  llm: LlmService
  webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (req: WebRequest, res: WebResponse) => void | Promise<void>
    }): () => void
  }
  on(event: 'webserver/index-inject', listener: (table: Array<Record<string, unknown>>) => void): () => void
  effect?: (fn: () => (() => void) | void) => unknown
  logger?: { info?: (message: string) => void }
}

export const inject = ['llm', 'webServer']

const readBody = (req: WebRequest): Promise<string> => new Promise((resolve, reject) => {
  let body = ''
  req.on('data', chunk => {
    body += String(chunk)
    if (body.length > 4_000_000) {
      req.destroy()
      reject(new Error('body too large'))
    }
  })
  req.on('end', () => resolve(body))
  req.on('error', reject)
})

export function apply(ctx: HostContext, config?: Config): void {
  const resolved = resolveConfig(config)
  const key = globalThis.crypto.randomUUID().replaceAll('-', '')
  const line = `evoverse: model=${resolved.provider}/${resolved.model} (${MODEL_LABEL}) reasoningEffort=${resolved.reasoningEffort} bridge=/evoverse/chat`
  ctx.logger?.info?.(line)
  console.log(line)

  // 页面启动时把桥接密钥注入到 globalThis。
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: 'EVOVERSE_BRIDGE_KEY', value: key })
  })

  const register = (): (() => void) => ctx.webServer.register({
    kind: 'exact',
    path: '/evoverse/chat',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
        res.end('{"error":"method not allowed"}')
        return
      }
      if (req.headers['x-evoverse-key'] !== key) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end('{"error":"forbidden"}')
        return
      }
      try {
        const data = JSON.parse(await readBody(req)) as {
          messages?: Array<{ role?: string; content?: string }>
        }
        const messages = Array.isArray(data.messages) ? data.messages : []
        const system = messages
          .filter(message => message.role === 'system')
          .map(message => message.content ?? '')
          .join('\n')
        const userMessages = messages
          .filter(message => message.role !== 'system')
          .map(message => ({
            role: 'user' as const,
            content: [{ type: 'text' as const, text: message.content ?? '' }],
          }))
        if (userMessages.length === 0) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
          res.end('{"error":"no messages"}')
          return
        }

        let text = ''
        let usage: LlmUsage | null = null
        for await (const chunk of ctx.llm.stream({
          provider: resolved.provider,
          model: resolved.model,
          reasoningEffort: resolved.reasoningEffort,
          ...(system.length > 0 ? { system } : {}),
          messages: userMessages,
        })) {
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
          else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
        }

        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ text, usage, model: resolved.model }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    },
  })

  if (ctx.effect) ctx.effect(() => register())
  else register()
}
