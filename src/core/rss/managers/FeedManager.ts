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
import { v4 as uuidv4 } from 'uuid'

export class FeedManager {
  /**
   * 添加候选源
   * 
   * @param feed - 源信息（不需要 id，会自动生成）
   */
  async addCandidate(feed: Omit<DiscoveredFeed, 'id' | 'status' | 'enabled'>): Promise<string> {
    const id = uuidv4()
    
    const newFeed: DiscoveredFeed = {
      ...feed,
      id,
      status: 'candidate',
      enabled: true
    }
    
    // 检查是否已存在（通过 URL）
    const existing = await db.discoveredFeeds.where('url').equals(feed.url).first()
    if (existing) {
      console.log('[FeedManager] 源已存在:', feed.url)
      return existing.id
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
   */
  async subscribe(id: string): Promise<void> {
    await this.updateStatus(id, 'subscribed')
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
