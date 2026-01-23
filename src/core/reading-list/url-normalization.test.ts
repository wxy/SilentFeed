import { ReadingListManager } from './reading-list-manager'
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('URL 规范化 - ReadingListManager.normalizeUrlForTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('移除 UTM 参数', () => {
    it('应该移除 utm_source 参数', () => {
      const url = 'https://example.com/article?id=123&utm_source=twitter'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('utm_source')
      expect(normalized).toContain('id=123')
    })

    it('应该移除所有 UTM 参数', () => {
      const url = 'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=test&utm_content=link&utm_term=keyword'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('utm_')
      expect(normalized).toBe('https://example.com/article')
    })

    it('应该保留其他有意义的参数', () => {
      const url = 'https://example.com/article?id=123&page=2&utm_source=twitter'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).toContain('id=123')
      expect(normalized).toContain('page=2')
      expect(normalized).not.toContain('utm_source')
    })
  })

  describe('移除其他追踪参数', () => {
    it('应该移除 fbclid 参数', () => {
      const url = 'https://example.com/article?id=123&fbclid=IwAR123456'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('fbclid')
      expect(normalized).toContain('id=123')
    })

    it('应该移除 gclid 参数', () => {
      const url = 'https://example.com/article?id=123&gclid=CjwKCAiA8OmdBhAwEiwAVVyv'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('gclid')
      expect(normalized).toContain('id=123')
    })

    it('应该移除 msclkid 参数', () => {
      const url = 'https://example.com/article?id=123&msclkid=ABC123'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('msclkid')
      expect(normalized).toContain('id=123')
    })

    it('应该移除 _ga 参数', () => {
      const url = 'https://example.com/article?id=123&_ga=2.123456789'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('_ga')
      expect(normalized).toContain('id=123')
    })
  })

  describe('Google Translate URL 处理', () => {
    it('应该规范化 Google Translate URL (translate.google.com 格式)', () => {
      const originalUrl = 'https://example.com/article?id=123'
      const translatedUrl = `https://translate.google.com/translate?u=${encodeURIComponent(originalUrl)}&hl=zh-CN`
      
      const normalized = ReadingListManager.normalizeUrlForTracking(translatedUrl)
      // 规范化后应该提取原始 URL，移除 Google Translate 包装
      expect(normalized).toBe(originalUrl)
    })

    it('应该规范化 translate.goog 格式的 URL', () => {
      const originalUrl = 'https://example.com/article'
      const translatedUrl = 'https://example-com.translate.goog/article?_x_tr_sl=en&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN'
      
      const normalized = ReadingListManager.normalizeUrlForTracking(translatedUrl)
      // 规范化后应该还原为原始 URL
      expect(normalized).toBe(originalUrl)
    })

    it('应该处理复杂域名的 translate.goog URL', () => {
      const originalUrl = 'https://blog.example.com/article?id=123'
      const translatedUrl = 'https://blog-example-com.translate.goog/article?id=123&_x_tr_sl=en&_x_tr_tl=zh-CN'
      
      const normalized = ReadingListManager.normalizeUrlForTracking(translatedUrl)
      // 规范化后应该还原为原始 URL
      expect(normalized).toBe(originalUrl)
    })

    it('两个相同的 URL 规范化后应该相等（不考虑 UTM）', () => {
      const url1 = 'https://example.com/article?id=123'
      const url2WithUtm = 'https://example.com/article?id=123&utm_source=twitter&utm_medium=social'
      
      const normalized1 = ReadingListManager.normalizeUrlForTracking(url1)
      const normalized2 = ReadingListManager.normalizeUrlForTracking(url2WithUtm)
      
      expect(normalized1).toBe(normalized2)
    })

    it('原始 URL 和翻译 URL 规范化后应该相等', () => {
      const originalUrl = 'https://example.com/article?id=123'
      const translatedUrl = 'https://example-com.translate.goog/article?id=123&_x_tr_sl=en&_x_tr_tl=zh-CN'
      
      const normalized1 = ReadingListManager.normalizeUrlForTracking(originalUrl)
      const normalized2 = ReadingListManager.normalizeUrlForTracking(translatedUrl)
      
      expect(normalized1).toBe(normalized2)
    })
  })

  describe('无效 URL 处理', () => {
    it('应该处理无效 URL 并返回原始值', () => {
      const invalidUrl = 'not a valid url'
      const normalized = ReadingListManager.normalizeUrlForTracking(invalidUrl)
      expect(normalized).toBe(invalidUrl)
    })

    it('应该处理空字符串', () => {
      const normalized = ReadingListManager.normalizeUrlForTracking('')
      expect(normalized).toBe('')
    })
  })

  describe('复杂场景', () => {
    it('应该处理多个相同参数的 URL', () => {
      const url = 'https://example.com/article?id=123&utm_source=twitter&id=456&utm_medium=social'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).not.toContain('utm_')
      // 其他参数应该保留
      expect(normalized).toContain('id=')
    })

    it('应该保留 fragment（#后面的内容）', () => {
      const url = 'https://example.com/article?id=123&utm_source=twitter#section-2'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).toContain('#section-2')
      expect(normalized).not.toContain('utm_source')
    })

    it('应该保留路径参数', () => {
      const url = 'https://example.com/articles/2024/01/test-article?id=123&utm_source=twitter'
      const normalized = ReadingListManager.normalizeUrlForTracking(url)
      expect(normalized).toContain('/articles/2024/01/test-article')
      expect(normalized).not.toContain('utm_source')
    })
  })

  describe('数据库查询匹配场景', () => {
    it('原始 URL 和带 UTM 的 URL 应该规范化到相同值', () => {
      const originalUrl = 'https://medium.com/@author/article-title-12345'
      const urlWithUtm = 'https://medium.com/@author/article-title-12345?utm_source=twitter&utm_campaign=sharing'
      
      const normalized1 = ReadingListManager.normalizeUrlForTracking(originalUrl)
      const normalized2 = ReadingListManager.normalizeUrlForTracking(urlWithUtm)
      
      expect(normalized1).toBe(normalized2)
    })

    it('应该能用于数据库的 WHERE 查询', () => {
      // 这个测试验证规范化后的 URL 可以用作数据库键
      const pageUrl = 'https://example.com/article?id=123&utm_source=email&utm_campaign=newsletter'
      const dbEntryUrl = 'https://example.com/article?id=123'
      
      const normalizedPage = ReadingListManager.normalizeUrlForTracking(pageUrl)
      const normalizedDbEntry = ReadingListManager.normalizeUrlForTracking(dbEntryUrl)
      
      // 应该能通过规范化后的 URL 查询到数据库中的条目
      expect(normalizedPage).toBe(normalizedDbEntry)
    })
  })
})
