/**
 * AI 推荐池策略决策器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  AIPoolStrategyDecider, 
  collectDailyUsageContext, 
  getStrategyDecider,
  type DailyUsageContext,
  type AIPoolDecision
} from './pool-strategy-decider'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    withTag: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

// Mock db
vi.mock('@/storage/db', () => ({
  db: {
    feeds: {
      count: vi.fn().mockResolvedValue(10),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

// Mock ai manager - 使用 vi.hoisted 避免提升问题
const { mockDecidePoolStrategy } = vi.hoisted(() => ({
  mockDecidePoolStrategy: vi.fn(),
}))

vi.mock('../ai/AICapabilityManager', () => ({
  aiManager: {
    decidePoolStrategy: mockDecidePoolStrategy,
  },
}))

// Mock ai config
vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn().mockResolvedValue({
    providers: {},
    local: { enabled: false },
    engineAssignment: {},
  }),
}))

// Mock system stats
vi.mock('@/storage/system-stats', () => ({
  getSystemStats: vi.fn().mockResolvedValue({
    feeds: {
      subscribedCount: 10,
      activeCount: 8,
      overallUpdateFrequency: 12,
      avgBatchSize: 15,
    },
    articles: {
      unreadCount: 50,
      dailyAverage: 30,
      yesterdayCount: 25,
    },
    userBehavior: {
      recommendationsShown: 20,
      clicked: 5,
      dismissed: 3,
      saved: 2,
      avgReadTime: 120,
      peakUsageHour: 10,
    },
  }),
}))

// Mock chrome.storage.local
const mockStorageGet = vi.fn()
const mockStorageSet = vi.fn()
const mockStorageRemove = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
      remove: mockStorageRemove,
    },
  },
})

describe('AIPoolStrategyDecider', () => {
  let decider: AIPoolStrategyDecider

  const mockContext: DailyUsageContext = {
    feeds: {
      totalCount: 10,
      avgUpdateFrequency: 12,
      avgBatchSize: 15,
      activeFeeds: 8,
    },
    articles: {
      unreadCount: 50,
      dailyAverage: 30,
      yesterdayCount: 25,
    },
    userBehavior: {
      recommendationsShown: 20,
      clicked: 5,
      dismissed: 3,
      saved: 2,
      avgReadTime: 120,
      peakUsageHour: 10,
    },
    currentPolicy: {
      poolSize: 6,
      refillInterval: 45,
      maxDailyRefills: 5,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    decider = new AIPoolStrategyDecider()
    mockStorageGet.mockResolvedValue({})
    mockStorageSet.mockResolvedValue(undefined)
    mockStorageRemove.mockResolvedValue(undefined)
  })

  describe('decideDailyStrategy', () => {
    it('应该在没有 AI 配置时使用基于规则的决策', async () => {
      const result = await decider.decideDailyStrategy(mockContext)

      expect(result).toBeDefined()
      expect(result.poolSize).toBeGreaterThanOrEqual(3)
      expect(result.poolSize).toBeLessThanOrEqual(15)
      expect(result.minInterval).toBeGreaterThan(0)
      expect(result.maxDailyRefills).toBeGreaterThanOrEqual(3)
      expect(result.reasoning).toContain('基于规则')
    })

    it('应该缓存今日决策', async () => {
      const result1 = await decider.decideDailyStrategy(mockContext)
      const result2 = await decider.decideDailyStrategy(mockContext)

      // 第二次应该使用缓存
      expect(result1).toEqual(result2)
    })
  })

  describe('getCachedDecision', () => {
    it('应该从存储加载今日决策', async () => {
      const today = new Date().toISOString().split('T')[0]
      const cachedDecision: AIPoolDecision = {
        poolSize: 8,
        minInterval: 30 * 60 * 1000,
        maxDailyRefills: 6,
        triggerThreshold: 0.3,
        reasoning: '缓存的决策',
        confidence: 0.8,
      }

      mockStorageGet.mockResolvedValue({
        pool_strategy_decision: {
          date: today,
          decision: cachedDecision,
        },
      })

      const result = await decider.getCachedDecision()

      expect(result).toEqual(cachedDecision)
    })

    it('应该在没有缓存时返回 null', async () => {
      mockStorageGet.mockResolvedValue({})

      const result = await decider.getCachedDecision()

      expect(result).toBeNull()
    })

    it('应该在缓存日期不是今天时返回 null', async () => {
      mockStorageGet.mockResolvedValue({
        pool_strategy_decision: {
          date: '2020-01-01', // 过期的日期
          decision: {},
        },
      })

      const result = await decider.getCachedDecision()

      expect(result).toBeNull()
    })
  })

  describe('clearCache', () => {
    it('应该清除缓存', async () => {
      await decider.clearCache()

      expect(mockStorageRemove).toHaveBeenCalledWith('pool_strategy_decision')
    })
  })

  describe('validateDecision', () => {
    it('应该限制 poolSize 在合理范围内', async () => {
      // 通过调用 decideDailyStrategy 测试验证逻辑
      const result = await decider.decideDailyStrategy(mockContext)

      expect(result.poolSize).toBeGreaterThanOrEqual(3)
      expect(result.poolSize).toBeLessThanOrEqual(20)
    })

    it('应该限制 minInterval 在合理范围内', async () => {
      const result = await decider.decideDailyStrategy(mockContext)

      expect(result.minInterval).toBeGreaterThanOrEqual(15 * 60 * 1000)
      expect(result.minInterval).toBeLessThanOrEqual(120 * 60 * 1000)
    })

    it('应该限制 maxDailyRefills 在合理范围内', async () => {
      const result = await decider.decideDailyStrategy(mockContext)

      expect(result.maxDailyRefills).toBeGreaterThanOrEqual(3)
      expect(result.maxDailyRefills).toBeLessThanOrEqual(10)
    })
  })

  describe('getRuleBasedDecision', () => {
    it('应该根据订阅数量少调整池大小', async () => {
      const fewFeedsContext = {
        ...mockContext,
        feeds: { ...mockContext.feeds, totalCount: 3 },
      }

      const result = await decider.decideDailyStrategy(fewFeedsContext)

      expect(result.poolSize).toBeLessThanOrEqual(6)
    })

    it('应该根据订阅数量多调整池大小', async () => {
      const manyFeedsContext = {
        ...mockContext,
        feeds: { ...mockContext.feeds, totalCount: 20 },
      }

      const result = await decider.decideDailyStrategy(manyFeedsContext)

      expect(result.poolSize).toBeGreaterThanOrEqual(6)
    })

    it('应该根据高点击率增加推荐', async () => {
      const highClickContext = {
        ...mockContext,
        userBehavior: { 
          ...mockContext.userBehavior, 
          clicked: 10, 
          recommendationsShown: 20 
        },
      }

      const result = await decider.decideDailyStrategy(highClickContext)

      expect(result.poolSize).toBeGreaterThanOrEqual(6)
    })

    it('应该根据高不想读率减少推荐', async () => {
      const highDismissContext = {
        ...mockContext,
        userBehavior: { 
          ...mockContext.userBehavior, 
          dismissed: 15, 
          recommendationsShown: 20 
        },
      }

      const result = await decider.decideDailyStrategy(highDismissContext)

      expect(result.poolSize).toBeLessThanOrEqual(10)
    })

    it('应该根据文章产出速度调整补充间隔', async () => {
      const lowArticleContext = {
        ...mockContext,
        articles: { ...mockContext.articles, dailyAverage: 10 },
      }

      const result = await decider.decideDailyStrategy(lowArticleContext)

      // 文章少时，补充间隔应该更长
      expect(result.minInterval).toBeGreaterThanOrEqual(45 * 60 * 1000)
    })
  })
})

describe('collectDailyUsageContext', () => {
  it('应该收集使用情况上下文', async () => {
    const context = await collectDailyUsageContext()

    expect(context).toBeDefined()
    expect(context.feeds).toBeDefined()
    expect(context.articles).toBeDefined()
    expect(context.userBehavior).toBeDefined()
    expect(context.currentPolicy).toBeDefined()
  })

  it('应该包含正确的订阅源统计', async () => {
    const context = await collectDailyUsageContext()

    expect(context.feeds.totalCount).toBe(10)
    expect(context.feeds.activeFeeds).toBe(8)
    expect(context.feeds.avgUpdateFrequency).toBe(12)
    expect(context.feeds.avgBatchSize).toBe(15)
  })

  it('应该包含正确的文章统计', async () => {
    const context = await collectDailyUsageContext()

    expect(context.articles.unreadCount).toBe(50)
    expect(context.articles.dailyAverage).toBe(30)
    expect(context.articles.yesterdayCount).toBe(25)
  })

  it('应该包含正确的用户行为统计', async () => {
    const context = await collectDailyUsageContext()

    expect(context.userBehavior.recommendationsShown).toBe(20)
    expect(context.userBehavior.clicked).toBe(5)
    expect(context.userBehavior.dismissed).toBe(3)
    expect(context.userBehavior.saved).toBe(2)
  })
})

describe('getStrategyDecider', () => {
  it('应该返回单例实例', () => {
    const decider1 = getStrategyDecider()
    const decider2 = getStrategyDecider()

    expect(decider1).toBe(decider2)
  })

  it('应该返回 AIPoolStrategyDecider 实例', () => {
    const decider = getStrategyDecider()

    expect(decider).toBeInstanceOf(AIPoolStrategyDecider)
  })
})
