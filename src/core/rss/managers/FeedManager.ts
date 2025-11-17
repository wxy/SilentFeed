/**
 * RSS 源管理器
 * 
 * 负责管理 RSS 源的生命周期：
 * - 添加候选源
 * - 查询源列表
 * - 更新源状态
 * - 订阅/取消订阅
 * - 质量分析
 */

import { db } from '../../../storage/db'
import type { DiscoveredFeed, FeedStatus } from '@/types/rss'
import { FeedQualityAnalyzer } from '../FeedQualityAnalyzer'
import { logger } from '@/utils/logger'

const feedLogger = logger.withTag('FeedManager')

export class FeedManager {
  /**
   * 添加候选源
   * 
   * Phase 5.1.5: 增强去重逻辑
   * - 相同 URL 直接去重
   * - 相同域名 + 相似标题视为重复（同一网站的不同格式）
   * 
   * @param feed - 源信息（不需要 id，会自动生成）
   */
  async addCandidate(feed: Omit<DiscoveredFeed, 'id' | 'status' | 'isActive' | 'articleCount' | 'unreadCount' | 'recommendedCount'>): Promise<string> {
    // 1. 检查完全相同的 URL
    const existingByUrl = await db.discoveredFeeds.where('url').equals(feed.url).first()
    if (existingByUrl) {
      feedLogger.debug('源已存在（相同 URL）:', feed.url)
      return existingByUrl.id
    }
    
    // 2. 检查同一来源页面的相似源（同一网站的不同格式/路径）
    const existingFromSameSource = await db.discoveredFeeds
      .where('discoveredFrom')
      .equals(feed.discoveredFrom)
      .toArray()
    
    if (existingFromSameSource.length > 0) {
      // 提取域名和路径进行比较
      const newUrl = new URL(feed.url)
      const newDomain = newUrl.hostname
      
      for (const existing of existingFromSameSource) {
        const existingUrl = new URL(existing.url)
        const existingDomain = existingUrl.hostname
        
        // 如果域名相同，认为是同一个源的不同格式
        if (newDomain === existingDomain) {
          feedLogger.debug('源已存在（同域名）:', {
            existing: existing.url,
            new: feed.url
          })
          return existing.id
        }
      }
    }
    
    // 3. 没有重复，添加新源
    const id = crypto.randomUUID()
    const newFeed: DiscoveredFeed = {
      ...feed,
      id,
      status: 'candidate',
      isActive: true,           // Phase 5 Sprint 3: 默认启用
      articleCount: 0,          // Phase 5 Sprint 3: 初始文章数为 0
      unreadCount: 0,           // Phase 5 Sprint 3: 初始未读数为 0
      recommendedCount: 0       // Phase 6: 初始推荐数为 0
    }
    
    await db.discoveredFeeds.add(newFeed)
    feedLogger.info('已添加候选源:', { title: feed.title, url: feed.url })
    
    return id
  }
  
  /**
   * 获取源列表
   * 
   * @param status - 可选的状态过滤
   * @returns 源列表（按发现时间倒序）
   */
  async getFeeds(status?: FeedStatus): Promise<DiscoveredFeed[]> {
    if (status) {
      return await db.discoveredFeeds
        .where('status')
        .equals(status)
        .reverse()
        .sortBy('discoveredAt')
    }
    
    return await db.discoveredFeeds
      .orderBy('discoveredAt')
      .reverse()
      .toArray()
  }
  
  /**
   * 获取单个源
   * 
   * @param id - 源 ID
   */
  async getFeed(id: string): Promise<DiscoveredFeed | undefined> {
    return await db.discoveredFeeds.get(id)
  }
  
  /**
   * 通过 URL 获取源
   * 
   * @param url - RSS URL
   */
  async getFeedByUrl(url: string): Promise<DiscoveredFeed | undefined> {
    return await db.discoveredFeeds.where('url').equals(url).first()
  }
  
  /**
   * 更新源状态
   * 
   * @param id - 源 ID
   * @param status - 新状态
   */
  async updateStatus(id: string, status: FeedStatus): Promise<void> {
    const updates: Partial<DiscoveredFeed> = { status }
    
    // 订阅时记录时间
    if (status === 'subscribed') {
      updates.subscribedAt = Date.now()
    }
    
    await db.discoveredFeeds.update(id, updates)
    feedLogger.debug('已更新源状态:', { id, status })
  }
  
  /**
   * 更新源质量评估
   * 
   * @param id - 源 ID
   * @param quality - 质量评估数据
   */
  async updateQuality(
    id: string,
    quality: DiscoveredFeed['quality']
  ): Promise<void> {
    await db.discoveredFeeds.update(id, { quality })
    feedLogger.debug('已更新源质量:', { id, score: quality?.score })
  }
  
  /**
   * 分析源质量
   * 
   * Phase 5.2: 质量分析集成
   * - 使用 FeedQualityAnalyzer 分析 RSS 源
   * - 自动保存质量数据到数据库
   * - 支持重新分析（强制刷新）
   * 
   * @param id - 源 ID
   * @param forceRefresh - 是否强制重新分析（忽略缓存）
   * @returns 质量分析结果
   */
  async analyzeFeed(
    id: string,
    forceRefresh: boolean = false
  ): Promise<DiscoveredFeed['quality'] | null> {
    try {
      // 1. 获取源信息
      const feed = await this.getFeed(id)
      if (!feed) {
        feedLogger.error('分析失败：源不存在', id)
        return null
      }
      
      // 2. 如果已有质量数据且未过期（24小时内），直接返回
      if (!forceRefresh && feed.quality) {
        const age = Date.now() - feed.quality.lastChecked
        const maxAge = 24 * 60 * 60 * 1000 // 24 小时
        
        if (age < maxAge) {
          feedLogger.debug('使用缓存的质量数据:', { id, score: feed.quality.score })
          return feed.quality
        }
      }
      
      // 3. 执行质量分析
      feedLogger.info('开始分析源质量:', feed.title)
      const analyzer = new FeedQualityAnalyzer()
      const quality = await analyzer.analyze(feed.url)
      
      // 4. 保存质量数据
      await this.updateQuality(id, quality)
      
      feedLogger.info('质量分析完成:', {
        title: feed.title,
        score: quality.score,
        frequency: quality.updateFrequency
      })
      
      return quality
    } catch (error) {
      feedLogger.error('分析源质量失败:', { id, error })
      
      // 保存错误信息
      await this.updateQuality(id, {
        score: 0,
        updateFrequency: 0,
        formatValid: false,
        reachable: false,
        lastChecked: Date.now(),
        details: {
          updateFrequencyScore: 0,
          completenessScore: 0,
          formatScore: 0,
          reachabilityScore: 0
        },
        error: error instanceof Error ? error.message : String(error)
      })
      
      return null
    }
  }
  
  /**
   * 批量分析候选源质量
   * 
   * Phase 5.2: 后台任务调度支持
   * - 分析所有未分析过的候选源
   * - 支持限制数量（避免一次分析太多）
   * - 返回分析结果统计
   * 
   * @param limit - 最大分析数量（默认 10）
   * @returns 分析结果统计
   */
  async analyzeCandidates(limit: number = 10): Promise<{
    total: number
    analyzed: number
    success: number
    failed: number
  }> {
    // 1. 获取所有候选源
    const candidates = await this.getFeeds('candidate')
    
    // 2. 筛选出未分析过的源（或质量数据过期的源）
    const maxAge = 24 * 60 * 60 * 1000 // 24 小时
    const needsAnalysis = candidates.filter(feed => {
      if (!feed.quality) return true
      const age = Date.now() - feed.quality.lastChecked
      return age >= maxAge
    })
    
    // 3. 限制分析数量
    const toAnalyze = needsAnalysis.slice(0, limit)
    
    feedLogger.info('批量分析候选源:', {
      total: candidates.length,
      needsAnalysis: needsAnalysis.length,
      willAnalyze: toAnalyze.length
    })
    
    // 4. 逐个分析（避免并发过多）
    let success = 0
    let failed = 0
    
    for (const feed of toAnalyze) {
      const quality = await this.analyzeFeed(feed.id)
      if (quality && !quality.error) {
        success++
      } else {
        failed++
      }
      
      // 延迟 500ms 避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    feedLogger.info('批量分析完成:', {
      analyzed: toAnalyze.length,
      success,
      failed
    })
    
    return {
      total: candidates.length,
      analyzed: toAnalyze.length,
      success,
      failed
    }
  }
  
  /**
   * 更新源相关性评估
   * 
   * @param id - 源 ID
   * @param relevance - 相关性评估数据
   */
  async updateRelevance(
    id: string,
    relevance: DiscoveredFeed['relevance']
  ): Promise<void> {
    await db.discoveredFeeds.update(id, { relevance })
    feedLogger.debug('已更新源相关性:', { id, matchScore: relevance?.matchScore })
  }
  
  /**
   * 订阅源
   * 
   * @param id - 源 ID
   * @param source - 订阅来源（discovered/manual/imported）
   */
  async subscribe(id: string, source?: 'discovered' | 'manual' | 'imported'): Promise<void> {
    // 获取当前源信息
    const feed = await db.discoveredFeeds.get(id)
    if (!feed) {
      throw new Error(`源不存在: ${id}`)
    }
    
    const wasIgnored = feed.status === 'ignored'
    
    // 如果从忽略状态恢复，先重新验证
    if (wasIgnored) {
      feedLogger.info('从忽略列表恢复，重新验证 RSS 源...')
      const { RSSValidator } = await import('../RSSValidator')
      const validationResult = await RSSValidator.validateURL(feed.url)
      
      if (!validationResult.valid || !validationResult.metadata) {
        // 验证失败，删除该源
        feedLogger.error('❌ 重新验证失败，删除源:', { url: feed.url, error: validationResult.error })
        await this.delete(id)
        throw new Error(`RSS 源验证失败: ${validationResult.error || '无法访问或格式错误'}`)
      }
    }
    
    const updates: Partial<DiscoveredFeed> = {
      status: 'subscribed',
      subscribedAt: Date.now(),
    }
    
    // 如果提供了订阅来源，则更新
    if (source) {
      updates.subscriptionSource = source
    }
    
    await db.discoveredFeeds.update(id, updates)
    feedLogger.info('已订阅:', { id, source: source || '(保持现有来源)' })
    
    // 如果从忽略状态恢复，重新进行质量分析
    if (wasIgnored) {
      feedLogger.info('从忽略列表恢复，重新进行质量分析...')
      // 异步执行，不阻塞订阅操作
      this.analyzeFeed(id, true).catch((error: Error) => {
        feedLogger.error('质量分析失败:', error)
        // 质量分析失败，也删除该源
        this.delete(id).catch((err: Error) => {
          feedLogger.error('删除失败的源失败:', err)
        })
      })
    }
  }
  
  /**
   * 取消订阅
   * 
   * @param id - 源 ID
   */
  async unsubscribe(id: string): Promise<void> {
    await db.discoveredFeeds.update(id, {
      status: 'candidate',
      subscribedAt: undefined
    })
    feedLogger.info('已取消订阅:', id)
  }
  
  /**
   * 忽略源
   * 
   * @param id - 源 ID
   */
  async ignore(id: string): Promise<void> {
    await this.updateStatus(id, 'ignored')
  }
  
  /**
   * 启用/暂停源（不改变订阅状态）
   * 
   * @param id - 源 ID
   * @param isActive - 是否启用
   */
  async setEnabled(id: string, isActive: boolean): Promise<void> {
    await db.discoveredFeeds.update(id, { isActive })
    feedLogger.debug('已更新源启用状态:', { id, isActive })
  }
  
  /**
   * 删除源
   * 
   * @param id - 源 ID
   */
  async delete(id: string): Promise<void> {
    // TODO: 同时删除相关文章
    await db.discoveredFeeds.delete(id)
    feedLogger.info('已删除源:', id)
  }
  
  /**
   * 批量删除源
   * 
   * @param ids - 源 ID 数组
   */
  async deleteMany(ids: string[]): Promise<void> {
    await db.transaction('rw', db.discoveredFeeds, async () => {
      for (const id of ids) {
        await db.discoveredFeeds.delete(id)
      }
    })
    feedLogger.info(`已批量删除源: ${ids.length} 个`)
  }
  
  /**
   * 更新抓取信息
   * 
   * @param id - 源 ID
   * @param error - 可选的错误信息
   */
  async updateFetchInfo(id: string, error?: string): Promise<void> {
    const updates: Partial<DiscoveredFeed> = {
      lastFetchedAt: Date.now()
    }
    
    if (error) {
      updates.lastError = error
    } else {
      updates.lastError = undefined
    }
    
    await db.discoveredFeeds.update(id, updates)
  }
  
  /**
   * 获取统计数据
   */
  async getStats(): Promise<{
    total: number
    candidate: number
    recommended: number
    subscribed: number
    ignored: number
  }> {
    const feeds = await this.getFeeds()
    
    return {
      total: feeds.length,
      candidate: feeds.filter(f => f.status === 'candidate').length,
      recommended: feeds.filter(f => f.status === 'recommended').length,
      subscribed: feeds.filter(f => f.status === 'subscribed').length,
      ignored: feeds.filter(f => f.status === 'ignored').length
    }
  }

  // ==================== Phase 5 Sprint 3: 状态管理 ====================

  /**
   * 切换订阅源的启用状态
   * 
   * Phase 5 Sprint 3: 用于暂停/恢复定时抓取
   * 
   * @param feedId - 源 ID
   * @returns 新的 isActive 状态
   */
  async toggleActive(feedId: string): Promise<boolean> {
    const feed = await this.getFeed(feedId)
    if (!feed) {
      throw new Error(`源不存在: ${feedId}`)
    }

    const newState = !feed.isActive
    await db.discoveredFeeds.update(feedId, { isActive: newState })
    
    feedLogger.debug('已切换源启用状态:', {
      feedId,
      title: feed.title,
      isActive: newState
    })

    return newState
  }

  /**
   * 获取所有启用的订阅源
   * 
   * Phase 5 Sprint 3: 用于定时抓取
   * 
   * @returns 启用且已订阅的源列表
   */
  async getActiveSubscriptions(): Promise<DiscoveredFeed[]> {
    const subscribed = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .toArray()

    // 过滤出 isActive 为 true 的源
    const active = subscribed.filter(feed => feed.isActive)

    feedLogger.debug('启用的订阅源:', {
      total: subscribed.length,
      active: active.length,
      paused: subscribed.length - active.length
    })

    return active
  }
}

// 导出单例
export const feedManager = new FeedManager()
