/**
 * IndexedDB 数据库定义（使用 Dexie.js）
 * 
 * 数据库名称: FeedAIMuterDB
 * 版本: 1
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  PendingVisit,
  ConfirmedVisit,
  UserSettings,
  Statistics
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

  constructor() {
    super('FeedAIMuterDB')
    
    // 定义表结构和索引
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
  }
}

/**
 * 数据库实例（单例）
 */
export const db = new FeedAIMuterDB()

/**
 * 初始化数据库
 * 
 * 确保默认设置存在
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // 检查设置是否存在
    const existingSettings = await db.settings.get('singleton')
    
    if (!existingSettings) {
      // 创建默认设置
      const defaultSettings: UserSettings = {
        id: 'singleton',
        
        // 停留时间默认配置
        dwellTime: {
          mode: 'auto',
          fixedThreshold: 30,
          minThreshold: 15,
          maxThreshold: 120,
          calculatedThreshold: 30
        },
        
        // 排除规则默认配置
        exclusionRules: {
          autoExcludeIntranet: true,
          autoExcludeSensitive: true,
          customDomains: []
        },
        
        // 数据保留策略默认配置
        dataRetention: {
          rawVisitsDays: 90,
          statisticsDays: 365
        },
        
        // 初始化阶段
        initPhase: {
          completed: false,
          pageCount: 0
        },
        
        // 通知设置
        notifications: {
          enabled: true,
          dailyLimit: 5
        }
      }
      
      await db.settings.add(defaultSettings)
      console.log('✅ 数据库初始化完成，默认设置已创建')
    } else {
      console.log('✅ 数据库已存在，跳过初始化')
    }
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
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
 * 获取页面计数（用于进度显示）
 */
export async function getPageCount(): Promise<number> {
  return await db.confirmedVisits.count()
}
