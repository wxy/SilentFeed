/**
 * FeedQualityAnalyzer 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeedQualityAnalyzer } from './FeedQualityAnalyzer'
import type { FetchResult } from './RSSFetcher'

// Mock fetch 和 calculateUpdateFrequency 方法
const mockFetch = vi.fn()
const mockCalculateUpdateFrequency = vi.fn()

// Mock RSSFetcher
vi.mock('./RSSFetcher', () => {
  return {
    RSSFetcher: class {
      fetch = mockFetch
      calculateUpdateFrequency = mockCalculateUpdateFrequency
    },
  }
})

describe('FeedQualityAnalyzer', () => {
  let analyzer: FeedQualityAnalyzer
  
  beforeEach(() => {
    analyzer = new FeedQualityAnalyzer()
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })
  
  describe('analyze', () => {
    it('应该对高质量 RSS 源给出高分', async () => {
      // 模拟高质量 RSS：每天更新，内容完整
      const mockResult: FetchResult = {
        success: true,
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            description: 'Description 1',
            pubDate: new Date('2024-01-10'),
          },
          {
            title: 'Article 2',
            link: 'https://example.com/2',
            description: 'Description 2',
            pubDate: new Date('2024-01-09'),
          },
          {
            title: 'Article 3',
            link: 'https://example.com/3',
            content: 'Content 3',
            pubDate: new Date('2024-01-08'),
          },
        ],
        feedInfo: {
          title: 'Test Feed',
          link: 'https://example.com',
        },
      }
      
      mockFetch.mockResolvedValue(mockResult)
      mockCalculateUpdateFrequency.mockReturnValue(7) // 每天更新
      
      const result = await analyzer.analyze('https://example.com/feed')
      
      expect(result.score).toBeGreaterThanOrEqual(80)
      expect(result.reachable).toBe(true)
      expect(result.formatValid).toBe(true)
      expect(result.updateFrequency).toBe(7)
      expect(result.details.updateFrequencyScore).toBe(100)
      expect(result.details.completenessScore).toBe(100)
      expect(result.details.formatScore).toBe(100)
      expect(result.details.reachabilityScore).toBe(100)
    })
    
    it('应该对中等质量 RSS 源给出中等分数', async () => {
      // 模拟中等质量 RSS：每周更新 2 次，内容基本完整
      const mockResult: FetchResult = {
        success: true,
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            description: 'Description 1',
          },
          {
            title: 'Article 2',
            link: 'https://example.com/2',
            // 缺少 description/content，但有标题和链接
          },
        ],
        feedInfo: {
          title: 'Test Feed',
          link: 'https://example.com',
        },
      }
      
      mockFetch.mockResolvedValue(mockResult)
      mockCalculateUpdateFrequency.mockReturnValue(2) // 每周 2 次
      
      const result = await analyzer.analyze('https://example.com/feed')
      
      expect(result.score).toBeGreaterThan(40)
      expect(result.score).toBeLessThan(80)
      expect(result.details.updateFrequencyScore).toBe(60)
      expect(result.details.completenessScore).toBe(60) // 50% 完整度
    })
    
    it('应该对低质量 RSS 源给出低分', async () => {
      // 模拟低质量 RSS：更新很少，内容不完整
      const mockResult: FetchResult = {
        success: true,
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            // 缺少内容
          },
        ],
        feedInfo: {
          title: 'Test Feed',
          link: 'https://example.com',
        },
      }
      
      mockFetch.mockResolvedValue(mockResult)
      mockCalculateUpdateFrequency.mockReturnValue(0.1) // 很少更新
      
      const result = await analyzer.analyze('https://example.com/feed')
      
      expect(result.score).toBeLessThanOrEqual(50)
      expect(result.details.updateFrequencyScore).toBe(20)
      expect(result.details.completenessScore).toBe(40)
    })
    
    it('应该处理抓取失败的情况', async () => {
      mockFetch.mockResolvedValue({
        success: false,
        items: [],
        feedInfo: { title: '', link: 'https://example.com' },
        error: 'HTTP 404: Not Found',
      })
      
      const result = await analyzer.analyze('https://example.com/feed')
      
      expect(result.score).toBe(0)
      expect(result.reachable).toBe(false)
      expect(result.formatValid).toBe(false)
      expect(result.error).toBe('HTTP 404: Not Found')
    })
    
    it('应该处理网络异常', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      
      const result = await analyzer.analyze('https://example.com/feed')
      
      expect(result.score).toBe(0)
      expect(result.error).toBe('Network error')
    })
  })
  
  describe('calculateUpdateFrequencyScore', () => {
    it('应该给每天更新的源 100 分', () => {
      const score = (analyzer as any).calculateUpdateFrequencyScore(7)
      expect(score).toBe(100)
    })
    
    it('应该给每天更新多次的源 100 分', () => {
      const score = (analyzer as any).calculateUpdateFrequencyScore(14)
      expect(score).toBe(100)
    })
    
    it('应该给每周 3-7 次更新的源 80 分', () => {
      expect((analyzer as any).calculateUpdateFrequencyScore(5)).toBe(80)
      expect((analyzer as any).calculateUpdateFrequencyScore(3)).toBe(80)
    })
    
    it('应该给每周 1-2 次更新的源 60 分', () => {
      expect((analyzer as any).calculateUpdateFrequencyScore(2)).toBe(60)
      expect((analyzer as any).calculateUpdateFrequencyScore(1)).toBe(60)
    })
    
    it('应该给每月更新的源 40 分', () => {
      expect((analyzer as any).calculateUpdateFrequencyScore(0.5)).toBe(40)
      expect((analyzer as any).calculateUpdateFrequencyScore(0.25)).toBe(40)
    })
    
    it('应该给很少更新的源 20 分', () => {
      expect((analyzer as any).calculateUpdateFrequencyScore(0.1)).toBe(20)
      expect((analyzer as any).calculateUpdateFrequencyScore(0)).toBe(20)
    })
  })
  
  describe('calculateCompletenessScore', () => {
    it('应该给完全完整的内容 100 分', () => {
      const items = [
        { title: 'A', link: 'http://a.com', description: 'Desc A' },
        { title: 'B', link: 'http://b.com', content: 'Content B' },
        { title: 'C', link: 'http://c.com', description: 'Desc C' },
      ]
      
      const score = (analyzer as any).calculateCompletenessScore(items)
      expect(score).toBe(100)
    })
    
    it('应该给 80% 完整的内容 80 分', () => {
      const items = [
        { title: 'A', link: 'http://a.com', description: 'Desc A' },
        { title: 'B', link: 'http://b.com', description: 'Desc B' },
        { title: 'C', link: 'http://c.com', description: 'Desc C' },
        { title: 'D', link: 'http://d.com', description: 'Desc D' },
        { title: 'E', link: 'http://e.com' }, // 缺少内容
      ]
      
      const score = (analyzer as any).calculateCompletenessScore(items)
      expect(score).toBe(80)
    })
    
    it('应该给 50% 完整的内容 60 分', () => {
      const items = [
        { title: 'A', link: 'http://a.com', description: 'Desc A' },
        { title: 'B', link: 'http://b.com' }, // 缺少内容
      ]
      
      const score = (analyzer as any).calculateCompletenessScore(items)
      expect(score).toBe(60)
    })
    
    it('应该给少于 50% 完整的内容 40 分', () => {
      const items = [
        { title: 'A', link: 'http://a.com', description: 'Desc A' },
        { title: 'B', link: 'http://b.com' },
        { title: 'C', link: 'http://c.com' },
      ]
      
      const score = (analyzer as any).calculateCompletenessScore(items)
      expect(score).toBe(40)
    })
    
    it('应该给空列表 0 分', () => {
      const score = (analyzer as any).calculateCompletenessScore([])
      expect(score).toBe(0)
    })
  })
  
  describe('checkFormatValidity', () => {
    it('应该接受有效的 Feed', () => {
      const items = [
        { title: 'Article 1', link: 'http://a.com' },
      ]
      const feedInfo = { title: 'Test Feed', link: 'http://example.com' }
      
      const valid = (analyzer as any).checkFormatValidity(items, feedInfo)
      expect(valid).toBe(true)
    })
    
    it('应该拒绝没有标题的 Feed', () => {
      const items = [
        { title: 'Article 1', link: 'http://a.com' },
      ]
      const feedInfo = { title: '', link: 'http://example.com' }
      
      const valid = (analyzer as any).checkFormatValidity(items, feedInfo)
      expect(valid).toBe(false)
    })
    
    it('应该拒绝没有文章的 Feed', () => {
      const items: any[] = []
      const feedInfo = { title: 'Test Feed', link: 'http://example.com' }
      
      const valid = (analyzer as any).checkFormatValidity(items, feedInfo)
      expect(valid).toBe(false)
    })
    
    it('应该拒绝包含无标题文章的 Feed', () => {
      const items = [
        { title: 'Article 1', link: 'http://a.com' },
        { title: '', link: 'http://b.com' },
      ]
      const feedInfo = { title: 'Test Feed', link: 'http://example.com' }
      
      const valid = (analyzer as any).checkFormatValidity(items, feedInfo)
      expect(valid).toBe(false)
    })
  })
})
