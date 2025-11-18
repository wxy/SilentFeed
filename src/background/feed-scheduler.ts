/**
 * RSS 定时抓取调度器
 * 
 * Phase 5 Sprint 3: 智能定时抓取
 * 
 * 功能：
 * - 根据更新频率智能调度抓取
 * - 抓取新文章并保存到数据库
 * - 统计未读文章数量
 * - 跳过暂停的源
 */

import { db } from '../storage/db'
import { RSSFetcher } from '../core/rss/RSSFetcher'
import type { DiscoveredFeed, FeedArticle } from '@/types/rss'

/**
 * 计算下次抓取间隔（毫秒）
 * 
 * 根据源的更新频率（篇/周）决定抓取间隔：
 * - 每天更新（≥7 篇/周）: 6 小时
 * - 每周 3-7 次: 12 小时
 * - 每周 1-2 次: 24 小时
 * - 低频源（<1 篇/周）: 不自动抓取
 * 
 * @param feed - RSS 源
 * @returns 抓取间隔（毫秒），0 表示不自动抓取
 */
export function calculateNextFetchInterval(feed: DiscoveredFeed): number {
  const quality = feed.quality
  if (!quality) {
    // 没有质量数据时，默认 24 小时抓取一次
    return 24 * 60 * 60 * 1000
  }
  
  const frequency = quality.updateFrequency // 篇/周
  
  // 修复：对于超低频源（< 0.25 篇/周，即每月更新），至少每周抓取一次
  // 这样可以确保所有源都有机会被更新，不会被遗忘
  if (!frequency || frequency < 0.25) {
    // 超低频源 → 每周抓取一次（7 天）
    return 7 * 24 * 60 * 60 * 1000
  } else if (frequency >= 7) {
    // 每天更新 → 6 小时抓取
    return 6 * 60 * 60 * 1000
  } else if (frequency >= 3) {
    // 每周 3-7 次 → 12 小时抓取
    return 12 * 60 * 60 * 1000
  } else if (frequency >= 1) {
    // 每周 1-2 次 → 24 小时抓取
    return 24 * 60 * 60 * 1000
  } else {
    // 每月更新 (0.25-1 篇/周) → 48 小时抓取
    return 48 * 60 * 60 * 1000
  }
}

/**
 * 判断源是否需要抓取
 * 
 * @param feed - RSS 源
 * @param forceManual - 强制手动抓取（忽略时间和频率限制）
 * @returns 是否需要抓取
 */
export function shouldFetch(feed: DiscoveredFeed, forceManual = false): boolean {
  // 1. 必须是已订阅状态
  if (feed.status !== 'subscribed') {
    return false
  }
  
  // 2. 必须是启用状态
  if (!feed.isActive) {
    return false
  }
  
  // 3. 手动抓取时忽略时间和频率限制
  if (forceManual) {
    console.log('[FeedScheduler] 强制手动抓取:', feed.title)
    return true
  }
  
  // 4. 计算抓取间隔
  const interval = calculateNextFetchInterval(feed)
  
  // 注意：修复后的 calculateNextFetchInterval 总是返回 > 0 的值
  // 不再有"低频源不自动抓取"的情况
  
  // 5. 检查是否到了抓取时间
  const now = Date.now()
  const lastFetchedAt = feed.lastFetchedAt || 0
  const nextFetchTime = lastFetchedAt + interval
  
  return now >= nextFetchTime
}

/**
 * 生成文章唯一 ID
 * 
 * 使用文章链接作为唯一标识
 * 
 * @param article - 文章
 * @returns 唯一 ID
 */
export function getArticleId(article: Pick<FeedArticle, 'link'>): string {
  return article.link
}

/**
 * 合并文章列表（去重 + 保留阅读状态）
 * 
 * @param existing - 现有文章列表
 * @param newArticles - 新文章列表
 * @returns 合并后的文章列表
 */
export function mergeArticles(
  existing: FeedArticle[],
  newArticles: FeedArticle[]
): FeedArticle[] {
  const map = new Map<string, FeedArticle>()
  
  // 1. 保留旧文章（包括阅读状态）
  existing.forEach(article => {
    map.set(getArticleId(article), article)
  })
  
  // 2. 添加新文章（isRead: false）
  newArticles.forEach(article => {
    const id = getArticleId(article)
    if (!map.has(id)) {
      map.set(id, { ...article, read: false })
    }
  })
  
  // 3. 按发布时间倒序排序（最新在前）
  return Array.from(map.values())
    .sort((a, b) => b.published - a.published)
}

/**
 * 抓取单个源的内容
 * 
 * @param feed - RSS 源
 * @returns 是否抓取成功
 */
export async function fetchFeed(feed: DiscoveredFeed): Promise<boolean> {
  console.log('[FeedScheduler] 开始抓取:', feed.title)
  
  const fetcher = new RSSFetcher()
  
  try {
    // 1. 抓取 RSS 内容
    const result = await fetcher.fetch(feed.url)
    
    if (!result.success) {
      throw new Error(result.error || 'Fetch failed')
    }
    
    // 2. 转换为 FeedArticle 格式
    const newArticles: FeedArticle[] = result.items.map(item => ({
      id: getArticleId({ link: item.link }),
      feedId: feed.id,
      title: item.title,
      link: item.link,
      description: item.description,
      content: item.content,
      author: item.author,
      published: item.pubDate ? item.pubDate.getTime() : Date.now(),
      fetched: Date.now(),
      read: false,
      starred: false
    }))
    
    // 3. 合并旧文章和新文章（去重 + 保留阅读状态）
    const existing = feed.latestArticles || []
    const merged = mergeArticles(existing, newArticles)
    
    // 4. 保留文章数量增加（避免历史数据丢失）
    // 根据现有文章数量动态决定：如果文章较多说明是高频源
    const existingCount = existing.length
    let keepCount = 20 // 默认保留数量
    
    if (existingCount >= 15) {
      keepCount = 50  // 高频源：保留更多历史
    } else if (existingCount >= 8) {
      keepCount = 30  // 中频源
    }
    
    const latest = merged.slice(0, keepCount)
    
    // 5. 统计数量（区分总数、推荐数、阅读数）
    const totalCount = latest.length
    const unreadCount = latest.filter(a => !a.read).length
    const readCount = totalCount - unreadCount
    
    // Phase 6: 统计推荐数量（基于文章的推荐标记）
    // 注意：这里不再统计 recommendedCount，因为它应该由 updateFeedStats 统计推荐池中的真实推荐数
    // 这里只统计文章的 recommended 标记（表示进入过推荐池）
    const articlesInPool = latest.filter(a => a.recommended).length
    
    // 6. 计算下次抓取时间
    const now = Date.now()
    const fetchInterval = calculateNextFetchInterval(feed)
    const nextScheduledFetch = now + fetchInterval
    
    // 7. 更新源的更新频率（基于实际抓取的文章数）
    // 如果有 quality 数据，使用 quality.updateFrequency
    // 否则根据新文章数量估算
    let updateFrequency = feed.quality?.updateFrequency || 0
    if (!updateFrequency && newArticles.length > 0) {
      // 粗略估算：假设本次抓取到的新文章代表一天的更新量
      // 转换为篇/周
      updateFrequency = (newArticles.length / latest.length) * 7
    }
    
    console.log('[FeedScheduler] 📅 调度信息:', {
      feed: feed.title,
      fetchInterval: `${(fetchInterval / (60 * 60 * 1000)).toFixed(1)} 小时`,
      nextScheduledFetch: new Date(nextScheduledFetch).toLocaleString(),
      updateFrequency: `${updateFrequency.toFixed(1)} 篇/周`
    })
    
    // 8. 更新数据库
    await db.discoveredFeeds.update(feed.id, {
      lastFetchedAt: now,
      nextScheduledFetch,  // ✅ 修复：设置下次抓取时间
      updateFrequency,     // ✅ 修复：更新频率字段
      lastError: undefined,
      latestArticles: latest,
      articleCount: totalCount,
      unreadCount
      // 注意：不在这里更新 recommendedCount，它由 updateFeedStats() 统计
    })
    
    console.log('[FeedScheduler] ✅ 抓取成功:', {
      feed: feed.title,
      newArticles: newArticles.length,
      totalArticles: totalCount,
      unreadCount,
      readCount,
      keepCount
    })
    
    return true
    
  } catch (error) {
    // 抓取失败，记录错误
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    await db.discoveredFeeds.update(feed.id, {
      lastFetchedAt: Date.now(),
      lastError: errorMessage
    })
    
    console.error('[FeedScheduler] ❌ 抓取失败:', feed.title, errorMessage)
    
    return false
  }
}

/**
 * RSS 定时调度器
 */
export class FeedScheduler {
  private intervalId: NodeJS.Timeout | number | null = null
  private isRunning = false
  
  /**
   * 启动调度器
   * 
   * @param intervalMinutes - 检查间隔（分钟），默认 30 分钟
   */
  start(intervalMinutes: number = 30): void {
    if (this.isRunning) {
      console.warn('[FeedScheduler] 调度器已在运行')
      return
    }
    
    console.log('[FeedScheduler] 🚀 启动调度器（检查间隔:', intervalMinutes, '分钟）')
    
    // 立即执行一次
    this.runOnce()
    
    // 定时执行
    this.intervalId = setInterval(() => {
      this.runOnce()
    }, intervalMinutes * 60 * 1000)
    
    this.isRunning = true
  }
  
  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }
    
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    
    this.isRunning = false
    console.log('[FeedScheduler] 🛑 调度器已停止')
  }
  
  /**
   * 执行一次抓取任务
   * 
   * @returns 抓取结果统计
   */
  async runOnce(): Promise<{
    total: number
    fetched: number
    skipped: number
    failed: number
  }> {
    console.log('[FeedScheduler] 🔍 检查需要抓取的源...')
    
    // 1. 获取所有已订阅的源
    const subscribedFeeds = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()
    
    console.log('[FeedScheduler] 已订阅源数量:', subscribedFeeds.length)
    
    // 2. 筛选需要抓取的源
    const feedsToFetch = subscribedFeeds.filter(feed => shouldFetch(feed))
    
    console.log('[FeedScheduler] 需要抓取的源:', {
      total: subscribedFeeds.length,
      needFetch: feedsToFetch.length,
      skipped: subscribedFeeds.length - feedsToFetch.length
    })
    
    // 3. 并发抓取（最多 5 个）
    const results = {
      total: subscribedFeeds.length,
      fetched: 0,
      skipped: subscribedFeeds.length - feedsToFetch.length,
      failed: 0
    }
    
    const concurrency = 5
    for (let i = 0; i < feedsToFetch.length; i += concurrency) {
      const batch = feedsToFetch.slice(i, i + concurrency)
      const promises = batch.map(feed => fetchFeed(feed))
      const batchResults = await Promise.all(promises)
      
      batchResults.forEach(success => {
        if (success) {
          results.fetched++
        } else {
          results.failed++
        }
      })
    }
    
    console.log('[FeedScheduler] ✅ 抓取完成:', results)
    
    return results
  }
  
  /**
   * 手动触发一次抓取
   * 
   * 用于测试或用户手动刷新
   */
  async triggerNow(): Promise<void> {
    console.log('[FeedScheduler] 🔄 手动触发抓取...')
    await this.runOnce()
  }
  
  /**
   * 手动抓取所有已订阅的源（忽略时间和频率限制）
   * 
   * 用于用户手动"全部读取"操作
   */
  async fetchAllManual(): Promise<{
    total: number
    fetched: number
    skipped: number
    failed: number
  }> {
    console.log('[FeedScheduler] 📡 手动抓取所有源...')
    
    // 1. 获取所有已订阅的源
    const subscribedFeeds = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()
    
    console.log('[FeedScheduler] 已订阅源数量:', subscribedFeeds.length)
    
    // 2. 强制抓取所有启用的源（忽略时间和频率限制）
    const feedsToFetch = subscribedFeeds.filter(feed => shouldFetch(feed, true))
    
    console.log('[FeedScheduler] 强制抓取的源:', {
      total: subscribedFeeds.length,
      needFetch: feedsToFetch.length,
      skipped: subscribedFeeds.length - feedsToFetch.length
    })
    
    // 3. 并发抓取（最多 5 个）
    const results = {
      total: subscribedFeeds.length,
      fetched: 0,
      skipped: subscribedFeeds.length - feedsToFetch.length,
      failed: 0
    }
    
    const concurrency = 5
    for (let i = 0; i < feedsToFetch.length; i += concurrency) {
      const batch = feedsToFetch.slice(i, i + concurrency)
      const promises = batch.map(feed => fetchFeed(feed))
      const batchResults = await Promise.all(promises)
      
      batchResults.forEach(success => {
        if (success) {
          results.fetched++
        } else {
          results.failed++
        }
      })
    }
    
    console.log('[FeedScheduler] ✅ 手动抓取完成:', results)
    
    return results
  }
}

// 导出单例
export const feedScheduler = new FeedScheduler()
