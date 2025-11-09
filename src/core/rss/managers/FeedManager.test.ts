/**
 * FeedManager 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FeedManager } from './FeedManager'
import { db } from '../../../storage/db'
import type { DiscoveredFeed } from '../../types'

// Mock 数据库
vi.mock('../../../storage/db', () => ({
  db: {
    discoveredFeeds: {
      add: vi.fn(),
      get: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn()
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
      
      // Mock where().equals().first() 返回 undefined（源不存在）
      const mockFirst = vi.fn().mockResolvedValue(undefined)
      const mockEquals = vi.fn().mockReturnValue({ first: mockFirst })
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
          enabled: true
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
        enabled: true
      }
      
      // Mock where().equals().first() 返回已存在的源
      const mockFirst = vi.fn().mockResolvedValue(existingFeed)
      const mockEquals = vi.fn().mockReturnValue({ first: mockFirst })
      const mockWhere = vi.fn().mockReturnValue({ equals: mockEquals })
      vi.mocked(db.discoveredFeeds.where).mockReturnValue(mockWhere() as any)
      
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
          enabled: true
        },
        {
          id: '2',
          url: 'https://example2.com/feed.xml',
          title: 'Feed 2',
          discoveredFrom: 'https://example2.com',
          discoveredAt: Date.now(),
          status: 'subscribed',
          enabled: true
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
          enabled: true
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
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.subscribe('test-id')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          status: 'subscribed'
        })
      )
    })
  })
  
  describe('unsubscribe', () => {
    it('应该取消订阅并清除订阅时间', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.unsubscribe('test-id')
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        {
          status: 'candidate',
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
        { enabled: true }
      )
    })
    
    it('应该暂停源', async () => {
      vi.mocked(db.discoveredFeeds.update).mockResolvedValue(1)
      
      await feedManager.setEnabled('test-id', false)
      
      expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
        'test-id',
        { enabled: false }
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
})
