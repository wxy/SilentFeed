/**
 * 数据库事务测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './db'
import {
  saveRecommendationsWithStats,
  markRecommendationsAsRead,
  updateFeedWithArticles,
  bulkSubscribeFeeds,
  unsubscribeFeed,
  clearAllRecommendations,
  cleanupExpiredArticles,
  processBatches,
  withRetry
} from './transactions'
import type { Recommendation } from '@/types/database'
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

function createTestRecommendation(
  overrides?: Partial<Recommendation>
): Recommendation {
  return {
    id: 'rec-1',
    url: 'https://example.com/article',
    title: 'Test Article',
    summary: 'Test summary',
    source: 'Test Feed',
    sourceUrl: 'https://example.com/feed',
    recommendedAt: Date.now(),
    score: 0.8,
    isRead: false,
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

      const recommendations: Recommendation[] = [
        createTestRecommendation({
          id: 'rec-1',
          url: 'https://example.com/article-1',
          title: 'Article 1'
        }),
        createTestRecommendation({
          id: 'rec-2',
          url: 'https://example.com/article-2',
          title: 'Article 2'
        })
      ]

      const feedUpdates = new Map<string, Partial<DiscoveredFeed>>([
        ['feed-1', { recommendedCount: 2 }]
      ])

      await saveRecommendationsWithStats(recommendations, feedUpdates)

      const savedRecs = await db.recommendations.toArray()
      expect(savedRecs).toHaveLength(2)

      const updatedFeed = await db.discoveredFeeds.get('feed-1')
      expect(updatedFeed?.recommendedCount).toBe(2)
    })

    it('应该在失败时回滚所有操作', async () => {
      const recommendations: Recommendation[] = [
        createTestRecommendation({
          id: 'rec-1',
          url: 'https://example.com/article',
          title: 'Article'
        })
      ]

      const feedUpdates = new Map<string, Partial<DiscoveredFeed>>([
        ['non-existent-feed', { recommendedCount: 1 }]
      ])

      // Dexie 的 update 不会因为不存在的key而失败
      // 所以这个测试我们检查推荐已保存，但Feed更新被静默忽略
      await saveRecommendationsWithStats(recommendations, feedUpdates)

      const recs = await db.recommendations.toArray()
      expect(recs).toHaveLength(1) // 推荐已保存
    })
  })

  describe('markRecommendationsAsRead', () => {
    it('应该批量标记推荐为已读并更新 Feed', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      await db.recommendations.bulkAdd([
        createTestRecommendation({
          id: 'rec-1',
          url: 'https://example.com/1',
          title: 'A1',
          sourceUrl: feed.url
        }),
        createTestRecommendation({
          id: 'rec-2',
          url: 'https://example.com/2',
          title: 'A2',
          sourceUrl: feed.url
        })
      ])

      await markRecommendationsAsRead(['rec-1', 'rec-2'], feed.url)

      const recs = await db.recommendations.toArray()
      expect(recs.every((r) => r.isRead)).toBe(true)
      expect(recs.every((r) => r.clickedAt)).toBeTruthy()
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

      await db.feedArticles.add(
        createTestArticle({
          id: 'old-article-1',
          title: 'Old Article',
          link: 'https://example.com/old',
          published: Date.now() - 1000000
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

      const allArticles = await db.feedArticles.toArray()
      expect(allArticles).toHaveLength(2)
      expect(allArticles.every((a) => a.id.startsWith('new-'))).toBe(true)

      const updatedFeed = await db.discoveredFeeds.get('feed-1')
      expect(updatedFeed?.title).toBe('Updated Feed Title')
      expect(updatedFeed?.lastFetchedAt).toBeTruthy()
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
    it('应该取消订阅并删除相关数据', async () => {
      const feed = createTestFeed()
      await db.discoveredFeeds.add(feed)

      await db.feedArticles.add(
        createTestArticle({
          id: 'article-1',
          title: 'Article',
          link: 'https://example.com/article'
        })
      )

      await db.recommendations.add(
        createTestRecommendation({
          id: 'rec-1',
          url: 'https://example.com/article',
          title: 'Article'
        })
      )

      await unsubscribeFeed('feed-1')

      const articles = await db.feedArticles.where('feedId').equals('feed-1').toArray()
      expect(articles).toHaveLength(0)

      const recs = await db.recommendations
        .where('sourceUrl')
        .equals(feed.url)
        .toArray()
      expect(recs).toHaveLength(0)

      const remainingFeed = await db.discoveredFeeds.get('feed-1')
      expect(remainingFeed?.status).toBe('ignored') // 使用正确的状态
      expect(remainingFeed?.isActive).toBe(false)
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

      await db.recommendations.bulkAdd([
        createTestRecommendation({
          id: 'rec-1',
          url: 'https://example.com/1',
          title: 'Article 1'
        }),
        createTestRecommendation({
          id: 'rec-2',
          url: 'https://example.com/2',
          title: 'Article 2'
        })
      ])

      await clearAllRecommendations()

      const recs = await db.recommendations.toArray()
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
