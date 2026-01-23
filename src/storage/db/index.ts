/**
 * IndexedDB 数据库定义（使用 Dexie.js）
 * 
 * 数据库名称: SilentFeedDB
 * 当前版本: 21
 * 
 * ⚠️ 版本管理说明：
 * - 开发过程中如果遇到版本冲突，请删除旧数据库
 * - 生产环境版本号应该只增不减
 * - 版本 21（推荐系统统一 - 删除 recommendations 表，所有推荐数据在 feedArticles 中）
 * - 版本 20（阅读清单模式 - 阅读列表追踪表）
 * - 版本 19（策略存储重构 - 移除 strategyDecisions 表，迁移到 chrome.storage.local）
 * - 版本 18（推荐系统重构 - 多池架构 + 策略决策表）
 * - 版本 17（Phase 12.8: 页面访问去重支持）
 * - 版本 16（Phase 10: 文章持久化重构）
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
 * - db-recommendations.ts: 推荐管理（弹窗查询，基于 feedArticles）
 * - db-stats.ts: 统计查询
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  PendingVisit,
  ConfirmedVisit,
  ReadingListEntry
} from "@/types/database"
import type { UserSettings } from "@/types/config"
import type { InterestSnapshot, UserProfile } from "@/types/profile"
import type { DiscoveredFeed, FeedArticle } from "@/types/rss"
import type { AIUsageRecord } from "@/types/ai-usage"
import type { StrategyDecision } from "@/types/strategy"
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
  
  // 表 4: 阅读列表追踪（Phase 15）
  readingListEntries!: Table<ReadingListEntry, string>

  // 表 5: 用户画像（Phase 3.3）
  userProfile!: Table<UserProfile, string>

  // 表 6: 兴趣变化快照（Phase 3.4）
  interestSnapshots!: Table<InterestSnapshot, string>

  // 表 7: 发现的 RSS 源（Phase 5.1）
  discoveredFeeds!: Table<DiscoveredFeed, string>

  // 表 8: RSS 文章（Phase 7 - 数据库规范化）
  // Phase 13+: 包含推荐相关字段，统一推荐数据
  feedArticles!: Table<FeedArticle, string>

  // 表 9: AI 用量记录（Phase 9 - AI 用量计费）
  aiUsage!: Table<AIUsageRecord, string>

  // 注意：
  // - recommendations 表已删除（v21），推荐数据统一在 feedArticles 中
  // - strategyDecisions 
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

    // 版本 16: 文章持久化重构（Phase 10）
    this.version(16).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, visitTime, domain, *analysis.keywords, [visitTime+domain]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      // Phase 10: 添加新索引支持文章持久化
      feedArticles: 'id, feedId, link, published, recommended, read, inPool, inFeed, deleted, [feedId+published], [recommended+published], [read+published], [inPool+poolAddedAt], [inFeed+published], [deleted+deletedAt]',
      aiUsage: 'id, timestamp, provider, purpose, success, [provider+timestamp], [purpose+timestamp]'
    }).upgrade(async tx => {
      dbLogger.info('[Phase 10] 文章持久化重构 - 添加新字段和索引...')
      
      // 初始化新字段的默认值
      const articles = await tx.table('feedArticles').toArray()
      
      for (const article of articles) {
        const updates: any = {}
        
        // inFeed: 假设现有文章都还在 RSS 源中
        if (article.inFeed === undefined) {
          updates.inFeed = true
          updates.lastSeenInFeed = article.fetched || Date.now()
        }
        
        // inPool: 如果文章已被推荐且未读未不想读，则可能在推荐池中
        // 注意：这只是估算，真实状态需要从 recommendations 表同步
        if (article.inPool === undefined && article.recommended && !article.read && !article.disliked) {
          updates.inPool = false  // 默认不在池中，由后续迁移脚本处理
        }
        
        // deleted: 默认未删除
        if (article.deleted === undefined) {
          updates.deleted = false
        }
        
        // 如果有更新，应用它们
        if (Object.keys(updates).length > 0) {
          await tx.table('feedArticles').update(article.id, updates)
        }
      }
      
      dbLogger.info(`[Phase 10] ✅ 已初始化 ${articles.length} 篇文章的新字段`)
    })

    // 版本 17: 页面访问去重支持（Phase 12.8）
    this.version(17).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, url, visitTime, domain, *analysis.keywords, [visitTime+domain], [url+visitTime]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, inPool, inFeed, deleted, [feedId+published], [recommended+published], [read+published], [inPool+poolAddedAt], [inFeed+published], [deleted+deletedAt]',
      aiUsage: 'id, timestamp, provider, purpose, success, [provider+timestamp], [purpose+timestamp]'
    })

    // 版本 18: 多池架构和策略决策表（推荐系统重构）
    this.version(18).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, url, visitTime, domain, *analysis.keywords, [visitTime+domain], [url+visitTime]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      // 多池架构：添加 poolStatus, analysisScore 索引
      feedArticles: 'id, feedId, link, published, recommended, read, inPool, inFeed, deleted, poolStatus, analysisScore, [feedId+published], [recommended+published], [read+published], [inPool+poolAddedAt], [inFeed+published], [deleted+deletedAt], [poolStatus+analysisScore], [poolStatus+candidatePoolAddedAt]',
      aiUsage: 'id, timestamp, provider, purpose, success, [provider+timestamp], [purpose+timestamp]',
      // 新增：策略决策表
      strategyDecisions: 'id, createdAt, validUntil, nextReview, status, [status+createdAt]'
    }).upgrade(async tx => {
      dbLogger.info('[推荐系统重构] 多池架构迁移 - 初始化池状态字段...')
      
      // 迁移所有现有文章的池状态
      const articles = await tx.table('feedArticles').toArray()
      let rawCount = 0
      let analyzedNotQualifiedCount = 0
      let candidateCount = 0
      let recommendedCount = 0
      
      for (const article of articles) {
        const updates: any = {}
        
        // 确定池状态
        if (article.recommended) {
          // 已推荐的文章
          updates.poolStatus = 'recommended'
          updates.recommendedPoolAddedAt = article.recommendedAt || article.published
          recommendedCount++
        } else if (article.analysisScore !== undefined && article.analysisScore !== null) {
          // 已分析过的文章
          if (article.analysisScore >= 7.0) {
            // 高分文章进入候选池
            updates.poolStatus = 'candidate'
            updates.candidatePoolAddedAt = article.fetched || Date.now()
            candidateCount++
          } else {
            // 低分文章标记为不合格
            updates.poolStatus = 'analyzed-not-qualified'
            analyzedNotQualifiedCount++
          }
        } else {
          // 未分析的文章
          updates.poolStatus = 'raw'
          rawCount++
        }
        
        // 应用更新
        if (Object.keys(updates).length > 0) {
          await tx.table('feedArticles').update(article.id, updates)
        }
      }
      
      dbLogger.info(`[推荐系统重构] ✅ 文章池状态初始化完成`, {
        总文章数: articles.length,
        raw池: rawCount,
        'analyzed-not-qualified池': analyzedNotQualifiedCount,
        candidate池: candidateCount,
        recommended池: recommendedCount
      })
    })

    // 版本 19: 移除策略决策表，迁移到 chrome.storage.local
    this.version(19).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, url, visitTime, domain, *analysis.keywords, [visitTime+domain], [url+visitTime]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, inPool, inFeed, deleted, poolStatus, analysisScore, [feedId+published], [recommended+published], [read+published], [inPool+poolAddedAt], [inFeed+published], [deleted+deletedAt], [poolStatus+analysisScore], [poolStatus+candidatePoolAddedAt]',
      aiUsage: 'id, timestamp, provider, purpose, success, [provider+timestamp], [purpose+timestamp]',
      // 移除 strategyDecisions 表
      strategyDecisions: null
    }).upgrade(async tx => {
      dbLogger.info('[策略存储重构] 迁移策略到 chrome.storage.local...')
      
      // 将当前有效策略迁移到 chrome.storage.local
      try {
        const activeStrategy = await tx.table('strategyDecisions')
          .where('status')
          .equals('active')
          .first()
        
        if (activeStrategy) {
          await chrome.storage.local.set({
            'current_strategy': activeStrategy
          })
          dbLogger.info('✅ 策略已迁移到 chrome.storage.local', { id: activeStrategy.id })
        }
      } catch (error) {
        dbLogger.error('策略迁移失败（非关键错误，可忽略）', error)
      }
      
      dbLogger.info('✅ 策略决策表已移除，现在使用 chrome.storage.local')
    })

    // 版本 20: 阅读清单追踪表（静默模式）
    this.version(20).stores({
      pendingVisits: 'id, url, startTime, expiresAt',
      confirmedVisits: 'id, url, visitTime, domain, *analysis.keywords, [visitTime+domain], [url+visitTime]',
      settings: 'id',
      recommendations: 'id, recommendedAt, isRead, source, sourceUrl, status, replacedAt, [isRead+recommendedAt], [isRead+source], [status+recommendedAt]',
      userProfile: 'id, lastUpdated, version',
      interestSnapshots: 'id, timestamp, primaryTopic, trigger, [primaryTopic+timestamp]',
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt, discoveredFrom, isActive, lastFetchedAt, [status+discoveredAt], [isActive+lastFetchedAt]',
      feedArticles: 'id, feedId, link, published, recommended, read, inPool, inFeed, deleted, poolStatus, analysisScore, [feedId+published], [recommended+published], [read+published], [inPool+poolAddedAt], [inFeed+published], [deleted+deletedAt], [poolStatus+analysisScore], [poolStatus+candidatePoolAddedAt]',
      aiUsage: 'id, timestamp, provider, purpose, success, [provider+timestamp], [purpose+timestamp]',
      readingListEntries: 'url, normalizedUrl, recommendationId, shortId, addedAt, titlePrefix'  // 添加 shortId 索引
    }).upgrade(async tx => {
      dbLogger.info('[阅读清单模式] 初始化 readingListEntries 表...')
      // 无需迁移数据，表结构即可创建
      const count = await tx.table('readingListEntries').count()
      dbLogger.info(`[阅读清单模式] ✅ readingListEntries 表已就绪，现有记录: ${count}`)
    })

    // v21: 删除 recommendations 表，统一使用 feedArticles.poolStatus='popup'
    this.version(21).stores({
      recommendations: null  // 删除表
    }).upgrade(async tx => {
      dbLogger.info('[架构简化] 删除 recommendations 表...')
      // 表会被自动删除，无需手动操作
      dbLogger.info('[架构简化] ✅ recommendations 表已删除，推荐数据统一存储在 feedArticles 中')
    })

    // v22: 推荐池与显示方式分离 - 将 poolStatus='popup' 改为 'recommended'
    this.version(22).upgrade(async tx => {
      dbLogger.info('[架构简化] 推荐池与显示方式分离：popup → recommended')
      
      // 1. 迁移 popup 状态到 recommended
      const popupArticles = await tx.table('feedArticles')
        .filter(a => a.poolStatus === 'popup')
        .toArray()
      
      if (popupArticles.length > 0) {
        dbLogger.info(`[迁移] 发现 ${popupArticles.length} 篇 popup 状态文章，开始迁移...`)
        
        for (const article of popupArticles) {
          await tx.table('feedArticles').update(article.id, {
            poolStatus: 'recommended'
          })
        }
        
        dbLogger.info(`[迁移] ✅ 已将 ${popupArticles.length} 篇文章从 popup 改为 recommended`)
      }
      
      // 2. 处理已有 poolStatus='recommended' 的文章（Phase 13 遗留）
      // 这些文章状态已正确，只需确认并清理旧字段
      const alreadyRecommended = await tx.table('feedArticles')
        .filter(a => a.poolStatus === 'recommended')
        .toArray()
      
      if (alreadyRecommended.length > 0) {
        dbLogger.info(`[验证] 发现 ${alreadyRecommended.length} 篇已是 recommended 状态的文章（Phase 13 遗留）`)
        
        let cleanedCount = 0
        for (const article of alreadyRecommended) {
          // 清理旧的 status 字段（如果存在）
          if (article.status) {
            await tx.table('feedArticles').update(article.id, {
              status: undefined
            })
            cleanedCount++
          }
        }
        
        if (cleanedCount > 0) {
          dbLogger.info(`[清理] ✅ 清理了 ${cleanedCount} 篇文章的旧 status 字段`)
        }
        dbLogger.info('[验证] ✅ 已有 recommended 状态的文章保持不变')
      }
      
      // 3. 清理可能残留的旧 status='recommended' 但没有 poolStatus 的文章
      const oldRecommended = await tx.table('feedArticles')
        .filter(a => a.status === 'recommended' && !a.poolStatus)
        .toArray()
      
      if (oldRecommended.length > 0) {
        dbLogger.info(`[清理] 发现 ${oldRecommended.length} 篇只有旧 status='recommended' 的文章`)
        
        for (const article of oldRecommended) {
          await tx.table('feedArticles').update(article.id, {
            poolStatus: 'recommended',
            status: undefined  // 清除旧字段
          })
        }
        
        dbLogger.info('[清理] ✅ 旧状态清理完成')
      }
      
      dbLogger.info('[架构简化] ✅ v22 迁移完成 - 推荐池状态统一为 recommended')
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

// 数据迁移模块（db-migration.ts）- Phase 10 & Phase 13
export {
  migrateRecommendationStatus,
  calculateArticleImportance,
  runFullMigration,
  needsMigration,
  // Phase 13: 多池架构迁移
  migrateToPoolStatus,
  needsPhase13Migration,
  runPhase13Migration,
  // Phase 14.3: Stale 状态迁移
  needsStaleMigration,
  runStaleMigration
} from './db-migration'

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

// RSS 订阅源统计模块（db-feeds-stats.ts）- Phase 11
export {
  getFeedStats,
  getFeedFunnelStats,
  arrangeSymmetrically,
  normalizeLogarithmic
} from './db-feeds-stats'
export type { FeedStats, FeedFunnelStats } from './db-feeds-stats'

// 策略决策模块已迁移到 strategy-storage.ts（使用 chrome.storage.local）
// 为了向后兼容，从新位置重新导出
export {
  saveStrategyDecision,
  getCurrentStrategy,
  updateStrategyExecution,
  invalidateStrategy,
  cacheStrategy,
  cacheSystemContext,
  getCachedSystemContext
} from '../strategy-storage'

// 文章池管理模块（db-pool.ts）- 推荐系统重构
export {
  getRawPoolArticles,
  getCandidatePoolArticles,
  getRecommendedPoolArticles,
  moveToCandidate,
  moveToAnalyzedNotQualified,
  moveToRecommended,
  removeFromPool,
  batchMoveToCandidate,
  batchMoveToRecommended,
  getPoolStats,
  cleanupExpiredCandidates
} from './db-pool'
