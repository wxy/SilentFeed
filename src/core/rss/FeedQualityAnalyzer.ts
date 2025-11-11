/**
 * RSS Feed 质量分析器
 * 
 * 功能：
 * 1. 分析 RSS 源的更新频率
 * 2. 评估内容完整度
 * 3. 检查格式规范性
 * 4. 验证可达性
 * 5. 计算综合质量评分（0-100）
 * 
 * 评分算法：
 * - 更新频率得分 (40%)
 * - 内容完整度得分 (30%)
 * - 格式规范性得分 (20%)
 * - 可达性得分 (10%)
 * 
 * @module core/rss/FeedQualityAnalyzer
 */

import { RSSFetcher, type FeedItem } from './RSSFetcher'

/**
 * 质量分析结果
 */
export interface QualityAnalysis {
  /** 综合质量评分 (0-100) */
  score: number
  
  /** 更新频率（篇/周） */
  updateFrequency: number
  
  /** 格式是否有效 */
  formatValid: boolean
  
  /** 是否可达 */
  reachable: boolean
  
  /** 最后检查时间 */
  lastChecked: number
  
  /** 详细评分 */
  details: {
    updateFrequencyScore: number  // 0-100
    completenessScore: number     // 0-100
    formatScore: number           // 0-100
    reachabilityScore: number     // 0-100
  }
  
  /** 错误信息（如果有） */
  error?: string
}

/**
 * Feed 质量分析器
 */
export class FeedQualityAnalyzer {
  private readonly fetcher: RSSFetcher
  
  constructor(options: { timeout?: number } = {}) {
    this.fetcher = new RSSFetcher(options)
  }
  
  /**
   * 分析 RSS Feed 的质量
   * 
   * @param url - RSS URL
   * @returns 质量分析结果
   */
  async analyze(url: string): Promise<QualityAnalysis> {
    const now = Date.now()
    
    try {
      // 1. 抓取 RSS 内容
      const fetchResult = await this.fetcher.fetch(url)
      
      if (!fetchResult.success) {
        return {
          score: 0,
          updateFrequency: 0,
          formatValid: false,
          reachable: false,
          lastChecked: now,
          details: {
            updateFrequencyScore: 0,
            completenessScore: 0,
            formatScore: 0,
            reachabilityScore: 0,
          },
          error: fetchResult.error,
        }
      }
      
      // 2. 计算各项评分
      const reachable = true
      const reachabilityScore = 100
      
      const formatValid = this.checkFormatValidity(fetchResult.items, fetchResult.feedInfo)
      const formatScore = formatValid ? 100 : 0
      
      const updateFrequency = this.fetcher.calculateUpdateFrequency(fetchResult.items)
      const updateFrequencyScore = this.calculateUpdateFrequencyScore(updateFrequency)
      
      const completenessScore = this.calculateCompletenessScore(fetchResult.items)
      
      // 3. 计算综合评分
      const score = Math.round(
        updateFrequencyScore * 0.4 +
        completenessScore * 0.3 +
        formatScore * 0.2 +
        reachabilityScore * 0.1
      )
      
      return {
        score,
        updateFrequency,
        formatValid,
        reachable,
        lastChecked: now,
        details: {
          updateFrequencyScore,
          completenessScore,
          formatScore,
          reachabilityScore,
        },
      }
      
    } catch (error) {
      console.error('[FeedQualityAnalyzer] 分析失败:', error)
      
      return {
        score: 0,
        updateFrequency: 0,
        formatValid: false,
        reachable: false,
        lastChecked: now,
        details: {
          updateFrequencyScore: 0,
          completenessScore: 0,
          formatScore: 0,
          reachabilityScore: 0,
        },
        error: error instanceof Error ? error.message : '分析失败',
      }
    }
  }
  
  /**
   * 计算更新频率得分
   * 
   * 评分标准：
   * - 每天更新 (7+ 篇/周): 100 分
   * - 每周 3-7 次: 80 分
   * - 每周 1-2 次: 60 分
   * - 每月更新 (0.25-1 篇/周): 40 分
   * - 更新不规律或太少: 20 分
   */
  private calculateUpdateFrequencyScore(frequency: number): number {
    if (frequency >= 7) {
      return 100
    } else if (frequency >= 3) {
      return 80
    } else if (frequency >= 1) {
      return 60
    } else if (frequency >= 0.25) {
      return 40
    } else {
      return 20
    }
  }
  
  /**
   * 计算内容完整度得分
   * 
   * 评分标准：
   * - 所有文章都有标题+描述/内容+链接: 100 分
   * - 大部分文章完整 (80%+): 80 分
   * - 部分文章完整 (50%+): 60 分
   * - 少部分文章完整: 40 分
   */
  private calculateCompletenessScore(items: FeedItem[]): number {
    if (items.length === 0) {
      return 0
    }
    
    // 检查每篇文章的完整度
    let completeCount = 0
    
    for (const item of items) {
      const hasTitle = !!item.title && item.title.trim().length > 0
      const hasContent = !!(item.description || item.content)
      const hasLink = !!item.link && item.link.trim().length > 0
      
      if (hasTitle && hasContent && hasLink) {
        completeCount++
      }
    }
    
    const completenessRatio = completeCount / items.length
    
    if (completenessRatio >= 1.0) {
      return 100
    } else if (completenessRatio >= 0.8) {
      return 80
    } else if (completenessRatio >= 0.5) {
      return 60
    } else {
      return 40
    }
  }
  
  /**
   * 检查格式规范性
   * 
   * 检查项：
   * - Feed 必须有标题
   * - 至少有一篇文章
   * - 文章必须有标题
   */
  private checkFormatValidity(items: FeedItem[], feedInfo: any): boolean {
    // Feed 必须有标题
    if (!feedInfo.title || feedInfo.title.trim().length === 0) {
      return false
    }
    
    // 必须至少有一篇文章
    if (items.length === 0) {
      return false
    }
    
    // 所有文章必须有标题
    for (const item of items) {
      if (!item.title || item.title.trim().length === 0) {
        return false
      }
    }
    
    return true
  }
}
