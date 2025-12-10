/**
 * AI Provider 解析工具
 * 
 * 将抽象的 provider 类型（remote/local）解析为具体的 provider（deepseek/openai/ollama）
 */

import type { AIProvider, ConcreteAIProvider } from "@/types/ai-engine-assignment"
import type { AIConfig } from "@/storage/ai-config"

/**
 * 解析抽象 provider 为具体 provider
 * 
 * @param abstractProvider - 抽象 provider（可能是 "remote", "local", 或具体的 provider 名称）
 * @param config - AI 配置
 * @returns 具体的 provider 名称
 * 
 * @example
 * resolveProvider("remote", config) // => "deepseek" (根据 preferredRemoteProvider)
 * resolveProvider("local", config) // => "ollama" (根据 preferredLocalProvider)
 * resolveProvider("deepseek", config) // => "deepseek" (已经是具体 provider)
 */
export function resolveProvider(
  abstractProvider: AIProvider | string | undefined,
  config: AIConfig
): ConcreteAIProvider {
  if (!abstractProvider) {
    // 默认返回首选远程 provider
    return config.preferredRemoteProvider || 'deepseek'
  }

  switch (abstractProvider) {
    case 'remote':
      return config.preferredRemoteProvider || 'deepseek'
    
    case 'local':
      return config.preferredLocalProvider || 'ollama'
    
    case 'ollama':
    case 'deepseek':
    case 'openai':
      // 已经是具体 provider
      return abstractProvider as ConcreteAIProvider
    
    default:
      // 未知 provider，使用首选远程 provider
      return config.preferredRemoteProvider || 'deepseek'
  }
}

/**
 * 判断 provider 是否是本地 AI
 */
export function isLocalProvider(provider: AIProvider | string | undefined): boolean {
  return provider === 'local' || provider === 'ollama'
}

/**
 * 判断 provider 是否是远程 AI
 */
export function isRemoteProvider(provider: AIProvider | string | undefined): boolean {
  return provider === 'remote' || provider === 'deepseek' || provider === 'openai'
}
