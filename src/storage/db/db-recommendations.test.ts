/**
 * 推荐功能测试 (Phase 2.7)
 * 
 * ⚠️ 注意：自 v21-v22 数据库架构变更后，推荐数据存储在 feedArticles 表中
 * - 使用 poolStatus='recommended' 标识推荐
 * - 使用 popupAddedAt 记录推荐时间
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  db, 
  initializeDatabase,
  getRecommendationStats,
  getStorageStats,
  markAsRead,
  dismissRecommendations,
  getUnreadRecommendations
} from './index'
import type { FeedArticle } from "@/types/rss"

describe('Phase 2.7 推荐功能', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    // 清理缓存避免测试间污染
    const { statsCache } = await import('./index')
    statsCache.clear()
    await db.close()
  })

  describe('getRecommendationStats', () => {
    it('应该返回正确的推荐统计', async () => {
      const now = Date.now()
      
      const testArticles: FeedArticle[] = [
        {
          id: '1',
          feedId: 'feed-techcrunch',
          link: 'https://example.com/1',
          title: '推荐 1',
          description: '摘要 1',
          published: now - 1000,
          fetched: now,
          poolStatus: 'recommended',
          popupAddedAt: now - 1000,
          analysisScore: 0.9,
          isRead: true,
          clickedAt: now,
          readDuration: 150,
          scrollDepth: 0.8,
          effectiveness: 'effective'
        },
        {
          id: '2',
          feedId: 'feed-hn',
          link: 'https://example.com/2',
          title: '推荐 2',
          description: '摘要 2',
          published: now - 2000,
          fetched: now,
          poolStatus: 'recommended',
          popupAddedAt: now - 2000,
          analysisScore: 0.8,
          isRead: true,
          clickedAt: now - 1000,
          readDuration: 60,
          scrollDepth: 0.5,
          effectiveness: 'neutral'
        },
        {
          id: '3',
          feedId: 'feed-techcrunch',
          link: 'https://example.com/3',
          title: '推荐 3',
          description: '摘要 3',
          published: now - 3000,
          fetched: now,
          poolStatus: 'exited',
          popupAddedAt: now - 3000,
          poolExitedAt: now - 2000,
          poolExitReason: 'dismissed',
          analysisScore: 0.7,
          isRead: false,
          effectiveness: 'ineffective'
        }
      ]
      
      await db.feedArticles.bulkAdd(testArticles)
      
      const stats = await getRecommendationStats(7)
      
      expect(stats.totalCount).toBe(3)
      expect(stats.readCount).toBe(2)
      expect(stats.unreadCount).toBe(1)
      expect(stats.dismissedCount).toBe(1)
      expect(stats.readLaterCount).toBe(0)
      expect(stats.avgReadDuration).toBe((150 + 60) / 2)
      
      expect(stats.topSources).toHaveLength(2)
      expect(stats.topSources[0].source).toBe('feed-techcrunch')
      expect(stats.topSources[0].count).toBe(2)
    })

    it('应该只统计指定天数内的数据', async () => {
      const now = Date.now()
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000
      
      await db.feedArticles.bulkAdd([
        {
          id: 'old',
          feedId: 'feed-old',
          link: 'https://example.com/old',
          title: '旧推荐',
          description: '旧摘要',
          published: eightDaysAgo,
          fetched: eightDaysAgo,
          poolStatus: 'recommended',
          popupAddedAt: eightDaysAgo,
          analysisScore: 0.5,
          isRead: false
        },
        {
          id: 'new',
          feedId: 'feed-new',
          link: 'https://example.com/new',
          title: '新推荐',
          description: '新摘要',
          published: now,
          fetched: now,
          poolStatus: 'recommended',
          popupAddedAt: now,
          analysisScore: 0.9,
          isRead: false
        }
      ])
      
      const stats = await getRecommendationStats(7)
      expect(stats.totalCount).toBe(1)
    })

    it('应该处理空数据', async () => {
      const stats = await getRecommendationStats(7)
      
      expect(stats.totalCount).toBe(0)
      expect(stats.readCount).toBe(0)
      expect(stats.unreadCount).toBe(0)
      expect(stats.avgReadDuration).toBe(0)
      expect(stats.topSources).toHaveLength(0)
    })
  })

  describe('getStorageStats', () => {
    it('应该返回正确的存储统计', async () => {
      await db.feedArticles.add({
        id: '1',
        feedId: 'feed-1',
        link: 'https://example.com/1',
        title: '推荐 1',
        description: '摘要',
        published: Date.now(),
        fetched: Date.now(),
        poolStatus: 'recommended',
        popupAddedAt: Date.now(),
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      const stats = await getStorageStats()
      
      // 验证 StorageStats 字段
      expect(stats.pageCount).toBeGreaterThanOrEqual(0)
      expect(stats.recommendationCount).toBe(1)
      expect(stats.totalSizeMB).toBeGreaterThan(0)
      expect(stats.pendingCount).toBeGreaterThanOrEqual(0)
      expect(stats.confirmedCount).toBeGreaterThanOrEqual(0)
      expect(stats.avgDailyPages).toBeGreaterThanOrEqual(0)
    })
  })

  describe('markAsRead', () => {
    it('应该正确标记推荐为已读（深度阅读）', async () => {
      await db.recommendations.add({
        id: 'test',
        url: 'https://example.com/test',
        title: '测试推荐',
        summary: '摘要',
        source: 'Test Source',
        sourceUrl: 'https://test.com',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      await markAsRead('test', 150, 0.8)
      
      const updated = await db.recommendations.get('test')
      
      expect(updated?.isRead).toBe(true)
      expect(updated?.clickedAt).toBeGreaterThan(0)
      expect(updated?.readDuration).toBe(150)
      expect(updated?.scrollDepth).toBe(0.8)
      expect(updated?.effectiveness).toBe('effective')
    })
    
    it('应该更新 recommendedReadCount 统计', async () => {
      // 1. 创建 RSS 源
      const feedId = await db.discoveredFeeds.add({
        id: 'feed-1',
        url: 'https://test.com/feed',
        title: '测试源',
        status: 'subscribed',
        discoveredFrom: 'manual',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 1,
        recommendedCount: 1,
        unreadCount: 1,
        latestArticles: [{
          id: 'article-1',
          feedId: 'feed-1',
          title: '测试文章',
          link: 'https://example.com/article',
          published: Date.now(),
          fetched: Date.now(),
          read: false,
          starred: false
        }]
      })
      
      // 2. 创建推荐
      await db.recommendations.add({
        id: 'rec-1',
        url: 'https://example.com/article',
        title: '测试推荐',
        summary: '摘要',
        source: '测试源',
        sourceUrl: 'https://test.com/feed',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      // 3. 标记推荐为已读
      await markAsRead('rec-1')
      
      // 4. 验证推荐表已更新
      const recommendation = await db.recommendations.get('rec-1')
      expect(recommendation?.isRead).toBe(true)
      
      // 5. 验证 recommendedReadCount 已更新（推荐池中的已读数）
      const feed = await db.discoveredFeeds.get(feedId)
      expect(feed?.recommendedReadCount).toBe(1)
    })

    it('应该正确评估浅度阅读', async () => {
      await db.recommendations.add({
        id: 'test',
        url: 'https://example.com/test',
        title: '测试推荐',
        summary: '摘要',
        source: 'Test Source',
        sourceUrl: 'https://test.com',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      await markAsRead('test', 60, 0.5)
      
      const updated = await db.recommendations.get('test')
      expect(updated?.effectiveness).toBe('neutral')
    })

    it('应该在推荐不存在时抛出错误', async () => {
      await expect(markAsRead('nonexistent')).rejects.toThrow(
        '推荐记录不存在: nonexistent'
      )
    })
  })

  describe('dismissRecommendations', () => {
    it('应该正确标记推荐为"不想读"', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要 2',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.8,
          isRead: false
        }
      ])
      
      await dismissRecommendations(['1', '2'])
      
      const dismissed1 = await db.recommendations.get('1')
      const dismissed2 = await db.recommendations.get('2')
      
      expect(dismissed1?.feedback).toBe('dismissed')
      expect(dismissed1?.effectiveness).toBe('ineffective')
      expect(dismissed1?.feedbackAt).toBeGreaterThan(0)
      
      expect(dismissed2?.feedback).toBe('dismissed')
      expect(dismissed2?.effectiveness).toBe('ineffective')
    })
    
    it('应该同步更新 feedArticles 表中的文章不想读状态', async () => {
      // 1. 创建 RSS 源
      const feedId = await db.discoveredFeeds.add({
        id: 'feed-2',
        url: 'https://test.com/feed2',
        title: '测试源2',
        status: 'subscribed',
        discoveredFrom: 'manual',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 1,
        recommendedCount: 1,
        unreadCount: 1
      })
      
      // 2. Phase 7: 在 feedArticles 表中添加文章
      await db.feedArticles.add({
        id: 'article-2',
        feedId: 'feed-2',
        title: '测试文章2',
        link: 'https://example.com/article2',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false
      })
      
      // 3. 创建推荐
      await db.recommendations.add({
        id: 'rec-2',
        url: 'https://example.com/article2',
        title: '测试推荐2',
        summary: '摘要',
        source: '测试源2',
        sourceUrl: 'https://test.com/feed2',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      // 4. 标记为不想读
      await dismissRecommendations(['rec-2'])
      
      // 5. 验证推荐表已更新
      const recommendation = await db.recommendations.get('rec-2')
      expect(recommendation?.feedback).toBe('dismissed')
      
      // 6. Phase 7: 验证 feedArticles 表中的文章被标记为不想读
      const article = await db.feedArticles.get('article-2')
      expect(article?.disliked).toBe(true)
      
      // 7. 验证统计已更新
      const feed = await db.discoveredFeeds.get(feedId)
      expect(feed?.dislikedCount).toBe(1)
    })

    it('应该支持批量操作', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`)
      
      await db.recommendations.bulkAdd(
        ids.map(id => ({
          id,
          url: `https://example.com/${id}`,
          title: `推荐 ${id}`,
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
          score: 0.8,
          isRead: false
        }))
      )
      
      await dismissRecommendations(ids)
      
      const dismissed = await db.recommendations
        .where('id')
        .anyOf(ids)
        .toArray()
      
      expect(dismissed).toHaveLength(10)
      expect(dismissed.every(r => r.feedback === 'dismissed')).toBe(true)
    })
  })

  describe('getUnreadRecommendations', () => {
    it('应该返回未读推荐（按时间倒序）', async () => {
      const now = Date.now()
      
      // Phase 10: 创建对应的 feedArticles
      await db.feedArticles.bulkAdd([
        {
          id: 'article-1',
          feedId: 'feed-1',
          link: 'https://example.com/1',
          title: '推荐 1',
          published: now - 3000,
          fetched: now,
          read: false,
          starred: false,
          inFeed: true,   // 在源中
          inPool: true    // 在推荐池中
        },
        {
          id: 'article-2',
          feedId: 'feed-1',
          link: 'https://example.com/2',
          title: '推荐 2',
          published: now - 2000,
          fetched: now,
          read: true,
          starred: false,
          inFeed: true,
          inPool: true
        },
        {
          id: 'article-3',
          feedId: 'feed-1',
          link: 'https://example.com/3',
          title: '推荐 3',
          published: now - 1000,
          fetched: now,
          read: false,
          starred: false,
          inFeed: true,   // 在源中
          inPool: true    // 在推荐池中
        }
      ])
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 3000,
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要 2',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 2000,
          score: 0.8,
          isRead: true
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '推荐 3',
          summary: '摘要 3',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 1000,
          score: 0.7,
          isRead: false
        }
      ])
      
      const unread = await getUnreadRecommendations()
      
      expect(unread).toHaveLength(2)
      // 按推荐分数降序：推荐1(0.9) > 推荐3(0.7)
      expect(unread[0].id).toBe('1')
      expect(unread[1].id).toBe('3')
    })

    it('应该限制返回数量', async () => {
      const now = Date.now()
      
      // Phase 10: 创建对应的 feedArticles
      await db.feedArticles.bulkAdd(
        Array.from({ length: 100 }, (_, i) => ({
          id: `article-${i}`,
          feedId: 'feed-1',
          link: `https://example.com/${i}`,
          title: `推荐 ${i}`,
          published: now - i * 1000,
          fetched: now,
          read: false,
          starred: false,
          inFeed: true,   // 在源中
          inPool: true    // 在推荐池中
        }))
      )
      
      await db.recommendations.bulkAdd(
        Array.from({ length: 100 }, (_, i) => ({
          id: `${i}`,
          url: `https://example.com/${i}`,
          title: `推荐 ${i}`,
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - i * 1000,
          score: 0.8,
          isRead: false
        }))
      )
      
      const unread = await getUnreadRecommendations(20)
      expect(unread).toHaveLength(20)
    })

    it('应该处理空数据', async () => {
      const unread = await getUnreadRecommendations()
      expect(unread).toHaveLength(0)
    })

    it('应该将无效推荐（不在源中或已移出推荐池）标记为 inactive', async () => {
      const now = Date.now()
      
      // 创建 3 条推荐记录
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/valid',
          title: '有效推荐',
          summary: '在源中且在推荐池中',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 3000,
          score: 0.9,
          isRead: false,
          status: 'active'
        },
        {
          id: '2',
          url: 'https://example.com/not-in-feed',
          title: '不在源中的推荐',
          summary: '文章已从 RSS 源中移除',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 2000,
          score: 0.8,
          isRead: false,
          status: 'active'
        },
        {
          id: '3',
          url: 'https://example.com/not-in-pool',
          title: '已移出推荐池的推荐',
          summary: '文章在源中但已被移出推荐池',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 1000,
          score: 0.7,
          isRead: false,
          status: 'active'
        }
      ])
      
      // 创建对应的 feedArticles
      await db.feedArticles.bulkAdd([
        {
          id: 'article-1',
          feedId: 'feed-1',
          link: 'https://example.com/valid',
          title: '有效推荐',
          published: now - 3000,
          fetched: now,
          read: false,
          starred: false,
          inFeed: true,   // 在源中
          inPool: true    // 在推荐池中
        },
        {
          id: 'article-2',
          feedId: 'feed-1',
          link: 'https://example.com/not-in-feed',
          title: '不在源中的推荐',
          published: now - 2000,
          fetched: now,
          read: false,
          starred: false,
          inFeed: false,  // 已从源中移除
          inPool: true
        },
        {
          id: 'article-3',
          feedId: 'feed-1',
          link: 'https://example.com/not-in-pool',
          title: '已移出推荐池的推荐',
          published: now - 1000,
          fetched: now,
          read: false,
          starred: false,
          inFeed: true,
          inPool: false   // 已移出推荐池
        }
      ])
      
      // 第一次调用：应该返回 1 条有效推荐，并将 2 条无效推荐标记为 inactive
      const unread1 = await getUnreadRecommendations()
      expect(unread1).toHaveLength(1)
      expect(unread1[0].id).toBe('1')
      
      // 验证无效推荐已被标记为 inactive
      const invalidRec1 = await db.recommendations.get('2')
      const invalidRec2 = await db.recommendations.get('3')
      expect(invalidRec1?.status).toBe('inactive')
      expect(invalidRec2?.status).toBe('inactive')
      
      // 第二次调用：应该只返回 1 条有效推荐，不会再查询到无效推荐
      const unread2 = await getUnreadRecommendations()
      expect(unread2).toHaveLength(1)
      expect(unread2[0].id).toBe('1')
      
      // 验证有效推荐仍然是 active 状态
      const validRec = await db.recommendations.get('1')
      expect(validRec?.status).toBe('active')
    })
  })
})
