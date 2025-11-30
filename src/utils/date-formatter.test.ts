/**
 * 日期时间格式化工具测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getDateLocale,
  formatDateTime,
  formatDate,
  formatTime,
  formatRelativeTime,
  formatMonthDay
} from './date-formatter'
import i18n from '@/i18n'

describe('date-formatter', () => {
  beforeEach(() => {
    // 重置 i18n 语言
    vi.clearAllMocks()
  })

  describe('getDateLocale', () => {
    it('应该在中文环境返回 zh-CN', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      expect(getDateLocale()).toBe('zh-CN')
    })

    it('应该在英文环境返回 en-US', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      expect(getDateLocale()).toBe('en-US')
    })

    it('应该在未知语言时回退到 en-US', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('fr')
      expect(getDateLocale()).toBe('en-US')
    })
  })

  describe('formatDateTime', () => {
    const testDate = new Date('2025-11-30T22:30:15')

    it('应该格式化完整日期时间（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const result = formatDateTime(testDate)
      
      // 中文格式应该包含年月日时分秒
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('30')
      expect(result).toContain('22')
      expect(result).toContain('30')
      expect(result).toContain('15')
    })

    it('应该格式化完整日期时间（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const result = formatDateTime(testDate)
      
      // 英文格式应该包含月/日/年 和 时间
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('30')
      // 英文使用12小时制，所以应该有 PM
      expect(result.toLowerCase()).toContain('pm')
    })

    it('应该接受时间戳参数', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const timestamp = testDate.getTime()
      const result = formatDateTime(timestamp)
      
      expect(result).toContain('2025')
    })

    it('应该支持自定义格式选项', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const result = formatDateTime(testDate, {
        year: 'numeric',
        month: 'long'
      })
      
      expect(result).toContain('2025')
      expect(result).toContain('11月')
    })
  })

  describe('formatDate', () => {
    const testDate = new Date('2025-11-30T22:30:15')

    it('应该格式化日期（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const result = formatDate(testDate)
      
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('30')
      // 不应该包含时间
      expect(result).not.toContain('22')
    })

    it('应该格式化日期（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const result = formatDate(testDate)
      
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('30')
    })

    it('应该接受时间戳参数', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const timestamp = testDate.getTime()
      const result = formatDate(timestamp)
      
      expect(result).toContain('2025')
      expect(result).toContain('11')
      expect(result).toContain('30')
    })
  })

  describe('formatTime', () => {
    const testDate = new Date('2025-11-30T22:30:15')

    it('应该格式化时间（中文，24小时制）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const result = formatTime(testDate)
      
      expect(result).toContain('22')
      expect(result).toContain('30')
      expect(result).toContain('15')
      // 中文使用24小时制，不应该有 AM/PM
      expect(result.toLowerCase()).not.toContain('pm')
    })

    it('应该格式化时间（英文，12小时制）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const result = formatTime(testDate)
      
      // 22:30 应该显示为 10:30 PM
      expect(result).toContain('10')
      expect(result).toContain('30')
      expect(result.toLowerCase()).toContain('pm')
    })
  })

  describe('formatRelativeTime', () => {
    const now = new Date('2025-11-30T22:30:15')

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('应该显示"刚刚"（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const recent = new Date(now.getTime() - 30 * 1000) // 30秒前
      
      expect(formatRelativeTime(recent)).toBe('刚刚')
    })

    it('应该显示"just now"（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const recent = new Date(now.getTime() - 30 * 1000)
      
      expect(formatRelativeTime(recent)).toBe('just now')
    })

    it('应该显示分钟前（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const minutes = new Date(now.getTime() - 5 * 60 * 1000) // 5分钟前
      
      expect(formatRelativeTime(minutes)).toBe('5分钟前')
    })

    it('应该显示 minutes ago（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const minutes = new Date(now.getTime() - 5 * 60 * 1000)
      
      expect(formatRelativeTime(minutes)).toBe('5 minutes ago')
    })

    it('应该显示小时前（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const hours = new Date(now.getTime() - 3 * 60 * 60 * 1000) // 3小时前
      
      expect(formatRelativeTime(hours)).toBe('3小时前')
    })

    it('应该显示 hours ago（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const hours = new Date(now.getTime() - 3 * 60 * 60 * 1000)
      
      expect(formatRelativeTime(hours)).toBe('3 hours ago')
    })

    it('应该显示天前（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const days = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // 2天前
      
      expect(formatRelativeTime(days)).toBe('2天前')
    })

    it('应该显示 days ago（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const days = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      
      expect(formatRelativeTime(days)).toBe('2 days ago')
    })

    it('应该在超过7天时显示完整日期', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const longAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) // 10天前
      
      const result = formatRelativeTime(longAgo)
      // 应该是完整日期格式
      expect(result).toContain('2025')
      expect(result).toContain('11')
    })
  })

  describe('formatMonthDay', () => {
    const testDate = new Date('2025-11-30T22:30:15')

    it('应该格式化月日（中文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
      const result = formatMonthDay(testDate)
      
      expect(result).toContain('11月')
      expect(result).toContain('30')
      // 不应该包含年份
      expect(result).not.toContain('2025')
    })

    it('应该格式化月日（英文）', () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const result = formatMonthDay(testDate)
      
      expect(result).toContain('November')
      expect(result).toContain('30')
      // 不应该包含年份
      expect(result).not.toContain('2025')
    })
  })
})
