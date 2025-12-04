/**
 * RSS 订阅源统计测试
 * 
 * Phase 11: 订阅源质量蛛网图
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getFeedStats, arrangeSymmetrically, normalizeLogarithmic } from './db-feeds-stats'
import { db } from './index'

// Mock database
vi.mock('./index', () => ({
  db: {
    discoveredFeeds: {
      where: vi.fn(),
      toArray: vi.fn()
    },
    feedArticles: {
      where: vi.fn()
    }
  }
}))

describe('订阅源统计', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getFeedStats', () => {
    it('应该获取所有已订阅源的统计数据', async () => {
      // Mock 订阅源
      const mockFeeds = [
        {
          id: 'feed1',
          title: '科技博客',
          url: 'https://example.com/feed',
          status: 'subscribed'
        }
      ]

      // Mock 文章数据
      // 修正数据逻辑：推荐数 = 已推荐 + 在推荐池，阅读和不想读只统计已推荐的文章
      const mockArticles = [
        { id: '1', feedId: 'feed1', recommended: true, inPool: false, read: true, disliked: false },
        { id: '2', feedId: 'feed1', recommended: true, inPool: false, read: false, disliked: false },
        { id: '3', feedId: 'feed1', recommended: false, inPool: true, read: false, disliked: false }, // 在推荐池
        { id: '4', feedId: 'feed1', recommended: true, inPool: false, read: false, disliked: true }, // 已推荐且不想读
        { id: '5', feedId: 'feed1', recommended: false, inPool: false, read: false, disliked: false } // 未推荐
      ]

      vi.mocked(db.discoveredFeeds.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockFeeds)
        })
      } as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockArticles)
        })
      } as any)

      const stats = await getFeedStats()

      expect(stats).toHaveLength(1)
      expect(stats[0]).toEqual({
        feedId: 'feed1',
        feedTitle: '科技博客',
        feedUrl: 'https://example.com/feed',
        totalArticles: 5,
        recommendedCount: 4, // 3个已推荐 + 1个在推荐池
        readCount: 1, // 只有已推荐的才算
        dislikedCount: 1 // 只有已推荐的才算
      })
    })

    it('应该标记推荐数最差的 3 个订阅源', async () => {
      // Mock 5 个订阅源
      const mockFeeds = [
        { id: 'feed1', title: '源1', url: 'url1', status: 'subscribed' },
        { id: 'feed2', title: '源2', url: 'url2', status: 'subscribed' },
        { id: 'feed3', title: '源3', url: 'url3', status: 'subscribed' },
        { id: 'feed4', title: '源4', url: 'url4', status: 'subscribed' },
        { id: 'feed5', title: '源5', url: 'url5', status: 'subscribed' }
      ]

      // Mock 文章数据（推荐数分别为：10, 5, 20, 3, 15）
      const mockArticlesMap: Record<string, any[]> = {
        'feed1': Array(10).fill(null).map((_, i) => ({ 
          id: `f1-${i}`, feedId: 'feed1', recommended: true, inPool: false, read: false, disliked: false 
        })),
        'feed2': Array(5).fill(null).map((_, i) => ({ 
          id: `f2-${i}`, feedId: 'feed2', recommended: true, inPool: false, read: false, disliked: false 
        })),
        'feed3': Array(20).fill(null).map((_, i) => ({ 
          id: `f3-${i}`, feedId: 'feed3', recommended: true, inPool: false, read: false, disliked: false 
        })),
        'feed4': Array(3).fill(null).map((_, i) => ({ 
          id: `f4-${i}`, feedId: 'feed4', recommended: true, inPool: false, read: false, disliked: false 
        })),
        'feed5': Array(15).fill(null).map((_, i) => ({ 
          id: `f5-${i}`, feedId: 'feed5', recommended: true, inPool: false, read: false, disliked: false 
        }))
      }

      vi.mocked(db.discoveredFeeds.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockFeeds)
        })
      } as any)
      
      vi.mocked(db.feedArticles.where).mockImplementation(((field: string) => ({
        equals: vi.fn().mockImplementation((feedId: string) => ({
          toArray: vi.fn().mockResolvedValue(mockArticlesMap[feedId] || [])
        }))
      })) as any)

      const stats = await getFeedStats()

      expect(stats).toHaveLength(5)
      
      // 推荐数最差的 3 个应该被标记：feed4(3), feed2(5), feed1(10)
      const feed4 = stats.find(s => s.feedId === 'feed4')
      const feed2 = stats.find(s => s.feedId === 'feed2')
      const feed1 = stats.find(s => s.feedId === 'feed1')
      const feed5 = stats.find(s => s.feedId === 'feed5')
      const feed3 = stats.find(s => s.feedId === 'feed3')

      expect(feed4?.isWorstPerformer).toBe(true)
      expect(feed2?.isWorstPerformer).toBe(true)
      expect(feed1?.isWorstPerformer).toBe(true)
      expect(feed5?.isWorstPerformer).toBeUndefined()
      expect(feed3?.isWorstPerformer).toBeUndefined()
    })

    it('应该在订阅源少于等于 3 个时不标记最差源', async () => {
      const mockFeeds = [
        { id: 'feed1', title: '源1', url: 'url1', status: 'subscribed' },
        { id: 'feed2', title: '源2', url: 'url2', status: 'subscribed' }
      ]

      const mockArticlesMap: Record<string, any[]> = {
        'feed1': [
          { id: '1', feedId: 'feed1', recommended: true, inPool: false, read: false, disliked: false },
          { id: '2', feedId: 'feed1', recommended: true, inPool: false, read: false, disliked: false }
        ],
        'feed2': [
          { id: '3', feedId: 'feed2', recommended: true, inPool: false, read: false, disliked: false }
        ]
      }

      vi.mocked(db.discoveredFeeds.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockFeeds)
        })
      } as any)
      
      vi.mocked(db.feedArticles.where).mockImplementation(((field: string) => ({
        equals: vi.fn().mockImplementation((feedId: string) => ({
          toArray: vi.fn().mockResolvedValue(mockArticlesMap[feedId] || [])
        }))
      })) as any)

      const stats = await getFeedStats()

      // 少于等于 3 个源时不应该标记
      expect(stats.every(s => !s.isWorstPerformer)).toBe(true)
    })

    it('应该跳过无文章的订阅源', async () => {
      const mockFeeds = [
        { id: 'feed1', title: '空源', url: 'https://example.com/feed', status: 'subscribed' }
      ]

      vi.mocked(db.discoveredFeeds.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockFeeds)
        })
      } as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([])
        })
      } as any)

      const stats = await getFeedStats()

      expect(stats).toHaveLength(0)
    })
  })

  describe('arrangeSymmetrically', () => {
    it('应该将最高的源放在顶部', () => {
      const stats = [
        { feedId: 'f1', feedTitle: '源1', feedUrl: 'url1', totalArticles: 100, recommendedCount: 0, readCount: 0, dislikedCount: 0 },
        { feedId: 'f2', feedTitle: '源2', feedUrl: 'url2', totalArticles: 200, recommendedCount: 0, readCount: 0, dislikedCount: 0 },
        { feedId: 'f3', feedTitle: '源3', feedUrl: 'url3', totalArticles: 150, recommendedCount: 0, readCount: 0, dislikedCount: 0 }
      ]

      const arranged = arrangeSymmetrically(stats)

      // 第一个应该是文章数最多的（200）
      expect(arranged[0].feedId).toBe('f2')
      expect(arranged[0].totalArticles).toBe(200)
    })

    it('应该对称排列订阅源', () => {
      const stats = [
        { feedId: 'f1', feedTitle: '源1', feedUrl: 'url1', totalArticles: 100, recommendedCount: 0, readCount: 0, dislikedCount: 0 },
        { feedId: 'f2', feedTitle: '源2', feedUrl: 'url2', totalArticles: 200, recommendedCount: 0, readCount: 0, dislikedCount: 0 },
        { feedId: 'f3', feedTitle: '源3', feedUrl: 'url3', totalArticles: 150, recommendedCount: 0, readCount: 0, dislikedCount: 0 },
        { feedId: 'f4', feedTitle: '源4', feedUrl: 'url4', totalArticles: 120, recommendedCount: 0, readCount: 0, dislikedCount: 0 },
        { feedId: 'f5', feedTitle: '源5', feedUrl: 'url5', totalArticles: 80, recommendedCount: 0, readCount: 0, dislikedCount: 0 }
      ]

      const arranged = arrangeSymmetrically(stats)

      // 期望顺序: [最高(200), 第3高(120), 最低(80), 第4高(100), 第2高(150)]
      // 这样会形成对称分布
      expect(arranged[0].totalArticles).toBe(200) // 顶部
      expect(arranged.length).toBe(5)
      
      // 验证总数量不变
      expect(arranged.map(s => s.feedId).sort()).toEqual(['f1', 'f2', 'f3', 'f4', 'f5'])
    })

    it('应该处理单个订阅源', () => {
      const stats = [
        { feedId: 'f1', feedTitle: '源1', feedUrl: 'url1', totalArticles: 100, recommendedCount: 0, readCount: 0, dislikedCount: 0 }
      ]

      const arranged = arrangeSymmetrically(stats)

      expect(arranged).toHaveLength(1)
      expect(arranged[0].feedId).toBe('f1')
    })

    it('应该处理空数组', () => {
      const arranged = arrangeSymmetrically([])
      expect(arranged).toHaveLength(0)
    })
  })

  describe('normalizeLogarithmic', () => {
    it('应该使用对数刻度归一化', () => {
      const maxValue = 1000
      
      // 测试不同数值的归一化结果
      const normalized100 = normalizeLogarithmic(100, maxValue)
      const normalized500 = normalizeLogarithmic(500, maxValue)
      const normalized1000 = normalizeLogarithmic(1000, maxValue)
      
      // 验证对数关系
      expect(normalized100).toBeLessThan(normalized500)
      expect(normalized500).toBeLessThan(normalized1000)
      expect(normalized1000).toBe(1) // 最大值应该是 1
      
      // 对数刻度应该让小值更可见
      // log(101)/log(1001) ≈ 0.667（比线性的 0.1 大很多）
      expect(normalized100).toBeGreaterThan(0.5)
    })

    it('应该确保最小显示比例', () => {
      const maxValue = 1000
      const minDisplayRatio = 0.1
      
      // 数值为 0 时应该返回最小显示比例
      const normalized0 = normalizeLogarithmic(0, maxValue, minDisplayRatio)
      expect(normalized0).toBe(minDisplayRatio)
      
      // 非常小的数值也应该至少显示最小比例
      const normalized1 = normalizeLogarithmic(1, maxValue, minDisplayRatio)
      expect(normalized1).toBeGreaterThanOrEqual(minDisplayRatio)
    })

    it('应该处理最大值为 0 的情况', () => {
      const normalized = normalizeLogarithmic(10, 0)
      expect(normalized).toBe(0.1) // 返回最小显示比例
    })

    it('应该支持自定义最小显示比例', () => {
      const customMinRatio = 0.05
      const normalized = normalizeLogarithmic(0, 1000, customMinRatio)
      expect(normalized).toBe(customMinRatio)
    })
  })
})
