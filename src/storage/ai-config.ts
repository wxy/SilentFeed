/**
 * AI 配置存储
 * 
 * 功能：
 * 1. 保存和读取 AI 配置（chrome.storage.sync）
 * 2. API Key 加密存储
 * 3. 提供类型安全的接口
 */

import { logger } from "@/utils/logger"
import { withErrorHandling, withErrorHandlingSync } from "@/utils/error-handler"

const configLogger = logger.withTag('AIConfig')

export type AIProviderType = "openai" | "anthropic" | "deepseek"

/**
 * AI 配置数据结构
 */
export interface AIConfig {
  provider: AIProviderType | null
  apiKey: string
  enabled: boolean
  monthlyBudget: number // 月度预算（美元或人民币），必须设置，最小 $1 或 ¥10
  
  /** Phase 9: 是否启用推理能力（DeepSeek-R1，成本约10倍但质量更好） */
  enableReasoning?: boolean
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AIConfig = {
  provider: null,
  apiKey: "",
  enabled: false,
  monthlyBudget: 5, // 默认 $5/月
  enableReasoning: false // Phase 9: 默认不启用推理（成本考虑）
}

/**
 * 获取 AI 配置
 */
export async function getAIConfig(): Promise<AIConfig> {
  return withErrorHandling(
    async () => {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.sync) {
        configLogger.warn('chrome.storage.sync not available, using default config')
        return DEFAULT_CONFIG
      }
      
      const result = await chrome.storage.sync.get("aiConfig")
      
      if (result.aiConfig) {
        // 解密 API Key（如果需要）
        const config = result.aiConfig as AIConfig
        return {
          ...DEFAULT_CONFIG,
          ...config,
          apiKey: decryptApiKey(config.apiKey)
        }
      }
      
      return DEFAULT_CONFIG
    },
    {
      tag: 'AIConfig.getAIConfig',
      fallback: DEFAULT_CONFIG,
      errorCode: 'AI_CONFIG_LOAD_ERROR',
      userMessage: '加载 AI 配置失败'
    }
  ) as Promise<AIConfig>
}

/**
 * 保存 AI 配置
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  return withErrorHandling(
    async () => {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.sync) {
        throw new Error("chrome.storage.sync not available")
      }
      
      // 加密 API Key（如果需要）
      const encryptedConfig = {
        ...config,
        apiKey: encryptApiKey(config.apiKey)
      }
      
      await chrome.storage.sync.set({ aiConfig: encryptedConfig })
    },
    {
      tag: 'AIConfig.saveAIConfig',
      rethrow: true,
      errorCode: 'AI_CONFIG_SAVE_ERROR',
      userMessage: '保存 AI 配置失败'
    }
  ) as Promise<void>
}

/**
 * 删除 AI 配置
 */
export async function deleteAIConfig(): Promise<void> {
  return withErrorHandling(
    async () => {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.sync) {
        throw new Error("chrome.storage.sync not available")
      }
      
      await chrome.storage.sync.remove("aiConfig")
    },
    {
      tag: 'AIConfig.deleteAIConfig',
      rethrow: true,
      errorCode: 'AI_CONFIG_DELETE_ERROR',
      userMessage: '删除 AI 配置失败'
    }
  ) as Promise<void>
}

/**
 * 检查是否已配置 AI
 */
export async function isAIConfigured(): Promise<boolean> {
  const config = await getAIConfig()
  return config.enabled && config.provider !== null && config.apiKey !== ""
}

/**
 * 加密 API Key
 * 
 * 使用 Base64 编码（简单混淆）
 * 注意：处理 Unicode 字符
 */
function encryptApiKey(apiKey: string): string {
  if (!apiKey) return ""
  
  return withErrorHandlingSync(
    () => {
      // 使用 TextEncoder 处理 Unicode
      const encoder = new TextEncoder()
      const data = encoder.encode(apiKey)
      
      // 转换为 Base64
      const base64 = btoa(String.fromCharCode(...data))
      return base64
    },
    {
      tag: 'AIConfig.encryptApiKey',
      fallback: apiKey, // 加密失败时返回原始值（总比丢失好）
      errorCode: 'API_KEY_ENCRYPT_ERROR',
      userMessage: 'API Key 加密失败'
    }
  ) as string
}

/**
 * 解密 API Key
 */
function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return ""
  
  return withErrorHandlingSync(
    () => {
      // 从 Base64 解码
      const decoded = atob(encryptedKey)
      
      // 转换回 Uint8Array
      const data = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)))
      
      // 使用 TextDecoder 处理 Unicode
      const decoder = new TextDecoder()
      return decoder.decode(data)
    },
    {
      tag: 'AIConfig.decryptApiKey',
      fallback: encryptedKey, // 如果解密失败，可能是未加密的旧数据或新数据
      errorCode: 'API_KEY_DECRYPT_ERROR',
      userMessage: 'API Key 解密失败',
      onError: () => {
        configLogger.warn('Failed to decrypt API key, using as-is')
      }
    }
  ) as string
}

/**
 * 验证 API Key 格式
 */
export function validateApiKey(
  provider: AIProviderType,
  apiKey: string
): boolean {
  if (!apiKey || apiKey.length < 10) return false
  
  switch (provider) {
    case "openai":
      // OpenAI API Key 格式: sk-proj-xxx 或 sk-xxx
      return apiKey.startsWith("sk-")
    
    case "anthropic":
      // Anthropic API Key 格式: sk-ant-xxx
      return apiKey.startsWith("sk-ant-")
    
    case "deepseek":
      // DeepSeek API Key 格式: sk-xxx
      // 注：chat 和 reasoner 模型使用相同的 API Key
      return apiKey.startsWith("sk-") && apiKey.length > 20
    
    default:
      return false
  }
}

/**
 * 获取提供商显示名称
 */
export function getProviderDisplayName(provider: AIProviderType | null): string {
  switch (provider) {
    case "openai":
      return "OpenAI (GPT-4o-mini)"
    case "anthropic":
      return "Anthropic (Claude-3-Haiku)"
    case "deepseek":
      return "DeepSeek"
    default:
      return "未配置"
  }
}

/**
 * 获取提供商 API 端点
 */
export function getProviderEndpoint(provider: AIProviderType): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions"
    case "anthropic":
      return "https://api.anthropic.com/v1/messages"
    case "deepseek":
      return "https://api.deepseek.com/v1/chat/completions"
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * 获取提供商模型名称
 */
export function getProviderModel(provider: AIProviderType): string {
  switch (provider) {
    case "openai":
      return "gpt-4o-mini"
    case "anthropic":
      return "claude-3-haiku-20240307"
    case "deepseek":
      return "deepseek-chat"
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
