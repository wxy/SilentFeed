/**
 * 数据库初始化模块
 * 
 * 负责数据库的初始化和默认设置创建
 */

import { db } from './index'
import { logger } from '@/utils/logger'
import { needsMigration, runFullMigration } from './db-migration'

const dbLogger = logger.withTag('DB')

/**
 * 检查数据库版本（仅用于调试日志）
 * 
 * 注意：indexedDB.databases() 返回的版本号是浏览器内部维护的累积版本号，
 * 可能与 Dexie 定义的版本号不同。这是正常现象，Dexie 会自动处理版本差异。
 */
async function checkDatabaseVersion(): Promise<void> {
  try {
    const dbs = await indexedDB.databases()
    const existingDB = dbs.find(d => d.name === 'SilentFeedDB')
    
    if (existingDB && existingDB.version) {
      // 只在开发模式下输出详细日志
      dbLogger.debug(`IndexedDB 内部版本: ${existingDB.version}, Dexie schema 版本: 20`)
      
      // 移除误导性的警告，因为版本差异是正常的
      // Dexie 会根据 schema 定义自动处理版本升级
    }
  } catch (error) {
    dbLogger.debug('无法检查版本（可能是首次运行）:', error)
  }
}

/**
 * 初始化数据库
 */
export async function initializeDatabase(): Promise<void> {
  try {
    await checkDatabaseVersion()
    
    if (!db.isOpen()) {
      dbLogger.info('正在打开数据库...')
      await db.open()
      dbLogger.info('✅ 数据库已打开（版本 20）')
    }
    
    const settingsCount = await db.settings.count()
    
    if (settingsCount === 0) {
      dbLogger.info('未找到设置，创建默认设置...')
      await db.settings.add({
        id: 'singleton',
        dwellTime: {
          mode: 'fixed',
          fixedThreshold: 30,
          minThreshold: 15,
          maxThreshold: 120,
          calculatedThreshold: 30
        },
        exclusionRules: {
          autoExcludeIntranet: true,
          autoExcludeSensitive: true,
          customDomains: []
        },
        dataRetention: {
          rawVisitsDays: 90,
          statisticsDays: 365
        }
      })
      dbLogger.info('✅ 已创建默认设置')
    } else {
      dbLogger.info('✅ 设置已存在，跳过创建')
    }
    
    // Phase 10: 检查并执行数据迁移
    const needsSync = await needsMigration()
    if (needsSync) {
      dbLogger.info('检测到需要数据迁移，开始执行...')
      const migrationSuccess = await runFullMigration()
      
      if (!migrationSuccess) {
        dbLogger.warn('⚠️ 数据迁移失败，但不影响正常使用')
      }
    } else {
      dbLogger.info('数据已是最新版本，无需迁移')
    }
    
    dbLogger.info('✅ 数据库初始化完成')
  } catch (error) {
    dbLogger.error('❌ 数据库初始化失败:', error)
    throw error
  }
}
