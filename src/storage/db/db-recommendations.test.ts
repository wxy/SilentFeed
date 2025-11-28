/**
 * 推荐功能测试 (Phase 2.7)
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
import type { Recommendation } from "@/types/database"

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
      
      const testRecommendations: Recommendation[] = [
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'TechCrunch',
          sourceUrl: 'https://techcrunch.com',
          recommendedAt: now - 1000,
          score: 0.9,
          isRead: true,
          clickedAt: now,
          readDuration: 150,
          scrollDepth: 0.8,
          effectiveness: 'effective'
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要 2',
          source: 'Hacker News',
          sourceUrl: 'https://news.ycombinator.com',
          recommendedAt: now - 2000,
          score: 0.8,
          isRead: true,
          clickedAt: now - 1000,
          readDuration: 60,
          scrollDepth: 0.5,
          effectiveness: 'neutral'
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '推荐 3',
          summary: '摘要 3',
          source: 'TechCrunch',
          sourceUrl: 'https://techcrunch.com',
          recommendedAt: now - 3000,
          score: 0.7,
          isRead: false,
          feedback: 'dismissed',
          feedbackAt: now - 2000,
          effectiveness: 'ineffective'
        }
      ]
      
      await db.recommendations.bulkAdd(testRecommendations)
      
      const stats = await getRecommendationStats(7)
      
      expect(stats.totalCount).toBe(3)
      expect(stats.readCount).toBe(2)
      expect(stats.unreadCount).toBe(1)
      expect(stats.dismissedCount).toBe(1)
      expect(stats.readLaterCount).toBe(0)
      expect(stats.avgReadDuration).toBe((150 + 60) / 2)
      
      expect(stats.topSources).toHaveLength(2)
      expect(stats.topSources[0].source).toBe('TechCrunch')
      expect(stats.topSources[0].count).toBe(2)
    })

    it('应该只统计指定天数内的数据', async () => {
      const now = Date.now()
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000
      
      await db.recommendations.bulkAdd([
        {
          id: 'old',
          url: 'https://example.com/old',
          title: '旧推荐',
          summary: '旧摘要',
          source: 'Old Source',
          sourceUrl: 'https://old.com',
          recommendedAt: eightDaysAgo,
          score: 0.5,
          isRead: false
        },
        {
          id: 'new',
          url: 'https://example.com/new',
          title: '新推荐',
          summary: '新摘要',
          source: 'New Source',
          sourceUrl: 'https://new.com',
          recommendedAt: now,
          score: 0.9,
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
      await db.recommendations.add({
        id: '1',
        url: 'https://example.com/1',
        title: '推荐 1',
        summary: '摘要',
        source: 'Source',
        sourceUrl: 'https://source.com',
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
  })
})
