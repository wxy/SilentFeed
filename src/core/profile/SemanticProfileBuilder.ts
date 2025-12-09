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
import type { TopicDistribution } from "@/core/profile/TopicClassifier"
import { Topic } from "@/core/profile/topics"
import { db } from "@/storage/db"
import { aiManager } from "@/core/ai/AICapabilityManager"
import { logger } from "@/utils/logger"
import { getRecommendationConfig } from "@/storage/recommendation-config"

const profileLogger = logger.withTag('SemanticProfile')

/**
 * 行为记录限制
 */
const MAX_READS = 50
const MAX_DISMISSES = 30

/**
 * Phase 12.7: 更新触发阈值（统一调度机制）
 * 
 * 核心设计：
 * - BROWSE_THRESHOLD: 浏览 50 页触发画像更新
 * - READ_THRESHOLD: 动态获取，等于弹窗容量 (maxRecommendations)
 * - DISMISS_THRESHOLD: 动态获取，等于弹窗容量 (maxRecommendations)
 * - GLOBAL_UPDATE_INTERVAL_MS: 3 小时全局间隔（所有行为共享）
 * 
 * 触发逻辑：
 *   (距上次更新 ≥ 3小时) AND (浏览≥50 OR 阅读≥弹窗容量 OR 拒绝≥弹窗容量)
 * 
 * 频率控制：
 *   工作日 8 小时 ÷ 3 小时间隔 = 最多 3 次自动更新
 */
const BROWSE_THRESHOLD = 50     // 浏览 50 页触发全量更新
// READ_THRESHOLD 动态获取，等于弹窗容量（3-5 条）
// DISMISS_THRESHOLD 动态获取，等于弹窗容量（3-5 条）

/**
 * Phase 12.7: 全局时间间隔（所有行为共享）
 */
const GLOBAL_UPDATE_INTERVAL_MS = 10800000  // 3 小时（控制自动更新频率）
const DISMISS_DEBOUNCE_MS = 300000          // 拒绝操作防抖时间：5 分钟

/**
 * AI 摘要结构（对齐 UserProfileGenerationResult）
 */
interface AISummary {
  interests: string
  preferences: string[]
  avoidTopics: string[]
  metadata: {
    provider: "openai" | "anthropic" | "deepseek" | "keyword" | "ollama"
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
  // 行为计数器（内存中，不持久化，触发后全部重置）
  private browseCount = 0
  private readCount = 0
  private dismissCount = 0

  // Phase 12.7: 全局时间控制（所有行为共享）
  private lastAutoUpdateTime = 0

  // 防抖机制：拒绝操作
  private dismissDebounceTimer: NodeJS.Timeout | null = null
  private dismissQueue: Recommendation[] = []

  // Phase 11: 任务锁机制（防止重叠执行）
  private isGeneratingProfile = false
  private pendingTasks: Array<() => Promise<void>> = []

  // 浏览去重：防止短时间内重复处理同一页面（5分钟内）
  private recentBrowses = new Map<string, number>()  // url -> timestamp
  private readonly BROWSE_DEDUP_MS = 5 * 60 * 1000  // 5分钟去重窗口

  /**
   * 用户浏览页面
   */
  async onBrowse(page: ConfirmedVisit): Promise<void> {
    // 去重检查：5分钟内相同 URL 只处理一次
    const now = Date.now()
    const lastBrowseTime = this.recentBrowses.get(page.url)
    
    if (lastBrowseTime && (now - lastBrowseTime) < this.BROWSE_DEDUP_MS) {
      profileLogger.debug('⏭️ 跳过重复浏览', {
        url: page.url,
        title: page.title,
        上次处理: `${Math.floor((now - lastBrowseTime) / 1000)}秒前`
      })
      return
    }
    
    // 记录本次浏览
    this.recentBrowses.set(page.url, now)
    
    // 清理过期的去重记录（避免内存泄漏）
    this.cleanupRecentBrowses(now)
    
    this.browseCount++
    
    profileLogger.debug('用户浏览页面', {
      title: page.title,
      domain: page.domain,
      累计浏览数: this.browseCount,
      距离更新: BROWSE_THRESHOLD - this.browseCount
    })
    
    if (this.browseCount >= BROWSE_THRESHOLD) {
      // 达到阈值 → 检查全局时间间隔
      const timeSinceLastUpdate = Date.now() - this.lastAutoUpdateTime
      if (timeSinceLastUpdate >= GLOBAL_UPDATE_INTERVAL_MS) {
        profileLogger.info('🔄 浏览阈值达到且时间间隔充足，触发全量更新')
        await this.triggerFullUpdate('browse')
        this.resetAllCounters()  // Phase 12.7: 重置所有计数器
        this.lastAutoUpdateTime = Date.now()
      } else {
        const remainingMinutes = Math.ceil((GLOBAL_UPDATE_INTERVAL_MS - timeSinceLastUpdate) / 60000)
        profileLogger.debug(`⏭️ 浏览阈值已达到，但距上次更新仅 ${Math.floor(timeSinceLastUpdate / 60000)} 分钟，需等待 ${remainingMinutes} 分钟`)
        // 继续累计，等待时间间隔满足
      }
    } else {
      // 未达阈值 → 轻量更新（只更新关键词）
      await this.triggerLightweightUpdate(page)
    }
  }

  /**
   * 清理过期的去重记录
   */
  private cleanupRecentBrowses(now: number): void {
    for (const [url, timestamp] of this.recentBrowses.entries()) {
      if (now - timestamp > this.BROWSE_DEDUP_MS) {
        this.recentBrowses.delete(url)
      }
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
    
    // Phase 12.7: 阅读阈值动态获取，等于弹窗容量（与拒绝对称）
    const config = await getRecommendationConfig()
    const readThreshold = config.maxRecommendations
    
    if (this.readCount >= readThreshold) {
      // 达到阈值 → 检查全局时间间隔
      const timeSinceLastUpdate = Date.now() - this.lastAutoUpdateTime
      if (timeSinceLastUpdate >= GLOBAL_UPDATE_INTERVAL_MS) {
        profileLogger.info(`🔄 阅读阈值达到 (${this.readCount}/${readThreshold}) 且时间间隔充足，触发全量更新`)
        await this.triggerFullUpdate('read')
        this.resetAllCounters()  // Phase 12.7: 重置所有计数器
        this.lastAutoUpdateTime = Date.now()
      } else {
        const remainingMinutes = Math.ceil((GLOBAL_UPDATE_INTERVAL_MS - timeSinceLastUpdate) / 60000)
        profileLogger.debug(`⏭️ 阅读阈值已达到，但距上次更新仅 ${Math.floor(timeSinceLastUpdate / 60000)} 分钟，需等待 ${remainingMinutes} 分钟`)
      }
    }
  }

  /**
   * 用户拒绝推荐（优化版：防抖 + 批量阈值）
   * Phase 12.7: 使用全局时间间隔控制
   */
  async onDismiss(article: Recommendation): Promise<void> {
    profileLogger.info('❌ 用户拒绝推荐', {
      title: article.title,
      当前队列: this.dismissQueue.length
    })
    
    // 1. 立即记录负反馈（不能延迟，因为需要立即从推荐池移除）
    await this.recordDismissBehavior(article)
    
    // 2. 加入待处理队列
    this.dismissQueue.push(article)
    this.dismissCount++
    
    // 3. 清除旧的防抖定时器
    if (this.dismissDebounceTimer) {
      clearTimeout(this.dismissDebounceTimer)
      profileLogger.debug('清除旧的防抖定时器')
    }
    
    // 4. 动态获取触发阈值（等于弹窗容量）
    // 原理：用户拒绝一屏弹窗的所有推荐后，应该重新学习用户兴趣
    const config = await getRecommendationConfig()
    const dismissThreshold = config.maxRecommendations // 3-5 条，自适应调整
    
    // 5. 检查是否达到批量阈值（一个弹窗容量的拒绝）
    if (this.dismissQueue.length >= dismissThreshold) {
      const timeSinceLastUpdate = Date.now() - this.lastAutoUpdateTime
      if (timeSinceLastUpdate >= GLOBAL_UPDATE_INTERVAL_MS) {
        profileLogger.info(`🔄 达到批量阈值 (${this.dismissQueue.length}/${dismissThreshold}) 且时间间隔充足，触发画像更新`)
        
        // 立即执行画像更新
        await this.triggerFullUpdate('dismiss')
        
        // Phase 12.7: 重置所有状态
        this.resetAllCounters()
        this.dismissQueue = []
        this.dismissDebounceTimer = null
        this.lastAutoUpdateTime = Date.now()
        return
      } else {
        const remainingMinutes = Math.ceil((GLOBAL_UPDATE_INTERVAL_MS - timeSinceLastUpdate) / 60000)
        profileLogger.info(`⏭️ 批量阈值已达到 (${this.dismissQueue.length}/${dismissThreshold})，但距上次更新仅 ${Math.floor(timeSinceLastUpdate / 60000)} 分钟，需等待 ${remainingMinutes} 分钟后再触发`)
        // 继续使用防抖机制
      }
    }
    
    // 6. 设置新的防抖定时器（5分钟后执行）
    this.dismissDebounceTimer = setTimeout(async () => {
      const count = this.dismissQueue.length
      const timeSinceLastUpdate = Date.now() - this.lastAutoUpdateTime
      
      if (timeSinceLastUpdate >= GLOBAL_UPDATE_INTERVAL_MS) {
        profileLogger.info(`🔄 防抖触发: 批量处理 ${count} 条拒绝记录，触发画像更新`)
        
        // 执行画像更新
        await this.triggerFullUpdate('dismiss')
        this.resetAllCounters()
        this.lastAutoUpdateTime = Date.now()
      } else {
        const remainingMinutes = Math.ceil((GLOBAL_UPDATE_INTERVAL_MS - timeSinceLastUpdate) / 60000)
        profileLogger.info(`⏭️ 防抖触发但时间间隔不足（距上次更新 ${Math.floor(timeSinceLastUpdate / 60000)} 分钟），跳过更新，需等待 ${remainingMinutes} 分钟`)
      }
      
      // 重置队列状态
      this.dismissQueue = []
      this.dismissDebounceTimer = null
    }, DISMISS_DEBOUNCE_MS)
    
    profileLogger.debug(`拒绝操作已加入队列 (${this.dismissQueue.length}/${this.dismissCount})，${DISMISS_DEBOUNCE_MS / 1000}秒后触发更新（或达到 ${dismissThreshold} 次立即触发）`)
  }
  
  /**
   * Phase 12.7: 重置所有行为计数器
   * 触发更新后调用，确保行为已被学习
   */
  private resetAllCounters(): void {
    this.browseCount = 0
    this.readCount = 0
    this.dismissCount = 0
    profileLogger.debug('✅ 已重置所有行为计数器')
  }
  
  /**
   * 清理资源（组件卸载时调用）
   */
  cleanup(): void {
    if (this.dismissDebounceTimer) {
      clearTimeout(this.dismissDebounceTimer)
      this.dismissDebounceTimer = null
      profileLogger.debug('清理防抖定时器')
    }
    
    // Phase 11: 清理任务锁
    this.isGeneratingProfile = false
    this.pendingTasks = []
  }
  
  /**
   * Phase 8: 手动强制生成 AI 画像
   * 
   * 用于设置页面的"强制更新"按钮
   * 忽略计数器和阈值，直接调用 AI 生成画像
   * Phase 12.7: 手动触发不受时间间隔限制
   * 
   * @param trigger 触发来源（用于日志）
   */
  async forceGenerateAIProfile(trigger: string = 'manual'): Promise<void> {
    profileLogger.info('[AI Profile] 🚀 手动强制生成 AI 画像', { trigger })
    
    // Phase 12.7: 重置所有计数器
    this.resetAllCounters()
    this.dismissQueue = []
    
    // 直接调用全量更新（手动触发不更新 lastAutoUpdateTime，不影响自动触发的时间窗口）
    await this.triggerFullUpdate(trigger as any)
  }

  /**
   * Phase 11: 查询 AI 画像生成状态
   * 
   * 用于 UI 显示进度条
   */
  isGenerating(): boolean {
    return this.isGeneratingProfile
  }

  /**
   * 全量更新：重新生成 AI 摘要
   */
  private async triggerFullUpdate(
    trigger: 'browse' | 'read' | 'dismiss' | 'manual' | 'rebuild'
  ): Promise<void> {
    // Phase 11: 任务锁机制 - 防止重叠执行
    if (this.isGeneratingProfile) {
      profileLogger.warn('[FullUpdate] ⚠️ AI 画像生成中，跳过本次请求', { trigger })
      return
    }

    this.isGeneratingProfile = true
    
    try {
      profileLogger.info('[FullUpdate] 开始全量更新', { trigger })
      
      // 1. 获取数据
      const visits = await db.confirmedVisits.toArray()
      
      // ⚠️ 关键修复：从数据库重建 behaviors（而不是只从内存读取）
      const behaviors = await this.rebuildBehaviorsFromDatabase()
      
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
    } finally {
      // 释放锁
      this.isGeneratingProfile = false
      profileLogger.debug('[FullUpdate] 任务锁已释放')
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
    
    // Phase 8.2: 确保 AI Manager 已初始化
    await aiManager.initialize()
    
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
            summary: r.summary || '',  // 包含文章摘要
            keywords: this.extractWords(r.title),
            topics: [], // 从标题提取的主题
            readDuration: r.readDuration,
            scrollDepth: r.scrollDepth,
            weight: r.weight,
            timestamp: r.timestamp
          })),
          dismisses: topDismisses.map(d => ({
            title: d.title,
            summary: d.summary || '',  // ⚠️ 关键：包含拒绝文章摘要，用于生成 avoidTopics
            keywords: this.extractWords(d.title),
            topics: [],
            weight: d.weight,
            timestamp: d.timestamp
          }))
        },
        topKeywords,
        topicDistribution,
        // Phase 8.2: 传递真实的行为总数
        totalCounts: {
          browses: visits.length,
          reads: behaviors.totalReads,
          dismisses: behaviors.totalDismisses
        },
        currentProfile: undefined // 暂时不支持增量更新，后续可扩展
      })
      
      profileLogger.info('[AISummary] ✅ AI 画像生成成功', {
        provider: result.metadata.provider,
        兴趣摘要长度: result.interests.length,
        偏好数: result.preferences.length,
        避免主题数: result.avoidTopics.length,
        避免主题: result.avoidTopics
      })
      
      // 直接返回 AI 生成结果（已包含完整 metadata 和 avoidTopics）
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
   * ⚠️ 关键修复：从数据库重建 behaviors
   * 
   * 读取所有已读和已拒绝的推荐记录，重新构建 behaviors 对象
   * 这样即使 userProfile.behaviors 被清空，也能从数据库恢复
   * 
   * @public 供 ProfileManager 调用
   */
  async rebuildBehaviorsFromDatabase(): Promise<NonNullable<UserProfile['behaviors']>> {
    const profile = await db.userProfile.get('singleton')
    const storedBehaviors = profile?.behaviors || {
      reads: [],
      dismisses: [],
      totalReads: 0,
      totalDismisses: 0
    }

    const recommendationsTable = db.recommendations
    if (!recommendationsTable || typeof recommendationsTable.toArray !== 'function') {
      profileLogger.warn('[RebuildBehaviors] 推荐表不可用，回退到存储的 behaviors')
      return storedBehaviors
    }

    let readRecommendations: Recommendation[] = []
    let dismissedRecommendations: Recommendation[] = []

    try {
      const rawRecommendations = await recommendationsTable.toArray()
      const allRecommendations = Array.isArray(rawRecommendations) ? rawRecommendations : []
      readRecommendations = allRecommendations
        .filter(r => r?.isRead)
        .sort((a, b) => (b?.recommendedAt || 0) - (a?.recommendedAt || 0))
      
      if (typeof recommendationsTable.where === 'function') {
        dismissedRecommendations = await recommendationsTable
          .where('status').equals('dismissed')
          .reverse()
          .sortBy('feedbackAt')
      }
    } catch (error) {
      profileLogger.warn('[RebuildBehaviors] 查询推荐记录失败，使用存储行为回退', error)
      return storedBehaviors
    }
    
    // 3. 构建 reads 数组
    const readsFromRecommendations = readRecommendations.map(rec => ({
      articleId: rec.id,
      title: rec.title,
      summary: rec.summary || '',
      feedUrl: rec.sourceUrl, // 使用 sourceUrl 作为 feedUrl
      weight: 1.0, // 默认权重
      readDuration: rec.readDuration || 0,
      scrollDepth: rec.scrollDepth || 0,
      timestamp: rec.clickedAt || rec.recommendedAt || Date.now()
    }))
    
    // 4. 构建 dismisses 数组
    const dismissesFromRecommendations = dismissedRecommendations.map(rec => ({
      articleId: rec.id,
      title: rec.title,
      summary: rec.summary || '',
      feedUrl: rec.sourceUrl, // 使用 sourceUrl 作为 feedUrl
      weight: 1.0, // 默认权重
      timestamp: rec.feedbackAt || rec.recommendedAt || Date.now()
    }))

    const reads = readsFromRecommendations.length > 0
      ? readsFromRecommendations
      : storedBehaviors.reads || []
    const dismisses = dismissesFromRecommendations.length > 0
      ? dismissesFromRecommendations
      : storedBehaviors.dismisses || []
    
    profileLogger.info('[RebuildBehaviors] 从数据库重建 behaviors', {
      reads: reads.length,
      dismisses: dismisses.length
    })
    
    return {
      reads: reads.slice(0, 50),
      dismisses: dismisses.slice(0, 50),
      totalReads: readsFromRecommendations.length > 0
        ? readsFromRecommendations.length
        : storedBehaviors.totalReads || reads.length,
      totalDismisses: dismissesFromRecommendations.length > 0
        ? dismissesFromRecommendations.length
        : storedBehaviors.totalDismisses || dismisses.length,
      lastReadAt: reads[0]?.timestamp || storedBehaviors.lastReadAt,
      lastDismissAt: dismisses[0]?.timestamp || storedBehaviors.lastDismissAt
    }
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
    
    let profile = await db.userProfile.get('singleton')
    
    // ⚠️ 关键修复：如果画像不存在，先创建一个空画像
    if (!profile) {
      const emptyTopics: TopicDistribution = Object.values(Topic).reduce((acc, topic) => {
        acc[topic] = 0
        return acc
      }, {} as TopicDistribution)
      
      profile = {
        id: 'singleton',
        topics: emptyTopics,
        keywords: [],
        domains: [],
        totalPages: 0,
        lastUpdated: Date.now(),
        version: 2
      }
      await db.userProfile.put(profile)
      profileLogger.info('创建空画像以保存 behaviors 数据')
    }
    
    const behaviors = profile.behaviors || {
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
    let profile = await db.userProfile.get('singleton')
    
    // ⚠️ 关键修复：如果画像不存在，先创建一个空画像
    if (!profile) {
      const emptyTopics: TopicDistribution = Object.values(Topic).reduce((acc, topic) => {
        acc[topic] = 0
        return acc
      }, {} as TopicDistribution)
      
      profile = {
        id: 'singleton',
        topics: emptyTopics,
        keywords: [],
        domains: [],
        totalPages: 0,
        lastUpdated: Date.now(),
        version: 2
      }
      await db.userProfile.put(profile)
      profileLogger.info('创建空画像以保存 behaviors 数据')
    }
    
    const behaviors = profile.behaviors || {
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
    profileLogger.debug(`✅ 拒绝行为已保存: ${article.title.substring(0, 30)}, 总拒绝数: ${behaviors.totalDismisses}`)
  }
}

/**
 * 全局单例
 */
export const semanticProfileBuilder = new SemanticProfileBuilder()
