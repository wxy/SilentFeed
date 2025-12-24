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

import { db, updateFeedStats } from '../storage/db'
import { RSSFetcher } from '../core/rss/RSSFetcher'
import { getSourceAnalysisService } from '../core/rss/SourceAnalysisService'
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
 * 同一篇文章在不同 Feed 中共享同一条记录
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
    
    // 8. 更新数据库（使用事务保证数据一致性）
    // Phase 10: 实现增量追加策略，不删除旧文章
    await db.transaction('rw', [db.discoveredFeeds, db.feedArticles], async () => {
      // 8.2 更新 feedArticles 表（Phase 10: 增量追加 + inFeed 状态管理）
      
      // 获取该 Feed 当前的所有文章（包括 inFeed=false 的旧文章）
      const currentArticles = await db.feedArticles.where('feedId').equals(feed.id).toArray()
      const latestIds = new Set(latest.map(a => a.id))
      
      // 检查哪些文章已经存在于数据库（可能属于其他 Feed）
      const existingArticles = await db.feedArticles.bulkGet(latest.map(a => a.id))
      
      // 1. 分类处理最新抓取的文章
      const articlesToInsert: FeedArticle[] = []  // 完全不存在，需要插入
      const articlesToUpdate: FeedArticle[] = []  // 已存在，需要更新元数据
      const ownedArticles: FeedArticle[] = []     // 真正属于当前 Feed 的文章（用于 latestArticles）
      
      const now = Date.now()
      
      latest.forEach((article, index) => {
        const existing = existingArticles[index]
        
        if (!existing) {
          // 文章不存在，插入并标记 inFeed=true
          articlesToInsert.push({
            ...article,
            inFeed: true,
            lastSeenInFeed: now,
            metadataUpdatedAt: now,
            updateCount: 0
          })
          ownedArticles.push(article)
        } else if (existing.feedId === feed.id) {
          // 文章存在且属于当前 Feed，只更新元数据，保留用户操作状态
          articlesToUpdate.push({
            ...existing,  // 保留所有旧数据
            // 只更新可能变化的元数据字段
            title: article.title,
            description: article.description,
            content: article.content,
            author: article.author,
            published: article.published,
            // 保留用户操作状态：read, disliked, recommended, starred
            // 更新 RSS 源状态
            inFeed: true,
            lastSeenInFeed: now,
            metadataUpdatedAt: now,
            updateCount: (existing.updateCount || 0) + 1
          })
          // ownedArticles 需要合并用户状态（用于 latestArticles 字段）
          ownedArticles.push({
            ...article,
            read: existing.read,
            disliked: existing.disliked,
            recommended: existing.recommended,
            starred: existing.starred
          })
        }
        // 如果文章存在但属于其他 Feed，跳过（不计入当前 Feed 的统计）
      })
      
      // 2. 标记不在最新列表中的文章为 inFeed=false（但不删除）
      // Phase 10: 保留已推荐的文章（inPool=true），不标记为 inFeed=false
      const articlesToMarkStale = currentArticles
        .filter(a => !latestIds.has(a.id) && !a.inPool)  // 不在最新列表 && 不在推荐池
        .map(a => ({
          ...a,
          inFeed: false,
          metadataUpdatedAt: now
        }))
      
      // 3. 批量操作
      if (articlesToInsert.length > 0) {
        await db.feedArticles.bulkAdd(articlesToInsert)
      }
      
      if (articlesToUpdate.length > 0) {
        await db.feedArticles.bulkPut(articlesToUpdate)
      }
      
      if (articlesToMarkStale.length > 0) {
        await db.feedArticles.bulkPut(articlesToMarkStale)
      }
      
      // 4. 计算真实的文章统计（只包含 inFeed=true 的文章）
      const realTotalCount = ownedArticles.length
      const realUnreadCount = ownedArticles.filter(a => !a.read).length
      
      // 8.1 更新 Feed 基本信息（使用真实的统计数据）
      await db.discoveredFeeds.update(feed.id, {
        lastFetchedAt: now,
        nextScheduledFetch,
        updateFrequency,
        lastError: undefined,
        latestArticles: ownedArticles,  // 只包含真正属于当前 Feed 的文章
        articleCount: realTotalCount,   // 真实的文章数量
        unreadCount: realUnreadCount    // 真实的未读数量
      })
    })
    
    // Phase 7: 更新详细统计（分析、推荐、阅读、不想读）
    await updateFeedStats(feed.url)
    
    // 重新获取更新后的 feed 数据以显示完整统计
    const updatedFeed = await db.discoveredFeeds.get(feed.id)
    
    // 计算跨 Feed 共享的文章数量
    const sharedArticlesCount = latest.length - (updatedFeed?.articleCount || 0)
    
    // 首次抓取触发 AI 分析：如果是第一次成功抓取，触发订阅源质量分析
    // 异步执行，不阻塞抓取流程
    const isFirstFetch = !feed.lastFetchedAt
    if (isFirstFetch) {
      getSourceAnalysisService().triggerOnFirstFetch(feed.id).catch(error => {
        console.warn(`[FeedScheduler] 首次抓取分析触发失败: ${feed.title}`, error)
      })
    }
    
    // 简要日志：显示抓取结果
    if (process.env.NODE_ENV === 'development') {
      console.log(`[FeedScheduler] ✅ ${feed.title}: ${newArticles.length} 新 / ${updatedFeed?.unreadCount || 0} 未读`)
    }
    
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
    
    // 1. 获取所有已订阅的源
    const subscribedFeeds = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()
    
    
    // 2. 筛选需要抓取的源
    const feedsToFetch = subscribedFeeds.filter(feed => shouldFetch(feed))
    
    if (feedsToFetch.length > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[FeedScheduler] 将抓取 ${feedsToFetch.length}/${subscribedFeeds.length} 个源`)
    }
    
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
    
    
    return results
  }
  
  /**
   * 手动触发一次抓取
   * 
   * 用于测试或用户手动刷新
   */
  async triggerNow(): Promise<void> {
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
    // 1. 获取所有已订阅的源
    const subscribedFeeds = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()
    
    // 2. 强制抓取所有启用的源（忽略时间和频率限制）
    const feedsToFetch = subscribedFeeds.filter(feed => shouldFetch(feed, true))
    
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
    
    
    return results
  }
}

// 导出单例
export const feedScheduler = new FeedScheduler()
