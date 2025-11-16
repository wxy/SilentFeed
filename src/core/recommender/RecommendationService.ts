/**
 * 推荐服务
 * Phase 6: 整合推荐管道、用户画像、RSS数据生成推荐
 */

import { RecommendationPipelineImpl } from './pipeline'
import { getUserProfile, updateAllFeedStats } from '../../storage/db'
import { getRecommendationConfig } from '../../storage/recommendation-config'
import { FeedManager } from '../rss/managers/FeedManager'
import { db } from '../../storage/db'
import type { Recommendation } from '../../storage/types'
import type { UserProfile } from '../profile/types'
import type { FeedArticle } from '../rss/types'
import type { RecommendationInput, RecommendedArticle, RecommendationResult, RecommendationConfig } from './types'
import { trackRecommendationGenerated } from './adaptive-count'
import { sendRecommendationNotification } from './notification'

/**
 * 推荐生成结果
 */
export interface RecommendationGenerationResult {
  recommendations: Recommendation[]
  stats: {
    totalArticles: number
    processedArticles: number
    recommendedCount: number
    processingTimeMs: number
  }
  errors?: string[]
}

/**
 * 推荐服务类
 */
export class RecommendationService {
  private pipeline: RecommendationPipelineImpl

  constructor() {
    this.pipeline = new RecommendationPipelineImpl()
  }

  /**
   * 生成推荐
   * 
   * @param maxRecommendations - 最大推荐数量
   * @param sources - 数据源选择 (default: subscribed RSS feeds)
   * @param batchSize - Phase 6: 每次处理的文章批次大小（默认 10 篇）
   * @returns 推荐生成结果
   */
  async generateRecommendations(
    maxRecommendations: number = 5,
    sources: 'subscribed' | 'all' = 'subscribed',
    batchSize: number = 10
  ): Promise<RecommendationGenerationResult> {
    const startTime = Date.now()
    const errors: string[] = []
    
    try {
      // 获取推荐配置
      const recommendationConfig = await getRecommendationConfig()
      
      console.log('[RecommendationService] 开始生成推荐...', {
        maxRecommendations,
        sources,
        batchSize,
        useReasoning: recommendationConfig.useReasoning,
        useLocalAI: recommendationConfig.useLocalAI
      })

      // 1. 获取用户画像
      const userProfile = await getUserProfile()
      if (!userProfile) {
        throw new Error('用户画像未准备好，请先浏览更多页面建立兴趣模型')
      }

      // 2. 获取RSS文章数据（Phase 6: 优先获取未分析的文章）
      const articles = await this.collectArticles(sources, batchSize)
      if (articles.length === 0) {
        throw new Error('没有可用的RSS文章数据，请先订阅一些RSS源')
      }

      console.log('[RecommendationService] 收集到文章:', articles.length, '篇（批次大小：', batchSize, '）')

      // 3. 构建推荐输入
      const config: RecommendationConfig = {
        maxRecommendations,
        useReasoning: recommendationConfig.useReasoning,
        useLocalAI: recommendationConfig.useLocalAI,
        batchSize: recommendationConfig.batchSize,
        qualityThreshold: recommendationConfig.qualityThreshold,
        tfidfThreshold: recommendationConfig.tfidfThreshold
      }
      
      console.log('[RecommendationService] 推荐配置:', {
        qualityThreshold: config.qualityThreshold,
        tfidfThreshold: config.tfidfThreshold,
        batchSize: config.batchSize,
        maxRecommendations: config.maxRecommendations
      })

      const input: RecommendationInput = {
        articles,
        userProfile,
        config,
        options: {
          maxArticles: articles.length
        }
      }

      // 4. 运行推荐管道
      const result = await this.pipeline.process(input)
      
      // 5. Phase 6: 应用推荐池质量阈值，只保存高质量推荐
      const qualityThreshold = recommendationConfig.qualityThreshold
      const highQualityArticles = result.articles.filter(article => {
        const isHighQuality = article.score >= qualityThreshold
        if (!isHighQuality) {
          console.log(`[RecommendationService] ⚠️ 文章质量不达标 (${article.score.toFixed(2)} < ${qualityThreshold}):`, article.title)
        }
        return isHighQuality
      })
      
      if (highQualityArticles.length === 0 && result.articles.length > 0) {
        console.warn(`[RecommendationService] ⚠️ 所有文章都未达到质量阈值 ${qualityThreshold}，本次不生成推荐`)
      }
      
      // 6. 转换为存储格式并保存（仅保存高质量文章）
      const recommendations = await this.saveRecommendations(highQualityArticles, recommendationConfig)

      const processingTimeMs = Date.now() - startTime
      const stats = {
        totalArticles: articles.length,
        processedArticles: result.stats.processed.finalRecommended || 0,
        recommendedCount: recommendations.length,
        processingTimeMs
      }

      // 推荐方式总结日志
      const algorithmUsed = this.getAlgorithmDisplayName(result.algorithm)
      console.log(`[RecommendationService] 🎯 推荐生成完成 - 使用方式：${algorithmUsed}`, {
        '总文章数': stats.totalArticles,
        '推荐数量': stats.recommendedCount,
        '处理时长': `${stats.processingTimeMs}ms`,
        '推荐方式': algorithmUsed,
        'AI分析数': result.stats.processed.aiScored || 0,
        'TFIDF筛选数': result.stats.processed.tfidfFiltered || 0
      })

      // 6. 跟踪推荐生成
      await trackRecommendationGenerated(recommendations.length)

      // 7. 发送通知（如果有推荐）
      if (recommendations.length > 0) {
        const topRecommendation = recommendations[0]
        await sendRecommendationNotification(recommendations.length, {
          title: topRecommendation.title,
          source: topRecommendation.source,
          url: topRecommendation.url
        })
      }

      return {
        recommendations,
        stats,
        errors: errors.length > 0 ? errors : undefined
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[RecommendationService] ❌ 推荐生成失败:', errorMessage)
      
      return {
        recommendations: [],
        stats: {
          totalArticles: 0,
          processedArticles: 0,
          recommendedCount: 0,
          processingTimeMs: Date.now() - startTime
        },
        errors: [errorMessage]
      }
    }
  }

  /**
   * 收集文章数据
   * 
   * Phase 6: 支持批量处理，优先收集未被AI分析过的文章
   * 
   * @param sources - 数据源类型
   * @param batchSize - 批次大小（0 = 不限制）
   */
  private async collectArticles(
    sources: 'subscribed' | 'all',
    batchSize: number = 0
  ): Promise<FeedArticle[]> {
    const feedManager = new FeedManager()
    const feeds = sources === 'all' 
      ? await feedManager.getFeeds() 
      : await feedManager.getFeeds('subscribed')

    console.log('[RecommendationService] 找到RSS源:', feeds.length, '个')

    const allArticles: FeedArticle[] = []

    for (const feed of feeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        // Phase 6: 只取未分析过的文章用于推荐
        const unanalyzedArticles = feed.latestArticles.filter(article => 
          !article.analysis  // 未分析（用户是否阅读不影响 AI 分析）
        )
        
        const totalArticles = feed.latestArticles.length
        const analyzedArticles = totalArticles - unanalyzedArticles.length
        const tfidfSkippedArticles = feed.latestArticles.filter(a => 
          a.analysis?.provider === 'tfidf-skipped'  // 修复：provider 在顶层，不在 metadata 中
        ).length
        
        allArticles.push(...unanalyzedArticles)
        
        console.log(`[RecommendationService] 从 ${feed.title} 收集文章:`, {
          '总数': totalArticles,
          '未分析': unanalyzedArticles.length,
          '已分析': analyzedArticles,
          '其中TF-IDF跳过': tfidfSkippedArticles
        })
      }
    }

    // Phase 6: 按发布时间倒序排序（新文章优先）
    const sortedArticles = allArticles.sort((a, b) => b.published - a.published)

    // Phase 6: 返回所有未经 AI 分析的文章供 TF-IDF 初筛
    // （部分文章可能因 TF-IDF 分数太低而在 pipeline 中被跳过）
    console.log(`[RecommendationService] 收集未分析文章（待TF-IDF筛选）: ${sortedArticles.length} 篇`)
    return sortedArticles
  }

  /**
   * 保存推荐到数据库
   * 
   * Phase 6: 实现推荐池机制
   * - 池容量 = maxRecommendations
   * - 新推荐需要与池中现有推荐竞争
   * - 只保留高分推荐
   */
  private async saveRecommendations(
    recommendedArticles: RecommendedArticle[],
    config: RecommendationConfig
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = []
    const now = Date.now()
    const existingUrls = new Set<string>()

    // Phase 6: 获取当前推荐池（未读的推荐）
    const currentPool = await db.recommendations
      .filter(rec => !rec.isRead)  // 使用 filter 确保正确过滤
      .toArray()
    
    const maxSize = config.maxRecommendations || 3
    console.log('[RecommendationService] 当前推荐池:', currentPool.length, '条（容量:', maxSize, '）')

    // 获取最近7天的推荐URL，用于去重
    try {
      const recentRecommendations = await db.recommendations
        .where('recommendedAt')
        .above(now - 7 * 24 * 60 * 60 * 1000) // 7天前
        .toArray()
      
      recentRecommendations.forEach(rec => existingUrls.add(rec.url))
      console.log('[RecommendationService] 最近7天已有推荐:', existingUrls.size, '条，用于去重')
    } catch (error) {
      console.warn('[RecommendationService] 获取历史推荐失败:', error)
    }

    for (const [index, article] of recommendedArticles.entries()) {
      // 检查是否重复
      if (existingUrls.has(article.url)) {
        console.log('[RecommendationService] 跳过重复推荐:', article.title, article.url)
        continue
      }

      // Phase 6: 推荐池竞争逻辑
      const poolSize = currentPool.length
      const maxSize = config.maxRecommendations || 3
      
      // 规则 1: 如果池未满，直接加入（已经通过质量阈值筛选）
      if (poolSize < maxSize) {
        console.log(`[RecommendationService] ✅ 池未满 (${poolSize}/${maxSize})，直接加入: ${article.title} (${article.score.toFixed(2)})`)
      } 
      // 规则 2: 如果池已满，检查是否能替换最低分
      else {
        const lowestInPool = currentPool.sort((a, b) => a.score - b.score)[0]
        if (article.score > lowestInPool.score) {
          console.log(`[RecommendationService] 🔄 替换低分推荐: ${article.score.toFixed(2)} > ${lowestInPool.score.toFixed(2)}`)
          // 删除最低分的推荐
          await db.recommendations.delete(lowestInPool.id)
          currentPool.shift() // 从数组中移除
        } else {
          console.log(`[RecommendationService] ❌ 池已满且分数不够高: ${article.score.toFixed(2)} <= ${lowestInPool.score.toFixed(2)}，跳过: ${article.title}`)
          continue // 不够格，跳过
        }
      }

      // Phase 6: 使用 feedId 获取准确的 RSS 源信息
      let feedUrl = ''
      if (article.feedId) {
        try {
          const feed = await db.discoveredFeeds.get(article.feedId)
          if (feed) {
            feedUrl = feed.url
          }
        } catch (error) {
          console.warn('[RecommendationService] 获取 RSS 源失败:', article.feedId, error)
        }
      }
      
      // 如果没有 feedId 或获取失败，降级到从 URL 推断
      if (!feedUrl) {
        feedUrl = this.extractBaseUrl(article.url)
      }

      const recommendation: Recommendation = {
        id: `rec-${now}-${index}`,
        url: article.url,
        title: article.title,
        summary: article.keyPoints?.join('\n') || '',
        source: this.extractSourceFromUrl(article.url),
        sourceUrl: feedUrl,  // Phase 6: 使用准确的 feed URL
        recommendedAt: now,
        score: article.score,
        reason: article.reason,
        isRead: false
      }

      recommendations.push(recommendation)
      currentPool.push(recommendation) // 加入当前池（用于后续比较）
      existingUrls.add(article.url) // 防止本批次内重复
    }

    if (recommendations.length === 0) {
      console.log('[RecommendationService] ⚠️ 所有推荐都是重复的，没有新推荐可保存')
      return []
    }

    // 批量保存到数据库
    await db.recommendations.bulkAdd(recommendations)
    
    console.log('[RecommendationService] 保存推荐到数据库:', recommendations.length, '条（去重后）')

    // Phase 6: 标记进入推荐池的文章
    // 通过 recommendedArticles 找到对应的 feedId 和 articleId，更新 recommended 字段
    for (const article of recommendedArticles) {
      if (!article.feedId) continue
      
      try {
        const feed = await db.discoveredFeeds.get(article.feedId)
        if (!feed || !feed.latestArticles) continue
        
        // 找到对应的文章并标记
        const targetArticle = feed.latestArticles.find(a => a.link === article.url)
        if (targetArticle && !targetArticle.recommended) {
          targetArticle.recommended = true
          
          // 更新到数据库
          await db.discoveredFeeds.update(feed.id, {
            latestArticles: feed.latestArticles
          })
        }
      } catch (error) {
        console.warn('[RecommendationService] 标记文章推荐状态失败:', article.feedId, error)
      }
    }
    
    console.log('[RecommendationService] 已标记进入推荐池的文章')

    // Phase 6: 更新 RSS 源的推荐数统计
    // 异步更新，不阻塞返回
    updateAllFeedStats().catch((error: Error) => {
      console.error('[RecommendationService] 更新 RSS 源统计失败:', error)
    })

    return recommendations
  }

  /**
   * 从URL提取源名称
   */
  private extractSourceFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname
      return hostname.replace('www.', '')
    } catch {
      return 'Unknown Source'
    }
  }

  /**
   * 从URL提取基础URL
   */
  private extractBaseUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return `${urlObj.protocol}//${urlObj.hostname}`
    } catch {
      return url
    }
  }

  /**
   * 清理管道资源
   */
  cleanup(): void {
    this.pipeline.cleanup()
  }

  /**
   * 获取算法显示名称
   */
  private getAlgorithmDisplayName(algorithm: string): string {
    switch (algorithm) {
      case 'reasoning-ai':
        return '推理AI推荐'
      case 'ai':
        return 'AI智能推荐'
      case 'hybrid':
        return '混合推荐（AI降级到TF-IDF）'
      case 'tfidf':
        return 'TF-IDF关键词匹配'
      default:
        return '未知算法'
    }
  }
}

/**
 * 单例实例
 */
export const recommendationService = new RecommendationService()