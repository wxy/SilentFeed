/**
 * 策略存储测试
 * 
 * 测试策略直接使用 chrome.storage.local mock，不需要额外的 spy
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveStrategyDecision,
  getCurrentStrategy,
  clearStrategy,
  invalidateStrategy,
  updateStrategyExecution,
  cacheSystemContext,
  getCachedSystemContext
} from './strategy-storage'
import type { StrategyDecision } from '@/types/strategy'

describe('strategy-storage', () => {
  beforeEach(async () => {
    // 清理所有存储
    await chrome.storage.local.clear()
  })

  describe('saveStrategyDecision', () => {
    it('应该保存策略到 chrome.storage.local', async () => {
      const strategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await saveStrategyDecision(strategy)

      // 验证保存成功
      const result = await chrome.storage.local.get('current_strategy')
      expect(result.current_strategy).toEqual(strategy)
    })
  })

  describe('getCurrentStrategy', () => {
    it('应该返回有效的策略', async () => {
      const validStrategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: validStrategy })

      const result = await getCurrentStrategy()
      expect(result).toEqual(validStrategy)
    })

    it('没有策略时应该返回 null', async () => {
      const result = await getCurrentStrategy()
      expect(result).toBeNull()
    })

    it('策略过期时应该自动清除并返回 null', async () => {
      const expiredStrategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now() - 48 * 60 * 60 * 1000,
        validUntil: Date.now() - 24 * 60 * 60 * 1000, // 已过期
        nextReview: Date.now() - 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: expiredStrategy })

      const result = await getCurrentStrategy()
      
      expect(result).toBeNull()
      
      // 验证已清除
      const stored = await chrome.storage.local.get('current_strategy')
      expect(stored.current_strategy).toBeUndefined()
    })
  })

  describe('clearStrategy', () => {
    it('应该清除当前策略', async () => {
      const strategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: strategy })
      await clearStrategy()

      const result = await chrome.storage.local.get('current_strategy')
      expect(result.current_strategy).toBeUndefined()
    })
  })

  describe('invalidateStrategy', () => {
    it('应该清除策略（向后兼容接口）', async () => {
      const strategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: strategy })
      await invalidateStrategy('strategy-1')

      const result = await chrome.storage.local.get('current_strategy')
      expect(result.current_strategy).toBeUndefined()
    })
  })

  describe('updateStrategyExecution', () => {
    it('应该更新策略执行结果', async () => {
      const strategy: StrategyDecision = {
        id: 'strategy-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 24 * 60 * 60 * 1000,
        nextReview: Date.now() + 12 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await chrome.storage.local.set({ current_strategy: strategy })

      const execution = {
        executedAt: Date.now(),
        articlesAnalyzed: 50,
        recommendationsGenerated: 10
      }

      await updateStrategyExecution('strategy-1', execution)

      const result = await chrome.storage.local.get('current_strategy')
      expect(result.current_strategy).toMatchObject({
        ...strategy,
        execution,
        status: 'completed'
      })
    })

    it('策略不存在时应该警告但不报错', async () => {
      const execution = {
        executedAt: Date.now(),
        articlesAnalyzed: 50,
        recommendationsGenerated: 10
      }

      await expect(
        updateStrategyExecution('strategy-1', execution)
      ).resolves.not.toThrow()

      const result = await chrome.storage.local.get('current_strategy')
      expect(result.current_strategy).toBeUndefined()
    })
  })

  describe('系统上下文缓存', () => {
    it('应该缓存系统上下文', async () => {
      const context = {
        activeFeeds: 10,
        dailyNewArticles: 50,
        rawPoolSize: 100,
        candidatePoolSize: 30,
        dailyReadCount: 5,
        recommendationPoolSize: 10,
        aiTokensUsedToday: 1000,
        analyzedArticlesToday: 50,
        timestamp: Date.now()
      }

      await cacheSystemContext(context)

      const result = await chrome.storage.local.get('strategy_system_context')
      expect(result.strategy_system_context).toEqual(context)
    })

    it('应该读取缓存的系统上下文', async () => {
      const context = {
        activeFeeds: 10,
        dailyNewArticles: 50,
        rawPoolSize: 100,
        candidatePoolSize: 30,
        dailyReadCount: 5,
        recommendationPoolSize: 10,
        aiTokensUsedToday: 1000,
        analyzedArticlesToday: 50,
        timestamp: Date.now()
      }

      await chrome.storage.local.set({ strategy_system_context: context })

      const result = await getCachedSystemContext()
      expect(result).toEqual(context)
    })

    it('没有缓存时应该返回 null', async () => {
      const result = await getCachedSystemContext()
      expect(result).toBeNull()
    })
  })
})
