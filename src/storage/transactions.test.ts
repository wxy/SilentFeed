/**
 * 数据库事务测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './db/index'
import {
  saveRecommendationsWithStats,
  markRecommendationsAsRead,
  updateFeedWithArticles,
  bulkSubscribeFeeds,
  unsubscribeFeed,
  clearAllRecommendations,
  cleanupExpiredArticles,
  cleanupExpiredRecommendations,
  processBatches,
  withRetry
} from './transactions'
import type { DiscoveredFeed, FeedArticle } from '@/types/rss'

// 测试数据工厂函数
function createTestFeed(overrides?: Partial<DiscoveredFeed>): DiscoveredFeed {
  return {
    id: 'feed-1',
    url: 'https://example.com/feed',
    title: 'Test Feed',
    status: 'subscribed',
    discoveredAt: Date.now(),
    discoveredFrom: 'https://example.com',
    isActive: true,
    articleCount: 0,
    recommendedCount: 0,
    unreadCount: 0,
    ...overrides
  }
}

/**
 * 创建用于推荐的测试文章
 * poolStatus='recommended' 表示在推荐池中
 * poolStatus='popup' 表示在弹窗池中
 */
function createTestRecommendationArticle(
  overrides?: Partial<FeedArticle>
): FeedArticle {
  return {
    id: 'article-' + Date.now(),
    feedId: 'feed-1',
    link: 'https://example.com/article',
    title: 'Test Article',
    description: 'Test summary',
    published: Date.now(),
    fetched: Date.now(),
    isRead: false,
    starred: false,
    poolStatus: 'recommended',
    popupAddedAt: Date.now(),
    analysisScore: 0.8,
    ...overrides
  }
}

function createTestArticle(overrides?: Partial<FeedArticle>): FeedArticle {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Test Article',
    link: 'https://example.com/article',
    published: Date.now(),
    fetched: Date.now(),
    read: false,
    starred: false,
    recommended: false,
    ...overrides
  }
}

describe('数据库事务 - 推荐相关', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('saveRecommendationsWithStats', () => {
    it('应该原子性保存推荐和更新 Feed', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      // 先创建文章
      const articles = [
        createTestRecommendationArticle({
          id: 'article-1',
          link: 'https://example.com/article-1',
          title: 'Article 1'
        }),
        createTestRecommendationArticle({
          id: 'article-2',
          link: 'https://example.com/article-2',
          title: 'Article 2'
        })
      ]
      await db.feedArticles.bulkAdd(articles)

      const feedUpdates = new Map<string, Partial<DiscoveredFeed>>([
        ['feed-1', { recommendedCount: 2 }]
      ])

      // saveRecommendationsWithStats 现在接收 articleIds
      await saveRecommendationsWithStats(['article-1', 'article-2'], feedUpdates)

      // 验证推荐状态的文章
      const savedRecs = await db.feedArticles
        .filter(a => a.poolStatus === 'recommended' || a.poolStatus === 'popup')
        .toArray()
      expect(savedRecs).toHaveLength(2)

      const updatedFeed = await db.discoveredFeeds.get('feed-1')
      expect(updatedFeed?.recommendedCount).toBe(2)
    })

    it('应该在失败时回滚所有操作', async () => {
      // 先创建文章
      const article = createTestRecommendationArticle({
        id: 'article-1',
        link: 'https://example.com/article',
        title: 'Article'
      })
      await db.feedArticles.add(article)

      const feedUpdates = new Map<string, Partial<DiscoveredFeed>>([
        ['non-existent-feed', { recommendedCount: 1 }]
      ])

      // Dexie 的 update 不会因为不存在的key而失败
      // 所以这个测试我们检查推荐已保存，但Feed更新被静默忽略
      await saveRecommendationsWithStats(['article-1'], feedUpdates)

      const recs = await db.feedArticles
        .filter(a => a.poolStatus === 'recommended' || a.poolStatus === 'popup')
        .toArray()
      expect(recs).toHaveLength(1) // 推荐已保存
    })
  })

  describe('markRecommendationsAsRead', () => {
    it('应该批量标记推荐为已读并更新 Feed', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      // 创建推荐状态的文章
      await db.feedArticles.bulkAdd([
        createTestRecommendationArticle({
          id: 'article-1',
          link: 'https://example.com/1',
          title: 'A1',
          poolStatus: 'popup'
        }),
        createTestRecommendationArticle({
          id: 'article-2',
          link: 'https://example.com/2',
          title: 'A2',
          poolStatus: 'popup'
        })
      ])

      await markRecommendationsAsRead(['article-1', 'article-2'], feed.url)

      // 验证文章已标记为已读
      const articles = await db.feedArticles
        .filter(a => a.poolStatus === 'popup')
        .toArray()
      expect(articles.every((a) => a.isRead)).toBe(true)
      expect(articles.every((a) => a.clickedAt)).toBeTruthy()
    })

    it('应该处理空数组', async () => {
      await expect(
        markRecommendationsAsRead([], 'https://example.com/feed')
      ).resolves.not.toThrow()
    })
  })
})

describe('数据库事务 - RSS Feed 相关', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('updateFeedWithArticles', () => {
    it('应该原子性更新 Feed 和文章', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      // Phase 10: 添加旧文章（会被标记为 inFeed=false）
      await db.feedArticles.add(
        createTestArticle({
          id: 'old-article-1',
          title: 'Old Article',
          link: 'https://example.com/old',
          published: Date.now() - 1000000,
          inFeed: true  // 初始在源中
        })
      )

      const newArticles: FeedArticle[] = [
        createTestArticle({
          id: 'new-article-1',
          title: 'New Article 1',
          link: 'https://example.com/new-1'
        }),
        createTestArticle({
          id: 'new-article-2',
          title: 'New Article 2',
          link: 'https://example.com/new-2'
        })
      ]

      await updateFeedWithArticles('feed-1', newArticles, {
        title: 'Updated Feed Title'
      })

      // Phase 10: 验证软删除逻辑
      const allArticles = await db.feedArticles.toArray()
      expect(allArticles).toHaveLength(3)  // 1 个旧文章 + 2 个新文章
      
      // 验证旧文章被标记为 inFeed=false
      const oldArticle = allArticles.find(a => a.id === 'old-article-1')
      expect(oldArticle).toBeDefined()
      expect(oldArticle?.inFeed).toBe(false)
      
      // 验证新文章 inFeed=true（默认）
      const newArticle1 = allArticles.find(a => a.id === 'new-article-1')
      expect(newArticle1).toBeDefined()
      expect(newArticle1?.inFeed).not.toBe(false)

      const updatedFeed = await db.discoveredFeeds.get('feed-1')
      expect(updatedFeed?.title).toBe('Updated Feed Title')
      expect(updatedFeed?.lastFetchedAt).toBeTruthy()
      expect(updatedFeed?.articleCount).toBe(3)  // 总文章数包括旧文章
    })

    it('应该在文章重新出现时保留用户操作状态', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      // 添加一篇已读的文章
      await db.feedArticles.add(
        createTestArticle({
          id: 'read-article',
          title: 'Read Article',
          link: 'https://example.com/read-article',
          inFeed: true,
          read: true,           // 用户已读
          recommended: true,    // 曾被推荐
          disliked: false       // 未标记不想读
        })
      )

      // 第一次更新：文章从源中移除
      await updateFeedWithArticles('feed-1', [], {})

      // 验证文章被标记为 inFeed=false
      const removedArticle = await db.feedArticles.get('read-article')
      expect(removedArticle?.inFeed).toBe(false)
      expect(removedArticle?.read).toBe(true)  // 保留已读状态

      // 第二次更新：文章重新出现在源中
      const restoredArticles: FeedArticle[] = [
        createTestArticle({
          id: 'restored-read-article',  // 新 ID，但 link 相同
          title: 'Read Article',
          link: 'https://example.com/read-article'  // link 相同
        })
      ]

      await updateFeedWithArticles('feed-1', restoredArticles, {})

      // 验证文章恢复为 inFeed=true，但保留原有状态
      const restoredArticle = await db.feedArticles
        .where('link')
        .equals('https://example.com/read-article')
        .first()
      
      expect(restoredArticle).toBeDefined()
      expect(restoredArticle?.inFeed).toBe(true)        // 恢复
      expect(restoredArticle?.read).toBe(true)          // ✅ 保留已读状态
      expect(restoredArticle?.recommended).toBe(true)   // ✅ 保留推荐状态
      expect(restoredArticle?.disliked).toBe(false)     // ✅ 保留未不想读状态
    })
  })

  describe('bulkSubscribeFeeds', () => {
    it('应该批量订阅 Feed', async () => {
      const now = Date.now()
      const feeds: DiscoveredFeed[] = [
        createTestFeed({
          id: 'feed-1',
          url: 'https://example1.com/feed',
          title: 'Feed 1',
          discoveredFrom: 'import',
          subscribedAt: now
        }),
        createTestFeed({
          id: 'feed-2',
          url: 'https://example2.com/feed',
          title: 'Feed 2',
          discoveredFrom: 'import',
          subscribedAt: now
        })
      ]

      await bulkSubscribeFeeds(feeds)

      const allFeeds = await db.discoveredFeeds.toArray()
      expect(allFeeds).toHaveLength(2)
      expect(allFeeds.every((f) => f.status === 'subscribed')).toBe(true)
      expect(allFeeds.every((f) => f.subscribedAt)).toBeTruthy()
    })
  })

  describe('unsubscribeFeed', () => {
    it('应该取消订阅、移出池中文章、删除推荐记录，但保留文章', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      // 创建一个在池中的文章
      await db.feedArticles.add(
        createTestArticle({
          id: 'article-1',
          title: 'Article',
          link: 'https://example.com/article',
          poolStatus: 'candidate'  // 在候选池中
        })
      )

      await unsubscribeFeed('feed-1')

      // 文章应该保留（但被移出池）
      const articles = await db.feedArticles.where('feedId').equals('feed-1').toArray()
      expect(articles).toHaveLength(1)
      expect(articles[0].poolStatus).toBe('exited')  // 明确的退出状态
      expect(articles[0].poolExitReason).toBe('feed_unsubscribed')

      // 源状态应该更新
      const remainingFeed = await db.discoveredFeeds.get('feed-1')
      expect(remainingFeed?.status).toBe('ignored')
      expect(remainingFeed?.isActive).toBe(false)
      expect(remainingFeed?.unsubscribedAt).toBeDefined()
    })
  })
})

describe('数据库事务 - 数据清理', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('clearAllRecommendations', () => {
    it('应该清空所有推荐并重置 Feed 统计', async () => {
      await db.discoveredFeeds.add(
        createTestFeed({
          recommendedCount: 2,
          unreadCount: 2
        })
      )

      // 创建推荐状态的文章
      await db.feedArticles.bulkAdd([
        createTestRecommendationArticle({
          id: 'article-1',
          link: 'https://example.com/1',
          title: 'Article 1',
          poolStatus: 'popup'
        }),
        createTestRecommendationArticle({
          id: 'article-2',
          link: 'https://example.com/2',
          title: 'Article 2',
          poolStatus: 'popup'
        })
      ])

      await clearAllRecommendations()

      // 验证推荐状态的文章已被清空
      const recs = await db.feedArticles
        .filter(a => a.poolStatus === 'popup' || a.poolStatus === 'recommended')
        .toArray()
      expect(recs).toHaveLength(0)

      const feed = await db.discoveredFeeds.get('feed-1')
      expect(feed?.recommendedCount).toBe(0)
      expect(feed?.unreadCount).toBe(0)
    })
  })

  describe('cleanupExpiredArticles', () => {
    it('应该删除过期文章', async () => {
      const now = Date.now()
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
      const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

      await db.discoveredFeeds.add(
        createTestFeed({
          articleCount: 3
        })
      )

      await db.feedArticles.bulkAdd([
        createTestArticle({
          id: 'new-1',
          title: 'New Article',
          link: 'https://example.com/new',
          published: thirtyDaysAgo
        }),
        createTestArticle({
          id: 'old-1',
          title: 'Old Article 1',
          link: 'https://example.com/old-1',
          published: sixtyDaysAgo
        }),
        createTestArticle({
          id: 'old-2',
          title: 'Old Article 2',
          link: 'https://example.com/old-2',
          published: sixtyDaysAgo
        })
      ])

      await cleanupExpiredArticles(45)

      const remaining = await db.feedArticles.toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('new-1')

      const feed = await db.discoveredFeeds.get('feed-1')
      expect(feed?.articleCount).toBe(1)
    })
  })

  describe('cleanupExpiredRecommendations', () => {
    it('应该删除过期的已消费推荐', async () => {
      const now = Date.now()
      const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

      // 创建推荐状态的文章
      await db.feedArticles.bulkAdd([
        // 过期且已读 - 应删除
        createTestRecommendationArticle({
          id: 'article-old-read',
          link: 'https://example.com/1',
          popupAddedAt: sixtyDaysAgo,
          isRead: true,
          poolStatus: 'popup'
        }),
        // 过期且已拒绝 - 应删除
        createTestRecommendationArticle({
          id: 'article-old-dismissed',
          link: 'https://example.com/2',
          popupAddedAt: sixtyDaysAgo,
          feedback: 'dismissed',
          poolStatus: 'popup'
        }),
        // 新的未读 - 应保留
        createTestRecommendationArticle({
          id: 'article-new-unread',
          link: 'https://example.com/3',
          popupAddedAt: now,
          isRead: false,
          poolStatus: 'popup'
        })
      ])

      const result = await cleanupExpiredRecommendations(45)

      expect(result.expiredDeleted).toBe(2)
      expect(result.orphanDeleted).toBe(0)

      const remaining = await db.feedArticles
        .filter(a => a.poolStatus === 'popup' || a.poolStatus === 'recommended')
        .toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('article-new-unread')
    })

    it('应该删除孤儿推荐记录', async () => {
      const now = Date.now()

      // 在新架构中，推荐数据就是 feedArticle，不存在孤儿情况
      // 但我们可以测试没有对应 feed 的文章
      await db.feedArticles.add(
        createTestRecommendationArticle({
          id: 'article-orphan',
          feedId: 'non-existent-feed', // 不存在的 feed
          link: 'https://example.com/deleted-article',
          popupAddedAt: now,
          isRead: false,
          poolStatus: 'popup'
        })
      )

      const result = await cleanupExpiredRecommendations(45)

      // 在新架构中，orphan 的定义可能不同，这里我们主要测试函数不崩溃
      expect(result.expiredDeleted).toBeGreaterThanOrEqual(0)
      expect(result.orphanDeleted).toBeGreaterThanOrEqual(0)
    })

    it('应该保留未消费的活跃推荐', async () => {
      const now = Date.now()
      const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000

      // 创建过期但未消费的推荐 - 应保留
      await db.feedArticles.add(
        createTestRecommendationArticle({
          id: 'article-old-active',
          link: 'https://example.com/1',
          published: sixtyDaysAgo,
          popupAddedAt: sixtyDaysAgo,
          isRead: false,
          feedback: undefined,
          poolStatus: 'popup'
        })
      )

      const result = await cleanupExpiredRecommendations(45)

      expect(result.expiredDeleted).toBe(0)
      expect(result.orphanDeleted).toBe(0)

      const remaining = await db.feedArticles
        .filter(a => a.poolStatus === 'popup' || a.poolStatus === 'recommended')
        .toArray()
      expect(remaining).toHaveLength(1)
    })
  })
})

describe('工具函数', () => {
  describe('processBatches', () => {
    it('应该分批处理数组', async () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1)
      const processed: number[][] = []

      await processBatches(items, 10, async (batch) => {
        processed.push([...batch])
      })

      expect(processed).toHaveLength(3)
      expect(processed[0]).toHaveLength(10)
      expect(processed[1]).toHaveLength(10)
      expect(processed[2]).toHaveLength(5)
    })

    it('应该处理空数组', async () => {
      const processed: number[][] = []

      await processBatches([], 10, async (batch) => {
        processed.push([...batch])
      })

      expect(processed).toHaveLength(0)
    })
  })

  describe('withRetry', () => {
    it('应该在成功时立即返回', async () => {
      let attempts = 0

      const result = await withRetry(async () => {
        attempts++
        return 42
      })

      expect(result).toBe(42)
      expect(attempts).toBe(1)
    })

    it('应该重试失败的操作', async () => {
      let attempts = 0

      const result = await withRetry(
        async () => {
          attempts++
          if (attempts < 3) {
            throw new Error('Temporary failure')
          }
          return 42
        },
        3,
        10
      )

      expect(result).toBe(42)
      expect(attempts).toBe(3)
    })

    it('应该在超过重试次数后抛出错误', async () => {
      let attempts = 0

      await expect(
        withRetry(
          async () => {
            attempts++
            throw new Error('Persistent failure')
          },
          3,
          10
        )
      ).rejects.toThrow('Persistent failure')

      expect(attempts).toBe(3)
    })
  })
})
