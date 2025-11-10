/**
 * RSS 源管理器
 * 
 * 负责管理 RSS 源的生命周期：
 * - 添加候选源
 * - 查询源列表
 * - 更新源状态
 * - 订阅/取消订阅
 */

import { db } from '../../../storage/db'
import type { DiscoveredFeed, FeedStatus } from '../types'

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
  async addCandidate(feed: Omit<DiscoveredFeed, 'id' | 'status' | 'enabled'>): Promise<string> {
    // 1. 检查完全相同的 URL
    const existingByUrl = await db.discoveredFeeds.where('url').equals(feed.url).first()
    if (existingByUrl) {
      console.log('[FeedManager] 源已存在（相同 URL）:', feed.url)
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
          console.log('[FeedManager] 源已存在（同域名）:', {
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
      enabled: true
    }
    
    await db.discoveredFeeds.add(newFeed)
    console.log('[FeedManager] 已添加候选源:', feed.title, feed.url)
    
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
    console.log('[FeedManager] 已更新源状态:', id, status)
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
    console.log('[FeedManager] 已更新源质量:', id, quality?.score)
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
    console.log('[FeedManager] 已更新源相关性:', id, relevance?.matchScore)
  }
  
  /**
   * 订阅源
   * 
   * @param id - 源 ID
   * @param source - 订阅来源（discovered/manual/imported）
   */
  async subscribe(id: string, source?: 'discovered' | 'manual' | 'imported'): Promise<void> {
    const updates: Partial<DiscoveredFeed> = {
      status: 'subscribed',
      subscribedAt: Date.now(),
    }
    
    // 如果提供了订阅来源，则更新
    if (source) {
      updates.subscriptionSource = source
    }
    
    await db.discoveredFeeds.update(id, updates)
    console.log('[FeedManager] 已订阅:', id, source || '(保持现有来源)')
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
    console.log('[FeedManager] 已取消订阅:', id)
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
   * @param enabled - 是否启用
   */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await db.discoveredFeeds.update(id, { enabled })
    console.log('[FeedManager] 已更新源启用状态:', id, enabled)
  }
  
  /**
   * 删除源
   * 
   * @param id - 源 ID
   */
  async delete(id: string): Promise<void> {
    // TODO: 同时删除相关文章
    await db.discoveredFeeds.delete(id)
    console.log('[FeedManager] 已删除源:', id)
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
    console.log('[FeedManager] 已批量删除源:', ids.length)
  }
  
  /**
   * 更新抓取信息
   * 
   * @param id - 源 ID
   * @param error - 可选的错误信息
   */
  async updateFetchInfo(id: string, error?: string): Promise<void> {
    const updates: Partial<DiscoveredFeed> = {
      lastFetched: Date.now()
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
}

// 导出单例
export const feedManager = new FeedManager()
