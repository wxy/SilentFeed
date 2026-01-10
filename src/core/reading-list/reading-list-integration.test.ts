/**
 * 读取清单 URL 规范化集成测试
 * 验证保存→查询→移除的完整流程
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ReadingListManager } from './reading-list-manager'
import { db } from '~/storage/db'

describe('读取清单集成测试 - URL 规范化流程', () => {
  const mockRecommendation = {
    id: 'test-123',
    url: 'https://example.com/article?id=123&utm_source=twitter',
    title: '测试文章',
    summaryEn: 'Test article',
    keyInsights: ['insight1'],
    titlePrefix: 'TechNews',
    analyzed: true,
    feedback: 'later' as const,
    savedToReadingList: false,
    savedAt: 0,
    favorite: false,
    favoriteAt: 0,
    discoverAt: Date.now(),
    discoveredFrom: 'feed',
    recommendedAt: Date.now(),
    category: 'Technology',
    language: 'en',
    fromFeed: false,
    aiGenerated: true,
    confidence: 0.9,
    poolStatus: 'inPool' as const,
    candidatePoolAddedAt: Date.now(),
    tags: [],
    source: 'test'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // 清理测试数据
    try {
      const allEntries = await db.readingListEntries.toArray()
      for (const entry of allEntries) {
        await db.readingListEntries.delete(entry.normalizedUrl)
      }
    } catch (e) {
      console.warn('清理测试数据失败:', e)
    }
  })

  describe('保存和查询流程', () => {
    it('应该保存规范化的 URL 和原始 URL', async () => {
      // 模拟保存
      const urlToSave = 'https://example.com/article?id=123&utm_source=email'
      const normalizedUrl = ReadingListManager.normalizeUrlForTracking(urlToSave)

      // 保存到数据库
      await db.readingListEntries.put({
        normalizedUrl,
        url: urlToSave,
        recommendationId: mockRecommendation.id,
        addedAt: Date.now(),
        titlePrefix: 'TechNews'
      })

      // 验证规范化
      expect(normalizedUrl).toBe('https://example.com/article?id=123')

      // 查询时应该找到
      const entries = await db.readingListEntries
        .where('normalizedUrl').equals(normalizedUrl)
        .toArray()

      expect(entries).toHaveLength(1)
      expect(entries[0].url).toBe(urlToSave)
      expect(entries[0].normalizedUrl).toBe(normalizedUrl)
    })

    it('应该能通过不同的 UTM 参数查询到相同的条目', async () => {
      // 保存：第一个 URL，带特定的 UTM
      const savedUrl = 'https://example.com/article?id=123&utm_source=twitter'
      const normalizedSaved = ReadingListManager.normalizeUrlForTracking(savedUrl)

      await db.readingListEntries.put({
        normalizedUrl: normalizedSaved,
        url: savedUrl,
        recommendationId: mockRecommendation.id,
        addedAt: Date.now()
      })

      // 查询：第二个 URL，不同的 UTM
      const queryUrl = 'https://example.com/article?id=123&utm_source=email&utm_campaign=newsletter'
      const normalizedQuery = ReadingListManager.normalizeUrlForTracking(queryUrl)

      // 规范化后应该相同
      expect(normalizedSaved).toBe(normalizedQuery)

      // 应该能查询到
      const entries = await db.readingListEntries
        .where('normalizedUrl').equals(normalizedQuery)
        .toArray()

      expect(entries).toHaveLength(1)
      expect(entries[0].url).toBe(savedUrl)
    })

    it('应该能删除找到的条目', async () => {
      const urlToSave = 'https://example.com/article?id=123&utm_source=twitter'
      const normalizedUrl = ReadingListManager.normalizeUrlForTracking(urlToSave)

      // 保存
      await db.readingListEntries.put({
        normalizedUrl,
        url: urlToSave,
        recommendationId: mockRecommendation.id,
        addedAt: Date.now()
      })

      // 验证存在
      let entries = await db.readingListEntries
        .where('normalizedUrl').equals(normalizedUrl)
        .toArray()
      expect(entries).toHaveLength(1)

      // 删除
      await db.readingListEntries.delete(normalizedUrl)

      // 验证已删除
      entries = await db.readingListEntries
        .where('normalizedUrl').equals(normalizedUrl)
        .toArray()
      expect(entries).toHaveLength(0)
    })
  })

  describe('多个参数组合', () => {
    it('应该处理多个 UTM 参数和其他追踪参数', async () => {
      const complexUrl = 'https://example.com/article?id=123&utm_source=twitter&utm_medium=social&utm_campaign=test&fbclid=ABC123&gclid=XYZ789'
      const normalizedUrl = ReadingListManager.normalizeUrlForTracking(complexUrl)

      // 规范化后应该只保留 id 参数
      expect(normalizedUrl).toBe('https://example.com/article?id=123')

      // 保存
      await db.readingListEntries.put({
        normalizedUrl,
        url: complexUrl,
        recommendationId: mockRecommendation.id,
        addedAt: Date.now()
      })

      // 使用简化的 URL 查询应该能找到
      const simpleUrl = 'https://example.com/article?id=123'
      const normalizedSimple = ReadingListManager.normalizeUrlForTracking(simpleUrl)

      const entries = await db.readingListEntries
        .where('normalizedUrl').equals(normalizedSimple)
        .toArray()

      expect(entries).toHaveLength(1)
      expect(entries[0].url).toBe(complexUrl)
    })
  })

  describe('不同主机的 URL 应该不匹配', () => {
    it('应该区分不同的主机', async () => {
      const url1 = 'https://example.com/article?id=123&utm_source=twitter'
      const url2 = 'https://other.com/article?id=123&utm_source=twitter'

      const normalized1 = ReadingListManager.normalizeUrlForTracking(url1)
      const normalized2 = ReadingListManager.normalizeUrlForTracking(url2)

      expect(normalized1).not.toBe(normalized2)

      // 保存第一个
      await db.readingListEntries.put({
        normalizedUrl: normalized1,
        url: url1,
        addedAt: Date.now()
      })

      // 查询第二个不应该找到
      const entries = await db.readingListEntries
        .where('normalizedUrl').equals(normalized2)
        .toArray()

      expect(entries).toHaveLength(0)
    })
  })

  describe('保留有意义的参数', () => {
    it('应该保留路径和有意义的查询参数', async () => {
      const url = 'https://example.com/blog/2024/01/article?id=123&page=2&utm_source=twitter'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)

      expect(normalized).toContain('/blog/2024/01/article')
      expect(normalized).toContain('id=123')
      expect(normalized).toContain('page=2')
      expect(normalized).not.toContain('utm_')
    })

    it('应该保留 fragment', async () => {
      const url = 'https://example.com/article?id=123&utm_source=twitter#section-2'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)

      expect(normalized).toContain('#section-2')
      expect(normalized).toContain('id=123')
      expect(normalized).not.toContain('utm_source')
    })
  })
})
