/**
 * 系统统计缓存测试
 * 重构版本：避免循环调用导致的内存泄漏
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock db 模块
vi.mock('./db', () => ({
  db: {
    discoveredFeeds: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(5)
        })
      })
    },
    feedArticles: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(10)
        })),
        above: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(15)
        }))
      }))
    },
    recommendations: {
      where: vi.fn(() => ({
        above: vi.fn(() => ({
          limit: vi.fn(() => ({
            toArray: vi.fn().mockResolvedValue([
              { isRead: true, feedback: null },
              { isRead: false, feedback: 'dismissed' },
              { isRead: false, feedback: 'later' }
            ])
          }))
        }))
      }))
    },
    confirmedVisits: {
      where: vi.fn(() => ({
        above: vi.fn(() => ({
          limit: vi.fn(() => ({
            toArray: vi.fn().mockResolvedValue([
              { visitTime: Date.now(), duration: 60000 },
              { visitTime: Date.now() - 3600000, duration: 90000 }
            ])
          }))
        }))
      }))
    }
  },
  getRecommendationStats: vi.fn().mockResolvedValue({
    unreadCount: 5
  }),
  getPageCount: vi.fn().mockResolvedValue(50)
}))

// Mock system-thresholds 模块
vi.mock('./system-thresholds', () => ({
  getSystemThresholds: vi.fn().mockResolvedValue({
    learningCompletePages: 100
  })
}))

// 在 mock 后导入模块
import {
  getSystemStats,
  updateSystemStats,
  syncSystemStats,
  clearSystemStats
} from './system-stats'
import type { SystemStats } from './system-stats'

describe('system-stats', () => {
  // 保存原始的 chrome.storage mock
  let originalGet: any
  let originalSet: any
  let originalRemove: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // 保存原始 mock
    originalGet = chrome.storage.local.get
    originalSet = chrome.storage.local.set
    originalRemove = chrome.storage.local.remove
    
    // 清空 storage 缓存
    await clearSystemStats()
  })

  afterEach(() => {
    // 恢复原始 mock
    chrome.storage.local.get = originalGet
    chrome.storage.local.set = originalSet
    chrome.storage.local.remove = originalRemove
  })

  // 辅助函数：创建空统计
  function createEmptyStats(): SystemStats {
    return {
      lastUpdated: Date.now(),
      recommendations: {
        lastGeneratedAt: 0,
        lastViewedAt: 0,
        unreadCount: 0,
        generatedToday: 0,
        readToday: 0
      },
      feeds: {
        subscribedCount: 0,
        lastFetchedAt: 0,
        unreadArticleCount: 0
      },
      aiUsage: {
        requestsToday: 0,
        tokensToday: 0,
        costToday: 0
      },
      learning: {
        pageCount: 0,
        isComplete: false
      }
    }
  }

  describe('getSystemStats', () => {
    it('应该从 local storage 读取未过期的统计', async () => {
      const cachedStats = {
        ...createEmptyStats(),
        recommendations: {
          ...createEmptyStats().recommendations,
          unreadCount: 5,
          generatedToday: 20
        }
      }
      
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: cachedStats
      })
      
      const result = await getSystemStats()
      
      expect(result.recommendations.unreadCount).toBe(5)
      expect(result.recommendations.generatedToday).toBe(20)
    })
    
    it('应该在没有缓存时返回空统计', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      const result = await getSystemStats()
      
      // 应该返回空统计
      expect(result).toBeDefined()
      expect(result.recommendations.unreadCount).toBe(0)
    })
  })
  
  describe('updateSystemStats', () => {
    it('应该合并更新并保存', async () => {
      const existingStats = createEmptyStats()
      
      const getSpy = vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: existingStats
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      await updateSystemStats({
        recommendations: {
          lastGeneratedAt: 0,
          lastViewedAt: Date.now(),
          unreadCount: 8,
          generatedToday: 5,
          readToday: 2
        }
      })
      
      expect(getSpy).toHaveBeenCalled()
      expect(setSpy).toHaveBeenCalled()
    })
  })
  
  describe('syncSystemStats', () => {
    it('应该从数据库同步统计', async () => {
      const getSpy = vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: createEmptyStats()
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      await syncSystemStats()
      
      // 应该调用了 storage 操作
      expect(getSpy).toHaveBeenCalled()
      expect(setSpy).toHaveBeenCalled()
    })
  })
  
  describe('clearSystemStats', () => {
    it('应该清空缓存', async () => {
      const removeSpy = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue()
      
      await clearSystemStats()
      
      expect(removeSpy).toHaveBeenCalledWith('systemStats')
    })
  })
})
