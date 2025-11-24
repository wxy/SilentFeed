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

import { translateRecommendation, translateRecommendations, getDisplayText, formatLanguageLabel } from './recommendation-translator'
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
      const result = getDisplayText(mockRecommendation, false, false)
      
      expect(result.title).toBe('Test Article')
      expect(result.summary).toBe('This is a test article')
      expect(result.hasTranslation).toBe(false)
      expect(result.isShowingOriginal).toBe(true)
      expect(result.sourceLanguage).toBe('en')
    })

    it('应该在有翻译且启用自动翻译时返回译文', () => {
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

      const result = getDisplayText(translatedRec, false, true)
      
      expect(result.title).toBe('测试文章')
      expect(result.summary).toBe('这是一篇测试文章')
      expect(result.currentLanguage).toBe('zh-CN')
      expect(result.hasTranslation).toBe(true)
      expect(result.isShowingOriginal).toBe(false)
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

      const result = getDisplayText(translatedRec, true, true)
      
      expect(result.title).toBe('Test Article')
      expect(result.summary).toBe('This is a test article')
      expect(result.currentLanguage).toBe('en')
      expect(result.hasTranslation).toBe(true)
      expect(result.isShowingOriginal).toBe(true)
    })
    
    it('应该在禁用自动翻译时始终返回原文', () => {
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

      const result = getDisplayText(translatedRec, false, false)
      
      expect(result.title).toBe('Test Article')
      expect(result.summary).toBe('This is a test article')
      expect(result.currentLanguage).toBe('en')
      expect(result.hasTranslation).toBe(true)
      expect(result.isShowingOriginal).toBe(true)
      expect(result.needsTranslation).toBe(false)
    })
    
    it('应该在启用自动翻译但没有翻译时标记需要翻译', () => {
      // 使用中文推荐，这样源语言(zh-CN)与目标语言(en在测试环境)不同
      const chineseRec: Recommendation = {
        ...mockRecommendation,
        title: '测试文章',
        summary: '这是一篇测试文章'
      }
      
      const result = getDisplayText(chineseRec, false, true)
      
      expect(result.title).toBe('测试文章')
      expect(result.summary).toBe('这是一篇测试文章')
      expect(result.needsTranslation).toBe(true)
      expect(result.sourceLanguage).toBe('zh-CN')
    })
    
    it('应该检测日文语言', () => {
      const japaneseRec: Recommendation = {
        ...mockRecommendation,
        title: 'これはテストです',
        summary: 'テスト記事の要約'
      }
      
      const result = getDisplayText(japaneseRec, false, false)
      expect(result.sourceLanguage).toBe('ja')
    })
    
    it('应该检测韩文语言', () => {
      const koreanRec: Recommendation = {
        ...mockRecommendation,
        title: '테스트 기사',
        summary: '테스트 요약'
      }
      
      const result = getDisplayText(koreanRec, false, false)
      expect(result.sourceLanguage).toBe('ko')
    })
    
    it('应该使用 excerpt 作为 summary 的备选', () => {
      const recWithExcerpt: Recommendation = {
        ...mockRecommendation,
        summary: '',
        excerpt: 'This is an excerpt'
      }
      
      const result = getDisplayText(recWithExcerpt, false, false)
      expect(result.summary).toBe('This is an excerpt')
    })
    
    it('应该在 showOriginal=true 时保留 targetLanguage', () => {
      const translatedRec: Recommendation = {
        ...mockRecommendation,
        translation: {
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          translatedTitle: '测试',
          translatedSummary: '测试',
          translatedAt: Date.now()
        }
      }
      
      const result = getDisplayText(translatedRec, true, true)
      expect(result.targetLanguage).toBe('zh-CN')
    })
  })
  
  describe('formatLanguageLabel', () => {
    it('应该格式化中文代码为 ZH', () => {
      expect(formatLanguageLabel('zh-CN')).toBe('ZH')
      expect(formatLanguageLabel('zh-TW')).toBe('ZH')
    })
    
    it('应该格式化其他语言代码', () => {
      expect(formatLanguageLabel('en')).toBe('EN')
      expect(formatLanguageLabel('ja')).toBe('JA')
      expect(formatLanguageLabel('ko')).toBe('KO')
      expect(formatLanguageLabel('fr')).toBe('FR')
    })
  })
})
