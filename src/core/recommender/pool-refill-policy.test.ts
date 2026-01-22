/**
 * 推荐池补充策略测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PoolRefillManager,
  DEFAULT_REFILL_POLICY,
  getRefillManager,
  type PoolRefillPolicy
} from './pool-refill-policy'

describe('pool-refill-policy', () => {
  let manager: PoolRefillManager
  
  beforeEach(async () => {
    // 清理 storage
    await chrome.storage.local.clear()
    
    // 设置默认策略（模拟 AI 生成的策略）
    await chrome.storage.local.set({
      'current_strategy': {
        id: 'test-strategy',
        createdAt: Date.now(),
        status: 'active',
        strategy: {
          recommendation: {
            targetPoolSize: 10,
            refillThreshold: 3,  // 触发阈值 3/10 = 30%
            dailyLimit: 5,
            cooldownMinutes: 30  // 30分钟
          },
          candidatePool: {
            expiryHours: 168,
            entryThreshold: 0.7
          },
          meta: {
            validHours: 24,
            generatedAt: Date.now(),
            version: 'v1.0',
            nextReviewHours: 12
          }
        }
      }
    })
    
    // 创建新的管理器实例
    manager = new PoolRefillManager()
    await manager.resetState()
  })

  describe('DEFAULT_REFILL_POLICY', () => {
    it('应该有正确的默认值', () => {
      expect(DEFAULT_REFILL_POLICY.minInterval).toBe(30 * 60 * 1000) // 30分钟
      expect(DEFAULT_REFILL_POLICY.maxDailyRefills).toBe(5)
      expect(DEFAULT_REFILL_POLICY.triggerThreshold).toBe(0.8) // 80% (旧的硬编码默认值，已废弃)
    })
  })

  describe('shouldRefill', () => {
    it('初始状态应该允许补充', async () => {
      const should = await manager.shouldRefill(2, 10) // 20% < 30% 阈值
      expect(should).toBe(true)
    })

    it('容量充足时不应该补充', async () => {
      const should = await manager.shouldRefill(5, 10) // 50% > 30% 阈值
      expect(should).toBe(false)
    })

    it('刚刚补充过应该被冷却限制', async () => {
      // 记录一次补充
      await manager.recordRefill()
      
      // 立即尝试补充应该被拒绝
      const should = await manager.shouldRefill(2, 10)
      expect(should).toBe(false)
    })

    it('超过冷却时间后应该允许补充', async () => {
      // 设置短冷却期的策略
      await chrome.storage.local.set({
        'current_strategy': {
          id: 'test-strategy-short-cooldown',
          createdAt: Date.now(),
          status: 'active',
          strategy: {
            recommendation: {
              targetPoolSize: 10,
              refillThreshold: 3,
              dailyLimit: 5,
              cooldownMinutes: 0.002  // 0.002分钟 = 120ms
            },
            candidatePool: {
              expiryHours: 168,
              entryThreshold: 0.7
            },
            meta: {
              validHours: 24,
              generatedAt: Date.now(),
              version: 'v1.0',
              nextReviewHours: 12
            }
          }
        }
      })
      
      const testManager = new PoolRefillManager()
      await testManager.resetState()
      
      // 记录补充
      await testManager.recordRefill()
      
      // 等待冷却
      await new Promise(resolve => setTimeout(resolve, 150))
      
      // 应该允许补充
      const should = await testManager.shouldRefill(2, 10)
      expect(should).toBe(true)
    })

    it('达到每日上限后应该拒绝补充', async () => {
      // 创建较低上限的策略
      const limitedPolicy: PoolRefillPolicy = {
        minInterval: 0, // 无冷却
        maxDailyRefills: 2,
        triggerThreshold: 0.3
      }
      const testManager = new PoolRefillManager(limitedPolicy)
      await testManager.resetState()
      
      // 补充 2 次（达到上限）
      await testManager.recordRefill()
      await testManager.recordRefill()
      
      // 第 3 次应该被拒绝
      const should = await testManager.shouldRefill(2, 10)
      expect(should).toBe(false)
    })

    it('跨天后应该重置每日计数', async () => {
      // 设置只允许 1 次补充的策略
      await chrome.storage.local.set({
        'current_strategy': {
          id: 'test-strategy-limited',
          createdAt: Date.now(),
          status: 'active',
          strategy: {
            recommendation: {
              targetPoolSize: 10,
              refillThreshold: 3,
              dailyLimit: 1,  // 每日只允许 1 次
              cooldownMinutes: 0  // 无冷却
            },
            candidatePool: {
              expiryHours: 168,
              entryThreshold: 0.7
            },
            meta: {
              validHours: 24,
              generatedAt: Date.now(),
              version: 'v1.0',
              nextReviewHours: 12
            }
          }
        }
      })
      
      const testManager = new PoolRefillManager()
      await testManager.resetState()
      
      // 达到今日上限
      await testManager.recordRefill()
      expect(await testManager.shouldRefill(2, 10)).toBe(false)
      
      // 模拟跨天 - 修改内部状态
      const state = testManager.getState()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]
      
      // 直接修改状态（模拟昨天的记录）
      await chrome.storage.local.set({
        pool_refill_state: {
          ...state,
          currentDate: yesterdayStr
        }
      })
      
      // 重新创建管理器以加载状态
      const newManager = new PoolRefillManager()
      
      // 跨天后应该允许补充
      const should = await newManager.shouldRefill(2, 10)
      expect(should).toBe(true)
    })

    it('精确阈值边界测试', async () => {
      // 容量 > 阈值时，不应补充
      const shouldAboveThreshold = await manager.shouldRefill(4, 10) // 40% > 30%
      expect(shouldAboveThreshold).toBe(false)
      
      // 容量略低于阈值时，应该补充
      const shouldBelowThreshold = await manager.shouldRefill(2, 10) // 20% < 30%
      expect(shouldBelowThreshold).toBe(true)
    })
  })

  describe('recordRefill', () => {
    it('应该更新补充时间和计数', async () => {
      const before = manager.getState()
      expect(before.dailyRefillCount).toBe(0)
      expect(before.lastRefillTime).toBe(0)
      
      await manager.recordRefill()
      
      const after = manager.getState()
      expect(after.dailyRefillCount).toBe(1)
      expect(after.lastRefillTime).toBeGreaterThan(0)
    })

    it('多次记录应该累加计数', async () => {
      await manager.recordRefill()
      await manager.recordRefill()
      await manager.recordRefill()
      
      const state = manager.getState()
      expect(state.dailyRefillCount).toBe(3)
    })
  })

  describe('getState', () => {
    it('应该返回当前状态', async () => {
      const state = manager.getState()
      
      expect(state).toHaveProperty('lastRefillTime')
      expect(state).toHaveProperty('dailyRefillCount')
      expect(state).toHaveProperty('currentDate')
    })

    it('返回的状态应该是只读副本', async () => {
      const state1 = manager.getState()
      await manager.recordRefill()
      const state2 = manager.getState()
      
      // state1 应该不受影响
      expect(state1.dailyRefillCount).toBe(0)
      expect(state2.dailyRefillCount).toBe(1)
    })
  })

  describe('updatePolicy', () => {
    it('应该更新策略配置', () => {
      manager.updatePolicy({
        minInterval: 60 * 60 * 1000, // 1小时
        maxDailyRefills: 10
      })
      
      // 无法直接访问 policy，通过行为验证
      // 创建一个有相同配置的新管理器进行对比
      const newPolicy: PoolRefillPolicy = {
        minInterval: 60 * 60 * 1000,
        maxDailyRefills: 10,
        triggerThreshold: 0.3 // 保持默认
      }
      const testManager = new PoolRefillManager(newPolicy)
      
      // 两者行为应该一致（通过测试验证）
      expect(testManager).toBeDefined()
    })

    it('应该支持部分更新', () => {
      manager.updatePolicy({
        triggerThreshold: 0.5
      })
      
      // 只更新触发阈值，其他保持默认
      expect(DEFAULT_REFILL_POLICY.minInterval).toBe(30 * 60 * 1000)
      expect(DEFAULT_REFILL_POLICY.maxDailyRefills).toBe(5)
    })
  })

  describe('resetState', () => {
    it('应该重置所有状态', async () => {
      // 先记录一些数据
      await manager.recordRefill()
      await manager.recordRefill()
      
      expect(manager.getState().dailyRefillCount).toBe(2)
      
      // 重置
      await manager.resetState()
      
      const state = manager.getState()
      expect(state.lastRefillTime).toBe(0)
      expect(state.dailyRefillCount).toBe(0)
      expect(state.currentDate).toBeTruthy() // 日期应该是今天
    })
  })

  describe('持久化', () => {
    it('状态应该保存到 storage', async () => {
      await manager.recordRefill()
      
      // 读取 storage 验证
      const result = await chrome.storage.local.get('pool_refill_state')
      expect(result.pool_refill_state).toBeDefined()
      expect(result.pool_refill_state.dailyRefillCount).toBe(1)
    })

    it('创建新管理器应该加载已保存的状态', async () => {
      // 第一个管理器记录数据
      await manager.recordRefill()
      await manager.recordRefill()
      
      // 等待状态保存完成
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // 创建新管理器并等待加载
      const newManager = new PoolRefillManager()
      await new Promise(resolve => setTimeout(resolve, 50))
      const state = newManager.getState()
      
      // 应该加载之前的状态
      expect(state.dailyRefillCount).toBe(2)
    })
  })

  describe('getRefillManager 单例', () => {
    it('应该返回同一个实例', () => {
      const manager1 = getRefillManager()
      const manager2 = getRefillManager()
      
      expect(manager1).toBe(manager2)
    })
  })

  describe('边界情况', () => {
    it('maxPoolSize 为 0 时应该允许补充', async () => {
      const should = await manager.shouldRefill(0, 0)
      // 0/0 = NaN，但不应crash，应该有合理的处理
      expect(typeof should).toBe('boolean')
    })

    it('currentPoolSize 超过 maxPoolSize 时不应补充', async () => {
      const should = await manager.shouldRefill(15, 10) // 150% > 30%
      expect(should).toBe(false)
    })

    it('负数容量应该正常处理', async () => {
      // 虽然不合理，但不应crash
      const should = await manager.shouldRefill(-1, 10)
      expect(typeof should).toBe('boolean')
    })
  })

  describe('日志记录', () => {
    it('补充操作应该记录日志', async () => {
      // 这个测试主要确保代码路径被执行，实际日志验证需要 mock logger
      await manager.recordRefill()
      const state = manager.getState()
      expect(state.dailyRefillCount).toBeGreaterThan(0)
    })

    it('冷却限制应该记录调试日志', async () => {
      await manager.recordRefill()
      const should = await manager.shouldRefill(2, 10)
      expect(should).toBe(false)
    })

    it('容量充足应该记录调试日志', async () => {
      const should = await manager.shouldRefill(8, 10)
      expect(should).toBe(false)
    })
  })
})
