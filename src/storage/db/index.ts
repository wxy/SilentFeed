/**
 * IndexedDB 数据库定义（使用 Dexie.js）
 * 
 * 数据库名称: SilentFeedDB
 * 当前版本: 15
 * 
 * ⚠️ 版本管理说明：
 * - 开发过程中如果遇到版本冲突，请删除旧数据库
 * - 生产环境版本号应该只增不减
 * - 版本 15（Phase 9: AI 用量计费 - 添加 aiUsage 表）
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
  Recommendation
} from "@/types/database"
import type { UserSettings } from "@/types/config"
import type { InterestSnapshot, UserProfile } from "@/types/profile"
import type { DiscoveredFeed, FeedArticle } from "@/types/rss"
import type { AIUsageRecord } from "@/types/ai-usage"
import { logger } from '@/utils/logger'
import { statsCache } from '@/utils/cache'

// 导出 statsCache 用于测试清理
export { statsCache }

// 创建数据库专用日志器
const dbLogger = logger.withTag('DB')

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

  // 表 10: AI 用量记录（Phase 9 - AI 用量计费）
  aiUsage!: Table<AIUsageRecord, string>

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

    // 版本 15: AI 用量计费表（Phase 9）
    this.version(15).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]',
      aiUsage: 'id, timestamp, provider, purpose, success, [provider+timestamp], [purpose+timestamp]'
    }).upgrade(async tx => {
      dbLogger.info('[Phase 9] 创建 AI 用量计费表...')
      // 表会自动创建，无需迁移数据
      dbLogger.info('[Phase 9] ✅ AI 用量计费表创建完成')
    })
  }
}

/**
 * 数据库实例（单例）
 */
export const db = new SilentFeedDB()

// ========================================
// 模块重新导出 - 保持向后兼容
// ========================================

// 数据库初始化模块（db-init.ts）
export { initializeDatabase } from './db-init'

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
// 统计查询模块（db-stats.ts）
export {
  getRecommendationStats,
  getStorageStats,
  getAnalysisStats,
  getAIAnalysisStats,
  getRSSArticleCount,
  getRecommendationFunnel
} from './db-stats'
