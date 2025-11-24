/**
 * 语义化用户画像构建器
 * Phase 8: AI 驱动的深度理解
 * 
 * 核心功能：
 * 1. 生成 AI 语义摘要（丰富画像）
 * 2. 记录用户行为（阅读/拒绝）
 * 3. 智能触发更新（增量 vs 全量）
 */

import type { ConfirmedVisit } from "@/types/database"
import type { UserProfile } from "@/types/profile"
import type { Recommendation } from "@/types/database"
import { db } from "@/storage/db"
import { aiManager } from "@/core/ai/AICapabilityManager"
import { logger } from "@/utils/logger"

const profileLogger = logger.withTag('SemanticProfile')

/**
 * 行为记录限制
 */
const MAX_READS = 50
const MAX_DISMISSES = 30

/**
 * 更新触发阈值
 */
const BROWSE_THRESHOLD = 20    // 浏览 20 页触发全量更新
const READ_THRESHOLD = 3       // 阅读 3 篇触发全量更新
const DISMISS_THRESHOLD = 1    // 拒绝 1 篇立即触发全量更新

/**
 * AI 摘要结构（对齐 UserProfileGenerationResult）
 */
interface AISummary {
  interests: string
  preferences: string[]
  avoidTopics: string[]
  metadata: {
    provider: "openai" | "anthropic" | "deepseek" | "keyword"
    model: string
    timestamp: number
    tokensUsed?: {
      input: number
      output: number
    }
    basedOn: {
      browses: number
      reads: number
      dismisses: number
    }
    cost?: number
  }
}

/**
 * 语义化画像构建器
 */
export class SemanticProfileBuilder {
  // 计数器（内存中，不持久化）
  private browseCount = 0
  private readCount = 0
  private dismissCount = 0

  /**
   * 用户浏览页面
   */
  async onBrowse(page: ConfirmedVisit): Promise<void> {
    this.browseCount++
    
    profileLogger.debug('用户浏览页面', {
      title: page.title,
      domain: page.domain,
      累计浏览数: this.browseCount,
      距离更新: BROWSE_THRESHOLD - this.browseCount
    })
    
    if (this.browseCount >= BROWSE_THRESHOLD) {
      // 达到阈值 → 全量更新
      profileLogger.info('🔄 浏览阈值达到，触发全量更新')
      await this.triggerFullUpdate('browse')
      this.browseCount = 0
    } else {
      // 未达阈值 → 轻量更新（只更新关键词）
      await this.triggerLightweightUpdate(page)
    }
  }

  /**
   * 用户阅读推荐
   */
  async onRead(
    article: Recommendation,
    readDuration: number,
    scrollDepth: number
  ): Promise<void> {
    // 1. 计算权重
    const weight = this.calculateReadWeight(readDuration, scrollDepth)
    
    profileLogger.info('📖 用户阅读推荐', {
      title: article.title,
      readDuration: `${readDuration}秒`,
      scrollDepth: `${(scrollDepth * 100).toFixed(0)}%`,
      weight: weight.toFixed(2)
    })
    
    // 2. 记录行为（传递完整参数）
    await this.recordReadBehavior(article, readDuration, scrollDepth, weight)
    
    this.readCount++
    
    if (this.readCount >= READ_THRESHOLD) {
      // 多次阅读 → 全量更新（学习新兴趣）
      profileLogger.info('🔄 阅读阈值达到，触发全量更新')
      await this.triggerFullUpdate('read')
      this.readCount = 0
    }
  }

  /**
   * 用户拒绝推荐
   */
  async onDismiss(article: Recommendation): Promise<void> {
    profileLogger.info('❌ 用户拒绝推荐', {
      title: article.title
    })
    
    // 1. 记录负反馈
    await this.recordDismissBehavior(article)
    
    this.dismissCount++
    
    // 拒绝 → 立即全量更新（避免继续推荐类似内容）
    profileLogger.info('🔄 检测到拒绝行为，立即触发全量更新')
    await this.triggerFullUpdate('dismiss')
    this.dismissCount = 0
  }
  
  /**
   * Phase 8: 手动强制生成 AI 画像
   * 
   * 用于设置页面的"强制更新"按钮
   * 忽略计数器和阈值，直接调用 AI 生成画像
   * 
   * @param trigger 触发来源（用于日志）
   */
  async forceGenerateAIProfile(trigger: string = 'manual'): Promise<void> {
    profileLogger.info('[AI Profile] 🚀 手动强制生成 AI 画像', { trigger })
    
    // 重置计数器（避免重复触发）
    this.browseCount = 0
    this.readCount = 0
    this.dismissCount = 0
    
    // 直接调用全量更新
    await this.triggerFullUpdate(trigger as any)
  }

  /**
   * 全量更新：重新生成 AI 摘要
   */
  private async triggerFullUpdate(
    trigger: 'browse' | 'read' | 'dismiss'
  ): Promise<void> {
    try {
      profileLogger.info('[FullUpdate] 开始全量更新', { trigger })
      
      // 1. 获取数据
      const visits = await db.confirmedVisits.toArray()
      const profile = await db.userProfile.get('singleton')
      const behaviors = profile?.behaviors || {
        reads: [],
        dismisses: [],
        totalReads: 0,
        totalDismisses: 0
      }
      
      profileLogger.debug('[FullUpdate] 数据准备完成', {
        访问页面数: visits.length,
        阅读记录数: behaviors.reads.length,
        拒绝记录数: behaviors.dismisses.length
      })
      
      // 2. 生成 AI 摘要
      const aiSummary = await this.generateAISummary(visits, behaviors, trigger)
      
      // 3. 提取展示关键词（从访问记录，保留 20-30 个）
      const displayKeywords = this.extractDisplayKeywords(visits, behaviors)
      
      // 4. 更新画像
      await db.userProfile.update('singleton', {
        aiSummary,
        behaviors,
        displayKeywords,
        lastUpdated: Date.now()
      })
      
      profileLogger.info('[FullUpdate] ✅ 全量更新完成', {
        trigger,
        兴趣摘要长度: aiSummary.interests.length,
        偏好数: aiSummary.preferences.length,
        避免主题数: aiSummary.avoidTopics.length
      })
      
    } catch (error) {
      profileLogger.error('[FullUpdate] 全量更新失败:', error)
      throw error
    }
  }

  /**
   * 轻量更新：只更新关键词（不调用 AI）
   */
  private async triggerLightweightUpdate(page: ConfirmedVisit): Promise<void> {
    try {
      const profile = await db.userProfile.get('singleton')
      if (!profile) return
      
      // 增量更新关键词权重
      const keywords = page.analysis?.keywords || []
      const displayKeywords = this.updateKeywordsIncremental(
        profile.displayKeywords || [],
        keywords
      )
      
      await db.userProfile.update('singleton', {
        displayKeywords,
        lastUpdated: Date.now()
      })
      
      profileLogger.debug('[LightweightUpdate] 轻量更新完成', {
        新增关键词: keywords.length
      })
      
    } catch (error) {
      profileLogger.error('[LightweightUpdate] 轻量更新失败:', error)
    }
  }

  /**
   * 生成 AI 语义摘要
   */
  private async generateAISummary(
    visits: ConfirmedVisit[],
    behaviors: NonNullable<UserProfile['behaviors']>,
    trigger: string
  ): Promise<AISummary> {
    
    profileLogger.info('[AISummary] 开始生成语义摘要...')
    
    // === 1. 准备上下文数据 ===
    
    // 最近阅读（按权重排序，取前 10 篇）
    const topReads = [...behaviors.reads]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
    
    // 最近拒绝（取前 5 篇）
    const topDismisses = behaviors.dismisses.slice(0, 5)
    
    // 高频浏览页面（停留时间 > 60秒，取前 20 个）
    const topVisits = visits
      .filter(v => v.duration > 60)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 20)
    
    // 提取高频关键词
    const keywordMap = new Map<string, number>()
    
    // 从浏览记录
    for (const visit of visits) {
      const keywords = visit.analysis?.keywords || []
      for (const keyword of keywords) {
        keywordMap.set(keyword, (keywordMap.get(keyword) || 0) + 0.3)
      }
    }
    
    // 从阅读记录（权重更高）
    for (const read of behaviors.reads) {
      const words = this.extractWords(read.title + ' ' + read.summary)
      for (const word of words) {
        keywordMap.set(word, (keywordMap.get(word) || 0) + read.weight)
      }
    }
    
    // 从拒绝记录（负权重）
    for (const dismiss of behaviors.dismisses) {
      const words = this.extractWords(dismiss.title + ' ' + dismiss.summary)
      for (const word of words) {
        keywordMap.set(word, (keywordMap.get(word) || 0) - 0.5)
      }
    }
    
    const topKeywords = Array.from(keywordMap.entries())
      .map(([word, weight]) => ({ word, weight }))
      .filter(k => k.weight > 0.1)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 50)
    
    // 主题分布（简化版，从访问记录提取）
    const topicDistribution: Record<string, number> = {}
    for (const visit of visits) {
      const topics = visit.analysis?.topics || []
      for (const topic of topics) {
        topicDistribution[topic] = (topicDistribution[topic] || 0) + 0.1
      }
    }
    
    // === 2. 调用专用的画像生成 API ===
    try {
      const result = await aiManager.generateUserProfile({
        behaviors: {
          browses: topVisits.map(v => ({
            keywords: v.analysis?.keywords || [],
            topics: v.analysis?.topics || [],
            weight: v.duration / 300, // 标准化到 0-1
            timestamp: v.visitTime
          })),
          reads: topReads.map(r => ({
            title: r.title,
            keywords: this.extractWords(r.title),
            topics: [], // 从标题提取的主题
            readDuration: r.readDuration,
            scrollDepth: r.scrollDepth,
            weight: r.weight,
            timestamp: r.timestamp
          })),
          dismisses: topDismisses.map(d => ({
            title: d.title,
            keywords: this.extractWords(d.title),
            topics: [],
            weight: d.weight,
            timestamp: d.timestamp
          }))
        },
        topKeywords,
        topicDistribution,
        currentProfile: undefined // 暂时不支持增量更新，后续可扩展
      })
      
      profileLogger.info('[AISummary] ✅ AI 画像生成成功', {
        provider: result.metadata.provider,
        兴趣摘要长度: result.interests.length,
        偏好数: result.preferences.length,
        避免主题数: result.avoidTopics.length
      })
      
      // 直接返回 AI 生成结果（已包含完整 metadata）
      return result
      
    } catch (error) {
      profileLogger.error('[AISummary] AI 生成失败，使用降级方案', error)
      
      // === 3. 降级方案：基于关键词生成简单画像 ===
      const topKeywordNames = topKeywords.slice(0, 10).map(k => k.word)
      
      return {
        interests: topKeywordNames.length > 0 
          ? `对 ${topKeywordNames.join('、')} 等主题感兴趣`
          : '正在学习您的兴趣偏好',
        preferences: ['技术文章', '新闻资讯', '深度分析'].slice(0, 3),
        avoidTopics: topDismisses.map(d => this.extractMainTopic(d.summary)).slice(0, 5),
        metadata: {
          provider: 'keyword',
          model: 'local-keyword-extraction',
          timestamp: Date.now(),
          basedOn: {
            browses: visits.length,
            reads: behaviors.totalReads,
            dismisses: behaviors.totalDismisses
          }
        }
      }
    }
  }

  /**
   * 从访问记录中提取高频关键词
   */
  private extractTopKeywords(visits: ConfirmedVisit[], limit: number): string[] {
    const keywordMap = new Map<string, number>()
    
    for (const visit of visits) {
      const keywords = visit.analysis?.keywords || []
      for (const keyword of keywords) {
        keywordMap.set(keyword, (keywordMap.get(keyword) || 0) + 1)
      }
    }
    
    return Array.from(keywordMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word)
  }

  /**
   * 提取主题（从摘要中）
   */
  private extractMainTopic(summary: string): string {
    // 简单提取：取前20个字符作为主题
    return summary.slice(0, 20) + (summary.length > 20 ? '...' : '')
  }

  /**
   * 提取展示关键词
   */
  private extractDisplayKeywords(
    visits: ConfirmedVisit[],
    behaviors: NonNullable<UserProfile['behaviors']>
  ): UserProfile['displayKeywords'] {
    
    const keywordMap = new Map<string, { weight: number, source: 'browse' | 'read' | 'dismiss' }>()
    
    // 1. 从浏览记录提取（权重 1）
    for (const visit of visits) {
      const keywords = visit.analysis?.keywords || []
      for (const keyword of keywords) {
        const existing = keywordMap.get(keyword)
        if (existing) {
          existing.weight += 1
        } else {
          keywordMap.set(keyword, { weight: 1, source: 'browse' })
        }
      }
    }
    
    // 2. 从阅读记录提取（权重 5）
    for (const read of behaviors.reads) {
      const words = this.extractWords(read.title + ' ' + read.summary)
      for (const word of words) {
        const existing = keywordMap.get(word)
        if (existing) {
          existing.weight += 5
          existing.source = 'read'  // 升级来源
        } else {
          keywordMap.set(word, { weight: 5, source: 'read' })
        }
      }
    }
    
    // 3. 从拒绝记录提取（负权重 -3）
    for (const dismiss of behaviors.dismisses) {
      const words = this.extractWords(dismiss.title + ' ' + dismiss.summary)
      for (const word of words) {
        const existing = keywordMap.get(word)
        if (existing) {
          existing.weight -= 3
        } else {
          keywordMap.set(word, { weight: -3, source: 'dismiss' })
        }
      }
    }
    
    // 4. 排序并取前 30 个
    return Array.from(keywordMap.entries())
      .map(([word, { weight, source }]) => ({ word, weight, source }))
      .filter(k => k.weight > 0)  // 过滤负权重
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 30)
  }

  /**
   * 简单分词（提取中英文词）
   */
  private extractWords(text: string): string[] {
    // 提取 2-10 个字符的中文词和英文单词
    const words: string[] = []
    
    // 中文词
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,10}/g) || []
    words.push(...chineseWords)
    
    // 英文词
    const englishWords = text.match(/[a-zA-Z]{2,10}/g) || []
    words.push(...englishWords)
    
    return words.filter(w => w.length >= 2)
  }

  /**
   * 增量更新关键词
   */
  private updateKeywordsIncremental(
    existing: UserProfile['displayKeywords'],
    newKeywords: string[]
  ): UserProfile['displayKeywords'] {
    
    const keywordMap = new Map<string, { weight: number, source: 'browse' | 'read' | 'dismiss' }>()
    
    // 1. 加载现有关键词
    for (const kw of existing || []) {
      keywordMap.set(kw.word, { weight: kw.weight, source: kw.source })
    }
    
    // 2. 增量更新
    for (const word of newKeywords) {
      const existing = keywordMap.get(word)
      if (existing) {
        existing.weight += 0.1  // 小幅增加
      } else {
        keywordMap.set(word, { weight: 0.1, source: 'browse' })
      }
    }
    
    // 3. 排序并限制数量
    return Array.from(keywordMap.entries())
      .map(([word, { weight, source }]) => ({ word, weight, source }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 30)
  }

  /**
   * 计算阅读权重
   */
  private calculateReadWeight(readDuration: number, scrollDepth: number): number {
    // 基础分：0.3
    // 时长分：最多 0.5（阅读 5 分钟 = 满分）
    // 深度分：最多 0.2（滚动 100% = 满分）
    
    const baseScore = 0.3
    const durationScore = Math.min(0.5, (readDuration / 300) * 0.5)
    const depthScore = scrollDepth * 0.2
    
    return baseScore + durationScore + depthScore
  }

  /**
   * 记录阅读行为
   */
  private async recordReadBehavior(
    article: Recommendation,
    readDuration: number,
    scrollDepth: number,
    weight: number
  ): Promise<void> {
    
    const profile = await db.userProfile.get('singleton')
    const behaviors = profile?.behaviors || {
      reads: [],
      dismisses: [],
      totalReads: 0,
      totalDismisses: 0
    }
    
    // 添加新记录
    behaviors.reads.unshift({
      articleId: article.id,
      title: article.title,
      summary: article.summary || '',
      feedUrl: article.sourceUrl,
      readDuration,
      scrollDepth,
      timestamp: Date.now(),
      weight
    })
    
    // 限制数量
    behaviors.reads = behaviors.reads.slice(0, MAX_READS)
    behaviors.totalReads++
    behaviors.lastReadAt = Date.now()
    
    await db.userProfile.update('singleton', { behaviors })
  }

  /**
   * 记录拒绝行为
   */
  private async recordDismissBehavior(article: Recommendation): Promise<void> {
    const profile = await db.userProfile.get('singleton')
    const behaviors = profile?.behaviors || {
      reads: [],
      dismisses: [],
      totalReads: 0,
      totalDismisses: 0
    }
    
    // 添加新记录
    behaviors.dismisses.unshift({
      articleId: article.id,
      title: article.title,
      summary: article.summary || '',
      feedUrl: article.sourceUrl,
      timestamp: Date.now(),
      weight: -1
    })
    
    // 限制数量
    behaviors.dismisses = behaviors.dismisses.slice(0, MAX_DISMISSES)
    behaviors.totalDismisses++
    behaviors.lastDismissAt = Date.now()
    
    await db.userProfile.update('singleton', { behaviors })
  }
}

/**
 * 全局单例
 */
export const semanticProfileBuilder = new SemanticProfileBuilder()
