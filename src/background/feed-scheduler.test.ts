/**
 * feed-scheduler.ts 测试
 * 
 * 测试 RSS 定时抓取调度器的核心功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  calculateNextFetchInterval,
  calculateUpdateFrequencyFromArticles,
  shouldFetch,
  getArticleId,
  mergeArticles,
  fetchFeed,
  FeedScheduler
} from './feed-scheduler'
import type { DiscoveredFeed, FeedArticle } from '@/types/rss'
import { db } from '../storage/db'
import { RSSFetcher } from '../core/rss/RSSFetcher'

// Mock RSSFetcher
vi.mock('../core/rss/RSSFetcher', () => {
  const mockFetchFn = vi.fn()
  return {
    RSSFetcher: vi.fn(function() {
      return {
        fetch: mockFetchFn,
        calculateUpdateFrequency: vi.fn()
      }
    }),
    // 暴露 mock 函数以便测试中使用
    __getMockFetch: () => mockFetchFn
  }
})

// Mock db
vi.mock('../storage/db', () => ({
  db: {
    discoveredFeeds: {
      update: vi.fn(),
      get: vi.fn(),  // Phase 7: 添加 get 方法用于获取更新后的数据
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([])
        }))
      }))
    },
    feedArticles: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),  // 添加 toArray 方法
          delete: vi.fn().mockResolvedValue(undefined)
        }))
      })),
      bulkAdd: vi.fn().mockResolvedValue(undefined),
      bulkPut: vi.fn().mockResolvedValue(undefined),  // 添加 bulkPut 方法
      bulkGet: vi.fn().mockResolvedValue([])  // 添加 bulkGet 方法
    },
    transaction: vi.fn((mode, tables, callback) => {
      // 简单模拟事务：直接执行回调
      return callback()
    })
  },
  updateFeedStats: vi.fn()  // Phase 7: mock updateFeedStats 函数
}))

describe('feed-scheduler', () => {
  describe('calculateNextFetchInterval()', () => {
    it('应该为没有质量数据的源返回 24 小时', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      const interval = calculateNextFetchInterval(feed)
      
      expect(interval).toBe(24 * 60 * 60 * 1000)
    })
    
    it('应该为每天更新的源返回 6 小时', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          updateFrequency: 7,
          score: 80,
          formatValid: true,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 100,
            completenessScore: 80,
            formatScore: 100,
            reachabilityScore: 100
          }
        }
      }
      
      const interval = calculateNextFetchInterval(feed)
      
      expect(interval).toBe(6 * 60 * 60 * 1000)
    })
    
    it('应该为每周 3-7 次更新的源返回 12 小时', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          updateFrequency: 5,
          score: 70,
          formatValid: true,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 80,
            completenessScore: 70,
            formatScore: 100,
            reachabilityScore: 100
          }
        }
      }
      
      const interval = calculateNextFetchInterval(feed)
      
      expect(interval).toBe(12 * 60 * 60 * 1000)
    })
    
    it('应该为每周 1-2 次更新的源返回 24 小时', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          updateFrequency: 1.5,
          score: 60,
          formatValid: true,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 60,
            completenessScore: 70,
            formatScore: 100,
            reachabilityScore: 100
          }
        }
      }
      
      const interval = calculateNextFetchInterval(feed)
      
      expect(interval).toBe(24 * 60 * 60 * 1000)
    })
    
    it('应该为低频源返回 7 天（修复后的逻辑）', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          updateFrequency: 0.1,
          score: 40,
          formatValid: true,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 20,
            completenessScore: 60,
            formatScore: 100,
            reachabilityScore: 100
          }
        }
      }
      
      const interval = calculateNextFetchInterval(feed)
      
      expect(interval).toBe(7 * 24 * 60 * 60 * 1000)
    })
    
    it('应该为频率为 0 的源返回 7 天（防御性编程）', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          updateFrequency: 0,
          score: 0,
          formatValid: false,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 0,
            completenessScore: 0,
            formatScore: 0,
            reachabilityScore: 100
          }
        }
      }
      
      const interval = calculateNextFetchInterval(feed)
      
      expect(interval).toBe(7 * 24 * 60 * 60 * 1000)
    })
  })
  
  describe('calculateUpdateFrequencyFromArticles()', () => {
    it('应该返回 0 当文章数不足 2 篇', () => {
      const articles: FeedArticle[] = []
      expect(calculateUpdateFrequencyFromArticles(articles)).toBe(0)
      
      const oneArticle: FeedArticle[] = [{
        id: '1',
        feedId: 'test',
        title: 'Test',
        link: 'https://example.com/1',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false
      }]
      expect(calculateUpdateFrequencyFromArticles(oneArticle)).toBe(0)
    })
    
    it('应该正确计算每天更新的源', () => {
      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000
      
      // 7 天内 7 篇文章 = 每周 7 篇
      const articles: FeedArticle[] = Array.from({ length: 7 }, (_, i) => ({
        id: `article-${i}`,
        feedId: 'test',
        title: `Article ${i}`,
        link: `https://example.com/${i}`,
        published: now - i * oneDay, // 每天一篇
        fetched: now,
        read: false,
        starred: false
      }))
      
      const frequency = calculateUpdateFrequencyFromArticles(articles)
      // 7 篇 / 6 天跨度 * 7 = 约 8.2 篇/周
      expect(frequency).toBeGreaterThanOrEqual(7)
      expect(frequency).toBeLessThanOrEqual(10)
    })
    
    it('应该返回真实的低频值（不设下限）', () => {
      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000
      
      // 30 天内 4 篇文章 = 约 0.93 篇/周
      const articles: FeedArticle[] = [
        { id: '1', feedId: 'test', title: 'A', link: 'https://a.com/1', published: now, fetched: now, read: false, starred: false },
        { id: '2', feedId: 'test', title: 'B', link: 'https://a.com/2', published: now - 10 * oneDay, fetched: now, read: false, starred: false },
        { id: '3', feedId: 'test', title: 'C', link: 'https://a.com/3', published: now - 20 * oneDay, fetched: now, read: false, starred: false },
        { id: '4', feedId: 'test', title: 'D', link: 'https://a.com/4', published: now - 30 * oneDay, fetched: now, read: false, starred: false },
      ]
      
      const frequency = calculateUpdateFrequencyFromArticles(articles)
      // 4 篇 / 30 天 * 7 = 0.93，应该返回真实值（不再设 0.5 下限）
      expect(frequency).toBeGreaterThanOrEqual(0.9)
      expect(frequency).toBeLessThanOrEqual(1)
    })
    
    it('应该返回真实的高频值（不设上限）', () => {
      const now = Date.now()
      const oneHour = 60 * 60 * 1000
      
      // 同一天内 20 篇文章
      const articles: FeedArticle[] = Array.from({ length: 20 }, (_, i) => ({
        id: `article-${i}`,
        feedId: 'test',
        title: `Article ${i}`,
        link: `https://example.com/${i}`,
        published: now - i * oneHour, // 每小时一篇
        fetched: now,
        read: false,
        starred: false
      }))
      
      const frequency = calculateUpdateFrequencyFromArticles(articles)
      // 时间跨度 < 1 天，按 1 天算：20 * 7 = 140 篇/周
      expect(frequency).toBe(140)
    })
  })
  
  describe('shouldFetch()', () => {
    it('应该拒绝未订阅的源', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      expect(shouldFetch(feed)).toBe(false)
    })
    
    it('应该拒绝未启用的源', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: false,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      expect(shouldFetch(feed)).toBe(false)
    })
    
    it('应该允许强制手动抓取（忽略时间限制）', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        lastFetchedAt: Date.now() // 刚刚抓取过
      }
      
      expect(shouldFetch(feed, true)).toBe(true)
    })
    
    it('应该在到达抓取时间时返回 true', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        lastFetchedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 小时前
        quality: {
          updateFrequency: 1,
          score: 60,
          formatValid: true,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 60,
            completenessScore: 70,
            formatScore: 100,
            reachabilityScore: 100
          }
        }
      }
      
      expect(shouldFetch(feed)).toBe(true)
    })
    
    it('应该在未到抓取时间时返回 false', () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        lastFetchedAt: Date.now() - 1 * 60 * 60 * 1000, // 1 小时前
        quality: {
          updateFrequency: 7,
          score: 80,
          formatValid: true,
          reachable: true,
          lastChecked: Date.now(),
          details: {
            updateFrequencyScore: 100,
            completenessScore: 80,
            formatScore: 100,
            reachabilityScore: 100
          }
        }
      }
      
      expect(shouldFetch(feed)).toBe(false)
    })
  })
  
  describe('getArticleId()', () => {
    it('应该使用文章链接作为唯一 ID', () => {
      const article = { link: 'https://example.com/article-1' }
      
      expect(getArticleId(article)).toBe('https://example.com/article-1')
    })
  })
  
  describe('mergeArticles()', () => {
    it('应该合并新旧文章并保留阅读状态', () => {
      const existing: FeedArticle[] = [
        {
          id: 'https://example.com/old-1',
          feedId: 'test-feed',
          title: 'Old Article 1',
          link: 'https://example.com/old-1',
          published: Date.now() - 3 * 24 * 60 * 60 * 1000,
          fetched: Date.now(),
          read: true,
          starred: false
        },
        {
          id: 'https://example.com/old-2',
          feedId: 'test-feed',
          title: 'Old Article 2',
          link: 'https://example.com/old-2',
          published: Date.now() - 2 * 24 * 60 * 60 * 1000,
          fetched: Date.now(),
          read: false,
          starred: true
        }
      ]
      
      const newArticles: FeedArticle[] = [
        {
          id: 'https://example.com/new-1',
          feedId: 'test-feed',
          title: 'New Article 1',
          link: 'https://example.com/new-1',
          published: Date.now(),
          fetched: Date.now(),
          read: false,
          starred: false
        },
        {
          id: 'https://example.com/old-1',
          feedId: 'test-feed',
          title: 'Old Article 1 (Updated)',
          link: 'https://example.com/old-1',
          published: Date.now() - 3 * 24 * 60 * 60 * 1000,
          fetched: Date.now(),
          read: false,
          starred: false
        }
      ]
      
      const merged = mergeArticles(existing, newArticles)
      
      // 应该有 3 篇文章（2 旧 + 1 新，去重后）
      expect(merged).toHaveLength(3)
      
      // 旧文章的阅读状态应该被保留
      const oldArticle1 = merged.find(a => a.link === 'https://example.com/old-1')
      expect(oldArticle1?.read).toBe(true)
      
      const oldArticle2 = merged.find(a => a.link === 'https://example.com/old-2')
      expect(oldArticle2?.starred).toBe(true)
      
      // 新文章应该是未读
      const newArticle1 = merged.find(a => a.link === 'https://example.com/new-1')
      expect(newArticle1?.read).toBe(false)
    })
    
    it('应该按发布时间倒序排序（最新在前）', () => {
      const existing: FeedArticle[] = []
      const newArticles: FeedArticle[] = [
        {
          id: 'https://example.com/3',
          feedId: 'test-feed',
          title: 'Article 3',
          link: 'https://example.com/3',
          published: Date.now() - 1 * 24 * 60 * 60 * 1000,
          fetched: Date.now(),
          read: false,
          starred: false
        },
        {
          id: 'https://example.com/1',
          feedId: 'test-feed',
          title: 'Article 1',
          link: 'https://example.com/1',
          published: Date.now() - 3 * 24 * 60 * 60 * 1000,
          fetched: Date.now(),
          read: false,
          starred: false
        },
        {
          id: 'https://example.com/2',
          feedId: 'test-feed',
          title: 'Article 2',
          link: 'https://example.com/2',
          published: Date.now() - 2 * 24 * 60 * 60 * 1000,
          fetched: Date.now(),
          read: false,
          starred: false
        }
      ]
      
      const merged = mergeArticles(existing, newArticles)
      
      // 应该按发布时间倒序排列
      expect(merged[0].link).toBe('https://example.com/3')
      expect(merged[1].link).toBe('https://example.com/2')
      expect(merged[2].link).toBe('https://example.com/1')
    })
  })
  
  describe('fetchFeed()', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })
    
    it('应该成功抓取并更新数据库', async () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock db.discoveredFeeds.get 返回更新后的 feed
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue({
        ...feed,
        articleCount: 1,
        analyzedCount: 0,
        recommendedCount: 0,
        readCount: 0,
        dislikedCount: 0,
        unreadCount: 1
      })
      
      // 获取 mock 函数并设置返回值
      const RSSFetcherModule = await import('../core/rss/RSSFetcher')
      const mockFetch = (RSSFetcherModule as any).__getMockFetch()
      mockFetch.mockResolvedValueOnce({
        success: true,
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            description: 'Description 1',
            pubDate: new Date()
          }
        ],
        feedInfo: {
          title: 'Test Feed'
        }
      })
      
      const result = await fetchFeed(feed)
      
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(feed.url)
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        feed.id,
        expect.objectContaining({
          lastFetchedAt: expect.any(Number),
          nextScheduledFetch: expect.any(Number),
          updateFrequency: expect.any(Number),
          lastError: undefined,
          articleCount: 1,
          unreadCount: 1
        })
      )
      
      // Phase 10: 验证新增文章带有正确的 inFeed 状态和 poolStatus
      expect(db.feedArticles.bulkAdd).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            inFeed: true,
            lastSeenInFeed: expect.any(Number),
            metadataUpdatedAt: expect.any(Number),
            updateCount: 0
            // poolStatus 在转换时已设置（raw 或 prescreened-out）
          })
        ])
      )
    })
    
    it('应该在抓取失败时记录错误', async () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // 获取 mock 函数并设置返回值
      const RSSFetcherModule = await import('../core/rss/RSSFetcher')
      const mockFetch = (RSSFetcherModule as any).__getMockFetch()
      mockFetch.mockResolvedValueOnce({
        success: false,
        error: 'Network error'
      })
      
      const result = await fetchFeed(feed)
      
      expect(result).toBe(false)
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        feed.id,
        expect.objectContaining({
          lastFetchedAt: expect.any(Number),
          lastError: 'Network error'
        })
      )
    })
    
    // Phase 10: 新增测试 - 验证 inFeed 状态管理
    it('应该将不在最新列表的文章标记为 inFeed=false', async () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock 现有文章（有一篇旧文章不在最新列表中）
      const oldArticle: FeedArticle = {
        id: 'https://example.com/old',
        feedId: 'test-feed',
        title: 'Old Article',
        link: 'https://example.com/old',
        published: Date.now() - 7 * 24 * 60 * 60 * 1000,
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true,
        inPool: false  // 不在推荐池
      }
      
      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([oldArticle])
        })
      } as any)
      
      vi.mocked(db.feedArticles.bulkGet).mockResolvedValue([undefined])  // 新文章不存在
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue({
        ...feed,
        articleCount: 1,
        unreadCount: 1
      })
      
      // Mock RSS 抓取返回新文章
      const RSSFetcherModule = await import('../core/rss/RSSFetcher')
      const mockFetch = (RSSFetcherModule as any).__getMockFetch()
      mockFetch.mockResolvedValueOnce({
        success: true,
        items: [
          {
            title: 'New Article',
            link: 'https://example.com/new',
            description: 'Description',
            pubDate: new Date()
          }
        ],
        feedInfo: {
          title: 'Test Feed'
        }
      })
      
      await fetchFeed(feed)
      
      // 验证旧文章被标记为 inFeed=false
      expect(db.feedArticles.bulkPut).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'https://example.com/old',
            inFeed: false,
            metadataUpdatedAt: expect.any(Number)
          })
        ])
      )
    })
    
    // 新增测试：验证重新抓取时保留用户操作状态
    it('应该在重新抓取时保留文章的用户操作状态', async () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 1,
        unreadCount: 0,
        recommendedCount: 1
      }
      
      // Mock 现有文章（已阅读、已推荐、已收藏）
      const existingArticle: FeedArticle = {
        id: 'https://example.com/article-1',
        feedId: 'test-feed',
        title: 'Article 1 (Old Title)',
        link: 'https://example.com/article-1',
        description: 'Old description',
        published: Date.now() - 1 * 24 * 60 * 60 * 1000,
        fetched: Date.now(),
        read: true,          // 已阅读
        disliked: false,     // 未标记不想读
        recommended: true,   // 已推荐
        starred: true,       // 已收藏
        inFeed: true,
        inPool: false
      }
      
      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([existingArticle])
        })
      } as any)
      
      // bulkGet 返回已存在的文章
      vi.mocked(db.feedArticles.bulkGet).mockResolvedValue([existingArticle])
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue({
        ...feed,
        articleCount: 1,
        unreadCount: 0  // 仍然是已读
      })
      
      // Mock RSS 抓取返回相同的文章（但标题可能更新了）
      const RSSFetcherModule = await import('../core/rss/RSSFetcher')
      const mockFetch = (RSSFetcherModule as any).__getMockFetch()
      mockFetch.mockResolvedValueOnce({
        success: true,
        items: [
          {
            title: 'Article 1 (Updated Title)',  // 标题可能更新
            link: 'https://example.com/article-1',
            description: 'Updated description',  // 描述可能更新
            pubDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
          }
        ],
        feedInfo: {
          title: 'Test Feed'
        }
      })
      
      await fetchFeed(feed)
      
      // 验证文章被更新（bulkPut）且保留用户操作状态
      expect(db.feedArticles.bulkPut).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'https://example.com/article-1',
            title: 'Article 1 (Updated Title)',    // ✅ 元数据更新
            description: 'Updated description',     // ✅ 元数据更新
            read: true,                             // ✅ 保留已读状态
            disliked: false,                        // ✅ 保留未不想读状态
            recommended: true,                      // ✅ 保留已推荐状态
            starred: true,                          // ✅ 保留已收藏状态
            inFeed: true,
            lastSeenInFeed: expect.any(Number),
            metadataUpdatedAt: expect.any(Number),
            updateCount: 1  // 更新计数 +1
          })
        ])
      )
    })
    
    // Phase 10: 新增测试 - 保护推荐池中的文章
    it('应该保护推荐池中的文章不被标记为 inFeed=false', async () => {
      const feed: DiscoveredFeed = {
        id: 'test-feed',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'subscribed',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock 现有文章（有一篇在推荐池中的旧文章）
      const recommendedArticle: FeedArticle = {
        id: 'https://example.com/recommended',
        feedId: 'test-feed',
        title: 'Recommended Article',
        link: 'https://example.com/recommended',
        published: Date.now() - 7 * 24 * 60 * 60 * 1000,
        fetched: Date.now(),
        read: false,
        starred: false,
        inFeed: true,
        inPool: true  // 在推荐池中
      }
      
      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([recommendedArticle])
        })
      } as any)
      
      vi.mocked(db.feedArticles.bulkGet).mockResolvedValue([undefined])
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue({
        ...feed,
        articleCount: 1,
        unreadCount: 1
      })
      
      // Mock RSS 抓取返回空列表（模拟文章已从源中移除）
      const RSSFetcherModule = await import('../core/rss/RSSFetcher')
      const mockFetch = (RSSFetcherModule as any).__getMockFetch()
      mockFetch.mockResolvedValueOnce({
        success: true,
        items: [],
        feedInfo: {
          title: 'Test Feed'
        }
      })
      
      await fetchFeed(feed)
      
      // 验证推荐池中的文章没有被标记为 inFeed=false
      const bulkPutCalls = vi.mocked(db.feedArticles.bulkPut).mock.calls
      const markedStale = bulkPutCalls.some(call => 
        call[0].some((article: any) => 
          article.id === 'https://example.com/recommended' && article.inFeed === false
        )
      )
      
      expect(markedStale).toBe(false)
    })
  })
  
  describe('FeedScheduler', () => {
    it('应该能启动和停止调度器', () => {
      const scheduler = new FeedScheduler()
      
      scheduler.start(30)
      expect((scheduler as any).isRunning).toBe(true)
      
      scheduler.stop()
      expect((scheduler as any).isRunning).toBe(false)
    })
    
    it('应该在已运行时拒绝重复启动', () => {
      const scheduler = new FeedScheduler()
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      scheduler.start(30)
      scheduler.start(30)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('调度器已在运行')
      )
      
      scheduler.stop()
      consoleSpy.mockRestore()
    })
  })
})
