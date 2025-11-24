/**
 * 推荐条目翻译辅助函数测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Recommendation } from '@/types/database'

// Mock dependencies BEFORE imports
vi.mock('@/storage/ui-config', () => ({
  getUIConfig: vi.fn()
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    withTag: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}))

vi.mock('./TranslationService', () => {
  return {
    TranslationService: vi.fn().mockImplementation(() => ({
      translateText: vi.fn()
    }))
  }
})

import { translateRecommendation, translateRecommendations, getDisplayText } from './recommendation-translator'
import { getUIConfig } from '@/storage/ui-config'
import { TranslationService } from './TranslationService'

const mockGetUIConfig = vi.mocked(getUIConfig)

describe('推荐条目翻译', () => {
  const mockRecommendation: Recommendation = {
    id: 'test-1',
    url: 'https://example.com/article',
    title: 'Test Article',
    summary: 'This is a test article',
    source: 'RSS',
    sourceUrl: 'https://example.com/feed',
    recommendedAt: Date.now(),
    score: 0.8,
    isRead: false,
    status: 'active'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('translateRecommendation', () => {
    it('应该在未启用翻译时返回原推荐', async () => {
      mockGetUIConfig.mockResolvedValue({
        style: 'sketchy',
        autoTranslate: false
      })

      const result = await translateRecommendation(mockRecommendation)
      expect(result).toEqual(mockRecommendation)
      expect(result.translation).toBeUndefined()
    })

    it.skip('应该在启用翻译时添加翻译字段', async () => {
      // TODO: 修复 mock 后启用此测试
      mockGetUIConfig.mockResolvedValue({
        style: 'sketchy',
        autoTranslate: true
      })

      // Mock the translateText method
      const mockTranslateText = vi.fn()
        .mockResolvedValueOnce({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedText: '测试文章'
        })
        .mockResolvedValueOnce({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedText: '这是一篇测试文章'
        })

      vi.mocked(TranslationService).mockImplementation(() => ({
        translateText: mockTranslateText,
        translateBatch: vi.fn(),
        detectLanguage: vi.fn()
      } as any))

      const result = await translateRecommendation(mockRecommendation)
      
      expect(result.translation).toBeDefined()
      expect(result.translation?.sourceLanguage).toBe('en')
      expect(result.translation?.targetLanguage).toBe('zh-CN')
      expect(result.translation?.translatedTitle).toBe('测试文章')
      expect(result.translation?.translatedSummary).toBe('这是一篇测试文章')
    })

    it('应该在源语言与目标语言相同时不添加翻译', async () => {
      mockGetUIConfig.mockResolvedValue({
        style: 'sketchy',
        autoTranslate: true
      })

      const mockTranslateText = vi.fn()
        .mockResolvedValue({
          sourceLanguage: 'zh-CN',
          targetLanguage: 'zh-CN',
          translatedText: '中文文章'
        })

      vi.mocked(TranslationService).mockImplementation(() => ({
        translateText: mockTranslateText,
        translateBatch: vi.fn(),
        detectLanguage: vi.fn()
      } as any))

      const chineseRec = {
        ...mockRecommendation,
        title: '中文文章',
        summary: '这是中文摘要'
      }

      const result = await translateRecommendation(chineseRec)
      expect(result.translation).toBeUndefined()
    })
  })

  describe('translateRecommendations', () => {
    it('应该批量翻译多个推荐', async () => {
      mockGetUIConfig.mockResolvedValue({
        style: 'sketchy',
        autoTranslate: true
      })

      const mockTranslateText = vi.fn()
        .mockResolvedValue({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedText: '翻译文本'
        })

      vi.mocked(TranslationService).mockImplementation(() => ({
        translateText: mockTranslateText,
        translateBatch: vi.fn(),
        detectLanguage: vi.fn()
      } as any))

      const recommendations = [
        mockRecommendation,
        { ...mockRecommendation, id: 'test-2' }
      ]

      const result = await translateRecommendations(recommendations)
      expect(result).toHaveLength(2)
    })

    it('应该在未启用翻译时返回原推荐数组', async () => {
      mockGetUIConfig.mockResolvedValue({
        style: 'sketchy',
        autoTranslate: false
      })

      const recommendations = [mockRecommendation]
      const result = await translateRecommendations(recommendations)
      expect(result).toEqual(recommendations)
    })
  })

  describe('getDisplayText', () => {
    it('应该在无翻译时返回原文', () => {
      const result = getDisplayText(mockRecommendation)
      
      expect(result.title).toBe('Test Article')
      expect(result.summary).toBe('This is a test article')
      expect(result.hasTranslation).toBe(false)
    })

    it('应该在有翻译时返回译文', () => {
      const translatedRec: Recommendation = {
        ...mockRecommendation,
        translation: {
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试文章',
          translatedSummary: '这是一篇测试文章',
          translatedAt: Date.now()
        }
      }

      const result = getDisplayText(translatedRec)
      
      expect(result.title).toBe('测试文章')
      expect(result.summary).toBe('这是一篇测试文章')
      expect(result.language).toBe('zh-CN')
      expect(result.hasTranslation).toBe(true)
    })

    it('应该在 showOriginal=true 时返回原文', () => {
      const translatedRec: Recommendation = {
        ...mockRecommendation,
        translation: {
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试文章',
          translatedSummary: '这是一篇测试文章',
          translatedAt: Date.now()
        }
      }

      const result = getDisplayText(translatedRec, true)
      
      expect(result.title).toBe('Test Article')
      expect(result.summary).toBe('This is a test article')
      expect(result.language).toBe('en')
      expect(result.hasTranslation).toBe(true)
    })
  })
})
