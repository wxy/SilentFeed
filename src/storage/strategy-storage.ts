/**
 * 策略存储模块（简化版）
 * 
 * 使用 chrome.storage.local 直接存储当前策略
 * 不需要 IndexedDB，不需要缓存层
 * 
 * 设计原则：
 * - 策略数据量小（<10KB）
 * - 访问频繁但更新少（每天1次）
 * - 只需要当前策略，不需要历史
 * - chrome.storage.local 足够快速和可靠
 */

import { logger } from '@/utils/logger'
import type { StrategyDecision, StrategyDecisionContext } from '@/types/strategy'

const strategyLogger = logger.withTag('StrategyStorage')

/**
 * 存储键
 */
const STORAGE_KEYS = {
  CURRENT_STRATEGY: 'current_strategy',
  SYSTEM_CONTEXT: 'strategy_system_context'
} as const

/**
 * 缓存的系统上下文（简化版，只存关键指标）
 */
export interface CachedSystemContext {
  // 供给侧
  activeFeeds: number
  dailyNewArticles: number
  rawPoolSize: number
  candidatePoolSize: number
  
  // 需求侧
  dailyReadCount: number
  recommendationPoolSize: number
  
  // 系统
  aiTokensUsedToday: number
  analyzedArticlesToday: number
  
  // 时间戳
  timestamp: number
}

/**
 * 保存策略决策
 * @param decision 策略决策对象
 */
export async function saveStrategyDecision(decision: StrategyDecision): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CURRENT_STRATEGY]: decision
    })
    
    strategyLogger.info('策略已保存', {
      id: decision.id,
      validUntil: new Date(decision.validUntil).toISOString()
    })
  } catch (error) {
    strategyLogger.error('保存策略失败', { error, decisionId: decision.id })
    throw error
  }
}

/**
 * 获取当前有效的策略决策
 * @returns 当前策略，如果没有或已过期则返回 null
 */
export async function getCurrentStrategy(): Promise<StrategyDecision | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_STRATEGY)
    const strategy = result[STORAGE_KEYS.CURRENT_STRATEGY] as StrategyDecision | undefined
    
    if (!strategy) {
      strategyLogger.debug('没有找到当前策略')
      return null
    }
    
    // 检查策略是否过期
    const now = Date.now()
    if (strategy.validUntil < now) {
      strategyLogger.info('当前策略已过期', {
        id: strategy.id,
        validUntil: new Date(strategy.validUntil).toISOString()
      })
      // 过期策略自动清除
      await clearStrategy()
      return null
    }
    
    strategyLogger.debug('找到当前有效策略', {
      id: strategy.id,
      validUntil: new Date(strategy.validUntil).toISOString()
    })
    
    return strategy
  } catch (error) {
    strategyLogger.error('获取当前策略失败', { error })
    return null
  }
}

/**
 * 清除当前策略
 */
export async function clearStrategy(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEYS.CURRENT_STRATEGY)
    strategyLogger.info('策略已清除')
  } catch (error) {
    strategyLogger.error('清除策略失败', { error })
    throw error
  }
}

/**
 * 将策略标记为已失效（清除策略）
 * @param decisionId 决策ID（向后兼容参数，实际不使用）
 */
export async function invalidateStrategy(decisionId?: string): Promise<void> {
  await clearStrategy()
  if (decisionId) {
    strategyLogger.info('策略已失效', { id: decisionId })
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
    const strategy = await getCurrentStrategy()
    
    if (!strategy || strategy.id !== decisionId) {
      strategyLogger.warn('无法更新策略执行结果：策略不存在或ID不匹配', { decisionId })
      return
    }
    
    strategy.execution = execution
    strategy.status = 'completed'
    
    await saveStrategyDecision(strategy)
    
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
 * 缓存系统上下文
 * @param context 系统上下文
 */
export async function cacheSystemContext(context: CachedSystemContext): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SYSTEM_CONTEXT]: context
    })
    strategyLogger.debug('系统上下文已缓存')
  } catch (error) {
    strategyLogger.error('缓存系统上下文失败', { error })
  }
}

/**
 * 获取缓存的系统上下文
 * @returns 系统上下文，如果没有或过期则返回 null
 */
export async function getCachedSystemContext(): Promise<CachedSystemContext | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYSTEM_CONTEXT)
    const context = result[STORAGE_KEYS.SYSTEM_CONTEXT] as CachedSystemContext | undefined
    
    if (!context) {
      strategyLogger.debug('没有缓存的系统上下文')
      return null
    }
    
    // 检查缓存是否过期（24小时）
    const now = Date.now()
    const age = now - context.timestamp
    const MAX_AGE = 24 * 60 * 60 * 1000 // 24小时
    
    if (age > MAX_AGE) {
      strategyLogger.debug('系统上下文缓存已过期')
      return null
    }
    
    strategyLogger.debug('从缓存加载系统上下文')
    return context
  } catch (error) {
    strategyLogger.error('获取缓存的系统上下文失败', { error })
    return null
  }
}

/**
 * 缓存策略（向后兼容接口）
 * 
 * 注意：在新架构中，saveStrategyDecision 已经直接保存到 chrome.storage.local
 * 这个函数保留只是为了向后兼容，实际上不需要做任何事情
 * 
 * @param strategy 策略对象（参数保留但未使用）
 */
export async function cacheStrategy(strategy: StrategyDecision): Promise<void> {
  // 空操作：saveStrategyDecision 已经保存到 chrome.storage.local
  // 这个函数只是为了向后兼容，避免修改调用方代码
  strategyLogger.debug('cacheStrategy 被调用（向后兼容，无需操作）', { id: strategy.id })
}
