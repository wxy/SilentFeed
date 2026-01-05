/**
 * 订阅源分类和语言工具测试
 */

import { describe, it, expect } from 'vitest'
import {
  FEED_CATEGORIES,
  FEED_LANGUAGES,
  isValidCategoryKey,
  normalizeCategoryToKey,
  normalizeLanguageCode,
  type FeedCategoryKey,
  type FeedLanguageKey,
} from './feed-category'

describe('feed-category', () => {
  describe('FEED_CATEGORIES', () => {
    it('应该包含所有标准分类', () => {
      expect(FEED_CATEGORIES).toContain('tech')
      expect(FEED_CATEGORIES).toContain('news')
      expect(FEED_CATEGORIES).toContain('finance')
      expect(FEED_CATEGORIES).toContain('lifestyle')
      expect(FEED_CATEGORIES).toContain('entertainment')
      expect(FEED_CATEGORIES).toContain('other')
    })

    it('应该是只读数组', () => {
      expect(FEED_CATEGORIES.length).toBeGreaterThan(0)
    })
  })

  describe('isValidCategoryKey', () => {
    it('应该识别有效的分类 key', () => {
      expect(isValidCategoryKey('tech')).toBe(true)
      expect(isValidCategoryKey('news')).toBe(true)
      expect(isValidCategoryKey('finance')).toBe(true)
      expect(isValidCategoryKey('other')).toBe(true)
    })

    it('应该拒绝无效的分类 key', () => {
      expect(isValidCategoryKey('invalid')).toBe(false)
      expect(isValidCategoryKey('技术')).toBe(false)
      expect(isValidCategoryKey('TECH')).toBe(false)
      expect(isValidCategoryKey('')).toBe(false)
    })
  })

  describe('normalizeCategoryToKey', () => {
    it('应该保持已经是标准 key 的分类不变', () => {
      expect(normalizeCategoryToKey('tech')).toBe('tech')
      expect(normalizeCategoryToKey('news')).toBe('news')
      expect(normalizeCategoryToKey('finance')).toBe('finance')
    })

    it('应该将中文分类名映射到标准 key', () => {
      expect(normalizeCategoryToKey('技术')).toBe('tech')
      expect(normalizeCategoryToKey('科技')).toBe('tech')
      expect(normalizeCategoryToKey('编程')).toBe('tech')
      expect(normalizeCategoryToKey('新闻')).toBe('news')
      expect(normalizeCategoryToKey('财经')).toBe('finance')
      expect(normalizeCategoryToKey('金融')).toBe('finance')
      expect(normalizeCategoryToKey('生活')).toBe('lifestyle')
      expect(normalizeCategoryToKey('娱乐')).toBe('entertainment')
    })

    it('应该将英文分类名映射到标准 key', () => {
      expect(normalizeCategoryToKey('technology')).toBe('tech')
      expect(normalizeCategoryToKey('programming')).toBe('tech')
      expect(normalizeCategoryToKey('investment')).toBe('finance')
      expect(normalizeCategoryToKey('entertainment')).toBe('entertainment')
      expect(normalizeCategoryToKey('gaming')).toBe('gaming')
    })

    it('应该处理大小写混合', () => {
      expect(normalizeCategoryToKey('TECH')).toBe('tech')
      expect(normalizeCategoryToKey('Tech')).toBe('tech')
      expect(normalizeCategoryToKey('NEWS')).toBe('news')
    })

    it('应该处理带空格的输入', () => {
      expect(normalizeCategoryToKey(' tech ')).toBe('tech')
      expect(normalizeCategoryToKey('  news  ')).toBe('news')
    })

    it('应该将未知分类映射到 other', () => {
      expect(normalizeCategoryToKey('unknown')).toBe('other')
      expect(normalizeCategoryToKey('随便')).toBe('other')
      expect(normalizeCategoryToKey('xyz')).toBe('other')
    })

    it('应该将空字符串映射到 other', () => {
      expect(normalizeCategoryToKey('')).toBe('other')
    })

    it('应该处理特殊分类别名', () => {
      expect(normalizeCategoryToKey('软件')).toBe('tech')
      expect(normalizeCategoryToKey('互联网')).toBe('tech')
      expect(normalizeCategoryToKey('IT')).toBe('tech')
      expect(normalizeCategoryToKey('股票')).toBe('finance')
      expect(normalizeCategoryToKey('理财')).toBe('finance')
      expect(normalizeCategoryToKey('影视')).toBe('entertainment')
      expect(normalizeCategoryToKey('综艺')).toBe('entertainment')
      expect(normalizeCategoryToKey('电竞')).toBe('gaming')
      expect(normalizeCategoryToKey('手游')).toBe('gaming')
    })
  })

  describe('FEED_LANGUAGES', () => {
    it('应该包含所有标准语言代码', () => {
      expect(FEED_LANGUAGES).toContain('zh-CN')
      expect(FEED_LANGUAGES).toContain('zh-TW')
      expect(FEED_LANGUAGES).toContain('en')
      expect(FEED_LANGUAGES).toContain('ja')
      expect(FEED_LANGUAGES).toContain('ko')
      expect(FEED_LANGUAGES).toContain('unknown')
    })
  })

  describe('normalizeLanguageCode', () => {
    it('应该保持标准语言代码不变', () => {
      expect(normalizeLanguageCode('zh-CN')).toBe('zh-CN')
      expect(normalizeLanguageCode('en')).toBe('en')
      expect(normalizeLanguageCode('ja')).toBe('ja')
    })

    it('应该标准化中文语言代码', () => {
      expect(normalizeLanguageCode('zh')).toBe('zh-CN')
      expect(normalizeLanguageCode('zh-hans')).toBe('zh-CN')
      expect(normalizeLanguageCode('chinese')).toBe('zh-CN')
      expect(normalizeLanguageCode('中文')).toBe('zh-CN')
      expect(normalizeLanguageCode('简体中文')).toBe('zh-CN')
    })

    it('应该标准化繁体中文', () => {
      expect(normalizeLanguageCode('zh-tw')).toBe('zh-TW')
      expect(normalizeLanguageCode('zh-hant')).toBe('zh-TW')
      expect(normalizeLanguageCode('繁体中文')).toBe('zh-TW')
      expect(normalizeLanguageCode('繁體中文')).toBe('zh-TW')
    })

    it('应该标准化英语代码', () => {
      expect(normalizeLanguageCode('en-us')).toBe('en')
      expect(normalizeLanguageCode('en-gb')).toBe('en')
      expect(normalizeLanguageCode('english')).toBe('en')
      expect(normalizeLanguageCode('英语')).toBe('en')
      expect(normalizeLanguageCode('英文')).toBe('en')
    })

    it('应该标准化日语代码', () => {
      expect(normalizeLanguageCode('jp')).toBe('ja')
      expect(normalizeLanguageCode('japanese')).toBe('ja')
      expect(normalizeLanguageCode('日语')).toBe('ja')
      expect(normalizeLanguageCode('日文')).toBe('ja')
    })

    it('应该标准化韩语代码', () => {
      expect(normalizeLanguageCode('korean')).toBe('ko')
      expect(normalizeLanguageCode('韩语')).toBe('ko')
      expect(normalizeLanguageCode('韩文')).toBe('ko')
    })

    it('应该标准化其他语言代码', () => {
      expect(normalizeLanguageCode('french')).toBe('fr')
      expect(normalizeLanguageCode('法语')).toBe('fr')
      expect(normalizeLanguageCode('german')).toBe('de')
      expect(normalizeLanguageCode('德语')).toBe('de')
      expect(normalizeLanguageCode('spanish')).toBe('es')
      expect(normalizeLanguageCode('西班牙语')).toBe('es')
    })

    it('应该处理大小写', () => {
      expect(normalizeLanguageCode('ZH-CN')).toBe('zh-CN')
      expect(normalizeLanguageCode('EN')).toBe('en')
      expect(normalizeLanguageCode('JA')).toBe('ja')
    })

    it('应该处理带前缀的语言代码', () => {
      // 从 en-US 提取 en
      expect(normalizeLanguageCode('en-AU')).toBe('en')
      expect(normalizeLanguageCode('fr-CA')).toBe('fr')
      expect(normalizeLanguageCode('de-AT')).toBe('de')
    })

    it('应该将未知语言映射到 unknown', () => {
      expect(normalizeLanguageCode('xyz')).toBe('unknown')
      expect(normalizeLanguageCode('abcdef')).toBe('unknown')
    })

    it('应该将空值映射到 unknown', () => {
      expect(normalizeLanguageCode('')).toBe('unknown')
      expect(normalizeLanguageCode(undefined)).toBe('unknown')
    })
  })
})
