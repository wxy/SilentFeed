/**
 * 推荐系统配置
 * Phase 6: AI 推荐引擎
 * 
 * 设计理念：
 * - 默认使用全文分析（后台异步，时效性要求不高）
 * - 用户只需选择成本相关（推理模式）和隐私相关（本地AI）的选项
 * - 推荐数量由系统根据用户行为自动调整
 */

import { getAIConfig, isAIConfigured, validateApiKey, type AIProviderType } from './ai-config'
import { resolveProvider } from '@/utils/ai-provider-resolver'
import { aiManager } from '../core/ai/AICapabilityManager'
import { logger } from '@/utils/logger'
import type { RecommendationAnalysisEngine, FeedAnalysisEngine } from '@/types/analysis-engine'
import { getAIAnalysisStats } from './db/index'
import { listLocalModels } from '@/utils/local-ai-endpoint'

const configLogger = logger.withTag('RecommendationConfig')
const localAILogger = logger.withTag('LocalAI')

const STORAGE_KEY = "recommendationConfig"  // 统一使用 camelCase

/**
 * 推荐配置接口
 */
export interface RecommendationConfig {
  /** 
   * Phase 9: 推荐系统分析引擎选择
   * - remoteAI: 远程 AI（标准模式，平衡成本和质量）
   * - remoteAIWithReasoning: 远程 AI 推理模式（成本更高但质量更好）
   * - localAI: 本地 AI（隐私保护但消耗性能）
   * - keyword: 纯关键字（最快，无成本）
   */
  analysisEngine: RecommendationAnalysisEngine
  
  /**
   * Phase 9: 订阅源分析引擎选择（不包含推理模式）
   * - remoteAI: 远程 AI（标准模式）
   * - localAI: 本地 AI
   * - keyword: 纯关键字
   */
  feedAnalysisEngine: FeedAnalysisEngine
  
  /** @deprecated Phase 9: 使用 analysisEngine 替代 */
  useReasoning: boolean
  
  /** @deprecated Phase 9: 使用 analysisEngine 替代 */
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
  analysisEngine: 'remoteAI', // Phase 9: 推荐系统默认使用远程 AI 标准模式
  feedAnalysisEngine: 'remoteAI', // Phase 9: 订阅源默认使用远程 AI
  useReasoning: false, // @deprecated 向后兼容
  useLocalAI: false,   // @deprecated 向后兼容
  maxRecommendations: 3, // 初始值3条，后续自动调整
  batchSize: 1, // Phase 6: 默认每次处理 1 篇文章（避免超时）
  qualityThreshold: 0.8, // Phase 9: 提高质量阈值到 0.8，实施激进质量控制（过滤 50-60% 低质量）
  tfidfThreshold: 0.001 // 降低阈值，允许更多文章进入 AI 分析（TF-IDF 用于初筛，不应过于严格）
}

/**
 * 获取推荐配置
 */
export async function getRecommendationConfig(): Promise<RecommendationConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY)
    const config = result[STORAGE_KEY] as RecommendationConfig | undefined
    
    const merged = {
      ...DEFAULT_CONFIG,
      ...config
    }
    
    // Phase 9: 数据迁移 - 从旧字段迁移到 analysisEngine
    let needsUpdate = false
    
    // 如果没有 analysisEngine 字段，根据旧字段推导
    if (!merged.analysisEngine) {
      if (merged.useLocalAI) {
        merged.analysisEngine = 'localAI'
      } else if (merged.useReasoning) {
        merged.analysisEngine = 'remoteAIWithReasoning'
      } else {
        merged.analysisEngine = 'remoteAI'
      }
      configLogger.info(`数据迁移: useLocalAI=${merged.useLocalAI}, useReasoning=${merged.useReasoning} → analysisEngine=${merged.analysisEngine}`)
      needsUpdate = true
    }
    
    // Phase 6: 强制更新旧配置（兼容性迁移）
    
    // 如果 qualityThreshold 是旧的默认值，更新为新的 0.7
    if (merged.qualityThreshold === 0.8 || merged.qualityThreshold === 0.6) {
      configLogger.info(`检测到旧配置 qualityThreshold=${merged.qualityThreshold}，更新为 0.7`)
      merged.qualityThreshold = 0.7
      needsUpdate = true
    }
    
    // 移除旧的 tfidfThreshold 自动升级逻辑（允许低阈值以便 AI 做最终筛选）
    // 如果用户明确设置了低阈值，应该尊重用户选择
    
    // 自动保存更新后的配置
    if (needsUpdate) {
      await chrome.storage.sync.set({ [STORAGE_KEY]: merged })
      configLogger.info('配置已自动更新')
    }
    
    return merged
  } catch (error) {
    configLogger.error('加载失败:', error)
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
    
    await chrome.storage.sync.set({ [STORAGE_KEY]: updated })
    configLogger.debug("配置已保存:", updated)
  } catch (error) {
    configLogger.error("保存失败:", error)
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
    
    // 获取使用统计
    const aiStats = await getAIAnalysisStats()
    
    // 根据配置的提供商选择对应的成本（从 engineAssignment.articleAnalysis 读取）
    let usedAmount = 0
    const articleProvider = aiConfig.engineAssignment?.articleAnalysis?.provider
    // 解析抽象 provider 类型（"remote" → "deepseek"）
    const resolvedProvider = articleProvider ? resolveProvider(articleProvider, aiConfig) : null
    const actualProvider = resolvedProvider && resolvedProvider !== 'ollama' ? resolvedProvider as AIProviderType : null
    if (actualProvider) {
      // DeepSeek 使用 CNY，其他使用 USD
      usedAmount = actualProvider === 'deepseek' ? aiStats.totalCostCNY : aiStats.totalCostUSD
    }
    
    // 基础状态
    const status: AIConfigStatus = {
      isConfigured,
      provider: actualProvider,
      isKeyValid: false,
      isAvailable: false,
      hasLocalAI: false,
      budgetStatus: {
        monthlyBudget: aiConfig.monthlyBudget,
        usedAmount,
        isOverBudget: usedAmount > aiConfig.monthlyBudget,
        usageRate: usedAmount / aiConfig.monthlyBudget
      },
      lastChecked: Date.now()
    }
    
    if (!isConfigured) {
      return status
    }
    
    // 检查API密钥格式（使用 providers 结构）
    if (actualProvider) {
      const providerConfig = aiConfig.providers[actualProvider]
      if (providerConfig?.apiKey) {
        status.isKeyValid = validateApiKey(actualProvider, providerConfig.apiKey)
      }
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
    status.hasLocalAI = localAIStatus.availableServices.length > 0 || !!aiConfig.local?.enabled
    
    return status
    
  } catch (error) {
    configLogger.error("AI配置检查失败:", error)
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
          localAILogger.warn("Chrome AI检查失败:", error)
        }
      }
    }
    
    // 检查Ollama（根据当前配置或默认地址）
    try {
      const aiConfig = await getAIConfig()
      const localConfig = aiConfig.local
      const endpoint = localConfig?.endpoint || 'http://localhost:11434/v1'
      const apiKey = localConfig?.apiKey
      const result = await listLocalModels(endpoint, apiKey)

      if (result.models.length > 0) {
        status.hasOllama = true
        status.availableServices.push('ollama')
      }
    } catch (error) {
      // Ollama 未安装是正常情况，静默处理
    }
    
  } catch (error) {
    localAILogger.error("本地AI检查失败:", error)
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
    configLogger.info("自动调整完成:", changes)
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