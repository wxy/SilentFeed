/**
 * 订阅源 AI 质量分析服务
 * 
 * 使用 AI 对订阅源进行深度分析，评估其内容质量、主题分类和订阅价值。
 * 
 * 触发时机：
 * - 首次读取订阅源文章时（延迟分析，避免订阅时的压力）
 * - 用户手动点击质量标签/分类标签触发
 * 
 * @module core/rss/SourceAnalysisService
 */

import { db } from '@/storage/db'
import { logger } from '@/utils/logger'
import type { SourceAnalysisResult } from '@/core/ai/prompts/types'
import type { DiscoveredFeed, FeedArticle, FeedQuality } from '@/types/rss'

const analysisLogger = logger.withTag('SourceAnalysis')

/**
 * AI 分析结果（存储在数据库中）
 */
export interface AISourceAnalysis {
  /** 订阅源 ID */
  feedId: string
  /** 分析时间戳 */
  analyzedAt: number
  /** 是否使用了 AI 分析 */
  isAIAnalyzed: boolean
  /** 综合质量分数 (0-1) */
  qualityScore: number
  /** 主要内容分类（标准 key：tech, news, finance 等） */
  contentCategory: string
  /** 次要分类（标准 key，可选） */
  secondaryCategory?: string
  /** 细分领域标签 */
  topicTags: string[]
  /** 订阅建议 */
  subscriptionAdvice: string
  /** 内容语言（标准代码：zh-CN, en, ja 等） */
  language?: string
  /** 详细评分 */
  details?: {
    contentQuality: number
    updateFrequency: number
    informationDensity: number
    promotionalRatio: number
  }
  /** 分析错误（如果有） */
  error?: string
}

/**
 * 订阅源分析服务配置
 */
export interface SourceAnalysisConfig {
  /** 样本文章数量 */
  sampleSize: number
  /** 分析结果缓存时间（毫秒） */
  cacheTime: number
  /** 是否启用 AI 分析 */
  enableAI: boolean
}

const DEFAULT_CONFIG: SourceAnalysisConfig = {
  sampleSize: 5,
  cacheTime: 7 * 24 * 60 * 60 * 1000, // 7 天
  enableAI: true
}

/**
 * 订阅源 AI 质量分析服务
 */
export class SourceAnalysisService {
  private config: SourceAnalysisConfig

  constructor(config: Partial<SourceAnalysisConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 检查订阅源是否需要 AI 分析
   * 
   * 条件：
   * - 从未进行过 AI 分析
   * - 或 AI 分析结果已过期
   */
  async needsAnalysis(feedId: string): Promise<boolean> {
    const feed = await db.discoveredFeeds.get(feedId)
    if (!feed) return false
    
    // 检查是否已有 AI 分析结果
    const analysis = await this.getAnalysis(feedId)
    if (!analysis) return true
    
    // 检查是否过期
    const age = Date.now() - analysis.analyzedAt
    return age >= this.config.cacheTime
  }

  /**
   * 获取订阅源的 AI 分析结果
   */
  async getAnalysis(feedId: string): Promise<AISourceAnalysis | null> {
    const feed = await db.discoveredFeeds.get(feedId)
    if (!feed) return null
    
    // 检查是否有存储的 AI 分析结果
    // 存储在 feed.aiAnalysis 字段中
    return (feed as any).aiAnalysis ?? null
  }

  /**
   * 执行 AI 分析
   * 
   * @param feedId 订阅源 ID
   * @param force 是否强制重新分析（忽略缓存）
   * @returns 分析结果
   */
  async analyze(feedId: string, force: boolean = false): Promise<AISourceAnalysis | null> {
    // 检查是否需要分析
    if (!force && !(await this.needsAnalysis(feedId))) {
      return await this.getAnalysis(feedId)
    }

    const feed = await db.discoveredFeeds.get(feedId)
    if (!feed) {
      analysisLogger.error('分析失败：订阅源不存在', feedId)
      return null
    }

    analysisLogger.info('开始 AI 分析订阅源:', { title: feed.title, id: feedId })

    try {
      // 1. 获取样本文章
      const sampleArticles = await this.getSampleArticles(feedId)
      
      if (sampleArticles.length === 0) {
        analysisLogger.warn('没有可用的样本文章，跳过 AI 分析')
        return this.saveAnalysis(feedId, {
          feedId,
          analyzedAt: Date.now(),
          isAIAnalyzed: false,
          qualityScore: 0.5, // 默认中等分数
          contentCategory: 'other',
          topicTags: [],
          subscriptionAdvice: '尚无足够内容进行分析',
          error: '没有可用的样本文章'
        })
      }

      // 2. 调用 AI 进行分析（传递 feed 和 sampleArticles）
      const result = await this.callAI(feed, sampleArticles)

      // 3. 解析和保存结果
      const analysis: AISourceAnalysis = {
        feedId,
        analyzedAt: Date.now(),
        isAIAnalyzed: true,
        qualityScore: result.qualityScore,
        contentCategory: result.contentCategory,
        secondaryCategory: result.secondaryCategory,
        topicTags: result.topicTags,
        subscriptionAdvice: result.subscriptionAdvice,
        language: result.language,
        details: result.details
      }

      return this.saveAnalysis(feedId, analysis)
    } catch (error) {
      analysisLogger.error('AI 分析失败:', { feedId, error })
      
      // 保存错误状态
      return this.saveAnalysis(feedId, {
        feedId,
        analyzedAt: Date.now(),
        isAIAnalyzed: false,
        qualityScore: 0.5,
        contentCategory: 'other',
        topicTags: [],
        subscriptionAdvice: '分析失败，请稍后重试',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 获取样本文章用于分析
   */
  private async getSampleArticles(feedId: string): Promise<FeedArticle[]> {
    return db.feedArticles
      .where('feedId')
      .equals(feedId)
      .limit(this.config.sampleSize)
      .toArray()
  }

  /**
   * 格式化样本文章为提示词使用的文本
   * 
   * 优化策略：只使用标题和摘要（description），不使用完整内容
   * 这样可以大幅减少 AI 输入，加快分析速度
   */
  private formatSampleArticles(articles: FeedArticle[]): string {
    const MAX_DESC_LENGTH = 150  // 每篇文章描述最大长度
    const MAX_TOTAL_LENGTH = 2000  // 总文本最大长度
    
    let result = ''
    
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      const title = article.title || '(无标题)'
      
      // 只使用 description（摘要），不使用完整 content
      // description 通常是 RSS 源提供的文章摘要，更简洁
      const desc = article.description || ''
      const summary = desc 
        ? desc.slice(0, MAX_DESC_LENGTH) + (desc.length > MAX_DESC_LENGTH ? '...' : '')
        : '(无摘要)'
      
      const entry = `${i + 1}. 「${title}」\n   ${summary}\n\n`
      
      // 检查是否超过总长度限制
      if (result.length + entry.length > MAX_TOTAL_LENGTH) {
        analysisLogger.debug('样本文章截断:', { 
          usedCount: i, 
          totalCount: articles.length,
          totalLength: result.length 
        })
        break
      }
      
      result += entry
    }
    
    return result.trim()
  }

  /**
   * 调用 AI 进行分析
   * 
   * 通过 background 服务调用 AI
   */
  private async callAI(feed: DiscoveredFeed, sampleArticles: FeedArticle[]): Promise<SourceAnalysisResult> {
    analysisLogger.info('准备调用 AI 分析:', { feedId: feed.id, sampleCount: sampleArticles.length })
    
    // 发送消息给 background 进行 AI 调用
    const response = await chrome.runtime.sendMessage({
      type: 'AI_SOURCE_ANALYSIS',
      payload: {
        feedId: feed.id,
        feedTitle: feed.title,
        feedDescription: feed.description || '',
        feedLink: feed.link || feed.url,
        sampleArticles: this.formatSampleArticles(sampleArticles)
      }
    })

    if (response?.success && response.result) {
      return response.result as SourceAnalysisResult
    }

    throw new Error(response?.error || 'AI 分析调用失败')
  }

  /**
   * 保存分析结果到数据库
   * 
   * 同时更新：
   * - aiAnalysis: AI 分析完整结果
   * - quality: 用于 UI 显示的质量信息（兼容旧字段）
   * - category: 内容分类（标准 key）
   * - language: 内容语言（标准代码）
   * 
   * 注意：不覆盖用户手动编辑的 title
   */
  private async saveAnalysis(feedId: string, analysis: AISourceAnalysis): Promise<AISourceAnalysis> {
    // 获取当前 feed 以合并 quality 数据
    const feed = await db.discoveredFeeds.get(feedId)
    
    // 构建 quality 数据（兼容 UI 显示）
    const qualityData: FeedQuality = {
      // 保留原有的非 AI 分析数据
      updateFrequency: feed?.quality?.updateFrequency || 0,
      formatValid: feed?.quality?.formatValid ?? true,
      reachable: feed?.quality?.reachable ?? true,
      // 将 AI 质量分数（0-1）转换为 UI 显示的分数（0-100）
      score: Math.round(analysis.qualityScore * 100),
      lastChecked: analysis.analyzedAt,
      details: feed?.quality?.details
    }
    
    // 构建更新数据
    const updateData: Record<string, unknown> = {
      aiAnalysis: analysis,
      quality: qualityData,
      category: analysis.contentCategory
    }
    
    // 如果 AI 检测到了语言，且 feed 当前没有语言信息，则更新
    if (analysis.language && (!feed?.language || feed.language === 'unknown')) {
      updateData.language = analysis.language
    }
    
    await db.discoveredFeeds.update(feedId, updateData as any)
    
    analysisLogger.info('AI 分析结果已保存:', {
      feedId,
      qualityScore: analysis.qualityScore,
      displayScore: qualityData.score,
      category: analysis.contentCategory,
      language: analysis.language,
      tags: analysis.topicTags
    })
    
    return analysis
  }

  /**
   * 触发首次抓取分析
   * 
   * 当后台任务首次成功抓取订阅源时调用
   * 异步执行，不阻塞抓取流程
   */
  async triggerOnFirstFetch(feedId: string): Promise<void> {
    // 检查是否已分析过
    const existing = await this.getAnalysis(feedId)
    if (existing && existing.isAIAnalyzed) {
      analysisLogger.debug('订阅源已有 AI 分析，跳过首次抓取分析:', feedId)
      return
    }

    analysisLogger.info('首次抓取触发订阅源分析:', feedId)
    
    // 异步执行分析，不等待结果
    this.analyze(feedId).catch(error => {
      analysisLogger.error('首次抓取触发分析失败:', { feedId, error })
    })
  }

  /**
   * 触发首次阅读分析
   * 
   * 当用户首次点击订阅源的文章时调用
   * 异步执行，不阻塞用户操作
   * 
   * @deprecated 改用 triggerOnFirstFetch，在后台首次抓取时触发
   */
  async triggerOnFirstRead(feedId: string): Promise<void> {
    // 检查是否已分析过
    const existing = await this.getAnalysis(feedId)
    if (existing && existing.isAIAnalyzed) {
      analysisLogger.debug('订阅源已有 AI 分析，跳过:', feedId)
      return
    }

    // 异步执行分析，不等待结果
    this.analyze(feedId).catch(error => {
      analysisLogger.error('首次阅读触发分析失败:', { feedId, error })
    })
  }
}

// 单例实例
let serviceInstance: SourceAnalysisService | null = null

/**
 * 获取 SourceAnalysisService 单例
 */
export function getSourceAnalysisService(): SourceAnalysisService {
  if (!serviceInstance) {
    serviceInstance = new SourceAnalysisService()
  }
  return serviceInstance
}
