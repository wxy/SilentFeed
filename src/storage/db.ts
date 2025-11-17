/**
 * IndexedDB 数据库定义（使用 Dexie.js）
 * 
 * 数据库名称: FeedAIMuterDB
 * 当前版本: 9
 * 
 * ⚠️ 版本管理说明：
 * - 开发过程中如果遇到版本冲突，请删除旧数据库
 * - 生产环境版本号应该只增不减
 * - 当前固定为版本 9（Phase 6: 删除 feedArticles 表，统一使用 latestArticles 数组）
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  PendingVisit,
  ConfirmedVisit,
  Statistics,
  Recommendation,
  RecommendationStats,
  StorageStats
} from "@/types/database"
import type { UserSettings } from "@/types/config"
import type { InterestSnapshot, UserProfile } from "@/types/profile"
import type { DiscoveredFeed, FeedArticle } from "@/types/rss"
import { logger } from '@/utils/logger'

// 创建数据库专用日志器
const dbLogger = logger.withTag('DB')
const statsLogger = logger.withTag('AnalysisStats')

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

  // 表 6: 用户画像（Phase 3.3）
  userProfile!: Table<UserProfile, string>

  // 表 7: 兴趣变化快照（Phase 3.4）
  interestSnapshots!: Table<InterestSnapshot, string>

  // 表 8: 发现的 RSS 源（Phase 5.1）
  discoveredFeeds!: Table<DiscoveredFeed, string>

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

    // 版本 3: 新增用户画像表（Phase 3.3）
    this.version(3).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]',
      
      // 用户画像（单例）
      // 索引: id（主键）, lastUpdated
      userProfile: 'id, lastUpdated'
    })

    // 版本 4: 新增兴趣快照表（Phase 3.4）
    this.version(4).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      
      // 兴趣快照表
      // 索引: id（主键）, timestamp, primaryTopic, trigger
      // 复合索引: [primaryTopic+timestamp] 用于按主导兴趣查询历史
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]'
    })

    // 版本 5: 新增 RSS 源表（Phase 5.1）
    this.version(5).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      
      // 发现的 RSS 源（文章存储在 latestArticles 数组中）
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, [status+discoveredAt]'
    })

    // 版本 6: 扩展 RSS 源字段，支持定时抓取（Phase 5 Sprint 3）
    this.version(6).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      
      // 发现的 RSS 源（新增 isActive, lastFetchedAt 索引）
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]'
    }).upgrade(async (tx) => {
      // 数据迁移：为现有记录添加默认值
      const feeds = await tx.table('discoveredFeeds').toArray()
      
      for (const feed of feeds) {
        const updates: Partial<DiscoveredFeed> = {}
        
        // 如果没有 isActive 字段，设置默认值
        if (feed.isActive === undefined) {
          updates.isActive = true
        }
        
        // 如果没有 articleCount，设置默认值
        if (feed.articleCount === undefined) {
          updates.articleCount = 0
        }
        
        // 如果没有 unreadCount，设置默认值
        if (feed.unreadCount === undefined) {
          updates.unreadCount = 0
        }
        
        // 兼容旧字段：enabled → isActive
        if ('enabled' in feed && feed.enabled !== undefined) {
          updates.isActive = feed.enabled
        }
        
        // 兼容旧字段：lastFetched → lastFetchedAt
        if ('lastFetched' in feed && feed.lastFetched !== undefined) {
          updates.lastFetchedAt = feed.lastFetched
        }
        
        // 更新记录
        if (Object.keys(updates).length > 0) {
          await tx.table('discoveredFeeds').update(feed.id, updates)
        }
      }
    })

    // 版本 7: 添加推荐数量字段（Phase 6）
    this.version(7).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]'
    }).upgrade(async (tx) => {
      // 为所有 Feed 添加 recommendedCount 字段
      const feeds = await tx.table('discoveredFeeds').toArray()
      
      for (const feed of feeds) {
        if (feed.recommendedCount === undefined) {
          await tx.table('discoveredFeeds').update(feed.id, {
            recommendedCount: 0
          })
        }
      }
    })

    // 版本 8: 添加 sourceUrl 索引（Phase 6 - 修复统计查询）
    this.version(8).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      // 推荐记录：新增 sourceUrl 索引用于按来源统计
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]'
    })

    // 版本 9: 删除未使用的 feedArticles 表（Phase 6 - 清理存储结构）
    // 所有文章数据存储在 discoveredFeeds.latestArticles 数组中
    this.version(9).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: null  // 删除表
    })

    // 版本 10: 索引优化（Phase 7.1 - 性能优化）
    // 根据查询模式优化索引，提升查询性能
    this.version(10).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      // confirmedVisits: 添加 visitTime 单独索引（高频查询：orderBy('visitTime')）
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      // recommendations: 添加复合索引优化未读查询（高频：where('isRead').equals(false)）
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt], [isRead+source]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      // discoveredFeeds: 添加 url 索引（高频：where('url').equals()）
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
    })
  }
}

/**
 * 数据库实例（单例）
 */
export const db = new FeedAIMuterDB()

/**
 * 检查数据库版本（仅用于调试日志）
 * 
 * ⚠️ 不再自动删除旧数据库，让 Dexie 自动处理版本升级
 */
async function checkDatabaseVersion(): Promise<void> {
  try {
    const dbs = await indexedDB.databases()
    const existingDB = dbs.find(d => d.name === 'FeedAIMuterDB')
    
    if (existingDB && existingDB.version) {
      dbLogger.info(`现有数据库版本: ${existingDB.version}, 代码版本: 10`)
      
      if (existingDB.version > 10) {
        dbLogger.warn('⚠️ 浏览器中的数据库版本较高，Dexie 将自动处理')
      }
    }
  } catch (error) {
    dbLogger.debug('无法检查版本（可能是首次运行）:', error)
  }
}

/**
 * 初始化数据库
 * - 在扩展安装时调用
 * - 确保数据库已创建并设置默认配置
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // 检查数据库版本（仅日志）
    await checkDatabaseVersion()
    
    // 打开数据库（如果未打开）
    if (!db.isOpen()) {
      dbLogger.info('正在打开数据库...')
      await db.open()
      dbLogger.info('✅ 数据库已打开（版本 10）')
    }
    
    // ✅ 关键修复：使用 count() 检查是否已有设置，而不是 get()
    // 这样可以避免在设置已存在时抛出错误
    const settingsCount = await db.settings.count()
    
    if (settingsCount === 0) {
      // 只有在没有设置时才创建
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
    
    dbLogger.info('✅ 数据库初始化完成')
  } catch (error) {
    // 输出详细的错误信息
    dbLogger.error('❌ 数据库初始化失败:')
    dbLogger.error('  错误类型:', (error as any)?.constructor?.name || 'Unknown')
    dbLogger.error('  错误消息:', (error as Error)?.message || String(error))
    dbLogger.error('  完整错误:', error)
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
      dbLogger.debug('数据库未打开，尝试打开...')
      await db.open()
    }
    
    const count = await db.confirmedVisits.count()
    dbLogger.debug('页面计数:', count)
    return count
  } catch (error) {
    dbLogger.warn('⚠️ 获取页面计数失败，返回 0:', error)
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
export async function getRecommendationStats(days: number = 7): Promise<RecommendationStats> {
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
    totalCount: total,
    readCount: read,
    unreadCount: total - read,
    readLaterCount: recentRecommendations.filter(r => r.feedback === 'later').length,
    dismissedCount: dismissed,
    avgReadDuration,
    topSources
  }
}

/**
 * 获取存储统计数据
 */
/**
 * 获取存储统计数据
 * Phase 2.7: 设置页面展示
 */
export async function getStorageStats(): Promise<StorageStats> {
  const pendingCount = await db.pendingVisits.count()
  const confirmedCount = await db.confirmedVisits.count()
  const recommendationCount = await db.recommendations.count()
  
  // 计算总页面数（= confirmed visits）
  const pageCount = confirmedCount
  
  // 估算存储大小（每条记录约 5KB）
  const avgRecordSizeKB = 5
  const totalRecords = pendingCount + confirmedCount + recommendationCount
  const totalSizeMB = (totalRecords * avgRecordSizeKB) / 1024
  
  // 计算最早采集时间和平均每日页面数
  let firstCollectionTime: number | undefined = undefined
  let avgDailyPages: number = 0
  
  if (confirmedCount > 0) {
    const visits = await db.confirmedVisits.orderBy('visitTime').toArray()
    if (visits.length > 0) {
      firstCollectionTime = visits[0].visitTime
      
      // 计算采集天数和平均每日页面数
      const now = Date.now()
      const daysSinceStart = Math.max(1, Math.ceil((now - firstCollectionTime) / (24 * 60 * 60 * 1000)))
      avgDailyPages = visits.length / daysSinceStart
    }
  }

  return {
    pageCount,
    pendingCount,
    confirmedCount,
    recommendationCount,
    totalSizeMB: totalRecords > 0 ? Math.max(0.01, Math.round(totalSizeMB * 100) / 100) : 0,
    firstCollectionTime,
    avgDailyPages
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
  dbLogger.debug('markAsRead 开始:', { id, readDuration, scrollDepth })
  
  const recommendation = await db.recommendations.get(id)
  if (!recommendation) {
    dbLogger.error('❌ 推荐记录不存在:', id)
    throw new Error(`推荐记录不存在: ${id}`)
  }
  
  dbLogger.debug('找到推荐记录:', {
    id: recommendation.id,
    title: recommendation.title,
    isRead: recommendation.isRead,
    sourceUrl: recommendation.sourceUrl
  })
  
  // 🔧 防重复：如果已经标记为已读，直接返回
  if (recommendation.isRead) {
    dbLogger.debug('⚠️ 推荐已经是已读状态，跳过重复标记:', id)
    return
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
  
  const updateCount = await db.recommendations.update(id, updates)
  dbLogger.debug('✅ markAsRead 完成:', {
    id,
    updateCount,
    updates
  })
  
  // 验证更新结果
  const updated = await db.recommendations.get(id)
  dbLogger.debug('验证更新结果:', {
    id,
    isRead: updated?.isRead,
    clickedAt: updated?.clickedAt
  })
  
  // 🔧 关键修复：立即更新 RSS 源统计
  if (recommendation.sourceUrl) {
    dbLogger.debug('开始更新 RSS 源统计:', recommendation.sourceUrl)
    await updateFeedStats(recommendation.sourceUrl)
    dbLogger.debug('✅ RSS 源统计已更新')
  }
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
  // 过滤掉已读和已忽略的推荐
  return await db.recommendations
    .orderBy('recommendedAt')
    .reverse() // 倒序（最新在前）
    .filter(r => !r.isRead && r.feedback !== 'dismissed')
    .limit(limit)
    .toArray()
}

// ==================== 用户画像操作 (Phase 3.3) ====================

/**
 * 保存或更新用户画像
 * 
 * @param profile - 用户画像
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await db.userProfile.put(profile)
}

/**
 * 获取用户画像
 * 
 * @returns 用户画像（如果不存在则返回 null）
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const profile = await db.userProfile.get('singleton')
  return profile || null
}

/**
 * 获取文本分析统计
 */
export async function getAnalysisStats(): Promise<{
  analyzedPages: number
  totalKeywords: number
  avgKeywordsPerPage: number
  languageDistribution: Array<{ language: string; count: number }>
  topKeywords: Array<{ word: string; frequency: number }>
}> {
  const confirmedVisits = await db.confirmedVisits.toArray()
  
  // 添加调试信息
  statsLogger.debug('数据库调试信息:', {
    总访问记录: confirmedVisits.length,
    有analysis字段: confirmedVisits.filter(v => v.analysis).length,
    有keywords字段: confirmedVisits.filter(v => v.analysis?.keywords).length,
    keywords非空: confirmedVisits.filter(v => v.analysis?.keywords && v.analysis.keywords.length > 0).length
  })
  
  // 详细检查每个记录
  confirmedVisits.forEach((visit, index) => {
    if (index < 5) { // 只显示前5个记录的详情
      statsLogger.debug(`记录 ${index + 1}:`, {
        url: visit.url?.substring(0, 50) + '...',
        hasAnalysis: !!visit.analysis,
        keywords: visit.analysis?.keywords?.length || 0,
        language: visit.analysis?.language || 'undefined'
      })
    }
  })
  
  // 使用统一的过滤条件（与 DataMigrator 一致）
  const analyzedVisits = confirmedVisits.filter(visit => {
    if (!visit.analysis) return false
    if (!visit.analysis.keywords) return false
    if (!Array.isArray(visit.analysis.keywords)) return false
    if (visit.analysis.keywords.length === 0) return false
    if (!visit.analysis.language) return false
    return true
  })

  statsLogger.debug('过滤后有效记录:', analyzedVisits.length)

  // 计算关键词统计
  const keywordFrequency = new Map<string, number>()
  let totalKeywords = 0

  analyzedVisits.forEach(visit => {
    if (visit.analysis?.keywords) {
      totalKeywords += visit.analysis.keywords.length
      visit.analysis.keywords.forEach(keyword => {
        keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1)
      })
    }
  })

  // Top 10 关键词
  const topKeywords = Array.from(keywordFrequency.entries())
    .map(([word, frequency]) => ({ word, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)

  // 语言分布统计
  const languageCount = new Map<string, number>()
  analyzedVisits.forEach(visit => {
    if (visit.analysis?.language) {
      const lang = visit.analysis.language === 'zh' ? '中文' : 
                   visit.analysis.language === 'en' ? '英文' : '其他'
      languageCount.set(lang, (languageCount.get(lang) || 0) + 1)
    }
  })

  const languageDistribution = Array.from(languageCount.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)

  return {
    analyzedPages: analyzedVisits.length,
    totalKeywords,
    avgKeywordsPerPage: analyzedVisits.length > 0 ? totalKeywords / analyzedVisits.length : 0,
    languageDistribution,
    topKeywords,
  }
}

/**
 * 删除用户画像
 */
export async function deleteUserProfile(): Promise<void> {
  await db.userProfile.delete('singleton')
}

/**
 * 获取 AI 分析质量统计 (Phase 4 - Sprint 5.2)
 * 
 * 统计 AI 分析 vs 关键词分析的占比、成本等
 */
export async function getAIAnalysisStats(): Promise<{
  totalPages: number
  aiAnalyzedPages: number
  keywordAnalyzedPages: number
  aiPercentage: number
  providerDistribution: Array<{ provider: string; count: number; percentage: number }>
  totalCostUSD: number
  totalCostCNY: number
  totalTokens: number
  avgCostPerPage: number
  primaryCurrency: 'USD' | 'CNY' | null
}> {
  const confirmedVisits = await db.confirmedVisits.toArray()
  
  // 过滤有效记录（有分析数据）
  const analyzedVisits = confirmedVisits.filter(visit => {
    if (!visit.analysis) return false
    if (!visit.analysis.keywords || visit.analysis.keywords.length === 0) return false
    return true
  })

  // 统计 AI 分析的页面
  const aiPages = analyzedVisits.filter(visit => visit.analysis.aiAnalysis)
  const keywordPages = analyzedVisits.filter(visit => !visit.analysis.aiAnalysis)

  // 提供商分布统计
  const providerCount = new Map<string, number>()
  aiPages.forEach(visit => {
    const provider = visit.analysis.aiAnalysis!.provider
    providerCount.set(provider, (providerCount.get(provider) || 0) + 1)
  })

  const providerDistribution = Array.from(providerCount.entries())
    .map(([provider, count]) => ({
      provider: provider === 'deepseek' ? 'DeepSeek' :
                provider === 'openai' ? 'OpenAI' :
                provider === 'anthropic' ? 'Anthropic' :
                provider === 'keyword' ? '关键词' :
                provider,
      count,
      percentage: (count / Math.max(aiPages.length, 1)) * 100
    }))
    .sort((a, b) => b.count - a.count)

  // 成本统计（分货币）
  let totalCostUSD = 0
  let totalCostCNY = 0
  let totalTokens = 0
  let currencyCount = { USD: 0, CNY: 0 }
  
  aiPages.forEach(visit => {
    const aiAnalysis = visit.analysis.aiAnalysis
    if (aiAnalysis?.cost) {
      const currency = aiAnalysis.currency || 'USD' // 默认美元
      if (currency === 'CNY') {
        totalCostCNY += aiAnalysis.cost
        currencyCount.CNY++
      } else {
        totalCostUSD += aiAnalysis.cost
        currencyCount.USD++
      }
    }
    if (aiAnalysis?.tokensUsed) {
      totalTokens += aiAnalysis.tokensUsed.total
    }
  })

  // 确定主要货币（用于显示平均成本）
  const primaryCurrency = currencyCount.CNY > currencyCount.USD ? 'CNY' : 
                         currencyCount.USD > 0 ? 'USD' : null
  const primaryCost = primaryCurrency === 'CNY' ? totalCostCNY : totalCostUSD

  return {
    totalPages: analyzedVisits.length,
    aiAnalyzedPages: aiPages.length,
    keywordAnalyzedPages: keywordPages.length,
    aiPercentage: analyzedVisits.length > 0 ? (aiPages.length / analyzedVisits.length) * 100 : 0,
    providerDistribution,
    totalCostUSD,
    totalCostCNY,
    totalTokens,
    avgCostPerPage: aiPages.length > 0 ? primaryCost / aiPages.length : 0,
    primaryCurrency
  }
}

// ==================== 兴趣快照操作 (Phase 3.4) ====================

/**
 * 保存兴趣快照
 * 
 * @param snapshot - 兴趣快照
 */
export async function saveInterestSnapshot(snapshot: InterestSnapshot): Promise<void> {
  await db.interestSnapshots.put(snapshot)
}

/**
 * 获取兴趣快照历史
 * 
 * @param limit - 限制数量（默认50）
 * @returns 按时间倒序的快照列表
 */
export async function getInterestHistory(limit: number = 50): Promise<InterestSnapshot[]> {
  return await db.interestSnapshots
    .orderBy('timestamp')
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * 获取主导兴趣变化历史
 * 
 * @param limit - 限制数量（默认20）
 * @returns 只包含主导兴趣变化的快照
 */
export async function getPrimaryTopicChanges(limit: number = 20): Promise<InterestSnapshot[]> {
  return await db.interestSnapshots
    .where('trigger')
    .equals('primary_change')
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * 获取指定主导兴趣的历史快照
 * 
 * @param primaryTopic - 主导兴趣类型
 * @param limit - 限制数量（默认10）
 */
export async function getTopicHistory(primaryTopic: string, limit: number = 10): Promise<InterestSnapshot[]> {
  return await db.interestSnapshots
    .where('[primaryTopic+timestamp]')
    .between([primaryTopic, 0], [primaryTopic, Date.now()])
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * 清理旧快照（保留最近N个月）
 * 
 * @param monthsToKeep - 保留月数（默认6个月）
 */
export async function cleanOldSnapshots(monthsToKeep: number = 6): Promise<number> {
  const cutoffTime = Date.now() - monthsToKeep * 30 * 24 * 60 * 60 * 1000
  
  const oldSnapshots = await db.interestSnapshots
    .where('timestamp')
    .below(cutoffTime)
    .toArray()
  
  if (oldSnapshots.length > 0) {
    await db.interestSnapshots
      .where('timestamp')
      .below(cutoffTime)
      .delete()
  }
  
  return oldSnapshots.length
}

/**
 * 更新 RSS 源的推荐数和已读数统计
 * Phase 6: 基于推荐池中的数据统计
 * 
 * @param feedUrl - RSS 源的 URL（用于匹配推荐来源）
 */
export async function updateFeedStats(feedUrl: string): Promise<void> {
  try {
    // 1. 找到对应的 RSS 源
    const feed = await db.discoveredFeeds.where('url').equals(feedUrl).first()
    if (!feed) {
      dbLogger.warn('未找到 RSS 源:', feedUrl)
      return
    }
    
    // 2. 统计推荐池中来自该源的推荐数（历史累计，包括已读和未读）
    const recommendedCount = await db.recommendations
      .where('sourceUrl')
      .equals(feedUrl)
      .count()  // 所有推荐（历史累计）
    
    // 3. 统计已读数（历史累计）
    const readCount = await db.recommendations
      .where('sourceUrl')
      .equals(feedUrl)
      .and(rec => rec.isRead === true)
      .count()
    
    // 4. 更新 RSS 源统计
    await db.discoveredFeeds.update(feed.id, {
      recommendedCount,
      recommendedReadCount: readCount  // Phase 6: 保存推荐已读数
    })
    
    dbLogger.debug('更新 RSS 源统计:', {
      feedUrl,
      feedTitle: feed.title,
      recommendedCount,
      readCount
    })
  } catch (error) {
    dbLogger.error('更新 RSS 源统计失败:', error)
  }
}

/**
 * 批量更新所有 RSS 源的统计信息
 * Phase 6: 在推荐生成后调用，只更新已订阅的源
 */
export async function updateAllFeedStats(): Promise<void> {
  try {
    // Phase 6: 只更新已订阅的源
    const subscribedFeeds = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()
    
    for (const feed of subscribedFeeds) {
      await updateFeedStats(feed.url)
    }
    
    dbLogger.info(`批量更新完成，共 ${subscribedFeeds.length} 个源`)
  } catch (error) {
    dbLogger.error('批量更新 RSS 源统计失败:', error)
  }
}

/**
 * 重置推荐数据
 * Phase 6: 清空推荐池和历史，重置统计数字，清除所有文章的评分和分析数据
 */
export async function resetRecommendationData(): Promise<void> {
  try {
    // 1. 清空推荐池
    await db.recommendations.clear()
    dbLogger.info('清空推荐池')
    
    // 2. 重置所有 RSS 源的推荐数为 0，并清除所有文章的评分和分析数据
    const allFeeds = await db.discoveredFeeds.toArray()
    let totalArticlesCleared = 0
    
    for (const feed of allFeeds) {
      // 清除所有文章的 analysis、recommended 和 tfidfScore 字段
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        feed.latestArticles.forEach(article => {
          delete article.analysis       // 清除 AI 分析结果
          delete article.recommended    // 清除推荐池标记
          delete article.tfidfScore     // 清除 TF-IDF 评分缓存（但保留全文）
        })
        totalArticlesCleared += feed.latestArticles.length
      }
      
      await db.discoveredFeeds.update(feed.id, {
        recommendedCount: 0,
        latestArticles: feed.latestArticles || []
      })
    }
    dbLogger.info(`重置 RSS 源推荐数: ${allFeeds.length} 个源`)
    dbLogger.info(`清除文章评分和分析数据: ${totalArticlesCleared} 篇文章`)
    
    // 3. 清空自适应指标（推荐相关的统计）
    await chrome.storage.local.remove('adaptive-metrics')
    dbLogger.info('清空自适应指标')
    
    dbLogger.info('✅ 推荐数据重置完成')
  } catch (error) {
    dbLogger.error('❌ 重置推荐数据失败:', error)
    throw error
  }
}

