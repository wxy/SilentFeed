/**
 * 推荐 Store 测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRecommendationStore } from './recommendationStore'
import { db } from '@/storage/db'
import type { Recommendation } from '@/types/database'
import { recommendationService } from '../core/recommender/RecommendationService'

// Mock recommendationService
vi.mock('../core/recommender/RecommendationService', () => ({
  recommendationService: {
    generateRecommendations: vi.fn().mockResolvedValue({
      recommendations: [],
      stats: {
        totalFeeds: 0,
        processedFeeds: 0,
        totalArticles: 0,
        recommendedArticles: 0
      },
      errors: []
    })
  }
}))

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({}),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
} as any

describe('RecommendationStore', () => {
  beforeEach(async () => {
    // 清空数据库
    await db.delete()
    await db.open()
    
    // 重置 store
    useRecommendationStore.setState({
      recommendations: [],
      stats: null,
      isLoading: false,
      error: null
    })
  })

  afterEach(async () => {
    await db.close()
  })

  describe('loadRecommendations', () => {
    it('应该加载未读推荐', async () => {
      // 准备测试数据
      const testRecommendations: Recommendation[] = [
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
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
          recommendedAt: Date.now() - 1000,
          score: 0.8,
          isRead: false
        }
      ]
      
      await db.recommendations.bulkAdd(testRecommendations)
      
      // 加载推荐
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      // 验证
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(2)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('应该只加载未读推荐', async () => {
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '未读推荐',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '已读推荐',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now() - 1000,
          score: 0.8,
          isRead: true
        }
      ])
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(1)
      expect(state.recommendations[0].title).toBe('未读推荐')
    })

    it('应该处理加载错误', async () => {
      // Mock 数据库错误
      const spy = vi.spyOn(db.recommendations, 'filter').mockImplementation(() => {
        throw new Error('数据库错误')
      })
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      const state = useRecommendationStore.getState()
      expect(state.error).toBe('数据库错误')
      expect(state.isLoading).toBe(false)
      
      spy.mockRestore()
    })
  })

  describe('refreshStats', () => {
    it('应该刷新推荐统计', async () => {
      // 准备测试数据
      await db.recommendations.add({
        id: '1',
        url: 'https://example.com/1',
        title: '推荐 1',
        summary: '摘要',
        source: 'Source',
        sourceUrl: 'https://source.com',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: true,
        clickedAt: Date.now(),
        readDuration: 150,
        scrollDepth: 0.8,
        effectiveness: 'effective'
      })
      
      const store = useRecommendationStore.getState()
      await store.refreshStats(7)
      
      const state = useRecommendationStore.getState()
      expect(state.stats).not.toBeNull()
      expect(state.stats?.totalCount).toBe(1)
      expect(state.stats?.readCount).toBe(1)
      expect(state.stats?.unreadCount).toBe(0)
    })
  })

  describe('markAsRead', () => {
    it('应该标记推荐为已读并从列表移除', async () => {
      // 准备测试数据
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now() - 1000,
          score: 0.8,
          isRead: false
        }
      ])
      
      // 加载推荐
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      // 标记已读
      await store.markAsRead('1', 150, 0.8)
      
      // 验证
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(1)
      expect(state.recommendations[0].id).toBe('2')
      
      // 验证数据库
      const dbRec = await db.recommendations.get('1')
      expect(dbRec?.isRead).toBe(true)
      expect(dbRec?.effectiveness).toBe('effective')
    })
  })

  describe('dismissAll', () => {
    it('应该标记所有推荐为"不想读"', async () => {
      // 准备测试数据
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now() - 1000,
          score: 0.8,
          isRead: false
        }
      ])
      
      // 加载推荐
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      expect(useRecommendationStore.getState().recommendations).toHaveLength(2)
      
      // 全部标记为"不想读"
      await store.dismissAll()
      
      // 验证
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(0)
      
      // 验证数据库
      const dismissed1 = await db.recommendations.get('1')
      const dismissed2 = await db.recommendations.get('2')
      
      expect(dismissed1?.feedback).toBe('dismissed')
      expect(dismissed1?.effectiveness).toBe('ineffective')
      expect(dismissed2?.feedback).toBe('dismissed')
    })

    it('应该处理空列表', async () => {
      const store = useRecommendationStore.getState()
      
      // 不应该抛出错误
      await expect(store.dismissAll()).resolves.toBeUndefined()
    })
  })

  describe('dismissSelected', () => {
    it('应该标记选中推荐为"不想读"', async () => {
      // 准备测试数据
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now() - 1000,
          score: 0.8,
          isRead: false
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '推荐 3',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now() - 2000,
          score: 0.7,
          isRead: false
        }
      ])
      
      // 加载推荐
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      // 标记选中的为"不想读"
      await store.dismissSelected(['1', '3'])
      
      // 验证
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(1)
      expect(state.recommendations[0].id).toBe('2')
      
      // 验证数据库
      const dismissed1 = await db.recommendations.get('1')
      const dismissed3 = await db.recommendations.get('3')
      
      expect(dismissed1?.feedback).toBe('dismissed')
      expect(dismissed3?.feedback).toBe('dismissed')
    })
  })

  describe('reload', () => {
    it('应该同时重新加载推荐和统计', async () => {
      // 准备测试数据
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
      
      const store = useRecommendationStore.getState()
      await store.reload()
      
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(1)
      expect(state.stats).not.toBeNull()
    })
  })

  describe('generateRecommendations', () => {
    it('应该手动生成推荐', async () => {
      // Mock 推荐服务
      vi.doMock('../core/recommender/RecommendationService', () => ({
        recommendationService: {
          generateRecommendations: vi.fn().mockResolvedValue({
            recommendations: ['rec1', 'rec2'],
            errors: []
          })
        }
      }))
      
      // 准备一些订阅源的文章
      await db.feedArticles.add({
        id: 'article1',
        feedId: 'feed1',
        title: 'Test Article',
        link: 'https://example.com/article1',
        published: Date.now(),
        fetched: Date.now()
      })
      
      const store = useRecommendationStore.getState()
      await store.generateRecommendations()
      
      const state = useRecommendationStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('应该处理生成推荐时的警告', async () => {
      // Mock 推荐服务返回警告
      vi.doMock('../core/recommender/RecommendationService', () => ({
        recommendationService: {
          generateRecommendations: vi.fn().mockResolvedValue({
            recommendations: ['rec1'],
            errors: ['Warning: Some feeds failed']
          })
        }
      }))
      
      const store = useRecommendationStore.getState()
      await store.generateRecommendations()
      
      const state = useRecommendationStore.getState()
      expect(state.isLoading).toBe(false)
      // 有警告但仍有推荐，不应该设置错误
      expect(state.error).toBeNull()
    })

    it('应该处理生成推荐完全失败', async () => {
      // Mock 推荐服务返回错误且无推荐
      vi.mocked(recommendationService.generateRecommendations).mockResolvedValueOnce({
        recommendations: [],
        stats: {
          totalFeeds: 0,
          processedFeeds: 0,
          totalArticles: 0,
          recommendedArticles: 0
        },
        errors: ['Error: All feeds failed']
      })
      
      const store = useRecommendationStore.getState()
      await store.generateRecommendations()
      
      const state = useRecommendationStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe('Error: All feeds failed')
    })

    it('应该处理生成推荐时的异常', async () => {
      // Mock 推荐服务抛出异常
      vi.mocked(recommendationService.generateRecommendations).mockRejectedValueOnce(
        new Error('Network error')
      )
      
      const store = useRecommendationStore.getState()
      await store.generateRecommendations()
      
      const state = useRecommendationStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe('Network error')
    })
  })

  describe('chrome API 交互', () => {
    it('应该在标记已读后通知背景脚本', async () => {
      const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage')
      
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
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      await store.markAsRead('1')
      
      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'RECOMMENDATIONS_DISMISSED'
      })
    })

    it('应该处理通知背景脚本失败', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage')
        .mockRejectedValue(new Error('Extension context invalidated'))
      
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
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      await store.markAsRead('1')
      
      // 应该静默处理错误，不影响主流程
      const state = useRecommendationStore.getState()
      expect(state.recommendations).toHaveLength(0) // 推荐已被移除
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[RecommendationStore] 无法通知背景脚本更新图标:',
        expect.any(Error)
      )
      
      sendMessageSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    })

    it('应该在dismissSelected后通知背景脚本', async () => {
      const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage')
      
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
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      await store.dismissSelected(['1'])
      
      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'RECOMMENDATIONS_DISMISSED'
      })
    })

    it('应该处理dismissSelected通知背景脚本失败', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage')
        .mockRejectedValue(new Error('Extension context invalidated'))
      
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
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      await store.dismissSelected(['1'])
      
      // 应该静默处理错误
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[RecommendationStore] 无法通知背景脚本:',
        expect.any(Error)
      )
      
      sendMessageSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    })
  })

  describe('错误处理', () => {
    it('应该在 markAsRead 失败时设置错误', async () => {
      const store = useRecommendationStore.getState()
      
      // 尝试标记不存在的推荐
      await store.markAsRead('nonexistent')
      
      const state = useRecommendationStore.getState()
      expect(state.error).not.toBeNull()
      expect(state.error).toContain('推荐记录不存在')
    })

    it('应该在 dismissAll 失败时设置错误', async () => {
      // Mock 数据库错误
      const spy = vi.spyOn(db, 'transaction').mockImplementation(() => {
        throw new Error('事务失败')
      })
      
      // 先加载一些推荐
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
      
      const store = useRecommendationStore.getState()
      await store.loadRecommendations()
      
      // 尝试标记所有为"不想读"
      await store.dismissAll()
      
      const state = useRecommendationStore.getState()
      expect(state.error).toBe('事务失败')
      
      spy.mockRestore()
    })

    it('应该在 dismissSelected 失败时设置错误', async () => {
      // Mock 数据库错误
      const spy = vi.spyOn(db, 'transaction').mockImplementation(() => {
        throw new Error('事务失败')
      })
      
      const store = useRecommendationStore.getState()
      await store.dismissSelected(['1'])
      
      const state = useRecommendationStore.getState()
      expect(state.error).toBe('事务失败')
      
      spy.mockRestore()
    })

    it('应该在 refreshStats 失败时静默处理', async () => {
      // 清理缓存确保数据库调用会触发
      const { statsCache } = await import('@/storage/db')
      statsCache.clear()
      
      // Mock 数据库错误
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const spy = vi.spyOn(db.recommendations, 'where').mockImplementation(() => {
        throw new Error('查询失败')
      })
      
      const store = useRecommendationStore.getState()
      
      // 不应该抛出错误，静默处理
      await expect(store.refreshStats()).resolves.toBeUndefined()
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('刷新统计失败:', expect.any(Error))
      
      spy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })
})
