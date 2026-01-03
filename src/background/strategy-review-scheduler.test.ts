/**
 * 策略审查调度器测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { db } from '@/storage/db'
import type { StrategyDecision } from '@/types/strategy'

// Mock StrategyDecisionService
vi.mock('@/core/strategy/StrategyDecisionService', () => {
  return {
    StrategyDecisionService: class {
      getCurrentStrategy = vi.fn()
      generateNewStrategy = vi.fn()
    }
  }
})

// 导入调度器（必须在 mock 之后）
import { StrategyReviewScheduler } from './strategy-review-scheduler'
import { StrategyDecisionService } from '@/core/strategy/StrategyDecisionService'

// Mock chrome.alarms API
const mockAlarms = {
  create: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(true),
  get: vi.fn().mockResolvedValue(null),
  getAll: vi.fn().mockResolvedValue([])
}

global.chrome = {
  ...global.chrome,
  alarms: mockAlarms as any
}

describe('StrategyReviewScheduler', () => {
  let scheduler: StrategyReviewScheduler
  let mockStrategyService: any
  
  beforeEach(async () => {
    // 清空 storage
    await chrome.storage.local.remove(['current_strategy', 'strategy_system_context'])
    
    // 重置所有 mocks
    vi.clearAllMocks()
    
    // 创建新的调度器实例
    scheduler = new StrategyReviewScheduler()
    
    // 获取 mock 的 StrategyDecisionService 实例
    mockStrategyService = (scheduler as any).strategyService
  })
  
  afterEach(async () => {
    // 停止调度器
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop()
    }
  })
  
  describe('start', () => {
    it('应该成功启动调度器', async () => {
      await scheduler.start()
      
      // 验证创建了 alarm（每24小时 = 1440分钟）
      expect(mockAlarms.create).toHaveBeenCalledWith(
        'strategy-review',
        expect.objectContaining({
          periodInMinutes: 1440  // 24小时
        })
      )
      
      // 验证状态
      const status = scheduler.getStatus()
      expect(status.isRunning).toBe(true)
    })
    
    it('应该防止重复启动', async () => {
      await scheduler.start()
      await scheduler.start()
      
      // 只调用一次
      expect(mockAlarms.create).toHaveBeenCalledTimes(1)
    })
  })
  
  describe('stop', () => {
    it('应该成功停止调度器', async () => {
      await scheduler.start()
      await scheduler.stop()
      
      // 验证清除了 alarm
      expect(mockAlarms.clear).toHaveBeenCalledWith('strategy-review')
      
      // 验证状态
      const status = scheduler.getStatus()
      expect(status.isRunning).toBe(false)
    })
  })
  
  describe('handleAlarm', () => {
    it('应该在没有策略时生成初始策略', async () => {
      // Mock: 没有当前策略
      mockStrategyService.getCurrentStrategy.mockResolvedValue(null)
      
      // Mock: 生成新策略
      const newStrategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {
          analysis: {
            batchSize: 10,
            scoreThreshold: 7.5
          },
          recommendation: {
            targetPoolSize: 5,
            refillThreshold: 2,
            dailyLimit: 15,
            cooldownMinutes: 60
          },
          scheduling: {
            analysisIntervalMinutes: 30,
            recommendIntervalMinutes: 30,
            loopIterations: 3
          },
          candidatePool: {
            targetSize: 35,
            maxSize: 70,
            expiryHours: 168
          },
          meta: {
            validHours: 24,
            generatedAt: Date.now(),
            version: 'v1.0',
            nextReviewHours: 12
          }
        }
      }
      mockStrategyService.generateNewStrategy.mockResolvedValue(newStrategy)
      
      // 执行
      await scheduler.handleAlarm()
      
      // 验证生成了新策略
      expect(mockStrategyService.generateNewStrategy).toHaveBeenCalled()
    })
    
    it('应该在策略过期时生成新策略', async () => {
      const now = Date.now()
      
      // Mock: 过期的策略
      const expiredStrategy: StrategyDecision = {
        id: 'strategy-expired',
        createdAt: now - 48 * 60 * 60 * 1000,
        validUntil: now - 1000, // 已过期
        nextReview: now + 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }
      mockStrategyService.getCurrentStrategy.mockResolvedValue(expiredStrategy)
      
      // Mock: 生成新策略
      mockStrategyService.generateNewStrategy.mockResolvedValue({
        ...expiredStrategy,
        id: 'strategy-new',
        validUntil: now + 24 * 60 * 60 * 1000
      })
      
      // 执行
      await scheduler.handleAlarm()
      
      // 验证生成了新策略
      expect(mockStrategyService.generateNewStrategy).toHaveBeenCalled()
    })
    
    it('应该在需要审查时生成新策略', async () => {
      const now = Date.now()
      
      // Mock: 需要审查的策略
      const strategyNeedReview: StrategyDecision = {
        id: 'strategy-review',
        createdAt: now - 13 * 60 * 60 * 1000,
        validUntil: now + 11 * 60 * 60 * 1000, // 未过期
        nextReview: now - 1000, // 需要审查
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }
      mockStrategyService.getCurrentStrategy.mockResolvedValue(strategyNeedReview)
      
      // Mock: 生成新策略
      mockStrategyService.generateNewStrategy.mockResolvedValue({
        ...strategyNeedReview,
        id: 'strategy-new',
        nextReview: now + 12 * 60 * 60 * 1000
      })
      
      // 执行
      await scheduler.handleAlarm()
      
      // 验证生成了新策略
      expect(mockStrategyService.generateNewStrategy).toHaveBeenCalled()
    })
    
    it('应该在策略有效时不生成新策略', async () => {
      const now = Date.now()
      
      // Mock: 有效的策略
      const validStrategy: StrategyDecision = {
        id: 'strategy-valid',
        createdAt: now - 1 * 60 * 60 * 1000,
        validUntil: now + 23 * 60 * 60 * 1000, // 未过期
        nextReview: now + 11 * 60 * 60 * 1000, // 不需要审查
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }
      mockStrategyService.getCurrentStrategy.mockResolvedValue(validStrategy)
      
      // 执行
      await scheduler.handleAlarm()
      
      // 验证没有生成新策略
      expect(mockStrategyService.generateNewStrategy).not.toHaveBeenCalled()
    })
  })
  
  describe('onStrategyUpdate', () => {
    it('应该正确注册和调用回调函数', async () => {
      const callback = vi.fn()
      
      scheduler.onStrategyUpdate(callback)
      
      // 验证注册
      const status = scheduler.getStatus()
      expect(status.callbackCount).toBe(1)
      
      // Mock: 没有策略，触发生成
      mockStrategyService.getCurrentStrategy.mockResolvedValue(null)
      const newStrategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }
      mockStrategyService.generateNewStrategy.mockResolvedValue(newStrategy)
      
      // 执行
      await scheduler.handleAlarm()
      
      // 验证回调被调用
      expect(callback).toHaveBeenCalledWith(newStrategy)
    })
    
    it('应该处理多个回调函数', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      
      scheduler.onStrategyUpdate(callback1)
      scheduler.onStrategyUpdate(callback2)
      
      // Mock: 触发生成
      mockStrategyService.getCurrentStrategy.mockResolvedValue(null)
      const newStrategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }
      mockStrategyService.generateNewStrategy.mockResolvedValue(newStrategy)
      
      // 执行
      await scheduler.handleAlarm()
      
      // 验证两个回调都被调用
      expect(callback1).toHaveBeenCalledWith(newStrategy)
      expect(callback2).toHaveBeenCalledWith(newStrategy)
    })
  })
  
  describe('triggerReview', () => {
    it('应该手动触发审查并返回结果', async () => {
      // Mock: 没有策略
      mockStrategyService.getCurrentStrategy.mockResolvedValue(null)
      mockStrategyService.generateNewStrategy.mockResolvedValue({
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      })
      
      const result = await scheduler.triggerReview()
      
      expect(result.success).toBe(true)
      expect(result.strategyGenerated).toBe(true)
      expect(result.message).toBe('已生成新策略')
    })
    
    it('应该在策略有效时返回正确消息', async () => {
      const now = Date.now()
      
      // Mock: 有效策略
      mockStrategyService.getCurrentStrategy.mockResolvedValue({
        id: 'strategy-valid',
        createdAt: now,
        validUntil: now + 24 * 60 * 60 * 1000,
        nextReview: now + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      })
      
      const result = await scheduler.triggerReview()
      
      expect(result.success).toBe(true)
      expect(result.strategyGenerated).toBe(false)
      expect(result.message).toBe('当前策略仍然有效')
    })
  })
})
