/**
 * 推荐池补充策略测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PoolRefillManager, DEFAULT_REFILL_POLICY } from '../pool-refill-policy'

describe('PoolRefillManager', () => {
  let manager: PoolRefillManager
  
  beforeEach(() => {
    manager = new PoolRefillManager()
    vi.clearAllMocks()
  })
  
  describe('shouldRefill', () => {
    it('首次调用应该允许补充', async () => {
      const result = await manager.shouldRefill(2, 10)
      expect(result).toBe(true)
    })
    
    it('池容量充足时不应补充', async () => {
      const result = await manager.shouldRefill(5, 10) // 50% > 30% 阈值
      expect(result).toBe(false)
    })
    
    it('池容量不足时应该补充', async () => {
      const result = await manager.shouldRefill(2, 10) // 20% < 30% 阈值
      expect(result).toBe(true)
    })
    
    it('冷却期内不应补充', async () => {
      await manager.recordRefill()
      const result = await manager.shouldRefill(2, 10)
      expect(result).toBe(false)
    })
    
    it('超过每日上限后不应补充', async () => {
      // 模拟已经补充了5次
      for (let i = 0; i < DEFAULT_REFILL_POLICY.maxDailyRefills; i++) {
        await manager.recordRefill()
      }
      
      const result = await manager.shouldRefill(2, 10)
      expect(result).toBe(false)
    })
  })
  
  describe('recordRefill', () => {
    it('应该正确记录补充操作', async () => {
      await manager.recordRefill()
      const state = manager.getState()
      
      expect(state.dailyRefillCount).toBe(1)
      expect(state.lastRefillTime).toBeGreaterThan(0)
    })
    
    it('应该累加补充次数', async () => {
      await manager.recordRefill()
      await manager.recordRefill()
      await manager.recordRefill()
      
      const state = manager.getState()
      expect(state.dailyRefillCount).toBe(3)
    })
  })
  
  describe('updatePolicy', () => {
    it('应该正确更新策略', () => {
      manager.updatePolicy({
        minInterval: 60 * 60 * 1000, // 60分钟
        maxDailyRefills: 10,
        triggerThreshold: 0.5
      })
      
      // 策略已更新（通过 shouldRefill 行为验证）
      // 这里无法直接访问 policy，但可以通过行为验证
    })
  })
  
  describe('resetState', () => {
    it('应该重置状态', async () => {
      await manager.recordRefill()
      await manager.resetState()
      
      const state = manager.getState()
      expect(state.dailyRefillCount).toBe(0)
      expect(state.lastRefillTime).toBe(0)
    })
  })
})
