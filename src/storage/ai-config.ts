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
import type { AIEngineAssignment, AIEngineConfig } from "@/types/ai-engine-assignment"
import { getDefaultEngineAssignment, migrateEngineAssignment } from "@/types/ai-engine-assignment"
import { encryptApiKey as cryptoEncrypt, decryptApiKey as cryptoDecrypt } from "@/utils/crypto"

const configLogger = logger.withTag('AIConfig')

/**
 * Phase 12.6: 默认超时配置
 */
export const DEFAULT_TIMEOUTS = {
  remote: {
    standard: 60000,      // 1 分钟（标准模式）
    reasoning: 120000     // 2 分钟（推理模式）
  },
  local: {
    standard: 60000,      // 1 分钟（本地 AI 响应可能较慢）
    reasoning: 180000     // 3 分钟（本地推理因硬件限制可能更慢）
  }
} as const

export type AIProviderType = "openai" | "deepseek"

/**
 * 从模型 ID 提取 Provider
 */
export function getProviderFromModel(modelId: string): AIProviderType | null {
  for (const [provider, models] of Object.entries(AVAILABLE_MODELS)) {
    if (models.some(m => m.id === modelId)) {
      return provider as AIProviderType
    }
  }
  return null
}

/**
 * 可用模型配置（按提供商分组）
 */
export const AVAILABLE_MODELS: Record<AIProviderType, AIModelConfig[]> = {
  deepseek: [
    {
      id: "deepseek-chat",
      name: "DeepSeek",
      description: "国内友好，支持推理模式（R1）",
      supportsReasoning: true,  // 支持推理能力
      reasoningCostMultiplier: 1,  // 推理模式成本倍数
      costMultiplier: 1
    }
  ],
  openai: [
    {
      id: "gpt-5-nano",
      name: "GPT-5 Nano",
      description: "最快最便宜，适合简单任务",
      supportsReasoning: false,
      costMultiplier: 0.2
    },
    {
      id: "gpt-5-mini",
      name: "GPT-5 Mini",
      description: "平衡性能和成本（推荐）",
      supportsReasoning: false,
      costMultiplier: 1
    },
    {
      id: "gpt-5",
      name: "GPT-5",
      description: "最强性能，成本较高",
      supportsReasoning: false,
      costMultiplier: 5
    },
    {
      id: "o4-mini",
      name: "o4-mini",
      description: "推理模型，擅长复杂推理任务",
      supportsReasoning: true,
      reasoningCostMultiplier: 16,
      costMultiplier: 4
    }
  ]
}

/**
 * AI 模型配置
 */
export interface AIModelConfig {
  /** 模型 ID */
  id: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 是否支持推理模式 */
  supportsReasoning: boolean
  /** 推理模式成本倍数（仅当 supportsReasoning=true 时有效） */
  reasoningCostMultiplier?: number
  /** 标准模式相对成本（1x = 基准） */
  costMultiplier: number
}

export interface LocalAIConfig {
  /** 是否启用本地 AI */
  enabled: boolean
  /** 当前本地 AI 提供商（Phase 10 先支持 Ollama） */
  provider: "ollama"
  /** Ollama 接口地址，默认 http://localhost:11434/v1（OpenAI 兼容模式） */
  endpoint: string
  /** 默认模型名称（例如 qwen2.5:7b） */
  model: string
  /** OpenAI 兼容接口可选 API Key */
  apiKey?: string
  /** 推理温度 */
  temperature?: number
  /** 单次输出最大 token 数 */
  maxOutputTokens?: number
  /** Phase 12.6: 标准模式请求超时（毫秒），默认 30000 */
  timeoutMs?: number
  /** Phase 12.6: 推理模式请求超时（毫秒），默认 180000 */
  reasoningTimeoutMs?: number
  /** 缓存的模型列表（避免每次打开配置都要重新加载） */
  cachedModels?: Array<{ id: string; label: string; isReasoning?: boolean }>
  /** Phase 11.2: 当前模型是否支持推理（从 Ollama API 获取） */
  isReasoningModel?: boolean
}

/**
 * 单个远程 AI Provider 的配置
 * Phase 9.2: 重构 - 每个 provider 独立配置
 * Phase 12.6: 超时配置
 */
export interface RemoteProviderConfig {
  /** API Key */
  apiKey: string
  /** 模型 */
  model: string
  /** 是否启用推理能力 */
  enableReasoning?: boolean
  
  /** Phase 12.6: 标准模式超时（毫秒），默认 60000 */
  timeoutMs?: number
  /** Phase 12.6: 推理模式超时（毫秒），默认 120000 */
  reasoningTimeoutMs?: number
}

/**
 * AI 配置数据结构
 * Phase 9.2+: 简化配置 - 只保留 providers 和 engineAssignment
 * Phase 12.4: Provider 级别预算控制（多货币独立预算）
 * 
 * 设计原则：
 * - 使用 providers 管理远程 AI 配置（每个 provider 独立）
 * - 使用 engineAssignment 控制任务级引擎分配
 * - 移除全局 enabled 开关（由 engineAssignment 控制）
 * - 移除单一 AI 模式的遗留字段（provider、apiKeys、model 等）
 * 
 * 预算控制（Phase 12.4）：
 * - providerBudgets: 每个 provider 的独立月度预算（使用各自原生货币）
 * - 不需要货币转换，各 provider 独立计算
 */
export interface AIConfig {
  /** 各提供商的配置（分别存储 API Key + Model） */
  providers: {
    openai?: RemoteProviderConfig
    deepseek?: RemoteProviderConfig
  }
  
  /**
   * Phase 12.4: 每个 provider 的独立月度预算
   * ⚠️ 使用各 provider 的原生货币单位：
   * - openai: 美元（USD）
   * - deepseek: 人民币（CNY）
   * 
   * 可选配置，未设置则不限制该 provider 预算
   * 
   * 示例：
   * {
   *   openai: 10,    // OpenAI 月度预算 $10 USD
   *   deepseek: 50   // DeepSeek 月度预算 ¥50 CNY
   * }
   */
  providerBudgets?: {
    openai?: number
    deepseek?: number
  }
  
  /**
   * @deprecated Phase 12.4: 已废弃，保留用于向后兼容
   */
  monthlyBudget?: number

  /** Phase 10: 本地 AI 配置（Ollama 等） */
  local: LocalAIConfig

  /** Phase 11: AI 引擎分配（为不同用途分配不同的 AI 引擎） */
  engineAssignment: AIEngineAssignment
  
  /** Phase 12: 首选远程 AI Provider（当任务配置为 "remote" 时使用） */
  preferredRemoteProvider?: "deepseek" | "openai"
  
  /** Phase 12: 首选本地 AI Provider（当任务配置为 "local" 时使用，目前仅支持 ollama） */
  preferredLocalProvider?: "ollama"
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AIConfig = {
  providers: {},
  providerBudgets: {}, // 默认不限制 provider 预算
  local: {
    enabled: false,
    provider: "ollama",
    endpoint: "http://localhost:11434/v1",
    model: "", // 不再硬编码，将动态查询
    apiKey: "ollama",
    temperature: 0.2,
    maxOutputTokens: 768,
    timeoutMs: DEFAULT_TIMEOUTS.local.standard, // Phase 12.6: 默认 60s
    reasoningTimeoutMs: DEFAULT_TIMEOUTS.local.reasoning, // Phase 12.6: 默认 180s
  },
  engineAssignment: getDefaultEngineAssignment(), // Phase 11: 默认智能优先方案
  preferredRemoteProvider: "deepseek",  // Phase 12: 默认使用 DeepSeek
  preferredLocalProvider: "ollama"      // Phase 12: 目前仅支持 Ollama
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
        const config = result.aiConfig as any
        
        // 解密 providers 中的 API Keys
        let providers: AIConfig['providers'] = {}
        if (config.providers) {
          for (const [providerKey, providerConfig] of Object.entries(config.providers)) {
            if (providerConfig && (providerConfig as any).apiKey) {
              providers[providerKey as AIProviderType] = {
                ...(providerConfig as RemoteProviderConfig),
                apiKey: await cryptoDecrypt((providerConfig as RemoteProviderConfig).apiKey)
              }
            }
          }
        }
        
        // Phase 12.4: 处理预算配置迁移
        // 如果存在旧的 monthlyBudget，迁移到 globalMonthlyBudget
        const globalMonthlyBudget = config.globalMonthlyBudget 
          || config.monthlyBudget 
          || DEFAULT_CONFIG.globalMonthlyBudget
        
        // 如果没有 providerBudgets 但有旧的 monthlyBudget，自动分配
        let providerBudgets = config.providerBudgets || {}
        if (!config.providerBudgets && config.monthlyBudget && Object.keys(providers).length > 0) {
          // 自动为已配置的 providers 平均分配预算
          const providerCount = Object.keys(providers).length
          const budgetPerProvider = Math.floor((config.monthlyBudget / providerCount) * 100) / 100
          providerBudgets = Object.keys(providers).reduce((acc, key) => {
            acc[key as AIProviderType] = budgetPerProvider
            return acc
          }, {} as NonNullable<AIConfig['providerBudgets']>)
          
          configLogger.info('📊 自动迁移预算配置', {
            totalBudget: config.monthlyBudget,
            providers: Object.keys(providers),
            budgetPerProvider
          })
        }
        
        return {
          providers,
          globalMonthlyBudget,
          globalBudgetCurrency: config.globalBudgetCurrency || DEFAULT_CONFIG.globalBudgetCurrency,
          providerBudgets,
          local: {
            ...DEFAULT_CONFIG.local,
            ...(config.local || {})
          },
          engineAssignment: config.engineAssignment || DEFAULT_CONFIG.engineAssignment,
          // Phase 12: 读取 Provider 偏好设置
          preferredRemoteProvider: config.preferredRemoteProvider || DEFAULT_CONFIG.preferredRemoteProvider,
          preferredLocalProvider: config.preferredLocalProvider || DEFAULT_CONFIG.preferredLocalProvider
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
      
      // 加密 providers 中的 API Keys
      const encryptedProviders: AIConfig['providers'] = {}
      if (config.providers) {
        for (const [providerKey, providerConfig] of Object.entries(config.providers)) {
          if (providerConfig && providerConfig.apiKey) {
            encryptedProviders[providerKey as AIProviderType] = {
              ...providerConfig,  // Phase 12.6: 保留所有字段（包括超时配置）
              apiKey: await cryptoEncrypt(providerConfig.apiKey)
            }
          }
        }
      }
      
      const encryptedConfig: AIConfig = {
        providers: encryptedProviders,  // Phase 12.6: 确保 providers 被保存（包含超时配置）
        globalMonthlyBudget: config.globalMonthlyBudget,
        globalBudgetCurrency: config.globalBudgetCurrency,
        providerBudgets: config.providerBudgets,
        local: config.local,
        engineAssignment: config.engineAssignment,
        // Phase 12: 保存 Provider 偏好设置
        preferredRemoteProvider: config.preferredRemoteProvider,
        preferredLocalProvider: config.preferredLocalProvider
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
 * 检查是否至少配置了一个远程 AI 提供商
 */
export async function isAIConfigured(): Promise<boolean> {
  const config = await getAIConfig()
  
  // 检查是否有任何配置的 provider
  if (!config.providers || Object.keys(config.providers).length === 0) {
    return false
  }
  
  // 检查是否至少有一个 provider 有 API Key
  for (const providerConfig of Object.values(config.providers)) {
    if (providerConfig && providerConfig.apiKey && providerConfig.apiKey !== "") {
      return true
    }
  }
  
  return false
}

/**
 * AI 可用性状态
 */
export interface AIAvailabilityStatus {
  /** 是否有任何 AI 可用 */
  hasAny: boolean
  /** 是否有远程 AI 可用 */
  hasRemote: boolean
  /** 是否有本地 AI 可用 */
  hasLocal: boolean
  /** 可用的远程 Provider 列表 */
  remoteProviders: AIProviderType[]
}

/**
 * 检查是否有任何 AI 可用（远程或本地）
 * 这是全局 AI 可用性检测的核心函数
 */
export async function hasAnyAIAvailable(): Promise<AIAvailabilityStatus> {
  const config = await getAIConfig()
  
  // 检查远程 AI
  const remoteProviders: AIProviderType[] = []
  if (config.providers) {
    for (const [providerKey, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig && providerConfig.apiKey && providerConfig.apiKey !== "") {
        remoteProviders.push(providerKey as AIProviderType)
      }
    }
  }
  const hasRemote = remoteProviders.length > 0
  
  // 检查本地 AI
  const hasLocal = config.local?.enabled === true && 
                   !!config.local?.endpoint && 
                   !!config.local?.model
  
  return {
    hasAny: hasRemote || hasLocal,
    hasRemote,
    hasLocal,
    remoteProviders
  }
}

/**
 * 根据当前 AI 配置返回推荐的预设方案
 * - 仅有本地 AI: 返回 'privacy'
 * - 有远程 AI: 返回 'intelligence'
 * - 无 AI: 返回 null
 */
export async function getRecommendedPreset(): Promise<'privacy' | 'intelligence' | 'economic' | null> {
  const status = await hasAnyAIAvailable()
  
  if (!status.hasAny) {
    return null // 无 AI 配置，不推荐任何预设
  }
  
  if (status.hasRemote) {
    return 'intelligence' // 有远程 AI，推荐智能优先
  }
  
  if (status.hasLocal) {
    return 'privacy' // 仅有本地 AI，推荐隐私优先
  }
  
  return null
}

// 注意：加密/解密函数已移至 @/utils/crypto，使用 AES-GCM 256 位加密

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

/**
 * Phase 11: 获取 AI 引擎分配配置
 * Phase 13: 支持配置迁移（profileGeneration/sourceAnalysis → lowFrequencyTasks）
 * 
 * 会自动迁移旧字段名（feedAnalysis -> articleAnalysis）并补充缺失的默认配置
 */
export async function getEngineAssignment(): Promise<AIEngineAssignment> {
  const config = await getAIConfig()
  const defaultAssignment = getDefaultEngineAssignment()
  
  if (!config.engineAssignment) {
    return defaultAssignment
  }
  
  const stored = config.engineAssignment as Record<string, unknown>
  
  // 迁移：feedAnalysis -> articleAnalysis
  if (stored.feedAnalysis && !stored.articleAnalysis) {
    stored.articleAnalysis = stored.feedAnalysis
    delete stored.feedAnalysis
    configLogger.info('✅ 已迁移 feedAnalysis -> articleAnalysis')
  }
  
  // Phase 13: 迁移 profileGeneration/sourceAnalysis -> lowFrequencyTasks
  if ((stored.profileGeneration || stored.sourceAnalysis) && !stored.lowFrequencyTasks) {
    const migrated = migrateEngineAssignment(stored as Partial<AIEngineAssignment>)
    configLogger.info('✅ 已迁移 profileGeneration/sourceAnalysis -> lowFrequencyTasks')
    
    // 自动保存迁移后的配置
    await saveAIConfig({
      ...config,
      engineAssignment: migrated
    })
    
    return migrated
  }
  
  // 补充缺失的字段（不覆盖已存在的）
  return {
    pageAnalysis: (stored.pageAnalysis as AIEngineConfig) || defaultAssignment.pageAnalysis,
    articleAnalysis: (stored.articleAnalysis as AIEngineConfig) || defaultAssignment.articleAnalysis,
    lowFrequencyTasks: (stored.lowFrequencyTasks as AIEngineConfig) || defaultAssignment.lowFrequencyTasks,
    // 保留旧字段用于兼容（标记为 deprecated）
    profileGeneration: stored.profileGeneration as AIEngineConfig | undefined,
    sourceAnalysis: stored.sourceAnalysis as AIEngineConfig | undefined,
    // 保留其他自定义字段
    ...stored
  } as AIEngineAssignment
}

/**
 * Phase 11: 保存 AI 引擎分配配置
 */
export async function saveEngineAssignment(assignment: AIEngineAssignment): Promise<void> {
  const config = await getAIConfig()
  await saveAIConfig({
    ...config,
    engineAssignment: assignment
  })
}

/**
 * 获取 Ollama 第一个可用的模型
 * 用于替代硬编码的默认模型
 */
export async function getFirstAvailableOllamaModel(endpoint: string = "http://localhost:11434"): Promise<string | null> {
  return withErrorHandling(
    async () => {
      // 尝试 OpenAI 兼容接口
      try {
        const response = await fetch(`${endpoint}/v1/models`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000)
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            return data.data[0].id
          }
        }
      } catch (error) {
        configLogger.debug('OpenAI 兼容接口获取模型失败', error)
      }
      
      // 回退到 Ollama 原生接口
      try {
        const response = await fetch(`${endpoint}/api/tags`, {
          method: "GET",
          signal: AbortSignal.timeout(3000)
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.models && Array.isArray(data.models) && data.models.length > 0) {
            return data.models[0].name
          }
        }
      } catch (error) {
        configLogger.debug('Ollama 原生接口获取模型失败', error)
      }
      
      return null
    },
    {
      tag: 'AIConfig.getFirstAvailableOllamaModel',
      fallback: null,
      errorCode: 'OLLAMA_MODEL_QUERY_ERROR',
      userMessage: '查询 Ollama 模型失败'
    }
  )
}
