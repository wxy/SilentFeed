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
import { DeepSeekProvider } from "./providers/DeepSeekProvider"
import { OpenAIProvider } from "./providers/OpenAIProvider"
import { FallbackKeywordProvider } from "./providers/FallbackKeywordProvider"
import { OllamaProvider } from "./providers/OllamaProvider"
import { getAIConfig, getEngineAssignment, type AIProviderType, type LocalAIConfig } from "@/storage/ai-config"
import type { AIEngineAssignment } from "@/types/ai-engine-assignment"
import { logger } from '../../utils/logger'
import { AIUsageTracker } from './AIUsageTracker'

// 创建带标签的 logger
const aiLogger = logger.withTag('AICapabilityManager')

type ProviderSelectionMode = "auto" | "remote" | "local"

/**
 * AI 任务类型
 * Phase 8: 根据任务类型选择不同的 AI 引擎
 */
export type AITaskType = "pageAnalysis" | "feedAnalysis" | "profileGeneration"

export class AICapabilityManager {
  private remoteProvider: AIProvider | null = null
  private localProvider: AIProvider | null = null
  private fallbackProvider: FallbackKeywordProvider
  /** Phase 8: AI 引擎分配配置 */
  private engineAssignment: AIEngineAssignment | null = null
  
  constructor() {
    this.fallbackProvider = new FallbackKeywordProvider()
  }
  
  /**
   * 初始化（加载配置）
   * Phase 11: 从 providers 和 engineAssignment 读取配置
   */
  async initialize(): Promise<void> {
    try {
      const config = await getAIConfig()
      
      // Phase 11: 从 engineAssignment 确定需要初始化哪些 Provider
      try {
        this.engineAssignment = await getEngineAssignment()
      } catch (error) {
        this.engineAssignment = null
      }
      
      // 收集所有任务使用的 Provider
      const usedProviders = new Set<AIProviderType>()
      if (this.engineAssignment) {
        const tasks: AITaskType[] = ['pageAnalysis', 'feedAnalysis', 'profileGeneration']
        for (const task of tasks) {
          const providerType = this.engineAssignment[task]?.provider
          if (providerType && providerType !== 'ollama') {
            usedProviders.add(providerType as AIProviderType)
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
            config.providers.deepseek.model || 'deepseek-chat'
          )
        } else if (usedProviders.has('openai') && config.providers?.openai?.apiKey) {
          await this.initializeRemoteProvider(
            true,
            'openai',
            config.providers.openai.apiKey,
            config.providers.openai.model || 'gpt-4o-mini'
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
      
      // Phase 11.1 回滚修复: 初始化本地 AI（如果有任务使用 ollama 且配置完整）
      const usesOllama = this.engineAssignment && 
        (['pageAnalysis', 'feedAnalysis', 'profileGeneration'] as AITaskType[]).some(
          task => this.engineAssignment![task]?.provider === 'ollama'
        )
      
      // 检查配置完整性（而非 enabled 字段）
      const hasValidLocalConfig = config.local?.endpoint && config.local?.model
      
      if (usesOllama && hasValidLocalConfig) {
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
    // Phase 8: 如果提供了 taskType，使用新的任务路由逻辑
    if (taskType) {
      const { provider, useReasoning } = await this.getProviderForTask(taskType)
      
      if (provider) {
        try {
          const mergedOptions: AnalyzeOptions = {
            ...options,
            useReasoning: useReasoning || options?.useReasoning || false
          }
          
          const result = await provider.analyzeContent(content, mergedOptions)
          this.recordUsage(result)
          return result
        } catch (error) {
          aiLogger.error(`❌ Provider ${provider.name} failed for ${taskType}`, error)
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
      try {
        const result = await provider.analyzeContent(content, options)
        this.recordUsage(result)
        return result
      } catch (error) {
        aiLogger.error(` Provider ${provider.name} failed, trying next option`, error)
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
    // Phase 8: 优先使用 profileGeneration 任务配置
    const { provider: taskProvider, useReasoning } = await this.getProviderForTask("profileGeneration")
    
    if (taskProvider && taskProvider.generateUserProfile) {
      try {
        const result = await taskProvider.generateUserProfile(request)
        if (result.metadata.tokensUsed) {
        }
        return result
      } catch (error) {
        aiLogger.error(`❌ Provider ${taskProvider.name} failed for profile generation`, error)
        // 继续尝试降级逻辑
      }
    }

    // 降级逻辑：使用旧的 mode 参数
    const providers = await this.getProviderChain(mode)
    for (const provider of providers) {
      if (!provider.generateUserProfile) {
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
        aiLogger.error(`❌ Provider ${provider.name} failed for profile generation`, error)
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
   * Phase 8: 根据任务类型获取对应的 AI Provider
   * 
   * 从引擎分配配置中读取指定任务应该使用的引擎，并返回对应的 provider 实例
   * 
   * @param taskType - 任务类型（pageAnalysis/feedAnalysis/profileGeneration）
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

    let provider: AIProvider | null = null

    switch (providerType) {
      case "deepseek":
      case "openai":
        provider = this.remoteProvider
        if (!provider) {
          aiLogger.warn(`Remote provider not available for ${providerType}, falling back to local`)
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
        aiLogger.error(`Unknown engine type: ${providerType}`)
        provider = this.remoteProvider || this.localProvider
    }

    return {
      provider,
      useReasoning: useReasoning ?? false
    }
  }

  /**
   * 测试连接
   * Phase 11: 从 providers 读取配置
   */
  async testConnection(target: ProviderSelectionMode = "remote", useReasoning: boolean = false): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    const provider = target === "local" ? this.localProvider : this.remoteProvider

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
  private createRemoteProvider(type: AIProviderType, apiKey: string, model?: string): AIProvider {
    switch (type) {
      case "deepseek":
        // Phase 6: 使用统一的 DeepSeekProvider
        // 它会根据 useReasoning 参数动态选择 deepseek-chat 或 deepseek-reasoner
        return new DeepSeekProvider({ 
          apiKey,
          model: model || "deepseek-chat" // 默认使用 chat 模型
        })
      
      case "openai":
        return new OpenAIProvider({ 
          apiKey,
          model: model || "gpt-5-mini" // 默认使用 gpt-5-mini
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
   */
  async generateRecommendationReason(
    request: RecommendationReasonRequest
  ): Promise<RecommendationReasonResult> {
    try {
      const providers = await this.getProviderChain("auto")
      for (const provider of providers) {
        if (!provider.generateRecommendationReason) {
          continue
        }
        const result = await provider.generateRecommendationReason(request)
        await this.recordRecommendationUsage(result)  // 异步记录
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
  private async recordRecommendationUsage(result: RecommendationReasonResult): Promise<void> {
    try {
      const { metadata } = result
      
      if (metadata.tokensUsed) {
        aiLogger.info(
          `推荐理由生成 - tokens: ${metadata.tokensUsed.input + metadata.tokensUsed.output}`
        )
        
        // 记录到 AIUsageTracker
        await AIUsageTracker.recordUsage({
          provider: metadata.provider,
          model: metadata.model,
          purpose: 'recommend-content',  // 使用推荐内容类型
          tokens: {
            input: metadata.tokensUsed.input,
            output: metadata.tokensUsed.output,
            total: metadata.tokensUsed.total || metadata.tokensUsed.input + metadata.tokensUsed.output,
            estimated: false
          },
          cost: {
            input: 0,  // 成本计算由 AIUsageTracker 根据 provider 和 model 自动计算
            output: 0,
            total: 0,
            estimated: true
          },
          latency: 0,  // 推荐理由生成通常很快，这里暂不记录延迟
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
        aiLogger.warn(` ${label} provider ${provider.name} not available`)
        return null
      }
      return provider
    } catch (error) {
      aiLogger.error(` Failed to check ${label} provider availability`, error)
      return null
    }
  }
}

/**
 * 全局单例
 */
export const aiManager = new AICapabilityManager()
