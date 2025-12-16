/**
 * 推荐服务
 * Phase 6: 整合推荐管道、用户画像、RSS数据生成推荐
 */

import { RecommendationPipelineImpl } from './pipeline'
import { getUserProfile, updateAllFeedStats } from '../../storage/db'
import { getRecommendationConfig } from '../../storage/recommendation-config'
import { getAIConfig, AVAILABLE_MODELS, getProviderFromModel } from '../../storage/ai-config'
import { FeedManager } from '../rss/managers/FeedManager'
import { db } from '../../storage/db'
import type { Recommendation } from '@/types/database'
import type { UserProfile } from '@/types/profile'
import type { FeedArticle } from '@/types/rss'
import type {
  RecommendationInput,
  RecommendedArticle,
  RecommendationResult,
  RecommendationConfig
} from '@/types/recommendation'
import { trackRecommendationGenerated } from './adaptive-count'
import { sendRecommendationNotification } from './notification'
import { translateRecommendations } from '../translator/recommendation-translator'
import { getUIConfig } from '../../storage/ui-config'
import { logger } from '../../utils/logger'

// 创建带标签的 logger
const recLogger = logger.withTag('RecommendationService')

/**
 * 推荐池配置
 * 
 * 核心概念：
 * - 弹窗容量（maxRecommendations）: 3-5 条，根据用户行为动态调整
 *   → 弹窗中可显示的最大推荐条目数
 * 
 * - 推荐池容量：弹窗容量 × 2
 *   → 数据库中存储的待显示推荐条目总数
 *   → 例：弹窗 3 条，推荐池 6 条；弹窗 5 条，推荐池 10 条
 *   → 保证用户拒绝部分推荐后仍有充足储备
 */
const POOL_SIZE_MULTIPLIER = 2  // 推荐池倍数

/**
 * 推荐生成结果
 */
export interface RecommendationGenerationResult {
  recommendations: Recommendation[]
  stats: {
    totalArticles: number
    processedArticles: number
    recommendedCount: number
    processingTimeMs: number
  }
  errors?: string[]
}

/**
 * 推荐服务类
 */
export class RecommendationService {
  private pipeline: RecommendationPipelineImpl

  constructor() {
    this.pipeline = new RecommendationPipelineImpl()
  }

  /**
   * 生成推荐
   * 
   * @param maxRecommendations - 最大推荐数量
   * @param sources - 数据源选择 (default: subscribed RSS feeds)
   * @param batchSize - Phase 6: 每次处理的文章批次大小（默认 10 篇）
   * @returns 推荐生成结果
   */
  async generateRecommendations(
    maxRecommendations: number = 5,
    sources: 'subscribed' | 'all' = 'subscribed',
    batchSize: number = 10
  ): Promise<RecommendationGenerationResult> {
    const startTime = Date.now()
    const errors: string[] = []
    
    try {
      // 获取推荐配置
      const recommendationConfig = await getRecommendationConfig()
      let effectiveAnalysisEngine = recommendationConfig.analysisEngine || 'remoteAI'
      
      // 获取 AI 配置，检查模型是否支持推理（兼容新结构：providers + engineAssignment）
      const aiConfig = await getAIConfig()
      
      // 确定是否使用推理模式：
      // 1. 检查分析引擎配置（analysisEngine）
      // 2. 检查模型是否支持推理
      // 3. 检查用户是否启用推理
      let useReasoning = false
      let reasoningDisabledReason: string | null = null
      
      // 提升变量作用域，供后续日志使用
      let selectedModel: string | undefined
      let providerKey: ReturnType<typeof getProviderFromModel> | null = null
      
      // 如果配置要求使用推理引擎
      if (effectiveAnalysisEngine === 'remoteAIWithReasoning') {
        // 新结构：从 engineAssignment.feedAnalysis 读取任务级配置
        const taskConfig = aiConfig.engineAssignment?.feedAnalysis
        const taskProvider = taskConfig?.provider
        // 仅远程推理：local 走下方 useLocalAI 分支，这里要求非 ollama
        const isRemoteProvider = taskProvider && taskProvider !== 'ollama'
        let enableReasoningFlag: boolean | undefined

        if (isRemoteProvider) {
          // 任务级模型优先；否则回落到 providers 中的模型
          selectedModel = taskConfig?.model || aiConfig.providers[taskProvider as 'deepseek' | 'openai']?.model
          
          // 推理开关：任务级配置优先（明确设置时），否则回退到全局配置
          // 注意：不能用 || 因为 false 会被忽略，应该用 ?? 或明确判断 undefined
          enableReasoningFlag = taskConfig?.useReasoning !== undefined 
            ? taskConfig.useReasoning 
            : aiConfig.providers[taskProvider as 'deepseek' | 'openai']?.enableReasoning
        }

        if (selectedModel) {
          providerKey = getProviderFromModel(selectedModel)
          if (providerKey) {
            const modelConfig = AVAILABLE_MODELS[providerKey]?.find(m => m.id === selectedModel)
            if (modelConfig?.supportsReasoning) {
              if (enableReasoningFlag) {
                useReasoning = true
                recLogger.info('✅ 推理模式已启用', {
                  model: selectedModel,
                  provider: providerKey
                })
              } else {
                reasoningDisabledReason = '用户未启用推理能力（AI 配置页面）'
                recLogger.info('推理模式已关闭：用户在 AI 配置中未启用推理能力')
              }
            } else {
              reasoningDisabledReason = `模型 ${selectedModel} 不支持推理`
              recLogger.info(`推理模式已关闭：模型 ${selectedModel} 不支持推理能力`)
            }
          } else {
            reasoningDisabledReason = '未知的模型提供商'
            recLogger.info(`推理模式已关闭：无法识别模型 ${selectedModel} 的提供商`)
          }
        } else {
          reasoningDisabledReason = '未选择模型'
          recLogger.info('推理模式已关闭：AI 配置中未选择模型')
        }

        if (reasoningDisabledReason) {
          recLogger.info(`推理模式关闭原因: ${reasoningDisabledReason}，将使用标准模式`)
        }
      }
      
      let useLocalAI = effectiveAnalysisEngine === 'localAI'
      if (useLocalAI) {
        const localConfig = aiConfig.local
        const endpoint = localConfig?.endpoint?.trim()
        const model = localConfig?.model?.trim()
        const configEnabled = !!localConfig?.enabled
        const configValid = configEnabled && !!endpoint && !!model
        if (!configValid) {
          const reasonParts: string[] = []
          if (!configEnabled) {
            reasonParts.push('未在 AI 配置中启用本地 AI')
          }
          if (!endpoint) {
            reasonParts.push('缺少本地服务地址')
          }
          if (!model) {
            reasonParts.push('缺少模型名称')
          }
          recLogger.warn(`⚠️ 本地 AI 模式降级：${reasonParts.join('、')}（将改用远程 AI）`)
          effectiveAnalysisEngine = 'remoteAI'
          useLocalAI = false
        }
      }
      
      // 🔍 调试：检查配置读取
      // 记录更准确的推荐配置详情（新结构）
      const taskConfig = aiConfig.engineAssignment?.feedAnalysis
      const taskProvider = taskConfig?.provider as 'deepseek' | 'openai' | undefined
      const enableReasoningInAIConfig = taskConfig?.useReasoning !== undefined 
        ? taskConfig.useReasoning 
        : (taskProvider && aiConfig.providers[taskProvider]?.enableReasoning) || false
      
      recLogger.info('🔍 推荐配置详情:', {
        analysisEngine: effectiveAnalysisEngine,
        selectedModel,
        providerKey,
        modelSupportsReasoning: selectedModel ? (
          providerKey && !!AVAILABLE_MODELS[providerKey]?.find(m => m.id === selectedModel)?.supportsReasoning
        ) : false,
        enableReasoningInAIConfig,
        finalUseReasoning: useReasoning,
        reasoningDisabledReason,
        useLocalAI,
        taskConfig: {
          provider: taskProvider,
          model: taskConfig?.model,
          useReasoning: taskConfig?.useReasoning
        },
        完整配置: recommendationConfig
      })
      
      recLogger.info(' 开始生成推荐...', {
        maxRecommendations,
        sources,
        batchSize,
        useReasoning,
        useLocalAI
      })

      // 1. 获取用户画像
      const userProfile = await getUserProfile()
      if (!userProfile) {
        throw new Error('用户画像未准备好，请先浏览更多页面建立兴趣模型')
      }

      // 2. 获取RSS文章数据（Phase 6: 优先获取未分析的文章）
      const articles = await this.collectArticles(sources, batchSize)
      if (articles.length === 0) {
        // 无数据时返回调试信息：所有文章都已分析完成
        recLogger.debug('所有订阅的RSS文章都已分析完成')
        return {
          recommendations: [],
          stats: {
            total: 0,
            analyzed: 0,
            recommended: 0,
            filtered: 0,
            reason: 'allAnalyzed' // 使用标识符而非具体消息
          }
        }
      }

      recLogger.info(`收集到文章: ${articles.length} 篇（批次大小：${batchSize}）`)

      // 3. 构建推荐输入
      const config: RecommendationConfig = {
        analysisEngine: effectiveAnalysisEngine,
        maxRecommendations,
        useReasoning,
        useLocalAI,
        batchSize: recommendationConfig.batchSize,
        qualityThreshold: recommendationConfig.qualityThreshold,
        tfidfThreshold: recommendationConfig.tfidfThreshold
      }
      
      recLogger.info(' 推荐配置:', {
        analysisEngine: config.analysisEngine,
        useReasoning,
        useLocalAI,
        qualityThreshold: config.qualityThreshold,
        tfidfThreshold: config.tfidfThreshold,
        batchSize: config.batchSize,
        maxRecommendations: config.maxRecommendations
      })

      const input: RecommendationInput = {
        articles,
        userProfile,
        config,
        options: {
          maxArticles: articles.length
        }
      }

      // 4. 运行推荐管道
      const result = await this.pipeline.process(input)
      
      // 5. Phase 6: 应用推荐池质量阈值，只保存高质量推荐
      const qualityThreshold = recommendationConfig.qualityThreshold
      const highQualityArticles = result.articles.filter(article => {
        const isHighQuality = article.score >= qualityThreshold
        if (!isHighQuality) {
          recLogger.info(` ⚠️ 文章质量不达标 (${article.score.toFixed(2)} < ${qualityThreshold}):`, article.title)
        }
        return isHighQuality
      })
      
      if (highQualityArticles.length === 0 && result.articles.length > 0) {
        recLogger.warn(` ⚠️ 所有文章都未达到质量阈值 ${qualityThreshold}，本次不生成推荐`)
      }
      
      // 6. 转换为存储格式并保存（仅保存高质量文章）
      const recommendations = await this.saveRecommendations(highQualityArticles, recommendationConfig)

      const processingTimeMs = Date.now() - startTime
      const stats = {
        totalArticles: articles.length,
        processedArticles: result.stats.processed.finalRecommended || 0,
        recommendedCount: recommendations.length,
        processingTimeMs
      }

      // 推荐方式总结日志
      const algorithmUsed = this.getAlgorithmDisplayName(result.algorithm)
      recLogger.info(` 🎯 推荐生成完成 - 使用方式：${algorithmUsed}`, {
        '总文章数': stats.totalArticles,
        '推荐数量': stats.recommendedCount,
        '处理时长': `${stats.processingTimeMs}ms`,
        '推荐方式': algorithmUsed,
        'AI分析数': result.stats.processed.aiScored || 0,
        'TFIDF筛选数': result.stats.processed.tfidfFiltered || 0
      })

      // 6. 跟踪推荐生成
      await trackRecommendationGenerated(recommendations.length)

      // 6.5. 更新所有 Feed 的统计信息（反映新的分析结果）
      try {
        await updateAllFeedStats()
        recLogger.info('✅ Feed 统计已更新')
      } catch (error) {
        recLogger.error('❌ 更新 Feed 统计失败:', error)
        // 统计更新失败不影响推荐流程
      }

      // 7. 自动翻译推荐（如果启用）
      const uiConfig = await getUIConfig()
      if (uiConfig.autoTranslate && recommendations.length > 0) {
        recLogger.info(`🌐 自动翻译已启用，开始翻译 ${recommendations.length} 条推荐...`)
        try {
          const translatedRecs = await translateRecommendations(recommendations)
          // translateRecommendations 已经更新了数据库，直接使用返回的结果
          recommendations.splice(0, recommendations.length, ...translatedRecs)
        } catch (error) {
          recLogger.error('❌ 翻译失败:', error)
          // 翻译失败不影响推荐展示
        }
      }

      // 8. 发送通知（如果有推荐）
      if (recommendations.length > 0) {
        const topRecommendation = recommendations[0]
        await sendRecommendationNotification(recommendations.length, {
          title: topRecommendation.title,
          source: topRecommendation.source,
          url: topRecommendation.url
        })
      }

      return {
        recommendations,
        stats,
        errors: errors.length > 0 ? errors : undefined
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      recLogger.error(' ❌ 推荐生成失败:', errorMessage)
      
      return {
        recommendations: [],
        stats: {
          totalArticles: 0,
          processedArticles: 0,
          recommendedCount: 0,
          processingTimeMs: Date.now() - startTime
        },
        errors: [errorMessage]
      }
    }
  }

  /**
   * 收集文章数据
   * 
   * Phase 6: 支持批量处理，优先收集未被AI分析过的文章
   * 
   * @param sources - 数据源类型
   * @param batchSize - 批次大小（0 = 不限制）
   */
  private async collectArticles(
    sources: 'subscribed' | 'all',
    batchSize: number = 0
  ): Promise<FeedArticle[]> {
    const feedManager = new FeedManager()
    const feeds = sources === 'all' 
      ? await feedManager.getFeeds() 
      : await feedManager.getFeeds('subscribed')

    recLogger.info(`找到RSS源: ${feeds.length} 个`)

    const allArticles: FeedArticle[] = []

    // Phase 10: 从 feedArticles 表查询，只收集 inFeed=true 的未分析文章
    for (const feed of feeds) {
      // 查询该 Feed 的所有文章
      // 使用复合索引 [feedId+published] 优化查询
      const feedArticles = await db.feedArticles
        .where('feedId').equals(feed.id)
        .reverse()  // 按发布时间倒序（最新的优先）
        .sortBy('published')
      
      // Phase 10: 筛选条件：inFeed=true（仍在源中）&& !analysis（未分析）
      const unanalyzedArticles = feedArticles.filter(article => 
        (article.inFeed !== false) && !article.analysis
      )
      
      // 统计信息（调试用）
      if (process.env.NODE_ENV === 'development' && unanalyzedArticles.length > 0) {
        const totalArticles = feedArticles.length
        const inFeedArticles = feedArticles.filter(a => a.inFeed !== false).length
        recLogger.debug(`${feed.title}: 总 ${totalArticles} 篇，在源中 ${inFeedArticles} 篇，待分析 ${unanalyzedArticles.length} 篇`)
      }
      
      allArticles.push(...unanalyzedArticles)
    }

    // 已经按发布时间倒序排序（查询时已处理）
    recLogger.info(` 收集未分析文章（待TF-IDF筛选）: ${allArticles.length} 篇`)
    return allArticles
  }

  /**
   * 保存推荐到数据库
   * 
   * Phase 6: 实现推荐池机制
   * 
   * 核心逻辑：
   * 1. 获取当前推荐池（数据库中未读且未拒绝的推荐）
   * 2. 计算推荐池容量 = 弹窗容量 × 2
   * 3. 新推荐与池中现有推荐竞争
   * 4. 只保留高分推荐，移除低分推荐
   * 
   * @param recommendedArticles - 新生成的推荐文章
   * @param config - 推荐配置（包含 maxRecommendations 弹窗容量）
   * @returns 保存的推荐列表
   */
  private async saveRecommendations(
    recommendedArticles: RecommendedArticle[],
    config: RecommendationConfig
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = []
    const now = Date.now()
    const existingUrls = new Set<string>()

    // Phase 6/12.7: 获取当前推荐池（数据库中活跃的、未读且未被标记为不想读的推荐）
    // ✅ 优化：使用复合索引 [isRead+recommendedAt]
    // Dexie 的 boolean 索引需要使用 filter，但我们可以减少扫描范围
    const currentPool = await db.recommendations
      .orderBy('recommendedAt')
      .reverse()
      .filter(rec => {
        // Phase 12.7: 只统计活跃状态的推荐
        const isActive = !rec.status || rec.status === 'active'
        const isUnreadAndNotDismissed = !rec.isRead && rec.feedback !== 'dismissed'
        return isActive && isUnreadAndNotDismissed
      })
      .toArray()
    
    // 核心公式：推荐池容量 = 弹窗容量 × POOL_SIZE_MULTIPLIER
    // - baseSize (maxRecommendations): 弹窗可显示的条目数（3-5 条）
    // - maxSize: 数据库中存储的总条目数（6-10 条）
    const baseSize = config.maxRecommendations || 3  // 弹窗容量（默认 3 条）
    const maxSize = baseSize * POOL_SIZE_MULTIPLIER  // 推荐池容量（默认 6 条）
    recLogger.info(`当前推荐池: ${currentPool.length} 条（弹窗容量: ${baseSize}，推荐池容量: ${maxSize}，排除已标记为不想读的推荐）`)

    // 获取最近7天的推荐URL，用于去重
    try {
      const recentRecommendations = await db.recommendations
        .where('recommendedAt')
        .above(now - 7 * 24 * 60 * 60 * 1000) // 7天前
        .toArray()
      
      recentRecommendations.forEach(rec => existingUrls.add(rec.url))
      recLogger.info(`最近7天已有推荐: ${existingUrls.size} 条，用于去重`)
    } catch (error) {
      recLogger.warn(' 获取历史推荐失败:', error)
    }

    for (const [index, article] of recommendedArticles.entries()) {
      // 检查是否重复
      if (existingUrls.has(article.url)) {
        recLogger.info(`跳过重复推荐: ${article.title} - ${article.url}`)
        continue
      }

      // Phase 6: 推荐池竞争逻辑
      const poolSize = currentPool.length
      const baseSize = config.maxRecommendations || 3
      const maxSize = baseSize * POOL_SIZE_MULTIPLIER
      
      // 规则 1: 如果池未满，直接加入（已经通过质量阈值筛选）
      if (poolSize < maxSize) {
        recLogger.info(` ✅ 池未满 (${poolSize}/${maxSize})，直接加入: ${article.title} (${article.score.toFixed(2)})`)
      } 
      // 规则 2: 如果池已满，检查是否能替换最低分
      else {
        const lowestInPool = currentPool.sort((a, b) => a.score - b.score)[0]
        if (article.score > lowestInPool.score) {
          recLogger.info(` 🔄 替换低分推荐: ${article.score.toFixed(2)} > ${lowestInPool.score.toFixed(2)}`)
          
          // Phase 10: 同步更新被替换文章的 inPool 状态
          try {
            const replacedArticle = await db.feedArticles
              .where('link').equals(lowestInPool.url)
              .first()
            
            if (replacedArticle) {
              const now = Date.now()
              await db.feedArticles.update(replacedArticle.id, {
                inPool: false,
                poolRemovedAt: now,
                poolRemovedReason: 'replaced'
              })
              recLogger.debug(`📝 已更新被替换文章的 inPool 状态: ${replacedArticle.title}`)
            }
          } catch (error) {
            recLogger.warn(`更新被替换文章状态失败: ${lowestInPool.url}`, error)
          }
          
          // Phase 7: 软删除 - 更新状态而不是删除记录
          const replacedAt = Date.now()
          await db.recommendations.update(lowestInPool.id, {
            status: 'replaced',
            replacedAt: replacedAt,
            replacedBy: `rec-${now}-${index}` // 记录被谁替换
          })
          recLogger.debug(` 📝 已标记推荐为 replaced: ${lowestInPool.title}`)
          
          currentPool.shift() // 从内存数组中移除
        } else {
          recLogger.info(` ❌ 池已满且分数不够高: ${article.score.toFixed(2)} <= ${lowestInPool.score.toFixed(2)}，跳过: ${article.title}`)
          continue // 不够格，跳过
        }
      }

      // Phase 6: 使用 feedId 获取准确的 RSS 源信息
      let feedUrl = ''
      if (article.feedId) {
        try {
          const feed = await db.discoveredFeeds.get(article.feedId)
          if (feed) {
            feedUrl = feed.url
          }
        } catch (error) {
          recLogger.warn(`获取 RSS 源失败: ${article.feedId}`, error)
        }
      }
      
      // 如果没有 feedId 或获取失败，降级到从 URL 推断
      if (!feedUrl) {
        feedUrl = this.extractBaseUrl(article.url)
      }

      const recommendation: Recommendation = {
        id: `rec-${now}-${index}`,
        url: article.url,
        title: article.title,
        // 优先使用 AI 摘要
        // 如果没有，使用 keyPoints 但跳过第一项（第一项是标题，会重复）
        summary: article.aiAnalysis?.summary || (article.keyPoints && article.keyPoints.length > 1 ? article.keyPoints.slice(1).join('\n') : '') || '',
        source: this.extractSourceFromUrl(article.url),
        sourceUrl: feedUrl,  // Phase 6: 使用准确的 feed URL
        recommendedAt: now,
        score: article.score,
        reason: article.reason,
        isRead: false,
        status: 'active'  // Phase 7: 新推荐默认为活跃状态
      }

      // 临时诊断日志：检查摘要数据
      if (recommendation.summary === recommendation.title) {
        recLogger.warn(`⚠️ 摘要与标题相同`, {
          title: recommendation.title,
          summary: recommendation.summary,
          aiAnalysisSummary: article.aiAnalysis?.summary,
          keyPoints: article.keyPoints
        })
      }

      recommendations.push(recommendation)
      currentPool.push(recommendation) // 加入当前池（用于后续比较）
      existingUrls.add(article.url) // 防止本批次内重复
    }

    if (recommendations.length === 0) {
      recLogger.info(' ⚠️ 所有推荐都是重复的，没有新推荐可保存')
      return []
    }

    // 批量保存到数据库
    await db.recommendations.bulkAdd(recommendations)
    
    recLogger.info(`保存推荐到数据库: ${recommendations.length} 条（去重后）`)

    // Phase 10: 批量更新 feedArticles 的 inPool 状态
    // ✅ 使用新架构：inPool 标记候选池，recommended 保留历史记录
    const articlesToUpdate: Array<{ id: string; url: string }> = []
    
    for (const article of recommendedArticles) {
      // 通过 URL 查找文章
      try {
        const feedArticle = await db.feedArticles
          .where('link').equals(article.url)
          .first()
        
        if (feedArticle) {
          articlesToUpdate.push({ id: feedArticle.id, url: article.url })
        }
      } catch (error) {
        recLogger.warn(`查找文章失败: ${article.url}`, error)
      }
    }
    
    // ✅ 批量更新文章的 inPool 和 recommended 状态
    if (articlesToUpdate.length > 0) {
      const now = Date.now()
      await db.transaction('rw', [db.feedArticles], async () => {
        for (const { id } of articlesToUpdate) {
          await db.feedArticles.update(id, {
            inPool: true,              // Phase 10: 标记进入候选池
            poolAddedAt: now,          // Phase 10: 记录进入时间
            recommended: true          // 保留历史记录（兼容旧逻辑）
          })
        }
      })
      recLogger.info(`✅ 已标记进入推荐池的文章: ${articlesToUpdate.length} 篇 (inPool=true)`)
    }

    // Phase 6: 更新 RSS 源的推荐数统计
    // 异步更新，不阻塞返回
    updateAllFeedStats().catch((error: Error) => {
      recLogger.error(' 更新 RSS 源统计失败:', error)
    })

    return recommendations
  }

  /**
   * 从URL提取源名称
   */
  private extractSourceFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname
      return hostname.replace('www.', '')
    } catch {
      return 'Unknown Source'
    }
  }

  /**
   * 从URL提取基础URL
   */
  private extractBaseUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return `${urlObj.protocol}//${urlObj.hostname}`
    } catch {
      return url
    }
  }

  /**
   * 清理管道资源
   */
  cleanup(): void {
    this.pipeline.cleanup()
  }

  /**
   * 获取算法显示名称
   */
  private getAlgorithmDisplayName(algorithm: string): string {
    switch (algorithm) {
      case 'reasoning-ai':
        return '推理AI推荐'
      case 'ai':
        return 'AI智能推荐'
      case 'hybrid':
        return '混合推荐（AI降级到TF-IDF）'
      case 'tfidf':
        return 'TF-IDF关键词匹配'
      default:
        return '未知算法'
    }
  }
}

/**
 * 单例实例
 */
export const recommendationService = new RecommendationService()