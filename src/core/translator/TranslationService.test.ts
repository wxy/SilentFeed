/**
 * 翻译服务测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { TranslationService } from './TranslationService'

// Mock getAIConfig
vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn()
}))

// Mock logger
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

import { getAIConfig } from '@/storage/ai-config'

const mockGetAIConfig = vi.mocked(getAIConfig)

describe('TranslationService', () => {
  let service: TranslationService
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    service = new TranslationService()
    originalFetch = global.fetch
    
    // 默认 mock: AI 未配置
    mockGetAIConfig.mockResolvedValue({
      enabled: false,
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKeys: {},
      enableReasoning: false
    } as any)
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('语言检测', () => {
    it('应该正确检测中文', () => {
      expect(service.detectLanguage('这是一段中文文本')).toBe('zh-CN')
      expect(service.detectLanguage('Silent Feed 是一个 RSS 阅读器')).toBe('zh-CN')
    })

    it('应该正确检测日文', () => {
      expect(service.detectLanguage('これは日本語のテキストです')).toBe('ja')
      expect(service.detectLanguage('ひらがな')).toBe('ja')
      expect(service.detectLanguage('カタカナ')).toBe('ja')
    })

    it('应该正确检测韩文', () => {
      expect(service.detectLanguage('이것은 한국어 텍스트입니다')).toBe('ko')
      expect(service.detectLanguage('한글')).toBe('ko')
    })

    it('应该将其他语言默认为英文', () => {
      expect(service.detectLanguage('This is English text')).toBe('en')
      expect(service.detectLanguage('Bonjour')).toBe('en')
      expect(service.detectLanguage('Hola')).toBe('en')
      expect(service.detectLanguage('123456')).toBe('en')
    })
  })

  describe('翻译文本', () => {
    it('应该在 AI 未启用时返回原文', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: false,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {},
        enableReasoning: false
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text)
    })

    it('应该在没有 API Key 时返回原文', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {}, // 没有 API Key
        enableReasoning: false
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text)
    })

    it('应该在 provider API Key 不存在时返回原文', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {
          openai: 'test-key' // 只有 openai 的 key，但 provider 是 deepseek
        },
        enableReasoning: false
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text)
    })

    it('应该使用 DeepSeek API 进行翻译', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {
          deepseek: 'test-deepseek-key'
        },
        enableReasoning: false
      } as any)

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '源语言: en\n译文: 这是英文'
            }
          }]
        })
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-deepseek-key'
          })
        })
      )
      
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe('这是英文')
    })

    it('应该使用 OpenAI API 进行翻译', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKeys: {
          openai: 'test-openai-key'
        },
        enableReasoning: false
      } as any)

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '源语言: en\n译文: 这是英文'
            }
          }]
        })
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-openai-key'
          })
        })
      )
      
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe('这是英文')
    })

    it('应该在 API 请求失败时返回原文', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {
          deepseek: 'test-key'
        },
        enableReasoning: false
      } as any)

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('unknown')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text)
    })

    it('应该在网络错误时返回原文', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {
          deepseek: 'test-key'
        },
        enableReasoning: false
      } as any)

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('unknown')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text)
    })

    it('应该在 API 返回格式错误时使用本地检测', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {
          deepseek: 'test-key'
        },
        enableReasoning: false
      } as any)

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Invalid format response'
            }
          }]
        })
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('en') // 本地检测
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text) // 翻译失败，返回原文
    })

    it('应该处理空的 API 响应', async () => {
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKeys: {
          deepseek: 'test-key'
        },
        enableReasoning: false
      } as any)

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: []
        })
      } as any)

      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      
      expect(result.sourceLanguage).toBe('en')
      expect(result.targetLanguage).toBe('zh-CN')
      expect(result.translatedText).toBe(text)
    })
  })

  describe('批量翻译', () => {
    it('应该能够批量翻译多个文本', async () => {
      const texts = [
        '第一段文字',
        '第二段文字',
        'Third paragraph'
      ]
      const results = await service.translateBatch(texts, 'en')
      
      expect(results).toHaveLength(3)
      expect(results[0].sourceLanguage).toBe('zh-CN')
      expect(results[1].sourceLanguage).toBe('zh-CN')
      expect(results[2].sourceLanguage).toBe('en')
      
      // 当前翻译功能未实现，中文不翻译
      expect(results[0].translatedText).toBe('第一段文字')
      expect(results[1].translatedText).toBe('第二段文字')
      // 英文也不翻译（源语言与目标语言相同）
      expect(results[2].translatedText).toBe('Third paragraph')
    })

    it('应该处理空数组', async () => {
      const results = await service.translateBatch([], 'en')
      expect(results).toEqual([])
    })
  })
})
