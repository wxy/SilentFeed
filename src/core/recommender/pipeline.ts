/**
 * AI推荐系统数据流实现
 * Phase 6.4: 推荐处理管道
 * 
 * 实现三层筛选架构：
 * 1. 全文内容抓取（并发控制）
 * 2. TF-IDF预筛选（200条→30条）  
 * 3. AI评分（30条→5条）
 * 4. Chrome AI增强（可选）
 */

// 使用本地类型定义
import type {
  RecommendationInput,
  RecommendationResult,
  PipelineProgress,
  RecommendationStats,
  RecommendedArticle,
  ProcessingError,
  ProcessingContext,
  EnhancedArticle,
  ScoredArticle,
  PipelineConfig,
  RecommendationPipeline
} from './types'

import type { FeedArticle } from '../rss/types'
import { convertFeedArticlesToArticleData, convertUserProfileToUserInterests } from './data-adapters'
import { RuleBasedRecommender } from './RuleBasedRecommender'
import { aiManager } from '../ai/AICapabilityManager'

/**
 * 默认管道配置
 */
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  fullContent: {
    enabled: true,
    concurrency: 5,
    timeout: 10000,
    retries: 2
  },
  tfidf: {
    targetCount: 30,
    minScore: 0.005, // 降低最小分数，适应更严格的计算
    vocabularySize: 1000
  },
  ai: {
    enabled: true,
    batchSize: 5,
    maxConcurrency: 2,
    timeout: 30000,
    costLimit: 1.0, // $1 per session
    fallbackToTFIDF: true
  },
  cache: {
    enabled: true,
    ttl: 3600, // 1小时
    maxSize: 100
  },
  monitoring: {
    enabled: true,
    sampleRate: 1.0
  }
}

/**
 * 推荐管道实现
 */
export class RecommendationPipelineImpl implements RecommendationPipeline {
  private config: PipelineConfig
  private progress: PipelineProgress
  private abortController: AbortController
  private stats: Partial<RecommendationStats>
  private startTime: number = 0 // 添加专门的起始时间字段
  
  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config }
    this.progress = {
      stage: 'idle',
      progress: 0,
      message: '准备处理...'
    }
    this.abortController = new AbortController()
    this.stats = {}
  }

  async process(input: RecommendationInput): Promise<RecommendationResult> {
    this.startTime = Date.now() // 记录真正的起始时间
    this.resetState()
    
    try {
      // 初始化统计信息
      this.stats = {
        inputCount: 0, // 将在处理时更新为实际值
        processed: {
          fullContent: 0,
          tfidfFiltered: 0,
          aiAnalyzed: 0,
          aiScored: 0,
          finalRecommended: 0
        },
        timing: {
          total: 0,
          fullContentFetch: 0,
          tfidfAnalysis: 0,
          aiAnalysis: 0,
          aiScoring: 0
        },
        errors: {
          fullContentFailed: 0,
          tfidfFailed: 0,
          aiAnalysisFailed: 0,
          aiFailed: 0
        }
      }

      const context: ProcessingContext = {
        config: input.config,
        userProfile: input.userProfile,
        stats: this.stats,
        abortSignal: this.abortController.signal,
        onProgress: this.updateProgress.bind(this),
        onError: this.recordError.bind(this)
      }

      // 第一阶段：全文内容抓取
      this.updateProgress('fullContent', 0.1, '开始抓取全文内容...')
      const fullContentStart = Date.now()
      
      let articles = input.articles.slice(0, input.options?.maxArticles || 200)
      
      // 更新实际处理的文章数量统计
      this.stats.inputCount = articles.length
      
      let enhancedArticles: EnhancedArticle[]
      
      if (this.config.fullContent.enabled && !input.options?.skipFullContent) {
        enhancedArticles = await this.fetchFullContent(articles, context)
        this.stats.processed!.fullContent = enhancedArticles.filter(a => a.fullContent).length
      } else {
        enhancedArticles = articles as EnhancedArticle[]
      }
      
      this.stats.timing!.fullContentFetch = Date.now() - fullContentStart

      // 检查中断
      this.checkAbort()

      // 第二阶段：TF-IDF预筛选
      this.updateProgress('tfidf', 0.3, '执行TF-IDF相关性分析...')
      const tfidfStart = Date.now()
      
      const scoredArticles = await this.performTFIDFAnalysis(enhancedArticles, context)
      this.stats.processed!.tfidfFiltered = scoredArticles.length
      this.stats.timing!.tfidfAnalysis = Date.now() - tfidfStart

      // 检查中断
      this.checkAbort()

      // 第三阶段：AI评分（如果启用）
      let recommendedArticles: RecommendedArticle[]
      let algorithm: 'tfidf' | 'ai' | 'hybrid' = 'tfidf'

      if (this.config.ai.enabled && input.config.useReasoning) {
        this.updateProgress('ai', 0.6, '执行AI智能评分...')
        const aiStart = Date.now()
        
        try {
          recommendedArticles = await this.performAIScoring(scoredArticles, context)
          this.stats.processed!.aiScored = recommendedArticles.length
          algorithm = 'ai'
        } catch (error) {
          console.warn('[Pipeline] AI评分失败，降级到TF-IDF:', error)
          recommendedArticles = this.fallbackToTFIDF(scoredArticles, context)
          algorithm = 'hybrid'
        }
        
        this.stats.timing!.aiScoring = Date.now() - aiStart
      } else {
        recommendedArticles = this.fallbackToTFIDF(scoredArticles, context)
      }

      // 最终筛选
      this.updateProgress('finalizing', 0.9, '整理推荐结果...')
      const finalArticles = recommendedArticles
        .slice(0, input.config.maxRecommendations || 5)
        .map((article, index) => ({
          ...article,
          score: algorithm === 'tfidf' ? (article as any).tfidfScore || article.score : article.score || 0.5
        }))

      this.stats.processed!.finalRecommended = finalArticles.length
      
      // 计算总时间（确保在返回结果前计算）
      const totalTime = Math.max(1, Date.now() - this.startTime) // 确保至少1ms
      this.stats.timing!.total = totalTime

      // 完成
      this.updateProgress('complete', 1.0, `推荐生成完成，找到 ${finalArticles.length} 篇相关文章`)

      const result: RecommendationResult = {
        articles: finalArticles,
        stats: this.stats as RecommendationStats,
        algorithm,
        timestamp: Date.now()
      }

      return result

    } catch (error) {
      this.updateProgress('error', 0, `处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
      throw error
    }
  }

  getProgress(): PipelineProgress {
    return { ...this.progress }
  }

  cancel(): void {
    this.abortController.abort()
    this.updateProgress('idle', 0, '处理已取消')
  }

  cleanup(): void {
    this.abortController = new AbortController()
    this.resetState()
  }

  /**
   * 抓取全文内容
   */
  private async fetchFullContent(
    articles: FeedArticle[], 
    context: ProcessingContext
  ): Promise<EnhancedArticle[]> {
    const results: EnhancedArticle[] = []
    const concurrent = this.config.fullContent.concurrency
    
    for (let i = 0; i < articles.length; i += concurrent) {
      const batch = articles.slice(i, i + concurrent)
      const promises = batch.map(article => this.fetchSingleArticle(article, context))
      
      const batchResults = await Promise.allSettled(promises)
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          const article = batch[index]
          results.push({
            ...article,
            contentFetchError: result.reason?.message || '抓取失败'
          })
          this.stats.errors!.fullContentFailed++
        }
      })
      
      // 更新进度
      const progress = Math.min(0.3, 0.1 + (i + concurrent) / articles.length * 0.2)
      context.onProgress('fullContent', progress, `已处理 ${Math.min(i + concurrent, articles.length)}/${articles.length} 篇文章`)
      
      this.checkAbort()
    }
    
    return results
  }

  /**
   * 抓取单篇文章内容
   */
  private async fetchSingleArticle(
    article: FeedArticle, 
    context: ProcessingContext
  ): Promise<EnhancedArticle> {
    try {
      // 简单的全文抓取实现（实际需要更复杂的爬虫逻辑）
      const response = await fetch(article.link, {
        signal: context.abortSignal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FeedAIMuter/1.0)'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      
      // 简单的内容提取（实际需要更智能的提取算法）
      const content = this.extractTextContent(html)
      
      return {
        ...article,
        fullContent: content
      }
      
    } catch (error) {
      return {
        ...article,
        contentFetchError: error instanceof Error ? error.message : '抓取失败'
      }
    }
  }

  /**
   * 从HTML提取文本内容
   */
  private extractTextContent(html: string): string {
    // 移除HTML标签和脚本
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    // 限制长度
    return text.length > 5000 ? text.substring(0, 5000) + '...' : text
  }

  /**
   * 执行TF-IDF分析
   */
  private async performTFIDFAnalysis(
    articles: EnhancedArticle[], 
    context: ProcessingContext
  ): Promise<ScoredArticle[]> {
    try {
      const userInterests = convertUserProfileToUserInterests(context.userProfile)
      
      // 使用RuleBasedRecommender进行TF-IDF计算
      const recommender = new RuleBasedRecommender()
      
      // 计算相似度
      const scored: ScoredArticle[] = []
      
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i]
        const content = article.fullContent || article.description || article.title
        
        try {
          // 简化的相似度计算
          const score = this.calculateSimpleRelevance(content, userInterests)
          
          scored.push({
            ...article,
            tfidfScore: score,
            features: { content: score } // 简化的特征向量
          })
        } catch (error) {
          console.warn(`TF-IDF计算失败 (文章 ${article.id}):`, error)
          this.stats.errors!.tfidfFailed++
        }
        
        // 更新进度
        if (i % 10 === 0) {
          const progress = 0.3 + (i / articles.length) * 0.3
          context.onProgress('tfidf', progress, `TF-IDF分析中... ${i}/${articles.length}`)
        }
      }
      
      // 排序并筛选
      scored.sort((a, b) => b.tfidfScore - a.tfidfScore)
      const filtered = scored.slice(0, this.config.tfidf.targetCount)
      
      return filtered.filter(a => a.tfidfScore >= this.config.tfidf.minScore)
      
    } catch (error) {
      console.error('TF-IDF分析失败:', error)
      throw new Error(`TF-IDF分析失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 简单的相关性计算
   */
  private calculateSimpleRelevance(content: string, userInterests: { keywords: Array<{word: string, weight: number}> }): number {
    const words = content.toLowerCase().split(/\W+/).filter(word => word.length > 2)
    let score = 0
    let matchCount = 0
    
    for (const interest of userInterests.keywords) {
      const keyword = interest.word.toLowerCase()
      const weight = interest.weight
      
      // 检查精确匹配和包含匹配
      const exactMatches = words.filter(word => word === keyword).length
      const partialMatches = words.filter(word => word.includes(keyword) && word !== keyword).length
      
      // 精确匹配权重更高
      const matchScore = (exactMatches * 1.0 + partialMatches * 0.5) * weight
      score += matchScore
      matchCount += exactMatches + partialMatches
    }
    
    // 如果没有任何匹配，返回很低的分数
    if (matchCount === 0) {
      return 0.01
    }
    
    // 根据匹配密度和内容长度归一化
    const matchDensity = matchCount / Math.max(words.length, 10)
    const normalizedScore = Math.min(1.0, score * matchDensity)
    
    return normalizedScore
  }

  /**
   * 执行AI评分
   */
  private async performAIScoring(
    articles: ScoredArticle[], 
    context: ProcessingContext
  ): Promise<RecommendedArticle[]> {
    const recommended: RecommendedArticle[] = []
    const batchSize = this.config.ai.batchSize
    
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize)
      
      try {
        const batchResults = await this.processAIBatch(batch, context)
        recommended.push(...batchResults)
      } catch (error) {
        console.warn(`AI评分批次失败 (${i}-${i + batchSize}):`, error)
        this.stats.errors!.aiFailed += batch.length
      }
      
      // 更新进度
      const progress = 0.6 + (i + batchSize) / articles.length * 0.3
      context.onProgress('ai', progress, `AI评分中... ${Math.min(i + batchSize, articles.length)}/${articles.length}`)
      
      this.checkAbort()
    }
    
    // 排序返回
    return recommended.sort((a, b) => b.score - a.score)
  }

  /**
   * 处理AI评分批次
   */
  private async processAIBatch(
    articles: ScoredArticle[], 
    context: ProcessingContext
  ): Promise<RecommendedArticle[]> {
    // AI评分的简化实现（实际需要调用AI API）
    const userInterests = convertUserProfileToUserInterests(context.userProfile)
    
    const results: RecommendedArticle[] = articles.map(article => {
      // 基于TF-IDF分数生成AI风格的评分
      const baseScore = article.tfidfScore
      const confidence = Math.min(0.9, baseScore * 1.2)
      
      // 提取用户兴趣关键词
      const interestWords = userInterests.keywords.slice(0, 3).map(k => k.word)
      
      return {
        id: article.id,
        title: article.title,
        url: article.link, // 使用 link 作为 url
        score: baseScore,
        reason: `与您的兴趣匹配度 ${(baseScore * 100).toFixed(0)}%`,
        confidence,
        matchedInterests: interestWords,
        keyPoints: [article.title, article.description || ''].filter(Boolean).slice(0, 2),
        aiAnalysis: {
          relevanceScore: baseScore,
          keyPoints: [article.title, article.description || ''].filter(Boolean).slice(0, 2)
        }
      }
    })
    
    return results
  }

  /**
   * 降级到TF-IDF算法
   */
  private fallbackToTFIDF(articles: ScoredArticle[], context: ProcessingContext): RecommendedArticle[] {
    const userInterests = convertUserProfileToUserInterests(context.userProfile)
    const interestWords = userInterests.keywords.slice(0, 3).map(k => k.word)
    
    return articles.map(article => ({
      id: article.id,
      title: article.title,
      url: article.link, // 使用 link 作为 url
      score: article.tfidfScore,
      reason: `基于关键词匹配，相关度 ${(article.tfidfScore * 100).toFixed(0)}%`,
      confidence: Math.min(0.8, article.tfidfScore),
      matchedInterests: interestWords,
      keyPoints: [article.title, article.description || ''].filter(Boolean).slice(0, 2)
    }))
  }

  /**
   * 更新进度
   */
  private updateProgress(stage: PipelineProgress['stage'], progress: number, message: string): void {
    this.progress = {
      stage,
      progress,
      message,
      estimatedTimeRemaining: this.estimateTimeRemaining(progress)
    }
  }

  /**
   * 估算剩余时间
   */
  private estimateTimeRemaining(progress: number): number | undefined {
    if (progress <= 0 || progress >= 1) return undefined
    
    const elapsed = Date.now() - this.startTime
    return Math.round((elapsed / progress) * (1 - progress) / 1000)
  }

  /**
   * 记录错误
   */
  private recordError(error: ProcessingError): void {
    console.error(`[Pipeline] ${error.stage} 错误:`, error)
  }

  /**
   * 检查中断信号
   */
  private checkAbort(): void {
    if (this.abortController.signal.aborted) {
      throw new Error('处理已被用户取消')
    }
  }

  /**
   * 重置状态
   */
  private resetState(): void {
    this.progress = {
      stage: 'idle',
      progress: 0,
      message: '准备处理...'
    }
    this.stats = {}
  }
}

/**
 * 创建推荐管道实例
 */
export function createRecommendationPipeline(config?: Partial<PipelineConfig>): RecommendationPipeline {
  return new RecommendationPipelineImpl(config)
}