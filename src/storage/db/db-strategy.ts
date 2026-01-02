/**
 * 策略决策存储模块
 * 
 * 负责管理 AI 策略决策的持久化，包括：
 * - 保存策略决策
 * - 查询当前有效策略
 * - 更新策略执行结果
 * - 策略历史查询
 */

import { db } from './index'
import type { StrategyDecision } from '@/types/strategy'
import { logger } from '@/utils/logger'

const strategyLogger = logger.withTag('StrategyDB')

/**
 * 保存策略决策
 * @param decision 策略决策对象
 * @returns 保存后的决策ID
 */
export async function saveStrategyDecision(decision: StrategyDecision): Promise<string> {
  try {
    await db.strategyDecisions.add(decision)
    strategyLogger.info('策略决策已保存', {
      id: decision.id,
      status: decision.status,
      validUntil: new Date(decision.validUntil).toISOString()
    })
    return decision.id
  } catch (error) {
    strategyLogger.error('保存策略决策失败', { error, decisionId: decision.id })
    throw error
  }
}

/**
 * 获取当前有效的策略决策
 * @returns 当前有效的策略，如果没有则返回 null
 */
export async function getCurrentStrategy(): Promise<StrategyDecision | null> {
  try {
    // 只查询状态为 active 的策略（不过滤过期时间，由调用方决定如何处理）
    const activeStrategy = await db.strategyDecisions
      .where('status')
      .equals('active')
      .first()
    
    if (activeStrategy) {
      strategyLogger.debug('找到当前有效策略', {
        id: activeStrategy.id,
        validUntil: new Date(activeStrategy.validUntil).toISOString()
      })
    }
    
    return activeStrategy || null
  } catch (error) {
    strategyLogger.error('获取当前策略失败', { error })
    throw error
  }
}

/**
 * 更新策略执行结果
 * @param decisionId 决策ID
 * @param execution 执行结果
 */
export async function updateStrategyExecution(
  decisionId: string,
  execution: StrategyDecision['execution']
): Promise<void> {
  try {
    await db.strategyDecisions.update(decisionId, {
      execution,
      status: 'completed'
    })
    
    strategyLogger.info('策略执行结果已更新', {
      id: decisionId,
      articlesAnalyzed: execution?.articlesAnalyzed,
      recommendationsGenerated: execution?.recommendationsGenerated
    })
  } catch (error) {
    strategyLogger.error('更新策略执行结果失败', { error, decisionId })
    throw error
  }
}

/**
 * 将策略标记为已失效
 * @param decisionId 决策ID
 */
export async function invalidateStrategy(decisionId: string): Promise<void> {
  try {
    await db.strategyDecisions.update(decisionId, {
      status: 'invalidated'
    })
    
    strategyLogger.info('策略已失效', { id: decisionId })
  } catch (error) {
    strategyLogger.error('失效策略失败', { error, decisionId })
    throw error
  }
}

/**
 * 获取策略历史
 * @param limit 返回的最大记录数，默认 20
 * @returns 策略决策列表（按创建时间倒序）
 */
export async function getStrategyHistory(limit: number = 20): Promise<StrategyDecision[]> {
  try {
    const decisions = await db.strategyDecisions
      .orderBy('createdAt')
      .reverse()
      .limit(limit)
      .toArray()
    
    strategyLogger.debug('获取策略历史', { count: decisions.length, limit })
    return decisions
  } catch (error) {
    strategyLogger.error('获取策略历史失败', { error })
    throw error
  }
}

/**
 * 获取需要复审的策略
 * @returns 需要复审的策略列表
 */
export async function getStrategiesToReview(): Promise<StrategyDecision[]> {
  try {
    const now = Date.now()
    
    // 查询状态为 active 且 nextReview 时间已到的策略
    const strategies = await db.strategyDecisions
      .where('status')
      .equals('active')
      .filter(decision => !!(decision.nextReview && decision.nextReview <= now))
      .toArray()
    
    strategyLogger.debug('找到需要复审的策略', { count: strategies.length })
    return strategies
  } catch (error) {
    strategyLogger.error('获取待复审策略失败', { error })
    throw error
  }
}

/**
 * 清理过期策略（保留最近 N 条）
 * @param keepCount 保留的记录数，默认 100
 * @returns 删除的记录数
 */
export async function cleanupOldStrategies(keepCount: number = 100): Promise<number> {
  try {
    // 获取所有策略按时间排序
    const allStrategies = await db.strategyDecisions
      .orderBy('createdAt')
      .reverse()
      .toArray()
    
    // 如果总数不超过保留数，不需要清理
    if (allStrategies.length <= keepCount) {
      strategyLogger.debug('策略数量未超限，无需清理', {
        current: allStrategies.length,
        limit: keepCount
      })
      return 0
    }
    
    // 删除超出部分
    const toDelete = allStrategies.slice(keepCount)
    const deleteIds = toDelete.map(s => s.id)
    
    await db.strategyDecisions.bulkDelete(deleteIds)
    
    strategyLogger.info('清理过期策略完成', {
      deleted: deleteIds.length,
      remaining: keepCount
    })
    
    return deleteIds.length
  } catch (error) {
    strategyLogger.error('清理过期策略失败', { error })
    throw error
  }
}

/**
 * 获取策略性能统计
 * @param days 统计最近多少天的数据，默认 7 天
 * @returns 性能统计数据
 */
export async function getStrategyPerformanceStats(days: number = 7) {
  try {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    
    const recentStrategies = await db.strategyDecisions
      .where('createdAt')
      .above(since)
      .filter(d => d.status === 'completed' && !!d.execution)
      .toArray()
    
    if (recentStrategies.length === 0) {
      return {
        totalStrategies: 0,
        avgArticlesAnalyzed: 0,
        avgRecommendationsGenerated: 0,
        avgCostPerStrategy: 0,
        totalCost: 0
      }
    }
    
    const totalArticles = recentStrategies.reduce(
      (sum, s) => sum + (s.execution?.articlesAnalyzed || 0), 0
    )
    const totalRecommendations = recentStrategies.reduce(
      (sum, s) => sum + (s.execution?.recommendationsGenerated || 0), 0
    )
    const totalCost = recentStrategies.reduce(
      (sum, s) => sum + (s.execution?.actualCostUSD || 0), 0
    )
    
    return {
      totalStrategies: recentStrategies.length,
      avgArticlesAnalyzed: totalArticles / recentStrategies.length,
      avgRecommendationsGenerated: totalRecommendations / recentStrategies.length,
      avgCostPerStrategy: totalCost / recentStrategies.length,
      totalCost
    }
  } catch (error) {
    strategyLogger.error('获取策略性能统计失败', { error })
    throw error
  }
}
