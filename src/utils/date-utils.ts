/**
 * 日期工具函数
 * 
 * 提供自然月周期相关的时间计算
 */

/**
 * 获取当前自然月的起止时间戳
 * 
 * @returns { start: 月初0点时间戳, end: 月末23:59:59时间戳 }
 * 
 * @example
 * // 2025-12-08 调用
 * getCurrentMonthRange() // { start: 2025-12-01 00:00:00, end: 2025-12-31 23:59:59 }
 */
export function getCurrentMonthRange(): { start: number; end: number } {
  const now = new Date()
  
  // 月初 00:00:00
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  
  // 月末 23:59:59.999
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  
  return {
    start: start.getTime(),
    end: end.getTime()
  }
}

/**
 * 获取指定月份的起止时间戳
 * 
 * @param year - 年份
 * @param month - 月份（1-12）
 * @returns { start: 月初0点时间戳, end: 月末23:59:59时间戳 }
 * 
 * @example
 * getMonthRange(2025, 11) // 2025年11月1日 ~ 11月30日
 */
export function getMonthRange(year: number, month: number): { start: number; end: number } {
  // month 参数为 1-12，但 Date 构造函数的月份是 0-11
  const monthIndex = month - 1
  
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0)
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  
  return {
    start: start.getTime(),
    end: end.getTime()
  }
}

/**
 * 获取当前月份的标识符（YYYY-MM 格式）
 * 
 * @returns 月份标识符，如 "2025-12"
 */
export function getCurrentMonthKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * 检查时间戳是否在当前自然月内
 * 
 * @param timestamp - 待检查的时间戳
 * @returns true 表示在当前月内
 */
export function isInCurrentMonth(timestamp: number): boolean {
  const { start, end } = getCurrentMonthRange()
  return timestamp >= start && timestamp <= end
}

/**
 * 获取本月已过去的天数（含今天）
 * 
 * @returns 天数（1-31）
 */
export function getDaysPassedInMonth(): number {
  return new Date().getDate()
}

/**
 * 获取本月总天数
 * 
 * @returns 天数（28-31）
 */
export function getTotalDaysInMonth(): number {
  const now = new Date()
  // 下个月的第 0 天 = 本月最后一天
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return lastDay.getDate()
}

/**
 * 计算本月剩余天数（不含今天）
 * 
 * @returns 剩余天数
 */
export function getRemainingDaysInMonth(): number {
  return getTotalDaysInMonth() - getDaysPassedInMonth()
}
