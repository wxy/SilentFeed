/**
 * 数据库推荐管理模块
 * 
 * 负责推荐记录的 CRUD 操作和相关业务逻辑
 */

import type { Recommendation } from "@/types/database"
import type { DiscoveredFeed } from "@/types/rss"
import { db } from './index'
import { logger } from '@/utils/logger'
import { statsCache } from '@/utils/cache'
import { updateFeedStats } from './db-feeds'
import { ProfileUpdateScheduler } from '@/core/profile/ProfileUpdateScheduler'

// 创建模块专用日志器
const dbLogger = logger.withTag('DB-Recommendations')

/**
 * 标记推荐为已读
 * 
 * @param id - 推荐记录 ID
 * @param readDuration - 阅读时长（秒）
 * @param scrollDepth - 滚动深度（0-1）
 */
export async function markAsRead(
  id: string,
  readDuration?: number,
  scrollDepth?: number
): Promise<void> {
  dbLogger.debug('markAsRead 开始:', { id, readDuration, scrollDepth })
  
  const recommendation = await db.recommendations.get(id)
  if (!recommendation) {
    dbLogger.error('❌ 推荐记录不存在:', id)
    throw new Error(`推荐记录不存在: ${id}`)
  }
  
  dbLogger.debug('找到推荐记录:', {
    id: recommendation.id,
    title: recommendation.title,
    isRead: recommendation.isRead,
    sourceUrl: recommendation.sourceUrl
  })
  
  // 防重复：如果已经标记为已读，直接返回
  if (recommendation.isRead) {
    dbLogger.debug('⚠️ 推荐已经是已读状态，跳过重复标记:', id)
    return
  }
  
  // 更新阅读状态
  const updates: Partial<Recommendation> = {
    isRead: true,
    clickedAt: Date.now(),
    readDuration,
    scrollDepth
  }
  
  // 自动评估有效性
  if (readDuration !== undefined && scrollDepth !== undefined) {
    if (readDuration > 120 && scrollDepth > 0.7) {
      // 深度阅读：>2min + >70% scroll
      updates.effectiveness = 'effective'
    } else {
      // 浅度阅读
      updates.effectiveness = 'neutral'
    }
  }
  
  await db.transaction('rw', [db.recommendations, db.feedArticles], async () => {
    // 1. 更新推荐记录
    await db.recommendations.update(id, updates)
    
    // 2. Phase 10: 同步更新 feedArticles 的 inPool 状态
    try {
      const article = await db.feedArticles
        .where('link').equals(recommendation.url)
        .first()
      
      if (article) {
        const now = Date.now()
        await db.feedArticles.update(article.id, {
          read: true,                    // 标记已读
          inPool: false,                 // Phase 10: 移出推荐池
          poolRemovedAt: now,
          poolRemovedReason: 'read'
        })
        dbLogger.debug('✅ 已同步更新文章状态: read=true, inPool=false')
      }
    } catch (error) {
      dbLogger.warn('同步更新文章状态失败:', error)
    }
  })
  
  dbLogger.debug('✅ markAsRead 完成:', {
    id,
    updates
  })
  
  // 清除统计缓存
  statsCache.invalidate('rec-stats-7d')
  
  // Phase 6: 立即更新 RSS 源统计（会重新计算 recommendedReadCount）
  // Phase 7 优化: recommendedReadCount 直接从推荐池统计，无需同步 latestArticles
  if (recommendation.sourceUrl) {
    await updateFeedStats(recommendation.sourceUrl)
  }
  
  // Phase 8.3: 用户阅读行为立即触发画像更新
  // 确保用户偏好能立即反映在下次推荐中
  ProfileUpdateScheduler.forceUpdateProfile('user_read').catch(error => {
    dbLogger.error('❌ 用户阅读后画像更新失败:', error)
  })
}

/**
 * 标记推荐为"不想读"
 * 
 * Phase 7: 使用软删除，更新 status 为 dismissed
 * Phase 10: 同步更新 feedArticles 的 inPool 状态
 * 
 * @param ids - 推荐记录 ID 数组
 */
export async function dismissRecommendations(ids: string[]): Promise<void> {
  const now = Date.now()
  const sourceUrls = new Set<string>()
  
  await db.transaction('rw', db.recommendations, db.feedArticles, async () => {
    for (const id of ids) {
      // 1. 更新推荐表（Phase 7: 添加 status 字段）
      await db.recommendations.update(id, {
        feedback: 'dismissed',
        feedbackAt: now,
        effectiveness: 'ineffective',
        status: 'dismissed',  // Phase 7: 软删除标记
        replacedAt: now       // Phase 7: 记录标记时间
      })
      
      // 2. Phase 10: 同步更新 feedArticles 表中的文章状态
      const recommendation = await db.recommendations.get(id)
      if (recommendation?.url) {
        try {
          // 通过 URL 查找文章
          const article = await db.feedArticles
            .where('link').equals(recommendation.url)
            .first()
          
          if (article) {
            // 标记文章为不想读 + 移出推荐池
            await db.feedArticles.update(article.id, {
              disliked: true,
              inPool: false,                    // Phase 10: 移出推荐池
              poolRemovedAt: now,
              poolRemovedReason: 'disliked'
            })
            dbLogger.debug('✅ 已同步标记文章为不想读: inPool=false, disliked=true', article.title)
          } else {
            dbLogger.warn('⚠️ 未找到匹配的文章:', recommendation.url)
          }
          
          // 3. 收集需要更新统计的源 URL
          if (recommendation.sourceUrl) {
            sourceUrls.add(recommendation.sourceUrl)
          }
        } catch (error) {
          dbLogger.warn('同步更新文章不想读状态失败:', error)
        }
      }
    }
  })
  
  // 4. 事务外更新统计（确保能看到事务提交后的数据）
  for (const sourceUrl of sourceUrls) {
    await updateFeedStats(sourceUrl)
  }
  
  // Phase 8.3: 用户拒绝行为立即触发画像更新
  // 确保用户不喜欢的内容能立即影响推荐
  ProfileUpdateScheduler.forceUpdateProfile('user_dismiss').catch(error => {
    dbLogger.error('❌ 用户拒绝后画像更新失败:', error)
  })
}

/**
 * 获取未读推荐（按时间倒序）
 * 
 * Phase 7: 只返回 active 状态的推荐
 * 
 * @param limit - 数量限制（默认 50）
 */
/**
 * 获取未读推荐
 * 
 * Phase 10: 只返回仍在源中（inFeed=true）且在推荐池中（inPool=true）的推荐
 * 
 * 说明：
 * - recommendations 表是历史日志（所有曾推荐过的文章）
 * - feedArticles 表的 inPool 字段是实时推荐池状态
 * - 需要联查确保推荐的文章仍在 RSS 源中且仍在推荐池中
 * 
 * @param limit - 最多返回的推荐数
 * @returns 未读推荐列表（按分数降序）
 */
export async function getUnreadRecommendations(limit: number = 50): Promise<Recommendation[]> {
  // Phase 10: 过滤掉已读、已忽略、非活跃和不在推荐池中的推荐
  const recommendations = await db.recommendations
    .filter(r => {
      // 必须是活跃状态
      const isActive = !r.status || r.status === 'active'
      // 未读且未被忽略
      const isUnreadAndNotDismissed = !r.isRead && r.feedback !== 'dismissed'
      return isActive && isUnreadAndNotDismissed
    })
    .toArray()
  
  // Phase 10: 联查 feedArticles，过滤掉不在源中或不在推荐池中的文章
  // 同时将无效的推荐标记为 inactive，避免重复查询
  const validRecommendations: Recommendation[] = []
  const invalidRecommendations: Recommendation[] = []
  
  for (const rec of recommendations) {
    const article = await db.feedArticles.where('link').equals(rec.url).first()
    if (article && article.inFeed !== false && article.inPool === true) {
      validRecommendations.push(rec)
    } else {
      invalidRecommendations.push(rec)
    }
  }
  
  // 将无效推荐标记为 inactive 状态
  if (invalidRecommendations.length > 0) {
    await db.recommendations.bulkUpdate(
      invalidRecommendations.map(rec => ({
        key: rec.id,
        changes: { status: 'inactive' as const }
      }))
    )
    dbLogger.debug(`已将 ${invalidRecommendations.length} 条无效推荐标记为 inactive（不在源中或已移出推荐池）`)
  }
  
  // 按推荐分数降序排序，取前 N 条
  const result = validRecommendations
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit)
  
  dbLogger.debug(`获取未读推荐: 有效 ${validRecommendations.length}，返回 ${result.length}`)
  
  return result
}

/**
 * 获取待推荐文章数量
 * 
 * Phase 10: 从 feedArticles 表统计（与 collectArticles 逻辑一致）
 * 
 * @param source - 来源类型
 * @returns 待推荐文章数量（未分析的文章）
 */
export async function getUnrecommendedArticleCount(
  source: 'subscribed' | 'all' = 'subscribed'
): Promise<number> {
  try {
    // 1. 获取 RSS 源
    let feeds: DiscoveredFeed[]
    if (source === 'subscribed') {
      feeds = await db.discoveredFeeds
        .where('status')
        .equals('subscribed')
        .toArray()
    } else {
      feeds = await db.discoveredFeeds.toArray()
    }
    
    // 2. Phase 10: 从 feedArticles 表统计未分析的文章
    // 只统计 inFeed=true（仍在RSS源中）的未分析文章
    let totalUnanalyzed = 0
    for (const feed of feeds) {
      const feedArticles = await db.feedArticles
        .where('feedId').equals(feed.id)
        .toArray()
      
      // 筛选条件：inFeed=true && !analysis
      const unanalyzedCount = feedArticles.filter(
        article => (article.inFeed !== false) && !article.analysis
      ).length
      
      totalUnanalyzed += unanalyzedCount
    }
    
    dbLogger.debug(`待推荐文章数量: ${totalUnanalyzed}（来源: ${source}）`)
    return totalUnanalyzed
  } catch (error) {
    dbLogger.error('获取待推荐文章数量失败:', error)
    return 0
  }
}

/**
 * 重置推荐数据
 * Phase 6: 清空推荐池和历史，重置统计数字，清除所有文章的评分和分析数据
 */
export async function resetRecommendationData(): Promise<void> {
  try {
    // 1. 清空推荐池
    await db.recommendations.clear()
    dbLogger.info('清空推荐池')
    
    // 2. 重置所有 RSS 源的推荐数为 0，并清除所有文章的评分和分析数据
    const allFeeds = await db.discoveredFeeds.toArray()
    let totalArticlesCleared = 0
    
    for (const feed of allFeeds) {
      // 清除所有文章的 analysis、recommended 和 tfidfScore 字段
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        feed.latestArticles.forEach(article => {
          delete article.analysis       // 清除 AI 分析结果
          delete article.recommended    // 清除推荐池标记
          delete article.tfidfScore     // 清除 TF-IDF 评分缓存（但保留全文）
        })
        totalArticlesCleared += feed.latestArticles.length
      }
      
      await db.discoveredFeeds.update(feed.id, {
        recommendedCount: 0,
        latestArticles: feed.latestArticles || []
      })
    }
    dbLogger.info(`重置 RSS 源推荐数: ${allFeeds.length} 个源`)
    dbLogger.info(`清除文章评分和分析数据: ${totalArticlesCleared} 篇文章`)
    
    // 3. 清空自适应指标（推荐相关的统计）
    await chrome.storage.local.remove('adaptive-metrics')
    dbLogger.info('清空自适应指标')
    
    dbLogger.info('✅ 推荐数据重置完成')
  } catch (error) {
    dbLogger.error('❌ 重置推荐数据失败:', error)
    throw error
  }
}
