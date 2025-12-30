/**
 * Storage Key 命名规范迁移
 * 从 kebab-case 和 snake_case 统一到 camelCase
 * 
 * 迁移内容：
 * - recommendation-config → recommendationConfig
 * - notification-config → notificationConfig
 * - ui_style + auto_translate → uiConfig
 * - i18nextLng → language
 */

import { logger } from '@/utils/logger'

const migrationLogger = logger.withTag('StorageMigration')

export interface MigrationResult {
  success: boolean
  migratedKeys: string[]
  errors: string[]
}

/**
 * 深度合并对象
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target }
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      // @ts-ignore
      result[key] = deepMerge(result[key] || {}, source[key])
    } else if (source[key] !== undefined) {
      // @ts-ignore
      result[key] = source[key]
    }
  }
  
  return result
}

/**
 * 安全的配置迁移
 * 
 * 策略：
 * 1. 检查新配置是否已存在（存在则跳过）
 * 2. 读取旧配置
 * 3. 转换并保存新配置
 * 4. 删除旧配置
 * 5. 失败时不影响系统运行
 */
async function migrateConfigSafely<TOld, TNew>(
  oldKey: string,
  newKey: string,
  transform: (old: TOld) => TNew,
  defaultValue: TNew,
  storage: 'sync' | 'local' = 'sync'
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 检查新配置是否已存在
    const newConfig = await chrome.storage[storage].get(newKey)
    if (newConfig[newKey]) {
      migrationLogger.debug(`${newKey} 已存在，跳过迁移`)
      return { success: true }
    }
    
    // 2. 读取旧配置
    const oldConfig = await chrome.storage[storage].get(oldKey)
    
    if (oldConfig[oldKey]) {
      // 3. 转换并保存
      const transformed = transform(oldConfig[oldKey])
      await chrome.storage[storage].set({ [newKey]: transformed })
      
      // 4. 删除旧配置
      await chrome.storage[storage].remove(oldKey)
      
      migrationLogger.info(`✅ 已迁移: ${oldKey} → ${newKey}`)
      return { success: true }
    } else {
      // 5. 旧配置不存在，初始化默认值
      await chrome.storage[storage].set({ [newKey]: defaultValue })
      migrationLogger.debug(`✅ 初始化默认值: ${newKey}`)
      return { success: true }
    }
    
  } catch (error) {
    // 6. 迁移失败不影响系统运行
    const errorMsg = error instanceof Error ? error.message : String(error)
    migrationLogger.warn(`⚠️ 迁移失败: ${oldKey} → ${newKey}`, error)
    
    // 7. 确保新配置存在（即使迁移失败）
    try {
      const check = await chrome.storage[storage].get(newKey)
      if (!check[newKey]) {
        await chrome.storage[storage].set({ [newKey]: defaultValue })
        migrationLogger.info(`✅ 使用默认值初始化: ${newKey}`)
      }
    } catch (e) {
      migrationLogger.error(`❌ 无法确保配置存在: ${newKey}`, e)
    }
    
    return { success: false, error: errorMsg }
  }
}

/**
 * 执行所有 Storage Key 迁移
 */
export async function migrateStorageKeys(): Promise<MigrationResult> {
  migrationLogger.info('🔄 开始 Storage Key 迁移...')
  
  const migratedKeys: string[] = []
  const errors: string[] = []
  
  try {
    // 迁移 1: recommendation-config → recommendationConfig
    const rec = await migrateConfigSafely(
      'recommendation-config',
      'recommendationConfig',
      (old: any) => old, // 保持原样
      {
        analysisEngine: 'remoteAI' as const,
        feedAnalysisEngine: 'remoteAI' as const,
        useReasoning: false,
        useLocalAI: false,
        maxRecommendations: 3,
        batchSize: 10,
        qualityThreshold: 0.6,
        tfidfThreshold: 0.1
      }
    )
    if (rec.success) migratedKeys.push('recommendationConfig')
    if (rec.error) errors.push(rec.error)
    
    // 迁移 2: notification-config → notificationConfig
    const notif = await migrateConfigSafely(
      'notification-config',
      'notificationConfig',
      (old: any) => old, // 保持原样
      {
        enabled: false,
        minInterval: 60
      }
    )
    if (notif.success) migratedKeys.push('notificationConfig')
    if (notif.error) errors.push(notif.error)
    
    // 迁移 3: ui_style + auto_translate → uiConfig
    const sync = await chrome.storage.sync.get(['ui_style', 'auto_translate'])
    
    if (sync.ui_style || sync.auto_translate !== undefined) {
      try {
        const uiConfig = {
          style: sync.ui_style || 'normal',
          autoTranslate: sync.auto_translate ?? true
        }
        await chrome.storage.sync.set({ uiConfig })
        await chrome.storage.sync.remove(['ui_style', 'auto_translate'])
        migratedKeys.push('uiConfig')
        migrationLogger.info('✅ 已迁移: ui_style + auto_translate → uiConfig')
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push(errorMsg)
        migrationLogger.warn('⚠️ UI 配置迁移失败', error)
      }
    }
    
    // 迁移 4: i18nextLng → language（如果存在）
    const i18n = await chrome.storage.sync.get('i18nextLng')
    if (i18n.i18nextLng) {
      try {
        await chrome.storage.sync.set({ language: i18n.i18nextLng })
        await chrome.storage.sync.remove('i18nextLng')
        migratedKeys.push('language')
        migrationLogger.info('✅ 已迁移: i18nextLng → language')
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push(errorMsg)
        migrationLogger.warn('⚠️ 语言配置迁移失败', error)
      }
    }
    
    migrationLogger.info(`✅ Storage Key 迁移完成`, {
      migratedKeys,
      errorCount: errors.length
    })
    
    return {
      success: errors.length === 0,
      migratedKeys,
      errors
    }
    
  } catch (error) {
    migrationLogger.error('❌ Storage Key 迁移失败', error)
    return {
      success: false,
      migratedKeys,
      errors: [error instanceof Error ? error.message : String(error)]
    }
  }
}

/**
 * 检查是否需要迁移
 */
export async function needsStorageKeyMigration(): Promise<boolean> {
  try {
    const sync = await chrome.storage.sync.get([
      'recommendation-config',
      'notification-config',
      'ui_style',
      'auto_translate',
      'i18nextLng'
    ])
    
    // 如果任何旧 key 存在，则需要迁移
    return !!(
      sync['recommendation-config'] ||
      sync['notification-config'] ||
      sync['ui_style'] ||
      sync['auto_translate'] !== undefined ||
      sync['i18nextLng']
    )
  } catch (error) {
    migrationLogger.warn('检查迁移需求失败', error)
    return false
  }
}
