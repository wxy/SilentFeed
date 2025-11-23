/**
 * 翻译服务测试
 */

import { describe, it, expect } from 'vitest'
import { TranslationService } from './TranslationService'

describe('TranslationService', () => {
  const service = new TranslationService()

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
    it('应该在源语言与目标语言相同时返回原文', async () => {
      const text = '这是一段中文'
      const result = await service.translateText(text, 'zh-CN')
      expect(result).toBe(text)
    })

    it('应该在源语言与目标语言不同时尝试翻译（当前返回原文）', async () => {
      const text = 'This is English'
      const result = await service.translateText(text, 'zh-CN')
      // 当前翻译功能未实现，应返回原文
      expect(result).toBe(text)
    })

    it('应该在强制模式下即使语言相同也尝试翻译', async () => {
      const text = '这是一段中文'
      const result = await service.translateText(text, 'zh-CN', { force: true })
      // 当前翻译功能未实现，应返回原文
      expect(result).toBe(text)
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
      // 当前翻译功能未实现
      expect(results[0]).toBe('第一段文字') // 中文不翻译
      expect(results[1]).toBe('第二段文字') // 中文不翻译
      expect(results[2]).toBe('Third paragraph') // 英文不翻译
    })

    it('应该处理空数组', async () => {
      const results = await service.translateBatch([], 'en')
      expect(results).toEqual([])
    })
  })
})
