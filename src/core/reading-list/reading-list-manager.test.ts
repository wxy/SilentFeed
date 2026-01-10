/**
 * ReadingListManager 测试
 * 测试 Chrome 阅读列表管理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReadingListManager } from './reading-list-manager'
import type { Recommendation } from '@/types/database'

// Mock browser-compat 模块 - 默认返回可用
vi.mock('@/utils/browser-compat', () => ({
  isReadingListAvailable: vi.fn(() => true),
  getBrowserCompatInfo: vi.fn(() => ({
    browser: 'chrome',
    version: 120,
    features: {
      readingList: true,
      alarms: true,
      declarativeNetRequest: true,
      notifications: true,
      sidePanel: true,
    },
  })),
}))

// Mock tracking-storage
vi.mock('@/storage/tracking-storage', () => ({
  saveUrlTracking: vi.fn().mockResolvedValue(undefined),
  getUrlTracking: vi.fn().mockResolvedValue(null),
  removeUrlTracking: vi.fn().mockResolvedValue(undefined),
}))

// Mock chrome API
const mockChrome = {
  readingList: {
    addEntry: vi.fn(),
    query: vi.fn(),
    removeEntry: vi.fn(),
    onEntryUpdated: {
      addListener: vi.fn(),
    },
    onEntryAdded: {
      addListener: vi.fn(),
    },
    onEntryRemoved: {
      addListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
}

global.chrome = mockChrome as any

// Mock db
vi.mock('@/storage/db', () => ({
  db: {
    recommendations: {
      update: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
        })),
      })),
      filter: vi.fn(() => ({
        first: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      })),
    },
    readingListEntries: {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    feedArticles: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(undefined),
        })),
      })),
      update: vi.fn(),
    },
    confirmedVisits: {
      filter: vi.fn(() => ({
        first: vi.fn(),
      })),
    },
  },
  dismissRecommendations: vi.fn(),
}))

// 导入 mock 模块以便在测试中修改
import * as browserCompat from '@/utils/browser-compat'

describe('ReadingListManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认设置为支持阅读列表
    vi.mocked(browserCompat.isReadingListAvailable).mockReturnValue(true)
  })

  describe('isAvailable', () => {
    it('应该返回浏览器兼容性状态', () => {
      vi.mocked(browserCompat.isReadingListAvailable).mockReturnValue(true)
      expect(ReadingListManager.isAvailable()).toBe(true)

      vi.mocked(browserCompat.isReadingListAvailable).mockReturnValue(false)
      expect(ReadingListManager.isAvailable()).toBe(false)
    })
  })

  describe('saveRecommendation', () => {
    const mockRecommendation: Recommendation = {
      id: 'rec-123',
      title: 'Test Article',
      url: 'https://example.com/article',
      summary: 'Test summary',
      source: 'RSS',
      sourceUrl: 'https://example.com/feed',
      recommendedAt: Date.now(),
      score: 0.8,
      reason: { type: 'topic-match', provider: 'deepseek', score: 0.8, topics: ['tech'] },
      isRead: false,
      status: 'active',
    }

    it('应该在浏览器不支持时返回 false', async () => {
      vi.mocked(browserCompat.isReadingListAvailable).mockReturnValue(false)

      const result = await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(result).toBe(false)
      expect(mockChrome.readingList.addEntry).not.toHaveBeenCalled()
    })

    it('应该保存原文链接（未启用自动翻译）', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      const result = await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(result).toBe(true)
      // 期望 URL 包含 sf_rec 参数用于推荐追踪
      const urlObj = new URL(mockRecommendation.url)
      urlObj.searchParams.set('sf_rec', mockRecommendation.id)
      expect(mockChrome.readingList.addEntry).toHaveBeenCalledWith({
        title: '🤫 Test Article',
        url: urlObj.toString(),
        hasBeenRead: false,
      })
    })

    it('应该保存原文链接（启用自动翻译但无翻译数据）', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      const result = await ReadingListManager.saveRecommendation(mockRecommendation, true, 'zh-CN')

      expect(result).toBe(true)
      // 期望 URL 包含 sf_rec 参数用于推荐追踪
      const urlObj = new URL(mockRecommendation.url)
      urlObj.searchParams.set('sf_rec', mockRecommendation.id)
      expect(mockChrome.readingList.addEntry).toHaveBeenCalledWith({
        title: '🤫 Test Article',
        url: urlObj.toString(),
        hasBeenRead: false,
      })
    })

    it('应该保存翻译链接（启用自动翻译且有翻译数据）', async () => {
      const recWithTranslation: Recommendation = {
        ...mockRecommendation,
        translation: {
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试文章',
          translatedSummary: '测试摘要',
          translatedAt: Date.now(),
        },
      }

      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      const result = await ReadingListManager.saveRecommendation(recWithTranslation, true, 'zh-CN')

      expect(result).toBe(true)
      // 期望 URL 包含 sf_rec 参数用于推荐追踪
      const urlObj = new URL(recWithTranslation.url)
      urlObj.searchParams.set('sf_rec', mockRecommendation.id)
      const urlWithTracking = urlObj.toString()
      expect(mockChrome.readingList.addEntry).toHaveBeenCalledWith({
        title: '🤫 测试文章',
        url: `https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(urlWithTracking)}`,
        hasBeenRead: false,
      })
    })

    it('应该正确编码翻译URL', async () => {
      const recWithTranslation: Recommendation = {
        ...mockRecommendation,
        url: 'https://example.com/article?id=123&lang=en',
        translation: {
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试文章',
          translatedSummary: '测试摘要',
          translatedAt: Date.now(),
        },
      }

      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(recWithTranslation, true, 'zh-CN')

      const call = mockChrome.readingList.addEntry.mock.calls[0][0]
      // URL 应该包含 sf_rec 参数用于推荐追踪
      // 使用 URL API 正确处理查询参数，自动使用 & 而非 ?
      const urlObj = new URL(recWithTranslation.url)
      urlObj.searchParams.set('sf_rec', mockRecommendation.id)
      const urlWithTracking = urlObj.toString()
      expect(call.url).toBe(
        `https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(urlWithTracking)}`
      )
    })

    it('应该更新数据库中的推荐状态', async () => {
      const { db } = await import('@/storage/db')
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(db.recommendations.update).toHaveBeenCalledWith(mockRecommendation.id, {
        savedToReadingList: true,
        savedAt: expect.any(Number),
        feedback: 'later',  // Phase 14: 标记为"稍后读"
      })
    })

    it('应该设置追踪标记（原文链接）', async () => {
      const { saveUrlTracking } = await import('@/storage/tracking-storage')
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      // saveUrlTracking 应该被调用带 sf_rec 参数的 URL
      // 使用 URL API 正确处理查询参数
      const urlObj = new URL(mockRecommendation.url)
      urlObj.searchParams.set('sf_rec', mockRecommendation.id)
      const urlWithTracking = urlObj.toString()
      expect(saveUrlTracking).toHaveBeenCalledWith(urlWithTracking, {
        recommendationId: mockRecommendation.id,
        title: mockRecommendation.title,
        source: 'readingList',
        action: 'opened',
      })
    })

    it('应该设置追踪标记（翻译链接）', async () => {
      const { saveUrlTracking } = await import('@/storage/tracking-storage')
      const recWithTranslation: Recommendation = {
        ...mockRecommendation,
        translation: {
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试文章',
          translatedSummary: '测试摘要',
          translatedAt: Date.now(),
        },
      }

      mockChrome.readingList.addEntry.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(recWithTranslation, true, 'zh-CN')

      // 翻译 URL 应该包含原始 URL + sf_rec 参数
      const urlWithTracking = `${mockRecommendation.url}?sf_rec=${mockRecommendation.id}`
      const translateUrl = `https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(urlWithTracking)}`
      expect(saveUrlTracking).toHaveBeenCalledWith(translateUrl, {
        recommendationId: mockRecommendation.id,
        title: mockRecommendation.title,
        source: 'readingList',
        action: 'opened',
      })
    })

    it('应该处理重复条目（返回true）', async () => {
      const error = new Error('Duplicate URL')
      mockChrome.readingList.addEntry.mockRejectedValue(error)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      const { db } = await import('@/storage/db')

      const result = await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(result).toBe(true)
      expect(db.recommendations.update).toHaveBeenCalled()
    })

    it('应该处理错误（返回false）', async () => {
      const error = new Error('Network error')
      mockChrome.readingList.addEntry.mockRejectedValue(error)

      const result = await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(result).toBe(false)
    })

    it('应该处理追踪标记设置失败（不影响主功能）', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockRejectedValue(new Error('Storage error'))

      const result = await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(result).toBe(true)
    })
  })

  describe('getEntries', () => {
    it('应该查询所有条目', async () => {
      const mockEntries = [
        { title: 'Article 1', url: 'https://example.com/1', hasBeenRead: false },
        { title: 'Article 2', url: 'https://example.com/2', hasBeenRead: true },
      ]
      mockChrome.readingList.query.mockResolvedValue(mockEntries)

      const result = await ReadingListManager.getEntries()

      expect(result).toEqual(mockEntries)
      expect(mockChrome.readingList.query).toHaveBeenCalledWith({})
    })

    it('应该查询特定URL的条目', async () => {
      const mockEntries = [
        { title: 'Article 1', url: 'https://example.com/1', hasBeenRead: false },
      ]
      mockChrome.readingList.query.mockResolvedValue(mockEntries)

      const result = await ReadingListManager.getEntries({ url: 'https://example.com/1' })

      expect(result).toEqual(mockEntries)
      expect(mockChrome.readingList.query).toHaveBeenCalledWith({ url: 'https://example.com/1' })
    })

    it('应该查询未读条目', async () => {
      const mockEntries = [
        { title: 'Article 1', url: 'https://example.com/1', hasBeenRead: false },
      ]
      mockChrome.readingList.query.mockResolvedValue(mockEntries)

      const result = await ReadingListManager.getEntries({ hasBeenRead: false })

      expect(result).toEqual(mockEntries)
      expect(mockChrome.readingList.query).toHaveBeenCalledWith({ hasBeenRead: false })
    })

    it('应该处理查询错误', async () => {
      mockChrome.readingList.query.mockRejectedValue(new Error('Query error'))

      const result = await ReadingListManager.getEntries()

      expect(result).toEqual([])
    })
  })

  describe('getUnreadCount', () => {
    it('应该返回未读条目数量', async () => {
      const mockEntries = [
        { title: 'Article 1', url: 'https://example.com/1', hasBeenRead: false },
        { title: 'Article 2', url: 'https://example.com/2', hasBeenRead: false },
      ]
      mockChrome.readingList.query.mockResolvedValue(mockEntries)

      const count = await ReadingListManager.getUnreadCount()

      expect(count).toBe(2)
      expect(mockChrome.readingList.query).toHaveBeenCalledWith({ hasBeenRead: false })
    })

    it('应该处理错误（返回0）', async () => {
      mockChrome.readingList.query.mockRejectedValue(new Error('Query error'))

      const count = await ReadingListManager.getUnreadCount()

      expect(count).toBe(0)
    })
  })

  describe('isInReadingList', () => {
    it('应该返回true（URL存在）', async () => {
      const mockEntries = [
        { title: 'Article 1', url: 'https://example.com/1', hasBeenRead: false },
      ]
      mockChrome.readingList.query.mockResolvedValue(mockEntries)

      const result = await ReadingListManager.isInReadingList('https://example.com/1')

      expect(result).toBe(true)
      expect(mockChrome.readingList.query).toHaveBeenCalledWith({ url: 'https://example.com/1' })
    })

    it('应该返回false（URL不存在）', async () => {
      mockChrome.readingList.query.mockResolvedValue([])

      const result = await ReadingListManager.isInReadingList('https://example.com/1')

      expect(result).toBe(false)
    })

    it('应该处理错误（返回false）', async () => {
      mockChrome.readingList.query.mockRejectedValue(new Error('Query error'))

      const result = await ReadingListManager.isInReadingList('https://example.com/1')

      expect(result).toBe(false)
    })
  })

  describe('setupListeners', () => {
    it('应该设置所有事件监听器', () => {
      ReadingListManager.setupListeners()

      expect(mockChrome.readingList.onEntryUpdated.addListener).toHaveBeenCalled()
      expect(mockChrome.readingList.onEntryAdded.addListener).toHaveBeenCalled()
      expect(mockChrome.readingList.onEntryRemoved.addListener).toHaveBeenCalled()
    })
  })

  describe('getSavedRecommendationsCount', () => {
    it('应该返回已保存推荐数量', async () => {
      const { db } = await import('@/storage/db')
      const mockWhere = vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(5),
        })),
      }))
      ;(db.recommendations.where as any) = mockWhere

      const count = await ReadingListManager.getSavedRecommendationsCount()

      expect(count).toBe(5)
      expect(mockWhere).toHaveBeenCalledWith('savedToReadingList')
    })

    it('应该处理错误（返回0）', async () => {
      const { db } = await import('@/storage/db')
      const mockWhere = vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockRejectedValue(new Error('DB error')),
        })),
      }))
      ;(db.recommendations.where as any) = mockWhere

      const count = await ReadingListManager.getSavedRecommendationsCount()

      expect(count).toBe(0)
    })
  })

  describe('getReadFromListCount', () => {
    it('应该返回从阅读列表真实阅读的数量', async () => {
      const { db } = await import('@/storage/db')
      const mockFilter = vi.fn(() => ({
        count: vi.fn().mockResolvedValue(3),
      }))
      ;(db.recommendations.filter as any) = mockFilter

      const count = await ReadingListManager.getReadFromListCount()

      expect(count).toBe(3)
      expect(mockFilter).toHaveBeenCalled()
    })

    it('应该处理错误（返回0）', async () => {
      const { db } = await import('@/storage/db')
      const mockFilter = vi.fn(() => ({
        count: vi.fn().mockRejectedValue(new Error('DB error')),
      }))
      ;(db.recommendations.filter as any) = mockFilter

      const count = await ReadingListManager.getReadFromListCount()

      expect(count).toBe(0)
    })
  })

  describe('maybeShowOnboardingTip (通过 saveRecommendation 触发)', () => {
    const mockRecommendation: Recommendation = {
      id: 'rec-456',
      title: 'Onboarding Test',
      url: 'https://example.com/onboarding',
      summary: 'Test',
      source: 'RSS',
      sourceUrl: 'https://example.com/feed',
      recommendedAt: Date.now(),
      score: 0.9,
      reason: { type: 'topic-match', provider: 'deepseek', score: 0.9, topics: ['test'] },
      isRead: false,
      status: 'active',
    }

    it('应该在首次保存时记录提示（tipCount=1）', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.get.mockResolvedValue({})
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(mockChrome.storage.local.get).toHaveBeenCalledWith('readingListOnboarding')
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        readingListOnboarding: {
          tipCount: 1,
          firstSaveTime: expect.any(Number),
        },
      })
    })

    it('应该在第二次保存时记录不同提示（tipCount=2）', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.get.mockResolvedValue({
        readingListOnboarding: { tipCount: 1, firstSaveTime: Date.now() },
      })
      mockChrome.storage.local.set.mockResolvedValue(undefined)
      mockChrome.readingList.query.mockResolvedValue([{ title: 'Test', url: 'test', hasBeenRead: false }])

      await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        readingListOnboarding: {
          tipCount: 2,
          firstSaveTime: expect.any(Number),
        },
      })
    })

    it('应该在第三次保存时记录简短提示（tipCount=3）', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.get.mockResolvedValue({
        readingListOnboarding: { tipCount: 2, firstSaveTime: Date.now() },
      })
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        readingListOnboarding: {
          tipCount: 3,
          firstSaveTime: expect.any(Number),
        },
      })
    })

    it('应该在达到最大次数后不再更新提示计数', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.get.mockResolvedValue({
        readingListOnboarding: { tipCount: 3, firstSaveTime: Date.now() },
      })
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      // 不应该再更新 tipCount（set 不被调用）
      expect(mockChrome.storage.local.set).not.toHaveBeenCalled()
    })
  })

  describe('handleReadingListRemoved (通过监听器触发)', () => {
    it('应该处理未找到推荐记录的情况', async () => {
      const { db } = await import('@/storage/db')
      const mockFilter = vi.fn(() => ({
        first: vi.fn().mockResolvedValue(undefined),
      }))
      ;(db.recommendations.filter as any) = mockFilter

      // 设置监听器
      ReadingListManager.setupListeners()

      // 获取 onEntryRemoved 的回调
      const callback = mockChrome.readingList.onEntryRemoved.addListener.mock.calls[0][0]
      
      // 触发回调
      await callback({ title: 'Test', url: 'https://example.com/not-found', hasBeenRead: false })

      // 应该查询数据库但不执行后续操作
      expect(mockFilter).toHaveBeenCalled()
    })

    it('应该处理已读推荐（有访问记录）', async () => {
      const { db } = await import('@/storage/db')
      
      const mockRecommendation = {
        id: 'rec-read',
        url: 'https://example.com/read',
        title: 'Read Article',
        savedToReadingList: true,
      }

      const mockVisit = {
        url: 'https://example.com/read',
        recommendationId: 'rec-read',
        visitTime: Date.now(),
        duration: 60000,
      }

      const mockRecFilter = vi.fn(() => ({
        first: vi.fn().mockResolvedValue(mockRecommendation),
      }))
      const mockVisitFilter = vi.fn(() => ({
        first: vi.fn().mockResolvedValue(mockVisit),
      }))

      ;(db.recommendations.filter as any) = mockRecFilter
      ;(db.confirmedVisits.filter as any) = mockVisitFilter

      // 设置监听器
      ReadingListManager.setupListeners()

      // 获取 onEntryRemoved 的回调
      const callback = mockChrome.readingList.onEntryRemoved.addListener.mock.calls[0][0]
      
      // 触发回调
      await callback({ title: 'Read Article', url: 'https://example.com/read', hasBeenRead: false })

      // 应该更新推荐记录
      expect(db.recommendations.update).toHaveBeenCalledWith('rec-read', {
        readAt: mockVisit.visitTime,
        visitCount: 1,
      })
    })

    it('应该处理未读推荐（无访问记录）', async () => {
      const { db, dismissRecommendations } = await import('@/storage/db')
      
      const mockRecommendation = {
        id: 'rec-unread',
        url: 'https://example.com/unread',
        title: 'Unread Article',
        savedToReadingList: true,
      }

      const mockRecFilter = vi.fn(() => ({
        first: vi.fn().mockResolvedValue(mockRecommendation),
      }))
      const mockVisitFilter = vi.fn(() => ({
        first: vi.fn().mockResolvedValue(undefined),
      }))

      ;(db.recommendations.filter as any) = mockRecFilter
      ;(db.confirmedVisits.filter as any) = mockVisitFilter

      // 设置监听器
      ReadingListManager.setupListeners()

      // 获取 onEntryRemoved 的回调
      const callback = mockChrome.readingList.onEntryRemoved.addListener.mock.calls[0][0]
      
      // 触发回调
      await callback({ title: 'Unread Article', url: 'https://example.com/unread', hasBeenRead: false })

      // 应该调用 dismissRecommendations
      expect(dismissRecommendations).toHaveBeenCalledWith(['rec-unread'])
    })
  })
})
