/**
 * 推荐系统配置
 * Phase 6: AI 推荐引擎
 * 
 * 设计理念：
 * - 默认使用全文分析（后台异步，时效性要求不高）
 * - 用户只需选择成本相关（推理模式）和隐私相关（本地AI）的选项
 * - 推荐数量由系统根据用户行为自动调整
 */

import { getAIConfig, isAIConfigured, type AIProviderType } from './ai-config'
import { aiManager } from '../core/ai/AICapabilityManager'

const STORAGE_KEY = "recommendation-config"

/**
 * 推荐配置接口
 */
export interface RecommendationConfig {
  /** 是否使用推理模式（DeepSeek-R1等推理型AI，成本更高但质量更好，默认使用标准AI） */
  useReasoning: boolean
  
  /** 是否使用本地AI（Ollama/Chrome AI，隐私保护但消耗性能） */
  useLocalAI: boolean
  
  /** 
   * 推荐条目数（1-5，由系统自动调整）
   * 根据用户清理推荐的速度自动优化：
   * - 清理快（频繁点"不想读"）→ 推荐少
   * - 清理慢（推荐停留时间长）→ 推荐多
   */
  maxRecommendations: number
  
  /**
   * Phase 6: 每次处理的文章批次大小（默认 1 篇）
   * 避免一次性处理所有文章导致等待时间过长
   * 用户可以多次点击生成推荐来渐进式处理
   */
  batchSize: number
  
  /**
   * Phase 6: 推荐池质量阈值（0-1，默认 0.6）
   * 只有评分 >= 此阈值的文章才会进入推荐池
   * 
   * **⚠️ 重要**: 此阈值根据实际 AI 评分分布调整
   * 
   * 实际观察数据（2024-12）：
   * - 中等质量文章：0.5-0.6
   * - 良好质量文章：0.6-0.7
   * - 优秀质量文章：0.7+
   * - 观察到的最高分：0.65
   * 
   * 评分含义：
   * - 0.7+: 优秀（实际很少见）
   * - 0.6-0.7: 良好文章（建议推荐）✅ 当前阈值
   * - 0.5-0.6: 中等相关（可选推荐）
   * - 0.0-0.5: 低相关（过滤）
   */
  qualityThreshold: number
  
  /**
   * Phase 6: TF-IDF 最低分数阈值（0-1，默认 0.1）
   * 低于此分数的文章不送 AI 分析，直接标记为已分析
   * 
   * 分数含义：
   * - 0.3-1.0: 高度相关（多个关键词匹配）
   * - 0.1-0.3: 一般相关（部分关键词匹配）
   * - 0-0.1: 弱相关或不相关（几乎无匹配）
   * 
   * 推荐值：0.1（过滤明显不相关的，保留有一定相关性的给 AI 判断）
   */
  tfidfThreshold: number
}

/**
 * AI配置状态检查结果
 */
export interface AIConfigStatus {
  /** 是否已配置AI */
  isConfigured: boolean
  
  /** AI提供商类型 */
  provider: AIProviderType | null
  
  /** API密钥是否有效（格式检查） */
  isKeyValid: boolean
  
  /** AI服务是否可用（网络连接检查） */
  isAvailable: boolean
  
  /** 本地AI是否可用 */
  hasLocalAI: boolean
  
  /** 预算状态 */
  budgetStatus: {
    /** 月度预算（美元或人民币） */
    monthlyBudget: number
    /** 已使用金额 */
    usedAmount: number
    /** 是否超出预算 */
    isOverBudget: boolean
    /** 使用率 */
    usageRate: number
  }
  
  /** 最后检查时间 */
  lastChecked: number
  
  /** 错误信息（如果有） */
  error?: string
}

/**
 * 本地AI检测结果
 */
export interface LocalAIStatus {
  /** Ollama是否可用 */
  hasOllama: boolean
  
  /** Chrome AI是否可用 */
  hasChromeAI: boolean
  
  /** 可用的本地AI服务 */
  availableServices: ('ollama' | 'chrome-ai')[]
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: RecommendationConfig = {
  useReasoning: false, // 默认不使用推理模式（成本考虑）
  useLocalAI: false,   // 默认不使用本地AI（性能考虑）
  maxRecommendations: 3, // 初始值3条，后续自动调整
  batchSize: 1, // Phase 6: 默认每次处理 1 篇文章（避免超时）
  qualityThreshold: 0.6, // Phase 6: 根据实际评分分布调整（观察最高分 0.65）
  tfidfThreshold: 0.1 // Phase 6: TF-IDF 阈值（0.1 = 有一定相关性，过滤明显不相关的）
}

/**
 * 获取推荐配置
 */
export async function getRecommendationConfig(): Promise<RecommendationConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const config = result[STORAGE_KEY] as RecommendationConfig | undefined
    
    const merged = {
      ...DEFAULT_CONFIG,
      ...config
    }
    
    // Phase 6: 强制更新旧配置（兼容性迁移）
    let needsUpdate = false
    
    // 如果 qualityThreshold 是旧的默认值 0.8，更新为新的 0.6
    if (merged.qualityThreshold === 0.8) {
      console.log('[RecommendationConfig] 🔄 检测到旧配置 qualityThreshold=0.8，更新为 0.6')
      merged.qualityThreshold = 0.6
      needsUpdate = true
    }
    
    // 如果缺少 tfidfThreshold，添加默认值
    if (merged.tfidfThreshold === undefined) {
      console.log('[RecommendationConfig] 🔄 添加缺失的 tfidfThreshold=0.1')
      merged.tfidfThreshold = 0.1
      needsUpdate = true
    }
    
    // 自动保存更新后的配置
    if (needsUpdate) {
      await chrome.storage.local.set({ [STORAGE_KEY]: merged })
      console.log('[RecommendationConfig] ✅ 配置已自动更新')
    }
    
    return merged
  } catch (error) {
    console.error("[RecommendationConfig] 加载失败:", error)
    return DEFAULT_CONFIG
  }
}

/**
 * 保存推荐配置
 */
export async function saveRecommendationConfig(
  config: Partial<RecommendationConfig>
): Promise<void> {
  try {
    const current = await getRecommendationConfig()
    const updated = { ...current, ...config }
    
    // 验证 maxRecommendations 范围（1-5）
    if (updated.maxRecommendations < 1) {
      updated.maxRecommendations = 1
    }
    if (updated.maxRecommendations > 5) {
      updated.maxRecommendations = 5
    }
    
    await chrome.storage.local.set({ [STORAGE_KEY]: updated })
    console.log("[RecommendationConfig] 配置已保存:", updated)
  } catch (error) {
    console.error("[RecommendationConfig] 保存失败:", error)
    throw error
  }
}

/**
 * 检查AI配置状态
 */
export async function checkAIConfigStatus(): Promise<AIConfigStatus> {
  try {
    const aiConfig = await getAIConfig()
    const isConfigured = await isAIConfigured()
    
    // 基础状态
    const status: AIConfigStatus = {
      isConfigured,
      provider: aiConfig.provider,
      isKeyValid: false,
      isAvailable: false,
      hasLocalAI: false,
      budgetStatus: {
        monthlyBudget: aiConfig.monthlyBudget,
        usedAmount: 0, // TODO: 从使用统计中获取
        isOverBudget: false,
        usageRate: 0
      },
      lastChecked: Date.now()
    }
    
    if (!isConfigured) {
      return status
    }
    
    // 检查API密钥格式
    if (aiConfig.provider && aiConfig.apiKey) {
      const { validateApiKey } = await import('./ai-config')
      status.isKeyValid = validateApiKey(aiConfig.provider, aiConfig.apiKey)
    }
    
    // 检查AI服务可用性（仅在密钥格式正确时）
    if (status.isKeyValid) {
      try {
        await aiManager.initialize()
        const testResult = await aiManager.testConnection()
        status.isAvailable = testResult.success
        if (!testResult.success) {
          status.error = testResult.message
        }
      } catch (error) {
        status.isAvailable = false
        status.error = error instanceof Error ? error.message : '连接测试失败'
      }
    }
    
    // 检查本地AI可用性
    const localAIStatus = await checkLocalAIStatus()
    status.hasLocalAI = localAIStatus.availableServices.length > 0
    
    // TODO: 计算预算使用情况
    // const usageStats = await getAIUsageStats()
    // status.budgetStatus.usedAmount = usageStats.totalCost
    // status.budgetStatus.isOverBudget = usageStats.totalCost > aiConfig.monthlyBudget
    // status.budgetStatus.usageRate = usageStats.totalCost / aiConfig.monthlyBudget
    
    return status
    
  } catch (error) {
    console.error("[RecommendationConfig] AI配置检查失败:", error)
    return {
      isConfigured: false,
      provider: null,
      isKeyValid: false,
      isAvailable: false,
      hasLocalAI: false,
      budgetStatus: {
        monthlyBudget: 5,
        usedAmount: 0,
        isOverBudget: false,
        usageRate: 0
      },
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : '检查失败'
    }
  }
}

/**
 * 检查本地AI服务状态
 */
export async function checkLocalAIStatus(): Promise<LocalAIStatus> {
  const status: LocalAIStatus = {
    hasOllama: false,
    hasChromeAI: false,
    availableServices: []
  }
  
  try {
    // 检查Chrome AI
    if (typeof window !== 'undefined' && 'ai' in window) {
      const ai = (window as any).ai
      if (ai && 'languageModel' in ai) {
        try {
          const capabilities = await ai.languageModel.capabilities()
          if (capabilities && capabilities.available === 'readily') {
            status.hasChromeAI = true
            status.availableServices.push('chrome-ai')
          }
        } catch (error) {
          console.warn("[LocalAI] Chrome AI检查失败:", error)
        }
      }
    }
    
    // 检查Ollama（通过尝试连接本地端口）
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3秒超时
      })
      
      if (response.ok) {
        status.hasOllama = true
        status.availableServices.push('ollama')
      }
    } catch (error) {
      // Ollama不可用，这是正常的
      console.log("[LocalAI] Ollama未检测到（正常）")
    }
    
  } catch (error) {
    console.error("[LocalAI] 本地AI检查失败:", error)
  }
  
  return status
}

/**
 * 获取AI配置推荐设置
 * 根据当前AI配置状态，推荐最佳的推荐配置
 */
export async function getRecommendedSettings(): Promise<{
  config: Partial<RecommendationConfig>
  reason: string
  priority: 'high' | 'medium' | 'low'
}> {
  const aiStatus = await checkAIConfigStatus()
  const localAIStatus = await checkLocalAIStatus()
  
  // 如果AI配置可用且预算充足，建议开启推理模式
  if (aiStatus.isAvailable && !aiStatus.budgetStatus.isOverBudget) {
    return {
      config: {
        useReasoning: aiStatus.budgetStatus.usageRate < 0.8, // 使用率<80%时推荐
        useLocalAI: false
      },
      reason: aiStatus.budgetStatus.usageRate < 0.8 
        ? '你的AI配置正常且预算充足，推荐开启推理模式获得更好的推荐质量'
        : 'AI配置正常，但预算使用较多，建议关闭推理模式控制成本',
      priority: 'medium'
    }
  }
  
  // 如果远程AI不可用但有本地AI，推荐使用本地AI
  if (!aiStatus.isAvailable && localAIStatus.availableServices.length > 0) {
    return {
      config: {
        useReasoning: false,
        useLocalAI: true
      },
      reason: `检测到${localAIStatus.availableServices.join('、')}可用，推荐使用本地AI保护隐私`,
      priority: 'high'
    }
  }
  
  // 默认建议：使用TF-IDF算法
  return {
    config: {
      useReasoning: false,
      useLocalAI: false
    },
    reason: aiStatus.error 
      ? `AI配置异常（${aiStatus.error}），建议使用纯算法推荐`
      : '暂无AI配置，使用高效的TF-IDF算法推荐',
    priority: 'low'
  }
}

/**
 * 智能配置调整
 * 根据AI状态自动调整推荐配置
 */
export async function autoAdjustConfig(): Promise<{
  adjusted: boolean
  changes: string[]
  newConfig: RecommendationConfig
}> {
  const currentConfig = await getRecommendationConfig()
  const recommended = await getRecommendedSettings()
  const changes: string[] = []
  let adjusted = false
  
  const newConfig = { ...currentConfig }
  
  // 检查是否需要调整推理模式
  if (recommended.config.useReasoning !== undefined && 
      currentConfig.useReasoning !== recommended.config.useReasoning) {
    newConfig.useReasoning = recommended.config.useReasoning
    changes.push(`推理模式: ${currentConfig.useReasoning ? '开启' : '关闭'} → ${newConfig.useReasoning ? '开启' : '关闭'}`)
    adjusted = true
  }
  
  // 检查是否需要调整本地AI
  if (recommended.config.useLocalAI !== undefined && 
      currentConfig.useLocalAI !== recommended.config.useLocalAI) {
    newConfig.useLocalAI = recommended.config.useLocalAI
    changes.push(`本地AI: ${currentConfig.useLocalAI ? '开启' : '关闭'} → ${newConfig.useLocalAI ? '开启' : '关闭'}`)
    adjusted = true
  }
  
  // 如果有调整，保存新配置
  if (adjusted) {
    await saveRecommendationConfig(newConfig)
    console.log("[RecommendationConfig] 自动调整完成:", changes)
  }
  
  return {
    adjusted,
    changes,
    newConfig
  }
}

/**
 * 监听配置变化
 */
export function watchRecommendationConfig(
  callback: (config: RecommendationConfig) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      const newConfig = {
        ...DEFAULT_CONFIG,
        ...(changes[STORAGE_KEY].newValue as RecommendationConfig)
      }
      callback(newConfig)
    }
  }

  chrome.storage.onChanged.addListener(listener)

  // 返回取消监听函数
  return () => {
    chrome.storage.onChanged.removeListener(listener)
  }
}