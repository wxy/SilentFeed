/**
 * 用户画像构建器
 *
 * 从访问记录构建用户兴趣画像
 */

import type { ConfirmedVisit } from "../../storage/types"
import type { UserProfile, ProfileBuildConfig } from "./types"
import type { TopicDistribution } from "./TopicClassifier"
import { topicClassifier } from "./TopicClassifier"
import { Topic } from "./topics"

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ProfileBuildConfig = {
  timeDecayLambda: 0.02,      // 时间衰减系数（约 50 天衰减一半）
  maxKeywords: 50,            // Top 50 关键词
  maxDomains: 20,             // Top 20 域名
  minKeywordWeight: 0.001,    // 最小关键词权重
}

/**
 * 用户画像构建器类
 */
export class ProfileBuilder {
  private config: ProfileBuildConfig

  constructor(config: Partial<ProfileBuildConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 从访问记录构建用户画像
   *
   * @param visits 确认的访问记录列表
   * @returns 用户画像
   */
  async buildFromVisits(visits: ConfirmedVisit[]): Promise<UserProfile> {
    if (visits.length === 0) {
      return this.createEmptyProfile()
    }

    // 1. 应用时间衰减权重
    const weightedVisits = this.applyTimeDecay(visits)

    // 2. 聚合关键词
    const keywordWeights = this.aggregateKeywords(weightedVisits)

    // 3. 聚合主题分布
    const topicDistribution = this.aggregateTopics(weightedVisits, keywordWeights)

    // 4. 统计域名访问
    const domainStats = this.aggregateDomains(weightedVisits)

    // 5. 构建最终画像
    return {
      id: 'singleton',
      topics: topicDistribution,
      keywords: this.getTopKeywords(keywordWeights),
      domains: domainStats.slice(0, this.config.maxDomains),
      totalPages: visits.length,
      lastUpdated: Date.now(),
      version: 1,
    }
  }

  /**
   * 应用时间衰减权重
   *
   * 近期浏览权重更高
   * 公式: weight = e^(-λ * days)
   */
  private applyTimeDecay(visits: ConfirmedVisit[]): Array<ConfirmedVisit & { timeWeight: number }> {
    const now = Date.now()
    
    return visits.map((visit) => {
      const daysAgo = (now - visit.visitTime) / (1000 * 60 * 60 * 24)
      const timeWeight = Math.exp(-this.config.timeDecayLambda * daysAgo)
      
      return {
        ...visit,
        timeWeight,
      }
    })
  }

  /**
   * 计算行为权重（基于停留时间）
   *
   * 停留越久权重越高
   * 分段函数:
   * - 0-30s: 0 (无效，但这些记录不应该存在)
   * - 30-60s: 0.5
   * - 60-300s: 线性增长 0.5 → 1.0
   * - 300s+: 1.0 (饱和)
   */
  private calculateBehaviorWeight(dwellTime: number): number {
    if (dwellTime < 30) return 0
    if (dwellTime < 60) return 0.5
    if (dwellTime < 300) {
      // 线性插值 [60, 300] → [0.5, 1.0]
      return 0.5 + ((dwellTime - 60) / (300 - 60)) * 0.5
    }
    return 1.0
  }

  /**
   * 聚合关键词权重
   */
  private aggregateKeywords(
    weightedVisits: Array<ConfirmedVisit & { timeWeight: number }>
  ): Map<string, number> {
    const keywordWeights = new Map<string, number>()

    weightedVisits.forEach((visit) => {
      const behaviorWeight = this.calculateBehaviorWeight(visit.duration)
      const totalWeight = visit.timeWeight * behaviorWeight

      // 聚合该页面的关键词
      visit.analysis.keywords.forEach((keyword) => {
        const current = keywordWeights.get(keyword) || 0
        keywordWeights.set(keyword, current + totalWeight)
      })
    })

    return keywordWeights
  }

  /**
   * 聚合主题分布
   * 
   * 优先使用 AI 分析的概率云，如果没有则回退到关键词分类
   */
  private aggregateTopics(
    weightedVisits: Array<ConfirmedVisit & { timeWeight: number }>,
    keywordWeights: Map<string, number>
  ): TopicDistribution {
    // 尝试从 AI 分析结果聚合主题概率
    const aiBasedTopics = this.aggregateAITopics(weightedVisits)
    
    if (aiBasedTopics) {
      return aiBasedTopics
    }

    // 回退到关键词分类
    const keywords = Array.from(keywordWeights.entries()).map(([word, weight]) => ({
      word,
      weight,
    }))

    return topicClassifier.classify(keywords)
  }

  /**
   * 从 AI 分析结果聚合主题概率分布
   * 
   * 使用加权平均：每个页面的主题概率 × 时间权重 × 行为权重
   * 
   * @returns 聚合后的主题分布，如果没有 AI 分析则返回 null
   */
  private aggregateAITopics(
    weightedVisits: Array<ConfirmedVisit & { timeWeight: number }>
  ): TopicDistribution | null {
    // 收集所有有 AI 分析的页面
    const aiPages = weightedVisits.filter(visit => visit.analysis.aiAnalysis?.topics)
    
    if (aiPages.length === 0) {
      return null // 没有 AI 分析数据
    }

    // 初始化主题累积权重
    const topicWeights = new Map<string, number>()
    let totalWeight = 0

    aiPages.forEach((visit) => {
      const behaviorWeight = this.calculateBehaviorWeight(visit.duration)
      const pageWeight = visit.timeWeight * behaviorWeight
      
      const aiTopics = visit.analysis.aiAnalysis!.topics

      // 累加每个主题的加权概率
      Object.entries(aiTopics).forEach(([topic, probability]) => {
        const current = topicWeights.get(topic) || 0
        topicWeights.set(topic, current + probability * pageWeight)
      })

      totalWeight += pageWeight
    })

    // 归一化：确保所有概率和为 1
    const normalized: TopicDistribution = {
      [Topic.TECHNOLOGY]: 0,
      [Topic.SCIENCE]: 0,
      [Topic.BUSINESS]: 0,
      [Topic.DESIGN]: 0,
      [Topic.ARTS]: 0,
      [Topic.HEALTH]: 0,
      [Topic.SPORTS]: 0,
      [Topic.ENTERTAINMENT]: 0,
      [Topic.NEWS]: 0,
      [Topic.EDUCATION]: 0,
      [Topic.OTHER]: 0,
    }

    topicWeights.forEach((weight, topic) => {
      // 映射 AI 返回的主题名到 Topic 枚举
      const mappedTopic = this.mapToTopicEnum(topic)
      normalized[mappedTopic] = weight / totalWeight
    })

    // 确保所有值非负且归一化
    const sum = Object.values(normalized).reduce((a, b) => a + b, 0)
    if (sum > 0) {
      Object.keys(normalized).forEach((key) => {
        normalized[key as Topic] /= sum
      })
    }

    return normalized
  }

  /**
   * 映射 AI 返回的主题名称到 Topic 枚举
   * 
   * AI 可能返回中文或英文主题名，需要统一映射
   */
  private mapToTopicEnum(aiTopic: string): Topic {
    const topicMap: Record<string, Topic> = {
      // 中文映射
      '技术': Topic.TECHNOLOGY,
      '科学': Topic.SCIENCE,
      '商业': Topic.BUSINESS,
      '设计': Topic.DESIGN,
      '艺术': Topic.ARTS,
      '健康': Topic.HEALTH,
      '体育': Topic.SPORTS,
      '娱乐': Topic.ENTERTAINMENT,
      '新闻': Topic.NEWS,
      '教育': Topic.EDUCATION,
      
      // 英文映射
      'technology': Topic.TECHNOLOGY,
      'science': Topic.SCIENCE,
      'business': Topic.BUSINESS,
      'design': Topic.DESIGN,
      'arts': Topic.ARTS,
      'health': Topic.HEALTH,
      'sports': Topic.SPORTS,
      'entertainment': Topic.ENTERTAINMENT,
      'news': Topic.NEWS,
      'education': Topic.EDUCATION,
      
      // 模糊匹配
      'tech': Topic.TECHNOLOGY,
      'sci': Topic.SCIENCE,
      'biz': Topic.BUSINESS,
      'art': Topic.ARTS,
      'sport': Topic.SPORTS,
      'edu': Topic.EDUCATION,
    }

    const normalized = aiTopic.toLowerCase().trim()
    return topicMap[normalized] || Topic.OTHER
  }

  /**
   * 聚合域名统计
   */
  private aggregateDomains(
    weightedVisits: Array<ConfirmedVisit & { timeWeight: number }>
  ): Array<{ domain: string; count: number; avgDwellTime: number }> {
    const domainStats = new Map<string, { count: number; totalDwellTime: number }>()

    weightedVisits.forEach((visit) => {
      const current = domainStats.get(visit.domain) || { count: 0, totalDwellTime: 0 }
      domainStats.set(visit.domain, {
        count: current.count + 1,
        totalDwellTime: current.totalDwellTime + visit.duration,
      })
    })

    return Array.from(domainStats.entries())
      .map(([domain, stats]) => ({
        domain,
        count: stats.count,
        avgDwellTime: stats.totalDwellTime / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * 获取 Top 关键词
   */
  private getTopKeywords(keywordWeights: Map<string, number>): Array<{ word: string; weight: number }> {
    return Array.from(keywordWeights.entries())
      .map(([word, weight]) => ({ word, weight }))
      .filter(({ weight }) => weight >= this.config.minKeywordWeight)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, this.config.maxKeywords)
  }

  /**
   * 创建空画像
   */
  private createEmptyProfile(): UserProfile {
    const emptyTopics: TopicDistribution = {
      [Topic.TECHNOLOGY]: 0,
      [Topic.SCIENCE]: 0,
      [Topic.BUSINESS]: 0,
      [Topic.DESIGN]: 0,
      [Topic.ARTS]: 0,
      [Topic.HEALTH]: 0,
      [Topic.SPORTS]: 0,
      [Topic.ENTERTAINMENT]: 0,
      [Topic.NEWS]: 0,
      [Topic.EDUCATION]: 0,
      [Topic.OTHER]: 1.0, // 默认为 OTHER
    }

    return {
      id: 'singleton',
      topics: emptyTopics,
      keywords: [],
      domains: [],
      totalPages: 0,
      lastUpdated: Date.now(),
      version: 1,
    }
  }
}

/**
 * 默认导出实例
 */
export const profileBuilder = new ProfileBuilder()