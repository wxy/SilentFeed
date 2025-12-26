/**
 * 跨源主题聚类分析器
 * 
 * 核心思路：
 * - 用户订阅的多个 RSS 源反映了用户兴趣的多个维度
 * - 当某个主题在多个不同来源中出现，说明用户对该主题有较强兴趣
 * - 用于冷启动阶段的推荐决策
 */

import type { Topic } from '@/core/profile/topics'
import type { FeedArticle, DiscoveredFeed } from '@/types/rss'

/**
 * 主题聚类结果
 */
export interface TopicCluster {
  topic: Topic
  /** 该主题在多少个不同来源中出现 */
  sourceCount: number
  /** 出现该主题的订阅源 ID 列表 */
  sourceIds: string[]
  /** 该主题的文章总数 */
  articleCount: number
  /** 平均置信度 */
  avgConfidence: number
  /** 聚类热度分数 (0-1) - 综合考虑来源数量和文章数量 */
  heatScore: number
}

/**
 * 聚类分析结果
 */
export interface ClusterResult {
  /** 按热度排序的主题聚类 */
  clusters: TopicCluster[]
  /** 分析的订阅源数量 */
  feedCount: number
  /** 分析的文章数量 */
  articleCount: number
  /** 是否有足够的数据进行聚类 */
  hasEnoughData: boolean
  /** 分析时间戳 */
  analyzedAt: number
}

/**
 * 主题聚类分析器配置
 */
export interface TopicClusterConfig {
  /** 主题需要出现在至少多少个源才算有效聚类 */
  minSourcesForCluster: number
  /** 主题置信度阈值 */
  confidenceThreshold: number
  /** 热度计算中来源数量的权重 */
  sourceCountWeight: number
  /** 热度计算中文章数量的权重 */
  articleCountWeight: number
}

const DEFAULT_CONFIG: TopicClusterConfig = {
  minSourcesForCluster: 2,      // 至少在 2 个源中出现
  confidenceThreshold: 0.3,      // 主题置信度 > 30%
  sourceCountWeight: 0.6,        // 来源数量占 60%
  articleCountWeight: 0.4        // 文章数量占 40%
}

/**
 * 主题聚类分析器
 */
export class TopicClusterAnalyzer {
  private config: TopicClusterConfig

  constructor(config: Partial<TopicClusterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 分析多个订阅源的主题聚类
   * 
   * @param feeds 订阅源列表（带文章）
   * @param articles 已分析的文章列表
   * @returns 聚类结果
   */
  analyze(feeds: DiscoveredFeed[], articles: FeedArticle[]): ClusterResult {
    // 过滤已订阅且活跃的源
    const activeFeedIds = new Set(
      feeds
        .filter(f => f.status === 'subscribed' && f.isActive)
        .map(f => f.id)
    )

    // 只分析真正完成 AI 分析的文章（排除 tfidf-skipped）
    const analyzedArticles = articles.filter(a => 
      a.analysis && 
      a.analysis.provider !== 'tfidf-skipped' &&
      activeFeedIds.has(a.feedId)
    )

    if (activeFeedIds.size < 2 || analyzedArticles.length < 5) {
      return {
        clusters: [],
        feedCount: activeFeedIds.size,
        articleCount: analyzedArticles.length,
        hasEnoughData: false,
        analyzedAt: Date.now()
      }
    }

    // 按主题统计
    const topicStats = this.collectTopicStats(analyzedArticles)
    
    // 构建聚类
    const clusters = this.buildClusters(topicStats, activeFeedIds.size)

    return {
      clusters,
      feedCount: activeFeedIds.size,
      articleCount: analyzedArticles.length,
      hasEnoughData: clusters.length > 0,
      analyzedAt: Date.now()
    }
  }

  /**
   * 收集主题统计数据
   */
  private collectTopicStats(articles: FeedArticle[]): Map<Topic, {
    sourceIds: Set<string>
    articleCount: number
    totalConfidence: number
  }> {
    const stats = new Map<Topic, {
      sourceIds: Set<string>
      articleCount: number
      totalConfidence: number
    }>()

    for (const article of articles) {
      if (!article.analysis?.topicProbabilities) continue

      for (const [topic, prob] of Object.entries(article.analysis.topicProbabilities)) {
        if (prob < this.config.confidenceThreshold) continue

        const typedTopic = topic as Topic
        
        if (!stats.has(typedTopic)) {
          stats.set(typedTopic, {
            sourceIds: new Set(),
            articleCount: 0,
            totalConfidence: 0
          })
        }

        const s = stats.get(typedTopic)!
        s.sourceIds.add(article.feedId)
        s.articleCount++
        s.totalConfidence += prob
      }
    }

    return stats
  }

  /**
   * 构建聚类结果
   */
  private buildClusters(
    stats: Map<Topic, { sourceIds: Set<string>; articleCount: number; totalConfidence: number }>,
    totalFeedCount: number
  ): TopicCluster[] {
    const clusters: TopicCluster[] = []

    // 计算最大值用于归一化
    let maxSourceCount = 0
    let maxArticleCount = 0
    
    for (const [, s] of stats) {
      maxSourceCount = Math.max(maxSourceCount, s.sourceIds.size)
      maxArticleCount = Math.max(maxArticleCount, s.articleCount)
    }

    for (const [topic, s] of stats) {
      // 只保留在多个源中出现的主题
      if (s.sourceIds.size < this.config.minSourcesForCluster) continue

      // 计算热度分数
      const sourceRatio = maxSourceCount > 0 ? s.sourceIds.size / maxSourceCount : 0
      const articleRatio = maxArticleCount > 0 ? s.articleCount / maxArticleCount : 0
      
      const heatScore = 
        sourceRatio * this.config.sourceCountWeight +
        articleRatio * this.config.articleCountWeight

      clusters.push({
        topic,
        sourceCount: s.sourceIds.size,
        sourceIds: Array.from(s.sourceIds),
        articleCount: s.articleCount,
        avgConfidence: s.articleCount > 0 ? s.totalConfidence / s.articleCount : 0,
        heatScore
      })
    }

    // 按热度排序
    return clusters.sort((a, b) => b.heatScore - a.heatScore)
  }

  /**
   * 获取文章的主题匹配分数
   * 
   * @param article 待评分文章
   * @param clusters 主题聚类结果
   * @returns 匹配分数 (0-1)
   */
  getArticleClusterScore(article: FeedArticle, clusters: TopicCluster[]): number {
    if (!article.analysis?.topicProbabilities || clusters.length === 0) {
      return 0
    }

    let totalScore = 0
    let weightSum = 0

    for (const cluster of clusters) {
      const prob = article.analysis.topicProbabilities[cluster.topic] || 0
      if (prob >= this.config.confidenceThreshold) {
        // 使用聚类热度作为权重
        totalScore += prob * cluster.heatScore
        weightSum += cluster.heatScore
      }
    }

    return weightSum > 0 ? totalScore / weightSum : 0
  }
}
