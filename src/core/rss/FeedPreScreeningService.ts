/**
 * Feed文章初筛服务
 * 
 * 在Feed抓取后，使用AI批量筛选值得详细分析的文章，减少AI调用次数和成本。
 * 
 * 核心功能：
 * - 预处理Feed文章（截断content，保留关键元数据）
 * - 检查输入大小（避免超过API限制）
 * - 调用AI进行批量初筛
 * - 返回筛选通过的文章链接列表
 * - 失败时回退到全量分析
 * 
 * @module core/rss/FeedPreScreeningService
 */

import { logger } from '@/utils/logger'
import { AICapabilityManager } from '@/core/ai/AICapabilityManager'
import { promptManager } from '@/core/ai/prompts'
import type { FetchResult } from './RSSFetcher'
import type { 
  PreScreeningArticle, 
  FeedPreScreeningResult, 
  UserProfile 
} from '@/core/ai/prompts/types'
import { getSettings } from '@/storage/db/db-settings'

const preScreenLogger = logger.withTag('FeedPreScreen')

/**
 * 最大输入大小配置
 * 
 * 注意：这些限制基于主流模型的上下文窗口
 * - DeepSeek/GPT-4: 128K tokens
 * - Claude: 200K tokens
 * - Gemini: 1M tokens
 * 
 * 我们取保守值128K，预留70%给输入，30%给提示词和输出
 */
const MAX_INPUT_SIZE = {
  /** API token限制（128K * 0.7 = ~90K，保守取80K） */
  tokens: 80000,
  /** 最大字节数（约320KB，按1字符≈4字节估算） */
  bytes: 320 * 1024,
  /** 单次最多处理的文章数（大多数Feed不会超过100篇） */
  articlesCount: 100,
}

/**
 * 注意：超时控制由AI Provider自己处理
 * - 标准模式：60秒（remote）或60秒（local）
 * - 推理模式：120秒（remote）或180秒（local）
 * 配置在 DEFAULT_TIMEOUTS (src/storage/ai-config.ts)
 */

/**
 * Feed文章初筛服务
 */
export class FeedPreScreeningService {
  private aiManager: AICapabilityManager

  constructor() {
    this.aiManager = new AICapabilityManager()
  }

  /**
   * 筛选Feed中值得详细分析的文章
   * 
   * @param feedResult - RSS抓取结果
   * @param feedTitle - Feed标题
   * @param feedLink - Feed链接
   * @param userProfile - 用户画像（可选）
   * @returns 筛选结果，如果失败则返回null（回退到全量分析）
   */
  async screenArticles(
    feedResult: FetchResult,
    feedTitle: string,
    feedLink: string,
    userProfile?: UserProfile | null
  ): Promise<FeedPreScreeningResult | null> {
    try {
      const startTime = Date.now()
      
      // 1. 检查是否需要初筛
      if (!this.shouldPreScreen(feedResult.items.length)) {
        preScreenLogger.info('文章数量少，跳过初筛', { count: feedResult.items.length })
        return null // 回退到全量分析
      }

      // 2. 预处理文章列表
      const preScreeningArticles = this.prepareArticles(feedResult.items)
      
      // 3. 检查总大小
      const sizeCheck = this.checkTotalSize(preScreeningArticles)
      if (!sizeCheck.ok) {
        preScreenLogger.warn('文章列表过大，跳过初筛', {
          estimatedTokens: sizeCheck.estimatedTokens,
          estimatedBytes: sizeCheck.estimatedBytes,
        })
        return null // 回退到全量分析
      }

      // 4. 调用AI进行初筛
      const result = await this.callAIPreScreening(
        feedTitle,
        feedLink,
        preScreeningArticles,
        userProfile || undefined
      )

      const duration = Date.now() - startTime
      preScreenLogger.info('初筛完成', {
        feedTitle,
        totalArticles: preScreeningArticles.length,
        selectedCount: result.selectedCount,
        selectionRate: `${(result.selectedCount / result.totalArticles * 100).toFixed(1)}%`,
        duration: `${duration}ms`,
      })

      return result
    } catch (error) {
      preScreenLogger.error('初筛失败，回退到全量分析', { error })
      return null // 回退到全量分析
    }
  }

  /**
   * 判断是否需要进行初筛
   * 
   * 如果文章数量太少（<=3篇），不值得初筛，直接全量分析更高效
   * 4篇及以上才启用初筛，减少不必要的AI调用
   */
  private shouldPreScreen(articleCount: number): boolean {
    return articleCount > 3
  }

  /**
   * 预处理文章列表
   * 
   * - 截断description到800字符（提供更多上下文）
   * - 不包含content字段（太大且不必要）
   * - 保留title、link、pubDate等关键元数据
   * - 限制最多100篇文章
   */
  private prepareArticles(items: FetchResult['items']): PreScreeningArticle[] {
    // 限制文章数量
    const limitedItems = items.slice(0, MAX_INPUT_SIZE.articlesCount)

    return limitedItems.map(item => ({
      title: item.title || '',
      link: item.link || '',
      description: item.description?.substring(0, 800) || '', // 截断到800字符，提供更多上下文
      pubDate: item.pubDate?.toISOString() || '',
    }))
  }

  /**
   * 检查总大小是否超过限制
   */
  private checkTotalSize(articles: PreScreeningArticle[]): {
    ok: boolean
    estimatedTokens: number
    estimatedBytes: number
  } {
    const json = JSON.stringify(articles)
    const bytes = new TextEncoder().encode(json).length
    
    // 粗略估算：1 token ≈ 4 bytes（对于英文和中文混合）
    const estimatedTokens = Math.ceil(bytes / 4)

    return {
      ok: estimatedTokens < MAX_INPUT_SIZE.tokens && bytes < MAX_INPUT_SIZE.bytes,
      estimatedTokens,
      estimatedBytes: bytes,
    }
  }

  /**
   * 调用AI进行初筛
   */
  private async callAIPreScreening(
    feedTitle: string,
    feedLink: string,
    articles: PreScreeningArticle[],
    userProfile?: UserProfile
  ): Promise<FeedPreScreeningResult> {
    // 获取AI配置
    const settings = await getSettings()
    const aiConfig = settings.ai
    
    if (!aiConfig || !aiConfig.enabled) {
      throw new Error('AI功能未启用')
    }

    // Feed初筛属于低频任务，使用lowFrequencyTasks配置
    const taskConfig = aiConfig.engineAssignment?.lowFrequencyTasks
    const provider = taskConfig?.provider || aiConfig.defaultProvider
    const model = taskConfig?.model || aiConfig.providers[provider]?.model

    if (!model) {
      throw new Error(`模型配置不存在: ${provider}`)
    }

    // 获取语言设置（默认中文）
    const language = settings.language || 'zh-CN'

    // 构建提示词
    const feedArticlesJson = JSON.stringify(articles, null, 2)
    const prompt = promptManager.getFeedPreScreeningPrompt(
      language as 'zh-CN' | 'en',
      feedTitle,
      feedLink,
      feedArticlesJson,
      userProfile
    )

    // 调用AI
    // 注意：超时控制由AICapabilityManager内部处理
    // - 标准模式：60秒（remote）或60秒（local）
    // - 推理模式：120秒（remote）或180秒（local）
    const response = await this.aiManager.callWithConfig({
      prompt,
      provider,
      model,
      purpose: 'recommend-content', // 归类为推荐相关
      useReasoning: taskConfig?.useReasoning || false,
    })

    // 解析结果
    const result = this.parseAIResponse(response)
    
    // 验证结果
    this.validateResult(result, articles.length)

    return result
  }

  /**
   * 解析AI响应
   */
  private parseAIResponse(response: string): FeedPreScreeningResult {
    try {
      // 移除可能的markdown代码块标记
      const cleanedResponse = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      const parsed = JSON.parse(cleanedResponse)

      return {
        selectedArticleLinks: parsed.selectedArticleLinks || [],
        reason: parsed.reason || '未提供理由',
        totalArticles: parsed.stats?.totalArticles || 0,
        selectedCount: parsed.stats?.selectedCount || parsed.selectedArticleLinks?.length || 0,
      }
    } catch (error) {
      preScreenLogger.error('解析AI响应失败', { error, response })
      throw new Error('AI返回格式不正确')
    }
  }

  /**
   * 验证结果的合理性
   */
  private validateResult(result: FeedPreScreeningResult, expectedTotal: number): void {
    // 检查基本字段
    if (!Array.isArray(result.selectedArticleLinks)) {
      throw new Error('selectedArticleLinks必须是数组')
    }

    // 检查数量一致性
    if (result.totalArticles !== expectedTotal) {
      preScreenLogger.warn('AI返回的总数与实际不符', {
        expected: expectedTotal,
        received: result.totalArticles,
      })
      // 修正总数
      result.totalArticles = expectedTotal
    }

    // 检查筛选率是否合理（应该在10%-90%之间）
    const selectionRate = result.selectedCount / result.totalArticles
    if (selectionRate < 0.1 || selectionRate > 0.9) {
      preScreenLogger.warn('筛选率异常', {
        selectionRate: `${(selectionRate * 100).toFixed(1)}%`,
        selectedCount: result.selectedCount,
        totalArticles: result.totalArticles,
      })
      // 如果筛选率过低或过高，可能是AI判断有误，回退到全量分析
      if (selectionRate < 0.1) {
        throw new Error('筛选率过低(<10%)，可能是AI判断错误')
      }
    }
  }
}

/**
 * 全局初筛服务实例
 */
export const feedPreScreeningService = new FeedPreScreeningService()
