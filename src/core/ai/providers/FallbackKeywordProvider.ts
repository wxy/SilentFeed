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
  RecommendationReasonResult,
  UserProfileGenerationRequest,
  UserProfileGenerationResult
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
   * 基于关键词生成用户画像（降级方案）
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest
  ): Promise<UserProfileGenerationResult> {
    const { topKeywords, topicDistribution } = request
    
    // 1. 提取高频关键词（取前 10 个）
    const topWords = topKeywords
      .slice(0, 10)
      .map(k => k.word)
    
    // 2. 提取主要主题（概率 > 0.1）
    const mainTopics = Object.entries(topicDistribution)
      .filter(([_, prob]) => prob > 0.1)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
      .slice(0, 5)
    
    // 3. 生成兴趣描述
    let interests = ""
    if (topWords.length > 0 && mainTopics.length > 0) {
      interests = `对 ${topWords.join('、')} 等关键词感兴趣，主要关注 ${mainTopics.join('、')} 等领域`
    } else if (topWords.length > 0) {
      interests = `对 ${topWords.join('、')} 等主题感兴趣`
    } else {
      interests = "正在学习您的兴趣偏好"
    }
    
    // 4. 生成偏好列表（从主题推断）
    const preferences: string[] = []
    if (mainTopics.includes('technology')) preferences.push('技术文章')
    if (mainTopics.includes('science')) preferences.push('科学研究')
    if (mainTopics.includes('design')) preferences.push('设计创作')
    if (mainTopics.includes('business')) preferences.push('商业资讯')
    if (mainTopics.includes('education')) preferences.push('教育学习')
    
    // 如果没有匹配的主题，使用通用偏好
    if (preferences.length === 0) {
      preferences.push('深度文章', '专业内容', '高质量资讯')
    }
    
    // 5. 避免主题（从拒绝记录中提取）
    const avoidTopics: string[] = []
    if (request.behaviors?.dismisses && request.behaviors.dismisses.length > 0) {
      const dismissKeywords = new Set<string>()
      for (const dismiss of request.behaviors.dismisses.slice(0, 5)) {
        const keywords = dismiss.keywords || []
        for (const keyword of keywords.slice(0, 3)) {
          dismissKeywords.add(keyword)
        }
      }
      avoidTopics.push(...Array.from(dismissKeywords).slice(0, 5))
    }
    
    return {
      interests,
      preferences: preferences.slice(0, 5),
      avoidTopics: avoidTopics.slice(0, 5),
      metadata: {
        provider: "keyword",
        model: "FallbackKeywordProvider",
        timestamp: Date.now(),
        tokensUsed: 0, // 无 token 消耗
        basedOn: {
          browses: request.behaviors?.browses?.length || 0,
          reads: request.behaviors?.reads?.length || 0,
          dismisses: request.behaviors?.dismisses?.length || 0
        }
      }
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
