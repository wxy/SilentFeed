/**
 * 数据库 RSS Feed 管理模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import { updateFeedStats, updateAllFeedStats } from './db-feeds'
import type { FeedArticle, DiscoveredFeed } from '@/types/rss'

describe('db-feeds', () => {
  beforeEach(async () => {
    // 清空相关表
    await db.feedArticles.clear()
    await db.discoveredFeeds.clear()
  })

  describe('updateFeedStats', () => {
    it('应该正确计算 RSS 源的统计数据', async () => {
      // 1. 创建一个测试 RSS 源
      const feed: DiscoveredFeed = {
        id: 'feed-test-1',
        url: 'https://example.com/rss',
        title: 'Test Feed',
        discoveredFrom: 'test',
        discoveredAt: Date.now(),
        status: 'subscribed',
        subscriptionDate: Date.now(),
        isActive: true,
        articleCount: 0,
        recommendedCount: 0,
        unreadCount: 0
      } as DiscoveredFeed

      await db.discoveredFeeds.add(feed)

      // 2. 添加多种状态的文章
      const now = Date.now()
      const articles: FeedArticle[] = [
        {
          id: 'a1',
          feedId: 'feed-test-1',
          link: 'http://example.com/1',
          title: 'Raw Article',
          published: now,
          poolStatus: 'raw',
          inFeed: true
        },
        {
          id: 'a2',
          feedId: 'feed-test-1',
          link: 'http://example.com/2',
          title: 'Candidate Article',
          published: now,
          poolStatus: 'candidate',
          inFeed: true,
          analysis: { score: 0.8 } as any,
          analysisScore: 0.8,
          candidatePoolAddedAt: now
        },
        {
          id: 'a3',
          feedId: 'feed-test-1',
          link: 'http://example.com/3',
          title: 'Recommended Article',
          published: now,
          poolStatus: 'recommended',
          inFeed: true,
          analysis: { score: 0.9 } as any,
          analysisScore: 0.9,
          popupAddedAt: now,
          isRead: false
        },
        {
          id: 'a4',
          feedId: 'feed-test-1',
          link: 'http://example.com/4',
          title: 'Read Article',
          published: now,
          poolStatus: 'exited',
          inFeed: true,
          read: true,
          isRead: true,
          popupAddedAt: now - 1000,
          clickedAt: now
        },
        {
          id: 'a5',
          feedId: 'feed-test-1',
          link: 'http://example.com/5',
          title: 'Dismissed Article',
          published: now,
          poolStatus: 'exited',
          inFeed: true,
          feedback: 'dismissed',
          popupAddedAt: now - 2000,
          poolExitedAt: now - 1000
        }
      ] as FeedArticle[]

      await db.feedArticles.bulkAdd(articles)

      // 3. 更新统计
      await updateFeedStats(feed.url)

      // 4. 验证统计结果
      const updatedFeed = await db.discoveredFeeds.get(feed.id)
      expect(updatedFeed).toBeDefined()
      expect(updatedFeed!.articleCount).toBe(5) // 总文章数
      expect(updatedFeed!.inFeedCount).toBe(5) // 所有都在源中
      expect(updatedFeed!.analyzedCount).toBe(2) // 有 analysis 字段的
      expect(updatedFeed!.inFeedRawCount).toBe(1) // raw 状态
      expect(updatedFeed!.inFeedCandidateCount).toBe(1) // candidate 状态
      expect(updatedFeed!.inFeedRecommendedCount).toBe(1) // recommended 且未退出
      expect(updatedFeed!.readCount).toBe(1) // read=true
      expect(updatedFeed!.recommendedCount).toBe(3) // 所有推荐历史（1个recommended + 2个exited但有popupAddedAt）
      expect(updatedFeed!.recommendedReadCount).toBe(1) // 推荐中的已读
      expect(updatedFeed!.dislikedCount).toBe(1) // feedback='dismissed'
    })

    it('应该正确处理不在源中的文章', async () => {
      const feed: DiscoveredFeed = {
        id: 'feed-test-2',
        url: 'https://example.com/rss2',
        title: 'Test Feed 2',
        discoveredFrom: 'test',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        recommendedCount: 0,
        unreadCount: 0
      } as DiscoveredFeed

      await db.discoveredFeeds.add(feed)

      const articles: FeedArticle[] = [
        {
          id: 'a1',
          feedId: 'feed-test-2',
          link: 'http://example.com/1',
          title: 'In Feed',
          published: Date.now(),
          poolStatus: 'raw',
          inFeed: true
        },
        {
          id: 'a2',
          feedId: 'feed-test-2',
          link: 'http://example.com/2',
          title: 'Not In Feed',
          published: Date.now(),
          poolStatus: 'candidate',
          inFeed: false, // 不在源中
          analysis: { score: 0.8 } as any
        }
      ] as FeedArticle[]

      await db.feedArticles.bulkAdd(articles)

      await updateFeedStats(feed.url)

      const updatedFeed = await db.discoveredFeeds.get(feed.id)
      expect(updatedFeed!.articleCount).toBe(2) // 总文章数
      expect(updatedFeed!.inFeedCount).toBe(1) // 只有一篇在源中
    })

    it('应该正确统计已淘汰的文章', async () => {
      const feed: DiscoveredFeed = {
        id: 'feed-test-3',
        url: 'https://example.com/rss3',
        title: 'Test Feed 3',
        discoveredFrom: 'test',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        recommendedCount: 0,
        unreadCount: 0
      } as DiscoveredFeed

      await db.discoveredFeeds.add(feed)

      const articles: FeedArticle[] = [
        {
          id: 'a1',
          feedId: 'feed-test-3',
          link: 'http://example.com/1',
          title: 'Prescreened Out',
          published: Date.now(),
          poolStatus: 'prescreened-out',
          inFeed: true
        },
        {
          id: 'a2',
          feedId: 'feed-test-3',
          link: 'http://example.com/2',
          title: 'Not Qualified',
          published: Date.now(),
          poolStatus: 'analyzed-not-qualified',
          inFeed: true,
          analysis: { score: 0.3 } as any
        }
      ] as FeedArticle[]

      await db.feedArticles.bulkAdd(articles)

      await updateFeedStats(feed.url)

      const updatedFeed = await db.discoveredFeeds.get(feed.id)
      expect(updatedFeed!.inFeedEliminatedCount).toBe(2) // 两篇都是已淘汰
    })

    it('应该处理不存在的 RSS 源', async () => {
      // 不应该抛出错误
      await expect(updateFeedStats('https://nonexistent.com/rss')).resolves.toBeUndefined()
    })

    it('应该正确处理空文章列表', async () => {
      const feed: DiscoveredFeed = {
        id: 'feed-empty',
        url: 'https://example.com/empty',
        title: 'Empty Feed',
        discoveredFrom: 'test',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        recommendedCount: 0,
        unreadCount: 0
      } as DiscoveredFeed

      await db.discoveredFeeds.add(feed)

      await updateFeedStats(feed.url)

      const updatedFeed = await db.discoveredFeeds.get(feed.id)
      expect(updatedFeed!.articleCount).toBe(0)
      expect(updatedFeed!.inFeedCount).toBe(0)
      expect(updatedFeed!.analyzedCount).toBe(0)
    })
  })

  describe('updateAllFeedStats', () => {
    it('应该只更新已订阅的源', async () => {
      const feeds = [
        {
          id: 'feed-1',
          url: 'https://example.com/feed1',
          title: 'Subscribed Feed',
          discoveredFrom: 'test',
          discoveredAt: Date.now(),
          status: 'subscribed' as const,
          subscribedAt: Date.now(),
          isActive: true,
          articleCount: 0,
          recommendedCount: 0,
          unreadCount: 0
        },
        {
          id: 'feed-2',
          url: 'https://example.com/feed2',
          title: 'Discovered Feed',
          discoveredFrom: 'test',
          discoveredAt: Date.now(),
          status: 'discovered' as const,
          isActive: true,
          articleCount: 0,
          recommendedCount: 0,
          unreadCount: 0
        }
      ] as DiscoveredFeed[]

      await db.discoveredFeeds.bulkAdd(feeds)

      // 为订阅的源添加文章
      await db.feedArticles.add({
        id: 'a1',
        feedId: 'feed-1',
        link: 'http://example.com/1',
        title: 'Article 1',
        published: Date.now(),
        poolStatus: 'raw',
        inFeed: true
      } as FeedArticle)

      await updateAllFeedStats()

      // 验证订阅的源被更新
      const feed1 = await db.discoveredFeeds.get('feed-1')
      expect(feed1!.articleCount).toBe(1)

      // 验证未订阅的源不会被更新（articleCount 应该保持初始值 0）
      const feed2 = await db.discoveredFeeds.get('feed-2')
      expect(feed2!.articleCount).toBe(0)
    })

    it('应该处理空的订阅列表', async () => {
      // 不应该抛出错误
      await expect(updateAllFeedStats()).resolves.toBeUndefined()
    })

    it('应该成功更新多个订阅源', async () => {
      const feeds: DiscoveredFeed[] = [
        {
          id: 'feed-1',
          url: 'https://example.com/feed1',
          title: 'Feed 1',
          discoveredFrom: 'test',
          discoveredAt: Date.now(),
          status: 'subscribed',
          isActive: true,
          articleCount: 0,
          recommendedCount: 0,
          unreadCount: 0
        },
        {
          id: 'feed-2',
          url: 'https://example.com/feed2',
          title: 'Feed 2',
          discoveredFrom: 'test',
          discoveredAt: Date.now(),
          status: 'subscribed',
          isActive: true,
          articleCount: 0,
          recommendedCount: 0,
          unreadCount: 0
        }
      ] as DiscoveredFeed[]

      await db.discoveredFeeds.bulkAdd(feeds)

      // 为两个源添加文章
      await db.feedArticles.bulkAdd([
        {
          id: 'a1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Article 1',
          published: Date.now(),
          poolStatus: 'raw',
          inFeed: true
        },
        {
          id: 'a2',
          feedId: 'feed-2',
          link: 'http://example.com/2',
          title: 'Article 2',
          published: Date.now(),
          poolStatus: 'candidate',
          inFeed: true
        }
      ] as FeedArticle[])

      await updateAllFeedStats()

      // 验证两个源都被更新
      const feed1 = await db.discoveredFeeds.get('feed-1')
      const feed2 = await db.discoveredFeeds.get('feed-2')
      expect(feed1!.articleCount).toBe(1)
      expect(feed2!.articleCount).toBe(1)
    })
  })
})
