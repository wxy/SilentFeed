/**
 * 数据库 RSS Feed 管理模块
 * 
 * 负责 RSS 源和文章的统计更新
 */

import { db } from './index'
import { logger } from '@/utils/logger'

// 创建模块专用日志器
const dbLogger = logger.withTag('DB-Feeds')

/**
 * 更新单个 RSS 源的统计信息
 * 
 * Phase 10: 基于新架构统计（inFeed, inPool, deleted）
 * 
 * 统计字段:
 * - articleCount: feedArticles 总数（所有文章，包括历史）
 * - analyzedCount: 已 AI 分析的文章数（有 analysis 字段）
 * - recommendedCount: 该源的所有推荐数（包括历史，从 recommendations 表统计）
 * - readCount: feedArticles 中标记为已读的文章数
 * - dislikedCount: 该源的不想读数（从 recommendations 表统计）
 * - recommendedReadCount: 该源推荐被阅读数（从 recommendations 表统计）
 * - inFeedCount: 仍在 RSS 源中的文章数（inFeed=true）
 * - inPoolCount: 当前在推荐池中的文章数（inPool=true）
 */
export async function updateFeedStats(feedUrl: string): Promise<void> {
  try {
    // 1. 找到对应的 RSS 源
    const feed = await db.discoveredFeeds.where('url').equals(feedUrl).first()
    if (!feed) {
      dbLogger.warn('未找到 RSS 源:', feedUrl)
      return
    }
    
    // 2. Phase 10: 从 feedArticles 表聚合文章统计
    const articles = await db.feedArticles
      .where('feedId').equals(feed.id)
      .toArray()
    
    // 3. Phase 10: 基于新架构计算文章统计
    const totalCount = articles.length
    const analyzedCount = articles.filter(a => a.analysis && a.analysis.metadata?.provider !== 'tfidf-skipped').length
    const readCount = articles.filter(a => a.read).length
    const unreadCount = articles.filter(a => !a.read).length
    
    // Phase 10: 新字段统计
    const inFeedArticles = articles.filter(a => a.inFeed !== false)
    const inFeedCount = inFeedArticles.length                    // 仍在源中
    const inPoolCount = articles.filter(a => a.inPool === true).length        // 在推荐池中
    const deletedCount = articles.filter(a => a.deleted === true).length      // 已软删除
    
    // Phase 10: inFeed 文章的细分统计（用于进度条）
    const inFeedAnalyzedCount = inFeedArticles.filter(a => a.analysis && a.analysis.metadata?.provider !== 'tfidf-skipped').length
    const inFeedRecommendedCount = inFeedArticles.filter(a => a.recommended && !a.read && !a.disliked).length  // 已推荐但未操作
    const inFeedReadCount = inFeedArticles.filter(a => a.read).length          // 已阅读
    const inFeedDislikedCount = inFeedArticles.filter(a => a.disliked).length  // 不想读
    
    // 4. 从推荐池统计（包括所有历史）
    const recommendationsFromThisFeed = await db.recommendations
      .where('sourceUrl')
      .equals(feedUrl)
      .toArray()
    
    // 统计推荐相关数据
    const recommendedCount = recommendationsFromThisFeed.length
    const recommendedReadCount = recommendationsFromThisFeed.filter(rec => rec.isRead === true).length
    const dislikedCount = recommendationsFromThisFeed.filter(rec => 
      rec.feedback === 'dismissed' || rec.status === 'dismissed'
    ).length
    
    // 5. 更新 RSS 源统计
    await db.discoveredFeeds.update(feed.id, {
      articleCount: totalCount,
      analyzedCount,
      recommendedCount,          // 所有历史推荐
      readCount,
      dislikedCount,             // 所有历史不想读
      unreadCount,
      recommendedReadCount,      // 所有历史已读推荐
      
      // Phase 10: 新增字段
      inFeedCount,               // 仍在源中的文章数
      inPoolCount,               // 当前在推荐池中的文章数
      inFeedAnalyzedCount,       // 在源中且已分析的文章数
      inFeedRecommendedCount,    // 在源中且已推荐但未操作的文章数
      inFeedReadCount,           // 在源中且已阅读的文章数
      inFeedDislikedCount        // 在源中且不想读的文章数
    })
    
    dbLogger.debug(`更新统计: ${feed.title} - 总 ${totalCount}，在源 ${inFeedCount}，在池 ${inPoolCount}，已分析 ${analyzedCount}`)
  } catch (error) {
    dbLogger.error('更新 RSS 源统计失败:', error)
  }
}

/**
 * 批量更新所有 RSS 源的统计信息
 * Phase 6: 在推荐生成后调用，只更新已订阅的源
 */
export async function updateAllFeedStats(): Promise<void> {
  try {
    // Phase 6: 只更新已订阅的源
    const subscribedFeeds = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()
    
    for (const feed of subscribedFeeds) {
      await updateFeedStats(feed.url)
    }
    
    dbLogger.info(`批量更新完成，共 ${subscribedFeeds.length} 个源`)
  } catch (error) {
    dbLogger.error('批量更新 RSS 源统计失败:', error)
  }
}
