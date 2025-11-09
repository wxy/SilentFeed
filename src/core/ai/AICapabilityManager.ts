/**
 * AI Capability Manager
 * 
 * 管理 AI Provider 的选择、降级和错误处理
 * 
 * 策略：
 * 1. 优先使用用户配置的 AI Provider（如果可用）
 * 2. AI 失败时自动降级到关键词分析
 * 3. 记录成本和使用情况
 */

import type { AIProvider, UnifiedAnalysisResult, AnalyzeOptions } from "./types"
import { DeepSeekProvider } from "./providers/DeepSeekProvider"
import { DeepSeekReasonerProvider } from "./providers/DeepSeekReasonerProvider"
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
        console.log("[AI管理器] AI 未配置，使用关键词分析")
        this.primaryProvider = null
        return
      }
      
      // 创建对应的 Provider
      this.primaryProvider = this.createProvider(config.provider, config.apiKey)
      
      // 检查可用性
      const available = await this.primaryProvider.isAvailable()
      if (!available) {
        console.warn("[AI管理器] 主 Provider 不可用，将使用关键词分析")
      }
    } catch (error) {
      console.error("[AI管理器] 初始化失败:", error)
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
          console.log(`[AI管理器] 使用主 Provider: ${this.primaryProvider.name}`)
          const result = await this.primaryProvider.analyzeContent(content, options)
          
          // 记录使用情况
          this.recordUsage(result)
          
          return result
        } else {
          console.warn("[AI管理器] 主 Provider 不可用，使用关键词分析")
        }
      } catch (error) {
        console.error("[AI管理器] 主 Provider 失败，使用关键词分析:", error)
      }
    }
    
    // 2. 降级到关键词分析
    console.log("[AI管理器] 使用备用方案: 关键词分析")
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
        return new DeepSeekProvider({ apiKey })
      
      case "deepseek-reasoner":
        return new DeepSeekReasonerProvider({ apiKey })
      
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
   * 记录使用情况
   */
  private recordUsage(result: UnifiedAnalysisResult): void {
    try {
      const { metadata } = result
      
      // TODO: Sprint 5 - 持久化成本追踪
      if (metadata.cost) {
        console.log(
          `[AI管理器] 成本: $${metadata.cost.toFixed(6)} ` +
          `(${metadata.tokensUsed?.total} tokens)`
        )
      }
    } catch (error) {
      console.error("[AI管理器] 记录使用情况失败:", error)
    }
  }
}

/**
 * 全局单例
 */
export const aiManager = new AICapabilityManager()
