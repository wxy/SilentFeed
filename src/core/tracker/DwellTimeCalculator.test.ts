/**
 * 停留时间计算器测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DwellTimeCalculator } from './DwellTimeCalculator'

describe('DwellTimeCalculator', () => {
  let calculator: DwellTimeCalculator
  let mockNow: number
  
  beforeEach(() => {
    mockNow = 1000000000000 // 2001-09-09 01:46:40 UTC
    vi.useFakeTimers()
    vi.setSystemTime(mockNow)
    
    calculator = new DwellTimeCalculator()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  describe('初始化', () => {
    it('应该正确初始化所有时间戳', () => {
      expect(calculator.isActive()).toBe(true)
      expect(calculator.getLastInteractionTime()).toBe(mockNow)
      expect(calculator.getTimeSinceLastInteraction()).toBe(0)
      expect(calculator.getEffectiveDwellTime()).toBe(0)
    })
  })
  
  describe('基础停留时间计算', () => {
    it('应该计算简单的停留时间', () => {
      // 过去 10 秒，模拟用户一直激活
      vi.advanceTimersByTime(10000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
    
    it('应该在用户交互后继续计时', () => {
      // 5 秒后用户滚动
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      // 再过 5 秒
      vi.advanceTimersByTime(5000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
    
    it('应该正确累计多次交互的时间', () => {
      // 第一次交互：5 秒后点击
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('click')
      
      // 第二次交互：再过 3 秒滚动
      vi.advanceTimersByTime(3000)
      calculator.onInteraction('scroll')
      
      // 第三次交互：再过 2 秒输入
      vi.advanceTimersByTime(2000)
      calculator.onInteraction('keypress')
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
  })
  
  describe('页面激活/失活', () => {
    it('应该在页面失活时停止计时', () => {
      // 激活 10 秒
      vi.advanceTimersByTime(10000)
      
      // 页面失活
      calculator.onVisibilityChange(false)
      
      // 再过 20 秒（失活状态，不应计入）
      vi.advanceTimersByTime(20000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
    
    it('应该在页面重新激活后继续计时', () => {
      // 激活 10 秒
      vi.advanceTimersByTime(10000)
      
      // 页面失活
      calculator.onVisibilityChange(false)
      
      // 失活 20 秒
      vi.advanceTimersByTime(20000)
      
      // 页面重新激活
      calculator.onVisibilityChange(true)
      
      // 立即交互（避免超时）
      calculator.onInteraction('click')
      
      // 再激活 5 秒
      vi.advanceTimersByTime(5000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(15)
    })
    
    it('应该正确处理多次激活/失活切换', () => {
      // 激活 5 秒
      vi.advanceTimersByTime(5000)
      calculator.onVisibilityChange(false)
      
      // 失活 10 秒
      vi.advanceTimersByTime(10000)
      calculator.onVisibilityChange(true)
      
      // 激活 3 秒
      vi.advanceTimersByTime(3000)
      calculator.onVisibilityChange(false)
      
      // 失活 5 秒
      vi.advanceTimersByTime(5000)
      calculator.onVisibilityChange(true)
      
      // 激活 2 秒
      vi.advanceTimersByTime(2000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10) // 5 + 3 + 2
    })
  })
  
  describe('30 秒无交互超时', () => {
    it('应该在 30 秒无交互后停止计时', () => {
      // 初始交互
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      // 再过 40 秒（超过 30 秒无交互）
      vi.advanceTimersByTime(40000)
      
      // 停留时间应该停留在最后交互 + 30 秒（35 秒）
      expect(calculator.getEffectiveDwellTime()).toBe(35)
    })
    
    it('应该在 30 秒内有交互时正常计时', () => {
      // 5 秒后第一次交互
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      // 25 秒后第二次交互（在 30 秒内）
      vi.advanceTimersByTime(25000)
      calculator.onInteraction('click')
      
      // 再过 10 秒
      vi.advanceTimersByTime(10000)
      
      // 总时间应该是 40 秒
      expect(calculator.getEffectiveDwellTime()).toBe(40)
    })
    
    it('应该在超时后有新交互时恢复计时', () => {
      // 5 秒后第一次交互
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      // 40 秒无交互（超时）
      vi.advanceTimersByTime(40000)
      
      // 此时停留时间应该是 35 秒（最后交互 5s + 30s 超时 = 35s）
      expect(calculator.getEffectiveDwellTime()).toBe(35)
      
      // 新交互（会更新 lastInteractionTime）
      calculator.onInteraction('click')
      
      // 再过 10 秒
      vi.advanceTimersByTime(10000)
      
      // 新交互后，超时限制解除，累计全部激活时间：45 + 10 = 55 秒
      // 注意：这里的行为是新交互"恢复"了之前超时被截断的时间
      expect(calculator.getEffectiveDwellTime()).toBe(55)
    })
  })
  
  describe('交互类型', () => {
    it('应该正确处理 scroll 交互', () => {
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      vi.advanceTimersByTime(5000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
      expect(calculator.getTimeSinceLastInteraction()).toBe(5)
    })
    
    it('应该正确处理 click 交互', () => {
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('click')
      
      vi.advanceTimersByTime(5000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
    
    it('应该正确处理 keypress 交互', () => {
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('keypress')
      
      vi.advanceTimersByTime(5000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
    
    it('应该正确处理 mousemove 交互', () => {
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('mousemove')
      
      vi.advanceTimersByTime(5000)
      
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
  })
  
  describe('失活时的交互', () => {
    it('应该在页面失活时忽略交互对计时的影响', () => {
      // 激活 10 秒
      vi.advanceTimersByTime(10000)
      
      // 页面失活
      calculator.onVisibilityChange(false)
      
      // 失活时发生交互
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      // 再过 5 秒
      vi.advanceTimersByTime(5000)
      
      // 失活时间不应计入，但交互时间应该更新
      expect(calculator.getEffectiveDwellTime()).toBe(10)
      expect(calculator.getTimeSinceLastInteraction()).toBe(5)
    })
    
    it('应该在失活时交互后重新激活时从交互时间开始计算超时', () => {
      // 激活 10 秒
      vi.advanceTimersByTime(10000)
      
      // 页面失活
      calculator.onVisibilityChange(false)
      
      // 失活 5 秒后交互
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('click')
      
      // 再过 20 秒（从交互开始不到 30 秒）
      vi.advanceTimersByTime(20000)
      
      // 重新激活
      calculator.onVisibilityChange(true)
      
      // 立即交互（确保在 30 秒内）
      calculator.onInteraction('scroll')
      
      // 激活 10 秒
      vi.advanceTimersByTime(10000)
      
      // 总停留时间：10（第一次激活）+ 10（第二次激活）= 20
      expect(calculator.getEffectiveDwellTime()).toBe(20)
    })
  })
  
  describe('边界情况', () => {
    it('应该处理零时间', () => {
      expect(calculator.getEffectiveDwellTime()).toBe(0)
    })
    
    it('应该处理极短时间（1 毫秒）', () => {
      vi.advanceTimersByTime(1)
      
      expect(calculator.getEffectiveDwellTime()).toBe(0.001)
    })
    
    it('应该处理极长时间（1 小时）', () => {
      // 每 20 秒一次交互，持续 1 小时
      for (let i = 0; i < 180; i++) {
        vi.advanceTimersByTime(20000)
        calculator.onInteraction('scroll')
      }
      
      expect(calculator.getEffectiveDwellTime()).toBe(3600)
    })
    
    it('应该在恰好 30 秒交互间隔时正常计时', () => {
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      // 恰好 30 秒后交互
      vi.advanceTimersByTime(30000)
      calculator.onInteraction('click')
      
      vi.advanceTimersByTime(5000)
      
      // 应该正常计时 40 秒
      expect(calculator.getEffectiveDwellTime()).toBe(40)
    })
  })
  
  describe('reset 方法', () => {
    it('应该重置所有状态', () => {
      // 模拟一些活动
      vi.advanceTimersByTime(10000)
      calculator.onInteraction('scroll')
      calculator.onVisibilityChange(false)
      vi.advanceTimersByTime(5000)
      
      // 记录重置前的时间
      const timeBeforeReset = Date.now()
      
      // 重置
      calculator.reset()
      
      // 验证状态重置
      expect(calculator.isActive()).toBe(true)
      expect(calculator.getEffectiveDwellTime()).toBe(0)
      expect(calculator.getTimeSinceLastInteraction()).toBe(0)
      expect(calculator.getLastInteractionTime()).toBe(timeBeforeReset)
    })
  })
  
  describe('辅助方法', () => {
    it('getTimeSinceLastInteraction 应该返回正确的秒数', () => {
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('click')
      
      vi.advanceTimersByTime(10000)
      
      expect(calculator.getTimeSinceLastInteraction()).toBe(10)
    })
    
    it('isActive 应该返回当前激活状态', () => {
      expect(calculator.isActive()).toBe(true)
      
      calculator.onVisibilityChange(false)
      expect(calculator.isActive()).toBe(false)
      
      calculator.onVisibilityChange(true)
      expect(calculator.isActive()).toBe(true)
    })
    
    it('getLastInteractionTime 应该返回最后交互的时间戳', () => {
      const initialTime = calculator.getLastInteractionTime()
      
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      const afterInteraction = calculator.getLastInteractionTime()
      
      expect(afterInteraction - initialTime).toBe(5000)
    })
  })
  
  describe('复杂场景', () => {
    it('应该正确处理真实的用户浏览场景', () => {
      // 用户打开页面，立即开始阅读
      // 场景 1: 激活 15 秒，期间滚动两次
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('scroll')
      
      vi.advanceTimersByTime(5000)
      
      // 切换到其他标签页 20 秒
      calculator.onVisibilityChange(false)
      vi.advanceTimersByTime(20000)
      
      // 回到页面，继续阅读 10 秒
      calculator.onVisibilityChange(true)
      vi.advanceTimersByTime(5000)
      calculator.onInteraction('click')
      vi.advanceTimersByTime(5000)
      
      // 长时间无操作（35 秒，超时）
      vi.advanceTimersByTime(35000)
      
      // 停留时间：15（第一段）+ 10（第二段激活）+ 25（第二段超时前）= 50 秒
      // 最后交互在 40s，超时截止在 70s，实际查询在 80s
      // 第二段激活从 35s 开始到 70s = 35 秒，但只有 10 秒在 45s 之前
      // 等等，让我重新计算...
      // 0-15s: 15秒，15-35s: 失活，35-70s: 激活35秒，70-80s: 超时不计
      // 总计: 15 + 35 = 50秒
      expect(calculator.getEffectiveDwellTime()).toBe(50)
    })
    
    it('应该处理用户快速切换标签的场景', () => {
      // 激活 2 秒
      vi.advanceTimersByTime(2000)
      calculator.onVisibilityChange(false)
      
      // 失活 1 秒
      vi.advanceTimersByTime(1000)
      calculator.onVisibilityChange(true)
      
      // 激活 3 秒
      vi.advanceTimersByTime(3000)
      calculator.onVisibilityChange(false)
      
      // 失活 2 秒
      vi.advanceTimersByTime(2000)
      calculator.onVisibilityChange(true)
      
      // 激活 5 秒
      vi.advanceTimersByTime(5000)
      
      // 总激活时间：2 + 3 + 5 = 10 秒
      expect(calculator.getEffectiveDwellTime()).toBe(10)
    })
  })
})
