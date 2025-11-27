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
import { getAIConfig, type AIProviderType, type LocalAIConfig } from "@/storage/ai-config"
import { logger } from '../../utils/logger'

// 创建带标签的 logger
const aiLogger = logger.withTag('AICapabilityManager')

type ProviderSelectionMode = "auto" | "remote" | "local"

export class AICapabilityManager {
  private remoteProvider: AIProvider | null = null
  private localProvider: AIProvider | null = null
  private fallbackProvider: FallbackKeywordProvider
  
  constructor() {
    this.fallbackProvider = new FallbackKeywordProvider()
  }
  
  /**
   * 初始化（加载配置）
   */
  async initialize(): Promise<void> {
    try {
      const config = await getAIConfig()
      
      const providerType = config.provider ?? null
      const apiKey = providerType ? (config.apiKeys?.[providerType] || "") : ""
      await this.initializeRemoteProvider(config.enabled, providerType, apiKey, config.model)
      await this.initializeLocalProvider(config.local)
    } catch (error) {
      aiLogger.error(" Initialization failed:", error)
      this.remoteProvider = null
      this.localProvider = null
    }
  }
  
  /**
   * 分析内容
   * 
   * 自动选择最佳 Provider 并处理降级
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions,
    mode: ProviderSelectionMode = "auto"
  ): Promise<UnifiedAnalysisResult> {
    const providers = await this.getProviderChain(mode)
    for (const provider of providers) {
      try {
        aiLogger.info(` Using provider: ${provider.name} (${mode})`)
        const result = await provider.analyzeContent(content, options)
        this.recordUsage(result)
        return result
      } catch (error) {
        aiLogger.error(` Provider ${provider.name} failed, trying next option`, error)
      }
    }

    aiLogger.info(" Using fallback provider: Keyword Analysis")
    return await this.fallbackProvider.analyzeContent(content, options)
  }

  /**
   * Phase 8: 生成用户画像
   * 
   * 基于用户行为数据生成语义化的用户兴趣画像
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest,
    mode: ProviderSelectionMode = "auto"
  ): Promise<UserProfileGenerationResult> {
    const providers = await this.getProviderChain(mode)
    for (const provider of providers) {
      if (!provider.generateUserProfile) {
        continue
      }

      try {
        aiLogger.info(` Generating user profile with: ${provider.name}`)
        const result = await provider.generateUserProfile(request)
        if (result.metadata.tokensUsed) {
          aiLogger.debug(' Tokens used:', result.metadata.tokensUsed)
        }
        return result
      } catch (error) {
        aiLogger.error(` Provider ${provider.name} failed for profile generation`, error)
      }
    }

    if (this.fallbackProvider.generateUserProfile) {
      aiLogger.info(" Using fallback provider for profile generation")
      return await this.fallbackProvider.generateUserProfile(request)
    }
    
    aiLogger.warn(" No provider supports profile generation, using basic keyword summary")
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
   * 测试连接
   */
  async testConnection(target: ProviderSelectionMode = "remote"): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    const provider = target === "local" ? this.localProvider : this.remoteProvider

    if (!provider) {
      return {
        success: false,
        message: target === "local" ? "未配置本地 AI" : "未配置 AI Provider"
      }
    }
    
    return await provider.testConnection()
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
          timeoutMs: config.timeoutMs
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
        this.recordRecommendationUsage(result)
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
  private recordRecommendationUsage(result: RecommendationReasonResult): void {
    try {
      const { metadata } = result
      
      if (metadata.tokensUsed) {
        aiLogger.info(
          `推荐理由生成 - tokens: ${metadata.tokensUsed.input + metadata.tokensUsed.output}`
        )
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
    if (!enabled || !providerType) {
      this.remoteProvider = null
      aiLogger.info(" Remote AI disabled, fallback to keyword/local if available")
      return
    }

    if (!apiKey) {
      aiLogger.warn(` No API key for provider ${providerType}`)
      this.remoteProvider = null
      return
    }

    this.remoteProvider = this.createRemoteProvider(providerType, apiKey, model)
    const available = await this.remoteProvider.isAvailable()
    if (!available) {
      aiLogger.warn(" Remote provider not available, will rely on fallback/local")
    }
  }

  private async initializeLocalProvider(localConfig?: LocalAIConfig): Promise<void> {
    if (!localConfig?.enabled) {
      this.localProvider = null
      return
    }

    this.localProvider = this.createLocalProvider(localConfig)
    const available = await this.localProvider.isAvailable()
    if (!available) {
      aiLogger.warn(" Local provider not available, please ensure Ollama is running")
    }
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
