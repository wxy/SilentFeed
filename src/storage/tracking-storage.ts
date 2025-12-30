/**
 * 追踪数据管理模块
 * 
 * 统一管理临时追踪数据（Tab/URL/Notification），提供 TTL 过期机制
 * 
 * 优化方案：使用聚合存储减少键数量
 * - trackingTabs: { [tabId]: TrackingInfo }
 * - trackingUrls: { [urlHash]: TrackingInfo }
 * - trackingNotifications: { [notificationId]: NotificationTrackingInfo }
 */

import { logger } from '@/utils/logger'
import { LOCAL_STORAGE_KEYS, simpleHash } from './local-storage-keys'

const trackingLogger = logger.withTag('TrackingStorage')

/**
 * 追踪信息基础接口
 */
export interface TrackingInfo {
  /** 推荐 ID */
  recommendationId: string
  /** 推荐标题 */
  title: string
  /** 来源 */
  source: 'popup' | 'readingList' | 'notification'
  /** 用户操作 */
  action?: 'original' | 'translated'
  /** 创建时间戳（用于 TTL） */
  createdAt: number
}

/**
 * 通知追踪信息
 */
export interface NotificationTrackingInfo {
  /** 推荐文章 URL */
  url: string
  /** 推荐 ID（可选） */
  recommendationId?: string
  /** 创建时间戳 */
  createdAt: number
}

/**
 * 追踪数据 TTL（30 分钟）
 */
const TRACKING_TTL = 30 * 60 * 1000

// ==================== Tab 追踪 ====================

/**
 * 保存 Tab 追踪信息
 * 
 * @param tabId - Tab ID
 * @param info - 追踪信息（不包含 createdAt）
 */
export async function saveTabTracking(
  tabId: number,
  info: Omit<TrackingInfo, 'createdAt'>
): Promise<void> {
  try {
    const data: TrackingInfo = {
      ...info,
      createdAt: Date.now()
    }
    
    // 读取现有集合
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_TABS)
    const tabs = (result[LOCAL_STORAGE_KEYS.TRACKING_TABS] || {}) as Record<string, TrackingInfo>
    
    // 更新集合
    tabs[tabId.toString()] = data
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: tabs })
    
    trackingLogger.debug(`保存 Tab 追踪: ${tabId}`, { info })
  } catch (error) {
    trackingLogger.error(`保存 Tab 追踪失败: ${tabId}`, error)
    throw error
  }
}

/**
 * 获取并清除 Tab 追踪信息
 * 
 * @param tabId - Tab ID
 * @returns 追踪信息，如果不存在或已过期则返回 null
 */
export async function consumeTabTracking(
  tabId: number
): Promise<TrackingInfo | null> {
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_TABS)
    const tabs = (result[LOCAL_STORAGE_KEYS.TRACKING_TABS] || {}) as Record<string, TrackingInfo>
    
    const info = tabs[tabId.toString()]
    if (!info) {
      return null
    }
    
    // 检查是否过期
    if (Date.now() - info.createdAt > TRACKING_TTL) {
      trackingLogger.warn(`Tab 追踪已过期: ${tabId}`)
      // 删除过期条目
      delete tabs[tabId.toString()]
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: tabs })
      return null
    }
    
    // 立即清除，避免重复消费
    delete tabs[tabId.toString()]
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: tabs })
    
    trackingLogger.debug(`消费 Tab 追踪: ${tabId}`, { info })
    return info
  } catch (error) {
    trackingLogger.error(`消费 Tab 追踪失败: ${tabId}`, error)
    return null
  }
}

// ==================== URL 追踪 ====================

/**
 * 保存 URL 追踪信息
 * 
 * @param url - URL
 * @param info - 追踪信息（不包含 createdAt）
 */
export async function saveUrlTracking(
  url: string,
  info: Omit<TrackingInfo, 'createdAt'>
): Promise<void> {
  try {
    const urlHash = simpleHash(url)
    const data: TrackingInfo = {
      ...info,
      createdAt: Date.now()
    }
    
    // 读取现有集合
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_URLS)
    const urls = (result[LOCAL_STORAGE_KEYS.TRACKING_URLS] || {}) as Record<string, TrackingInfo>
    
    // 更新集合
    urls[urlHash] = data
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_URLS]: urls })
    
    trackingLogger.debug(`保存 URL 追踪: ${url.substring(0, 50)}...`, { info })
  } catch (error) {
    trackingLogger.error(`保存 URL 追踪失败: ${url}`, error)
    throw error
  }
}

/**
 * 获取并清除 URL 追踪信息
 * 
 * @param url - URL
 * @returns 追踪信息，如果不存在或已过期则返回 null
 */
export async function consumeUrlTracking(
  url: string
): Promise<TrackingInfo | null> {
  try {
    const urlHash = simpleHash(url)
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_URLS)
    const urls = (result[LOCAL_STORAGE_KEYS.TRACKING_URLS] || {}) as Record<string, TrackingInfo>
    
    const info = urls[urlHash]
    if (!info) {
      return null
    }
    
    // 检查是否过期
    if (Date.now() - info.createdAt > TRACKING_TTL) {
      trackingLogger.warn(`URL 追踪已过期: ${url.substring(0, 50)}...`)
      delete urls[urlHash]
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_URLS]: urls })
      return null
    }
    
    // 立即清除
    delete urls[urlHash]
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_URLS]: urls })
    
    trackingLogger.debug(`消费 URL 追踪: ${url.substring(0, 50)}...`, { info })
    return info
  } catch (error) {
    trackingLogger.error(`消费 URL 追踪失败: ${url}`, error)
    return null
  }
}

// ==================== 通知追踪 ====================

/**
 * 保存通知追踪信息
 * 
 * @param notificationId - 通知 ID
 * @param url - 推荐文章 URL
 * @param recommendationId - 推荐 ID（可选）
 */
export async function saveNotificationTracking(
  notificationId: string,
  url: string,
  recommendationId?: string
): Promise<void> {
  try {
    const data: NotificationTrackingInfo = {
      url,
      recommendationId,
      createdAt: Date.now()
    }
    
    // 读取现有集合
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS)
    const notifications = (result[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS] || {}) as Record<string, NotificationTrackingInfo>
    
    // 更新集合
    notifications[notificationId] = data
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: notifications })
    
    trackingLogger.debug(`保存通知追踪: ${notificationId}`)
  } catch (error) {
    trackingLogger.error(`保存通知追踪失败: ${notificationId}`, error)
    throw error
  }
}

/**
 * 获取并清除通知追踪信息
 * 
 * @param notificationId - 通知 ID
 * @returns 追踪信息，如果不存在或已过期则返回 null
 */
export async function consumeNotificationTracking(
  notificationId: string
): Promise<NotificationTrackingInfo | null> {
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS)
    const notifications = (result[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS] || {}) as Record<string, NotificationTrackingInfo>
    
    const info = notifications[notificationId]
    if (!info) {
      return null
    }
    
    // 检查是否过期
    if (Date.now() - info.createdAt > TRACKING_TTL) {
      trackingLogger.warn(`通知追踪已过期: ${notificationId}`)
      delete notifications[notificationId]
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: notifications })
      return null
    }
    
    // 立即清除
    delete notifications[notificationId]
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: notifications })
    
    trackingLogger.debug(`消费通知追踪: ${notificationId}`, { info })
    return info
  } catch (error) {
    trackingLogger.error(`消费通知追踪失败: ${notificationId}`, error)
    return null
  }
}

/**
 * 清除通知追踪（不返回数据）
 * 用于通知被关闭但不需要数据的场景
 * 
 * @param notificationId - 通知 ID
 */
export async function clearNotificationTracking(
  notificationId: string
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS)
    const notifications = (result[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS] || {}) as Record<string, NotificationTrackingInfo>
    
    if (notifications[notificationId]) {
      delete notifications[notificationId]
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: notifications })
      trackingLogger.debug(`清除通知追踪: ${notificationId}`)
    }
  } catch (error) {
    trackingLogger.error(`清除通知追踪失败: ${notificationId}`, error)
  }
}
