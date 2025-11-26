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

    // 版本 11: 重建 feedArticles 表（Phase 7 - 数据库规范化）
    // 将嵌入式文章数据提取为独立表，符合数据库范式
    this.version(11).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: 'id, type, timestamp',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt], [isRead+source]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      
      // RSS 文章表（独立存储）
      // 索引说明：
      // - id: 主键
      // - feedId: 所属 Feed（高频：where('feedId').equals()）
      // - link: 文章链接（去重：where('link').equals()）
      // - published: 发布时间（排序：orderBy('published')）
      // - recommended: 是否已推荐（筛选：where('recommended').equals()）
      // - read: 是否已读（筛选：where('read').equals()）
      // - [feedId+published]: 复合索引（按 Feed 查询最新文章）
      // - [recommended+published]: 复合索引（查询推荐文章时间线）
      // - [read+published]: 复合索引（查询未读文章）
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    }).upgrade(async (tx) => {
      // 数据迁移：从 discoveredFeeds.latestArticles 迁移到 feedArticles 表
      dbLogger.info('🔄 开始数据库迁移: latestArticles → feedArticles')
      
      const feeds = await tx.table('discoveredFeeds').toArray()
      let totalArticlesMigrated = 0
      let feedsWithArticles = 0
      
      for (const feed of feeds) {
        if (feed.latestArticles && feed.latestArticles.length > 0) {
          feedsWithArticles++
          
          // 为每篇文章生成 id（如果没有的话）并添加 feedId
          const articles: FeedArticle[] = feed.latestArticles.map((article: FeedArticle) => ({
            ...article,
            id: article.id || `${feed.id}_${article.link}_${article.published}`,
            feedId: feed.id
          }))
          
          // 批量插入文章
          try {
            await tx.table('feedArticles').bulkAdd(articles)
            totalArticlesMigrated += articles.length
          } catch (error) {
            // 忽略重复键错误（可能是重复的 link）
            dbLogger.warn('⚠️ 迁移文章时出现错误:', {
              feedId: feed.id,
              feedTitle: feed.title,
              articleCount: articles.length,
              error
            })
            
            // 尝试逐个插入，跳过重复项
            for (const article of articles) {
              try {
                await tx.table('feedArticles').add(article)
                totalArticlesMigrated++
              } catch (err) {
                // 跳过重复或错误的文章
              }
            }
          }
          
          // 保留 latestArticles 字段以支持旧版本代码读取
          // 未来版本可以移除此字段
        }
      }
      
      dbLogger.info('✅ 数据库迁移完成', {
        totalFeeds: feeds.length,
        feedsWithArticles,
        totalArticlesMigrated
      })
    })

    // 版本 12: 移除 statistics 表（Phase 7 - 持续优化）
    // 使用内存缓存 (statsCache) 代替数据库缓存
    this.version(12).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      statistics: null,  // 删除 statistics 表
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, [isRead+recommendedAt], [isRead+source]',
      userProfile: 'id, lastUpdated',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    })
    
    // 版本 13: 推荐软删除机制（Phase 7）
    // 添加 status 字段和索引，保留被淘汰的推荐历史
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
      // 数据迁移：为现有推荐记录设置默认状态
      dbLogger.info('迁移推荐记录：添加 status 字段...')
      
      const recommendations = await tx.table('recommendations').toArray()
      const updates: Promise<any>[] = []
      
      for (const rec of recommendations) {
        // 根据现有字段判断状态
        let status: 'active' | 'dismissed' = 'active'
        
        if (rec.feedback === 'dismissed') {
          status = 'dismissed'
        }
        
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
    // 添加 aiSummary 和 behaviors 字段，支持 AI 驱动的深度理解
    this.version(14).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',  // 添加 version 索引
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [recommended+published], [read+published]'
    }).upgrade(async tx => {
      // 数据迁移：升级用户画像到 v2
      dbLogger.info('[Phase 8] 迁移用户画像：添加语义化字段...')
      
      const profile = await tx.table('userProfile').get('singleton')
      
      if (profile) {
        // 检查版本号
        if (profile.version !== 2) {
          dbLogger.info('[Phase 8] 升级画像版本: v1 → v2')
          
          // 初始化新字段
          const updates: Partial<UserProfile> = {
            version: 2,
            // 初始化行为记录
            behaviors: {
              reads: [],
              dismisses: [],
              totalReads: 0,
              totalDismisses: 0
            },
            // 将现有关键词转换为 displayKeywords 格式
            displayKeywords: profile.keywords?.map(k => ({
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
 * 
 * ⚠️ 不再自动删除旧数据库，让 Dexie 自动处理版本升级
 */
async function checkDatabaseVersion(): Promise<void> {
  try {
    const dbs = await indexedDB.databases()
    const existingDB = dbs.find(d => d.name === 'SilentFeedDB')
    
    if (existingDB && existingDB.version) {
      dbLogger.info(`现有数据库版本: ${existingDB.version}, 代码版本: 13`)
      
      if (existingDB.version > 13) {
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
      dbLogger.info('✅ 数据库已打开（版本 12）')
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
 * ✅ 优化：使用缓存减少重复计算（5 分钟 TTL）
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
  
  // ✅ 清除统计缓存
  statsCache.invalidate('rec-stats-7d')
  
  // 验证更新结果
  const updated = await db.recommendations.get(id)
  dbLogger.debug('验证更新结果:', {
    id,
    isRead: updated?.isRead,
    clickedAt: updated?.clickedAt
  })
  
  // 🔧 Phase 6: 立即更新 RSS 源统计（会重新计算 recommendedReadCount）
  // Phase 7 优化: recommendedReadCount 直接从推荐池统计，无需同步 latestArticles
  if (recommendation.sourceUrl) {
    dbLogger.debug('开始更新 RSS 源统计:', recommendation.sourceUrl)
    await updateFeedStats(recommendation.sourceUrl)
    dbLogger.debug('✅ RSS 源统计已更新')
  }
  
  // 🚀 Phase 8.3: 用户阅读行为立即触发画像更新
  // 确保用户偏好能立即反映在下次推荐中
  ProfileUpdateScheduler.forceUpdateProfile('user_read').catch(error => {
    dbLogger.error('❌ 用户阅读后画像更新失败:', error)
  })
}

/**
 * 标记推荐为"不想读"
 * 
 * Phase 7: 使用软删除，更新 status 为 dismissed
 * 
 * @param ids - 推荐记录 ID 数组
 */
export async function dismissRecommendations(ids: string[]): Promise<void> {
  const now = Date.now()
  const sourceUrls = new Set<string>()
  
  await db.transaction('rw', db.recommendations, db.feedArticles, async () => {
    for (const id of ids) {
      // 1. 更新推荐表（Phase 7: 添加 status 字段）
      await db.recommendations.update(id, {
        feedback: 'dismissed',
        feedbackAt: now,
        effectiveness: 'ineffective',
        status: 'dismissed',  // Phase 7: 软删除标记
        replacedAt: now       // Phase 7: 记录标记时间
      })
      
      // Phase 7: 2. 同步更新 feedArticles 表中的文章状态
      const recommendation = await db.recommendations.get(id)
      if (recommendation?.url) {
        try {
          // 通过 URL 查找文章
          const article = await db.feedArticles
            .where('link').equals(recommendation.url)
            .first()
          
          if (article) {
            // 标记文章为不想读
            await db.feedArticles.update(article.id, { disliked: true })
            dbLogger.debug('✅ 已同步标记文章为不想读:', article.title)
          } else {
            dbLogger.warn('⚠️ 未找到匹配的文章:', recommendation.url)
          }
          
          // 3. 收集需要更新统计的源 URL
          if (recommendation.sourceUrl) {
            sourceUrls.add(recommendation.sourceUrl)
          }
        } catch (error) {
          dbLogger.warn('同步更新文章不想读状态失败:', error)
        }
      }
    }
  })
  
  // 4. 事务外更新统计（确保能看到事务提交后的数据）
  for (const sourceUrl of sourceUrls) {
    await updateFeedStats(sourceUrl)
  }
  
  // 🚀 Phase 8.3: 用户拒绝行为立即触发画像更新
  // 确保用户不喜欢的内容能立即影响推荐
  ProfileUpdateScheduler.forceUpdateProfile('user_dismiss').catch(error => {
    dbLogger.error('❌ 用户拒绝后画像更新失败:', error)
  })
}

/**
 * 获取未读推荐（按时间倒序）
 * 
 * Phase 7: 只返回 active 状态的推荐
 * 
 * @param limit - 数量限制（默认 50）
 */
export async function getUnreadRecommendations(limit: number = 50): Promise<Recommendation[]> {
  // Phase 7: 过滤掉已读、已忽略和非活跃的推荐，按推荐分数排序
  const recommendations = await db.recommendations
    .filter(r => {
      // 必须是活跃状态
      const isActive = !r.status || r.status === 'active'
      // 未读且未被忽略
      const isUnreadAndNotDismissed = !r.isRead && r.feedback !== 'dismissed'
      return isActive && isUnreadAndNotDismissed
    })
    .toArray()
  
  // 按推荐分数降序排序，取前 N 条
  return recommendations
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit)
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
 * Phase 7: 从 feedArticles 表聚合统计（性能优化）+ 软删除支持
 * 
 * @param feedUrl - RSS 源的 URL（用于匹配推荐来源）
 * 
 * 统计字段说明：
 * - articleCount: feedArticles 总数
 * - analyzedCount: 已 AI 分析的文章数（有 analysis 字段）
 * - recommendedCount: 该源的所有推荐数（包括历史，与推荐统计一致）
 * - readCount: feedArticles 中标记为已读的文章数
 * - dislikedCount: 该源的不想读数（包括历史，与推荐统计一致）
 * - recommendedReadCount: 该源推荐被阅读数（包括历史，与推荐统计一致）
 */
export async function updateFeedStats(feedUrl: string): Promise<void> {
  try {
    // 1. 找到对应的 RSS 源
    const feed = await db.discoveredFeeds.where('url').equals(feedUrl).first()
    if (!feed) {
      dbLogger.warn('未找到 RSS 源:', feedUrl)
      return
    }
    
    // Phase 7: 从 feedArticles 表聚合文章统计
    // 2. 获取该 Feed 的所有文章
    const articles = await db.feedArticles
      .where('feedId').equals(feed.id)
      .toArray()
    
    // 3. 计算文章统计
    const totalCount = articles.length
    const analyzedCount = articles.filter(a => a.analysis).length
    const readCount = articles.filter(a => a.read).length
    const unreadCount = articles.filter(a => !a.read).length
    
    // 4. 从推荐池统计（Phase 7: 统计所有历史，不过滤 status）
    const recommendationsFromThisFeed = await db.recommendations
      .where('sourceUrl')
      .equals(feedUrl)
      .toArray()
    
    // Phase 7: 统计所有历史记录（不过滤 status），确保数据完整准确
    const recommendedCount = recommendationsFromThisFeed.length
    const recommendedReadCount = recommendationsFromThisFeed.filter(rec => rec.isRead === true).length
    const dislikedCount = recommendationsFromThisFeed.filter(rec => 
      rec.feedback === 'dismissed' || rec.status === 'dismissed'
    ).length
    
    // 5. 更新 RSS 源统计
    await db.discoveredFeeds.update(feed.id, {
      articleCount: totalCount,
      analyzedCount,
      recommendedCount,      // 所有历史推荐（包括被替换的）
      readCount,
      dislikedCount,         // 所有历史不想读（包括被替换的）
      unreadCount,
      recommendedReadCount   // 所有历史已读推荐
    })
    
    dbLogger.debug('更新 RSS 源统计:', {
      feedUrl,
      feedTitle: feed.title,
      总文章数: totalCount,
      已分析: analyzedCount,
      已推荐: recommendedCount,
      已阅读: readCount,
      不想读: dislikedCount,
      未读: unreadCount,
      推荐已读: recommendedReadCount
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
 * 获取待推荐文章数量
 * 
 * Phase 7: 用于动态调整推荐生成频率
 * 
 * @param source - 来源类型
 * @returns 待推荐文章数量（未分析的文章）
 */
export async function getUnrecommendedArticleCount(
  source: 'subscribed' | 'all' = 'subscribed'
): Promise<number> {
  try {
    // 1. 获取 RSS 源
    let feeds: DiscoveredFeed[]
    if (source === 'subscribed') {
      feeds = await db.discoveredFeeds
        .where('status')
        .equals('subscribed')
        .toArray()
    } else {
      feeds = await db.discoveredFeeds.toArray()
    }
    
    // 2. 统计未分析的文章
    let totalUnanalyzed = 0
    for (const feed of feeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        const unanalyzedCount = feed.latestArticles.filter(
          article => !article.analysis  // 未分析过
        ).length
        totalUnanalyzed += unanalyzedCount
      }
    }
    
    return totalUnanalyzed
  } catch (error) {
    dbLogger.error('获取待推荐文章数量失败:', error)
    return 0
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
 * Phase 10.2: 系统数据展示优化
 * 
 * 展示推荐系统的数据流：
 * - total: RSS 文章总数
 * - analyzed: 已分析文章数（有 analysis 字段）
 * - recommended: 进入推荐池的文章数
 * - dismissed: 用户标记"不想读"的推荐数
 * - read: 用户已读的推荐数
 */
export async function getRecommendationFunnel(): Promise<{
  total: number
  analyzed: number
  recommended: number
  dismissed: number
  read: number
}> {
  try {
    const allFeeds = await db.discoveredFeeds.toArray()
    
    let totalArticles = 0
    let analyzedArticles = 0
    
    for (const feed of allFeeds) {
      if (feed.latestArticles && feed.latestArticles.length > 0) {
        totalArticles += feed.latestArticles.length
        analyzedArticles += feed.latestArticles.filter(article => article.analysis).length
      }
    }
    
    // 推荐统计
    const allRecommendations = await db.recommendations.toArray()
    const recommendedCount = allRecommendations.length
    const dismissedCount = allRecommendations.filter(r => r.status === 'dismissed').length
    const readCount = allRecommendations.filter(r => r.status === 'read').length
    
    return {
      total: totalArticles,
      analyzed: analyzedArticles,
      recommended: recommendedCount,
      dismissed: dismissedCount,
      read: readCount
    }
  } catch (error) {
    dbLogger.error('获取推荐漏斗统计失败:', error)
    return {
      total: 0,
      analyzed: 0,
      recommended: 0,
      dismissed: 0,
      read: 0
    }
  }
}
