/**
 * 数据库事务封装
 * 
 * Phase 7: 数据库优化 - 添加事务支持
 * 
 * 本文件为关键的多表操作提供事务包装，确保原子性和数据一致性。
 * 
 * @module storage/transactions
 */

import { db } from './db'
import type { Recommendation } from '@/types/database'
import type { DiscoveredFeed, FeedArticle } from '@/types/rss'
import { logger } from '@/utils/logger'

const txLogger = logger.withTag('Transactions')

// ============================================================================
// 推荐相关事务
// ============================================================================

/**
 * 原子性保存推荐记录和更新 Feed 统计
 * 
 * 场景：AI 生成推荐后，需要同时：
 * 1. 保存推荐记录到 recommendations 表
 * 2. 更新对应 Feed 的推荐计数
 * 
 * 使用事务确保两个操作要么全部成功，要么全部失败。
 * 
 * @param recommendations - 推荐记录列表
 * @param feedUpdates - Feed 更新映射 (feedId -> 更新字段)
 */
export async function saveRecommendationsWithStats(
  recommendations: Recommendation[],
  feedUpdates: Map<string, Partial<DiscoveredFeed>>
): Promise<void> {
  txLogger.debug('开始保存推荐（事务）', {
    推荐数量: recommendations.length,
    Feed更新数: feedUpdates.size
  })

  await db.transaction(
    'rw',
    [db.recommendations, db.discoveredFeeds],
    async () => {
      // 1. 批量插入推荐记录
      await db.recommendations.bulkAdd(recommendations)
      txLogger.debug(`✓ 已插入 ${recommendations.length} 条推荐`)

      // 2. 更新所有相关 Feed 的统计
      for (const [feedId, updates] of feedUpdates.entries()) {
        await db.discoveredFeeds.update(feedId, updates)
      }
      txLogger.debug(`✓ 已更新 ${feedUpdates.size} 个 Feed 统计`)
    }
  )

  txLogger.info('推荐保存成功（事务完成）')
}

/**
 * 原子性批量标记推荐为已读
 * 
 * 场景：用户点击"全部标记为已读"时，需要同时：
 * 1. 更新多条推荐的 isRead 状态
 * 2. 更新 Feed 的已读计数
 * 
 * @param recommendationIds - 推荐 ID 列表
 * @param sourceUrl - 来源 Feed URL
 */
export async function markRecommendationsAsRead(
  recommendationIds: string[],
  sourceUrl: string
): Promise<void> {
  if (recommendationIds.length === 0) {
    txLogger.warn('没有要标记的推荐')
    return
  }

  txLogger.debug('批量标记为已读（事务）', {
    数量: recommendationIds.length,
    来源: sourceUrl
  })

  await db.transaction(
    'rw',
    [db.recommendations, db.discoveredFeeds],
    async () => {
      const now = Date.now()

      // 1. 批量更新推荐状态
      for (const id of recommendationIds) {
        await db.recommendations.update(id, {
          isRead: true,
          clickedAt: now
        })
      }

      // 2. 更新 Feed 的已读计数
      const feed = await db.discoveredFeeds.where('url').equals(sourceUrl).first()
      if (feed) {
        const readCount = (feed.readCount || 0) + recommendationIds.length
        await db.discoveredFeeds.update(feed.id, { readCount })
      }
    }
  )

  txLogger.info(`已标记 ${recommendationIds.length} 条推荐为已读`)
}

// ============================================================================
// RSS Feed 相关事务
// ============================================================================

/**
 * 原子性更新 Feed 和文章
 * 
 * 场景：RSS 抓取完成后，需要同时：
 * 1. 删除旧文章
 * 2. 插入新文章
 * 3. 更新 Feed 元数据（抓取时间、文章数等）
 * 
 * @param feedId - Feed ID
 * @param newArticles - 新抓取的文章列表
 * @param feedUpdates - Feed 更新字段
 */
export async function updateFeedWithArticles(
  feedId: string,
  newArticles: FeedArticle[],
  feedUpdates: Partial<DiscoveredFeed>
): Promise<void> {
  txLogger.debug('更新 Feed 和文章（事务）', {
    feedId,
    新文章数: newArticles.length
  })

  await db.transaction(
    'rw',
    [db.discoveredFeeds, db.feedArticles],
    async () => {
      // 1. 删除该 Feed 的所有旧文章
      const deletedCount = await db.feedArticles
        .where('feedId')
        .equals(feedId)
        .delete()
      txLogger.debug(`✓ 删除 ${deletedCount} 篇旧文章`)

      // 2. 批量插入新文章
      if (newArticles.length > 0) {
        await db.feedArticles.bulkAdd(newArticles)
        txLogger.debug(`✓ 插入 ${newArticles.length} 篇新文章`)
      }

      // 3. 更新 Feed 元数据
      await db.discoveredFeeds.update(feedId, {
        ...feedUpdates,
        lastFetchedAt: Date.now(),
        articleCount: newArticles.length
      })
      txLogger.debug('✓ 已更新 Feed 元数据')
    }
  )

  txLogger.info('Feed 更新成功（事务完成）')
}

/**
 * 原子性批量订阅 Feed
 * 
 * 场景：用户从 OPML 导入多个 Feed 时，需要原子性插入
 * 
 * @param feeds - Feed 列表
 */
export async function bulkSubscribeFeeds(
  feeds: DiscoveredFeed[]
): Promise<void> {
  if (feeds.length === 0) {
    txLogger.warn('没有要订阅的 Feed')
    return
  }

  txLogger.debug('批量订阅 Feed（事务）', { 数量: feeds.length })

  await db.transaction('rw', [db.discoveredFeeds], async () => {
    await db.discoveredFeeds.bulkAdd(feeds)
  })

  txLogger.info(`批量订阅成功：${feeds.length} 个 Feed`)
}

/**
 * 原子性取消订阅 Feed
 * 
 * 场景：取消订阅时，需要同时：
 * 1. 更新 Feed 状态为 ignored
 * 2. 删除该 Feed 的所有推荐记录
 * 3. 删除该 Feed 的所有文章
 * 
 * @param feedId - Feed ID
 */
export async function unsubscribeFeed(feedId: string): Promise<void> {
  const feed = await db.discoveredFeeds.get(feedId)
  if (!feed) {
    throw new Error(`Feed 不存在: ${feedId}`)
  }

  txLogger.debug('取消订阅 Feed（事务）', {
    feedId,
    feedUrl: feed.url
  })

  await db.transaction(
    'rw',
    [db.discoveredFeeds, db.recommendations, db.feedArticles],
    async () => {
      // 1. 更新 Feed 状态
      await db.discoveredFeeds.update(feedId, {
        status: 'ignored',
        isActive: false
      })

      // 2. 删除所有推荐记录
      const deletedRecs = await db.recommendations
        .where('sourceUrl')
        .equals(feed.url)
        .delete()
      txLogger.debug(`✓ 删除 ${deletedRecs} 条推荐`)

      // 3. 删除所有文章
      const deletedArticles = await db.feedArticles
        .where('feedId')
        .equals(feedId)
        .delete()
      txLogger.debug(`✓ 删除 ${deletedArticles} 篇文章`)
    }
  )

  txLogger.info('取消订阅成功（事务完成）')
}

// ============================================================================
// 数据清理相关事务
// ============================================================================

/**
 * 原子性清理所有推荐数据
 * 
 * 场景：用户点击"清空推荐历史"时，需要同时：
 * 1. 删除所有推荐记录
 * 2. 重置所有 Feed 的推荐计数
 */
export async function clearAllRecommendations(): Promise<void> {
  txLogger.debug('清空所有推荐（事务）')

  await db.transaction(
    'rw',
    [db.recommendations, db.discoveredFeeds],
    async () => {
      // 1. 删除所有推荐
      const deletedCount = await db.recommendations.clear()
      txLogger.debug(`✓ 删除 ${deletedCount} 条推荐`)

      // 2. 重置所有 Feed 的推荐相关计数
      const feeds = await db.discoveredFeeds.toArray()
      for (const feed of feeds) {
        await db.discoveredFeeds.update(feed.id, {
          recommendedCount: 0,
          readCount: 0,
          unreadCount: 0,
          recommendedReadCount: 0
        })
      }
      txLogger.debug(`✓ 重置 ${feeds.length} 个 Feed 的统计`)
    }
  )

  txLogger.info('推荐数据已清空（事务完成）')
}

/**
 * 原子性清理过期文章
 * 
 * 场景：定期清理超过保留期限的文章
 * 
 * @param retentionDays - 保留天数
 */
export async function cleanupExpiredArticles(retentionDays: number): Promise<void> {
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  txLogger.debug('清理过期文章（事务）', { 保留天数: retentionDays })

  await db.transaction(
    'rw',
    [db.feedArticles, db.discoveredFeeds],
    async () => {
      // 1. 删除过期文章
      const deletedCount = await db.feedArticles
        .where('published')
        .below(cutoffTime)
        .delete()
      txLogger.debug(`✓ 删除 ${deletedCount} 篇过期文章`)

      // 2. 更新受影响 Feed 的文章计数
      const feeds = await db.discoveredFeeds.toArray()
      for (const feed of feeds) {
        const remainingCount = await db.feedArticles
          .where('feedId')
          .equals(feed.id)
          .count()
        
        await db.discoveredFeeds.update(feed.id, {
          articleCount: remainingCount
        })
      }
      txLogger.debug('✓ 已更新 Feed 统计')
    }
  )

  txLogger.info(`清理完成：删除 ${retentionDays} 天前的文章`)
}

// ============================================================================
// 批量操作辅助函数
// ============================================================================

/**
 * 分批执行大量操作（避免单个事务过大）
 * 
 * @param items - 要处理的项目列表
 * @param batchSize - 每批大小
 * @param processor - 处理函数（接收一批项目）
 */
export async function processBatches<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>
): Promise<void> {
  txLogger.debug('分批处理', {
    总数: items.length,
    批大小: batchSize,
    批数: Math.ceil(items.length / batchSize)
  })

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await processor(batch)
    txLogger.debug(`✓ 完成批次 ${Math.floor(i / batchSize) + 1}`)
  }

  txLogger.info('分批处理完成')
}

/**
 * 重试机制包装器
 * 
 * 用于处理偶发的数据库错误（如锁冲突）
 * 
 * @param operation - 要执行的操作
 * @param maxRetries - 最大重试次数
 * @param delayMs - 重试延迟（毫秒）
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      if (attempt < maxRetries) {
        txLogger.warn(`操作失败，重试 ${attempt}/${maxRetries}`, { error })
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
      }
    }
  }

  txLogger.error(`操作失败，已重试 ${maxRetries} 次`, { error: lastError })
  throw lastError
}
