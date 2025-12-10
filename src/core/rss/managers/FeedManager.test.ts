/**
 * FeedManager 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FeedManager } from './FeedManager'
import { db } from '../../../storage/db'
import type { DiscoveredFeed } from '@/types/rss'

// Mock FeedQualityAnalyzer
vi.mock('../FeedQualityAnalyzer', () => ({
  FeedQualityAnalyzer: class {
    async analyze() {
      return {
        score: 85,
        updateFrequency: 7,
        formatValid: true,
        reachable: true,
        lastChecked: Date.now(),
        details: {
          updateFrequencyScore: 80,
          completenessScore: 90,
          formatScore: 100,
          reachabilityScore: 100
        }
      }
    }
  }
}))

// Mock 数据库
vi.mock('../../../storage/db', () => ({
  db: {
    discoveredFeeds: {
      add: vi.fn(),
      get: vi.fn(),
      toArray: vi.fn(() => Promise.resolve([])), // 添加 toArray mock
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(),
          toArray: vi.fn(() => Promise.resolve([])) // 添加 toArray 支持
        })),
        reverse: vi.fn(() => ({
          sortBy: vi.fn()
        }))
      })),
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          toArray: vi.fn()
        }))
      })),
      update: vi.fn(),
      delete: vi.fn()
    },
    transaction: vi.fn((mode, table, callback) => callback())
  }
}))

describe('FeedManager', () => {
  let feedManager: FeedManager
  
  beforeEach(() => {
    feedManager = new FeedManager()
    vi.clearAllMocks()
  })
  
  describe('addCandidate', () => {
    it('应该添加新的候选源', async () => {
      const mockFeed = {
        url: 'https://example.com/feed.xml',
        title: 'Example Feed',
        description: 'Test feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      
      // Mock toArray 返回空数组（没有已存在的源）
      vi.mocked(db.discoveredFeeds.toArray).mockResolvedValue([])
      
      // Mock where().equals().toArray() 返回空数组（同源不存在）
      const mockToArray = vi.fn().mockResolvedValue([])
      const mockEquals = vi.fn().mockReturnValue({ 
        toArray: mockToArray 
      })
      const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals })
      vi.mocked(db.discoveredFeeds.where).mockReturnValue(mockWhere() as any)
      
      // Mock add
      vi.mocked(db.discoveredFeeds.add).mockResolvedValue('mock-id')
      
      const id = await feedManager.addCandidate(mockFeed)
      
      expect(id).toBeTruthy()
      expect(db.discoveredFeeds.add).toHaveBeenCalledWith(
        expect.objectContaining({
          url: mockFeed.url,
          title: mockFeed.title,
          status: 'candidate',
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
        recommendedCount: 0
        })
      )
    })
    
    it('应该返回已存在源的 ID', async () => {
      const mockFeed = {
        url: 'https://example.com/feed.xml',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      
      const existingFeed: DiscoveredFeed = {
        id: 'existing-id',
        ...mockFeed,
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock toArray 返回已存在的源
      vi.mocked(db.discoveredFeeds.toArray).mockResolvedValue([existingFeed])
      
      // Mock where().equals().toArray() 返回空数组（同源不存在）
      const mockToArray = vi.fn().mockResolvedValue([])
      const mockEquals = vi.fn().mockReturnValue({ toArray: mockToArray })
      const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals })
      vi.mocked(db.discoveredFeeds.where).mockReturnValue(mockWhere() as any)
      
      const id = await feedManager.addCandidate(mockFeed)
      
      expect(id).toBe('existing-id')
      expect(db.discoveredFeeds.add).not.toHaveBeenCalled()
    })
    
    it('应该识别尾部带 / 的重复 URL', async () => {
      const mockFeed = {
        url: 'https://example.com/feed.xml/',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      
      const existingFeed: DiscoveredFeed = {
        id: 'existing-id',
        url: 'https://example.com/feed.xml',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock toArray 返回已存在的源
      vi.mocked(db.discoveredFeeds.toArray).mockResolvedValue([existingFeed])
      
      const id = await feedManager.addCandidate(mockFeed)
      
      expect(id).toBe('existing-id')
      expect(db.discoveredFeeds.add).not.toHaveBeenCalled()
    })
    
    it('应该识别尾部带 index.html 的重复 URL', async () => {
      const mockFeed = {
        url: 'https://example.com/feed/index.xml',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      
      const existingFeed: DiscoveredFeed = {
        id: 'existing-id',
        url: 'https://example.com/feed',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock toArray 返回已存在的源
      vi.mocked(db.discoveredFeeds.toArray).mockResolvedValue([existingFeed])
      
      const id = await feedManager.addCandidate(mockFeed)
      
      expect(id).toBe('existing-id')
      expect(db.discoveredFeeds.add).not.toHaveBeenCalled()
    })
    
    it('应该识别组合情况：尾部带 / 和 index.rss', async () => {
      const mockFeed = {
        url: 'https://example.com/blog/index.rss/',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      
      const existingFeed: DiscoveredFeed = {
        id: 'existing-id',
        url: 'https://example.com/blog',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      // Mock toArray 返回已存在的源
      vi.mocked(db.discoveredFeeds.toArray).mockResolvedValue([existingFeed])
      
      const id = await feedManager.addCandidate(mockFeed)
      
      expect(id).toBe('existing-id')
      expect(db.discoveredFeeds.add).not.toHaveBeenCalled()
    })
  })
  
  describe('getFeeds', () => {
    it('应该返回所有源（按时间倒序）', async () => {
      const mockFeeds: DiscoveredFeed[] = [
        {
          id: '1',
          url: 'https://example1.com/feed.xml',
          title: 'Feed 1',
          discoveredFrom: 'https://example1.com',
          discoveredAt: Date.now() - 1000,
          status: 'candidate',
          isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
        },
        {
          id: '2',
          url: 'https://example2.com/feed.xml',
          title: 'Feed 2',
          discoveredFrom: 'https://example2.com',
          discoveredAt: Date.now(),
          status: 'subscribed',
          isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
        }
      ]
      
      const mockToArray = vi.fn().mockResolvedValue(mockFeeds)
      const mockReverse = vi.fn().mockReturnValue({ toArray: mockToArray })
      const mockOrderBy = vi.fn().mockReturnValue({ reverse: mockReverse })
      vi.mocked(db.discoveredFeeds.orderBy).mockReturnValue(mockOrderBy() as any)
      
      const feeds = await feedManager.getFeeds()
      
      expect(feeds).toEqual(mockFeeds)
      expect(db.discoveredFeeds.orderBy).toHaveBeenCalledWith('discoveredAt')
    })
    
    it('应该按状态过滤源', async () => {
      const mockFeeds: DiscoveredFeed[] = [
        {
          id: '1',
          url: 'https://example1.com/feed.xml',
          title: 'Feed 1',
          discoveredFrom: 'https://example1.com',
          discoveredAt: Date.now(),
          status: 'subscribed',
          isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
        }
      ]
      
      const mockSortBy = vi.fn().mockResolvedValue(mockFeeds)
      const mockReverse = vi.fn().mockReturnValue({ sortBy: mockSortBy })
      const mockEquals = vi.fn().mockReturnValue({ reverse: mockReverse })
      const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals })
      vi.mocked(db.discoveredFeeds.where).mockReturnValue(mockWhere() as any)
      
      const feeds = await feedManager.getFeeds('subscribed')
      
      expect(feeds).toEqual(mockFeeds)
    })
  })
  
  describe('updateStatus', () => {
    it('应该更新源状态为 subscribed 并记录时间', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.updateStatus('test-id', 'subscribed')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          status: 'subscribed',
          subscribedAt: expect.any(Number)
        })
      )
    })
    
    it('应该更新源状态为 ignored', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.updateStatus('test-id', 'ignored')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { status: 'ignored' }
      )
    })
  })
  
  describe('subscribe', () => {
    it('应该订阅源', async () => {
      const mockFeed = {
        id: 'test-id',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        status: 'candidate' as const,
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.subscribe('test-id')
      
      expect(db.discoveredFeeds.get).toHaveBeenCalledWith('test-id')
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          status: 'subscribed'
        })
      )
    })
    
    it('应该订阅源并设置来源', async () => {
      const mockFeed = {
        id: 'test-id',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        status: 'candidate' as const,
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now()
      }
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.subscribe('test-id', 'manual')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          status: 'subscribed',
          subscriptionSource: 'manual'
        })
      )
    })
    
    it('应该在源不存在时抛出错误', async () => {
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(undefined)
      
      await expect(feedManager.subscribe('non-exist')).rejects.toThrow('源不存在')
    })
  })
  
  describe('unsubscribe', () => {
    it('应该取消订阅并放入忽略列表', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.unsubscribe('test-id')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        {
          status: 'ignored',
          subscribedAt: undefined
        }
      )
    })
  })
  
  describe('ignore', () => {
    it('应该忽略源', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.ignore('test-id')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { status: 'ignored' }
      )
    })
  })
  
  describe('setEnabled', () => {
    it('应该启用源', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.setEnabled('test-id', true)
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { isActive: true }
      )
    })
    
    it('应该暂停源', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.setEnabled('test-id', false)
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { isActive: false }
      )
    })
  })
  
  describe('delete', () => {
    it('应该删除源', async () => {
      vi.mocked(db.discoveredFeeds.delete).mockResolvedValue()
      
      await feedManager.delete('test-id')
      
      expect(db.discoveredFeeds.delete).toHaveBeenCalledWith('test-id')
    })
  })
  
  describe('updateQuality', () => {
    it('应该更新质量评估', async () => {
      const quality = {
        updateFrequency: 7,
        formatValid: true,
        reachable: true,
        score: 85,
        lastChecked: Date.now()
      }
      
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.updateQuality('test-id', quality)
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { quality }
      )
    })
  })
  
  describe('updateRelevance', () => {
    it('应该更新相关性评估', async () => {
      const relevance = {
        matchScore: 85,
        matchedTopics: [],
        sampleArticles: [],
        analyzedAt: Date.now()
      }
      
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.updateRelevance('test-id', relevance)
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { relevance }
      )
    })
  })
  
  describe('analyzeFeed', () => {
    it('应该分析源质量', async () => {
      const mockFeed: DiscoveredFeed = {
        id: 'test-id',
        url: 'https://example.com/feed.xml',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      const quality = await feedManager.analyzeFeed('test-id')
      
      expect(db.discoveredFeeds.get).toHaveBeenCalledWith('test-id')
      expect(quality).toBeDefined()
      expect(quality?.score).toBe(85)
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { quality }
      )
    })
    
    it('应该使用缓存的质量数据', async () => {
      const now = Date.now()
      const mockFeed: DiscoveredFeed = {
        id: 'test-id',
        url: 'https://example.com/feed.xml',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: now,
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          score: 75,
          updateFrequency: 5,
          formatValid: true,
          reachable: true,
          lastChecked: now - 1000 // 1 秒前
        }
      }
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)
      
      const quality = await feedManager.analyzeFeed('test-id')
      
      // 应该返回缓存数据
      expect(quality?.score).toBe(75)
      // 不应该调用 update
      expect(db.discoveredFeeds.update).not.toHaveBeenCalled()
    })
    
    it('应该强制重新分析', async () => {
      const now = Date.now()
      const mockFeed: DiscoveredFeed = {
        id: 'test-id',
        url: 'https://example.com/feed.xml',
        title: 'Example Feed',
        discoveredFrom: 'https://example.com',
        discoveredAt: now,
        status: 'candidate',
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          score: 75,
          updateFrequency: 5,
          formatValid: true,
          reachable: true,
          lastChecked: now - 1000
        }
      }
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      const quality = await feedManager.analyzeFeed('test-id', true)
      
      // 应该返回新分析的数据
      expect(quality?.score).toBe(85)
      // 应该调用 update
      expect(db.discoveredFeeds.update).toHaveBeenCalled()
    })
    
    it('应该处理源不存在的情况', async () => {
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(undefined)
      
      const quality = await feedManager.analyzeFeed('non-exist')
      
      expect(quality).toBeNull()
    })
  })
  
  describe('analyzeCandidates', () => {
    it('应该批量分析候选源', async () => {
      const mockFeeds: DiscoveredFeed[] = [
        {
          id: 'feed-1',
          url: 'https://example.com/feed1.xml',
          title: 'Feed 1',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          status: 'candidate',
          isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
        },
        {
          id: 'feed-2',
          url: 'https://example.com/feed2.xml',
          title: 'Feed 2',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          status: 'candidate',
          isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
        }
      ]
      
      // Spy on getFeeds and analyzeFeed
      vi.spyOn(feedManager, 'getFeeds').mockResolvedValue(mockFeeds)
      vi.spyOn(feedManager, 'analyzeFeed').mockResolvedValue({
        score: 85,
        updateFrequency: 7,
        formatValid: true,
        reachable: true,
        lastChecked: Date.now(),
        details: {
          updateFrequencyScore: 80,
          completenessScore: 90,
          formatScore: 100,
          reachabilityScore: 100
        }
      })
      
      const result = await feedManager.analyzeCandidates(10)
      
      expect(result.total).toBe(2)
      expect(result.analyzed).toBe(2)
      expect(result.success).toBe(2)
      expect(result.failed).toBe(0)
    })
    
    it('应该限制分析数量', async () => {
      const mockFeeds: DiscoveredFeed[] = Array.from({ length: 20 }, (_, i) => ({
        id: `feed-${i}`,
        url: `https://example.com/feed${i}.xml`,
        title: `Feed ${i}`,
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        status: 'candidate' as const,
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }))
      
      vi.spyOn(feedManager, 'getFeeds').mockResolvedValue(mockFeeds)
      vi.spyOn(feedManager, 'analyzeFeed').mockResolvedValue({
        score: 85,
        updateFrequency: 7,
        formatValid: true,
        reachable: true,
        lastChecked: Date.now(),
        details: {
          updateFrequencyScore: 80,
          completenessScore: 90,
          formatScore: 100,
          reachabilityScore: 100
        }
      })
      
      const result = await feedManager.analyzeCandidates(5)
      
      expect(result.total).toBe(20)
      expect(result.analyzed).toBe(5) // 应该只分析 5 个
    })
  })
  
  describe('getFeed', () => {
    it('应该获取单个源', async () => {
      const mockFeed: DiscoveredFeed = {
        id: 'test-id',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        status: 'candidate',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)
      
      const feed = await feedManager.getFeed('test-id')
      
      expect(feed).toEqual(mockFeed)
      expect(db.discoveredFeeds.get).toHaveBeenCalledWith('test-id')
    })
  })
  
  describe('getFeedByUrl', () => {
    it('应该通过 URL 获取源', async () => {
      const mockFeed: DiscoveredFeed = {
        id: 'test-id',
        url: 'https://example.com/feed.xml',
        title: 'Test Feed',
        status: 'candidate',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      const mockFirst = vi.fn().mockResolvedValue(mockFeed)
      const mockEquals = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals })
      vi.mocked(db.discoveredFeeds.where).mockReturnValue(mockWhere() as any)
      
      const feed = await feedManager.getFeedByUrl('https://example.com/feed.xml')
      
      expect(feed).toEqual(mockFeed)
    })
  })
  
  describe('deleteMany', () => {
    it('应该批量删除源', async () => {
      const ids = ['feed-1', 'feed-2', 'feed-3']
      
      vi.mocked(db.discoveredFeeds.delete).mockResolvedValue()
      
      await feedManager.deleteMany(ids)
      
      // deleteMany 会在 transaction 中调用 delete
      // 这里简化测试，只验证 delete 被调用了
      expect(db.discoveredFeeds.delete).toHaveBeenCalled()
    })
  })
  
  describe('updateFetchInfo', () => {
    it('应该更新抓取信息（成功）', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.updateFetchInfo('test-id')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          lastFetchedAt: expect.any(Number),
          lastError: undefined
        })
      )
    })
    
    it('应该更新抓取信息（失败）', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.updateFetchInfo('test-id', 'Network error')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          lastFetchedAt: expect.any(Number),
          lastError: 'Network error'
        })
      )
    })
  })
  
  describe('getStats', () => {
    it('应该返回统计数据', async () => {
      const mockFeeds: DiscoveredFeed[] = [
        {
          id: '1',
          url: 'https://example.com/feed1',
          title: 'Feed 1',
          status: 'candidate',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
        recommendedCount: 0
        },
        {
          id: '2',
          url: 'https://example.com/feed2',
          title: 'Feed 2',
          status: 'subscribed',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
        recommendedCount: 0
        },
        {
          id: '3',
          url: 'https://example.com/feed3',
          title: 'Feed 3',
          status: 'ignored',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
        recommendedCount: 0
        }
      ]
      
      vi.spyOn(feedManager, 'getFeeds').mockResolvedValue(mockFeeds)
      
      const stats = await feedManager.getStats()
      
      expect(stats).toEqual({
        total: 3,
        candidate: 1,
        recommended: 0,
        subscribed: 1,
        ignored: 1
      })
    })
  })
  
  describe('toggleActive', () => {
    it('应该切换启用状态', async () => {
      const mockFeed: DiscoveredFeed = {
        id: 'test-id',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        status: 'subscribed',
        discoveredFrom: 'https://example.com',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0
      }
      
      vi.spyOn(feedManager, 'getFeed').mockResolvedValue(mockFeed)
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      const newState = await feedManager.toggleActive('test-id')
      
      expect(newState).toBe(false)
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { isActive: false }
      )
    })
    
    it('应该在源不存在时抛出错误', async () => {
      vi.spyOn(feedManager, 'getFeed').mockResolvedValue(undefined)
      
      await expect(feedManager.toggleActive('non-exist')).rejects.toThrow('源不存在')
    })
  })
  
  describe('getActiveSubscriptions', () => {
    it('应该返回所有启用的订阅源', async () => {
      const mockFeeds: DiscoveredFeed[] = [
        {
          id: 'feed-1',
          url: 'https://example.com/feed1',
          title: 'Feed 1',
          status: 'subscribed',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
        recommendedCount: 0
        },
        {
          id: 'feed-2',
          url: 'https://example.com/feed2',
          title: 'Feed 2',
          status: 'subscribed',
          discoveredFrom: 'https://example.com',
          discoveredAt: Date.now(),
          isActive: false, // 已暂停
          articleCount: 0,
          unreadCount: 0,
        recommendedCount: 0
        }
      ]
      
      const mockToArray = vi.fn().mockResolvedValue(mockFeeds)
      const mockEquals = vi.fn().mockReturnValue({ toArray: mockToArray })
      const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals })
      vi.mocked(db.discoveredFeeds.where).mockReturnValue(mockWhere() as any)
      
      const activeFeeds = await feedManager.getActiveSubscriptions()
      
      expect(activeFeeds).toHaveLength(1)
      expect(activeFeeds[0].id).toBe('feed-1')
      expect(activeFeeds[0].isActive).toBe(true)
    })
  })
})
