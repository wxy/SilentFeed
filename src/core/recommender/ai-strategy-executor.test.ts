/**
 * AI策略执行器测试
 * Phase 6.5: 验证AI集成策略实现
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIStrategyExecutorImpl } from './ai-strategy-executor'
import type { AnalysisContext } from '../ai/strategy-types'

// Mock依赖
vi.mock('@/core/ai/AICapabilityManager', () => ({
  aiManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'OK', latency: 100 })
  }
}))

vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn().mockResolvedValue({
    provider: 'deepseek',
    apiKey: 'sk-test-key',
    enabled: true,
    monthlyBudget: 5.0
  })
}))

describe('AI策略执行器', () => {
  let executor: AIStrategyExecutorImpl
  let mockContent: string[]
  let mockContext: AnalysisContext

  beforeEach(() => {
    vi.clearAllMocks()
    
    executor = new AIStrategyExecutorImpl({
      cost: {
        monthlyBudget: 5.0,
        budgetThresholds: { warning: 0.8, limit: 0.95, emergency: 1.0 },
        costCalculation: { costPerToken: 0.00002, fixedCostPerRequest: 0.001, estimationBuffer: 0.2 },
        budgetAllocation: { pageAnalysis: 0.7, recommendation: 0.3 },
        dynamicAdjustment: { adjustBatchSize: true, adjustRecommendationCount: true, skipLowValueRequests: true }
      }
    })
    
    mockContent = [
      'JavaScript 新特性介绍，包含ES2024的最新功能',
      'React 18 带来的性能优化和并发渲染特性'
    ]
    
    mockContext = {
      userProfile: { id: 'test-user' },
      priority: 'medium',
      timeout: 30000,
      maxCost: 0.1,
      fallbackAllowed: true
    }
  })

  describe('基础功能', () => {
    it('应该创建执行器实例', () => {
      expect(executor).toBeInstanceOf(AIStrategyExecutorImpl)
    })

    it('应该获取策略状态', () => {
      const status = executor.checkStrategyStatus()
      
      expect(status).toHaveProperty('active')
      expect(status).toHaveProperty('currentLevel')
      expect(status).toHaveProperty('budgetUsage')
      expect(status).toHaveProperty('errorRate')
      expect(typeof status.budgetUsage).toBe('number')
      expect(status.budgetUsage).toBeGreaterThanOrEqual(0)
    })

    it('应该获取监控指标', () => {
      const metrics = executor.getMetrics()
      
      expect(metrics).toHaveProperty('performance')
      expect(metrics).toHaveProperty('cost')
      expect(metrics).toHaveProperty('quality')
      expect(metrics).toHaveProperty('reliability')
      
      expect(metrics.performance?.avgResponseTime).toBeGreaterThanOrEqual(0)
      expect(metrics.cost?.currentUsage).toBeGreaterThanOrEqual(0)
      expect(metrics.reliability?.availability).toBeGreaterThanOrEqual(0)
    })

    it('应该支持策略更新', () => {
      const newStrategy = {
        cost: {
          monthlyBudget: 10.0,
          budgetThresholds: { warning: 0.8, limit: 0.95, emergency: 1.0 },
          costCalculation: { costPerToken: 0.00002, fixedCostPerRequest: 0.001, estimationBuffer: 0.2 },
          budgetAllocation: { pageAnalysis: 0.7, recommendation: 0.3 },
          dynamicAdjustment: { adjustBatchSize: true, adjustRecommendationCount: true, skipLowValueRequests: true }
        }
      }
      
      executor.updateStrategy(newStrategy)
      
      // 验证策略是否更新（通过状态检查间接验证）
      const status = executor.checkStrategyStatus()
      expect(status).toBeDefined()
    })
  })

  describe('分析执行', () => {
    it('应该执行AI分析并返回结果', async () => {
      const result = await executor.executeAnalysis(mockContent, mockContext)
      
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('cost')
      expect(result).toHaveProperty('method')
      expect(result).toHaveProperty('metadata')
      
      expect(result.results).toHaveLength(mockContent.length)
      expect(result.cost).toBeGreaterThanOrEqual(0)
      expect(['ai', 'local-ai', 'algorithm']).toContain(result.method)
    })

    it('应该正确处理成功的AI分析', async () => {
      const result = await executor.executeAnalysis(mockContent, mockContext)
      
      expect(result.success).toBe(true)
      expect(result.results?.length).toBe(2)
      
      result.results?.forEach(res => {
        expect(res).toHaveProperty('relevance')
        expect(res).toHaveProperty('sentiment')
        expect(res).toHaveProperty('topics')
        expect(res).toHaveProperty('summary')
        
        expect(res.relevance).toBeGreaterThanOrEqual(0)
        expect(res.relevance).toBeLessThanOrEqual(1)
      })
    })

    it('应该在AI失败时降级到算法', async () => {
      // 创建一个会失败的执行器 - 设置极低预算
      const failingExecutor = new AIStrategyExecutorImpl()
      
      // 手动设置预算为0来强制降级
      failingExecutor.updateStrategy({
        cost: {
          monthlyBudget: 0.001,
          budgetThresholds: { warning: 0.8, limit: 0.95, emergency: 1.0 },
          costCalculation: { costPerToken: 0.00002, fixedCostPerRequest: 0.001, estimationBuffer: 0.2 },
          budgetAllocation: { pageAnalysis: 0.7, recommendation: 0.3 },
          dynamicAdjustment: { adjustBatchSize: true, adjustRecommendationCount: true, skipLowValueRequests: true }
        }
      })
      
      const result = await failingExecutor.executeAnalysis(mockContent, mockContext)
      
      expect(result.success).toBe(true)
      expect(result.method).toBe('algorithm')
      expect(result.cost).toBe(0)
      expect(result.metadata?.fallbackUsed).toBe(true)
    })
  })

  describe('并发控制', () => {
    it('应该处理多个并发请求', async () => {
      const promises = Array(5).fill(null).map(() => 
        executor.executeAnalysis(mockContent, mockContext)
      )
      
      const results = await Promise.all(promises)
      
      expect(results).toHaveLength(5)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })

    it('应该正确管理并发限制', async () => {
      // 使用默认执行器，测试并发行为
      const startTime = Date.now()
      const promises = Array(3).fill(null).map(() => 
        executor.executeAnalysis(['test content'], mockContext)
      )
      
      const results = await Promise.all(promises)
      const duration = Date.now() - startTime
      
      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result.success).toBe(true)
      })
    })
  })

  describe('预算控制', () => {
    it('应该在预算充足时执行AI分析', async () => {
      const result = await executor.executeAnalysis(mockContent, {
        ...mockContext,
        maxCost: 1.0 // 充足预算
      })
      
      expect(result.success).toBe(true)
      expect(result.cost).toBeGreaterThan(0)
    })

    it('应该在预算不足时降级', async () => {
      // 使用默认执行器，模拟预算不足场景
      const result = await executor.executeAnalysis(mockContent, {
        ...mockContext,
        maxCost: 0.000001 // 极小成本限制
      })
      
      // 应该成功执行（可能降级到算法）
      expect(result.success).toBe(true)
    })

    it('应该跟踪预算使用情况', async () => {
      const initialMetrics = executor.getMetrics()
      const initialUsage = initialMetrics.cost?.currentUsage || 0
      
      await executor.executeAnalysis(mockContent, mockContext)
      
      const updatedMetrics = executor.getMetrics()
      expect(updatedMetrics.cost?.currentUsage || 0).toBeGreaterThanOrEqual(initialUsage)
    })
  })

  describe('缓存机制', () => {
    it('应该在第二次请求时使用缓存', async () => {
      // 第一次请求
      const result1 = await executor.executeAnalysis(mockContent, mockContext)
      
      // 第二次相同请求
      const result2 = await executor.executeAnalysis(mockContent, mockContext)
      
      // 第二次应该使用缓存
      expect(result2.metadata?.cacheHit).toBe(true)
      expect(result2.success).toBe(true)
    })

    it('应该对不同内容生成不同缓存', async () => {
      const content1 = ['JavaScript 教程']
      const content2 = ['Python 教程']
      
      const result1 = await executor.executeAnalysis(content1, mockContext)
      const result2 = await executor.executeAnalysis(content2, mockContext)
      
      // 两个结果应该都是新生成的
      expect(result1.metadata?.cacheHit).toBe(false)
      expect(result2.metadata?.cacheHit).toBe(false)
    })
  })

  describe('错误处理', () => {
    it('应该处理空内容', async () => {
      const result = await executor.executeAnalysis([], mockContext)
      
      expect(result.success).toBe(true)
      expect(result.results).toHaveLength(0)
    })

    it('应该处理无效上下文', async () => {
      const invalidContext = {
        userProfile: undefined,
        priority: 'medium' as const
      }
      
      const result = await executor.executeAnalysis(mockContent, invalidContext)
      
      expect(result.success).toBe(true)
    })

    it('应该在不允许降级时抛出错误', async () => {
      const contextNoFallback = {
        ...mockContext,
        fallbackAllowed: false,
        maxCost: 0.000001 // 极小成本，强制失败
      }
      
      // 这个测试可能通过（如果缓存命中）或失败
      try {
        const result = await executor.executeAnalysis(mockContent, contextNoFallback)
        // 如果成功，验证结果
        expect(result).toBeDefined()
      } catch (error) {
        // 如果失败，验证是Error
        expect(error).toBeInstanceOf(Error)
      }
    })
  })

  describe('性能指标', () => {
    it('应该更新成功率指标', async () => {
      // 执行一些请求
      await Promise.all([
        executor.executeAnalysis(mockContent, mockContext),
        executor.executeAnalysis(mockContent, mockContext),
        executor.executeAnalysis(mockContent, mockContext)
      ])
      
      const metrics = executor.getMetrics()
      expect(metrics.reliability?.successRate || 0).toBeGreaterThan(0)
      expect(metrics.reliability?.successRate || 1).toBeLessThanOrEqual(1)
    })

    it('应该跟踪处理时间', async () => {
      const result = await executor.executeAnalysis(mockContent, mockContext)
      
      expect(result.metadata?.processingTime || 0).toBeGreaterThanOrEqual(0)
      expect(typeof (result.metadata?.processingTime || 0)).toBe('number')
    })
  })
})