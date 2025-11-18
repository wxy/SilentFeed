/**
 * 智能缓存管理器
 * 
 * 提供内存缓存 + TTL 过期机制，用于减少重复的数据库查询
 * 
 * @example
 * ```typescript
 * import { statsCache } from '@/utils/cache'
 * 
 * // 使用缓存
 * const stats = await statsCache.get(
 *   'recommendation-stats',
 *   async () => {
 *     // 实际的查询逻辑
 *     return await db.recommendations.count()
 *   },
 *   300  // 5 分钟 TTL
 * )
 * 
 * // 清除缓存
 * statsCache.invalidate('recommendation-stats')
 * ```
 */

import { logger } from './logger'

const cacheLogger = logger.withTag('Cache')

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T
  expiry: number
}

/**
 * 智能缓存类
 */
export class SmartCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>()

  /**
   * 获取缓存数据（如果过期则重新获取）
   * 
   * @param key - 缓存键
   * @param fetcher - 数据获取函数
   * @param ttl - 缓存有效期（秒），默认 300 秒（5 分钟）
   * @returns 缓存或新获取的数据
   */
  async get(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    // 检查缓存
    const cached = this.cache.get(key)
    if (cached && Date.now() < cached.expiry) {
      cacheLogger.debug(`缓存命中: ${key}`)
      return cached.data
    }

    // 缓存过期或不存在，重新获取
    cacheLogger.debug(`缓存未命中，重新获取: ${key}`)
    const fresh = await fetcher()

    // 存入缓存
    this.cache.set(key, {
      data: fresh,
      expiry: Date.now() + ttl * 1000
    })

    return fresh
  }

  /**
   * 清除指定缓存
   * 
   * @param key - 缓存键
   */
  invalidate(key: string): void {
    cacheLogger.debug(`清除缓存: ${key}`)
    this.cache.delete(key)
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    cacheLogger.debug('清除所有缓存')
    this.cache.clear()
  }

  /**
   * 获取缓存状态（用于调试）
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

/**
 * 全局统计缓存实例
 * 
 * 用于缓存推荐统计、用户画像统计等频繁查询的数据
 */
export const statsCache = new SmartCache()
