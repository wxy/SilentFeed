/**
 * 数据库推荐管理模块（Phase 13+: 基于 feedArticles 表）
 * 
 * 负责推荐查询和用户操作
 * 
 * 架构变更（v22）：
 * - 推荐池与显示方式分离
 * - poolStatus='recommended' 表示文章在推荐池中
 * - 显示方式（弹窗/清单）由 deliveryMode 配置决定
 */

import { db } from './index'
import { logger } from '@/utils/logger'
import { statsCache } from '@/utils/cache'
import { updateFeedStats } from './db-feeds'
import { ProfileUpdateScheduler } from '@/core/profile/ProfileUpdateScheduler'
import type { FeedArticle } from '@/types/rss'
import type { Recommendation } from '@/types/database'

// 创建模块专用日志器
const dbLogger = logger.withTag('DB-Recommendations')

/**
 * 标记推荐为已读
 * 
 * @param articleId - 文章 ID（或 URL，兼容旧接口）
 * @param readDuration - 阅读时长（秒）
 * @param scrollDepth - 滚动深度（0-1）
 */
export async function markAsRead(
  articleId: string,
  readDuration?: number,
  scrollDepth?: number
): Promise<void> {
  // 尝试按 ID 查找
  let article = await db.feedArticles.get(articleId)
  
  // 如果按 ID 找不到，尝试按 URL 查找（兼容旧代码）
  if (!article) {
    article = await db.feedArticles.where('link').equals(articleId).first()
  }
  
  if (!article) {
    dbLogger.error('❌ 文章不存在:', articleId)
    throw new Error(`文章不存在: ${articleId}`)
  }
  
  // 防重复：如果已经标记为已读，直接返回
  if (article.isRead) {
    dbLogger.debug('⚠️ 文章已经是已读状态，跳过重复标记:', articleId)
    return
  }
  
  // 更新阅读状态
  const now = Date.now()
  const updates: Partial<FeedArticle> = {
    isRead: true,
    clickedAt: now,
    readDuration,
    scrollDepth,
    read: true,  // 旧字段
    poolStatus: 'exited',
    poolExitedAt: now,
    poolExitReason: 'read',
    // 兼容旧字段
    inPool: false,
    poolRemovedAt: now,
    poolRemovedReason: 'read'
  }
  
  // 自动评估有效性
  if (readDuration !== undefined && scrollDepth !== undefined) {
    if (readDuration > 120 && scrollDepth > 0.7) {
      updates.effectiveness = 'effective'
    } else {
      updates.effectiveness = 'neutral'
    }
  }
  
  await db.feedArticles.update(article.id, updates)
  
  // 清除统计缓存
  statsCache.invalidate('rec-stats-7d')
  
  // 立即更新 RSS 源统计
  if (article.feedId) {
    const feed = await db.discoveredFeeds.get(article.feedId)
    if (feed) {
      await updateFeedStats(feed.url)
    }
  }
  
  // 用户阅读行为立即触发画像更新
  ProfileUpdateScheduler.forceUpdateProfile('user_read').catch(error => {
    dbLogger.error('❌ 用户阅读后画像更新失败:', error)
  })
}

/**
 * 标记推荐为"不想读"
 * 
 * @param articleIds - 文章 ID 数组（或 URL 数组，兼容旧接口）
 */
export async function dismissRecommendations(articleIds: string[]): Promise<void> {
  const now = Date.now()
  const feedIds = new Set<string>()
  
  for (const articleId of articleIds) {
    // 尝试按 ID 查找
    let article = await db.feedArticles.get(articleId)
    
    // 如果按 ID 找不到，尝试按 URL 查找
    if (!article) {
      article = await db.feedArticles.where('link').equals(articleId).first()
    }
    
    if (!article) {
      dbLogger.warn('⚠️ 文章不存在:', articleId)
      continue
    }
    
    // 更新文章状态
    await db.feedArticles.update(article.id, {
      feedback: 'dismissed',
      feedbackAt: now,
      effectiveness: 'ineffective',
      disliked: true,  // 旧字段
      poolStatus: 'exited',
      poolExitedAt: now,
      poolExitReason: 'disliked',
      // 兼容旧字段
      inPool: false,
      poolRemovedAt: now,
      poolRemovedReason: 'disliked'
    })
    
    if (article.feedId) {
      feedIds.add(article.feedId)
    }
  }
  
  // 清除统计缓存
  statsCache.invalidate('rec-stats-7d')
  
  // 批量更新 RSS 源统计
  for (const feedId of feedIds) {
    const feed = await db.discoveredFeeds.get(feedId)
    if (feed) {
      await updateFeedStats(feed.url)
    }
  }
  
  dbLogger.info(`✅ 已标记 ${articleIds.length} 篇文章为不想读`)
}

/**
 * 获取未读推荐（弹窗显示）
 * 
 * @param limit - 返回数量限制
 * @returns Recommendation 数组（按推荐时间降序）
 */
export async function getUnreadRecommendations(limit: number = 50): Promise<Recommendation[]> {
  try {
    const articles = await db.feedArticles
      .filter(a => {
        const isInPool = a.poolStatus === 'recommended'
        const isUnread = !a.isRead
        const notDismissed = a.feedback !== 'dismissed'
        return isInPool && isUnread && notDismissed
      })
      .toArray()
    
    // 按推荐时间降序排序
    const sorted = articles.sort((a, b) => {
      const timeA = a.popupAddedAt || a.recommendedPoolAddedAt || 0
      const timeB = b.popupAddedAt || b.recommendedPoolAddedAt || 0
      return timeB - timeA
    })
    
    // 转换为 Recommendation 格式（兼容旧接口）
    const recommendations: Recommendation[] = sorted.slice(0, limit).map(article => ({
      id: article.id,
      url: article.link,
      title: article.title,
      summary: article.description || '',
      source: article.feedId,
      sourceUrl: article.feedId,
      recommendedAt: article.popupAddedAt || article.recommendedPoolAddedAt || Date.now(),
      score: article.analysisScore || 0,
      reason: article.recommendationReason,
      wordCount: article.content?.length || 0,
      readingTime: Math.ceil((article.content?.length || 0) / 300),
      excerpt: article.description,
      isRead: article.isRead || false,
      clickedAt: article.clickedAt,
      readDuration: article.readDuration,
      scrollDepth: article.scrollDepth,
      feedback: article.feedback,
      feedbackAt: article.feedbackAt,
      effectiveness: article.effectiveness,
      status: 'active',
      translation: article.translation,
      aiSummary: article.aiSummary  // ✅ 传递 AI 生成的摘要
    }))
    
    return recommendations
  } catch (error) {
    dbLogger.error('❌ 获取未读推荐失败:', error)
    return []
  }
}

/**
 * 获取推荐统计
 * 
 * @returns 统计数据
 */
export async function getRecommendationStats(days: number = 7): Promise<{
  total: number
  unread: number
  read: number
  dismissed: number
  effective: number
}> {
  const cacheKey = `rec-stats-${days}d`
  
  return statsCache.get(
    cacheKey,
    async () => {
      try {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
        
        // 查询所有曾在弹窗的文章
        const popupArticles = await db.feedArticles
          .filter(a => {
            const addedAt = a.popupAddedAt || a.recommendedPoolAddedAt
            return !!(addedAt && addedAt >= cutoff)
          })
          .toArray()
        
        return {
          total: popupArticles.length,
          unread: popupArticles.filter(a => !a.isRead && a.feedback !== 'dismissed').length,
          read: popupArticles.filter(a => a.isRead).length,
          dismissed: popupArticles.filter(a => a.feedback === 'dismissed').length,
          effective: popupArticles.filter(a => a.effectiveness === 'effective').length
        }
      } catch (error) {
        dbLogger.error('❌ 获取推荐统计失败:', error)
        return { total: 0, unread: 0, read: 0, dismissed: 0, effective: 0 }
      }
    },
    300  // 5 分钟缓存
  )
}

/**
 * 获取未推荐的文章数量（候选池大小）
 * 
 * @param feedId - 可选的源 ID 过滤
 * @returns 候选池文章数量
 */
export async function getUnrecommendedArticleCount(
  feedId?: string
): Promise<number> {
  try {
    let query = db.feedArticles.filter(a => a.poolStatus === 'candidate')
    
    if (feedId) {
      query = query.filter(a => a.feedId === feedId)
    }
    
    return await query.count()
  } catch (error) {
    dbLogger.error('❌ 获取候选池统计失败:', error)
    return 0
  }
}

/**
 * 重置推荐数据（清空所有弹窗推荐）
 */
export async function resetRecommendationData(): Promise<void> {
  try {
    dbLogger.info('开始重置推荐数据...')
    
    // 查找所有推荐池中的文章
    const popupArticles = await db.feedArticles
      .filter(a => a.poolStatus === 'recommended')
      .toArray()
    
    dbLogger.info(`找到 ${popupArticles.length} 篇推荐池文章，将标记为已退出`)
    
    // 批量更新为 exited 状态
    const now = Date.now()
    for (const article of popupArticles) {
      await db.feedArticles.update(article.id, {
        poolStatus: 'exited',
        poolExitedAt: now,
        poolExitReason: 'replaced',
        inPool: false,
        poolRemovedAt: now,
        poolRemovedReason: 'replaced'
      })
    }
    
    // 清除统计缓存
    statsCache.invalidate('rec-stats-7d')
    
    // 更新所有订阅源统计
    const feeds = await db.discoveredFeeds.filter(f => f.status === 'subscribed').toArray()
    for (const feed of feeds) {
      await updateFeedStats(feed.url)
    }
    
    dbLogger.info('✅ 推荐数据已重置')
  } catch (error) {
    dbLogger.error('❌ 重置推荐数据失败:', error)
    throw error
  }
}
