/**
 * IndexedDB 数据库定义（使用 Dexie.js）
 * 
 * 数据库名称: FeedAIMuterDB
 * 当前版本: 2
 * 
 * ⚠️ 版本管理说明：
 * - 开发过程中如果遇到版本冲突，请删除旧数据库
 * - 生产环境版本号应该只增不减
 * - 当前固定为版本 2
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  PendingVisit,
  ConfirmedVisit,
  UserSettings,
  Statistics,
  Recommendation
} from './types'

/**
 * 数据库类
 */
export class FeedAIMuterDB extends Dexie {
  // 表 1: 临时访问记录
  pendingVisits!: Table<PendingVisit, string>
  
  // 表 2: 正式访问记录
  confirmedVisits!: Table<ConfirmedVisit, string>
  
  // 表 3: 用户设置
  settings!: Table<UserSettings, string>
  
  // 表 4: 统计缓存
  statistics!: Table<Statistics, string>
  
  // 表 5: 推荐记录（Phase 2.7）
  recommendations!: Table<Recommendation, string>

  constructor() {
    super('FeedAIMuterDB')
    
    // 版本 1: 原有表
    this.version(1).stores({
      // 临时访问记录
      // 索引: id（主键）, url, startTime, expiresAt（用于清理）
      pendingVisits: 'id, url, startTime, expiresAt',
      
      // 正式访问记录
      // 索引: id（主键）, domain, visitTime, *keywords（多值索引）
      // 复合索引: [visitTime+domain] 用于按时间和域名查询
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      
      // 用户设置（单例）
      settings: 'id',
      
      // 统计缓存
      // 索引: id（主键）, type, timestamp
      statistics: 'id, type, timestamp'
    })
    
    // 版本 2: 新增推荐表（Phase 2.7）
    this.version(2).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      
      // 推荐记录
      // 索引: id（主键）, recommendedAt, isRead, source
      // 复合索引: [isRead+recommendedAt] 用于按阅读状态和时间查询
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]'
    })
  }
}

/**
 * 数据库实例（单例）
 */
export const db = new FeedAIMuterDB()

/**
 * 检查并修复数据库版本冲突
 * 
 * 如果浏览器中的版本高于代码版本，自动删除旧数据库
 */
async function checkAndFixDatabaseVersion(): Promise<void> {
  try {
    const dbs = await indexedDB.databases()
    const existingDB = dbs.find(d => d.name === 'FeedAIMuterDB')
    
    if (existingDB && existingDB.version && existingDB.version > 2) {
      console.warn(`[DB] 检测到版本冲突: 浏览器版本 ${existingDB.version}, 代码版本 2`)
      console.log('[DB] 正在清理旧数据库...')
      
      // 先关闭 Dexie 连接（如果已打开）
      if (db.isOpen()) {
        db.close()
        console.log('[DB] 已关闭现有数据库连接')
      }
      
      // 删除旧数据库
      await new Promise<void>((resolve, reject) => {
        const deleteReq = indexedDB.deleteDatabase('FeedAIMuterDB')
        deleteReq.onsuccess = () => {
          console.log('[DB] ✅ 旧数据库已删除')
          resolve()
        }
        deleteReq.onerror = () => reject(deleteReq.error)
        deleteReq.onblocked = () => {
          console.warn('[DB] ⚠️ 删除被阻止，请关闭所有使用数据库的页面')
          // 即使被阻止也继续，让用户手动处理
          resolve()
        }
      })
      
      // 等待一小段时间，确保删除完成
      await new Promise(resolve => setTimeout(resolve, 200))
      console.log('[DB] ✅ 准备创建新数据库（版本 2）')
    }
  } catch (error) {
    console.error('[DB] 版本检查失败:', error)
    // 继续执行，让 Dexie 处理
  }
}

/**
 * 初始化数据库
 * - 在扩展安装时调用
 * - 确保数据库已创建并设置默认配置
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // ⚠️ 关键：先检查版本冲突，再打开数据库
    await checkAndFixDatabaseVersion()
    
    // 打开数据库（如果未打开）
    if (!db.isOpen()) {
      console.log('[DB] 正在打开数据库...')
      await db.open()
      console.log('[DB] ✅ 数据库已打开（版本 2）')
    }
    
    // ✅ 关键修复：使用 count() 检查是否已有设置，而不是 get()
    // 这样可以避免在设置已存在时抛出错误
    const settingsCount = await db.settings.count()
    
    if (settingsCount === 0) {
      // 只有在没有设置时才创建
      console.log('[DB] 未找到设置，创建默认设置...')
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
      console.log('[DB] ✅ 已创建默认设置')
    } else {
      console.log('[DB] ✅ 设置已存在，跳过创建')
    }
    
    console.log('[DB] ✅ 数据库初始化完成')
  } catch (error) {
    // 输出详细的错误信息
    console.error('[DB] ❌ 数据库初始化失败:')
    console.error('  错误类型:', (error as any)?.constructor?.name || 'Unknown')
    console.error('  错误消息:', (error as Error)?.message || String(error))
    console.error('  完整错误:', error)
    throw error
  }
}

/**
 * 获取用户设置
 */
export async function getSettings(): Promise<UserSettings> {
  const settings = await db.settings.get('singleton')
  if (!settings) {
    throw new Error('设置不存在，请先初始化数据库')
  }
  return settings
}

/**
 * 更新用户设置
 */
export async function updateSettings(
  updates: Partial<Omit<UserSettings, 'id'>>
): Promise<void> {
  await db.settings.update('singleton', updates)
}

/**
 * 辅助函数：获取页面计数
 * 
 * 用于判断冷启动阶段
 */
export async function getPageCount(): Promise<number> {
  try {
    // 确保数据库已打开
    if (!db.isOpen()) {
      console.log('[DB] 数据库未打开，尝试打开...')
      await db.open()
    }
    
    const count = await db.confirmedVisits.count()
    console.log('[DB] 页面计数:', count)
    return count
  } catch (error) {
    console.warn('[DB] ⚠️ 获取页面计数失败，返回 0:', error)
    // 数据库未初始化或出错时返回 0
    return 0
  }
}

/**
 * Phase 2.7: 推荐统计辅助函数
 */

/**
 * 获取推荐统计数据
 * 
 * @param days - 统计最近 N 天的数据（默认 7 天）
 */
export async function getRecommendationStats(days: number = 7) {
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
  
  // 查询最近 N 天的推荐记录
  const recentRecommendations = await db.recommendations
    .where('recommendedAt')
    .above(cutoffTime)
    .toArray()
  
  const total = recentRecommendations.length
  const read = recentRecommendations.filter(r => r.isRead).length
  const dismissed = recentRecommendations.filter(r => r.feedback === 'dismissed').length
  
  // 计算有效性
  const effective = recentRecommendations.filter(
    r => r.effectiveness === 'effective'
  ).length
  const neutral = recentRecommendations.filter(
    r => r.effectiveness === 'neutral'
  ).length
  const ineffective = recentRecommendations.filter(
    r => r.effectiveness === 'ineffective'
  ).length
  
  // 计算平均阅读时长
  const readItems = recentRecommendations.filter(r => r.isRead && r.readDuration)
  const avgReadDuration = readItems.length > 0
    ? readItems.reduce((sum, r) => sum + (r.readDuration || 0), 0) / readItems.length
    : 0
  
  // 统计来源
  const sourceMap = new Map<string, { count: number; read: number }>()
  recentRecommendations.forEach(r => {
    const stats = sourceMap.get(r.source) || { count: 0, read: 0 }
    stats.count++
    if (r.isRead) stats.read++
    sourceMap.set(r.source, stats)
  })
  
  const topSources = Array.from(sourceMap.entries())
    .map(([source, stats]) => ({
      source,
      count: stats.count,
      readRate: stats.count > 0 ? (stats.read / stats.count) * 100 : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  
  return {
    total,
    read,
    readRate: total > 0 ? (read / total) * 100 : 0,
    avgReadDuration,
    dismissed,
    effective,
    neutral,
    ineffective,
    topSources
  }
}

/**
 * 获取存储统计数据
 */
export async function getStorageStats() {
  const pendingCount = await db.pendingVisits.count()
  const confirmedCount = await db.confirmedVisits.count()
  const recommendationCount = await db.recommendations.count()
  
  const totalRecords = pendingCount + confirmedCount + recommendationCount
  
  // 估算存储大小（每条记录约 5KB）
  const avgRecordSizeKB = 5
  const totalSizeMB = (totalRecords * avgRecordSizeKB) / 1024
  
  return {
    totalRecords,
    totalSizeMB: totalRecords > 0 ? Math.max(0.01, Math.round(totalSizeMB * 100) / 100) : 0, // 至少 0.01 MB
    pendingVisits: pendingCount,
    confirmedVisits: confirmedCount,
    recommendations: recommendationCount,
    avgRecordSizeKB
  }
}

/**
 * 标记推荐为已读
 * 
 * @param id - 推荐记录 ID
 * @param readDuration - 阅读时长（秒）
 * @param scrollDepth - 滚动深度（0-1）
 */
export async function markAsRead(
  id: string,
  readDuration?: number,
  scrollDepth?: number
): Promise<void> {
  const recommendation = await db.recommendations.get(id)
  if (!recommendation) {
    throw new Error(`推荐记录不存在: ${id}`)
  }
  
  // 更新阅读状态
  const updates: Partial<Recommendation> = {
    isRead: true,
    clickedAt: Date.now(),
    readDuration,
    scrollDepth
  }
  
  // 自动评估有效性
  if (readDuration !== undefined && scrollDepth !== undefined) {
    if (readDuration > 120 && scrollDepth > 0.7) {
      // 深度阅读：>2min + >70% scroll
      updates.effectiveness = 'effective'
    } else {
      // 浅度阅读
      updates.effectiveness = 'neutral'
    }
  }
  
  await db.recommendations.update(id, updates)
}

/**
 * 标记推荐为"不想读"
 * 
 * @param ids - 推荐记录 ID 数组
 */
export async function dismissRecommendations(ids: string[]): Promise<void> {
  const now = Date.now()
  
  await db.transaction('rw', db.recommendations, async () => {
    for (const id of ids) {
      await db.recommendations.update(id, {
        feedback: 'dismissed',
        feedbackAt: now,
        effectiveness: 'ineffective'
      })
    }
  })
}

/**
 * 获取未读推荐（按时间倒序）
 * 
 * @param limit - 数量限制（默认 50）
 */
export async function getUnreadRecommendations(limit: number = 50): Promise<Recommendation[]> {
  // Dexie 不支持直接索引布尔值，使用 filter
  return await db.recommendations
    .orderBy('recommendedAt')
    .reverse() // 倒序（最新在前）
    .filter(r => !r.isRead)
    .limit(limit)
    .toArray()
}
