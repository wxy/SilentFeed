/**
 * 系统统计数据缓存
 * 
 * 存储在 chrome.storage.local（设备特定）
 * 减少频繁的 IndexedDB 查询
 */

import { logger } from '@/utils/logger'
import { getRecommendationStats, getPageCount, db } from './db'
import { getSystemThresholds } from './system-thresholds'

const statsLogger = logger.withTag('SystemStats')

const STORAGE_KEY = 'systemStats'
const STATS_EXPIRATION = 60 * 1000 // 1 分钟过期

/**
 * 系统统计数据接口
 */
export interface SystemStats {
  /**
   * 最近更新时间
   */
  lastUpdated: number
  
  /**
   * 推荐相关统计
   */
  recommendations: {
    /** 最后生成时间 */
    lastGeneratedAt: number
    /** 最后查看时间 */
    lastViewedAt: number
    /** 当前未读数量 */
    unreadCount: number
    /** 今日生成数量 */
    generatedToday: number
    /** 今日阅读数量 */
    readToday: number
  }
  
  /**
   * Feed 相关统计
   */
  feeds: {
    /** 订阅数量 */
    subscribedCount: number
    /** 最后抓取时间 */
    lastFetchedAt: number
    /** 未读文章数量 */
    unreadArticleCount: number
  }
  
  /**
   * AI 用量统计（今日）
   */
  aiUsage: {
    /** 今日请求次数 */
    requestsToday: number
    /** 今日 tokens */
    tokensToday: number
    /** 今日成本（CNY）*/
    costToday: number
  }
  
  /**
   * 用户行为统计（过去24小时）
   */
  userBehavior: {
    /** 推荐展示数 */
    recommendationsShown: number
    /** 点击数 */
    clicked: number
    /** 忽略数 */
    dismissed: number
    /** 稍后阅读数 */
    saved: number
    /** 平均阅读时长（秒）*/
    avgReadTime: number
    /** 访问次数 */
    visitCount: number
    /** 活跃时段（小时 0-23）*/
    peakUsageHour: number
  }
  
  /**
   * 文章统计
   */
  articles: {
    /** 未读文章数 */
    unreadCount: number
    /** 日均新文章数（过去7天）*/
    dailyAverage: number
    /** 昨日新文章数 */
    yesterdayCount: number
  }
  
  /**
   * 学习进度
   */
  learning: {
    /** 当前页面数 */
    pageCount: number
    /** 是否完成学习 */
    isComplete: boolean
  }
}

/**
 * 创建空统计对象
 */
function createEmptyStats(): SystemStats {
  return {
    lastUpdated: Date.now(),
    recommendations: {
      lastGeneratedAt: 0,
      lastViewedAt: 0,
      unreadCount: 0,
      generatedToday: 0,
      readToday: 0
    },
    feeds: {
      subscribedCount: 0,
      lastFetchedAt: 0,
      unreadArticleCount: 0
    },
    aiUsage: {
      requestsToday: 0,
      tokensToday: 0,
      costToday: 0
    },
    userBehavior: {
      recommendationsShown: 0,
      clicked: 0,
      dismissed: 0,
      saved: 0,
      avgReadTime: 60,
      visitCount: 0,
      peakUsageHour: 9
    },
    articles: {
      unreadCount: 0,
      dailyAverage: 0,
      yesterdayCount: 0
    },
    learning: {
      pageCount: 0,
      isComplete: false
    }
  }
}

/**
 * 检查统计数据是否过期
 */
function isStatsExpired(stats: SystemStats): boolean {
  return (Date.now() - stats.lastUpdated) > STATS_EXPIRATION
}

/**
 * 获取系统统计（带缓存过期检查和兜底）
 * 
 * 策略：
 * 1. 从 chrome.storage.local 读取
 * 2. 如果不存在，返回空统计并触发后台同步
 * 3. 如果过期（>1分钟），返回当前值但触发后台刷新
 * 4. 读取失败时返回空统计
 */
export async function getSystemStats(): Promise<SystemStats> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const stats = result[STORAGE_KEY] as SystemStats | undefined
    
    if (!stats) {
      // 不存在时，创建空统计并触发同步
      const empty = createEmptyStats()
      syncSystemStats().catch(err => 
        statsLogger.warn('初始统计同步失败:', err)
      )
      return empty
    }
    
    // 检查是否过期
    if (isStatsExpired(stats)) {
      // 后台刷新（不阻塞）
      syncSystemStats().catch(err => 
        statsLogger.warn('统计刷新失败:', err)
      )
    }
    
    return stats
    
  } catch (error) {
    // 兜底：读取失败时返回空统计
    statsLogger.warn('加载系统统计失败，使用空值:', error)
    return createEmptyStats()
  }
}

/**
 * 更新系统统计（增量更新）
 */
export async function updateSystemStats(
  updates: Partial<SystemStats>
): Promise<void> {
  try {
    const current = await getSystemStats()
    const merged = { 
      ...current, 
      ...updates, 
      lastUpdated: Date.now() 
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: merged })
    statsLogger.debug('系统统计已更新')
  } catch (error) {
    statsLogger.warn('更新系统统计失败:', error)
  }
}

/**
 * 定期从 IndexedDB 同步统计到缓存
 * 
 * 调用时机：
 * - Background Service Worker 启动时
 * - 每次推荐生成后
 * - 每次用户操作后（阅读、忽略等）
 * - 定期刷新（每 30-60 秒）
 */
export async function syncSystemStats(): Promise<void> {
  try {
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    
    // 添加超时保护，防止查询过慢导致崩溃
    const timeout = 5000 // 5秒超时
    const statsPromise = collectStats(now, oneDayAgo, sevenDaysAgo)
    
    await Promise.race([
      statsPromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('统计收集超时')), timeout)
      )
    ])
    
    statsLogger.debug('✅ 系统统计已同步')
  } catch (error) {
    statsLogger.warn('同步系统统计失败:', error)
    // 同步失败不影响主流程，静默处理
  }
}

/**
 * 内部实现：收集统计数据
 */
async function collectStats(now: number, oneDayAgo: number, sevenDaysAgo: number): Promise<void> {
    // 获取系统阈值（用于判断学习是否完成）
    const thresholds = await getSystemThresholds()
    
    // 并行查询基础统计（只统计数量，不加载数据）
    const [recStats, feedCount, pageCount, unreadArticleCount, recentArticlesCount, yesterdayArticlesCount] = await Promise.all([
      getRecommendationStats(),
      db.discoveredFeeds.where('status').equals('subscribed').count(),
      getPageCount(),
      db.feedArticles.where('read').equals(0).count(),
      db.feedArticles.where('published').above(sevenDaysAgo).count(),
      db.feedArticles.where('published').above(oneDayAgo).count()
    ])
    
    // 用户行为统计（限制查询数量，避免内存爆炸）
    const recommendationStats = await db.recommendations
      .where('recommendedAt')
      .above(oneDayAgo)
      .limit(200)  // 限制最多200条
      .toArray()
    
    const clicked = recommendationStats.filter(r => r.isRead).length
    const dismissed = recommendationStats.filter(r => r.feedback === 'dismissed').length
    const saved = recommendationStats.filter(r => r.feedback === 'later').length
    
    // 访问记录统计（限制100条，用于计算平均值）
    const visits = await db.confirmedVisits
      .where('visitTime')
      .above(oneDayAgo)
      .limit(100)
      .toArray()
    
    const avgReadTime = visits.length > 0
      ? visits.reduce((sum, v) => sum + (v.duration || 0), 0) / visits.length / 1000
      : 60
    
    // 计算活跃时段
    const hourCounts: Record<number, number> = {}
    visits.forEach(v => {
      const hour = new Date(v.visitTime).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    const peakUsageHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 9
    
    // 更新缓存
    await updateSystemStats({
      recommendations: {
        unreadCount: recStats.unreadCount,
        lastGeneratedAt: Date.now(),
        lastViewedAt: Date.now(),
        generatedToday: recommendationStats.length,
        readToday: clicked
      },
      feeds: {
        subscribedCount: feedCount,
        lastFetchedAt: Date.now(),
        unreadArticleCount: unreadArticleCount
      },
      userBehavior: {
        recommendationsShown: recommendationStats.length,
        clicked,
        dismissed,
        saved,
        avgReadTime,
        visitCount: visits.length,
        peakUsageHour: parseInt(String(peakUsageHour))
      },
      articles: {
        unreadCount: unreadArticleCount,
        dailyAverage: Math.round(recentArticlesCount / 7),
        yesterdayCount: yesterdayArticlesCount
      },
      learning: {
        pageCount,
        isComplete: pageCount >= thresholds.learningCompletePages
      }
    })
}

/**
 * 清除统计缓存（测试用）
 */
export async function clearSystemStats(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY)
    statsLogger.info('✅ 系统统计已清除')
  } catch (error) {
    statsLogger.error('❌ 清除系统统计失败:', error)
  }
}
