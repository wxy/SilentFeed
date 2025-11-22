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
} from '@/types/recommendation'

import type { FeedArticle } from '@/types/rss'
import type { ReasonData, AIProvider, ReasonType } from '@/types/recommendation-reason'
import { convertFeedArticlesToArticleData, convertUserProfileToUserInterests } from './data-adapters'
import { RuleBasedRecommender } from './RuleBasedRecommender'
import { aiManager } from '../ai/AICapabilityManager'
import { db } from '@/storage/db'  // Phase 7: 静态导入，避免 Service Worker 动态导入错误

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
    targetCount: 50, // 增加到50条，给AI更多选择
    minScore: 0.005, // 降低最小分数，适应更严格的计算
    vocabularySize: 1000
  },
  ai: {
    enabled: true,
    batchSize: 5,
    maxConcurrency: 2,
    timeout: 120000,  // Phase 6: 默认 120 秒（推理模型需要更长时间）
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
      // 初始化AI管理器（确保配置正确加载）
      console.log('[Pipeline] 🤖 正在初始化AI管理器...')
      await aiManager.initialize()
      
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

      // Phase 6: 新流程 - TF-IDF 初筛 → 逐篇处理（低分跳过，高分 AI 分析）
      console.log('[Pipeline] 📊 开始新推荐流程：TF-IDF 初筛 → 逐篇 AI 分析')
      
      const articles = input.articles.slice(0, input.options?.maxArticles || 200)
      this.stats.inputCount = articles.length
      
      const tfidfThreshold = input.config.tfidfThreshold ?? 0.1
      const qualityThreshold = input.config.qualityThreshold ?? 0.6  // Phase 6: 默认 0.6（基于实际评分分布）
      const maxRecommendations = input.config.maxRecommendations || 3
      const batchSize = input.config.batchSize || 1
      
      console.log(`[Pipeline] 配置: TF-IDF阈值=${tfidfThreshold}, 质量阈值=${qualityThreshold}, 批次大小=${batchSize}`)
      
      // Phase 6: 新策略 - 逐篇抓取全文 + TF-IDF 评分 + 高分送 AI
      // 优势：
      // 1. 抓取成本低，可以边抓取边评分
      // 2. 找到高分文章就立即 AI 分析，无需等待全部抓取
      // 3. 达到 batchSize 后提前退出，节省时间
      
      // 预过滤：移除超过 30 天的老文章
      const DAYS_LIMIT = 30
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - DAYS_LIMIT)
      
      const filteredArticles = articles.filter(article => {
        const publishDate = article.pubDate ? new Date(article.pubDate) : new Date()
        if (publishDate < cutoffDate) {
          console.log(`[Pipeline] ⏭️  跳过过旧文章 (发布于 ${publishDate.toLocaleDateString()}): ${article.title}`)
          return false
        }
        return true
      })
      
      const skippedOldArticles = articles.length - filteredArticles.length
      if (skippedOldArticles > 0) {
        console.log(`[Pipeline] 📅 已过滤 ${skippedOldArticles} 篇超过 ${DAYS_LIMIT} 天的文章`)
      }
      
      this.updateProgress('tfidf', 0.1, '开始逐篇抓取和评分...')
      
      const userInterests = convertUserProfileToUserInterests(context.userProfile)
      const recommendedArticles: RecommendedArticle[] = []
      let aiAnalyzedCount = 0  // AI 实际分析的文章数
      let skippedLowScore = 0  // 跳过的低分文章数
      let processedCount = 0   // 已处理（抓取+评分）的文章数
      
      for (let i = 0; i < filteredArticles.length && aiAnalyzedCount < batchSize; i++) {
        const article = filteredArticles[i]
        
        // 1. 检查是否已有 TF-IDF 分数（避免重复计算）
        let tfidfScore = article.tfidfScore
        let enhancedArticle: any = article
        
        if (tfidfScore === undefined) {
          // 抓取全文（如果尚未计算过 TF-IDF）
          enhancedArticle = await this.fetchSingleArticle(article, context)
          processedCount++
          
          // 2. TF-IDF 评分（使用全文）
          const content = enhancedArticle.fullContent || article.content || article.description || article.title
          tfidfScore = this.calculateSimpleRelevance(content, userInterests)
          
          // 3. 保存 TF-IDF 分数到数据库（缓存以避免重复计算）
          await this.saveTFIDFScore(article.id, article.feedId, tfidfScore)
          
          console.log(`[Pipeline] 📊 计算并保存 TF-IDF 分数 (${tfidfScore.toFixed(4)}): ${article.title}`)
        } else {
          console.log(`[Pipeline] ♻️  使用已缓存的 TF-IDF 分数 (${tfidfScore.toFixed(4)}): ${article.title}`)
        }
        
        // 更新进度
        const progress = 0.1 + (processedCount / Math.min(filteredArticles.length, 20)) * 0.2
        this.updateProgress('tfidf', progress, `已评分 ${processedCount} 篇文章...`)
        
        // 4. 检查 TF-IDF 分数
        if (tfidfScore < tfidfThreshold) {
          console.log(`[Pipeline] ⏭️  跳过低分文章 (${tfidfScore.toFixed(4)}): ${article.title}`)
          console.log(`[Pipeline] 📝 保存 TF-IDF 跳过标记: ${article.id}`)
          skippedLowScore++
          
          // 标记为已分析（低质量，不值得 AI 分析）
          await this.saveArticleAnalysis(article.id, article.feedId, {
            topicProbabilities: {},
            metadata: { provider: 'tfidf-skipped', score: tfidfScore }
          })
          
          continue  // 跳过，不计入 aiAnalyzedCount，继续下一篇
        }
        
        console.log(`[Pipeline] 🔍 发现高分文章 (TF-IDF: ${tfidfScore.toFixed(4)}): ${article.title}`)
        
        // 5. AI 分析高分文章（需要全文）
        // 如果使用了缓存的 TF-IDF 分数，现在才抓取全文
        if (article.tfidfScore !== undefined && !enhancedArticle.fullContent) {
          enhancedArticle = await this.fetchSingleArticle(article, context)
        }
        
        // 确保 enhancedArticle 包含 tfidfScore（用于最终评分计算）
        enhancedArticle.tfidfScore = tfidfScore
        
        this.updateProgress('ai', 0.3 + (aiAnalyzedCount / batchSize) * 0.6, `AI 分析高分文章...`)
        
        if (this.config.ai.enabled) {
          const aiResult = await this.analyzeSingleArticle(enhancedArticle, context)
          aiAnalyzedCount++  // 完成一次 AI 分析
          
          if (aiResult && aiResult.score >= qualityThreshold) {
            console.log(`[Pipeline] ✅ 高质量文章 (最终得分: ${aiResult.score.toFixed(2)} >= ${qualityThreshold}): ${article.title}`)
            recommendedArticles.push(aiResult)
            
            // 达到推荐数量，提前退出
            if (recommendedArticles.length >= maxRecommendations) {
              console.log(`[Pipeline] 🎯 已找到 ${maxRecommendations} 篇高质量推荐，提前结束`)
              break
            }
          } else if (aiResult) {
            console.log(`[Pipeline] ⚠️ 低质量文章 (最终得分: ${aiResult.score.toFixed(2)} < ${qualityThreshold}): ${article.title}`)
          } else {
            console.log(`[Pipeline] ❌ AI 分析失败: ${article.title}`)
          }
        }
      }
      
      console.log(`[Pipeline] 📊 处理完成: 评分 ${processedCount} 篇, 跳过 ${skippedLowScore} 篇低分, AI 分析 ${aiAnalyzedCount} 篇, 推荐 ${recommendedArticles.length} 篇`)
      
      this.stats.processed!.tfidfFiltered = processedCount
      this.stats.processed!.aiScored = aiAnalyzedCount
      this.stats.processed!.finalRecommended = recommendedArticles.length
      
      // 计算总时间
      const totalTime = Math.max(1, Date.now() - this.startTime)
      this.stats.timing!.total = totalTime

      // 完成
      this.updateProgress('complete', 1.0, `推荐生成完成，找到 ${recommendedArticles.length} 篇相关文章`)

      const result: RecommendationResult = {
        articles: recommendedArticles,
        stats: this.stats as RecommendationStats,
        algorithm: this.config.ai.enabled ? 'ai' : 'tfidf',
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
          'User-Agent': 'Mozilla/5.0 (compatible; SilentFeed/1.0)'
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
        // Phase 6: TF-IDF 初筛使用 RSS 自带内容（不抓取全文网页）
        // 优先级：content（RSS完整内容） > description（摘要） > title
        const content = article.content || article.description || article.title
        
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
   * Phase 6: 分析单篇文章（逐篇处理）
   */
  private async analyzeSingleArticle(
    article: EnhancedArticle,
    context: ProcessingContext
  ): Promise<RecommendedArticle | null> {
    try {
      const userInterests = convertUserProfileToUserInterests(context.userProfile)
      
      // 准备内容
      const content = article.fullContent || article.description || article.title || ''
      
      // 🔍 调试：检查推理模式配置
      console.log('[Pipeline] 🔍 推理模式配置检查:', {
        'context.config.useReasoning': context.config.useReasoning,
        '推理模式状态': context.config.useReasoning ? '启用' : '禁用'
      })
      
      // AI 分析选项
      // 统一使用 deepseek-chat，通过 useReasoning 参数控制推理模式
      const analysisOptions = {
        model: 'deepseek-chat',
        timeout: context.config.useReasoning ? 120000 : 60000,
        maxTokens: 2000,
        useReasoning: context.config.useReasoning || false
      }
      
      console.log('[Pipeline] 🤖 AI分析选项:', analysisOptions)
      
      // 调用 AI 分析
      const analysis = await aiManager.analyzeContent(content, analysisOptions)
      
      // 保存 AI 分析结果到文章
      await this.saveArticleAnalysis(article.id, article.feedId, analysis)
      
      // 计算最终评分
      const aiRelevanceScore = this.calculateAIRelevanceScore(analysis, userInterests)
      const tfidfScore = (article as ScoredArticle).tfidfScore || article.tfidfScore || 0
      const combinedScore = tfidfScore * 0.3 + aiRelevanceScore * 0.7
      
      console.log(`[Pipeline] 📊 评分详情 - ${article.title}:`, {
        'TF-IDF': tfidfScore.toFixed(4),
        'AI相关性': aiRelevanceScore.toFixed(4),
        '最终得分': `${combinedScore.toFixed(4)} (TF-IDF*0.3 + AI*0.7)`
      })
      
      // 生成推荐理由
      const reason = this.generateRecommendationReason(analysis, userInterests, combinedScore, context.config)
      
      // 构建推荐结果
      const result: RecommendedArticle = {
        id: article.id,
        title: article.title,
        url: article.link,
        feedId: article.feedId,
        score: combinedScore,
        confidence: 0.8,  // 默认置信度
        reason,
        matchedInterests: userInterests.keywords.slice(0, 3).map(k => k.word),
        keyPoints: this.extractKeyPoints(analysis, article as any),
        aiAnalysis: {
          relevanceScore: aiRelevanceScore,
          keyPoints: this.extractKeyPoints(analysis, article as any),
          topics: analysis.topicProbabilities,
          provider: analysis.metadata?.provider || 'unknown'
        }
      }
      
      return result
      
    } catch (error) {
      console.warn(`[Pipeline] AI 分析失败 (${article.title}):`, error)
      
      // 失败时返回 null，不使用降级方案（低分文章不值得推荐）
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
      console.log(`[Pipeline] 🤖 处理AI批次: ${articles.length} 篇文章`)
      
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
          // 构建分析上下文
          const analysisOptions = {
            maxLength: 3000,
            timeout: this.config.ai.timeout || 60000,  // Phase 6: 默认 60 秒
            useReasoning: context.config?.useReasoning || false  // Phase 6: 传递推理模式参数
          }
          
          // 调用AI分析（这里保持单个调用，因为aiManager暂不支持批量）
          const analysis = await aiManager.analyzeContent(item.content, analysisOptions)
          
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
              provider: analysis.metadata?.provider || 'unknown'
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
      console.log('[Pipeline] ⚠️ 无主题概率，返回默认分数 0.3')
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
      console.log('[Pipeline] 🎯 AI相关性计算:', {
        匹配详情: matchDetails,
        总分: totalScore.toFixed(4),
        总概率: totalProbability.toFixed(4),
        最终分数: normalizedScore.toFixed(4)
      })
      return Math.min(1.0, normalizedScore)
    }
    
    console.log('[Pipeline] ⚠️ 无匹配主题，返回默认分数 0.3')
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
    const isReasoning = config?.useReasoning || false
    
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
   * 
   * @param articleId - 文章 ID
   * @param analysis - AI 分析结果
   */
  private async saveArticleAnalysis(
    articleId: string,
    feedId: string,
    analysis: { topicProbabilities: any; metadata?: any }
  ): Promise<void> {
    try {
      // Phase 7: 直接更新 feedArticles 表
      await db.feedArticles.update(articleId, {
        analysis: {
          topicProbabilities: analysis.topicProbabilities,
          confidence: 0.8, // 默认置信度
          provider: analysis.metadata?.provider || 'unknown'
        }
      })
      
      console.log(`[Pipeline] 💾 已保存文章分析结果: ${articleId}, provider: ${analysis.metadata?.provider || 'unknown'}`)
    } catch (error) {
      console.warn(`[Pipeline] ⚠️ 保存文章分析失败: ${articleId}`, error)
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
   */
  private async saveTFIDFScore(
    articleId: string,
    feedId: string,
    tfidfScore: number
  ): Promise<void> {
    try {
      // Phase 7: 直接更新 feedArticles 表
      await db.feedArticles.update(articleId, {
        tfidfScore
      })
      
      console.log(`[Pipeline] 💾 已保存 TF-IDF 分数: ${articleId}, score: ${tfidfScore.toFixed(4)}`)
      
    } catch (error) {
      console.warn(`[Pipeline] ⚠️ 保存 TF-IDF 分数失败: ${articleId}`, error)
      // 不抛出错误，保存失败不影响推荐流程
    }
  }
}

/**
 * 创建推荐管道实例
 */
export function createRecommendationPipeline(config?: Partial<PipelineConfig>): RecommendationPipeline {
  return new RecommendationPipelineImpl(config)
}