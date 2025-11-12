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
 * Phase 4: 仅使用 DeepSeek Chat 模型
 * Phase 5: 根据任务类型（页面分析 vs 推荐）选择合适的模型
 */

import type { AIProvider, UnifiedAnalysisResult, AnalyzeOptions, RecommendationReasonRequest, RecommendationReasonResult } from "./types"
import { DeepSeekProvider } from "./providers/DeepSeekProvider"
// DeepSeekReasonerProvider 保留供 Phase 5 使用（推荐引擎）
// import { DeepSeekReasonerProvider } from "./providers/DeepSeekReasonerProvider"
import { FallbackKeywordProvider } from "./providers/FallbackKeywordProvider"
import { getAIConfig, type AIProviderType } from "@/storage/ai-config"

export class AICapabilityManager {
  private primaryProvider: AIProvider | null = null
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
      
      if (!config.enabled || !config.provider) {
        console.log("[AICapabilityManager] AI not configured, using keyword analysis")
        this.primaryProvider = null
        return
      }
      
      // 创建对应的 Provider
      this.primaryProvider = this.createProvider(config.provider, config.apiKey)
      
      // 检查可用性
      const available = await this.primaryProvider.isAvailable()
      if (!available) {
        console.warn("[AICapabilityManager] Primary provider not available, will use fallback")
      }
    } catch (error) {
      console.error("[AICapabilityManager] Initialization failed:", error)
      this.primaryProvider = null
    }
  }
  
  /**
   * 分析内容
   * 
   * 自动选择最佳 Provider 并处理降级
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult> {
    // 1. 尝试使用主 Provider
    if (this.primaryProvider) {
      try {
        const available = await this.primaryProvider.isAvailable()
        if (available) {
          console.log(`[AICapabilityManager] Using primary provider: ${this.primaryProvider.name}`)
          const result = await this.primaryProvider.analyzeContent(content, options)
          
          // 记录使用情况
          this.recordUsage(result)
          
          return result
        } else {
          console.warn("[AICapabilityManager] Primary provider not available, using fallback")
        }
      } catch (error) {
        console.error("[AICapabilityManager] Primary provider failed, using fallback:", error)
      }
    }
    
    // 2. 降级到关键词分析
    console.log("[AICapabilityManager] Using fallback provider: Keyword Analysis")
    return await this.fallbackProvider.analyzeContent(content, options)
  }
  
  /**
   * 测试连接
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    if (!this.primaryProvider) {
      return {
        success: false,
        message: "未配置 AI Provider"
      }
    }
    
    return await this.primaryProvider.testConnection()
  }
  
  /**
   * 获取当前使用的 Provider 名称
   */
  getCurrentProviderName(): string {
    return this.primaryProvider?.name || "Keyword Analysis"
  }
  
  /**
   * 创建 Provider 实例
   */
  private createProvider(type: AIProviderType, apiKey: string): AIProvider {
    switch (type) {
      case "deepseek":
        // Phase 4: 仅使用 DeepSeek Chat 模型（快速、便宜）
        // Phase 5: 可能根据任务类型选择 Chat 或 Reasoner
        return new DeepSeekProvider({ apiKey })
      
      case "openai":
        // TODO: 实现 OpenAIProvider (Sprint 6)
        throw new Error("OpenAI provider not implemented yet")
      
      case "anthropic":
        // TODO: 实现 AnthropicProvider (Sprint 6)
        throw new Error("Anthropic provider not implemented yet")
      
      default:
        throw new Error(`Unknown provider type: ${type}`)
    }
  }
  
  /**
   * 生成推荐理由
   */
  async generateRecommendationReason(
    request: RecommendationReasonRequest
  ): Promise<RecommendationReasonResult> {
    try {
      // 尝试使用主要 AI Provider
      if (this.primaryProvider) {
        const available = await this.primaryProvider.isAvailable()
        if (available && this.primaryProvider.generateRecommendationReason) {
          const result = await this.primaryProvider.generateRecommendationReason(request)
          
          // 记录成本
          this.recordRecommendationUsage(result)
          
          return result
        }
      }
      
      // 降级到关键词策略
      return this.generateKeywordRecommendationReason(request)
      
    } catch (error) {
      console.warn("[AICapabilityManager] Primary provider failed for recommendation:", error)
      
      // 降级到关键词策略
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
      
      // TODO: Sprint 5 - 持久化成本追踪
      if (metadata.cost) {
        console.log(
          `[AI管理器] 成本: ¥${metadata.cost.toFixed(6)} ` +
          `(${metadata.tokensUsed?.total} tokens)`
        )
      }
    } catch (error) {
      console.error("[AICapabilityManager] Failed to record usage:", error)
    }
  }

  /**
   * 记录推荐理由使用情况
   */
  private recordRecommendationUsage(result: RecommendationReasonResult): void {
    try {
      const { metadata } = result
      
      if (metadata.tokensUsed) {
        console.log(
          `[AI管理器] 推荐理由生成 - tokens: ${metadata.tokensUsed.input + metadata.tokensUsed.output}`
        )
      }
    } catch (error) {
      console.error("[AICapabilityManager] Failed to record recommendation usage:", error)
    }
  }
}

/**
 * 全局单例
 */
export const aiManager = new AICapabilityManager()
