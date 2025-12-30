/**
 * Chrome Storage Local 键名迁移 v2
 * 
 * 将遗留的 kebab-case 和 snake_case 键名迁移到统一的 camelCase 命名
 * 
 * v2 更新：将碎片化的追踪键迁移到聚合存储格式
 */

import { logger } from '@/utils/logger'
import { LOCAL_STORAGE_KEYS, isLegacyTrackingKey } from '../local-storage-keys'

const migrationLogger = logger.withTag('LocalStorageMigration')

/**
 * 迁移配置
 */
interface MigrationConfig {
  /** 旧键名 */
  oldKey: string
  /** 新键名 */
  newKey: string
  /** 迁移说明 */
  description: string
}

/**
 * 本地存储键迁移列表
 */
const LOCAL_STORAGE_MIGRATIONS: MigrationConfig[] = [
  {
    oldKey: 'adaptive-metrics',
    newKey: LOCAL_STORAGE_KEYS.ADAPTIVE_METRICS,
    description: '自适应推荐指标'
  },
  {
    oldKey: 'profile_update_counters',
    newKey: LOCAL_STORAGE_KEYS.PROFILE_UPDATE_COUNTERS,
    description: '语义画像更新计数器'
  },
  {
    oldKey: 'last-notification-time',
    newKey: LOCAL_STORAGE_KEYS.LAST_NOTIFICATION_TIME,
    description: '上次通知时间'
  },
  {
    oldKey: 'readingListOnboarding',
    newKey: LOCAL_STORAGE_KEYS.READING_LIST_GUIDE,
    description: '阅读列表引导状态'
  }
]

/**
 * 执行本地存储键名迁移
 * 
 * @returns 迁移结果统计
 */
export async function migrateLocalStorageKeys(): Promise<{
  success: number
  skipped: number
  failed: number
}> {
  const stats = { success: 0, skipped: 0, failed: 0 }
  
  migrationLogger.info('开始本地存储键名迁移 v2...')
  
  for (const migration of LOCAL_STORAGE_MIGRATIONS) {
    try {
      const result = await migrateSingleKey(migration)
      
      if (result === 'success') {
        stats.success++
      } else if (result === 'skipped') {
        stats.skipped++
      }
    } catch (error) {
      migrationLogger.error(`迁移失败: ${migration.oldKey} → ${migration.newKey}`, error)
      stats.failed++
    }
  }
  
  migrationLogger.info('本地存储键名迁移完成', stats)
  return stats
}

/**
 * 迁移单个键
 */
async function migrateSingleKey(
  migration: MigrationConfig
): Promise<'success' | 'skipped'> {
  const { oldKey, newKey, description } = migration
  
  // 1. 检查旧键是否存在
  const oldData = await chrome.storage.local.get(oldKey)
  
  if (!(oldKey in oldData)) {
    migrationLogger.debug(`跳过迁移（旧键不存在）: ${oldKey}`)
    return 'skipped'
  }
  
  // 2. 检查新键是否已存在
  const newData = await chrome.storage.local.get(newKey)
  
  if (newKey in newData) {
    migrationLogger.warn(`新键已存在，删除旧键: ${oldKey} (新键: ${newKey})`)
    await chrome.storage.local.remove(oldKey)
    return 'skipped'
  }
  
  // 3. 迁移数据
  const value = oldData[oldKey]
  await chrome.storage.local.set({ [newKey]: value })
  
  // 4. 删除旧键
  await chrome.storage.local.remove(oldKey)
  
  migrationLogger.info(`✓ 迁移成功: ${description} (${oldKey} → ${newKey})`)
  return 'success'
}

/**
 * 清理过期的追踪数据
 * 
 * 注意：此函数现已废弃，因为追踪数据已改为聚合存储
 * 仅用于清理旧格式的碎片化追踪键
 * 
 * @param ttlMs - 过期时间（毫秒），默认 30 分钟
 * @returns 清理的键数量
 */
export async function cleanupExpiredTrackingData(
  ttlMs: number = 30 * 60 * 1000
): Promise<number> {
  const now = Date.now()
  const allData = await chrome.storage.local.get(null)
  const keysToRemove: string[] = []
  
  for (const [key, value] of Object.entries(allData)) {
    // 只处理旧格式的追踪键
    if (!isLegacyTrackingKey(key)) {
      continue
    }
    
    // 检查是否包含 createdAt 字段
    const data = value as { createdAt?: number }
    
    if (data.createdAt) {
      // 有时间戳，检查是否过期
      if (now - data.createdAt > ttlMs) {
        keysToRemove.push(key)
      }
    } else {
      // 没有时间戳，说明是旧数据，直接清理
      keysToRemove.push(key)
    }
  }
  
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove)
    migrationLogger.info(`清理过期追踪数据（旧格式）: ${keysToRemove.length} 项`, {
      keys: keysToRemove.slice(0, 5) // 只记录前5个
    })
  }
  
  return keysToRemove.length
}

/**
 * 清理遗留的旧格式 notification-url-* 和碎片化追踪键
 * 
 * 包括：
 * - notification-url-* (旧通知键)
 * - recommendation_tab_* (旧 Tab 追踪)
 * - recommendation_tracking_* (旧 URL 追踪)
 * - tracking:tab:* (碎片化追踪键)
 * - tracking:url:* (碎片化追踪键)
 * - tracking:notification:* (碎片化追踪键)
 * 
 * @returns 清理的键数量
 */
export async function cleanupLegacyNotificationKeys(): Promise<number> {
  const allData = await chrome.storage.local.get(null)
  const keysToRemove: string[] = []
  
  for (const key of Object.keys(allData)) {
    // 检查是否为旧格式的 notification-url- 键
    if (key.startsWith('notification-url-')) {
      keysToRemove.push(key)
    }
    
    // 检查旧格式的 recommendation_tab_ 和 recommendation_tracking_ 键
    if (key.startsWith('recommendation_tab_') || 
        key.startsWith('recommendation_tracking_')) {
      keysToRemove.push(key)
    }
    
    // 检查旧格式的碎片化追踪键
    if (isLegacyTrackingKey(key)) {
      keysToRemove.push(key)
    }
  }
  
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove)
    migrationLogger.info(`清理遗留旧格式键: ${keysToRemove.length} 项`)
  }
  
  return keysToRemove.length
}

/**
 * 清理聚合追踪存储中的过期数据
 * 
 * 处理新格式的聚合存储：trackingTabs, trackingUrls, trackingNotifications
 * 
 * @param ttlMs - 过期时间（毫秒），默认 30 分钟
 * @returns 清理的条目数量
 */
export async function cleanupAggregatedTrackingData(
  ttlMs: number = 30 * 60 * 1000
): Promise<number> {
  const now = Date.now()
  let totalCleaned = 0
  
  // 1. 清理 trackingTabs
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_TABS)
    const tabs = result[LOCAL_STORAGE_KEYS.TRACKING_TABS] as Record<string, { createdAt: number }> | undefined
    
    if (tabs && typeof tabs === 'object') {
      const filtered: Record<string, any> = {}
      let cleaned = 0
      
      for (const [key, value] of Object.entries(tabs)) {
        if (value.createdAt && (now - value.createdAt <= ttlMs)) {
          filtered[key] = value
        } else {
          cleaned++
        }
      }
      
      if (cleaned > 0) {
        await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: filtered })
        totalCleaned += cleaned
      }
    }
  } catch (error) {
    migrationLogger.error('清理 trackingTabs 失败', error)
  }
  
  // 2. 清理 trackingUrls
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_URLS)
    const urls = result[LOCAL_STORAGE_KEYS.TRACKING_URLS] as Record<string, { createdAt: number }> | undefined
    
    if (urls && typeof urls === 'object') {
      const filtered: Record<string, any> = {}
      let cleaned = 0
      
      for (const [key, value] of Object.entries(urls)) {
        if (value.createdAt && (now - value.createdAt <= ttlMs)) {
          filtered[key] = value
        } else {
          cleaned++
        }
      }
      
      if (cleaned > 0) {
        await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_URLS]: filtered })
        totalCleaned += cleaned
      }
    }
  } catch (error) {
    migrationLogger.error('清理 trackingUrls 失败', error)
  }
  
  // 3. 清理 trackingNotifications
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS)
    const notifications = result[LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS] as Record<string, { createdAt: number }> | undefined
    
    if (notifications && typeof notifications === 'object') {
      const filtered: Record<string, any> = {}
      let cleaned = 0
      
      for (const [key, value] of Object.entries(notifications)) {
        if (value.createdAt && (now - value.createdAt <= ttlMs)) {
          filtered[key] = value
        } else {
          cleaned++
        }
      }
      
      if (cleaned > 0) {
        await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_NOTIFICATIONS]: filtered })
        totalCleaned += cleaned
      }
    }
  } catch (error) {
    migrationLogger.error('清理 trackingNotifications 失败', error)
  }
  
  if (totalCleaned > 0) {
    migrationLogger.info(`清理聚合追踪数据中的过期条目: ${totalCleaned} 项`)
  }
  
  return totalCleaned
}

/**
 * 检查是否需要执行本地存储迁移
 */
export async function needsLocalStorageMigration(): Promise<boolean> {
  // 检查是否存在任何旧键
  for (const migration of LOCAL_STORAGE_MIGRATIONS) {
    const result = await chrome.storage.local.get(migration.oldKey)
    if (migration.oldKey in result) {
      return true
    }
  }
  
  return false
}
