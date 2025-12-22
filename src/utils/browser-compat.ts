/**
 * 浏览器兼容性检测工具
 * 
 * 功能：
 * - 检测当前浏览器类型（Chrome/Edge/其他）
 * - 检测特定 API 的可用性
 * - 提供功能降级支持
 * 
 * Chrome Reading List API:
 * - Chrome 89+ 支持
 * - Edge 不支持（截至 2024.12）
 * 
 * Chrome Alarms API:
 * - Chrome 88+ (MV3)
 * - Edge 支持
 * 
 * DeclarativeNetRequest:
 * - Chrome 84+ (MV3)
 * - Edge 支持
 */

import { logger } from '@/utils/logger'

const compatLogger = logger.withTag('BrowserCompat')

/**
 * 浏览器类型
 */
export type BrowserType = 'chrome' | 'edge' | 'other'

/**
 * 功能支持状态
 */
export interface FeatureSupport {
  readingList: boolean
  alarms: boolean
  declarativeNetRequest: boolean
  notifications: boolean
  sidePanel: boolean
}

/**
 * 浏览器兼容性信息
 */
export interface BrowserCompatInfo {
  browser: BrowserType
  version: number
  features: FeatureSupport
}

// 缓存检测结果
let cachedCompatInfo: BrowserCompatInfo | null = null

/**
 * 检测当前浏览器类型
 */
export function detectBrowser(): BrowserType {
  const userAgent = navigator.userAgent
  
  // Edge 的 userAgent 包含 "Edg/"（注意不是 "Edge"）
  if (userAgent.includes('Edg/')) {
    return 'edge'
  }
  
  // Chrome 的 userAgent 包含 "Chrome/"
  if (userAgent.includes('Chrome/')) {
    return 'chrome'
  }
  
  return 'other'
}

/**
 * 获取浏览器版本号
 */
export function getBrowserVersion(): number {
  const userAgent = navigator.userAgent
  const browser = detectBrowser()
  
  let versionMatch: RegExpMatchArray | null = null
  
  if (browser === 'edge') {
    versionMatch = userAgent.match(/Edg\/(\d+)/)
  } else if (browser === 'chrome') {
    versionMatch = userAgent.match(/Chrome\/(\d+)/)
  }
  
  if (versionMatch && versionMatch[1]) {
    return parseInt(versionMatch[1], 10)
  }
  
  return 0
}

/**
 * 检测 Reading List API 是否可用
 * 
 * 支持情况：
 * - Chrome 89+: 支持
 * - Edge: 不支持（截至 2024.12）
 */
export function isReadingListAvailable(): boolean {
  // 运行时检测 API 是否存在
  if (typeof chrome === 'undefined' || !chrome.readingList) {
    return false
  }
  
  const browser = detectBrowser()
  
  // Edge 不支持 Reading List API
  if (browser === 'edge') {
    return false
  }
  
  // Chrome 89+ 支持
  if (browser === 'chrome') {
    const version = getBrowserVersion()
    return version >= 89
  }
  
  return false
}

/**
 * 检测 Alarms API 是否可用
 * 
 * 支持情况：
 * - Chrome 88+ (MV3): 支持
 * - Edge: 支持
 */
export function isAlarmsAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.alarms
}

/**
 * 检测 DeclarativeNetRequest API 是否可用
 * 
 * 支持情况：
 * - Chrome 84+ (MV3): 支持
 * - Edge: 支持
 */
export function isDeclarativeNetRequestAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.declarativeNetRequest
}

/**
 * 检测 Notifications API 是否可用
 */
export function isNotificationsAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.notifications
}

/**
 * 检测 SidePanel API 是否可用
 * 
 * 支持情况：
 * - Chrome 114+: 支持
 * - Edge 114+: 支持
 */
export function isSidePanelAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.sidePanel
}

/**
 * 获取完整的浏览器兼容性信息
 */
export function getBrowserCompatInfo(): BrowserCompatInfo {
  if (cachedCompatInfo) {
    return cachedCompatInfo
  }
  
  cachedCompatInfo = {
    browser: detectBrowser(),
    version: getBrowserVersion(),
    features: {
      readingList: isReadingListAvailable(),
      alarms: isAlarmsAvailable(),
      declarativeNetRequest: isDeclarativeNetRequestAvailable(),
      notifications: isNotificationsAvailable(),
      sidePanel: isSidePanelAvailable(),
    },
  }
  
  compatLogger.info('浏览器兼容性检测完成', cachedCompatInfo)
  
  return cachedCompatInfo
}

/**
 * 检查特定功能是否可用
 */
export function isFeatureAvailable(feature: keyof FeatureSupport): boolean {
  const info = getBrowserCompatInfo()
  return info.features[feature]
}

/**
 * 获取不支持的功能列表
 */
export function getUnsupportedFeatures(): (keyof FeatureSupport)[] {
  const info = getBrowserCompatInfo()
  const unsupported: (keyof FeatureSupport)[] = []
  
  for (const [feature, supported] of Object.entries(info.features)) {
    if (!supported) {
      unsupported.push(feature as keyof FeatureSupport)
    }
  }
  
  return unsupported
}

/**
 * 清除缓存（用于测试）
 */
export function clearCompatCache(): void {
  cachedCompatInfo = null
}
