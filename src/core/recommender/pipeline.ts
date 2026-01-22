/**
 * AI推荐系统数据流实现
 * Phase 6.4: 推荐处理管道
 * 
 * 实现两层筛选架构：
 * 1. 全文内容抓取（并发控制）
 * 2. AI评分（筛选高质量文章）
 * 3. 冷启动策略（用户画像不完善时）
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
  PipelineConfig,
  RecommendationPipeline
} from '@/types/recommendation'

import type { FeedArticle, DiscoveredFeed } from '@/types/rss'
import type { ReasonData, AIProvider, ReasonType } from '@/types/recommendation-reason'
import { convertFeedArticlesToArticleData, convertUserProfileToUserInterests } from './data-adapters'
import { moveToCandidate, moveToAnalyzedNotQualified } from '@/storage/db/db-pool'
import { aiManager } from '../ai/AICapabilityManager'
import { db } from '@/storage/db'  // Phase 7: 静态导入，避免 Service Worker 动态导入错误
import { ColdStartScorer, TopicClusterAnalyzer } from './cold-start'
import { sanitizeHtmlToText, truncateText } from '@/utils/html-sanitizer'
import { logger } from '@/utils/logger'
import { fetchArticleContent } from '../rss/article-fetcher'

const pipelineLogger = logger.withTag('Pipeline')

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
  ai: {
    enabled: true,
    batchSize: 5,
    maxConcurrency: 2,
    timeout: 120000,  // Phase 6: 默认 120 秒（推理模型需要更长时间）
    costLimit: 1.0 // $1 per session
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

  async process(input: RecommendationInput, feeds?: DiscoveredFeed[]): Promise<RecommendationResult> {
    this.startTime = Date.now() // 记录真正的起始时间
    this.resetState()
    
    try {
      // 初始化AI管理器（确保配置正确加载）
      await aiManager.initialize()
      
      // 初始化统计信息
      this.stats = {
        inputCount: 0, // 将在处理时更新为实际值
        processed: {
          fullContent: 0,
          aiAnalyzed: 0,
          aiScored: 0,
          finalRecommended: 0
        },
        timing: {
          total: 0,
          fullContentFetch: 0,
          aiAnalysis: 0,
          aiScoring: 0
        },
        errors: {
          fullContentFailed: 0,
          aiAnalysisFailed: 0,
          aiFailed: 0
        }
      }

      const {
        articles: rawArticles,
        userProfile,
        config,
        options,
        visitHistory = [],
        alreadyRecommended = []
      } = input as RecommendationInput & {
        visitHistory?: unknown[]
        alreadyRecommended?: unknown[]
      }

      const articles = options?.maxArticles
        ? rawArticles.slice(0, options.maxArticles)
        : rawArticles

      const maxRecommendations = config.maxRecommendations ?? 5
      const qualityThreshold = config.qualityThreshold ?? 0.65
      const batchSize = config.batchSize ?? this.config.ai.batchSize

      this.stats.inputCount = articles.length

      const context: ProcessingContext = {
        config,
        userProfile,
        stats: this.stats,
        abortSignal: this.abortController.signal,
        onProgress: this.updateProgress.bind(this),
        onError: this.recordError.bind(this)
      }

      // 预过滤：移除超过 30 天的老文章
      const DAYS_LIMIT = 30
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - DAYS_LIMIT)
      
      const filteredArticles = articles.filter(article => {
        const publishDate = article.published ? new Date(article.published) : new Date()
        if (publishDate < cutoffDate) {
          return false
        }
        return true
      })
      
      const skippedOldArticles = articles.length - filteredArticles.length
      if (skippedOldArticles > 0) {
      }
      
      this.updateProgress('fetching', 0.1, '开始逐篇抓取和分析...')
      
      const recommendedArticles: RecommendedArticle[] = []
      let aiAnalyzedCount = 0  // AI 实际分析的文章数
      let processedCount = 0   // 已处理（抓取）的文章数
      
      for (let i = 0; i < filteredArticles.length && aiAnalyzedCount < batchSize; i++) {
        const article = filteredArticles[i]
        
        // 1. 抓取全文（如果还没有）
        let enhancedArticle: any = article
        
        if (!enhancedArticle.fullContent) {
          enhancedArticle = await this.fetchSingleArticle(article, context)
          processedCount++
          // 保存抓取的全文到数据库（包括 wordCount 和 readingTime）
          if (enhancedArticle.fullContent) {
            await this.saveArticleFullContent(
              article.id, 
              enhancedArticle.fullContent,
              enhancedArticle.wordCount,
              enhancedArticle.readingTime
            )
          }
        }
        
        // 更新进度
        const progress = 0.1 + (processedCount / Math.min(filteredArticles.length, 20)) * 0.2
        this.updateProgress('fullContent', progress, `已抓取 ${processedCount} 篇文章...`)
        
        this.updateProgress('ai', 0.3 + (aiAnalyzedCount / batchSize) * 0.6, `AI 分析文章...`)
        
        // 2. AI 分析
        if (this.config.ai.enabled) {
          const aiResult = await this.analyzeSingleArticle(enhancedArticle, context)
          aiAnalyzedCount++  // 完成一次 AI 分析
          
          if (aiResult && aiResult.score >= qualityThreshold) {
            recommendedArticles.push(aiResult)
            
            // 达到推荐数量，提前退出
            if (recommendedArticles.length >= maxRecommendations) {
              break
            }
          }
        }
      }
      
      this.stats.processed!.fullContent = processedCount
      this.stats.processed!.aiScored = aiAnalyzedCount
      this.stats.processed!.finalRecommended = recommendedArticles.length
      
      // 🧊 冷启动模式：使用主题聚类评分替代用户画像评分
      let finalRecommendations = recommendedArticles
      if (config.useColdStart && feeds && feeds.length > 0) {
        pipelineLogger.info('🧊 应用冷启动评分策略')
        
        // 1. 重新收集所有已分析的文章（包括刚才 AI 分析的）
        const allAnalyzedArticles = await Promise.all(
          filteredArticles.map(async (article) => {
            const updated = await db.feedArticles.get(article.id)
            return updated || article
          })
        )
        
        const analyzedArticles = allAnalyzedArticles.filter(a => a.analysis)
        pipelineLogger.info(`🧊 已分析文章数: ${analyzedArticles.length}`)
        
        // 2. 主题聚类分析
        const clusterAnalyzer = new TopicClusterAnalyzer()
        const clusterResult = clusterAnalyzer.analyze(feeds, analyzedArticles)
        
        pipelineLogger.info('🧊 主题聚类结果:', {
          feedCount: clusterResult.feedCount,
          articleCount: clusterResult.articleCount,
          hasEnoughData: clusterResult.hasEnoughData,
          topClusters: clusterResult.clusters.slice(0, 3).map(c => ({
            topic: c.topic,
            sourceCount: c.sourceCount,
            heatScore: c.heatScore.toFixed(2)
          }))
        })
        
        // 3. 冷启动评分（替换原评分）
        const coldQualityThreshold = config.qualityThreshold ?? 0.3
        const scorer = new ColdStartScorer({
          minScoreThreshold: coldQualityThreshold
        })
        const coldScores = scorer.score(analyzedArticles, feeds, clusterResult)
        
        pipelineLogger.info(`🧊 冷启动评分完成: ${coldScores.length} 篇文章达标`)
        
        // 4. 转换为推荐结果，保留 AI 分析的详细信息
        finalRecommendations = []
        for (const score of coldScores.slice(0, maxRecommendations)) {
          const article = analyzedArticles.find(a => a.id === score.articleId)
          if (!article || !article.analysis) continue
          
          // 构建推荐理由
          const reasonParts: string[] = []
          if (score.clusterScore > 0.5) {
            reasonParts.push(`热门主题 ${score.dominantTopic}`)
          }
          if (score.diversityBonus > 0) {
            reasonParts.push('内容多样性')
          }
          const reason = reasonParts.length > 0 ? reasonParts.join(' · ') : '推荐内容'
          
          // 查找原始推荐结果以获取 AI 分析详情
          const originalRec = recommendedArticles.find(r => r.id === article.id)
          
          finalRecommendations.push({
            id: article.id,
            title: article.title,
            url: article.link,
            feedId: article.feedId,
            score: score.totalScore,
            confidence: score.confidence,
            reason,
            matchedInterests: [],  // 冷启动不使用用户兴趣
            keyPoints: originalRec?.keyPoints || [],
            aiAnalysis: originalRec?.aiAnalysis || {
              relevanceScore: score.totalScore,
              keyPoints: [],
              topics: article.analysis.topicProbabilities || {},
              provider: article.analysis.metadata?.provider || 'unknown'
            }
          })
        }
        
        pipelineLogger.info(`🧊 冷启动推荐: ${finalRecommendations.length} 篇`)
        this.stats.processed!.finalRecommended = finalRecommendations.length
      }
      
      // 计算总时间
      const totalTime = Math.max(1, Date.now() - this.startTime)
      this.stats.timing!.total = totalTime

      // 完成
      this.updateProgress('complete', 1.0, `推荐生成完成，找到 ${finalRecommendations.length} 篇相关文章`)

      const result: RecommendationResult = {
        articles: finalRecommendations,
        stats: this.stats as RecommendationStats,
        algorithm: config.useColdStart ? 'cold-start' : (this.config.ai.enabled ? 'ai' : 'tfidf'),
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
      // 使用 ArticleFetcher 获取完整内容（包括 wordCount 和 readingTime）
      const articleContent = await fetchArticleContent(article.link)
      
      if (!articleContent) {
        throw new Error('抓取失败')
      }
      
      return {
        ...article,
        fullContent: articleContent.textContent,
        wordCount: articleContent.wordCount,
        readingTime: articleContent.readingTime
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
   * 使用统一的 HTML 清理工具
   */
  private extractTextContent(html: string): string {
    // 先移除脚本和样式（sanitizeHtmlToText 不处理这些）
    const withoutScripts = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
    
    // 使用统一的 HTML 清理工具
    const cleanText = sanitizeHtmlToText(withoutScripts)
    
    // 限制长度（保留 5000 字符用于分析）
    return truncateText(cleanText, 5000, '')
  }

  /**
   * Phase 6: 分析单篇文章（逐篇处理）
   */
  private async analyzeSingleArticle(
    article: EnhancedArticle,
    context: ProcessingContext
  ): Promise<RecommendedArticle | null> {
    try {
      const userInterests = convertUserProfileToUserInterests(context.userProfile)
      const aiUserProfile = context.userProfile.aiSummary ? {
        interests: context.userProfile.aiSummary.interests,
        preferences: context.userProfile.aiSummary.preferences,
        avoidTopics: context.userProfile.aiSummary.avoidTopics
      } : undefined
      const preferLocal = context.config?.analysisEngine === 'localAI' || context.config?.useLocalAI
      const providerMode = preferLocal ? 'local' : 'remote'
      
      // 准备内容
      const content = article.fullContent || article.description || article.title || ''
      
      // AI 分析选项
      // 统一使用 deepseek-chat，通过 useReasoning 参数控制推理模式
      const analysisOptions = {
        model: 'deepseek-chat',
        timeout: context.config.useReasoning ? 120000 : 60000,
        maxTokens: 2000,
        // Phase 9: 明确从配置中读取推理模式，避免 false 被 || 忽略
        useReasoning: context.config.useReasoning ?? false,
        userProfile: aiUserProfile,
        purpose: 'recommend-content' as const,  // 指定为RSS推荐任务
        originalTitle: article.title  // Phase 9: 传递原标题用于 AI 翻译
      }
      
      // Phase 8: 使用 articleAnalysis 任务类型（会从引擎分配配置中自动读取引擎和推理设置）
      const analysis = await aiManager.analyzeContent(content, analysisOptions, "articleAnalysis")
      
      // 计算 AI 相关性评分（现在直接作为最终评分）
      const aiRelevanceScore = this.calculateAIRelevanceScore(analysis, userInterests)
      
      // Phase 16: 候选池准入阈值 - 优先使用 AI 策略决策，回退到配置值
      // TODO: 集成 AI 策略系统后，从 context.strategy?.candidatePool.entryThreshold 读取动态阈值
      // AI 策略会根据候选池状态和订阅源质量动态调整此值（范围 0.5-0.9）
      const entryThreshold = context.config.qualityThreshold ?? 0.7
      
      // Phase 13: 保存 AI 分析结果并更新池状态
      // 传递评分，让 saveArticleAnalysis 决定文章进入候选池还是不合格池
      await this.saveArticleAnalysis(article.id, article.feedId, analysis, aiRelevanceScore, entryThreshold)
      
      // 调试日志：记录评分详情
      pipelineLogger.debug(`文章评分 "${article.title?.substring(0, 30)}...": AI相关性=${aiRelevanceScore.toFixed(2)}, 阈值=${entryThreshold}`)
      
      // 生成推荐理由
      const reason = this.generateRecommendationReason(analysis, userInterests, aiRelevanceScore, context.config)
      
      // 构建推荐结果
      const result: RecommendedArticle = {
        id: article.id,
        title: article.title,
        url: article.link,
        feedId: article.feedId,
        score: aiRelevanceScore,
        confidence: 0.8,  // 默认置信度
        reason,
        matchedInterests: userInterests.keywords.slice(0, 3).map(k => k.word),
        keyPoints: this.extractKeyPoints(analysis, article as any),
        aiAnalysis: {
          relevanceScore: aiRelevanceScore,
          keyPoints: this.extractKeyPoints(analysis, article as any),
          topics: analysis.topicProbabilities,
          provider: analysis.metadata?.provider || 'unknown',
          summary: (analysis as any).summary || undefined,
          translatedTitle: (analysis as any).translatedTitle || undefined  // Phase 9: AI 翻译的标题
        }
      }
      
      return result
      
    } catch (error) {
      pipelineLogger.warn(`AI 分析失败 (${article.title}):`, error)
      
      // 失败时返回 null，不使用降级方案（低分文章不值得推荐）
      // Phase 13: 分析失败时不更新池状态（保持 raw），下次仍有机会重试
      await this.saveArticleAnalysis(article.id, article.feedId, {
        topicProbabilities: {},
        metadata: { provider: 'ai-failed', error: error instanceof Error ? error.message : 'Unknown error' }
      })
      
      return null
    }
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
    const userInterests = convertUserProfileToUserInterests(context.userProfile)
    
    try {
      // 处理AI批次
      
      // 批量构建内容
      const contentList = articles.map(article => ({
        id: article.id,
        content: article.fullContent || article.description || article.title,
        article
      }))
      
      // 使用真实的AI API进行批量评分
      const results: RecommendedArticle[] = []
      let aiFailedCount = 0 // Phase 6: 跟踪 AI 失败次数
      
      for (const item of contentList) {
        try {
          // Phase 8: 获取语义化用户画像（如果存在）
          const userProfile = context.userProfile.aiSummary ? {
            interests: context.userProfile.aiSummary.interests,
            preferences: context.userProfile.aiSummary.preferences,
            avoidTopics: context.userProfile.aiSummary.avoidTopics
          } : undefined
          const preferLocal = context.config?.analysisEngine === 'localAI' || context.config?.useLocalAI
          const providerMode = preferLocal ? 'local' : 'remote'
          
          // 构建分析上下文
          const analysisOptions = {
            maxLength: 3000,
            timeout: this.config.ai.timeout || 60000,  // Phase 6: 默认 60 秒
            // Phase 9: 明确从配置中读取推理模式，避免 false 被 || 忽略
            useReasoning: context.config?.useReasoning ?? false,
            userProfile,  // Phase 8: 传递用户画像
            purpose: 'recommend-content' as const  // 指定为RSS推荐任务
          }
          
          // Phase 8: 使用 articleAnalysis 任务类型（会从引擎分配配置中自动读取引擎和推理设置）
          const analysis = await aiManager.analyzeContent(item.content, analysisOptions, "articleAnalysis")
          
          // Phase 6: 保存 AI 分析结果到文章（用于标记已分析，避免重复处理）
          await this.saveArticleAnalysis(item.article.id, item.article.feedId, analysis)
          
          // 计算最终评分（结合TF-IDF分数和AI分析）
          const aiRelevanceScore = this.calculateAIRelevanceScore(analysis, userInterests)
          const combinedScore = (item.article.tfidfScore * 0.3 + aiRelevanceScore * 0.7)
          
          // 生成推荐理由
          const reason = this.generateRecommendationReason(analysis, userInterests, combinedScore, context.config)
          
          results.push({
            id: item.article.id,
            title: item.article.title,
            url: item.article.link, // 使用 link 作为 url
            feedId: (item.article as any).feedId,  // Phase 6: 传递 feedId 用于匹配 RSS 源
            score: combinedScore,
            reason,
            confidence: Math.min(0.9, combinedScore + 0.1),
            matchedInterests: this.extractMatchedInterests(analysis, userInterests),
            keyPoints: this.extractKeyPoints(analysis, item.article),
            aiAnalysis: {
              relevanceScore: aiRelevanceScore,
              keyPoints: this.extractKeyPoints(analysis, item.article),
              topics: analysis.topicProbabilities,
              provider: analysis.metadata?.provider || 'unknown',
              summary: (analysis as any).summary || undefined
            }
          })
        } catch (aiError) {
          console.warn(`AI分析失败 (文章 ${item.article.id}):`, aiError)
          aiFailedCount++ // Phase 6: 记录失败次数
          
          // AI失败时的降级处理
          const fallbackResult = this.createFallbackResult(item.article, userInterests)
          results.push(fallbackResult)
        }
      }
      
      // Phase 6: 如果所有文章都 AI 失败，抛出错误以触发完全降级
      if (aiFailedCount > 0 && aiFailedCount === contentList.length) {
        throw new Error(`所有文章的 AI 分析都失败了 (${aiFailedCount}/${contentList.length})`)
      }
      
      // Phase 6: 如果部分失败，记录警告
      if (aiFailedCount > 0) {
        console.warn(`[Pipeline] ⚠️ 部分文章 AI 分析失败: ${aiFailedCount}/${contentList.length}，已降级使用关键词分析`)
      }
      
      return results
      
    } catch (error) {
      console.error('AI批处理失败，降级到TF-IDF:', error)
      
      // 完全降级到TF-IDF
      return this.fallbackToTFIDF(articles, context)
    }
  }

  /**
   * 计算AI相关性评分
   */
  private calculateAIRelevanceScore(
    analysis: any,
    userInterests: { keywords: Array<{word: string, weight: number}> }
  ): number {
    if (!analysis.topicProbabilities) {
      console.log(`[Pipeline] AI 分析缺少 topicProbabilities，返回默认分 0.3`)
      return 0.3 // 默认分数
    }
    
    let totalScore = 0
    let totalProbability = 0 // 匹配主题的概率总和
    const matchDetails: any[] = []
    
    // 计算主题匹配度
    for (const [topic, probability] of Object.entries(analysis.topicProbabilities)) {
      const matchingInterests = userInterests.keywords.filter(
        interest => topic.toLowerCase().includes(interest.word.toLowerCase()) ||
                   interest.word.toLowerCase().includes(topic.toLowerCase())
      )
      
      if (matchingInterests.length > 0) {
        // 取最高权重的兴趣（一个主题可能匹配多个兴趣）
        const maxWeight = Math.max(...matchingInterests.map(int => int.weight))
        totalScore += (probability as number) * maxWeight
        totalProbability += (probability as number)
        
        matchDetails.push({
          主题: topic,
          概率: (probability as number).toFixed(2),
          匹配兴趣: matchingInterests.map(i => `${i.word}(${i.weight.toFixed(2)})`).join(','),
          贡献分数: ((probability as number) * maxWeight).toFixed(4)
        })
      }
    }
    
    // 归一化：用匹配主题的概率总和作为分母
    // 这样，如果文章的主要主题都匹配用户兴趣，分数会接近用户兴趣权重
    if (totalProbability > 0) {
      const normalizedScore = totalScore / totalProbability
      return Math.min(1.0, normalizedScore)
    }
    
    console.log(`[Pipeline] 无主题匹配，返回默认分 0.3`)
    return 0.3 // 没有匹配时的默认分数
  }

  /**
   * 生成推荐理由（结构化数据）
   */
  private generateRecommendationReason(
    analysis: any,
    userInterests: { keywords: Array<{word: string, weight: number}> },
    score: number,
    config?: any
  ): ReasonData {
    const matchedTopics = Object.entries(analysis.topicProbabilities || {})
      .filter(([_, prob]) => (prob as number) > 0.2)
      .map(([topic, _]) => topic)
      .slice(0, 2)
    
    const topInterests = userInterests.keywords
      .slice(0, 2)
      .map(k => k.word)
    
    // 根据分析provider类型确定AI提供商
    const provider = (analysis.metadata?.provider || "keyword") as AIProvider
    // Phase 9: 明确从配置中读取推理模式，避免 false 被 || 忽略
    const isReasoning = config?.useReasoning ?? false
    
    // 确定推荐理由类型
    let type: ReasonType
    if (matchedTopics.length > 0) {
      type = 'topic-match'
    } else if (topInterests.length > 0) {
      type = 'interest-match'
    } else {
      type = 'high-quality'
    }
    
    // 返回结构化数据
    return {
      type,
      provider,
      isReasoning,
      score,
      topics: matchedTopics.length > 0 ? matchedTopics : undefined,
      interests: topInterests.length > 0 ? topInterests : undefined
    }
  }

  /**
   * 提取匹配的兴趣点
   */
  private extractMatchedInterests(
    analysis: any,
    userInterests: { keywords: Array<{word: string, weight: number}> }
  ): string[] {
    if (!analysis.topicProbabilities) {
      return userInterests.keywords.slice(0, 3).map(k => k.word)
    }
    
    const topics = Object.keys(analysis.topicProbabilities)
    const matched: string[] = []
    
    for (const interest of userInterests.keywords.slice(0, 5)) {
      for (const topic of topics) {
        if (topic.toLowerCase().includes(interest.word.toLowerCase()) ||
            interest.word.toLowerCase().includes(topic.toLowerCase())) {
          matched.push(interest.word)
          break
        }
      }
    }
    
    return matched.slice(0, 3)
  }

  /**
   * 提取关键点
   */
  private extractKeyPoints(analysis: any, article: ScoredArticle): string[] {
    const points: string[] = []
    
    // 添加标题
    if (article.title) {
      points.push(article.title)
    }
    
    // 不再添加主题信息到关键点（避免在推荐理由中显示多余的主题）
    
    // 添加描述（如果有）
    if (article.description && points.length < 3) {
      points.push(article.description.substring(0, 100) + '...')
    }
    
    return points.slice(0, 3)
  }

  /**
   * 创建降级结果
   */
  private createFallbackResult(
    article: ScoredArticle,
    userInterests: { keywords: Array<{word: string, weight: number}> }
  ): RecommendedArticle {
    const baseScore = article.tfidfScore
    const confidence = Math.min(0.6, baseScore * 1.1)
    const interestWords = userInterests.keywords.slice(0, 3).map(k => k.word)
    
    return {
      id: article.id,
      title: article.title,
      url: article.link,
      feedId: (article as any).feedId,  // Phase 6: 传递 feedId
      score: baseScore,
      reason: `基于文本匹配，与您的兴趣相关度 ${(baseScore * 100).toFixed(0)}%`,
      confidence,
      matchedInterests: interestWords,
      keyPoints: [article.title, article.description || ''].filter(Boolean).slice(0, 2),
      aiAnalysis: {
        relevanceScore: baseScore,
        keyPoints: [article.title, article.description || ''].filter(Boolean).slice(0, 2),
        provider: 'keyword'  // Phase 6: 标记为关键词降级
      }
    }
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

  /**
   * Phase 6: 保存文章的 AI 分析结果到数据库
   * Phase 7: 使用 feedArticles 表（性能优化）
   * Phase 13: 多池架构 - 更新池状态（raw → candidate/analyzed-not-qualified）
   * 
   * @param articleId - 文章 ID
   * @param analysis - AI 分析结果
   * @param score - AI 评分（可选，用于判断进入哪个池）
   * @param scoreThreshold - 候选池评分阈值（默认 0.5）
   */
  private async saveArticleAnalysis(
    articleId: string,
    feedId: string,
    analysis: { topicProbabilities: any; metadata?: any; summary?: string; translatedTitle?: string; targetLanguage?: string },
    score?: number,
    scoreThreshold: number = 0.5
  ): Promise<void> {
    try {
      // Phase 7: 构建更新数据
      const updates: any = {
        analysis: {
          topicProbabilities: analysis.topicProbabilities,
          confidence: 0.8, // 默认置信度
          provider: analysis.metadata?.provider || 'unknown'
        }
      }
      
      // 🔧 关键修复：保存翻译数据到 translation 字段
      if (analysis.translatedTitle && analysis.targetLanguage) {
        // 需要先获取文章的原始数据以确定源语言
        const article = await db.feedArticles.get(articleId)
        if (article) {
          // 简单的语言检测
          const detectSourceLanguage = (text: string): string => {
            if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'
            if (/[\uac00-\ud7af]/.test(text)) return 'ko'
            if (/[\u4e00-\u9fa5]/.test(text)) return 'zh-CN'
            return 'en'
          }
          
          updates.translation = {
            sourceLanguage: detectSourceLanguage(article.title),
            targetLanguage: analysis.targetLanguage,
            translatedTitle: analysis.translatedTitle,
            translatedSummary: analysis.summary, // AI 生成的摘要也是译文
            translatedAt: Date.now()
          }
          
          pipelineLogger.debug(`💾 保存翻译数据: ${articleId}`, {
            original: article.title,
            translated: analysis.translatedTitle
          })
        }
      }
      
      // 更新数据库
      await db.feedArticles.update(articleId, updates)
      
      // Phase 13: 多池架构 - 根据评分更新池状态
      // 只有当提供了有效评分时才更新池状态
      if (score !== undefined && score >= 0) {
        if (score >= scoreThreshold) {
          // 高分文章 → 候选池
          await moveToCandidate(articleId, score)
          pipelineLogger.debug(`📦 文章进入候选池: ${articleId} (评分: ${score.toFixed(2)})`)
        } else {
          // 低分文章 → 已分析但不合格池
          await moveToAnalyzedNotQualified(articleId, score)
          pipelineLogger.debug(`📦 文章标记为不合格: ${articleId} (评分: ${score.toFixed(2)})`)
        }
      }
      
      // 已保存分析结果
    } catch (error) {
      pipelineLogger.warn(`⚠️ 保存文章分析失败: ${articleId}`, error)
      // 不抛出错误，保存失败不影响推荐流程
    }
  }

  /**
   * Phase 6: 保存文章的 TF-IDF 分数到数据库（缓存）
   * Phase 7: 使用 feedArticles 表（性能优化）
   * 
   * @param articleId - 文章 ID
   * @param feedId - RSS 源 ID
   * @param tfidfScore - TF-IDF 评分
   * @param fullContent - 全文内容（可选）
   */
  private async saveArticleEnhancement(
    articleId: string,
    feedId: string,
    tfidfScore: number,
    fullContent?: string
  ): Promise<void> {
    try {
      // Phase 7: 直接更新 feedArticles 表
      // Phase 11: 同时保存全文内容（用于避免重复抓取）
      const updates: any = { tfidfScore }
      
      // 如果抓取了全文，保存到 content 字段（仅当原 content 为空或太短时）
      if (fullContent && fullContent.length > 500) {
        updates.content = fullContent
      }
      
      await db.feedArticles.update(articleId, updates)
      
    } catch (error) {
      console.warn(`[Pipeline] ⚠️ 保存文章增强数据失败: ${articleId}`, error)
      // 不抛出错误，保存失败不影响推荐流程
    }
  }

  /**
   * 单独保存全文内容
   */
  private async saveArticleFullContent(
    articleId: string,
    fullContent: string,
    wordCount?: number,
    readingTime?: number
  ): Promise<void> {
    try {
      if (fullContent && fullContent.length > 500) {
        await db.feedArticles.update(articleId, { 
          content: fullContent,
          wordCount,
          readingTime
        })
        pipelineLogger.debug(`✅ 保存全文内容: ${articleId}, 字数: ${wordCount}, 阅读时长: ${readingTime}分钟`)
      }
    } catch (error) {
      console.warn(`[Pipeline] ⚠️ 保存全文内容失败: ${articleId}`, error)
    }
  }

}

/**
 * 创建推荐管道实例
 */
export function createRecommendationPipeline(config?: Partial<PipelineConfig>): RecommendationPipeline {
  return new RecommendationPipelineImpl(config)
}