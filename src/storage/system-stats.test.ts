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
      // syncSystemStats 会调用内部的 collectStats 和 updateSystemStats
      // 这个测试主要确保它不会抛出错误
      await expect(syncSystemStats()).resolves.toBeUndefined()
    })
  })
  
  describe('clearSystemStats', () => {
    it('应该清空缓存', async () => {
      const removeSpy = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue()
      
      await clearSystemStats()
      
      expect(removeSpy).toHaveBeenCalledWith('systemStats')
    })
  })
  
  describe('getSystemStats 边界测试', () => {
    it('应该在过期时触发后台刷新', async () => {
      const expiredStats = {
        ...createEmptyStats(),
        lastUpdated: Date.now() - 2 * 60 * 1000 // 2分钟前（超过1分钟过期时间）
      }
      
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: expiredStats
      })
      vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      const result = await getSystemStats()
      
      // 应该返回当前值（即使过期）
      expect(result).toBeDefined()
    })
    
    it('应该处理 storage 读取错误', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('Storage error'))
      
      const result = await getSystemStats()
      
      // 应该返回空统计作为兜底
      expect(result).toBeDefined()
      expect(result.recommendations.unreadCount).toBe(0)
    })
  })
  
  describe('updateSystemStats 边界测试', () => {
    it('应该处理 storage 写入错误', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: createEmptyStats()
      })
      vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(new Error('Write error'))
      
      // 应该静默失败，不抛出错误
      await expect(updateSystemStats({
        recommendations: {
          lastGeneratedAt: 0,
          lastViewedAt: Date.now(),
          unreadCount: 5,
          generatedToday: 3,
          readToday: 1
        }
      })).resolves.toBeUndefined()
    })
    
    it('应该正确更新 lastUpdated 时间戳', async () => {
      const existingStats = createEmptyStats()
      const beforeUpdate = Date.now()
      
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: existingStats
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      await updateSystemStats({
        recommendations: {
          lastGeneratedAt: 0,
          lastViewedAt: Date.now(),
          unreadCount: 3,
          generatedToday: 2,
          readToday: 1
        }
      })
      
      expect(setSpy).toHaveBeenCalled()
      const savedStats = setSpy.mock.calls[0][0].systemStats
      expect(savedStats.lastUpdated).toBeGreaterThanOrEqual(beforeUpdate)
    })
  })
  
  describe('clearSystemStats 边界测试', () => {
    it('应该处理 storage 删除错误', async () => {
      vi.spyOn(chrome.storage.local, 'remove').mockRejectedValue(new Error('Remove error'))
      
      // 应该静默失败，不抛出错误
      await expect(clearSystemStats()).resolves.toBeUndefined()
    })
  })
})
