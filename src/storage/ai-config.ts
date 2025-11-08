/**
 * AI 配置存储
 * 
 * 功能：
 * 1. 保存和读取 AI 配置（chrome.storage.sync）
 * 2. API Key 加密存储
 * 3. 提供类型安全的接口
 */

export type AIProviderType = "openai" | "anthropic" | "deepseek"

/**
 * AI 配置数据结构
 */
export interface AIConfig {
  provider: AIProviderType | null
  apiKey: string
  enabled: boolean
  monthlyBudget?: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AIConfig = {
  provider: null,
  apiKey: "",
  enabled: false,
  monthlyBudget: 5 // 默认 $5/月
}

/**
 * 获取 AI 配置
 */
export async function getAIConfig(): Promise<AIConfig> {
  try {
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
  } catch (error) {
    console.error("[AIConfig] Failed to load config:", error)
    return DEFAULT_CONFIG
  }
}

/**
 * 保存 AI 配置
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  try {
    // 加密 API Key（如果需要）
    const encryptedConfig = {
      ...config,
      apiKey: encryptApiKey(config.apiKey)
    }
    
    await chrome.storage.sync.set({ aiConfig: encryptedConfig })
  } catch (error) {
    console.error("[AIConfig] Failed to save config:", error)
    throw error
  }
}

/**
 * 删除 AI 配置
 */
export async function deleteAIConfig(): Promise<void> {
  try {
    await chrome.storage.sync.remove("aiConfig")
  } catch (error) {
    console.error("[AIConfig] Failed to delete config:", error)
    throw error
  }
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
 * 注意：这是一个简单的混淆，不是真正的加密
 * 真正的加密需要使用 Web Crypto API，但对于存储在浏览器本地的数据，
 * 这个级别的保护已经足够（防止意外泄露）
 */
function encryptApiKey(apiKey: string): string {
  if (!apiKey) return ""
  
  // 简单的 Base64 编码（混淆）
  // 在实际生产环境中，应该使用更强的加密
  try {
    return btoa(apiKey)
  } catch (error) {
    console.error("[AIConfig] Failed to encrypt API key:", error)
    return apiKey
  }
}

/**
 * 解密 API Key
 */
function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return ""
  
  try {
    return atob(encryptedKey)
  } catch (error) {
    // 如果解密失败，可能是未加密的旧数据
    console.warn("[AIConfig] Failed to decrypt API key, using as-is")
    return encryptedKey
  }
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
      // DeepSeek API Key 没有固定前缀，只检查长度
      return apiKey.length > 20
    
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
