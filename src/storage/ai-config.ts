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
  monthlyBudget: number // 月度预算（美元），必须设置，最小 $1
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
 * 使用 Base64 编码（简单混淆）
 * 注意：处理 Unicode 字符
 */
function encryptApiKey(apiKey: string): string {
  if (!apiKey) return ""
  
  try {
    // 使用 TextEncoder 处理 Unicode
    const encoder = new TextEncoder()
    const data = encoder.encode(apiKey)
    
    // 转换为 Base64
    const base64 = btoa(String.fromCharCode(...data))
    return base64
  } catch (error) {
    console.error("[AIConfig] Failed to encrypt API key:", error)
    // 加密失败时返回原始值（总比丢失好）
    return apiKey
  }
}

/**
 * 解密 API Key
 */
function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return ""
  
  try {
    // 从 Base64 解码
    const decoded = atob(encryptedKey)
    
    // 转换回 Uint8Array
    const data = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)))
    
    // 使用 TextDecoder 处理 Unicode
    const decoder = new TextDecoder()
    return decoder.decode(data)
  } catch (error) {
    // 如果解密失败，可能是未加密的旧数据或新数据
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
