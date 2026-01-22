/**
 * 策略决策服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StrategyDecisionService } from './StrategyDecisionService'
import { db } from '@/storage/db'
import type { StrategyDecisionContext, RecommendationStrategy } from '@/types/strategy'

// Mock AI Manager - 在工厂内部创建 mock 函数
vi.mock('@/core/ai/AICapabilityManager', () => {
  const mockFn = vi.fn()
  return {
    AICapabilityManager: class {
      decidePoolStrategy = mockFn
    },
    aiManager: {
      decidePoolStrategy: mockFn
    },
    // 导出 mock 函数以便测试中使用
    _mockDecidePoolStrategy: mockFn
  }
})

// Mock getAIConfig
vi.mock('@/storage/ai-config', () => {
  const mockFn = vi.fn().mockResolvedValue({
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
    local: {
      enabled: false,
      provider: 'ollama',
      endpoint: 'http://localhost:11434/v1',
      model: ''
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

describe('StrategyDecisionService', () => {
  let mockGetAIConfig: any
  let service: StrategyDecisionService
  let mockDecidePoolStrategy: any

  beforeEach(async () => {
    // 重置 mock 函数
    vi.clearAllMocks()
    
    // 获取导出的 mock 函数
    const aiModule = await import('@/core/ai/AICapabilityManager')
    mockDecidePoolStrategy = (aiModule as any)._mockDecidePoolStrategy
    
    // 设置 mockDecidePoolStrategy 的默认返回值
    mockDecidePoolStrategy.mockResolvedValue(
      JSON.stringify({
        recommendation: {
          targetPoolSize: 5,
          refillThreshold: 2,
          dailyLimit: 15,
          cooldownMinutes: 60
        },
        candidatePool: {
          expiryHours: 168,
          entryThreshold: 0.7
        },
        meta: {
          validHours: 24,
          generatedAt: Date.now(),
          version: 'v1.0',
          nextReviewHours: 12
        }
      })
    )
    
    // 获取 mock 函数引用并重置为有效配置
    const { getAIConfig } = await import('@/storage/ai-config')
    mockGetAIConfig = getAIConfig
    mockGetAIConfig.mockResolvedValue({
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
      local: {
        enabled: false,
        provider: 'ollama',
        endpoint: 'http://localhost:11434/v1',
        model: ''
      },
      engineAssignment: {
        lowFrequencyTasks: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          useReasoning: false
        }
      }
    })

    // 清空数据库
    await db.feedArticles.clear()
    await db.discoveredFeeds.clear()
    await db.recommendations.clear()
    await db.aiUsage.clear()
    await db.settings.clear()
    await db.userProfile.clear()

    // 清空 strategy storage
    await chrome.storage.local.remove(['current_strategy', 'strategy_system_context'])

    // 初始化必要的数据
    await db.settings.add({
      id: 'singleton',
      maxRecommendations: 30,
      dailyTokenLimit: 100000
    } as any)

    await db.userProfile.add({
      id: 'user-1',
      totalVisits: 0,
      onboardingComplete: false,
      confidence: 0,
      topics: []
    } as any)

    service = new StrategyDecisionService()
  })

  describe('collectContext', () => {
    it('应该收集完整的系统状态', async () => {
      // 准备测试数据
      const now = Date.now()
      
      // 添加订阅源
      await db.discoveredFeeds.bulkAdd([
        {
          id: 'feed-1',
          url: 'http://example.com/feed1',
          title: 'Feed 1',
          isActive: true,
          status: 'active',
          discoveredAt: now
        } as any,
        {
          id: 'feed-2',
          url: 'http://example.com/feed2',
          title: 'Feed 2',
          isActive: true,
          status: 'active',
          discoveredAt: now
        } as any
      ])

      // 添加文章（不同池状态）
      await db.feedArticles.bulkAdd([
        {
          id: 'article-1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Article 1',
          published: now,
          fetched: now,
          poolStatus: 'raw'
        } as any,
        {
          id: 'article-2',
          feedId: 'feed-1',
          link: 'http://example.com/2',
          title: 'Article 2',
          published: now,
          fetched: now,
          poolStatus: 'candidate',
          analysisScore: 7.5
        } as any,
        {
          id: 'article-3',
          feedId: 'feed-2',
          link: 'http://example.com/3',
          title: 'Article 3',
          published: now,
          fetched: now,
          poolStatus: 'recommended'
        } as any
      ])

      // 添加推荐记录（注意：必须有 recommendedAt 字段因为有索引）
      await db.recommendations.bulkAdd([
        {
          id: 'rec-1',
          title: 'Rec 1',
          sourceUrl: 'http://example.com/1',
          source: 'feed-1',
          recommendedAt: now - 3600000,  // 1 小时前
          isRead: true,
          readAt: now - 1800000,  // 30 分钟前
          status: 'active'
        } as any
      ])

      const context = await service.collectContext()

      // 验证上下文结构
      expect(context).toBeDefined()
      expect(context.supply).toBeDefined()
      expect(context.demand).toBeDefined()
      expect(context.system).toBeDefined()
      expect(context.history).toBeDefined()
      expect(context.userProfile).toBeDefined()

      // 验证供给侧数据
      expect(context.supply.activeFeeds).toBe(2)
      expect(context.supply.rawPoolSize).toBe(1)
      expect(context.supply.candidatePoolSize).toBe(1)

      // 验证需求侧数据
      expect(context.demand.dailyReadCount).toBe(1)
      expect(context.demand.recommendationPoolSize).toBe(1)
    })
  })

  describe('generateNewStrategy', () => {
    it('应该在未配置 Provider 时抛出错误', async () => {
      mockGetAIConfig.mockResolvedValueOnce({
        providers: {
          deepseek: { apiKey: '' },
          openai: { apiKey: '' }
        },
        local: {
          enabled: false,
          provider: 'ollama',
          model: ''
        }
      })

      await expect(service.generateNewStrategy()).rejects.toThrow('未配置任何 AI Provider')
    })

    it('应该生成新策略并保存到数据库', async () => {
      // 准备最小测试数据
      await db.discoveredFeeds.add({
        id: 'feed-1',
        url: 'http://example.com/feed',
        title: 'Test Feed',
        isActive: true,
        status: 'active',
        discoveredAt: Date.now()
      } as any)

      const decision = await service.generateNewStrategy()

      // 验证决策结构
      expect(decision).toBeDefined()
      expect(decision.id).toContain('strategy-')
      expect(decision.status).toBe('active')
      expect(decision.context).toBeDefined()
      expect(decision.strategy).toBeDefined()
      expect(decision.validUntil).toBeGreaterThan(Date.now())
      expect(decision.nextReview).toBeGreaterThan(Date.now())

      // 验证保存到 storage
      const saved = await chrome.storage.local.get('current_strategy')
      expect(saved.current_strategy).toBeDefined()
      expect(saved.current_strategy.id).toBe(decision.id)
    })
  })

  describe('getCurrentStrategy', () => {
    it('应该返回有效的当前策略', async () => {
      // 创建有效策略
      const now = Date.now()
      const validStrategy = {
        id: 'strategy-test',
        createdAt: now,
        validUntil: now + 24 * 60 * 60 * 1000,
        nextReview: now + 12 * 60 * 60 * 1000,
        status: 'active' as const,
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: validStrategy })

      const current = await service.getCurrentStrategy()
      expect(current).toBeDefined()
      expect(current?.id).toBe('strategy-test')
    })

    it('应该返回 null 如果没有有效策略', async () => {
      const current = await service.getCurrentStrategy()
      expect(current).toBeNull()
    })

    it('应该失效过期的策略', async () => {
      // 创建已过期策略
      const now = Date.now()
      const expiredStrategy = {
        id: 'strategy-expired',
        createdAt: now - 48 * 60 * 60 * 1000,
        validUntil: now - 1000, // 已过期
        nextReview: now - 1000,
        status: 'active' as const,
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: expiredStrategy })

      // 验证添加成功
      const before = await chrome.storage.local.get('current_strategy')
      expect(before.current_strategy.status).toBe('active')

      const current = await service.getCurrentStrategy()
      expect(current).toBeNull()

      // 验证策略被清空（过期策略会被删除而不是标记为 invalidated）
      await new Promise(resolve => setTimeout(resolve, 100))
      const updated = await chrome.storage.local.get('current_strategy')
      expect(updated.current_strategy).toBeUndefined()
    })
  })

  describe('validateStrategy', () => {
    it('应该限制参数在合理范围内', () => {
      // 通过私有方法访问（测试用）
      const service = new StrategyDecisionService()
      
      const invalidStrategy: RecommendationStrategy = {
        recommendation: {
          targetPoolSize: 50,  // 超出范围
          refillThreshold: 20,  // 超出范围
          dailyLimit: 100,  // 超出范围
          cooldownMinutes: 300  // 超出范围
        },
        candidatePool: {
          expiryHours: 1000,  // 超出范围
          entryThreshold: 1.5  // 超出范围
        },
        meta: {
          validHours: 100,  // 超出范围
          generatedAt: Date.now(),
          version: 'v1.0',
          nextReviewHours: 50  // 超出范围
        }
      }

      // 使用类型断言访问私有方法（仅用于测试）
      const validated = (service as any).validateStrategy(invalidStrategy)

      // 验证所有参数被限制
      expect(validated.recommendation.targetPoolSize).toBeLessThanOrEqual(10)
      expect(validated.recommendation.cooldownMinutes).toBeLessThanOrEqual(180)
      expect(validated.candidatePool.expiryHours).toBeLessThanOrEqual(336)
      expect(validated.candidatePool.entryThreshold).toBeLessThanOrEqual(0.9)
      expect(validated.meta.validHours).toBeLessThanOrEqual(48)
    })

    it('应该保持合理参数不变', () => {
      const service = new StrategyDecisionService()
      
      const validStrategy: RecommendationStrategy = {
        recommendation: {
          targetPoolSize: 5,
          refillThreshold: 2,
          dailyLimit: 15,
          cooldownMinutes: 60
        },
        candidatePool: {
          expiryHours: 168,
          entryThreshold: 0.7
        },
        meta: {
          validHours: 24,
          generatedAt: Date.now(),
          version: 'v1.0',
          nextReviewHours: 12
        }
      }

      const validated = (service as any).validateStrategy(validStrategy)

      // 验证所有参数保持不变
      expect(validated.recommendation.targetPoolSize).toBe(5)
      expect(validated.recommendation.cooldownMinutes).toBe(60)
      expect(validated.candidatePool.entryThreshold).toBe(0.7)
    })
  })
})
