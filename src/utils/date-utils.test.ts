/**
 * 日期工具函数测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCurrentMonthRange,
  getMonthRange,
  getCurrentMonthKey,
  isInCurrentMonth,
  getDaysPassedInMonth,
  getTotalDaysInMonth,
  getRemainingDaysInMonth
} from './date-utils'

describe('date-utils', () => {
  describe('getCurrentMonthRange', () => {
    it('应该返回当前月的起止时间戳', () => {
      // 模拟时间: 2025-12-15 14:30:00
      vi.setSystemTime(new Date('2025-12-15T14:30:00Z'))
      
      const range = getCurrentMonthRange()
      
      // 验证月初
      const startDate = new Date(range.start)
      expect(startDate.getFullYear()).toBe(2025)
      expect(startDate.getMonth()).toBe(11) // 0-based, 11 = December
      expect(startDate.getDate()).toBe(1)
      expect(startDate.getHours()).toBe(0)
      expect(startDate.getMinutes()).toBe(0)
      
      // 验证月末
      const endDate = new Date(range.end)
      expect(endDate.getFullYear()).toBe(2025)
      expect(endDate.getMonth()).toBe(11)
      expect(endDate.getDate()).toBe(31)
      expect(endDate.getHours()).toBe(23)
      expect(endDate.getMinutes()).toBe(59)
      
      vi.useRealTimers()
    })
    
    it('应该正确处理2月（平年）', () => {
      // 2025年是平年（365天）
      vi.setSystemTime(new Date('2025-02-15T12:00:00Z'))
      
      const range = getCurrentMonthRange()
      const endDate = new Date(range.end)
      
      expect(endDate.getDate()).toBe(28) // 2025年2月有28天
      
      vi.useRealTimers()
    })
    
    it('应该正确处理2月（闰年）', () => {
      // 2024年是闰年
      vi.setSystemTime(new Date('2024-02-15T12:00:00Z'))
      
      const range = getCurrentMonthRange()
      const endDate = new Date(range.end)
      
      expect(endDate.getDate()).toBe(29) // 2024年2月有29天
      
      vi.useRealTimers()
    })
    
    it('应该正确处理跨年（1月）', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
      
      const range = getCurrentMonthRange()
      const startDate = new Date(range.start)
      const endDate = new Date(range.end)
      
      expect(startDate.getMonth()).toBe(0) // January
      expect(endDate.getMonth()).toBe(0)
      expect(endDate.getDate()).toBe(31)
      
      vi.useRealTimers()
    })
  })
  
  describe('getMonthRange', () => {
    it('应该返回指定月份的起止时间戳', () => {
      const range = getMonthRange(2025, 11) // 2025年11月
      
      const startDate = new Date(range.start)
      expect(startDate.getFullYear()).toBe(2025)
      expect(startDate.getMonth()).toBe(10) // 0-based, 10 = November
      expect(startDate.getDate()).toBe(1)
      
      const endDate = new Date(range.end)
      expect(endDate.getDate()).toBe(30) // 11月有30天
    })
    
    it('应该正确处理12月', () => {
      const range = getMonthRange(2025, 12)
      
      const startDate = new Date(range.start)
      expect(startDate.getMonth()).toBe(11) // December
      
      const endDate = new Date(range.end)
      expect(endDate.getDate()).toBe(31)
    })
    
    it('应该正确处理闰年2月', () => {
      const range = getMonthRange(2024, 2)
      
      const endDate = new Date(range.end)
      expect(endDate.getDate()).toBe(29)
    })
  })
  
  describe('getCurrentMonthKey', () => {
    it('应该返回 YYYY-MM 格式的月份标识', () => {
      vi.setSystemTime(new Date('2025-12-15T12:00:00Z'))
      
      expect(getCurrentMonthKey()).toBe('2025-12')
      
      vi.useRealTimers()
    })
    
    it('应该正确补零（1-9月）', () => {
      vi.setSystemTime(new Date('2025-05-15T12:00:00Z'))
      
      expect(getCurrentMonthKey()).toBe('2025-05')
      
      vi.useRealTimers()
    })
  })
  
  describe('isInCurrentMonth', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2025-12-15T12:00:00Z'))
    })
    
    afterEach(() => {
      vi.useRealTimers()
    })
    
    it('应该识别本月时间戳', () => {
      const timestamp = new Date('2025-12-20T10:00:00').getTime()
      expect(isInCurrentMonth(timestamp)).toBe(true)
    })
    
    it('应该识别月初时间戳', () => {
      const timestamp = new Date('2025-12-01T00:00:00').getTime()
      expect(isInCurrentMonth(timestamp)).toBe(true)
    })
    
    it('应该识别月末时间戳', () => {
      const timestamp = new Date('2025-12-31T23:59:59').getTime()
      expect(isInCurrentMonth(timestamp)).toBe(true)
    })
    
    it('应该拒绝上个月时间戳', () => {
      const timestamp = new Date('2025-11-30T23:59:59').getTime()
      expect(isInCurrentMonth(timestamp)).toBe(false)
    })
    
    it('应该拒绝下个月时间戳', () => {
      const timestamp = new Date('2026-01-01T00:00:00').getTime()
      expect(isInCurrentMonth(timestamp)).toBe(false)
    })
  })
  
  describe('getDaysPassedInMonth', () => {
    it('应该返回本月已过天数（含今天）', () => {
      vi.setSystemTime(new Date('2025-12-08T12:00:00Z'))
      
      expect(getDaysPassedInMonth()).toBe(8)
      
      vi.useRealTimers()
    })
    
    it('应该在月初返回1', () => {
      vi.setSystemTime(new Date('2025-12-01T00:00:00Z'))
      
      expect(getDaysPassedInMonth()).toBe(1)
      
      vi.useRealTimers()
    })
    
    it('应该在月末返回正确天数', () => {
      vi.setSystemTime(new Date('2025-12-31T23:59:59'))
      
      expect(getDaysPassedInMonth()).toBe(31)
      
      vi.useRealTimers()
    })
  })
  
  describe('getTotalDaysInMonth', () => {
    it('应该返回本月总天数（31天）', () => {
      vi.setSystemTime(new Date('2025-12-15T12:00:00Z'))
      
      expect(getTotalDaysInMonth()).toBe(31)
      
      vi.useRealTimers()
    })
    
    it('应该返回30天的月份', () => {
      vi.setSystemTime(new Date('2025-11-15T12:00:00Z'))
      
      expect(getTotalDaysInMonth()).toBe(30)
      
      vi.useRealTimers()
    })
    
    it('应该返回2月天数（平年）', () => {
      vi.setSystemTime(new Date('2025-02-15T12:00:00Z'))
      
      expect(getTotalDaysInMonth()).toBe(28)
      
      vi.useRealTimers()
    })
    
    it('应该返回2月天数（闰年）', () => {
      vi.setSystemTime(new Date('2024-02-15T12:00:00Z'))
      
      expect(getTotalDaysInMonth()).toBe(29)
      
      vi.useRealTimers()
    })
  })
  
  describe('getRemainingDaysInMonth', () => {
    it('应该返回本月剩余天数（不含今天）', () => {
      vi.setSystemTime(new Date('2025-12-08T12:00:00Z'))
      
      // 12月有31天，今天是8号，剩余 31 - 8 = 23天
      expect(getRemainingDaysInMonth()).toBe(23)
      
      vi.useRealTimers()
    })
    
    it('应该在月末返回0', () => {
      vi.setSystemTime(new Date('2025-12-31T23:59:59'))
      
      expect(getRemainingDaysInMonth()).toBe(0)
      
      vi.useRealTimers()
    })
    
    it('应该在月初返回最大值', () => {
      vi.setSystemTime(new Date('2025-12-01T00:00:00Z'))
      
      expect(getRemainingDaysInMonth()).toBe(30)
      
      vi.useRealTimers()
    })
  })
})
