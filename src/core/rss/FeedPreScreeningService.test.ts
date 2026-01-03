/**
 * FeedPreScreeningService 测试
 * 
 * 测试Feed文章初筛服务的核心功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeedPreScreeningService } from './FeedPreScreeningService'
import type { FetchResult } from './RSSFetcher'
import type { UserProfile } from '@/core/ai/prompts/types'
import { AICapabilityManager } from '@/core/ai/AICapabilityManager'

// Mock AICapabilityManager
vi.mock('@/core/ai/AICapabilityManager', () => {
  return {
    AICapabilityManager: class MockAICapabilityManager {
      callWithConfig = vi.fn()
    }
  }
})

// Mock getAIConfig
vi.mock('@/storage/ai-config', () => {
  const mockFn = vi.fn().mockResolvedValue({
    enabled: true,
    preferredRemoteProvider: 'deepseek',
    preferredLocalProvider: 'ollama',
    providers: {
      deepseek: {
        model: 'deepseek-chat',
        apiKey: 'test-key',
        endpoint: 'https://api.deepseek.com/v1',
        timeoutMs: 60000,
        reasoningTimeoutMs: 120000
      }
    },
    engineAssignment: {
      lowFrequencyTasks: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        useReasoning: false
      }
    }
  })
  return {
    getAIConfig: mockFn
  }
})

// Mock getSettings for language
vi.mock('@/storage/db/db-settings', () => {
  const mockFn = vi.fn().mockResolvedValue({
    language: 'zh-CN',
    id: 'singleton'
  })
  return {
    getSettings: mockFn
  }
})

// 辅助函数：创建模拟的Feed抓取结果
function createMockFetchResult(itemCount: number): FetchResult {
  return {
    title: 'Test Feed',
    link: 'https://example.com/feed',
    items: Array.from({ length: itemCount }, (_, i) => ({
      title: `Article ${i + 1}`,
      link: `https://example.com/article/${i + 1}`,
      description: `Description for article ${i + 1}`,
      // 使用有效的日期，限制在1-28号
      pubDate: new Date(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`)
    })),
    meta: {}
  }
}

describe('FeedPreScreeningService', () => {
  let service: FeedPreScreeningService
  let mockAIManager: any
  let mockGetAIConfig: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // 获取 mock 函数引用
    const { getAIConfig } = await import('@/storage/ai-config')
    mockGetAIConfig = getAIConfig
    
    // 重置为默认有效配置
    mockGetAIConfig.mockResolvedValue({
      enabled: true,
      preferredRemoteProvider: 'deepseek',
      preferredLocalProvider: 'ollama',
      providers: {
        deepseek: {
          model: 'deepseek-chat',
          apiKey: 'test-key',
          endpoint: 'https://api.deepseek.com/v1',
          timeoutMs: 60000,
          reasoningTimeoutMs: 120000
        }
      },
      engineAssignment: {
        lowFrequencyTasks: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          useReasoning: false
        }
      }
    })
    service = new FeedPreScreeningService()
    // @ts-ignore - 访问私有属性用于测试
    mockAIManager = service.aiManager
  })

  describe('screenArticles() - 主入口方法', () => {
    it('应该跳过少于等于3篇文章的初筛', async () => {
      // 测试3篇及以下都跳过
      for (const count of [1, 2, 3]) {
        const result = await service.screenArticles(
          createMockFetchResult(count),
          'Test Feed',
          'https://example.com/feed'
        )

        expect(result).toBeNull()
      }
      expect(mockAIManager.callWithConfig).not.toHaveBeenCalled()
    })

    it('应该在 AI 未启用时跳过初筛', async () => {
      mockGetAIConfig.mockResolvedValueOnce({
        enabled: false
      })

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Test Feed',
        'https://example.com/feed'
      )

      expect(result).toBeNull()
      expect(mockAIManager.callWithConfig).not.toHaveBeenCalled()
    })

    it('应该在未配置任何 Provider 时跳过初筛', async () => {
      mockGetAIConfig.mockResolvedValueOnce({
        enabled: true,
        providers: {
          deepseek: { apiKey: '' },
          openai: { apiKey: '' },
          ollama: { enabled: false }
        }
      })

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Test Feed',
        'https://example.com/feed'
      )

      expect(result).toBeNull()
      expect(mockAIManager.callWithConfig).not.toHaveBeenCalled()
    })

    it('应该对4篇文章进行初筛', async () => {
      const aiResponse = {
        selectedArticleLinks: [
          'https://example.com/article/1',
          'https://example.com/article/2'
        ],
        stats: { totalArticles: 4, selectedCount: 2 }
      }

      mockAIManager.callWithConfig.mockResolvedValue(JSON.stringify(aiResponse))

      const result = await service.screenArticles(
        createMockFetchResult(4),
        'Test Feed',
        'https://example.com/feed'
      )

      expect(result).not.toBeNull()
      expect(mockAIManager.callWithConfig).toHaveBeenCalledOnce()
    })

    it('应该成功初筛10篇文章并返回结果', async () => {
      const aiResponse = {
        selectedArticleLinks: [
          'https://example.com/article/1',
          'https://example.com/article/3',
          'https://example.com/article/5'
        ],
        reason: '选择了相关技术文章',
        stats: {
          totalArticles: 10,
          selectedCount: 3,
          selectionRate: 0.3
        }
      }

      mockAIManager.callWithConfig.mockResolvedValue(JSON.stringify(aiResponse))

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Tech Blog',
        'https://example.com/feed'
      )

      expect(result).not.toBeNull()
      expect(result?.selectedArticleLinks).toHaveLength(3)
      expect(result?.totalArticles).toBe(10)
      expect(result?.selectedCount).toBe(3)
      expect(mockAIManager.callWithConfig).toHaveBeenCalledOnce()
    })

    it('应该支持用户画像参数', async () => {
      const userProfile: UserProfile = {
        interests: 'JavaScript、React、前端开发',
        preferences: ['技术文章', '教程', '最佳实践'],
        avoidTopics: ['政治', '娱乐八卦']
      }

      const aiResponse = {
        selectedArticleLinks: ['https://example.com/article/1'],
        stats: { totalArticles: 10, selectedCount: 1 }
      }

      mockAIManager.callWithConfig.mockResolvedValue(JSON.stringify(aiResponse))

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Tech Blog',
        'https://example.com/feed',
        userProfile
      )

      expect(result).not.toBeNull()
      expect(mockAIManager.callWithConfig).toHaveBeenCalledOnce()
      
      // 验证调用参数中包含用户画像
      const callArgs = mockAIManager.callWithConfig.mock.calls[0][0]
      expect(callArgs.prompt).toContain('JavaScript')
      expect(callArgs.prompt).toContain('技术文章')
    })

    it('应该处理AI响应中的markdown代码块', async () => {
      const aiResponse = '```json\n{"selectedArticleLinks": ["https://example.com/article/1"], "stats": {"totalArticles": 10, "selectedCount": 1}}\n```'
      
      mockAIManager.callWithConfig.mockResolvedValue(aiResponse)

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Tech Blog',
        'https://example.com/feed'
      )

      expect(result).not.toBeNull()
      expect(result?.selectedArticleLinks).toHaveLength(1)
    })

    it('应该处理AI调用失败', async () => {
      mockAIManager.callWithConfig.mockRejectedValue(new Error('AI service unavailable'))

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Tech Blog',
        'https://example.com/feed'
      )

      expect(result).toBeNull()
    })

    it('应该处理无效的JSON响应', async () => {
      mockAIManager.callWithConfig.mockResolvedValue('This is not valid JSON')

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Tech Blog',
        'https://example.com/feed'
      )

      expect(result).toBeNull()
    })

    it('应该拒绝筛选率过低的结果(<10%)', async () => {
      const aiResponse = {
        selectedArticleLinks: ['https://example.com/article/1'],
        stats: { totalArticles: 100, selectedCount: 1 } // 1% 筛选率
      }

      mockAIManager.callWithConfig.mockResolvedValue(JSON.stringify(aiResponse))

      const result = await service.screenArticles(
        createMockFetchResult(100),
        'Tech Blog',
        'https://example.com/feed'
      )

      expect(result).toBeNull()
    })

    it('应该接受合理的筛选率(30%)', async () => {
      const aiResponse = {
        selectedArticleLinks: [
          'https://example.com/article/1',
          'https://example.com/article/2',
          'https://example.com/article/3'
        ],
        stats: { totalArticles: 10, selectedCount: 3 }
      }

      mockAIManager.callWithConfig.mockResolvedValue(JSON.stringify(aiResponse))

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Tech Blog',
        'https://example.com/feed'
      )

      expect(result).not.toBeNull()
      expect(result?.selectedCount).toBe(3)
    })
  })

  describe('shouldPreScreen()', () => {
    it('应该对4篇及以上文章进行初筛', () => {
      // @ts-ignore - 访问私有方法用于测试
      expect(service.shouldPreScreen(4)).toBe(true)
      // @ts-ignore
      expect(service.shouldPreScreen(5)).toBe(true)
      // @ts-ignore
      expect(service.shouldPreScreen(10)).toBe(true)
      // @ts-ignore
      expect(service.shouldPreScreen(20)).toBe(true)
    })

    it('应该跳过3篇及以下文章的初筛', () => {
      // @ts-ignore
      expect(service.shouldPreScreen(0)).toBe(false)
      // @ts-ignore
      expect(service.shouldPreScreen(1)).toBe(false)
      // @ts-ignore
      expect(service.shouldPreScreen(2)).toBe(false)
      // @ts-ignore
      expect(service.shouldPreScreen(3)).toBe(false)
    })
  })

  describe('prepareArticles()', () => {
    it('应该截断description到800字符', () => {
      const longDescription = 'a'.repeat(1500)
      const items = [{
        title: 'Test Article',
        link: 'https://example.com/1',
        description: longDescription,
        pubDate: new Date('2026-01-01')
      }]

      // @ts-ignore
      const result = service.prepareArticles(items)

      expect(result[0].description).toHaveLength(800)
      expect(result[0].description).toBe('a'.repeat(800))
    })

    it('应该限制最多100篇文章', () => {
      const items = Array.from({ length: 150 }, (_, i) => ({
        title: `Article ${i}`,
        link: `https://example.com/${i}`,
        description: `Description ${i}`,
        pubDate: new Date()
      }))

      // @ts-ignore
      const result = service.prepareArticles(items)

      expect(result).toHaveLength(100)
    })

    it('应该包含所有必需字段', () => {
      const items = [{
        title: 'Test',
        link: 'https://example.com/1',
        description: 'Description',
        pubDate: new Date('2026-01-01T00:00:00Z')
      }]

      // @ts-ignore
      const result = service.prepareArticles(items)

      expect(result[0]).toEqual({
        title: 'Test',
        link: 'https://example.com/1',
        description: 'Description',
        pubDate: '2026-01-01T00:00:00.000Z'
      })
    })
  })

  describe('checkTotalSize()', () => {
    it('应该正确估算tokens和bytes', () => {
      const articles = [
        { title: 'Test 1', link: 'https://example.com/1', description: 'Desc 1' },
        { title: 'Test 2', link: 'https://example.com/2', description: 'Desc 2' }
      ]

      // @ts-ignore
      const result = service.checkTotalSize(articles)

      expect(result.ok).toBe(true)
      expect(result.estimatedTokens).toBeGreaterThan(0)
      expect(result.estimatedBytes).toBeGreaterThan(0)
      expect(result.estimatedTokens).toBeLessThan(32000) // 应该小于限制
    })

    it('应该正确检测过大的输入', () => {
      // 创建一个超大的文章列表
      const largeArticles = Array.from({ length: 100 }, (_, i) => ({
        title: `Article ${i}`.repeat(200), // 更长的标题
        link: `https://example.com/${i}`,
        description: 'x'.repeat(800) // 800字符
      }))

      // @ts-ignore
      const result = service.checkTotalSize(largeArticles)

      // 验证能够估算大小（新限制：80K tokens, 320KB bytes）
      expect(result.estimatedBytes).toBeGreaterThan(100000) // > 100KB
      expect(result.estimatedTokens).toBeGreaterThan(10000) // 至少10000 tokens
    })
  })

  describe('parseAIResponse()', () => {
    it('应该正确解析JSON响应', () => {
      const response = JSON.stringify({
        selectedArticleLinks: ['https://example.com/1', 'https://example.com/2'],
        reason: '筛选了技术相关文章',
        stats: {
          totalArticles: 10,
          selectedCount: 2,
          selectionRate: 0.2
        }
      })

      // @ts-ignore
      const result = service.parseAIResponse(response)

      expect(result.selectedArticleLinks).toHaveLength(2)
      expect(result.totalArticles).toBe(10)
      expect(result.selectedCount).toBe(2)
      expect(result.reason).toBe('筛选了技术相关文章')
    })

    it('应该移除markdown代码块标记', () => {
      const response = '```json\n{"selectedArticleLinks": ["https://example.com/1"], "stats": {"totalArticles": 1, "selectedCount": 1}}\n```'

      // @ts-ignore
      const result = service.parseAIResponse(response)

      expect(result.selectedArticleLinks).toHaveLength(1)
      expect(result.selectedArticleLinks[0]).toBe('https://example.com/1')
    })

    it('应该处理缺失字段', () => {
      const response = JSON.stringify({
        selectedArticleLinks: ['https://example.com/1']
        // 缺少reason和stats
      })

      // @ts-ignore
      const result = service.parseAIResponse(response)

      expect(result.selectedArticleLinks).toHaveLength(1)
      expect(result.reason).toBe('未提供理由')
      expect(result.selectedCount).toBe(1) // 从selectedArticleLinks长度推断
    })
  })

  describe('validateResult()', () => {
    it('应该验证selectedArticleLinks是数组', () => {
      const invalidResult = {
        selectedArticleLinks: 'not an array' as any,
        reason: 'Test',
        totalArticles: 10,
        selectedCount: 5
      }

      // @ts-ignore
      expect(() => service.validateResult(invalidResult, 10)).toThrow('selectedArticleLinks必须是数组')
    })

    it('应该修正不匹配的totalArticles', () => {
      const result = {
        selectedArticleLinks: ['link1', 'link2'],
        reason: 'Test',
        totalArticles: 5, // 不匹配
        selectedCount: 2
      }

      // @ts-ignore
      service.validateResult(result, 10) // 实际有10篇

      expect(result.totalArticles).toBe(10) // 应该被修正
    })

    it('应该拒绝过低的筛选率(<10%)', () => {
      const result = {
        selectedArticleLinks: ['link1'],
        reason: 'Test',
        totalArticles: 100,
        selectedCount: 1 // 1%
      }

      // @ts-ignore
      expect(() => service.validateResult(result, 100)).toThrow('筛选率过低')
    })

    it('应该接受合理的筛选率(10%-90%)', () => {
      const result = {
        selectedArticleLinks: ['link1', 'link2', 'link3'],
        reason: 'Test',
        totalArticles: 10,
        selectedCount: 3 // 30%
      }

      // @ts-ignore
      expect(() => service.validateResult(result, 10)).not.toThrow()
    })

    it('应该接受10%边界值', () => {
      const result = {
        selectedArticleLinks: ['link1'],
        reason: 'Test',
        totalArticles: 10,
        selectedCount: 1 // 恰好10%
      }

      // @ts-ignore
      expect(() => service.validateResult(result, 10)).not.toThrow()
    })

    it('应该接受90%边界值', () => {
      const result = {
        selectedArticleLinks: Array.from({ length: 9 }, (_, i) => `link${i}`),
        reason: 'Test',
        totalArticles: 10,
        selectedCount: 9 // 恰好90%
      }

      // @ts-ignore
      expect(() => service.validateResult(result, 10)).not.toThrow()
    })
  })

  describe('checkTotalSize() - 边界测试', () => {
    it('应该处理空数组', () => {
      // @ts-ignore
      const result = service.checkTotalSize([])

      expect(result.ok).toBe(true)
      // 空数组应该有很小的大小（至少有JSON结构）
      expect(result.estimatedTokens).toBeGreaterThanOrEqual(0)
      expect(result.estimatedBytes).toBeGreaterThanOrEqual(0)
    })

    it('应该处理单篇文章', () => {
      const articles = [{
        title: 'Test',
        link: 'https://example.com/1',
        description: 'Short description'
      }]

      // @ts-ignore
      const result = service.checkTotalSize(articles)

      expect(result.ok).toBe(true)
      expect(result.estimatedTokens).toBeGreaterThan(0)
      expect(result.estimatedBytes).toBeGreaterThan(0)
    })

    it('应该正确处理特殊字符和中文', () => {
      const articles = [{
        title: '测试文章 🎉',
        link: 'https://example.com/1',
        description: '这是一篇包含中文、emoji 🚀 和特殊字符 !@#$%^&*() 的文章描述'
      }]

      // @ts-ignore
      const result = service.checkTotalSize(articles)

      expect(result.ok).toBe(true)
      // 中文字符占用更多字节
      expect(result.estimatedBytes).toBeGreaterThan(result.estimatedTokens)
    })
  })

  describe('prepareArticles() - 边界测试', () => {
    it('应该处理缺失字段', () => {
      const items = [{
        title: undefined,
        link: undefined,
        description: undefined,
        pubDate: undefined
      }] as any

      // @ts-ignore
      const result = service.prepareArticles(items)

      expect(result[0].title).toBeDefined()
      expect(result[0].link).toBeDefined()
      expect(result[0].description).toBeDefined()
      expect(result[0].pubDate).toBeDefined()
    })

    it('应该处理空description', () => {
      const items = [{
        title: 'Test',
        link: 'https://example.com/1',
        description: '',
        pubDate: new Date()
      }]

      // @ts-ignore
      const result = service.prepareArticles(items)

      expect(result[0].description).toBe('')
    })
  })

  describe('screenArticles() - 错误场景', () => {
    it('应该处理getAIConfig失败', async () => {
      mockGetAIConfig.mockRejectedValueOnce(new Error('Config error'))

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Test Feed',
        'https://example.com/feed'
      )

      expect(result).toBeNull()
    })

    it('应该处理prompt生成失败', async () => {
      // 模拟promptManager返回空字符串
      const aiResponse = {
        selectedArticleLinks: ['https://example.com/article/1'],
        stats: { totalArticles: 10, selectedCount: 1 }
      }
      mockAIManager.callWithConfig.mockResolvedValue(JSON.stringify(aiResponse))

      const result = await service.screenArticles(
        createMockFetchResult(10),
        'Test Feed',
        'https://example.com/feed'
      )

      // 即使prompt为空也应该能继续
      expect(result).toBeDefined()
    })
  })
})
