/**
 * 日期时间格式化工具
 * 
 * 根据用户的语言设置格式化日期时间，确保国际化一致性
 */

import i18n from "@/i18n"

/**
 * 获取当前的日期时间格式化区域设置
 * 
 * @returns 区域设置代码（'zh-CN' 或 'en-US'）
 */
export function getDateLocale(): string {
  const currentLang = i18n.language
  
  // 映射 i18n 语言代码到 Date 区域设置
  const localeMap: Record<string, string> = {
    'zh-CN': 'zh-CN',
    'en': 'en-US'
  }
  
  return localeMap[currentLang] || 'en-US'
}

/**
 * 格式化日期时间（完整格式）
 * 
 * @param date - 日期对象或时间戳
 * @param options - 可选的格式化选项
 * @returns 格式化后的日期时间字符串
 * 
 * @example
 * formatDateTime(new Date()) // "2025/11/30 22:30:15" (中文) 或 "11/30/2025, 10:30:15 PM" (英文)
 */
export function formatDateTime(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date
  const locale = getDateLocale()
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: locale === 'en-US' // 英文使用12小时制
  }
  
  return dateObj.toLocaleString(locale, options || defaultOptions)
}

/**
 * 格式化日期（仅日期部分）
 * 
 * @param date - 日期对象或时间戳
 * @param options - 可选的格式化选项
 * @returns 格式化后的日期字符串
 * 
 * @example
 * formatDate(new Date()) // "2025/11/30" (中文) 或 "11/30/2025" (英文)
 */
export function formatDate(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date
  const locale = getDateLocale()
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }
  
  return dateObj.toLocaleDateString(locale, options || defaultOptions)
}

/**
 * 格式化时间（仅时间部分）
 * 
 * @param date - 日期对象或时间戳
 * @param options - 可选的格式化选项
 * @returns 格式化后的时间字符串
 * 
 * @example
 * formatTime(new Date()) // "22:30:15" (中文) 或 "10:30:15 PM" (英文)
 */
export function formatTime(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date
  const locale = getDateLocale()
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: locale === 'en-US'
  }
  
  return dateObj.toLocaleTimeString(locale, options || defaultOptions)
}

/**
 * 格式化相对时间（如"3天前"）
 * 
 * @param date - 日期对象或时间戳
 * @returns 格式化后的相对时间字符串
 * 
 * @example
 * formatRelativeTime(Date.now() - 3600000) // "1小时前" (中文) 或 "1 hour ago" (英文)
 */
export function formatRelativeTime(date: Date | number): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  
  const locale = getDateLocale()
  const isChinese = locale === 'zh-CN'
  
  if (diffSec < 60) {
    return isChinese ? '刚刚' : 'just now'
  } else if (diffMin < 60) {
    return isChinese ? `${diffMin}分钟前` : `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  } else if (diffHour < 24) {
    return isChinese ? `${diffHour}小时前` : `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  } else if (diffDay < 7) {
    return isChinese ? `${diffDay}天前` : `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
  } else {
    return formatDate(dateObj)
  }
}

/**
 * 格式化月份和日期（用于显示生日、纪念日等）
 * 
 * @param date - 日期对象或时间戳
 * @returns 格式化后的月日字符串
 * 
 * @example
 * formatMonthDay(new Date()) // "11月30日" (中文) 或 "November 30" (英文)
 */
export function formatMonthDay(date: Date | number): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date
  const locale = getDateLocale()
  
  return dateObj.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric'
  })
}
