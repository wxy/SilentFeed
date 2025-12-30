/**
 * Chrome Storage Local 键名常量
 * 
 * 统一管理所有 chrome.storage.local 的键名，确保命名一致性
 * 命名规范：使用 camelCase
 */

/**
 * 本地存储键名枚举
 */
export const LOCAL_STORAGE_KEYS = {
  // ========== 系统配置与状态 ==========
  /** 系统阈值配置 */
  SYSTEM_THRESHOLDS: 'systemThresholds',
  /** 系统统计缓存（带过期时间） */
  SYSTEM_STATS: 'systemStats',
  /** 引导流程状态 */
  ONBOARDING_STATUS: 'onboardingStatus',
  /** AI 供应商可用性状态 */
  AI_PROVIDERS_STATUS: 'aiProvidersStatus',
  
  // ========== 用户行为与指标 ==========
  /** 自适应推荐指标 */
  ADAPTIVE_METRICS: 'adaptiveMetrics',
  /** 语义画像更新计数器 */
  PROFILE_UPDATE_COUNTERS: 'profileUpdateCounters',
  /** 上次通知时间戳 */
  LAST_NOTIFICATION_TIME: 'lastNotificationTime',
  
  // ========== 阅读列表 ==========
  /** 阅读列表引导状态（区别于主引导流程） */
  READING_LIST_GUIDE: 'readingListGuide',
  
  // ========== 临时追踪（聚合存储） ==========
  /** Tab 推荐追踪集合: { [tabId]: TrackingInfo } */
  TRACKING_TABS: 'trackingTabs',
  /** URL 推荐追踪集合: { [urlHash]: TrackingInfo } */
  TRACKING_URLS: 'trackingUrls',
  /** 通知 URL 映射集合: { [notificationId]: NotificationTrackingInfo } */
  TRACKING_NOTIFICATIONS: 'trackingNotifications',
  
  // ========== 废弃的追踪前缀（用于迁移检测） ==========
  /** @deprecated 旧的 Tab 追踪前缀 */
  LEGACY_TRACKING_TAB_PREFIX: 'tracking:tab:',
  /** @deprecated 旧的 URL 追踪前缀 */
  LEGACY_TRACKING_URL_PREFIX: 'tracking:url:',
  /** @deprecated 旧的通知追踪前缀 */
  LEGACY_TRACKING_NOTIFICATION_PREFIX: 'tracking:notification:'
} as const

/**
 * 本地存储键类型
 */
export type LocalStorageKey = typeof LOCAL_STORAGE_KEYS[keyof typeof LOCAL_STORAGE_KEYS]

/**
 * 检查键名是否为旧的追踪键（用于清理）
 */
export function isLegacyTrackingKey(key: string): boolean {
  return (
    key.startsWith(LOCAL_STORAGE_KEYS.LEGACY_TRACKING_TAB_PREFIX) ||
    key.startsWith(LOCAL_STORAGE_KEYS.LEGACY_TRACKING_URL_PREFIX) ||
    key.startsWith(LOCAL_STORAGE_KEYS.LEGACY_TRACKING_NOTIFICATION_PREFIX)
  )
}

/**
 * 简单字符串哈希函数
 * 用于将 URL 转换为固定长度的 ID
 */
export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}
