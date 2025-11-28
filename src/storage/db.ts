/**
 * IndexedDB 数据库定义（使用 Dexie.js）
 * 
 * 数据库名称: SilentFeedDB
 * 当前版本: 14
 * 
 * ⚠️ 版本管理说明：
 * - 开发过程中如果遇到版本冲突，请删除旧数据库
 * - 生产环境版本号应该只增不减
 * - 版本 14（Phase 8: 语义化用户画像 - 添加 aiSummary、behaviors 字段）
 * - 版本 13（Phase 7: 推荐软删除机制 - 添加 status 字段，保留历史记录）
 * 
 * 📦 模块化结构：
 * - db.ts: 核心数据库定义 + 初始化 + 重新导出所有模块
 * - db-settings.ts: 设置管理
 * - db-profile.ts: 用户画像管理
 * - db-snapshots.ts: 兴趣快照管理
 * - db-feeds.ts: RSS Feed 管理
 * - db-recommendations.ts: 推荐管理
 * - db-stats.ts: 统计查询
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  PendingVisit,
  ConfirmedVisit,
  Recommendation,
  RecommendationStats,
  StorageStats
} from "@/types/database"
import type { UserSettings } from "@/types/config"
import type { InterestSnapshot, UserProfile } from "@/types/profile"
import type { DiscoveredFeed, FeedArticle } from "@/types/rss"
import { logger } from '@/utils/logger'
import { statsCache } from '@/utils/cache'
import { ProfileUpdateScheduler } from '@/core/profile/ProfileUpdateScheduler'

// 导出 statsCache 用于测试清理
export { statsCache }

// 创建数据库专用日志器
const dbLogger = logger.withTag('DB')
const statsLogger = logger.withTag('AnalysisStats')

/**
 * 数据库类
 */
export class SilentFeedDB extends Dexie {
  // 表 1: 临时访问记录
  pendingVisits!: Table<PendingVisit, string>
  
  // 表 2: 正式访问记录
  confirmedVisits!: Table<ConfirmedVisit, string>
  
  // 表 3: 用户设置
  settings!: Table<UserSettings, string>
  
  // 表 4: 推荐记录（Phase 2.7）
  recommendations!: Table<Recommendation, string>

  // 表 6: 用户画像（Phase 3.3）
  userProfile!: Table<UserProfile, string>

  // 表 7: 兴趣变化快照（Phase 3.4）
  interestSnapshots!: Table<InterestSnapshot, string>

  // 表 8: 发现的 RSS 源（Phase 5.1）
  discoveredFeeds!: Table<DiscoveredFeed, string>

  // 表 9: RSS 文章（Phase 7 - 数据库规范化）
  feedArticles!: Table<FeedArticle, string>

  constructor() {
    super('SilentFeedDB')
    
    // 版本 1: 原有表
    this.version(1).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp'
    })
    
    // 版本 2: 新增推荐表（Phase 2.7）
    this.version(2).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]'
    })

    // 版本 3: 新增用户画像表（Phase 3.3）
    this.version(3).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, [isRead+recommendedAt]',
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
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]'
    }).upgrade(async (tx) => {
      const feeds = await tx.table('discoveredFeeds').toArray()
      
      for (const feed of feeds) {
        const updates: Partial<DiscoveredFeed> = {}
        if (feed.isActive === undefined) updates.isActive = true
        if (feed.articleCount === undefined) updates.articleCount = 0
        if (feed.unreadCount === undefined) updates.unreadCount = 0
        if ('enabled' in feed && feed.enabled !== undefined) updates.isActive = feed.enabled
        if ('lastFetched' in feed && feed.lastFetched !== undefined) updates.lastFetchedAt = feed.lastFetched
        
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
      const feeds = await tx.table('discoveredFeeds').toArray()
      for (const feed of feeds) {
        if (feed.recommendedCount === undefined) {
          await tx.table('discoveredFeeds').update(feed.id, { recommendedCount: 0 })
        }
      }
    })

    // 版本 8: 添加 sourceUrl 索引（Phase 6）
    this.version(8).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]'
    })

    // 版本 9: 删除未使用的 feedArticles 表（Phase 6）
    this.version(9).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, domain, visitTime, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: null
    })

    // 版本 10: 索引优化（Phase 7.1）
    this.version(10).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt], [isRead+source]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
    })

    // 版本 11: 重建 feedArticles 表（Phase 7）
    this.version(11).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt], [isRead+source]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    }).upgrade(async (tx) => {
      dbLogger.info('🔄 开始数据库迁移: latestArticles → feedArticles')
      
      const feeds = await tx.table('discoveredFeeds').toArray()
      let totalArticlesMigrated = 0
      let feedsWithArticles = 0
      
      for (const feed of feeds) {
        if (feed.latestArticles && feed.latestArticles.length > 0) {
          feedsWithArticles++
          
          const articles: FeedArticle[] = feed.latestArticles.map((article: FeedArticle) => ({
            ...article,
            id: article.id || `${feed.id}_${article.link}_${article.published}`,
            feedId: feed.id
          }))
          
          try {
            await tx.table('feedArticles').bulkAdd(articles)
            totalArticlesMigrated += articles.length
          } catch (error) {
            dbLogger.warn('⚠️ 迁移文章时出现错误:', { feedId: feed.id, feedTitle: feed.title, error })
            
            for (const article of articles) {
              try {
                await tx.table('feedArticles').add(article)
                totalArticlesMigrated++
              } catch (err) {
                // 跳过重复或错误的文章
              }
            }
          }
        }
      }
      
      dbLogger.info('✅ 数据库迁移完成', {
        totalFeeds: feeds.length,
        feedsWithArticles,
        totalArticlesMigrated
      })
    })

    // 版本 12: 移除 statistics 表（Phase 7）
    this.version(12).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: null,
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt], [isRead+source]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    })
    
    // 版本 13: 推荐软删除机制（Phase 7）
    this.version(13).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    }).upgrade(async tx => {
      dbLogger.info('迁移推荐记录：添加 status 字段...')
      
      const recommendations = await tx.table('recommendations').toArray()
      const updates: Promise<any>[] = []
      
      for (const rec of recommendations) {
        let status: 'active' | 'dismissed' = 'active'
        if (rec.feedback === 'dismissed') status = 'dismissed'
        
        updates.push(
          tx.table('recommendations').update(rec.id, {
            status,
            replacedAt: rec.feedback === 'dismissed' ? rec.feedbackAt : undefined
          })
        )
      }
      
      await Promise.all(updates)
      dbLogger.info(`已迁移 ${updates.length} 条推荐记录`)
    })

    // 版本 14: 语义化用户画像（Phase 8）
    this.version(14).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    }).upgrade(async tx => {
      dbLogger.info('[Phase 8] 迁移用户画像：添加语义化字段...')
      
      const profile = await tx.table('userProfile').get('singleton')
      
      if (profile) {
        if (profile.version !== 2) {
          dbLogger.info('[Phase 8] 升级画像版本: v1 → v2')
          
          const updates: Partial<UserProfile> = {
            version: 2,
            behaviors: {
              reads: [],
              dismisses: [],
              totalReads: 0,
              totalDismisses: 0
            },
            displayKeywords: profile.keywords?.map((k: { word: string; weight: number }) => ({
              word: k.word,
              weight: k.weight,
              source: 'browse' as const
            })) || []
          }
          
          await tx.table('userProfile').update('singleton', updates)
          
          dbLogger.info('[Phase 8] ✅ 画像升级完成', {
            displayKeywords数量: updates.displayKeywords?.length || 0,
            版本: 'v2'
          })
        } else {
          dbLogger.info('[Phase 8] 画像已是 v2 版本，跳过迁移')
        }
      } else {
        dbLogger.info('[Phase 8] 未找到现有画像，将在首次构建时创建 v2 版本')
      }
    })
  }
}

/**
 * 数据库实例（单例）
 */
export const db = new SilentFeedDB()

/**
 * 检查数据库版本（仅用于调试日志）
 */
async function checkDatabaseVersion(): Promise<void> {
  try {
    const dbs = await indexedDB.databases()
    const existingDB = dbs.find(d => d.name === 'SilentFeedDB')
    
    if (existingDB && existingDB.version) {
      dbLogger.info(`现有数据库版本: ${existingDB.version}, 代码版本: 14`)
      
      if (existingDB.version > 14) {
        dbLogger.warn('⚠️ 浏览器中的数据库版本较高，Dexie 将自动处理')
      }
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
      dbLogger.info('✅ 数据库已打开（版本 14）')
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
    
    dbLogger.info('✅ 数据库初始化完成')
  } catch (error) {
    dbLogger.error('❌ 数据库初始化失败:', error)
    throw error
  }
}

// ========================================
// 模块重新导出 - 保持向后兼容
// ========================================

// 设置管理模块（db-settings.ts）
export { getSettings, updateSettings, getPageCount } from './db-settings'

// 用户画像模块（db-profile.ts）
export { saveUserProfile, getUserProfile, deleteUserProfile } from './db-profile'

// 兴趣快照模块（db-snapshots.ts）
export { 
  saveInterestSnapshot, 
  getInterestHistory, 
  getPrimaryTopicChanges, 
  getTopicHistory, 
  cleanOldSnapshots 
} from './db-snapshots'

// RSS Feed 管理模块（db-feeds.ts）
export { updateFeedStats, updateAllFeedStats } from './db-feeds'

// 推荐管理模块（db-recommendations.ts）
export { 
  markAsRead, 
  dismissRecommendations, 
  getUnreadRecommendations,
  getUnrecommendedArticleCount,
  resetRecommendationData
} from './db-recommendations'

// 统计查询模块（待拆分）
// TODO: 下一步创建 db-stats.ts 模块将以下函数移出

/**
 * Phase 2.7: 获取推荐统计信息
 * 
 * Phase 7: 支持选择统计范围
 * 
 * @param days - 统计最近 N 天的数据（默认 7 天）
 * @param onlyActive - 是否只统计活跃推荐（默认 false，统计所有历史）
 */
export async function getRecommendationStats(
  days: number = 7, 
  onlyActive: boolean = false
): Promise<RecommendationStats> {
  return statsCache.get(
    `rec-stats-${days}d-${onlyActive ? 'active' : 'all'}`,
    async () => {
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000
      
      // 查询最近 N 天的推荐记录
      let recentRecommendations = await db.recommendations
        .where('recommendedAt')
        .above(cutoffTime)
        .toArray()
      
      // Phase 7: 如果只统计活跃推荐，过滤掉非活跃状态
      if (onlyActive) {
        recentRecommendations = recentRecommendations.filter(r => 
          !r.status || r.status === 'active'
        )
      }
      
      const total = recentRecommendations.length
      const read = recentRecommendations.filter(r => r.isRead).length
      const dismissed = recentRecommendations.filter(r => 
        r.feedback === 'dismissed' || r.status === 'dismissed'
      ).length
      
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
    },
    300  // 5 分钟缓存
  )
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



// ==================== 用户画像操作 (Phase 3.3) ====================



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

  // 语言分布统计（保留原始语言代码，由 UI 层处理国际化）
  const languageCount = new Map<string, number>()
  analyzedVisits.forEach(visit => {
    if (visit.analysis?.language) {
      // 直接使用语言代码，不做转换
      const lang = visit.analysis.language
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
  providerCostDistribution: Array<{ provider: string; costUSD: number; costCNY: number; tokens: number }>
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

  // 统计 AI 分析的页面（只统计远程 AI）
  const remoteAIProviders = ['openai', 'anthropic', 'deepseek']
  const aiPages = analyzedVisits.filter(visit => {
    if (!visit.analysis.aiAnalysis) return false
    return remoteAIProviders.includes(visit.analysis.aiAnalysis.provider)
  })
  const keywordPages = analyzedVisits.filter(visit => !visit.analysis.aiAnalysis)

  // 提供商分布统计（只包含远程 AI）
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
  
  // 定义每个提供商的标准货币
  const providerStandardCurrency: Record<string, 'USD' | 'CNY'> = {
    'openai': 'USD',
    'anthropic': 'USD',
    'deepseek': 'CNY'
  }
  
  // 按提供商统计成本
  const providerCostMap = new Map<string, { costUSD: number; costCNY: number; tokens: number }>()
  
  aiPages.forEach(visit => {
    const aiAnalysis = visit.analysis.aiAnalysis
    const provider = aiAnalysis!.provider
    const standardCurrency = providerStandardCurrency[provider] || 'USD'
    
    // 初始化提供商统计
    if (!providerCostMap.has(provider)) {
      providerCostMap.set(provider, { costUSD: 0, costCNY: 0, tokens: 0 })
    }
    const providerStats = providerCostMap.get(provider)!
    
    if (aiAnalysis?.cost) {
      const currency = aiAnalysis.currency || 'USD' // 默认美元
      
      // 只统计该提供商的标准货币
      if (currency === standardCurrency) {
        if (currency === 'CNY') {
          totalCostCNY += aiAnalysis.cost
          providerStats.costCNY += aiAnalysis.cost
          currencyCount.CNY++
        } else {
          totalCostUSD += aiAnalysis.cost
          providerStats.costUSD += aiAnalysis.cost
          currencyCount.USD++
        }
      }
    }
    if (aiAnalysis?.tokensUsed) {
      const tokens = aiAnalysis.tokensUsed.total
      totalTokens += tokens
      providerStats.tokens += tokens
    }
  })

  // 转换为数组格式（只包含远程 AI 提供商）
  const providerCostDistribution = Array.from(providerCostMap.entries())
    .filter(([provider]) => remoteAIProviders.includes(provider))
    .map(([provider, stats]) => ({
      provider: provider === 'deepseek' ? 'DeepSeek' :
                provider === 'openai' ? 'OpenAI' :
                provider === 'anthropic' ? 'Anthropic' :
                provider,
      costUSD: stats.costUSD,
      costCNY: stats.costCNY,
      tokens: stats.tokens
    }))
    .sort((a, b) => {
      // 按总成本排序（USD + CNY 换算）
      const totalA = a.costUSD + a.costCNY / 7 // 简单换算，1 USD ≈ 7 CNY
      const totalB = b.costUSD + b.costCNY / 7
      return totalB - totalA
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
    providerCostDistribution,
    totalCostUSD,
    totalCostCNY,
    totalTokens,
    avgCostPerPage: aiPages.length > 0 ? primaryCost / aiPages.length : 0,
    primaryCurrency
  }
}

// ==================== 兴趣快照操作 (Phase 3.4) ====================



/**
 * 获取 RSS 文章总数
 * Phase 10.2: 系统数据展示优化
 * 
 * @returns RSS 文章总数（从所有已发现的 Feed 的 latestArticles 聚合）
 */
export async function getRSSArticleCount(): Promise<number> {
  try {
    const allFeeds = await db.discoveredFeeds.toArray()
    
    let totalArticles = 0
    for (const feed of allFeeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        totalArticles += feed.latestArticles.length
      }
    }
    
    return totalArticles
  } catch (error) {
    dbLogger.error('获取 RSS 文章总数失败:', error)
    return 0
  }
}

/**
 * 推荐筛选漏斗统计
 * Phase 10.3: 重构漏斗数据结构
 * 
 * 漏斗层级：
 * - rssArticles: RSS 累计读取的文章总数（去重）
 * - inPool: 累计放入推荐池的文章数
 * - notified: 累计进入弹窗的文章数
 * - read: 累计阅读数
 * 
 * 侧边数据：
 * - learningPages: 学习页面总数
 * - dismissed: 不想读总数
 */
export async function getRecommendationFunnel(): Promise<{
  rssArticles: number
  inPool: number
  notified: number
  read: number
  learningPages: number
  dismissed: number
}> {
  try {
    // 统计 RSS 文章总数（去重）
    const allFeeds = await db.discoveredFeeds.toArray()
    const articleUrls = new Set<string>()
    for (const feed of allFeeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        feed.latestArticles.forEach(article => {
          if (article.link) articleUrls.add(article.link)
        })
      }
    }
    const rssArticlesCount = articleUrls.size
    
    // 推荐统计
    const allRecommendations = await db.recommendations.toArray()
    const inPoolCount = allRecommendations.length
    
    // 统计弹窗通知数（所有 active 状态的推荐在创建时都会被通知）
    const notifiedCount = allRecommendations.filter(r => r.status === 'active').length
    
    // 统计已读数（使用 isRead 字段）
    const readCount = allRecommendations.filter(r => r.isRead === true).length
    
    // 统计不想读（status 为 dismissed）
    const dismissedCount = allRecommendations.filter(r => r.status === 'dismissed').length
    
    // 统计学习页面数
    const learningPagesCount = await db.confirmedVisits.count()
    
    return {
      rssArticles: rssArticlesCount,
      inPool: inPoolCount,
      notified: notifiedCount,
      read: readCount,
      learningPages: learningPagesCount,
      dismissed: dismissedCount
    }
  } catch (error) {
    dbLogger.error('获取推荐漏斗统计失败:', error)
    return {
      rssArticles: 0,
      inPool: 0,
      notified: 0,
      read: 0,
      learningPages: 0,
      dismissed: 0
    }
  }
}
