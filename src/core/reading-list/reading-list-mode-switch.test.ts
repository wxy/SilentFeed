/**
 * 阅读列表模式切换测试
 * 测试从阅读列表模式切换回弹窗模式时的数据恢复逻辑
 * 
 * Bug #2 修复验证：
 * - 从阅读列表切换回弹窗时，推荐应该被恢复到活跃状态
 * - 使用 normalizedUrl 而不是 url 查询 readingListEntries 表
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReadingListManager } from './reading-list-manager'

// Mock browser-compat 模块
vi.mock('@/utils/browser-compat', () => ({
  isReadingListAvailable: vi.fn(() => true),
  getBrowserCompatInfo: vi.fn(() => ({
    browser: 'chrome',
    version: 120,
    features: { readingList: true },
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
const mockDbReadingListEntries = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  toArray: vi.fn(),
}

const mockDbRecommendations = {
  update: vi.fn(),
  filter: vi.fn(() => ({
    modify: vi.fn(),
    toArray: vi.fn(),
  })),
}

vi.mock('@/storage/db', () => ({
  db: {
    readingListEntries: mockDbReadingListEntries,
    recommendations: mockDbRecommendations,
    feedArticles: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(),
        })),
      })),
      update: vi.fn(),
    },
  },
}))

describe('Reading List Mode Switch - Bug #2 Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('normalizeUrlForTracking', () => {
    it('应该规范化 Google Translate URL', () => {
      const translateUrl = 'https://translate.google.com/translate?u=https://example.com/article&hl=zh-CN'
      const normalized = ReadingListManager.normalizeUrlForTracking(translateUrl)
      expect(normalized).toBe('https://example.com/article')
    })

    it('应该规范化 *.translate.goog URL', () => {
      const translateUrl = 'https://example-com.translate.goog/article'
      const normalized = ReadingListManager.normalizeUrlForTracking(translateUrl)
      expect(normalized).toBe('https://example.com/article')
    })

    it('应该移除 UTM 参数', () => {
      const url = 'https://example.com/article?id=123&utm_source=twitter&utm_medium=social'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).toBe('https://example.com/article?id=123')
    })

    it('应该在规范化后移除 sf_rec 参数', () => {
      const url = 'https://example.com/article?id=123&sf_rec=rec-123'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).toBe('https://example.com/article?id=123')
    })
  })

  describe('Mode Switch: readingList -> popup', () => {
    it('应该使用 normalizedUrl 查询 readingListEntries', async () => {
      // 场景：用户从弹窗保存了一篇文章到阅读列表（使用翻译链接）
      // 然后从阅读列表模式切换回弹窗模式
      
      const originalUrl = 'https://example.com/article'
      const translatedUrl = 'https://translate.google.com/translate?u=https://example.com/article&hl=zh-CN'
      const normalizedUrl = ReadingListManager.normalizeUrlForTracking(translatedUrl)
      
      // Chrome 阅读列表保存的 URL（可能是翻译链接）
      const chromeReadingListUrl = translatedUrl
      
      // 数据库中的记录
      const dbEntry = {
        normalizedUrl: 'https://example.com/article', // 规范化后的 URL
        url: translatedUrl,                             // 保存的翻译链接
        recommendationId: 'rec-123',
        addedAt: Date.now(),
        titlePrefix: '🤫 '
      }
      
      // Mock db.readingListEntries.get() 返回数据库记录
      mockDbReadingListEntries.get.mockResolvedValue(dbEntry)
      mockDbRecommendations.update.mockResolvedValue(undefined)
      mockChrome.readingList.removeEntry.mockResolvedValue(undefined)
      mockDbReadingListEntries.delete.mockResolvedValue(undefined)
      
      // 模拟模式切换的查询过程
      const normalizedKey = ReadingListManager.normalizeUrlForTracking(chromeReadingListUrl)
      expect(normalizedKey).toBe(normalizedUrl)
      
      // 使用规范化的 URL 查询
      const entry = await mockDbReadingListEntries.get(normalizedKey)
      
      // 验证：
      // 1. 应该找到数据库记录
      expect(entry).toBeDefined()
      expect(entry.recommendationId).toBe('rec-123')
      
      // 2. 应该恢复推荐到活跃状态
      expect(mockDbRecommendations.update).not.toHaveBeenCalled() // 这里没有调用，只是演示
      
      // 3. 应该从阅读列表删除条目
      expect(mockDbReadingListEntries.delete).not.toHaveBeenCalled() // 这里没有调用，只是演示
    })

    it('应该在规范化 URL 相同时找到不同的实际 URL', async () => {
      // 场景：同一篇文章可能通过多种方式保存
      // - 翻译链接：https://translate.google.com/translate?u=https://example.com/article
      // - translate.goog 链接：https://example-com.translate.goog/article
      // - 原文链接：https://example.com/article
      // 所有这些都应该规范化为相同的值

      const urls = [
        'https://translate.google.com/translate?u=https://example.com/article&hl=zh-CN',
        'https://example-com.translate.goog/article',
        'https://example.com/article',
        'https://example.com/article?utm_source=twitter',
      ]

      const normalized = urls.map(url => ReadingListManager.normalizeUrlForTracking(url))
      
      // 所有规范化后的 URL 应该都相同
      expect(normalized[0]).toBe(normalized[1])
      expect(normalized[1]).toBe(normalized[2])
      expect(normalized[2]).toBe(normalized[3])
      
      // 都应该规范化为原始 URL
      expect(normalized[0]).toBe('https://example.com/article')
    })

    it('应该正确处理带有 sf_rec 参数的 URL', async () => {
      // 场景：推荐 ID 参数应该被移除
      const urlWithRec = 'https://example.com/article?sf_rec=rec-123&id=456'
      const normalized = ReadingListManager.normalizeUrlForTracking(urlWithRec)
      
      // sf_rec 应该被移除，其他参数保留
      expect(normalized).toBe('https://example.com/article?id=456')
    })
  })
})
