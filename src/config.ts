/** 插件级默认模型选择：思考层和总结层接线后都用这一份。 */

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface EvoverseConfig {
  provider: string
  model: string
  reasoningEffort: ReasoningEffort
}

export const DEFAULT_CONFIG: EvoverseConfig = {
  provider: 'deepseek-account',
  model: 'deepseek-flash',
  reasoningEffort: 'low',
}

export function resolveConfig(input?: Partial<EvoverseConfig>): EvoverseConfig {
  const reasoning = input?.reasoningEffort
  return {
    provider: input?.provider && input.provider.length > 0 ? input.provider : DEFAULT_CONFIG.provider,
    model: input?.model && input.model.length > 0 ? input.model : DEFAULT_CONFIG.model,
    reasoningEffort: reasoning === 'low' || reasoning === 'medium' || reasoning === 'high'
      ? reasoning
      : DEFAULT_CONFIG.reasoningEffort,
  }
}

export const MODEL_LABEL = 'DeepSeek-V4.1-Flash'
