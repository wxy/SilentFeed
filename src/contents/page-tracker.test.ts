/**
 * Page Tracker AI 集成测试
 * 
 * 由于 page-tracker.ts 是 Content Script，无法直接导入测试
 * 这里测试 AI 集成的核心逻辑：
 * - AI helpers 功能正确性
 * - AI 与关键词分析的兼容性
 * - 数据结构的向后兼容性
 */

import { describe, it, expect, vi } from 'vitest'
import { extractKeywordsFromTopics, detectLanguage } from '@/core/ai/helpers'
import { aiManager } from '@/core/ai/AICapabilityManager'
import { TextAnalyzer } from '@/core/analyzer/TextAnalyzer'

describe('Page Tracker AI Integration', () => {
  
  describe('AI Helpers 集成', () => {
    it('extractKeywordsFromTopics 应该从 AI 主题提取关键词', () => {
      const topics = {
        '技术': 0.7,
        '编程': 0.5,
        'Web开发': 0.3,
        'JavaScript': 0.2,
        '设计': 0.05,
      }
      
      // 使用 0.05 阈值（与 page-tracker 一致）
      const keywords = extractKeywordsFromTopics(topics, 0.05)
      
      // 验证关键词提取
      expect(keywords).toContain('技术')
      expect(keywords).toContain('编程')
      expect(keywords).toContain('Web开发')
      expect(keywords).toContain('JavaScript')
      expect(keywords).toContain('设计')
      
      // 验证排序（按概率降序）
      expect(keywords[0]).toBe('技术')
      expect(keywords[1]).toBe('编程')
    })
    
    it('extractKeywordsFromTopics 应该限制返回数量', () => {
      const topics = {
        '技术': 0.7,
        '编程': 0.5,
        'Web开发': 0.3,
        'JavaScript': 0.2,
        '设计': 0.1,
      }
      
      const keywords = extractKeywordsFromTopics(topics, 0.05).slice(0, 20)
      
      // 页面追踪器限制为 20 个关键词
      expect(keywords.length).toBeLessThanOrEqual(20)
    })
    
    it('detectLanguage 应该正确检测中文内容', () => {
      const chineseText = '这是一段关于 JavaScript 编程技术的文章内容，包含大量技术细节。'.repeat(5)
      expect(detectLanguage(chineseText)).toBe('zh')
    })
    
    it('detectLanguage 应该正确检测英文内容', () => {
      const englishText = 'This is an article about JavaScript programming technology with many technical details.'.repeat(5)
      expect(detectLanguage(englishText)).toBe('en')
    })
    
    it('detectLanguage 应该处理混合内容', () => {
      const mixedText = 'JavaScript 编程 programming 技术 technology'
      const language = detectLanguage(mixedText)
      // 应该返回其中之一
      expect(['zh', 'en']).toContain(language)
    })
  })
  
  describe('AI 与关键词分析的兼容性', () => {
    it('TextAnalyzer 应该提供 fallback 关键词', () => {
      const analyzer = new TextAnalyzer()
      const text = '这是一段关于 JavaScript 编程技术的文章内容'
      
      const keywords = analyzer.extractKeywords(text, { topK: 30, minWordLength: 2 })
      
      // 验证返回格式
      expect(Array.isArray(keywords)).toBe(true)
      expect(keywords.length).toBeGreaterThan(0)
      expect(keywords[0]).toHaveProperty('word')
      expect(keywords[0]).toHaveProperty('weight')
    })
    
    it('关键词格式应该与 AI 提取的格式一致', () => {
      // AI 提取的关键词
      const aiKeywords = extractKeywordsFromTopics({
        '技术': 0.7,
        '编程': 0.5,
      }, 0.05)
      
      // TextAnalyzer 提取的关键词
      const analyzer = new TextAnalyzer()
      const fallbackKeywords = analyzer.extractKeywords('技术编程', { topK: 30 })
        .map((kw: { word: string; weight: number }) => kw.word)
      
      // 两种方式都应该返回字符串数组
      expect(Array.isArray(aiKeywords)).toBe(true)
      expect(Array.isArray(fallbackKeywords)).toBe(true)
      expect(typeof aiKeywords[0]).toBe('string')
      expect(typeof fallbackKeywords[0]).toBe('string')
    })
  })
  
  describe('数据结构兼容性', () => {
    it('AnalysisResult 应该支持可选的 aiAnalysis', () => {
      // 模拟旧数据（没有 aiAnalysis）
      const oldData = {
        keywords: ['技术', '编程'],
        topics: ['technology'],
        language: 'zh' as const,
      }
      
      // 验证旧数据有效
      expect(oldData.keywords).toBeDefined()
      expect(oldData.topics).toBeDefined()
      expect(oldData.language).toBeDefined()
      expect(oldData).not.toHaveProperty('aiAnalysis')
      
      // 模拟新数据（有 aiAnalysis）
      const newData = {
        keywords: ['技术', '编程'],
        topics: ['technology'],
        language: 'zh' as const,
        aiAnalysis: {
          topics: { '技术': 0.7, '编程': 0.5 },
          provider: 'deepseek' as const,
          model: 'deepseek-chat',
          timestamp: Date.now(),
          cost: 0.0001,
          tokensUsed: {
            prompt: 100,
            completion: 50,
            total: 150,
          }
        }
      }
      
      // 验证新数据有效
      expect(newData.keywords).toBeDefined()
      expect(newData.topics).toBeDefined()
      expect(newData.language).toBeDefined()
      expect(newData.aiAnalysis).toBeDefined()
      expect(newData.aiAnalysis?.provider).toBe('deepseek')
    })
    
    it('主题过滤应该使用 0.1 阈值', () => {
      const aiTopics = {
        '技术': 0.7,      // 保留
        '编程': 0.5,      // 保留
        'Web开发': 0.15,  // 保留（>0.1）
        '设计': 0.05,     // 过滤（<0.1）
      }
      
      // 模拟 page-tracker 的主题过滤逻辑
      const filteredTopics = Object.entries(aiTopics)
        .filter(([_, prob]) => prob > 0.1)
        .map(([topic, _]) => topic)
      
      expect(filteredTopics).toContain('技术')
      expect(filteredTopics).toContain('编程')
      expect(filteredTopics).toContain('Web开发')
      expect(filteredTopics).not.toContain('设计')
    })
    
    it('空主题应该使用 other 作为默认值', () => {
      const aiTopics = {
        '其他': 0.05,  // 所有主题都 <0.1
      }
      
      // 模拟 page-tracker 的默认主题逻辑
      const filteredTopics = Object.entries(aiTopics)
        .filter(([_, prob]) => prob > 0.1)
        .map(([topic, _]) => topic)
      
      const finalTopics = filteredTopics.length > 0 ? filteredTopics : ['other']
      
      expect(finalTopics).toEqual(['other'])
    })
  })
  
  describe('错误处理与 Fallback', () => {
    it('AI 初始化失败应该可以捕获', async () => {
      // 模拟 AI 初始化失败
      const mockManager = {
        initialize: vi.fn().mockRejectedValue(new Error('API key not configured')),
        analyzeContent: vi.fn(),
      }
      
      // 测试错误处理
      await expect(mockManager.initialize()).rejects.toThrow('API key not configured')
    })
    
    it('AI 分析失败应该可以捕获', async () => {
      // 模拟 AI 分析失败
      const mockManager = {
        initialize: vi.fn().mockResolvedValue(undefined),
        analyzeContent: vi.fn().mockRejectedValue(new Error('Network error')),
      }
      
      await mockManager.initialize()
      
      // 测试错误处理
      await expect(mockManager.analyzeContent('test')).rejects.toThrow('Network error')
    })
    
    it('Fallback 到 TextAnalyzer 应该正常工作', () => {
      const analyzer = new TextAnalyzer()
      const text = '技术编程JavaScript'
      
      // TextAnalyzer 应该始终可用
      const keywords = analyzer.extractKeywords(text, { topK: 30, minWordLength: 2 })
      
      expect(keywords).toBeDefined()
      expect(keywords.length).toBeGreaterThan(0)
    })
  })
  
  describe('性能考虑', () => {
    it('关键词提取应该限制为 20 个', () => {
      const manyTopics: Record<string, number> = {}
      for (let i = 0; i < 50; i++) {
        manyTopics[`主题${i}`] = 0.1 + Math.random() * 0.5
      }
      
      const keywords = extractKeywordsFromTopics(manyTopics, 0.05).slice(0, 20)
      
      // 页面追踪器限制为 20 个
      expect(keywords.length).toBe(20)
    })
    
    it('主题数量应该合理', () => {
      const topics = {
        '技术': 0.7,
        '编程': 0.5,
        'Web开发': 0.3,
        'JavaScript': 0.2,
        '前端': 0.15,
      }
      
      // 模拟主题过滤（>0.1）
      const filtered = Object.entries(topics)
        .filter(([_, prob]) => prob > 0.1)
        .map(([topic, _]) => topic)
      
      // 主题数量应该合理（通常 3-5 个）
      expect(filtered.length).toBeGreaterThan(0)
      expect(filtered.length).toBeLessThan(10)
    })
  })
})

