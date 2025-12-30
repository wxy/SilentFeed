/**
 * 系统阈值配置
 * 
 * 存储在 chrome.storage.local（设备特定）
 * 支持根据设备使用情况动态调整
 */

import { logger } from '@/utils/logger'

const thresholdsLogger = logger.withTag('SystemThresholds')

const STORAGE_KEY = 'systemThresholds'
const CACHE_DURATION = 5 * 60 * 1000 // 5 分钟缓存

// 内存缓存
let cachedThresholds: SystemThresholds | null = null
let cacheTimestamp: number = 0

/**
 * 系统阈值配置接口
 */
export interface SystemThresholds {
  /**
   * 学习阶段完成所需页面数
   */
  learningCompletePages: number
  
  /**
   * Feed 抓取间隔阈值（小时）
   */
  feedFetchIntervals: {
    /** 高频源（≥7 篇/周）*/
    highFrequency: number
    /** 中频源（3-7 篇/周）*/
    mediumFrequency: number
    /** 低频源（1-2 篇/周）*/
    lowFrequency: number
    /** 超低频源（<1 篇/周）*/
    ultraLowFrequency: number
  }
  
  /**
   * 推荐生成间隔阈值（分钟）
   */
  recommendationIntervals: {
    /** 待推荐 ≥20 条 */
    veryHigh: number
    /** 待推荐 10-19 条 */
    high: number
    /** 待推荐 5-9 条 */
    medium: number
    /** 待推荐 1-4 条 */
    low: number
    /** 待推荐 0 条 */
    idle: number
  }
  
  /**
   * 推荐质量阈值
   */
  recommendationQuality: {
    /** 推荐池最低质量分数（0-1）*/
    minQualityScore: number
    /** TF-IDF 最低分数（0-1）*/
    minTfidfScore: number
  }
  
  /**
   * 通知阈值
   */
  notification: {
    /** 最小间隔（分钟）*/
    minIntervalMinutes: number
  }
  
  /**
   * UI 相关阈值
   */
  ui: {
    /** RSS 列表最大显示数量 */
    maxVisibleFeeds: number
    /** 冷启动阶段阈值 */
    coldStartStages: Array<{
      ratio: number
      title: string
    }>
  }
  
  /**
   * 缓存阈值
   */
  cache: {
    /** 统计缓存过期时间（毫秒）*/
    statsExpiration: number
  }
  
  /**
   * 容错阈值
   */
  resilience: {
    /** 熔断器失败阈值 */
    circuitBreakerFailures: number
    /** 熔断器重置超时（毫秒）*/
    circuitBreakerResetMs: number
    /** 指数退避最大重试次数 */
    maxRetries: number
  }
}

/**
 * 默认系统阈值
 */
export const DEFAULT_SYSTEM_THRESHOLDS: SystemThresholds = {
  learningCompletePages: 100,
  
  feedFetchIntervals: {
    highFrequency: 6,
    mediumFrequency: 12,
    lowFrequency: 24,
    ultraLowFrequency: 168
  },
  
  recommendationIntervals: {
    veryHigh: 1,
    high: 3,
    medium: 5,
    low: 10,
    idle: 20
  },
  
  recommendationQuality: {
    minQualityScore: 0.6,
    minTfidfScore: 0.1
  },
  
  notification: {
    minIntervalMinutes: 60
  },
  
  ui: {
    maxVisibleFeeds: 50,
    coldStartStages: [
      { ratio: 0, title: '刚起步' },
      { ratio: 0.2, title: '初步了解' },
      { ratio: 0.5, title: '深入探索' },
      { ratio: 0.8, title: '即将完成' },
      { ratio: 1.0, title: '准备就绪' }
    ]
  },
  
  cache: {
    statsExpiration: 30000
  },
  
  resilience: {
    circuitBreakerFailures: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3
  }
}

/**
 * 深度合并对象
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target }
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      // @ts-ignore
      result[key] = deepMerge(result[key] || {}, source[key])
    } else if (source[key] !== undefined) {
      // @ts-ignore
      result[key] = source[key]
    }
  }
  
  return result
}

/**
 * 获取系统阈值配置（带缓存和兜底）
 * 
 * 策略：
 * 1. 优先使用内存缓存（5 分钟内有效）
 * 2. 从 chrome.storage.local 读取
 * 3. 如果不存在或读取失败，使用默认值
 * 4. 自动保存默认值到 storage（初始化）
 */
export async function getSystemThresholds(): Promise<SystemThresholds> {
  // 1. 检查内存缓存
  const now = Date.now()
  if (cachedThresholds && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedThresholds
  }
  
  try {
    // 2. 从 storage 读取
    const result = await chrome.storage.local.get(STORAGE_KEY)
    
    if (result[STORAGE_KEY]) {
      // 合并默认值（处理新增字段）
      const merged = deepMerge(DEFAULT_SYSTEM_THRESHOLDS, result[STORAGE_KEY])
      
      // 更新缓存
      cachedThresholds = merged
      cacheTimestamp = now
      
      return merged
    }
    
    // 3. 不存在时初始化默认值
    await chrome.storage.local.set({ 
      [STORAGE_KEY]: DEFAULT_SYSTEM_THRESHOLDS 
    })
    
    cachedThresholds = DEFAULT_SYSTEM_THRESHOLDS
    cacheTimestamp = now
    
    thresholdsLogger.info('✅ 已初始化默认系统阈值')
    return DEFAULT_SYSTEM_THRESHOLDS
    
  } catch (error) {
    // 4. 兜底：读取失败时使用默认值
    thresholdsLogger.warn('加载系统阈值失败，使用默认值:', error)
    return DEFAULT_SYSTEM_THRESHOLDS
  }
}

/**
 * 更新系统阈值（部分更新）
 */
export async function updateSystemThresholds(
  updates: Partial<SystemThresholds>
): Promise<void> {
  try {
    const current = await getSystemThresholds()
    const merged = deepMerge(current, updates)
    
    await chrome.storage.local.set({ [STORAGE_KEY]: merged })
    
    // 更新缓存
    cachedThresholds = merged
    cacheTimestamp = Date.now()
    
    thresholdsLogger.info('✅ 系统阈值已更新', updates)
  } catch (error) {
    thresholdsLogger.error('❌ 更新系统阈值失败:', error)
    throw error
  }
}

/**
 * 重置为默认阈值
 */
export async function resetSystemThresholds(): Promise<void> {
  try {
    await chrome.storage.local.set({ 
      [STORAGE_KEY]: DEFAULT_SYSTEM_THRESHOLDS 
    })
    
    // 清除缓存
    cachedThresholds = null
    cacheTimestamp = 0
    
    thresholdsLogger.info('✅ 系统阈值已重置为默认值')
  } catch (error) {
    thresholdsLogger.error('❌ 重置系统阈值失败:', error)
    throw error
  }
}

/**
 * 清除内存缓存（强制下次重新读取）
 */
export function invalidateThresholdsCache(): void {
  cachedThresholds = null
  cacheTimestamp = 0
  thresholdsLogger.debug('已清除系统阈值缓存')
}
