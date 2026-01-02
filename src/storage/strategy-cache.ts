/**
 * 策略缓存服务
 * 
 * 将策略和系统统计数据缓存到 chrome.storage.local
 * 避免每次都重新计算，提高性能
 */

import { logger } from '@/utils/logger'
import type { StrategyDecision, StrategyDecisionContext } from '@/types/strategy'
import { getCurrentStrategy } from './db/db-strategy'

const cacheLogger = logger.withTag('StrategyCache')

/**
 * 缓存键
 */
const CACHE_KEYS = {
  CURRENT_STRATEGY: 'strategy_current',
  SYSTEM_CONTEXT: 'strategy_system_context',
  LAST_UPDATE: 'strategy_last_update'
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
 * 获取缓存的当前策略
 */
export async function getCachedStrategy(): Promise<StrategyDecision | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEYS.CURRENT_STRATEGY)
    const cached = result[CACHE_KEYS.CURRENT_STRATEGY] as StrategyDecision | undefined
    
    if (!cached) {
      cacheLogger.debug('缓存中没有策略')
      return null
    }
    
    // 检查缓存的策略是否过期
    const now = Date.now()
    if (cached.validUntil < now) {
      cacheLogger.info('缓存的策略已过期，从数据库加载...')
      return await refreshStrategyCache()
    }
    
    cacheLogger.debug('从缓存加载策略', { id: cached.id })
    return cached
  } catch (error) {
    cacheLogger.error('读取缓存策略失败:', error)
    return null
  }
}

/**
 * 刷新策略缓存（从数据库加载最新策略）
 */
export async function refreshStrategyCache(): Promise<StrategyDecision | null> {
  try {
    const strategy = await getCurrentStrategy()
    
    if (strategy) {
      await chrome.storage.local.set({
        [CACHE_KEYS.CURRENT_STRATEGY]: strategy,
        [CACHE_KEYS.LAST_UPDATE]: Date.now()
      })
      cacheLogger.info('策略缓存已更新', { id: strategy.id })
    } else {
      await chrome.storage.local.remove(CACHE_KEYS.CURRENT_STRATEGY)
      cacheLogger.info('清除策略缓存（没有有效策略）')
    }
    
    return strategy
  } catch (error) {
    cacheLogger.error('刷新策略缓存失败:', error)
    return null
  }
}

/**
 * 保存策略到缓存（生成新策略后调用）
 */
export async function cacheStrategy(strategy: StrategyDecision): Promise<void> {
  try {
    await chrome.storage.local.set({
      [CACHE_KEYS.CURRENT_STRATEGY]: strategy,
      [CACHE_KEYS.LAST_UPDATE]: Date.now()
    })
    cacheLogger.info('策略已缓存', { id: strategy.id })
  } catch (error) {
    cacheLogger.error('缓存策略失败:', error)
    throw error
  }
}

/**
 * 获取缓存的系统上下文
 */
export async function getCachedSystemContext(): Promise<CachedSystemContext | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEYS.SYSTEM_CONTEXT)
    const cached = result[CACHE_KEYS.SYSTEM_CONTEXT] as CachedSystemContext | undefined
    
    if (!cached) {
      cacheLogger.debug('缓存中没有系统上下文')
      return null
    }
    
    // 检查缓存是否过时（超过1小时）
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    if (now - cached.timestamp > oneHour) {
      cacheLogger.debug('系统上下文缓存已过时（>1小时）')
      return null
    }
    
    cacheLogger.debug('从缓存加载系统上下文')
    return cached
  } catch (error) {
    cacheLogger.error('读取缓存系统上下文失败:', error)
    return null
  }
}

/**
 * 缓存系统上下文（部分数据）
 */
export async function cacheSystemContext(context: Partial<CachedSystemContext>): Promise<void> {
  try {
    const cached: CachedSystemContext = {
      activeFeeds: context.activeFeeds || 0,
      dailyNewArticles: context.dailyNewArticles || 0,
      rawPoolSize: context.rawPoolSize || 0,
      candidatePoolSize: context.candidatePoolSize || 0,
      dailyReadCount: context.dailyReadCount || 0,
      recommendationPoolSize: context.recommendationPoolSize || 0,
      aiTokensUsedToday: context.aiTokensUsedToday || 0,
      analyzedArticlesToday: context.analyzedArticlesToday || 0,
      timestamp: Date.now()
    }
    
    await chrome.storage.local.set({
      [CACHE_KEYS.SYSTEM_CONTEXT]: cached
    })
    
    cacheLogger.debug('系统上下文已缓存')
  } catch (error) {
    cacheLogger.error('缓存系统上下文失败:', error)
  }
}

/**
 * 清除所有策略缓存
 */
export async function clearStrategyCache(): Promise<void> {
  try {
    await chrome.storage.local.remove([
      CACHE_KEYS.CURRENT_STRATEGY,
      CACHE_KEYS.SYSTEM_CONTEXT,
      CACHE_KEYS.LAST_UPDATE
    ])
    cacheLogger.info('策略缓存已清除')
  } catch (error) {
    cacheLogger.error('清除缓存失败:', error)
  }
}

/**
 * 获取缓存统计
 */
export async function getCacheStats(): Promise<{
  hasStrategy: boolean
  hasContext: boolean
  lastUpdate: number | null
  strategyId?: string
  strategyValidUntil?: number
}> {
  try {
    const result = await chrome.storage.local.get([
      CACHE_KEYS.CURRENT_STRATEGY,
      CACHE_KEYS.SYSTEM_CONTEXT,
      CACHE_KEYS.LAST_UPDATE
    ])
    
    const strategy = result[CACHE_KEYS.CURRENT_STRATEGY] as StrategyDecision | undefined
    
    return {
      hasStrategy: !!strategy,
      hasContext: !!result[CACHE_KEYS.SYSTEM_CONTEXT],
      lastUpdate: result[CACHE_KEYS.LAST_UPDATE] || null,
      strategyId: strategy?.id,
      strategyValidUntil: strategy?.validUntil
    }
  } catch (error) {
    cacheLogger.error('获取缓存统计失败:', error)
    return {
      hasStrategy: false,
      hasContext: false,
      lastUpdate: null
    }
  }
}
