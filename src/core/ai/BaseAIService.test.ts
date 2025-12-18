/**
 * BaseAIService 测试
 * 
 * 测试 AI Provider 基类的通用逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AIProviderConfig, UserProfileGenerationRequest } from '@/types/ai'
import type { Currency } from './CostCalculator'

// Mock dependencies BEFORE importing BaseAIService
vi.mock('./AIUsageTracker', () => ({
  AIUsageTracker: {
    recordUsage: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@/i18n/chrome-storage-backend', () => ({
  default: {
    loadLanguage: vi.fn().mockResolvedValue('zh-CN')
  }
}))

vi.mock('./prompts', () => ({
  promptManager: {
    getAnalyzeContentPrompt: vi.fn().mockReturnValue('analyze prompt'),
    getGenerateProfileFullPrompt: vi.fn().mockReturnValue('profile full prompt'),
    getGenerateProfileIncrementalPrompt: vi.fn().mockReturnValue('profile incremental prompt')
  }
}))

vi.mock('@/utils/resilience', () => ({
  CircuitBreaker: class MockCircuitBreaker {
    async execute(fn: Function) {
      return fn()
    }
  },
  withExponentialBackoff: async (fn: Function) => fn()
}))

// NOW import BaseAIService
import { BaseAIService } from './BaseAIService'
import { AIUsageTracker } from './AIUsageTracker'

/**
 * 测试用的具体实现类
 */
class TestAIProvider extends BaseAIService {
  readonly name = 'TestProvider'
  
  protected getCurrency(): Currency {
    return 'CNY'
  }
  
  protected async callChatAPI(
    prompt: string,
    options?: {
      maxTokens?: number
      timeout?: number
      jsonMode?: boolean
      useReasoning?: boolean
    }
  ): Promise<{
    content: string
    tokensUsed: { input: number; output: number }
    model?: string
  }> {
    // 模拟 API 调用
    return {
      content: JSON.stringify({ topics: { "Tech": 0.8, "AI": 0.2 }, summary: "Test summary" }),
      tokensUsed: { input: 100, output: 50 },
      model: 'test-model-v1'
    }
  }
  
  protected calculateCostBreakdown(inputTokens: number, outputTokens: number) {
    return {
      input: inputTokens * 0.000001,
      output: outputTokens * 0.000002,
      cacheRead: 0,
      cacheWrite: 0
    }
  }
  
  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey
  }
}

describe('BaseAIService', () => {
  let provider: TestAIProvider
  let mockConfig: AIProviderConfig

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig = {
      apiKey: 'test-api-key',
      model: 'test-model'
    }
    provider = new TestAIProvider(mockConfig)
    
    // Mock AIUsageTracker
    vi.mocked(AIUsageTracker.recordUsage).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('analyzeContent', () => {
    it('应该成功分析内容', async () => {
      const result = await provider.analyzeContent('测试内容')
      
      expect(result.topicProbabilities).toEqual({ "Tech": 0.8, "AI": 0.2 })
      expect(result.summary).toBe("Test summary")
      expect(result.metadata.provider).toBe('testprovider')
      expect(result.metadata.model).toBe('test-model-v1')
      expect(result.metadata.cost).toBeGreaterThan(0)
    })

    it('应该正确归一化主题概率', async () => {
      // Mock 返回不归一化的概率
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: JSON.stringify({ topics: { "Tech": 0.6, "AI": 0.3 } }), // 总和 0.9
        tokensUsed: { input: 100, output: 50 },
        model: 'test-model'
      })

      const result = await provider.analyzeContent('测试')
      
      // 应该被归一化为总和 1.0
      const sum = Object.values(result.topicProbabilities).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 5)
    })

    it('应该处理带 markdown 代码块的响应', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: '```json\n{"topics": {"Tech": 1.0}}\n```',
        tokensUsed: { input: 100, output: 50 }
      })

      const result = await provider.analyzeContent('测试')
      
      expect(result.topicProbabilities).toEqual({ "Tech": 1.0 })
    })

    it('应该处理空响应错误', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValue({
        content: '',
        tokensUsed: { input: 100, output: 0 }
      })

      await expect(provider.analyzeContent('测试'))
        .rejects.toThrow('analyzeContent failed')
    })

    it('应该记录成功的 AI 用量', async () => {
      await provider.analyzeContent('测试内容', { purpose: 'feed-analysis' })
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'testprovider',
          model: 'test-model-v1',
          purpose: 'feed-analysis',
          success: true,
          tokens: {
            input: 100,
            output: 50,
            total: 150,
            estimated: false
          }
        })
      )
    })

    it('应该记录失败的 AI 用量', async () => {
      const testError = new Error('API Error')
      vi.spyOn(provider as any, 'callChatAPI').mockRejectedValue(testError)

      await expect(provider.analyzeContent('测试'))
        .rejects.toThrow('analyzeContent failed')
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'API Error'
        })
      )
    })

    it('应该在推理模式下使用更大的 maxTokens', async () => {
      const callChatAPISpy = vi.spyOn(provider as any, 'callChatAPI')

      await provider.analyzeContent('测试', { useReasoning: true })
      
      expect(callChatAPISpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxTokens: 4000,
          useReasoning: true
        })
      )
    })

    it('应该支持自定义 purpose', async () => {
      await provider.analyzeContent('测试', { purpose: 'custom-task' })
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'custom-task'
        })
      )
    })
  })

  describe('generateUserProfile', () => {
    let mockRequest: UserProfileGenerationRequest

    beforeEach(() => {
      mockRequest = {
        topKeywords: [
          { word: 'AI', weight: 0.9 },
          { word: 'Technology', weight: 0.7 }
        ],
        topicDistribution: {
          'Tech': 0.6,
          'Science': 0.4
        },
        behaviors: {
          reads: [
            {
              title: '测试文章',
              scrollDepth: 0.8,
              readDuration: 120
            }
          ],
          dismisses: []
        }
      }
    })

    it('应该生成完整的用户画像（无现有画像）', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: JSON.stringify({
          interests: [{ name: 'AI', score: 0.8 }],
          preferences: { readingDepth: 'deep' },
          avoidTopics: []
        }),
        tokensUsed: { input: 200, output: 100 }
      })

      const result = await provider.generateUserProfile(mockRequest)
      
      expect(result.interests).toEqual([{ name: 'AI', score: 0.8 }])
      expect(result.preferences).toEqual({ readingDepth: 'deep' })
      expect(result.avoidTopics).toEqual([])
    })

    it('应该生成增量更新的画像（有现有画像）', async () => {
      const currentProfile = {
        topics: { "Tech": 0.5, "Science": 0.5 },
        keywords: ["Technology"],
        summary: "旧画像"
      }

      mockRequest.currentProfile = currentProfile

      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: JSON.stringify({
          interests: [{ name: 'AI', score: 0.7 }],
          preferences: { readingDepth: 'moderate' },
          avoidTopics: ['Spam']
        }),
        tokensUsed: { input: 300, output: 150 }
      })

      const result = await provider.generateUserProfile(mockRequest)
      
      expect(result.interests).toEqual([{ name: 'AI', score: 0.7 }])
      expect(result.avoidTopics).toContain('Spam')
    })

    it('应该正确构建行为摘要（包含拒绝行为）', async () => {
      mockRequest.behaviors.dismisses = [
        { title: '不感兴趣的文章' }
      ]

      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: JSON.stringify({
          topics: { "AI": 1.0 },
          keywords: ["AI"],
          summary: "测试"
        }),
        tokensUsed: { input: 100, output: 50 }
      })

      await provider.generateUserProfile(mockRequest)
      
      // 验证用量记录包含预期的元数据
      expect(AIUsageTracker.recordUsage).toHaveBeenCalled()
    })

    it('应该处理空响应错误', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValue({
        content: '',
        tokensUsed: { input: 100, output: 0 }
      })

      await expect(provider.generateUserProfile(mockRequest))
        .rejects.toThrow('generateUserProfile failed')
    })

    it('应该处理无效 JSON 响应', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValue({
        content: 'invalid json',
        tokensUsed: { input: 100, output: 50 }
      })

      await expect(provider.generateUserProfile(mockRequest))
        .rejects.toThrow()
    })

    it('应该记录画像生成的用量', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: JSON.stringify({
          topics: { "AI": 1.0 },
          keywords: ["AI"],
          summary: "测试"
        }),
        tokensUsed: { input: 200, output: 100 }
      })

      await provider.generateUserProfile(mockRequest)
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalled()
      const callArgs = vi.mocked(AIUsageTracker.recordUsage).mock.calls[0][0]
      expect(callArgs.purpose).toBe('generate-profile')  // 实际值是 'generate-profile'
      expect(callArgs.success).toBe(true)
      expect(callArgs.tokens.input).toBe(200)
      expect(callArgs.tokens.output).toBe(100)
    })
  })

  describe('testConnection', () => {
    it('应该成功测试连接', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: 'ok',
        tokensUsed: { input: 5, output: 5 }
      })

      const result = await provider.testConnection()
      
      expect(result.success).toBe(true)
      expect(result.latency).toBeGreaterThanOrEqual(0)
    })

    it('应该处理连接失败', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockRejectedValue(new Error('Network error'))

      const result = await provider.testConnection()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('Network error')
    })

    it('应该支持推理模式测试', async () => {
      const callChatAPISpy = vi.spyOn(provider as any, 'callChatAPI')
        .mockResolvedValueOnce({
          content: 'ok',
          tokensUsed: { input: 5, output: 5 }
        })

      await provider.testConnection(true)
      
      expect(callChatAPISpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          useReasoning: true
        })
      )
    })

    it('应该记录测试连接的用量', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockResolvedValueOnce({
        content: 'ok',
        tokensUsed: { input: 5, output: 5 }
      })

      await provider.testConnection()
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'test-connection',
          success: true
        })
      )
    })
  })

  describe('normalizeTopicProbabilities', () => {
    it('应该归一化概率分布（总和不为1）', () => {
      const normalized = (provider as any).normalizeTopicProbabilities({
        'Tech': 0.6,
        'AI': 0.3,
        'Science': 0.2
      })
      
      const sum = Object.values(normalized).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 5)
      
      // 验证相对比例保持不变
      expect(normalized['Tech']).toBeGreaterThan(normalized['AI'])
      expect(normalized['AI']).toBeGreaterThan(normalized['Science'])
    })

    it('应该处理已经归一化的概率', () => {
      const normalized = (provider as any).normalizeTopicProbabilities({
        'Tech': 0.7,
        'AI': 0.3
      })
      
      expect(normalized).toEqual({ 'Tech': 0.7, 'AI': 0.3 })
    })

    it('应该处理空对象', () => {
      const normalized = (provider as any).normalizeTopicProbabilities({})
      
      expect(normalized).toEqual({})
    })

    it('应该处理单个主题', () => {
      const normalized = (provider as any).normalizeTopicProbabilities({
        'Tech': 0.5
      })
      
      expect(normalized['Tech']).toBe(1.0)
    })
  })

  describe('preprocessContent', () => {
    it('应该限制内容长度（超长内容）', () => {
      const longContent = 'a'.repeat(100000)
      const processed = (provider as any).preprocessContent(longContent)
      
      expect(processed.length).toBeLessThanOrEqual(50000)
    })

    it('应该保留正常长度的内容', () => {
      const normalContent = '这是一篇正常的文章内容'
      const processed = (provider as any).preprocessContent(normalContent)
      
      expect(processed).toBe(normalContent)
    })

    it('应该使用用户画像优化内容（如果提供）', () => {
      const content = '文章内容'
      const userProfile = {
        topics: { 'AI': 0.8 },
        keywords: ['AI', 'Technology'],
        summary: '用户对 AI 感兴趣'
      }
      
      const processed = (provider as any).preprocessContent(content, {
        userProfile
      })
      
      // 内容应该包含画像信息的提示
      expect(processed).toContain(content)
    })
  })

  describe('容错机制', () => {
    it('应该在 API 错误时抛出异常', async () => {
      vi.spyOn(provider as any, 'callChatAPI').mockRejectedValue(
        new Error('API Error')
      )

      await expect(provider.analyzeContent('测试'))
        .rejects.toThrow('analyzeContent failed')
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'API Error'
        })
      )
    })

    it('应该在画像生成失败时抛出异常', async () => {
      const mockRequest: UserProfileGenerationRequest = {
        topKeywords: [],
        topicDistribution: {},
        behaviors: { reads: [], dismisses: [] }
      }

      vi.spyOn(provider as any, 'callChatAPI').mockRejectedValue(
        new Error('Profile Error')
      )

      await expect(provider.generateUserProfile(mockRequest))
        .rejects.toThrow('generateUserProfile failed')
    })
  })

  describe('成本计算', () => {
    it('应该正确计算输入和输出成本', async () => {
      const result = await provider.analyzeContent('测试')
      
      expect(result.metadata.cost).toBeCloseTo(0.000001 * 100 + 0.000002 * 50, 8)
    })

    it('应该在成本元数据中包含货币类型', async () => {
      await provider.analyzeContent('测试')
      
      expect(AIUsageTracker.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          cost: expect.objectContaining({
            currency: 'CNY'
          })
        })
      )
    })
  })
})
