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
 * Phase 7: 从 feedArticles 表聚合文章统计，从推荐池统计推荐数据
 * 
 * 统计字段:
 * - articleCount: feedArticles 总数
 * - analyzedCount: 已 AI 分析的文章数（有 analysis 字段）
 * - recommendedCount: 该源的所有推荐数（包括历史，与推荐统计一致）
 * - readCount: feedArticles 中标记为已读的文章数
 * - dislikedCount: 该源的不想读数（包括历史，与推荐统计一致）
 * - recommendedReadCount: 该源推荐被阅读数（包括历史，与推荐统计一致）
 */
export async function updateFeedStats(feedUrl: string): Promise<void> {
  try {
    // 1. 找到对应的 RSS 源
    const feed = await db.discoveredFeeds.where('url').equals(feedUrl).first()
    if (!feed) {
      dbLogger.warn('未找到 RSS 源:', feedUrl)
      return
    }
    
    // Phase 7: 从 feedArticles 表聚合文章统计
    // 2. 获取该 Feed 的所有文章
    const articles = await db.feedArticles
      .where('feedId').equals(feed.id)
      .toArray()
    
    // 3. 计算文章统计（基于当前文章）
    const totalCount = articles.length
    const analyzedCount = articles.filter(a => a.analysis).length
    const readCount = articles.filter(a => a.read).length
    const unreadCount = articles.filter(a => !a.read).length
    const currentRecommendedCount = articles.filter(a => a.recommended).length  // 当前文章中推荐状态的数量
    const currentDislikedCount = articles.filter(a => a.disliked).length       // 当前文章中不想读的数量
    const currentRecommendedReadCount = articles.filter(a => a.recommended && a.read).length  // 当前推荐文章中已读的数量
    
    // 4. 从推荐池统计（Phase 7: 统计所有历史，不过滤 status）
    const recommendationsFromThisFeed = await db.recommendations
      .where('sourceUrl')
      .equals(feedUrl)
      .toArray()
    
    // Phase 7: 统计所有历史记录（不过滤 status），确保数据完整准确
    const recommendedCount = recommendationsFromThisFeed.length
    const recommendedReadCount = recommendationsFromThisFeed.filter(rec => rec.isRead === true).length
    const dislikedCount = recommendationsFromThisFeed.filter(rec => 
      rec.feedback === 'dismissed' || rec.status === 'dismissed'
    ).length
    
    // 5. 更新 RSS 源统计
    await db.discoveredFeeds.update(feed.id, {
      articleCount: totalCount,
      analyzedCount,
      recommendedCount,          // 所有历史推荐（包括被替换的）- 保留用于历史统计
      readCount,
      dislikedCount,             // 所有历史不想读（包括被替换的）- 保留用于历史统计
      unreadCount,
      recommendedReadCount,      // 所有历史已读推荐 - 保留用于历史统计
      currentRecommendedCount,   // 当前文章中推荐状态的数量（用于UI显示）
      currentDislikedCount,      // 当前文章中不想读的数量（用于UI显示）
      currentRecommendedReadCount  // 当前推荐文章中已读的数量（用于UI显示）
    })
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
