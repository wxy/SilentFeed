/**
 * AI Capability Manager
 * 
 * 管理 AI Provider 的选择、降级和错误处理
 * 
 * 策略：
 * 1. 优先使用用户配置的 AI Provider（如果可用）
 * 2. AI 失败时自动降级到关键词分析
 * 3. 记录成本和使用情况
 * 
 * Phase 6: 使用统一的 DeepSeekProvider，根据 useReasoning 参数动态切换模型
 */

import type {
  AIProvider,
  UnifiedAnalysisResult,
  AnalyzeOptions,
  RecommendationReasonRequest,
  RecommendationReasonResult,
  UserProfileGenerationRequest,
  UserProfileGenerationResult
} from "@/types/ai"
import type { SourceAnalysisResult } from "@/core/ai/prompts/types"
import { normalizeCategoryToKey, normalizeLanguageCode } from "@/types/feed-category"
import { DeepSeekProvider } from "./providers/DeepSeekProvider"
import { OpenAIProvider } from "./providers/OpenAIProvider"
import { FallbackKeywordProvider } from "./providers/FallbackKeywordProvider"
import { OllamaProvider } from "./providers/OllamaProvider"
import { getAIConfig, getEngineAssignment, type AIProviderType, type LocalAIConfig } from "@/storage/ai-config"
import type { AIEngineAssignment } from "@/types/ai-engine-assignment"
import { logger, isNetworkError } from '../../utils/logger'
import { AIUsageTracker } from './AIUsageTracker'
import { BudgetChecker } from './BudgetChecker'
import { canMakeAICall, shouldDowngradeToKeyword } from '@/utils/budget-utils'
import { CostCalculatorFactory } from './CostCalculator'

// 创建带标签的 logger
const aiLogger = logger.withTag('AICapabilityManager')

type ProviderSelectionMode = "auto" | "remote" | "local"

/**
 * AI 任务类型
 * Phase 8: 根据任务类型选择不同的 AI 引擎
 */
export type AITaskType = "pageAnalysis" | "articleAnalysis" | "profileGeneration" | "sourceAnalysis"

export class AICapabilityManager {
  private remoteProvider: AIProvider | null = null
  private localProvider: AIProvider | null = null
  private fallbackProvider: FallbackKeywordProvider
  /** Phase 8: AI 引擎分配配置 */
  private engineAssignment: AIEngineAssignment | null = null
  /** Phase 12: 缓存的 AI 配置（用于解析 Provider 偏好） */
  private cachedPreferredRemoteProvider: "deepseek" | "openai" = "deepseek"
  private cachedPreferredLocalProvider: "ollama" = "ollama"
  
  constructor() {
    this.fallbackProvider = new FallbackKeywordProvider()
  }
  
  /**
   * 初始化（加载配置）
   * Phase 11: 从 providers 和 engineAssignment 读取配置
   * Phase 12: 缓存 Provider 偏好设置
   */
  async initialize(): Promise<void> {
    try {
      const config = await getAIConfig()
      
      // Phase 12: 缓存 Provider 偏好设置（用于解析 remote/local 抽象类型）
      this.cachedPreferredRemoteProvider = config.preferredRemoteProvider || "deepseek"
      this.cachedPreferredLocalProvider = config.preferredLocalProvider || "ollama"
      
      // Phase 11: 从 engineAssignment 确定需要初始化哪些 Provider
      try {
        this.engineAssignment = await getEngineAssignment()
      } catch (error) {
        this.engineAssignment = null
      }
      
      // Phase 12: 解析抽象 Provider 类型，收集实际需要初始化的 Provider
      const usedProviders = new Set<AIProviderType>()
      let usesLocalProvider = false
      
      if (this.engineAssignment) {
        const tasks: AITaskType[] = ['pageAnalysis', 'articleAnalysis', 'profileGeneration']
        for (const task of tasks) {
          const providerType = this.engineAssignment[task]?.provider
          if (!providerType) continue
          
          // 解析抽象类型
          const resolvedType = await this.resolveProviderType(providerType)
          
          if (resolvedType === 'ollama') {
            usesLocalProvider = true
          } else if (resolvedType === 'deepseek' || resolvedType === 'openai') {
            usedProviders.add(resolvedType as AIProviderType)
          }
        }
      }
      
      // Phase 11: 初始化远程 Provider（如果有任务使用）
      if (usedProviders.size > 0) {
        // 优先使用 DeepSeek（支持推理）
        if (usedProviders.has('deepseek') && config.providers?.deepseek?.apiKey) {
          await this.initializeRemoteProvider(
            true, // 不再检查 enabled
            'deepseek',
            config.providers.deepseek.apiKey,
            config.providers.deepseek.model || 'deepseek-chat',
            config.providers.deepseek.timeoutMs,
            config.providers.deepseek.reasoningTimeoutMs
          )
        } else if (usedProviders.has('openai') && config.providers?.openai?.apiKey) {
          await this.initializeRemoteProvider(
            true,
            'openai',
            config.providers.openai.apiKey,
            config.providers.openai.model || 'gpt-4o-mini',
            config.providers.openai.timeoutMs,
            config.providers.openai.reasoningTimeoutMs
          )
        } else {
          // 没有有效的远程 Provider 配置
          aiLogger.warn("⚠️ Remote provider required but not configured")
          this.remoteProvider = null
        }
      } else {
        // 没有任务使用远程 Provider
        this.remoteProvider = null
      }
      
      // Phase 12: 使用解析后的 usesLocalProvider 变量（已考虑 remote/local 抽象）
      // 检查配置完整性（而非 enabled 字段）
      const hasValidLocalConfig = config.local?.endpoint && config.local?.model
      
      if (usesLocalProvider && hasValidLocalConfig) {
        await this.initializeLocalProvider(config.local)
      } else {
        this.localProvider = null
      }
    } catch (error) {
      aiLogger.error("❌ Initialization failed:", error)
      this.remoteProvider = null
      this.localProvider = null
    }
  }
  
  /**
   * 分析内容
   * Phase 8: 支持按任务类型路由到指定引擎
   * 
   * @param content - 要分析的内容
   * @param options - 分析选项
   * @param taskType - 任务类型（用于引擎路由），如果不提供则使用旧的 mode 参数
   * @param mode - 旧的 provider 选择模式（向后兼容）
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions,
    taskType?: AITaskType,
    mode: ProviderSelectionMode = "auto"
  ): Promise<UnifiedAnalysisResult> {
    // 预算检查：如果超预算，直接降级到关键词
    const shouldDowngrade = await BudgetChecker.shouldDowngrade()
    if (shouldDowngrade) {
      aiLogger.warn("⚠️ 月度预算已超支，使用关键词分析模式")
      return await this.fallbackProvider.analyzeContent(content, options)
    }
    
    // Phase 8: 如果提供了 taskType，使用新的任务路由逻辑
    if (taskType) {
      const { provider, useReasoning } = await this.getProviderForTask(taskType)
      
      if (provider) {
        // Phase 12.4: 检查预算状态
        const budgetAllowed = await this.checkProviderBudget(provider.name)
        if (!budgetAllowed) {
          aiLogger.warn(`⚠️ 预算超限，降级到关键词分析（${taskType}）`)
          return await this.fallbackProvider.analyzeContent(content, options)
        }
        
        try {
          const mergedOptions: AnalyzeOptions = {
            ...options,
            // Phase 9.2: 配置优先级 - 仅使用任务级配置（移除 options?.useReasoning 旧逻辑）
            useReasoning: useReasoning ?? false
          }
          
          const result = await provider.analyzeContent(content, mergedOptions)
          this.recordUsage(result)
          return result
        } catch (error) {
          // 网络错误使用 warn 级别，避免误导用户
          if (isNetworkError(error)) {
            aiLogger.warn(`⚠️ Provider ${provider.name} 暂时不可用（${taskType}），使用降级方案`, error)
          } else {
            aiLogger.error(`❌ Provider ${provider.name} failed for ${taskType}`, error)
          }
          return await this.fallbackProvider.analyzeContent(content, options)
        }
      } else {
        aiLogger.warn(`⚠️ No provider available for ${taskType}, using fallback`)
        return await this.fallbackProvider.analyzeContent(content, options)
      }
    }

    // 向后兼容：没有提供 taskType 时使用旧的 mode 逻辑
    const providers = await this.getProviderChain(mode)
    for (const provider of providers) {
      // Phase 12.4: 检查预算状态
      const budgetAllowed = await this.checkProviderBudget(provider.name)
      if (!budgetAllowed) {
        aiLogger.warn(`⚠️ 预算超限，跳过 ${provider.name}`)
        continue // 尝试下一个 provider
      }
      
      try {
        const result = await provider.analyzeContent(content, options)
        this.recordUsage(result)
        return result
      } catch (error) {
        if (isNetworkError(error)) {
          aiLogger.warn(`⚠️ Provider ${provider.name} 暂时不可用，尝试下一个选项`, error)
        } else {
          aiLogger.error(`❌ Provider ${provider.name} failed, trying next option`, error)
        }
      }
    }

    return await this.fallbackProvider.analyzeContent(content, options)
  }

  /**
   * Phase 8: 生成用户画像
   * 
   * 基于用户行为数据生成语义化的用户兴趣画像
   * Phase 8: 使用 profileGeneration 任务配置
   * 
   * @param request - 用户画像生成请求
   * @param mode - 旧的 provider 选择模式（向后兼容，优先使用任务配置）
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest,
    mode: ProviderSelectionMode = "auto"
  ): Promise<UserProfileGenerationResult> {
    // 预算检查：如果超预算，直接返回降级结果
    const shouldDowngrade = await BudgetChecker.shouldDowngrade()
    if (shouldDowngrade) {
      aiLogger.warn("⚠️ 月度预算已超支，跳过画像生成")
      return {
        interests: "",
        preferences: [],
        avoidTopics: [],
        metadata: {
          provider: "keyword",
          model: "fallback",
          timestamp: Date.now(),
          basedOn: {
            browses: 0,
            reads: 0,
            dismisses: 0
          }
        }
      }
    }
    
    // Phase 8: 优先使用 profileGeneration 任务配置
    const { provider: taskProvider, useReasoning } = await this.getProviderForTask("profileGeneration")
    
    if (taskProvider && taskProvider.generateUserProfile) {
      // Phase 12.4: 检查预算状态
      const budgetAllowed = await this.checkProviderBudget(taskProvider.name)
      if (!budgetAllowed) {
        aiLogger.warn(`⚠️ 预算超限，降级到关键词分析（profile generation）`)
        // 直接跳到降级逻辑
      } else {
        try {
          // 检查是否支持 useReasoning 参数（BaseAIService 类型）
          // DeepSeekProvider、OpenAIProvider、OllamaProvider 继承自 BaseAIService
          const isBaseAI = taskProvider.name !== "Fallback Keyword Provider"
          const result = isBaseAI
            ? await (taskProvider as any).generateUserProfile(request, { useReasoning })
            : await taskProvider.generateUserProfile(request)
          if (result.metadata.tokensUsed) {
          }
          return result
        } catch (error) {
          // 网络错误使用 warn 级别
          if (isNetworkError(error)) {
            aiLogger.warn(`⚠️ Provider ${taskProvider.name} 暂时不可用（profile generation），使用降级方案`, error)
          } else {
            aiLogger.error(`❌ Provider ${taskProvider.name} failed for profile generation`, error)
          }
          // 继续尝试降级逻辑
        }
      }
    }

    // 降级逻辑：使用旧的 mode 参数
    const providers = await this.getProviderChain(mode)
    for (const provider of providers) {
      if (!provider.generateUserProfile) {
        continue
      }
      
      // Phase 12.4: 检查预算状态
      const budgetAllowed = await this.checkProviderBudget(provider.name)
      if (!budgetAllowed) {
        aiLogger.warn(`⚠️ 预算超限，跳过 ${provider.name}`)
        continue
      }

      try {
        aiLogger.info(`🔄 Generating user profile with: ${provider.name}`)
        const result = await provider.generateUserProfile(request)
        if (result.metadata.tokensUsed) {
          aiLogger.debug('✅ Tokens used:', result.metadata.tokensUsed)
        }
        return result
      } catch (error) {
        if (isNetworkError(error)) {
          aiLogger.warn(`⚠️ Provider ${provider.name} 暂时不可用（profile generation），尝试下一个选项`, error)
        } else {
          aiLogger.error(`❌ Provider ${provider.name} failed for profile generation`, error)
        }
      }
    }

    // Fallback 逻辑
    if (this.fallbackProvider.generateUserProfile) {
      return await this.fallbackProvider.generateUserProfile(request)
    }
    
    aiLogger.warn("⚠️ 无可用 AI，使用关键词提取")
    const topKeywords = request.topKeywords.slice(0, 10).map(k => k.word)
    
    return {
      interests: topKeywords.length > 0 
        ? `对 ${topKeywords.join('、')} 等主题感兴趣`
        : '正在学习您的兴趣偏好',
      preferences: ['技术文章', '新闻资讯', '深度分析'],
      avoidTopics: [],
      metadata: {
        provider: 'keyword',
        model: 'keyword-v1',
        timestamp: Date.now(),
        // Phase 8.2: 使用真实的总数而非数组长度
        basedOn: {
          browses: request.totalCounts?.browses || 0,
          reads: request.totalCounts?.reads || 0,
          dismisses: request.totalCounts?.dismisses || 0
        }
      }
    }
  }

  /**
   * 订阅源质量分析
   * 
   * 分析 RSS 订阅源的质量和分类，使用 sourceAnalysis 任务配置
   * 
   * @param prompt - 完整的分析提示词（由 PromptManager 生成）
   * @returns 解析后的分析结果
   */
  async analyzeSource(prompt: string): Promise<SourceAnalysisResult> {
    // 预算检查
    const shouldDowngrade = await BudgetChecker.shouldDowngrade()
    if (shouldDowngrade) {
      aiLogger.warn("⚠️ 月度预算已超支，返回默认订阅源分析结果")
      return this.getDefaultSourceAnalysisResult()
    }

    // 获取 sourceAnalysis 任务配置的 provider
    const { provider, useReasoning } = await this.getProviderForTask('sourceAnalysis' as AITaskType)
    
    if (!provider) {
      aiLogger.warn("⚠️ 无可用 AI Provider，返回默认订阅源分析结果")
      return this.getDefaultSourceAnalysisResult()
    }

    // 检查预算
    const budgetAllowed = await this.checkProviderBudget(provider.name)
    if (!budgetAllowed) {
      aiLogger.warn("⚠️ 预算超限，返回默认订阅源分析结果")
      return this.getDefaultSourceAnalysisResult()
    }

    try {
      // 调用 AI，使用 analyzeContent 但我们需要解析原始响应
      const result = await provider.analyzeContent(prompt, {
        purpose: 'analyze-source',
        useReasoning
      })
      
      // 记录用量
      this.recordUsage(result)
      
      // 尝试从 AI 响应中解析订阅源分析结果
      // AI 应该返回包含我们需要字段的 JSON
      return this.parseSourceAnalysisFromAIResult(result)
    } catch (error) {
      if (isNetworkError(error)) {
        aiLogger.warn("⚠️ AI 服务暂时不可用，返回默认订阅源分析结果", error)
      } else {
        aiLogger.error("❌ 订阅源分析失败:", error)
      }
      return this.getDefaultSourceAnalysisResult()
    }
  }

  /**
   * 从 AI 分析结果中解析订阅源分析数据
   * 
   * 使用标准化函数将 AI 返回的分类和语言转换为标准 key
   */
  private parseSourceAnalysisFromAIResult(result: UnifiedAnalysisResult): SourceAnalysisResult {
    // 尝试从 summary 中解析详细的分析结果（新格式）
    let parsedSummary: {
      category?: string
      secondaryCategory?: string
      language?: string
      originality?: number
      informationDensity?: number
      clickbaitScore?: number
      spamScore?: number
      reasoning?: string
    } | null = null
    
    aiLogger.debug('解析订阅源分析结果:', { 
      hasSummary: !!result.summary, 
      summaryPreview: result.summary?.substring(0, 200) 
    })
    
    if (result.summary) {
      try {
        parsedSummary = JSON.parse(result.summary)
        aiLogger.debug('解析 summary JSON 成功:', { 
          category: parsedSummary?.category,
          language: parsedSummary?.language,
          hasOriginality: typeof parsedSummary?.originality === 'number'
        })
      } catch (e) {
        // summary 不是 JSON，使用旧逻辑
        aiLogger.debug('summary 不是有效 JSON，使用旧逻辑:', { error: String(e) })
      }
    }
    
    // 从 topicProbabilities 提取主题标签（取概率最高的几个）
    const topics = Object.entries(result.topicProbabilities || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic)
    
    // 主分类：优先使用 parsedSummary 中的 category，否则使用 topicProbabilities 中概率最高的
    const rawCategory = parsedSummary?.category || topics[0] || 'other'
    const mainCategory = normalizeCategoryToKey(rawCategory)
    
    // 次要分类
    const secondaryCategory = parsedSummary?.secondaryCategory 
      ? normalizeCategoryToKey(parsedSummary.secondaryCategory)
      : undefined
    
    // 语言检测
    const rawLanguage = parsedSummary?.language
    const language = normalizeLanguageCode(rawLanguage)
    aiLogger.debug('语言检测结果:', { 
      rawLanguage, 
      normalizedLanguage: language,
      willInclude: language !== 'unknown'
    })
    
    // 从关键词提取更多标签
    const keywordTags = (result.keywords || [])
      .slice(0, 5)
      .map(k => k.word)
    
    // 合并标签，去重
    const allTags = [...new Set([...topics.slice(1), ...keywordTags])].slice(0, 8)
    
    // 计算质量分数
    let qualityScore: number
    if (parsedSummary && typeof parsedSummary.originality === 'number') {
      // 新格式：基于详细评分计算
      const originality = parsedSummary.originality / 100
      const density = (parsedSummary.informationDensity || 50) / 100
      const clickbait = (parsedSummary.clickbaitScore || 50) / 100
      const spam = (parsedSummary.spamScore || 50) / 100
      
      // 综合评分：原创性和信息密度为正向，标题党和垃圾内容为负向
      qualityScore = Math.min(0.95, Math.max(0.1, 
        originality * 0.3 + density * 0.3 + (1 - clickbait) * 0.2 + (1 - spam) * 0.2
      ))
    } else {
      // 旧格式：基于主题概率计算
      const maxProb = Math.max(...Object.values(result.topicProbabilities || { default: 0.5 }))
      qualityScore = Math.min(0.95, Math.max(0.3, maxProb * 0.7 + 0.3))
    }
    
    // 构建订阅建议
    const advice = parsedSummary?.reasoning || 
      result.summary || 
      `该订阅源主要内容为${mainCategory}，共识别${allTags.length}个相关标签`
    
    return {
      qualityScore,
      contentCategory: mainCategory,
      secondaryCategory,
      topicTags: allTags,
      subscriptionAdvice: advice,
      language: language !== 'unknown' ? language : undefined
    }
  }

  /**
   * 默认订阅源分析结果（降级方案）
   */
  private getDefaultSourceAnalysisResult(): SourceAnalysisResult {
    return {
      qualityScore: 0.5,
      contentCategory: 'other',
      topicTags: [],
      subscriptionAdvice: 'AI 服务暂时不可用，稍后重试'
    }
  }
  
  /**
   * Phase 8: 根据任务类型获取对应的 AI Provider
   * Phase 12: 支持 remote/local 抽象类型解析
   * 
   * 从引擎分配配置中读取指定任务应该使用的引擎，并返回对应的 provider 实例
   * 
   * @param taskType - 任务类型（pageAnalysis/articleAnalysis/profileGeneration）
   * @returns provider 实例和是否使用推理的配置
   */
  private async getProviderForTask(taskType: AITaskType): Promise<{
    provider: AIProvider | null
    useReasoning: boolean
  }> {
    if (!this.engineAssignment) {
      return {
        provider: this.remoteProvider || this.localProvider,
        useReasoning: false
      }
    }

    const engineConfig = this.engineAssignment[taskType]
    if (!engineConfig) {
      aiLogger.warn(`⚠️ No engine config for task: ${taskType}`)
      return {
        provider: this.remoteProvider || this.localProvider,
        useReasoning: false
      }
    }

    const { provider: providerType, useReasoning = false } = engineConfig

    // Phase 12: 解析抽象 provider 类型到具体实现
    const resolvedProviderType = await this.resolveProviderType(providerType)
    
    let provider: AIProvider | null = null

    switch (resolvedProviderType) {
      case "deepseek":
      case "openai":
        provider = this.remoteProvider
        if (!provider) {
          aiLogger.warn(`Remote provider not available for ${resolvedProviderType}, falling back to local`)
          provider = this.localProvider
        }
        break

      case "ollama":
        provider = this.localProvider
        if (!provider) {
          aiLogger.warn(`Local provider not available, falling back to remote`)
          provider = this.remoteProvider
        }
        break

      default:
        aiLogger.error(`Unknown engine type: ${resolvedProviderType}`)
        provider = this.remoteProvider || this.localProvider
    }

    return {
      provider,
      useReasoning: useReasoning ?? false
    }
  }

  /**
   * Phase 12: 解析抽象 Provider 类型到具体实现
   * 
   * 将 "remote"/"local" 解析为具体的 Provider 类型
   * 
   * @param providerType - Provider 类型（可能是抽象的 remote/local）
   * @returns 具体的 Provider 类型
   */
  private async resolveProviderType(providerType: string): Promise<string> {
    switch (providerType) {
      case "remote":
        // 解析为用户首选的远程 Provider
        return this.cachedPreferredRemoteProvider
      
      case "local":
        // 解析为用户首选的本地 Provider
        return this.cachedPreferredLocalProvider
      
      default:
        // 已经是具体类型，直接返回（向后兼容）
        return providerType
    }
  }

  /**
   * 测试连接
   * Phase 11: 从 providers 读取配置
   * Phase 11.2: 支持临时创建 local provider 进行测试
   */
  async testConnection(target: ProviderSelectionMode = "remote", useReasoning: boolean = false): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    let provider = target === "local" ? this.localProvider : this.remoteProvider

    // Phase 11.2: 如果是测试 local 且实例为空，尝试临时创建
    if (!provider && target === "local") {
      const config = await getAIConfig()
      const hasValidLocalConfig = config.local?.endpoint && config.local?.model
      
      if (hasValidLocalConfig) {
        aiLogger.info("🔧 临时创建 OllamaProvider 用于测试连接")
        await this.initializeLocalProvider(config.local!)
        provider = this.localProvider
      }
    }

    if (!provider) {
      // 提供更详细的错误信息，帮助用户诊断问题
      const config = await getAIConfig()
      
      let detailedMessage = target === "local" ? "未配置本地 AI" : "未配置 AI 提供商"
      
      if (target === "remote") {
        // Phase 11: 从 providers 检查配置
        const hasDeepSeek = config.providers?.deepseek?.apiKey
        const hasOpenAI = config.providers?.openai?.apiKey
        
        if (!hasDeepSeek && !hasOpenAI) {
          detailedMessage += "（未设置任何 AI Provider 的 API Key）"
        } else {
          // 有 API Key 但 provider 实例为空，说明初始化失败
          detailedMessage += "（初始化失败，请重新打开设置页面）"
        }
      } else if (target === "local") {
        // Phase 11.2: 检查 local 配置
        const hasLocalConfig = config.local?.endpoint && config.local?.model
        if (!hasLocalConfig) {
          detailedMessage += "（未配置 Ollama endpoint 或模型）"
        } else {
          detailedMessage += "（初始化失败，请检查 Ollama 服务是否运行）"
        }
      }
      
      return {
        success: false,
        message: detailedMessage
      }
    }
    
    return await provider.testConnection(useReasoning)
  }
  
  /**
   * 获取当前使用的 Provider 名称
   */
  getCurrentProviderName(): string {
    if (this.remoteProvider) {
      return this.remoteProvider.name
    }
    if (this.localProvider) {
      return `${this.localProvider.name} (Local)`
    }
    return "Keyword Analysis"
  }
  
  /**
   * 创建 Provider 实例
   */
  private createRemoteProvider(
    type: AIProviderType, 
    apiKey: string, 
    model?: string,
    timeoutMs?: number,
    reasoningTimeoutMs?: number
  ): AIProvider {
    switch (type) {
      case "deepseek":
        // Phase 6: 使用统一的 DeepSeekProvider
        // 它会根据 useReasoning 参数动态选择 deepseek-chat 或 deepseek-reasoner
        return new DeepSeekProvider({ 
          apiKey,
          model: model || "deepseek-chat", // 默认使用 chat 模型
          timeoutMs,
          reasoningTimeoutMs
        })
      
      case "openai":
        return new OpenAIProvider({ 
          apiKey,
          model: model || "gpt-5-mini", // 默认使用 gpt-5-mini
          timeoutMs,
          reasoningTimeoutMs
        })
      
      default:
        throw new Error(`Unknown provider type: ${type}`)
    }
  }

  private createLocalProvider(config: LocalAIConfig): AIProvider {
    switch (config.provider) {
      case "ollama":
      default:
        return new OllamaProvider({
          apiKey: config.apiKey || "ollama",
          endpoint: config.endpoint,
          model: config.model,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          timeoutMs: config.timeoutMs,
          // Phase 11.2: 传递从 Ollama API 获取的推理模型标记
          isReasoningModel: config.isReasoningModel
        })
    }
  }
  
  /**
   * 生成推荐理由
   * Phase 8: 使用 articleAnalysis 任务配置（推荐理由属于文章分析任务）
   */
  async generateRecommendationReason(
    request: RecommendationReasonRequest
  ): Promise<RecommendationReasonResult> {
    try {
      // Phase 8: 使用 articleAnalysis 任务配置
      const { provider: taskProvider, useReasoning } = await this.getProviderForTask("articleAnalysis")
      
      if (taskProvider && taskProvider.generateRecommendationReason) {
        try {
          const result = await taskProvider.generateRecommendationReason(request)
          await this.recordRecommendationUsage(result, useReasoning)  // 传递 useReasoning
          return result
        } catch (error) {
          if (isNetworkError(error)) {
            aiLogger.warn(`⚠️ Provider ${taskProvider.name} 暂时不可用（recommendation reason），使用降级方案`, error)
          } else {
            aiLogger.error(`❌ Provider ${taskProvider.name} failed for recommendation reason`, error)
          }
          // 继续尝试降级逻辑
        }
      }

      // 降级逻辑：使用旧的 auto 模式
      const providers = await this.getProviderChain("auto")
      for (const provider of providers) {
        if (!provider.generateRecommendationReason) {
          continue
        }
        const result = await provider.generateRecommendationReason(request)
        await this.recordRecommendationUsage(result, false)  // 降级模式不使用推理
        return result
      }

      return this.generateKeywordRecommendationReason(request)
    } catch (error) {
      aiLogger.warn(" Provider failed for recommendation:", error)
      return this.generateKeywordRecommendationReason(request)
    }
  }

  /**
   * 关键词降级策略 - 推荐理由生成
   */
  private generateKeywordRecommendationReason(
    request: RecommendationReasonRequest
  ): RecommendationReasonResult {
    const { userInterests, relevanceScore } = request
    
    // 简单的关键词匹配
    const matchedInterests = userInterests.filter(interest => 
      request.articleTitle.toLowerCase().includes(interest.toLowerCase()) ||
      request.articleSummary.toLowerCase().includes(interest.toLowerCase())
    )
    
    let reason = ""
    if (matchedInterests.length > 0) {
      reason = `因为您对${matchedInterests.slice(0, 2).join("、")}感兴趣`
    } else if (relevanceScore > 0.5) {
      reason = "内容质量较高，值得关注"
    } else {
      reason = "可能对您有用的内容"
    }
    
    return {
      reason,
      matchedInterests,
      confidence: Math.min(0.6, relevanceScore),
      metadata: {
        provider: "keyword",
        model: "keyword-fallback",
        timestamp: Date.now()
      }
    }
  }

  /**
   * 记录使用情况
   */
  private recordUsage(result: UnifiedAnalysisResult): void {
    try {
      const { metadata } = result
      
      // 成本已持久化到数据库中的 confirmedVisits.analysis.aiAnalysis
      if (metadata.cost) {
        // Phase 6: 修复日志显示，分别展示输入和输出 token 数
        const promptTokens = metadata.tokensUsed?.prompt || 0
        const completionTokens = metadata.tokensUsed?.completion || 0
        const totalTokens = metadata.tokensUsed?.total || 0
        
        aiLogger.info(
          `成本: ¥${metadata.cost.toFixed(6)} ` +
          `(输入: ${promptTokens} tokens, 输出: ${completionTokens} tokens, 总计: ${totalTokens} tokens)`
        )
      }
    } catch (error) {
      aiLogger.error(" Failed to record usage:", error)
    }
  }

  /**
   * 记录推荐理由使用情况
   */
  private async recordRecommendationUsage(result: RecommendationReasonResult, useReasoning: boolean = false): Promise<void> {
    try {
      const { metadata } = result
      
      if (metadata.tokensUsed) {
        aiLogger.info(
          `推荐理由生成 - tokens: ${metadata.tokensUsed.input + metadata.tokensUsed.output}`
        )
        
        // 转换 provider 类型（anthropic 已弃用，记录为 keyword）
        const usageProvider: 'openai' | 'deepseek' | 'ollama' | 'keyword' = 
          metadata.provider === 'anthropic' ? 'keyword' : metadata.provider
        
        // 使用 CostCalculatorFactory 获取正确的计算器
        const costCalculator = CostCalculatorFactory.getCalculator(usageProvider)
        const costBreakdown = costCalculator.calculateCost(
          {
            input: metadata.tokensUsed.input,
            output: metadata.tokensUsed.output
          },
          metadata.model
        )
        
        // 记录到 AIUsageTracker
        await AIUsageTracker.recordUsage({
          provider: usageProvider,
          model: metadata.model,
          purpose: 'recommend-content',  // 使用推荐内容类型
          tokens: {
            input: metadata.tokensUsed.input,
            output: metadata.tokensUsed.output,
            total: metadata.tokensUsed.total || metadata.tokensUsed.input + metadata.tokensUsed.output,
            estimated: false
          },
          cost: {
            currency: costBreakdown.currency,
            input: costBreakdown.input,
            output: costBreakdown.output,
            total: costBreakdown.total,
            estimated: false
          },
          reasoning: useReasoning,  // 使用传入的推理模式标记
          latency: 0,  // 推荐原因生成没有 latency 记录
          success: true,
          metadata: {
            confidence: result.confidence,
            matchedInterestsCount: result.matchedInterests.length
          }
        })
      }
    } catch (error) {
      aiLogger.error(" Failed to record recommendation usage:", error)
    }
  }

  private async initializeRemoteProvider(
    enabled: boolean,
    providerType: AIProviderType | null | undefined,
    apiKey: string,
    model?: string
  ): Promise<void> {
    if (!providerType) {
      this.remoteProvider = null
      aiLogger.info("No remote provider selected")
      return
    }

    if (!apiKey) {
      aiLogger.warn(` No API key for provider ${providerType}`)
      this.remoteProvider = null
      return
    }

    this.remoteProvider = this.createRemoteProvider(providerType, apiKey, model)
    aiLogger.info(`Remote provider initialized: ${this.remoteProvider.name} (enabled: ${enabled})`)
  }

  private async initializeLocalProvider(localConfig?: LocalAIConfig): Promise<void> {
    // Phase 11.1: 检查配置是否存在，而不是检查 enabled
    // 这样测试连接时（临时保存了 enabled=true 的配置）可以正常初始化
    if (!localConfig?.endpoint || !localConfig?.model) {
      this.localProvider = null
      return
    }

    this.localProvider = this.createLocalProvider(localConfig)
    aiLogger.info(`✅ Local provider initialized: ${this.localProvider.name}`)
  }

  private async getProviderChain(mode: ProviderSelectionMode): Promise<AIProvider[]> {
    const providers: AIProvider[] = []

    if (mode === "remote") {
      const remote = await this.ensureProviderAvailable(this.remoteProvider, "remote")
      if (remote) providers.push(remote)
      return providers
    }

    if (mode === "local") {
      const local = await this.ensureProviderAvailable(this.localProvider, "local")
      if (local) providers.push(local)
      return providers
    }

    const remote = await this.ensureProviderAvailable(this.remoteProvider, "remote")
    if (remote) providers.push(remote)
    const local = await this.ensureProviderAvailable(this.localProvider, "local")
    if (local) providers.push(local)
    return providers
  }

  private async ensureProviderAvailable(provider: AIProvider | null, label: "remote" | "local"): Promise<AIProvider | null> {
    if (!provider) {
      return null
    }
    try {
      const available = await provider.isAvailable()
      if (!available) {
        aiLogger.warn(`⚠️ ${label} provider ${provider.name} not available`)
        return null
      }
      return provider
    } catch (error) {
      aiLogger.error(`❌ Failed to check ${label} provider availability`, error)
      return null
    }
  }
  
  /**
   * Phase 12.4: 检查 provider 的预算状态
   * 
   * @param providerName - Provider 名称（如 "DeepSeek", "OpenAI"）
   * @returns 是否允许调用（本地 provider 和 keyword 始终允许）
   */
  private async checkProviderBudget(providerName: string): Promise<boolean> {
    // 本地 AI 和关键词分析不受预算限制
    if (providerName === "Ollama" || providerName === "Keyword") {
      return true
    }
    
    // 解析 provider 类型
    const providerType = this.parseProviderType(providerName)
    if (!providerType) {
      // 无法解析的 provider，默认允许（保守处理）
      return true
    }
    
    try {
      // 检查预算状态（不考虑预估成本，仅检查当前状态）
      const budgetStatus = await canMakeAICall(providerType, 0)
      
      if (!budgetStatus.allowed) {
        aiLogger.warn(`🚫 预算已超限 - ${providerName}`, {
          reason: budgetStatus.reason,
          budget: `$${budgetStatus.budget.used.toFixed(2)}/$${budgetStatus.budget.limit === 0 ? '无限制' : budgetStatus.budget.limit}`
        })
        return false
      }
      
      // 如果接近预算上限（>=80%），给出警告
      const shouldDowngrade = await shouldDowngradeToKeyword(providerType)
      if (shouldDowngrade) {
        aiLogger.warn(`⚠️ 预算接近上限 - ${providerName}`, {
          usage: `${(budgetStatus.budget.usageRate * 100).toFixed(1)}%`
        })
      }
      
      return true
    } catch (error) {
      aiLogger.error("检查预算时出错:", error)
      // 发生错误时保守处理 - 允许调用
      return true
    }
  }
  
  /**
   * 从 provider 名称解析 provider 类型
   * 
   * @param providerName - Provider 名称（如 "DeepSeek", "OpenAI"）
   * @returns Provider 类型或 null
   */
  private parseProviderType(providerName: string): AIProviderType | null {
    const lowerName = providerName.toLowerCase()
    
    if (lowerName.includes('deepseek')) {
      return 'deepseek'
    }
    if (lowerName.includes('openai') || lowerName.includes('gpt')) {
      return 'openai'
    }
    
    return null
  }
}

/**
 * 全局单例
 */
export const aiManager = new AICapabilityManager()
