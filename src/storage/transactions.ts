/**
 * 数据库事务封装
 * 
 * Phase 7: 数据库优化 - 添加事务支持
 * 
 * 本文件为关键的多表操作提供事务包装，确保原子性和数据一致性。
 * 
 * @module storage/transactions
 */

import { db } from './db/index'
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
 * Phase 10: 增量追加策略
 * 
 * 场景：RSS 抓取完成后，需要：
 * 1. 将不在新列表的文章标记为 inFeed=false（软删除）
 * 2. 将 inFeed=false 且 inPool=true 的文章踢出推荐池（inPool=false）
 * 3. 追加新文章（link 去重）
 * 4. 更新 Feed 元数据（抓取时间、文章数等）
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
  txLogger.debug('更新 Feed 和文章（事务 - Phase 10）', {
    feedId,
    新文章数: newArticles.length
  })

  let removedFromFeedCount = 0
  let kickedFromPoolCount = 0
  let addedCount = 0
  let restoredCount = 0

  await db.transaction(
    'rw',
    [db.discoveredFeeds, db.feedArticles],
    async () => {
      // Phase 10: 1. 获取该 Feed 的所有现有文章
      const existingArticles = await db.feedArticles
        .where('feedId')
        .equals(feedId)
        .toArray()
      
      // 2. 构建新文章的 URL 集合（用于快速查找）
      const newArticleUrls = new Set(newArticles.map(a => a.link))
      
      // 3. 标记不在新列表中的文章为 inFeed=false，并踢出推荐池
      for (const article of existingArticles) {
        if (!newArticleUrls.has(article.link) && article.inFeed !== false) {
          // 文章已从 RSS 源中移除
          await db.feedArticles.update(article.id, {
            inFeed: false,
            inPool: false,  // 踢出推荐池
            metadataUpdatedAt: Date.now()
          })
          removedFromFeedCount++
          
          if (article.inPool === true) {
            kickedFromPoolCount++
          }
        }
      }
      
      if (removedFromFeedCount > 0) {
        txLogger.debug(`✓ 标记 ${removedFromFeedCount} 篇文章为 inFeed=false，踢出推荐池 ${kickedFromPoolCount} 篇`)
      }
      
      // 4. 追加新文章（去重 - 跨源检查）
      const existingUrls = new Set(existingArticles.map(a => a.link))
      const potentialNewArticles = newArticles.filter(a => !existingUrls.has(a.link))
      
      // Phase 10: 检查其他源是否已包含这些文章（跨源去重）
      const articlesToAdd: FeedArticle[] = []
      let skippedCrossFeedCount = 0
      
      for (const article of potentialNewArticles) {
        // 检查是否已存在于其他源
        const existingInOtherFeed = await db.feedArticles
          .where('link')
          .equals(article.link)
          .first()
        
        if (existingInOtherFeed) {
          // 文章已存在于其他源，跳过
          skippedCrossFeedCount++
          txLogger.debug(`⏩ 跳过跨源重复文章: ${article.title} (已存在于源 ${existingInOtherFeed.feedId})`)
        } else {
          articlesToAdd.push(article)
        }
      }
      
      if (articlesToAdd.length > 0) {
        await db.feedArticles.bulkAdd(articlesToAdd)
        addedCount = articlesToAdd.length
        txLogger.debug(`✓ 追加 ${addedCount} 篇新文章${skippedCrossFeedCount > 0 ? `，跳过 ${skippedCrossFeedCount} 篇跨源重复` : ''}`)
      } else if (skippedCrossFeedCount > 0) {
        txLogger.debug(`⏩ 所有 ${skippedCrossFeedCount} 篇文章均为跨源重复，已跳过`)
      }
      
      // 5. 将之前标记为 inFeed=false 但现在又出现的文章恢复为 inFeed=true
      const articlesToRestore = existingArticles.filter(a => 
        newArticleUrls.has(a.link) && a.inFeed === false
      )
      
      if (articlesToRestore.length > 0) {
        for (const article of articlesToRestore) {
          await db.feedArticles.update(article.id, {
            inFeed: true,
            metadataUpdatedAt: Date.now()
          })
        }
        restoredCount = articlesToRestore.length
        txLogger.debug(`✓ 恢复 ${restoredCount} 篇文章为 inFeed=true`)
      }

      // 6. 更新 Feed 元数据
      await db.discoveredFeeds.update(feedId, {
        ...feedUpdates,
        lastFetchedAt: Date.now(),
        articleCount: existingArticles.length + addedCount
      })
      txLogger.debug('✓ 已更新 Feed 元数据')
    }
  )

  txLogger.info(`Feed 更新成功（新增 ${addedCount}，移除 ${removedFromFeedCount}，踢出池 ${kickedFromPoolCount}，恢复 ${restoredCount}）`)
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
 * 1. 更新 Feed 状态为 unsubscribed（专门的取消订阅状态）
 * 2. 将该 Feed 所有在池中的文章移出（设置 poolExitReason='feed_unsubscribed'）
 * 3. 删除该 Feed 的所有推荐记录
 * 4. 保留文章记录（不删除，用于历史统计）
 * 
 * 注意：取消订阅≠删除，文章保留但不再参与推荐流程
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

  const now = Date.now()

  await db.transaction(
    'rw',
    [db.discoveredFeeds, db.recommendations, db.feedArticles],
    async () => {
      // 1. 更新 Feed 状态为 unsubscribed
      await db.discoveredFeeds.update(feedId, {
        status: 'ignored',  // 复用 ignored 状态，语义上表示不再处理
        isActive: false,
        unsubscribedAt: now  // 记录取消订阅时间
      })

      // 2. 将所有在池中的文章移出（不删除，保留历史）
      const articlesInPool = await db.feedArticles
        .where('feedId')
        .equals(feedId)
        .filter(a => a.poolStatus && !a.poolExitedAt)
        .toArray()
      
      for (const article of articlesInPool) {
        await db.feedArticles.update(article.id, {
          poolStatus: 'exited',
          poolExitedAt: now,
          poolExitReason: 'feed_unsubscribed',
          // 兼容旧字段
          inPool: false,
          poolRemovedAt: now,
          poolRemovedReason: 'expired'  // 旧字段没有 feed_unsubscribed
        })
      }
      txLogger.debug(`✓ 移出池中文章: ${articlesInPool.length} 篇`)

      // 3. 删除所有推荐记录（清理推荐池中的显示）
      const deletedRecs = await db.recommendations
        .where('sourceUrl')
        .equals(feed.url)
        .delete()
      txLogger.debug(`✓ 删除推荐记录: ${deletedRecs} 条`)
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
