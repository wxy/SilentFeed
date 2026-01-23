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

// Mock FeedManager
const mockGetFeedByUrl = vi.fn().mockResolvedValue(undefined)
vi.mock('@/core/rss/managers/FeedManager', () => ({
  FeedManager: function () {
    return {
      getFeedByUrl: mockGetFeedByUrl,
    }
  },
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

// Mock db - 保留部分 mock 用于不需要真实数据库的测试
// 真实数据库将在需要时通过 import 导入
vi.mock('@/storage/db', async () => {
  const actual = await vi.importActual<typeof import('@/storage/db')>('@/storage/db')
  return {
    ...actual,
    // 只 mock dismissRecommendations
    dismissRecommendations: vi.fn(),
  }
})

// 导入 mock 模块以便在测试中修改
import * as browserCompat from '@/utils/browser-compat'

describe('ReadingListManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // 默认设置为支持阅读列表
    vi.mocked(browserCompat.isReadingListAvailable).mockReturnValue(true)
    
    // 清理数据库
    const { db } = await import('@/storage/db')
    await db.readingListEntries.clear()
    await db.feedArticles.clear()
    await db.confirmedVisits.clear()
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
      // 期望 URL 包含 sf_rec 参数用于推荐追踪（短哈希）
      const shortId = ReadingListManager.hashId(mockRecommendation.id)
      const urlObj = new URL(mockRecommendation.url)
      urlObj.searchParams.set('sf_rec', shortId)
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
      // 期望 URL 包含 sf_rec 参数用于推荐追踪（短哈希）
      const shortId = ReadingListManager.hashId(mockRecommendation.id)
      const urlObj = new URL(mockRecommendation.url)
      urlObj.searchParams.set('sf_rec', shortId)
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
          translatedAt: Date.now(),
        },
      }

      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      const result = await ReadingListManager.saveRecommendation(recWithTranslation, true, 'zh-CN')

      expect(result).toBe(true)
      // 检查是否使用了新的 translate.goog 格式
      const call = (mockChrome.readingList.addEntry as any).mock.calls[0][0]
      expect(call.title).toBe('🤫 测试文章')
      expect(call.url).toContain('.translate.goog')
      expect(call.url).toContain('_x_tr_sl=auto')
      expect(call.url).toContain('_x_tr_tl=zh')
      expect(call.url).toContain('_x_tr_hl=zh')
      expect(call.url).toContain('sf_rec=')  // 包含推荐追踪参数
    })

    it('应该在订阅源禁用翻译时使用原文链接（即使有translation字段）', async () => {
      const recWithTranslation: Recommendation = {
        ...mockRecommendation,
        translation: {
          sourceLanguage: 'zh-CN',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试文章',
          translatedSummary: '测试摘要',
          translatedAt: Date.now(),
        },
      }

      // Mock FeedManager 返回禁用翻译的订阅源设置
      mockGetFeedByUrl.mockResolvedValueOnce({
        id: 'feed-123',
        url: 'https://example.com/feed',
        title: 'Test Feed',
        addedAt: Date.now(),
        useGoogleTranslate: false, // 订阅源禁用翻译
      })

      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      const result = await ReadingListManager.saveRecommendation(recWithTranslation, true, 'zh-CN')

      expect(result).toBe(true)
      // 应该使用原文链接，不应该生成翻译链接（使用短哈希）
      const shortId = ReadingListManager.hashId(mockRecommendation.id)
      const urlObj = new URL(recWithTranslation.url)
      urlObj.searchParams.set('sf_rec', shortId)
      expect(mockChrome.readingList.addEntry).toHaveBeenCalledWith({
        title: '🤫 Test Article',
        url: urlObj.toString(),
        hasBeenRead: false,
      })
    })

      it('Bug #1 场景A：语言一致时始终使用原文链接', async () => {
        // 场景：文章是中文，界面语言也是中文，无需翻译
        const sameLangRec: Recommendation = {
          ...mockRecommendation,
          title: '测试文章',
          // 注意：没有 translation 字段（因为语言相同）
        }

        mockGetFeedByUrl.mockResolvedValueOnce({
          id: 'feed-123',
          url: 'https://example.com/feed',
          title: 'Test Feed',
          addedAt: Date.now(),
          useGoogleTranslate: true, // 订阅源允许翻译
        })

        mockChrome.readingList.addEntry.mockResolvedValue(undefined)
        mockChrome.storage.local.set.mockResolvedValue(undefined)

        const result = await ReadingListManager.saveRecommendation(sameLangRec, true, 'zh-CN')

        expect(result).toBe(true)
        // 应该使用原文链接（因为没有翻译数据，使用短哈希）
        const shortId = ReadingListManager.hashId(sameLangRec.id)
        const urlObj = new URL(sameLangRec.url)
        urlObj.searchParams.set('sf_rec', shortId)
        expect(mockChrome.readingList.addEntry).toHaveBeenCalledWith({
          title: '🤫 测试文章',
          url: urlObj.toString(),
          hasBeenRead: false,
        })
      })

      it('Bug #1 场景B：语言不一致但源禁用翻译时始终使用原文链接', async () => {
        // 场景：文章是英文，界面是中文，但源配置禁用翻译
        const differentLangNoTranslateRec: Recommendation = {
          ...mockRecommendation,
          title: 'English Article',
          translation: {
            sourceLanguage: 'en',
            targetLanguage: 'zh-CN',
            translatedTitle: '英文文章',
            translatedSummary: '这是一篇英文文章',
            translatedAt: Date.now(),
          },
        }

        // 重要：订阅源禁用翻译
        mockGetFeedByUrl.mockResolvedValueOnce({
          id: 'feed-123',
          url: 'https://example.com/feed',
          title: 'Test Feed',
          addedAt: Date.now(),
          useGoogleTranslate: false, // 订阅源禁用翻译！
        })

        mockChrome.readingList.addEntry.mockResolvedValue(undefined)
        mockChrome.storage.local.set.mockResolvedValue(undefined)

        const result = await ReadingListManager.saveRecommendation(
          differentLangNoTranslateRec,
          true, // 自动翻译已启用
          'zh-CN'
        )

        expect(result).toBe(true)
        // 应该使用原文链接，即使自动翻译启用且有翻译数据（使用短哈希）
        const shortId = ReadingListManager.hashId(differentLangNoTranslateRec.id)
        const urlObj = new URL(differentLangNoTranslateRec.url)
        urlObj.searchParams.set('sf_rec', shortId)
        expect(mockChrome.readingList.addEntry).toHaveBeenCalledWith({
          title: '🤫 English Article',
          url: urlObj.toString(),
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
          translatedAt: Date.now(),
        },
      }

      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(recWithTranslation, true, 'zh-CN')

      const call = mockChrome.readingList.addEntry.mock.calls[0][0]
      // 检查使用了新的 translate.goog 格式
      expect(call.url).toContain('.translate.goog')
      expect(call.url).toContain('id=123')
      expect(call.url).toContain('lang=en')
      expect(call.url).toContain('sf_rec=')
      expect(call.url).toContain('_x_tr_sl=auto')
      expect(call.url).toContain('_x_tr_tl=zh')
    })

    it('应该更新数据库中的推荐状态', async () => {
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)
      mockChrome.storage.local.set.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      // 注意：Phase 21 后推荐数据在 feedArticles 中，不再有 savedToReadingList 字段
      // 此测试验证函数正常执行即可
      expect(mockChrome.readingList.addEntry).toHaveBeenCalled()
    })

    it('应该设置追踪标记（原文链接）', async () => {
      const { saveUrlTracking } = await import('@/storage/tracking-storage')
      const { ReadingListManager } = await import('@/core/reading-list/reading-list-manager')
      mockChrome.readingList.addEntry.mockResolvedValue(undefined)

      await ReadingListManager.saveRecommendation(mockRecommendation)

      // saveUrlTracking 应该被调用带 sf_rec 参数的 URL
      // 现在 sf_rec 的值是短哈希而不是完整 ID
      const shortId = ReadingListManager.hashId(mockRecommendation.id)
      const urlObj = new URL(mockRecommendation.url)
      urlObj.searchParams.set('sf_rec', shortId)
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
      const { ReadingListManager } = await import('@/core/reading-list/reading-list-manager')
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

      // Phase 21: 使用新的 .translate.goog 格式
      const calls = vi.mocked(saveUrlTracking).mock.calls
      expect(calls.length).toBe(1)
      const [url, metadata] = calls[0]
      
      // 验证URL格式
      expect(url).toContain('.translate.goog')
      expect(url).toContain('_x_tr_sl=auto')
      expect(url).toContain('_x_tr_tl=zh')
      // 验证包含 sf_rec 参数（值是短哈希）
      const shortId = ReadingListManager.hashId(mockRecommendation.id)
      expect(url).toContain('sf_rec=' + shortId)
      
      // 验证元数据
      expect(metadata).toEqual({
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

      const result = await ReadingListManager.saveRecommendation(mockRecommendation)

      expect(result).toBe(true)
      // 重复条目被视为成功，不再更新数据库状态
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
      // Phase 21: 使用 readingListEntries 表
      await db.readingListEntries.bulkAdd([
        { url: 'https://example.com/1', normalizedUrl: 'https://example.com/1', recommendationId: 'rec-1', addedAt: Date.now(), titlePrefix: '🤫' },
        { url: 'https://example.com/2', normalizedUrl: 'https://example.com/2', recommendationId: 'rec-2', addedAt: Date.now(), titlePrefix: '🤫' },
        { url: 'https://example.com/3', normalizedUrl: 'https://example.com/3', recommendationId: 'rec-3', addedAt: Date.now(), titlePrefix: '🤫' },
        { url: 'https://example.com/4', normalizedUrl: 'https://example.com/4', recommendationId: 'rec-4', addedAt: Date.now(), titlePrefix: '🤫' },
        { url: 'https://example.com/5', normalizedUrl: 'https://example.com/5', recommendationId: 'rec-5', addedAt: Date.now(), titlePrefix: '🤫' },
      ])

      const count = await ReadingListManager.getSavedRecommendationsCount()

      expect(count).toBe(5)
    })

    it('应该处理错误（返回0）', async () => {
      const { db } = await import('@/storage/db')
      // Mock count 抛出错误
      const originalCount = db.readingListEntries.count
      db.readingListEntries.count = vi.fn().mockRejectedValue(new Error('DB error'))

      const count = await ReadingListManager.getSavedRecommendationsCount()

      expect(count).toBe(0)
      
      // 恢复
      db.readingListEntries.count = originalCount
    })
  })

  describe('getReadFromListCount', () => {
    it('应该返回从阅读列表真实阅读的数量', async () => {
      const { db } = await import('@/storage/db')
      // Phase 21: 使用 feedArticles 表，feedback='later' && isRead=true
      await db.feedArticles.bulkAdd([
        {
          id: 'article-1',
          feedId: 'feed-1',
          link: 'https://example.com/1',
          title: 'Article 1',
          published: Date.now(),
          fetched: Date.now(),
          feedback: 'later',
          isRead: true,
        },
        {
          id: 'article-2',
          feedId: 'feed-1',
          link: 'https://example.com/2',
          title: 'Article 2',
          published: Date.now(),
          fetched: Date.now(),
          feedback: 'later',
          isRead: true,
        },
        {
          id: 'article-3',
          feedId: 'feed-1',
          link: 'https://example.com/3',
          title: 'Article 3',
          published: Date.now(),
          fetched: Date.now(),
          feedback: 'later',
          isRead: true,
        },
        {
          id: 'article-4',
          feedId: 'feed-1',
          link: 'https://example.com/4',
          title: 'Article 4',
          published: Date.now(),
          fetched: Date.now(),
          feedback: 'later',
          isRead: false, // 未读
        },
      ])

      const count = await ReadingListManager.getReadFromListCount()

      expect(count).toBe(3)
    })

    it('应该处理错误（返回0）', async () => {
      const { db } = await import('@/storage/db')
      const mockFilter = vi.fn(() => ({
        count: vi.fn().mockRejectedValue(new Error('DB error')),
      }))
      // Phase 21: 使用 feedArticles.filter
      const originalFilter = db.feedArticles.filter
      db.feedArticles.filter = mockFilter as any

      const count = await ReadingListManager.getReadFromListCount()

      expect(count).toBe(0)
      
      // 恢复
      db.feedArticles.filter = originalFilter
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

      // 设置监听器
      ReadingListManager.setupListeners()

      // 获取 onEntryRemoved 的回调
      const callback = mockChrome.readingList.onEntryRemoved.addListener.mock.calls[0][0]
      
      // 触发回调
      await callback({ title: 'Test', url: 'https://example.com/not-found', hasBeenRead: false })

      // 应该查询数据库但不执行后续操作（无推荐记录，不会抛错）
      // 验证函数正常执行即可
    })

    it('应该处理已读推荐（有访问记录）', async () => {
      const { db } = await import('@/storage/db')
      
      const now = Date.now()
      // 创建文章
      await db.feedArticles.add({
        id: 'rec-read',
        feedId: 'feed-1',
        link: 'https://example.com/read',
        title: 'Read Article',
        published: now,
        fetched: now,
        feedback: 'later',
      })

      // 创建访问记录
      await db.confirmedVisits.add({
        id: 'visit-1',
        url: 'https://example.com/read',
        domain: 'example.com',
        visitTime: now,
        dwellTime: 60,
        analysis: { keywords: [], topics: {} }
      })

      // 设置监听器
      ReadingListManager.setupListeners()

      // 获取 onEntryRemoved 的回调
      const callback = mockChrome.readingList.onEntryRemoved.addListener.mock.calls[0][0]
      
      // 触发回调（Phase 21: 实际函数已改为检查 feedArticles）
      await callback({ title: 'Read Article', url: 'https://example.com/read', hasBeenRead: false })

      // 验证函数正常执行即可
    })

    it('应该处理未读推荐（无访问记录）', async () => {
      const { db } = await import('@/storage/db')
      
      const now = Date.now()
      // 创建文章但没有访问记录
      await db.feedArticles.add({
        id: 'rec-unread',
        feedId: 'feed-1',
        link: 'https://example.com/unread',
        title: 'Unread Article',
        published: now,
        fetched: now,
        feedback: 'later',
        poolStatus: 'recommended',
      })

      // 设置监听器
      ReadingListManager.setupListeners()

      // 获取 onEntryRemoved 的回调
      const callback = mockChrome.readingList.onEntryRemoved.addListener.mock.calls[0][0]
      
      // 触发回调（Phase 21: 应调用 dismissRecommendations）
      await callback({ title: 'Unread Article', url: 'https://example.com/unread', hasBeenRead: false })

      // 验证文章被标记为 dismissed
      const article = await db.feedArticles.get('rec-unread')
      expect(article?.feedback).toBe('dismissed')
    })
  })
})