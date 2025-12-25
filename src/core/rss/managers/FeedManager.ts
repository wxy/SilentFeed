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
import { getSourceAnalysisService } from '../SourceAnalysisService'
import { isAIConfigured } from '@/storage/ai-config'
import { logger } from '@/utils/logger'

const feedLogger = logger.withTag('FeedManager')

export class FeedManager {
  /**
   * 规范化 URL 用于去重比较
   * 
   * 规则：
   * 1. 移除尾部的 '/'
   * 2. 移除尾部的 index.html、index.xml、index.rss 等索引文件
   * 
   * @param url - 原始 URL
   * @returns 规范化后的 URL
   */
  private normalizeUrlForDedup(url: string): string {
    try {
      const urlObj = new URL(url)
      let pathname = urlObj.pathname
      
      // 移除尾部的 '/'
      pathname = pathname.replace(/\/+$/, '')
      
      // 移除尾部的索引文件（index.html, index.xml, index.rss, index.atom 等）
      pathname = pathname.replace(/\/index\.[^/]*$/, '')
      
      urlObj.pathname = pathname
      return urlObj.toString()
    } catch {
      // 如果 URL 无效，返回原始 URL
      return url
    }
  }
  
  /**
   * 更新源标题（重命名）
   * 
   * @param id - 源 ID
   * @param newTitle - 新的标题
   */
  async renameTitle(id: string, newTitle: string): Promise<void> {
    const feed = await this.getFeed(id)
    if (!feed) {
      throw new Error(`源不存在: ${id}`)
    }
    const title = newTitle.trim()
    if (!title) {
      throw new Error('标题不能为空')
    }
    await db.discoveredFeeds.update(id, { title })
    feedLogger.info('已更新源标题:', { id, oldTitle: feed.title, newTitle: title })
  }
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
    // 1. 规范化 URL 用于去重
    const normalizedUrl = this.normalizeUrlForDedup(feed.url)
    
    // 2. 检查完全相同的 URL（使用规范化后的 URL）
    const allFeeds = await db.discoveredFeeds.toArray()
    const existingByUrl = allFeeds.find(f => this.normalizeUrlForDedup(f.url) === normalizedUrl)
    
    if (existingByUrl) {
      feedLogger.debug('源已存在（规范化 URL 相同）:', {
        existing: existingByUrl.url,
        new: feed.url,
        normalized: normalizedUrl
      })
      return existingByUrl.id
    }
    
    // 3. 检查同一来源页面的相似源（同一网站的不同格式/路径）
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
    
    // 4. 没有重复，添加新源
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
   * 通用更新源信息
   * 
   * @param id - 源 ID
   * @param updates - 要更新的字段
   */
  async updateFeed(
    id: string,
    updates: Partial<DiscoveredFeed>
  ): Promise<void> {
    await db.discoveredFeeds.update(id, updates)
    feedLogger.debug('已更新源信息:', { id, updates })
  }
  
  /**
   * 分析源质量（使用 AI 源分析服务）
   * 
   * Phase 9+: 使用 SourceAnalysisService 进行 AI 分析
   * - 分析源的内容分类、语言、质量评分
   * - 如果 AI 未配置，跳过分析（后续推荐流程也无法进行）
   * - 自动保存分析结果到数据库
   * 
   * @param id - 源 ID
   * @param forceRefresh - 是否强制重新分析（忽略缓存）
   * @returns 分析结果（包含 AI 分析数据），null 表示无需分析或分析失败
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
      
      // 2. 检查 AI 是否已配置
      const aiConfigured = await isAIConfigured()
      if (!aiConfigured) {
        feedLogger.info('AI 未配置，跳过源分析:', feed.title)
        return feed.quality || null
      }
      
      // 3. 使用 SourceAnalysisService 进行 AI 分析
      feedLogger.info('开始 AI 分析源:', feed.title)
      const analysisService = getSourceAnalysisService()
      const analysis = await analysisService.analyze(id, forceRefresh)
      
      if (!analysis) {
        feedLogger.warn('AI 分析返回空结果:', feed.title)
        return feed.quality || null
      }
      
      feedLogger.info('AI 分析完成:', {
        title: feed.title,
        category: analysis.contentCategory,
        language: analysis.language,
        qualityScore: analysis.qualityScore
      })
      
      // 4. 返回更新后的 feed.quality（已由 SourceAnalysisService.saveAnalysis 更新）
      const updatedFeed = await this.getFeed(id)
      return updatedFeed?.quality || null
    } catch (error) {
      feedLogger.error('AI 分析失败:', { id, error })
      return null
    }
  }
  
  /**
   * 批量分析候选源质量（使用 AI 分析）
   * 
   * Phase 9+: 使用 SourceAnalysisService 进行 AI 分析
   * - 分析所有未分析过的候选源
   * - 如果 AI 未配置，直接返回（不进行任何分析）
   * - 支持限制数量（避免一次分析太多）
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
    // 0. 检查 AI 是否已配置
    const aiConfigured = await isAIConfigured()
    if (!aiConfigured) {
      feedLogger.info('AI 未配置，跳过批量分析')
      const candidates = await this.getFeeds('candidate')
      return {
        total: candidates.length,
        analyzed: 0,
        success: 0,
        failed: 0
      }
    }
    
    // 1. 获取所有候选源
    const candidates = await this.getFeeds('candidate')
    
    // 2. 筛选出未进行 AI 分析的源
    const analysisService = getSourceAnalysisService()
    const needsAnalysis: DiscoveredFeed[] = []
    
    for (const feed of candidates) {
      const needs = await analysisService.needsAnalysis(feed.id)
      if (needs) {
        needsAnalysis.push(feed)
      }
    }
    
    // 3. 限制分析数量
    const toAnalyze = needsAnalysis.slice(0, limit)
    
    feedLogger.info('批量 AI 分析候选源:', {
      total: candidates.length,
      needsAnalysis: needsAnalysis.length,
      willAnalyze: toAnalyze.length
    })
    
    // 4. 逐个分析（避免并发过多）
    let success = 0
    let failed = 0
    
    for (const feed of toAnalyze) {
      const result = await this.analyzeFeed(feed.id, true)
      if (result) {
        success++
      } else {
        failed++
      }
      
      // 延迟 500ms 避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    feedLogger.info('批量 AI 分析完成:', {
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
    
    // 如果从忽略状态恢复，重新进行 AI 分析
    if (wasIgnored) {
      feedLogger.info('从忽略列表恢复，重新进行 AI 分析...')
      // 异步执行，不阻塞订阅操作
      this.analyzeFeed(id, true).catch((error: Error) => {
        feedLogger.error('AI 分析失败:', error)
        // AI 分析失败不删除源（与之前不同），因为 AI 可能只是暂时不可用
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
      status: 'ignored',
      subscribedAt: undefined
    })
    feedLogger.info('已取消订阅（放入忽略列表）:', id)
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
   * @param deleteArticles - 是否同时删除该源的文章（默认 true）
   */
  async delete(id: string, deleteArticles: boolean = true): Promise<void> {
    await db.transaction('rw', db.discoveredFeeds, db.feedArticles, async () => {
      if (deleteArticles) {
        // 删除该源的所有文章
        const articles = await db.feedArticles.where('feedId').equals(id).toArray()
        const articleIds = articles.map(a => a.id)
        
        if (articleIds.length > 0) {
          await db.feedArticles.where('id').anyOf(articleIds).delete()
          feedLogger.info(`已删除源 ${id} 的 ${articleIds.length} 篇文章`)
        }
      }
      
      // 删除源本身
      await db.discoveredFeeds.delete(id)
    })
    feedLogger.info('已删除源:', id)
  }
  
  /**
   * 批量删除源
   * 
   * @param ids - 源 ID 数组
   * @param deleteArticles - 是否同时删除这些源的文章（默认 true）
   */
  async deleteMany(ids: string[], deleteArticles: boolean = true): Promise<void> {
    await db.transaction('rw', db.discoveredFeeds, db.feedArticles, async () => {
      for (const id of ids) {
        await this.delete(id, deleteArticles)
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
