/**
 * 冷启动评分器
 * 
 * 在用户画像不完善时，基于以下信号进行推荐评分：
 * - 跨源主题聚类匹配度
 * - 订阅源信任度（质量评分）
 * - 内容质量指标（TF-IDF、长度等）
 * - 时效性
 */

import type { FeedArticle, DiscoveredFeed, FeedQuality } from '@/types/rss'
import { TopicClusterAnalyzer, type ClusterResult } from './topic-cluster'

/**
 * 冷启动评分结果
 */
export interface ColdStartScore {
  articleId: string
  /** 跨源主题聚类匹配分数 (0-1) */
  clusterScore: number
  /** 订阅源信任度分数 (0-1) */
  feedTrustScore: number
  /** 内容质量分数 (0-1) */
  contentQualityScore: number
  /** 时效性分数 (0-1) */
  freshnessScore: number
  /** 综合分数 (0-1) */
  finalScore: number
  /** 分数来源说明 */
  explanation: string
}

/**
 * 冷启动评分配置
 */
export interface ColdStartConfig {
  /** 跨源聚类权重 */
  clusterWeight: number
  /** 订阅源信任度权重 */
  feedTrustWeight: number
  /** 内容质量权重 */
  contentQualityWeight: number
  /** 时效性权重 */
  freshnessWeight: number
  /** 最低推荐分数阈值 */
  minScoreThreshold: number
}

const DEFAULT_CONFIG: ColdStartConfig = {
  clusterWeight: 0.35,       // 跨源聚类最重要
  feedTrustWeight: 0.25,     // 源可信度次之
  contentQualityWeight: 0.20, // 内容质量
  freshnessWeight: 0.20,     // 时效性
  minScoreThreshold: 0.3     // 最低分数阈值
}

/**
 * 冷启动评分器
 */
export class ColdStartScorer {
  private config: ColdStartConfig
  private clusterAnalyzer: TopicClusterAnalyzer
  private feedQualityMap: Map<string, FeedQuality>

  constructor(config: Partial<ColdStartConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.clusterAnalyzer = new TopicClusterAnalyzer()
    this.feedQualityMap = new Map()
  }

  /**
   * 初始化订阅源质量映射
   */
  initFeedQuality(feeds: DiscoveredFeed[]): void {
    this.feedQualityMap.clear()
    for (const feed of feeds) {
      if (feed.quality) {
        this.feedQualityMap.set(feed.id, feed.quality)
      }
    }
  }

  /**
   * 对文章列表进行冷启动评分
   * 
   * @param articles 待评分文章
   * @param feeds 订阅源列表
   * @param clusterResult 预计算的聚类结果（可选，如无则内部计算）
   * @returns 评分结果列表，按分数降序
   */
  score(
    articles: FeedArticle[],
    feeds: DiscoveredFeed[],
    clusterResult?: ClusterResult
  ): ColdStartScore[] {
    // 初始化订阅源质量
    this.initFeedQuality(feeds)

    // 计算聚类（如果未提供）
    const clusters = clusterResult || this.clusterAnalyzer.analyze(feeds, articles)

    // 为每篇文章评分
    const scores: ColdStartScore[] = []

    for (const article of articles) {
      const score = this.scoreArticle(article, clusters)
      if (score.finalScore >= this.config.minScoreThreshold) {
        scores.push(score)
      }
    }

    // 按分数降序排列
    return scores.sort((a, b) => b.finalScore - a.finalScore)
  }

  /**
   * 对单篇文章评分
   */
  private scoreArticle(article: FeedArticle, clusterResult: ClusterResult): ColdStartScore {
    // 1. 跨源聚类分数
    const clusterScore = clusterResult.hasEnoughData
      ? this.clusterAnalyzer.getArticleClusterScore(article, clusterResult.clusters)
      : 0

    // 2. 订阅源信任度
    const feedTrustScore = this.calculateFeedTrustScore(article.feedId)

    // 3. 内容质量
    const contentQualityScore = this.calculateContentQualityScore(article)

    // 4. 时效性
    const freshnessScore = this.calculateFreshnessScore(article.published)

    // 综合分数
    const finalScore = 
      clusterScore * this.config.clusterWeight +
      feedTrustScore * this.config.feedTrustWeight +
      contentQualityScore * this.config.contentQualityWeight +
      freshnessScore * this.config.freshnessWeight

    // 生成说明
    const explanation = this.generateExplanation(
      clusterScore, feedTrustScore, contentQualityScore, freshnessScore, clusterResult
    )

    return {
      articleId: article.id,
      clusterScore,
      feedTrustScore,
      contentQualityScore,
      freshnessScore,
      finalScore,
      explanation
    }
  }

  /**
   * 计算订阅源信任度分数
   */
  private calculateFeedTrustScore(feedId: string): number {
    const quality = this.feedQualityMap.get(feedId)
    if (!quality) {
      return 0.5 // 无质量数据时给中等分
    }

    // 质量评分已经是 0-100，转换为 0-1
    return quality.score / 100
  }

  /**
   * 计算内容质量分数
   */
  private calculateContentQualityScore(article: FeedArticle): number {
    let score = 0.5 // 基础分

    // TF-IDF 分数（如果有）
    if (article.tfidfScore !== undefined) {
      score += article.tfidfScore * 0.3
    }

    // 内容长度评分
    const contentLength = (article.content?.length || 0) + (article.description?.length || 0)
    if (contentLength > 2000) {
      score += 0.2
    } else if (contentLength > 500) {
      score += 0.1
    }

    // AI 分析置信度（如果有）
    if (article.analysis?.confidence) {
      score += article.analysis.confidence * 0.2
    }

    return Math.min(score, 1)
  }

  /**
   * 计算时效性分数
   */
  private calculateFreshnessScore(publishedAt: number): number {
    const now = Date.now()
    const hoursPassed = (now - publishedAt) / (1000 * 60 * 60)

    // 24小时内最新
    if (hoursPassed <= 24) return 1.0
    // 3天内
    if (hoursPassed <= 72) return 0.8 - (hoursPassed - 24) / 48 * 0.3
    // 一周内
    if (hoursPassed <= 168) return 0.5 - (hoursPassed - 72) / 96 * 0.3
    // 两周内
    if (hoursPassed <= 336) return 0.2
    // 超过两周
    return 0.1
  }

  /**
   * 生成评分说明
   */
  private generateExplanation(
    clusterScore: number,
    feedTrustScore: number,
    contentQualityScore: number,
    freshnessScore: number,
    clusterResult: ClusterResult
  ): string {
    const parts: string[] = []

    if (clusterScore > 0.5) {
      parts.push('跨源热门主题')
    }
    if (feedTrustScore > 0.7) {
      parts.push('高质量订阅源')
    }
    if (contentQualityScore > 0.6) {
      parts.push('内容质量佳')
    }
    if (freshnessScore > 0.8) {
      parts.push('最新发布')
    }

    if (parts.length === 0) {
      if (clusterResult.hasEnoughData) {
        parts.push('基于您的订阅偏好推荐')
      } else {
        parts.push('新内容推荐')
      }
    }

    return parts.join('、')
  }

  /**
   * 获取配置
   */
  getConfig(): ColdStartConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ColdStartConfig>): void {
    this.config = { ...this.config, ...config }
  }
}
