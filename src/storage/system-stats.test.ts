/**
 * 系统统计缓存测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock db 模块
vi.mock('./db', () => ({
  db: {
    discoveredFeeds: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(5)
        })
      }),
      count: vi.fn().mockResolvedValue(10)
    },
    subscriptions: {
      where: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(5)
      })
    },
    unreadItems: {
      count: vi.fn().mockResolvedValue(3)
    }
  },
  getRecommendationStats: vi.fn().mockResolvedValue({
    unreadCount: 5
  }),
  getPageCount: vi.fn().mockResolvedValue(50)
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
  beforeEach(async () => {
    vi.clearAllMocks()
    // 清空 storage 缓存，避免跨测试污染
    await clearSystemStats()
  })

  // 辅助函数：创建空统计
  function createEmptyStats(): SystemStats {
    return {
      lastUpdated: 0,
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
        },
        lastUpdated: Date.now()
      }
      
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: cachedStats
      })
      
      const result = await getSystemStats()
      
      expect(result.recommendations.unreadCount).toBe(5)
      expect(result.recommendations.generatedToday).toBe(20)
    })
    
    it('应该在缓存过期时返回旧数据并触发刷新', async () => {
      const expiredStats = {
        ...createEmptyStats(),
        recommendations: {
          ...createEmptyStats().recommendations,
          unreadCount: 5,
          generatedToday: 20
        },
        lastUpdated: Date.now() - 2 * 60 * 1000 // 2分钟前（已过期）
      }
      
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: expiredStats
      })
      
      const result = await getSystemStats()
      
      // 应该立即返回旧数据
      expect(result.recommendations.generatedToday).toBe(20)
    })
    
    it('应该在没有缓存时同步数据', async () => {
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({})
      vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      const result = await getSystemStats()
      
      // 应该返回同步后的数据
      expect(result.recommendations).toBeDefined()
      expect(result.feeds).toBeDefined()
      expect(result.learning).toBeDefined()
    })
  })
  
  describe('updateSystemStats', () => {
    it('应该合并更新并调用 storage.set', async () => {
      // 准备现有统计（不过期）
      const existingStats = createEmptyStats()
      
      // @ts-expect-error - Mock 返回值类型不兼容
      const getSpy = vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: existingStats
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      const updates: Partial<SystemStats> = {
        recommendations: {
          lastGeneratedAt: 0,
          lastViewedAt: Date.now(),
          unreadCount: 8,
          generatedToday: 5,
          readToday: 2
        }
      }
      
      await updateSystemStats(updates)
      
      // 验证读取了现有统计
      expect(getSpy).toHaveBeenCalled()
      // 验证保存了合并后的统计
      expect(setSpy).toHaveBeenCalled()
    })
  })
  
  describe('syncSystemStats', () => {
    it('应该从 IndexedDB 同步所有统计', async () => {
      // Mock getSystemStats 返回现有统计，避免循环调用
      const existingStats = createEmptyStats()
      // @ts-expect-error - Mock 返回值类型不兼容
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        systemStats: existingStats
      })
      const setSpy = vi.spyOn(chrome.storage.local, 'set').mockResolvedValue()
      
      await syncSystemStats()
      
      // 验证保存了同步后的数据
      expect(setSpy).toHaveBeenCalled()
      const setCall = setSpy.mock.calls[0][0]
      expect(setCall.systemStats.recommendations.unreadCount).toBe(5) // 来自 mock
      expect(setCall.systemStats.feeds.subscribedCount).toBe(5)
      expect(setCall.systemStats.learning.pageCount).toBe(50)
      expect(setCall.systemStats.lastUpdated).toBeGreaterThan(0)
    })
    
    it('应该在同步失败时静默处理', async () => {
      // Mock db 失败
      const { db } = await import('./db')
      vi.mocked(db.discoveredFeeds.where).mockReturnValue({
        count: vi.fn().mockRejectedValue(new Error('DB error'))
      } as any)
      
      // 不应该抛出错误，而是静默处理
      await expect(syncSystemStats()).resolves.toBeUndefined()
    })
  })
  
  describe('clearSystemStats', () => {
    it('应该清空缓存（用于测试）', async () => {
      const removeSpy = vi.spyOn(chrome.storage.local, 'remove').mockResolvedValue()
      
      await clearSystemStats()
      
      expect(removeSpy).toHaveBeenCalledWith('systemStats')
    })
  })
})
