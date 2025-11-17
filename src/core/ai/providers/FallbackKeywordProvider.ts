/**
 * Fallback Keyword Provider
 * 
 * 使用传统关键词提取作为降级方案
 * 包装现有的 TextAnalyzer，提供统一接口
 */

import type {
  AIProvider,
  UnifiedAnalysisResult,
  AnalyzeOptions,
  RecommendationReasonRequest,
  RecommendationReasonResult
} from "@/types/ai"
import { TextAnalyzer } from "@/core/analyzer/TextAnalyzer"
import { TopicClassifier, type TopicDistribution } from "@/core/profile/TopicClassifier"

export class FallbackKeywordProvider implements AIProvider {
  readonly name = "Keyword Analysis"
  
  private analyzer: TextAnalyzer
  private classifier: TopicClassifier
  
  constructor() {
    this.analyzer = new TextAnalyzer()
    this.classifier = new TopicClassifier()
  }
  
  /**
   * 关键词分析总是可用
   */
  async isAvailable(): Promise<boolean> {
    return true
  }
  
  /**
   * 使用关键词提取和分类
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult> {
    try {
      // 1. 提取关键词
      const keywords = this.analyzer.extractKeywords(content)
      
      // 2. 基于关键词分类主题
      const topicDistribution = this.classifier.classify(keywords)
      
      // 3. 转换为 Record<string, number> 格式
      const topicProbabilities = this.convertToStringKeys(topicDistribution)
      
      // 4. 返回统一格式
      return {
        topicProbabilities,
        metadata: {
          provider: "keyword",
          model: "TextAnalyzer + TopicClassifier",
          timestamp: Date.now()
        }
      }
    } catch (error) {
      console.error("[FallbackKeywordProvider] analyzeContent failed:", error)
      
      // 降级：返回默认主题
      return {
        topicProbabilities: {
          "未分类": 1.0
        },
        metadata: {
          provider: "keyword",
          model: "fallback",
          timestamp: Date.now()
        }
      }
    }
  }
  
  /**
   * 关键词分析不需要网络测试
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    return {
      success: true,
      message: "关键词分析无需连接，始终可用",
      latency: 0
    }
  }
  
  /**
   * 转换 TopicDistribution 为 string key 格式
   */
  private convertToStringKeys(
    distribution: TopicDistribution
  ): Record<string, number> {
    // TopicDistribution 已经是归一化的概率分布
    // 直接转换 key 为中文主题名即可
    const result: Record<string, number> = {}
    
    for (const [topic, score] of Object.entries(distribution)) {
      if (score > 0.01) { // 过滤低概率主题
        result[topic] = score
      }
    }
    
    // 如果没有有效主题，返回默认
    if (Object.keys(result).length === 0) {
      return { "未分类": 1.0 }
    }
    
    return result
  }
}
