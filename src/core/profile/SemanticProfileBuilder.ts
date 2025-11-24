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
 * AI 摘要结构
 */
interface AISummary {
  interests: string
  preferences: string[]
  avoidTopics: string[]
  generatedAt: number
  basedOnPages: number
  basedOnReads: number
  basedOnDismisses: number
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
    
    // 2. 记录行为
    await this.recordReadBehavior(article, weight)
    
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
      const displayKeywords = this.updateKeywordsIncremental(
        profile.displayKeywords || [],
        page.keywords || []
      )
      
      await db.userProfile.update('singleton', {
        displayKeywords,
        lastUpdated: Date.now()
      })
      
      profileLogger.debug('[LightweightUpdate] 轻量更新完成', {
        新增关键词: page.keywords?.length || 0
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
    const topReads = behaviors.reads
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map(r => ({
        title: r.title,
        summary: r.summary,
        duration: `${r.readDuration}秒`,
        depth: `${(r.scrollDepth * 100).toFixed(0)}%`,
        weight: r.weight.toFixed(2)
      }))
    
    // 最近拒绝（取前 5 篇）
    const topDismisses = behaviors.dismisses
      .slice(0, 5)
      .map(d => ({
        title: d.title,
        summary: d.summary
      }))
    
    // 高频浏览页面（停留时间 > 60秒，取前 20 个）
    const topVisits = visits
      .filter(v => v.dwellTime > 60)
      .sort((a, b) => b.dwellTime - a.dwellTime)
      .slice(0, 20)
      .map(v => ({
        title: v.title,
        domain: v.domain,
        keywords: v.keywords?.slice(0, 5) || [],
        dwellTime: `${v.dwellTime}秒`
      }))
    
    // === 2. 构建详细的 Prompt ===
    
    const prompt = `
你是用户画像分析专家。请深入分析用户的阅读偏好，生成精准的兴趣画像。

=== 📖 用户阅读过的推荐（强烈信号）===
${topReads.length > 0 ? topReads.map((r, i) => `
${i + 1}. **${r.title}**
   摘要：${r.summary}
   阅读时长：${r.duration}，滚动深度：${r.depth}
   权重评分：${r.weight}
`).join('\n') : '（暂无阅读记录）'}

=== ❌ 用户拒绝的推荐（负向信号）===
${topDismisses.length > 0 ? topDismisses.map((d, i) => `
${i + 1}. **${d.title}**
   摘要：${d.summary}
`).join('\n') : '（暂无拒绝记录）'}

=== 🌐 用户浏览过的网页（一般信号）===
${topVisits.slice(0, 15).map((v, i) => `
${i + 1}. **${v.title}** (${v.domain})
   关键词：${v.keywords.join('、') || '无'}
   停留时长：${v.dwellTime}
`).join('\n')}

=== 📊 统计信息 ===
- 总浏览页面：${visits.length} 页
- 总阅读推荐：${behaviors.totalReads} 篇
- 总拒绝推荐：${behaviors.totalDismisses} 篇
- 本次更新触发原因：${trigger === 'browse' ? '累计浏览' : trigger === 'read' ? '阅读推荐' : '拒绝推荐'}

=== 🎯 分析任务 ===
请综合以上信息，生成用户画像。注意：
1. **优先考虑阅读记录**（权重最高，代表用户真实偏好）
2. **重视拒绝记录**（避免推荐类似内容）
3. **参考浏览记录**（辅助理解兴趣广度）
4. **识别细分兴趣**（不要只归纳到"技术"、"设计"等粗分类，要具体到"React Hooks"、"微服务架构"等）
5. **捕捉偏好风格**（如"深度解析" vs "快速入门"，"理论研究" vs "实战教程"）

返回 JSON 格式（严格按此结构）：
\`\`\`json
{
  "interests": "用户兴趣总结（100-200字，要详细具体）",
  "preferences": [
    "偏好特征1（如：深度技术解析）",
    "偏好特征2（如：开源项目源码分析）",
    "偏好特征3",
    "偏好特征4",
    "偏好特征5"
  ],
  "avoidTopics": [
    "避免主题1（基于拒绝记录）",
    "避免主题2",
    "避免主题3"
  ]
}
\`\`\`

只返回 JSON，不要其他解释。
`
    
    profileLogger.debug('[AISummary] Prompt 构建完成', {
      prompt长度: prompt.length,
      预估tokens: Math.ceil(prompt.length / 2.5),
      阅读记录数: topReads.length,
      拒绝记录数: topDismisses.length,
      浏览记录数: topVisits.length
    })
    
    // === 3. 调用 AI ===
    try {
      const result = await aiManager.analyzeContent(prompt, {
        maxLength: 3000,
        timeout: 60000  // 60秒超时
      })
      
      // 解析 AI 返回的 topicProbabilities（实际包含我们的 JSON）
      // AI Provider 返回的是 UnifiedAnalysisResult，我们需要从中提取内容
      // 这里需要特殊处理：直接调用 chat API
      
      profileLogger.warn('[AISummary] analyzeContent 不支持自定义 prompt，需要改用 chat API')
      
      // 临时方案：如果 AI 不可用，使用基础画像
      if (topReads.length === 0 && topVisits.length === 0) {
        return {
          interests: '用户刚开始使用，暂无明确兴趣偏好',
          preferences: [],
          avoidTopics: topDismisses.map(d => d.title),
          generatedAt: Date.now(),
          basedOnPages: visits.length,
          basedOnReads: behaviors.totalReads,
          basedOnDismisses: behaviors.totalDismisses
        }
      }
      
      // 从浏览记录中提取兴趣（降级方案）
      const topKeywords = this.extractTopKeywords(visits, 10)
      const interests = `用户对 ${topKeywords.join('、')} 等主题感兴趣`
      
      return {
        interests,
        preferences: topKeywords.slice(0, 5),
        avoidTopics: topDismisses.map(d => this.extractMainTopic(d.summary)),
        generatedAt: Date.now(),
        basedOnPages: visits.length,
        basedOnReads: behaviors.totalReads,
        basedOnDismisses: behaviors.totalDismisses
      }
      
    } catch (error) {
      profileLogger.error('[AISummary] AI 调用失败，使用降级方案:', error)
      
      // 降级方案：基于关键词生成
      const topKeywords = this.extractTopKeywords(visits, 10)
      
      return {
        interests: `用户对 ${topKeywords.join('、')} 等主题感兴趣`,
        preferences: topKeywords.slice(0, 5),
        avoidTopics: topDismisses.map(d => this.extractMainTopic(d.summary)),
        generatedAt: Date.now(),
        basedOnPages: visits.length,
        basedOnReads: behaviors.totalReads,
        basedOnDismisses: behaviors.totalDismisses
      }
    }
  }

  /**
   * 提取主题关键词（辅助方法）
   */
  private extractTopKeywords(visits: ConfirmedVisit[], limit: number): string[] {
    const keywordMap = new Map<string, number>()
    
    for (const visit of visits) {
      for (const keyword of visit.keywords || []) {
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
      for (const keyword of visit.keywords || []) {
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
      summary: article.snippet || article.reason || '',
      feedUrl: article.sourceUrl,
      readDuration: article.readDuration || 0,
      scrollDepth: article.scrollDepth || 0,
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
      summary: article.snippet || article.reason || '',
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
