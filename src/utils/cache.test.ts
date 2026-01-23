/**
 * 智能缓存管理器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SmartCache } from './cache'

describe('SmartCache', () => {
  let cache: SmartCache<any>

  beforeEach(() => {
    cache = new SmartCache()
  })

  describe('get', () => {
    it('应该在首次访问时调用 fetcher', async () => {
      const fetcher = vi.fn().mockResolvedValue('test-data')
      
      const result = await cache.get('test-key', fetcher)
      
      expect(result).toBe('test-data')
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('应该在 TTL 内返回缓存数据而不调用 fetcher', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('first-call')
        .mockResolvedValueOnce('second-call')
      
      // 第一次调用
      const result1 = await cache.get('test-key', fetcher, 10)
      expect(result1).toBe('first-call')
      expect(fetcher).toHaveBeenCalledTimes(1)
      
      // 第二次调用（应该返回缓存）
      const result2 = await cache.get('test-key', fetcher, 10)
      expect(result2).toBe('first-call')
      expect(fetcher).toHaveBeenCalledTimes(1) // 不应该再次调用
    })

    it('应该在缓存过期后重新调用 fetcher', async () => {
      vi.useFakeTimers()
      
      const fetcher = vi.fn()
        .mockResolvedValueOnce('first-call')
        .mockResolvedValueOnce('second-call')
      
      // 第一次调用
      const result1 = await cache.get('test-key', fetcher, 1) // 1秒 TTL
      expect(result1).toBe('first-call')
      
      // 等待 2 秒（超过 TTL）
      vi.advanceTimersByTime(2000)
      
      // 第二次调用（缓存已过期）
      const result2 = await cache.get('test-key', fetcher, 1)
      expect(result2).toBe('second-call')
      expect(fetcher).toHaveBeenCalledTimes(2)
      
      vi.useRealTimers()
    })

    it('应该为不同的 key 独立缓存', async () => {
      const fetcher1 = vi.fn().mockResolvedValue('data-1')
      const fetcher2 = vi.fn().mockResolvedValue('data-2')
      
      const result1 = await cache.get('key-1', fetcher1)
      const result2 = await cache.get('key-2', fetcher2)
      
      expect(result1).toBe('data-1')
      expect(result2).toBe('data-2')
      expect(fetcher1).toHaveBeenCalledTimes(1)
      expect(fetcher2).toHaveBeenCalledTimes(1)
    })

    it('应该正确处理 fetcher 抛出的错误', async () => {
      const error = new Error('Fetch failed')
      const fetcher = vi.fn().mockRejectedValue(error)
      
      await expect(cache.get('test-key', fetcher)).rejects.toThrow('Fetch failed')
    })

    it('应该使用默认 TTL（300秒）', async () => {
      vi.useFakeTimers()
      
      const fetcher = vi.fn()
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second')
      
      await cache.get('test-key', fetcher) // 使用默认 TTL
      
      // 299 秒后应该还在缓存中
      vi.advanceTimersByTime(299 * 1000)
      await cache.get('test-key', fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      
      // 再过 2 秒（总共 301 秒）应该过期
      vi.advanceTimersByTime(2 * 1000)
      await cache.get('test-key', fetcher)
      expect(fetcher).toHaveBeenCalledTimes(2)
      
      vi.useRealTimers()
    })
  })

  describe('invalidate', () => {
    it('应该清除指定的缓存条目', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second')
      
      // 缓存数据
      await cache.get('test-key', fetcher)
      expect(fetcher).toHaveBeenCalledTimes(1)
      
      // 清除缓存
      cache.invalidate('test-key')
      
      // 再次获取（应该重新调用 fetcher）
      await cache.get('test-key', fetcher)
      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('应该只清除指定的 key，不影响其他缓存', async () => {
      const fetcher1 = vi.fn().mockResolvedValue('data-1')
      const fetcher2 = vi.fn().mockResolvedValue('data-2')
      
      await cache.get('key-1', fetcher1)
      await cache.get('key-2', fetcher2)
      
      cache.invalidate('key-1')
      
      // key-1 应该重新获取
      await cache.get('key-1', fetcher1)
      expect(fetcher1).toHaveBeenCalledTimes(2)
      
      // key-2 应该仍然使用缓存
      await cache.get('key-2', fetcher2)
      expect(fetcher2).toHaveBeenCalledTimes(1)
    })

    it('应该能处理不存在的 key', () => {
      // 不应该抛出错误
      expect(() => cache.invalidate('nonexistent-key')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('应该清除所有缓存', async () => {
      const fetcher1 = vi.fn().mockResolvedValue('data-1')
      const fetcher2 = vi.fn().mockResolvedValue('data-2')
      
      await cache.get('key-1', fetcher1)
      await cache.get('key-2', fetcher2)
      
      cache.clear()
      
      // 两个 key 都应该重新获取
      await cache.get('key-1', fetcher1)
      await cache.get('key-2', fetcher2)
      
      expect(fetcher1).toHaveBeenCalledTimes(2)
      expect(fetcher2).toHaveBeenCalledTimes(2)
    })

    it('清除后 getStats 应该返回空状态', async () => {
      const fetcher = vi.fn().mockResolvedValue('data')
      
      await cache.get('key-1', fetcher)
      await cache.get('key-2', fetcher)
      
      let stats = cache.getStats()
      expect(stats.size).toBe(2)
      
      cache.clear()
      
      stats = cache.getStats()
      expect(stats.size).toBe(0)
      expect(stats.keys).toEqual([])
    })
  })

  describe('getStats', () => {
    it('应该返回正确的缓存统计信息', async () => {
      const fetcher = vi.fn().mockResolvedValue('data')
      
      // 初始状态
      let stats = cache.getStats()
      expect(stats.size).toBe(0)
      expect(stats.keys).toEqual([])
      
      // 添加缓存
      await cache.get('key-1', fetcher)
      await cache.get('key-2', fetcher)
      await cache.get('key-3', fetcher)
      
      stats = cache.getStats()
      expect(stats.size).toBe(3)
      expect(stats.keys).toEqual(['key-1', 'key-2', 'key-3'])
    })

    it('应该在 invalidate 后更新统计信息', async () => {
      const fetcher = vi.fn().mockResolvedValue('data')
      
      await cache.get('key-1', fetcher)
      await cache.get('key-2', fetcher)
      
      cache.invalidate('key-1')
      
      const stats = cache.getStats()
      expect(stats.size).toBe(1)
      expect(stats.keys).toEqual(['key-2'])
    })
  })

  describe('并发场景', () => {
    it('应该正确处理同一 key 的并发请求', async () => {
      let callCount = 0
      const fetcher = vi.fn(async () => {
        callCount++
        // 模拟异步延迟
        await new Promise(resolve => setTimeout(resolve, 10))
        return `result-${callCount}`
      })
      
      // 同时发起多个请求
      const promises = [
        cache.get('test-key', fetcher),
        cache.get('test-key', fetcher),
        cache.get('test-key', fetcher)
      ]
      
      const results = await Promise.all(promises)
      
      // 由于缓存机制，fetcher 可能被调用多次（取决于时序）
      // 但至少应该都返回相同的结果类型
      expect(results[0]).toMatch(/^result-\d+$/)
      expect(results[1]).toMatch(/^result-\d+$/)
      expect(results[2]).toMatch(/^result-\d+$/)
    })
  })

  describe('类型安全', () => {
    it('应该正确处理不同类型的数据', async () => {
      const numberCache = new SmartCache<number>()
      const stringCache = new SmartCache<string>()
      const objectCache = new SmartCache<{ id: string; value: number }>()
      
      const numberResult = await numberCache.get('num', async () => 42)
      const stringResult = await stringCache.get('str', async () => 'hello')
      const objectResult = await objectCache.get('obj', async () => ({ id: 'test', value: 100 }))
      
      expect(typeof numberResult).toBe('number')
      expect(typeof stringResult).toBe('string')
      expect(typeof objectResult).toBe('object')
      expect(objectResult.id).toBe('test')
    })
  })
})
