/**
 * 策略决策存储模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import {
  saveStrategyDecision,
  getCurrentStrategy,
  updateStrategyExecution,
  invalidateStrategy,
  getStrategyHistory,
  getStrategiesToReview,
  cleanupOldStrategies,
  getStrategyPerformanceStats
} from './db-strategy'
import type { StrategyDecision } from '@/types/strategy'

describe('db-strategy', () => {
  beforeEach(async () => {
    // 清空策略表
    await db.strategyDecisions.clear()
  })

  describe('saveStrategyDecision', () => {
    it('应该成功保存策略决策', async () => {
      const decision: StrategyDecision = {
        id: 'test-decision-1',
        createdAt: Date.now(),
        validUntil: Date.now() + 12 * 60 * 60 * 1000,
        nextReview: Date.now() + 6 * 60 * 60 * 1000,
        status: 'active',
        context: {
          supply: {
            totalFeeds: 10,
            activeFeeds: 8,
            avgUpdateFrequency: 2,
            dailyNewArticles: 20,
            rawPoolSize: 100,
            candidatePoolSize: 30,
            analyzedNotQualifiedSize: 50
          },
          demand: {
            dailyReadCount: 5,
            avgReadSpeed: 4,
            dismissRate: 10,
            likeRate: 70,
            recommendationPoolSize: 20,
            recommendationPoolCapacity: 60
          },
          system: {
            aiTokensUsedToday: 5000,
            aiTokensBudgetDaily: 100000,
            aiCostToday: 0.03,
            analyzedArticlesToday: 10,
            recommendedArticlesToday: 5
          },
          history: {
            last7DaysReadCount: 35,
            last7DaysRecommendedCount: 40,
            last7DaysAnalyzedCount: 70
          },
          userProfile: {
            pageVisitCount: 500,
            onboardingComplete: true,
            topTopics: [],
            profileConfidence: 75
          },
          timestamp: Date.now()
        },
        strategy: {
          analysis: { batchSize: 10, scoreThreshold: 7.0 },
          recommendation: { targetPoolSize: 5, refillThreshold: 2, dailyLimit: 20, cooldownMinutes: 60 },
          scheduling: { analysisIntervalMinutes: 30, recommendIntervalMinutes: 60, loopIterations: 3 },
          candidatePool: { targetSize: 20, maxSize: 50, expiryHours: 48 },
          meta: { validHours: 24, generatedAt: Date.now(), version: '1.0', nextReviewHours: 6 }
        }
      }

      const id = await saveStrategyDecision(decision)
      expect(id).toBe('test-decision-1')

      // 验证保存成功
      const saved = await db.strategyDecisions.get('test-decision-1')
      expect(saved).toBeDefined()
      expect(saved?.status).toBe('active')
    })
  })

  describe('getCurrentStrategy', () => {
    it('应该返回有效的当前策略', async () => {
      const now = Date.now()
      const validStrategy: StrategyDecision = {
        id: 'valid-strategy',
        createdAt: now,
        validUntil: now + 12 * 60 * 60 * 1000,
        nextReview: now + 6 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await db.strategyDecisions.add(validStrategy)

      const current = await getCurrentStrategy()
      expect(current).toBeDefined()
      expect(current?.id).toBe('valid-strategy')
    })

    it('应该返回过期的 active 策略（由上层处理过期）', async () => {
      const now = Date.now()
      const expiredStrategy: StrategyDecision = {
        id: 'expired-strategy',
        createdAt: now - 24 * 60 * 60 * 1000,
        validUntil: now - 1000, // 已过期
        nextReview: now - 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await db.strategyDecisions.add(expiredStrategy)

      // 数据库层不过滤过期，由 StrategyDecisionService 处理
      const current = await getCurrentStrategy()
      expect(current).toBeDefined()
      expect(current?.id).toBe('expired-strategy')
      expect(current?.validUntil).toBeLessThan(now)
    })

    it('应该忽略非 active 状态的策略', async () => {
      const now = Date.now()
      const completedStrategy: StrategyDecision = {
        id: 'completed-strategy',
        createdAt: now,
        validUntil: now + 12 * 60 * 60 * 1000,
        nextReview: now + 6 * 60 * 60 * 1000,
        status: 'completed',
        context: {} as any,
        strategy: {} as any
      }

      await db.strategyDecisions.add(completedStrategy)

      const current = await getCurrentStrategy()
      expect(current).toBeNull()
    })
  })

  describe('updateStrategyExecution', () => {
    it('应该更新策略执行结果并标记为 completed', async () => {
      const decision: StrategyDecision = {
        id: 'test-exec',
        createdAt: Date.now(),
        validUntil: Date.now() + 12 * 60 * 60 * 1000,
        nextReview: Date.now() + 6 * 60 * 60 * 1000,
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await db.strategyDecisions.add(decision)

      const execution = {
        articlesAnalyzed: 10,
        recommendationsGenerated: 5,
        actualCostUSD: 0.05,
        completedAt: Date.now()
      }

      await updateStrategyExecution('test-exec', execution)

      const updated = await db.strategyDecisions.get('test-exec')
      expect(updated?.status).toBe('completed')
      expect(updated?.execution?.articlesAnalyzed).toBe(10)
      expect(updated?.execution?.recommendationsGenerated).toBe(5)
    })
  })

  describe('invalidateStrategy', () => {
    it('应该将策略标记为 invalidated', async () => {
      const decision: StrategyDecision = {
        id: 'test-invalidate',
        createdAt: Date.now(),
        validUntil: Date.now() + 12 * 60 * 60 * 1000,        nextReview: Date.now() + 6 * 60 * 60 * 1000,        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await db.strategyDecisions.add(decision)
      await invalidateStrategy('test-invalidate')

      const updated = await db.strategyDecisions.get('test-invalidate')
      expect(updated?.status).toBe('invalidated')
    })
  })

  describe('getStrategyHistory', () => {
    it('应该返回指定数量的历史策略（按时间倒序）', async () => {
      // 添加多个策略
      const strategies: StrategyDecision[] = [
        {
          id: 'strategy-1',
          createdAt: Date.now() - 3000,
          validUntil: Date.now(),
          nextReview: Date.now(),
          status: 'completed',
          context: {} as any,
          strategy: {} as any
        },
        {
          id: 'strategy-2',
          createdAt: Date.now() - 2000,
          validUntil: Date.now(),
          nextReview: Date.now(),
          status: 'completed',
          context: {} as any,
          strategy: {} as any
        },
        {
          id: 'strategy-3',
          createdAt: Date.now() - 1000,
          validUntil: Date.now(),
          nextReview: Date.now(),
          status: 'active',
          context: {} as any,
          strategy: {} as any
        }
      ]

      for (const s of strategies) {
        await db.strategyDecisions.add(s)
      }

      const history = await getStrategyHistory(2)
      expect(history).toHaveLength(2)
      // 最新的应该在前面
      expect(history[0].id).toBe('strategy-3')
      expect(history[1].id).toBe('strategy-2')
    })
  })

  describe('getStrategiesToReview', () => {
    it('应该返回需要复审的策略', async () => {
      const now = Date.now()
      
      const needsReview: StrategyDecision = {
        id: 'needs-review',
        createdAt: now - 7 * 60 * 60 * 1000,
        validUntil: now + 5 * 60 * 60 * 1000,
        nextReview: now - 1000, // 复审时间已到
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      const noReview: StrategyDecision = {
        id: 'no-review',
        createdAt: now,
        validUntil: now + 12 * 60 * 60 * 1000,
        nextReview: now + 6 * 60 * 60 * 1000, // 复审时间未到
        status: 'active',
        context: {} as any,
        strategy: {} as any
      }

      await db.strategyDecisions.add(needsReview)
      await db.strategyDecisions.add(noReview)

      const toReview = await getStrategiesToReview()
      expect(toReview).toHaveLength(1)
      expect(toReview[0].id).toBe('needs-review')
    })
  })

  describe('cleanupOldStrategies', () => {
    it('应该保留指定数量的最新策略', async () => {
      // 添加 5 个策略
      for (let i = 0; i < 5; i++) {
        await db.strategyDecisions.add({
          id: `strategy-${i}`,
          createdAt: Date.now() - (5 - i) * 1000,
          validUntil: Date.now(),
          nextReview: Date.now(),
          status: 'completed',
          context: {} as any,
          strategy: {} as any
        })
      }

      // 保留最新 3 个
      const deleted = await cleanupOldStrategies(3)
      expect(deleted).toBe(2)

      const remaining = await db.strategyDecisions.count()
      expect(remaining).toBe(3)

      // 验证保留的是最新的
      const all = await db.strategyDecisions.toArray()
      const ids = all.map(s => s.id).sort()
      expect(ids).toEqual(['strategy-2', 'strategy-3', 'strategy-4'])
    })

    it('当策略数不足时不应删除任何记录', async () => {
      await db.strategyDecisions.add({
        id: 'only-one',
        createdAt: Date.now(),
        validUntil: Date.now(),
        nextReview: Date.now(),
        status: 'active',
        context: {} as any,
        strategy: {} as any
      })

      const deleted = await cleanupOldStrategies(10)
      expect(deleted).toBe(0)

      const count = await db.strategyDecisions.count()
      expect(count).toBe(1)
    })
  })

  describe('getStrategyPerformanceStats', () => {
    it('应该计算策略性能统计', async () => {
      const now = Date.now()
      const oneDayAgo = now - 24 * 60 * 60 * 1000

      // 添加已完成的策略
      await db.strategyDecisions.bulkAdd([
        {
          id: 's1',
          createdAt: oneDayAgo + 1000,
          validUntil: now,
          nextReview: now,
          status: 'completed',
          context: {} as any,
          strategy: {} as any,
          execution: {
            articlesAnalyzed: 10,
            recommendationsGenerated: 5,
            actualCostUSD: 0.05,
            completedAt: now
          }
        },
        {
          id: 's2',
          createdAt: oneDayAgo + 2000,
          validUntil: now,
          nextReview: now,
          status: 'completed',
          context: {} as any,
          strategy: {} as any,
          execution: {
            articlesAnalyzed: 20,
            recommendationsGenerated: 10,
            actualCostUSD: 0.10,
            completedAt: now
          }
        }
      ])

      const stats = await getStrategyPerformanceStats(7)
      expect(stats.totalStrategies).toBe(2)
      expect(stats.avgArticlesAnalyzed).toBe(15)
      expect(stats.avgRecommendationsGenerated).toBe(7.5)
      expect(stats.avgCostPerStrategy).toBeCloseTo(0.075, 3)
      expect(stats.totalCost).toBeCloseTo(0.15, 2)
    })

    it('没有策略时应返回零值统计', async () => {
      const stats = await getStrategyPerformanceStats(7)
      expect(stats.totalStrategies).toBe(0)
      expect(stats.avgArticlesAnalyzed).toBe(0)
      expect(stats.avgRecommendationsGenerated).toBe(0)
      expect(stats.avgCostPerStrategy).toBe(0)
      expect(stats.totalCost).toBe(0)
    })
  })
})
