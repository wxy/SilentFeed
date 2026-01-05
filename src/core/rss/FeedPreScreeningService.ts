/**
 * Feed文章初筛服务
 * 
 * 在Feed抓取后，使用AI批量筛选值得详细分析的文章，减少AI调用次数和成本。
 * 
 * 核心功能：
 * - 预处理Feed文章（截断content，保留关键元数据）
 * - 清理 HTML 标签和实体，转换为纯文本
 * - 检查输入大小（避免超过API限制）
 * - 调用AI进行批量初筛
 * - 返回筛选通过的文章链接列表
 * - 失败时回退到全量分析
 * 
 * @module core/rss/FeedPreScreeningService
 */

import { logger } from '@/utils/logger'
import { aiManager } from '@/core/ai/AICapabilityManager'
import { promptManager } from '@/core/ai/prompts'
import type { FetchResult } from './RSSFetcher'
import type { 
  PreScreeningArticle, 
  FeedPreScreeningResult, 
  UserProfile 
} from '@/core/ai/prompts/types'
import { getAIConfig } from '@/storage/ai-config'
import { getSettings } from '@/storage/db/db-settings'
import { resolveProvider } from '@/utils/ai-provider-resolver'
import { sanitizeHtmlToText, truncateText } from '@/utils/html-sanitizer'

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
  // 使用全局单例而不是创建新实例
  private aiManager = aiManager

  constructor() {
    // aiManager 已由 background.ts 初始化
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
      
      // 0. 提前检查 AI 配置是否可用
      const aiConfig = await getAIConfig()
      
      // 检查是否有配置的 Provider
      const hasRemoteProvider = aiConfig.providers?.deepseek?.apiKey || aiConfig.providers?.openai?.apiKey
      const hasLocalProvider = aiConfig.local?.enabled && aiConfig.local?.model
      if (!hasRemoteProvider && !hasLocalProvider) {
        preScreenLogger.warn('未配置任何 AI Provider，跳过初筛', { feedTitle })
        return null // 回退到全量分析
      }

      // 1. 检查是否需要初筛
      if (!this.shouldPreScreen(feedResult.items.length)) {
        preScreenLogger.info('文章数量少，跳过初筛', { count: feedResult.items.length })
        return null // 回退到全量分析
      }

      // 2. 预处理文章列表
      const preScreeningArticles = this.prepareArticles(feedResult.items)
      preScreenLogger.debug('文章预处理完成', {
        originalCount: feedResult.items.length,
        processedCount: preScreeningArticles.length,
      })
      
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
      // 详细记录错误信息
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      
      preScreenLogger.error('初筛失败，回退到全量分析', {
        feedTitle,
        feedLink,
        articleCount: feedResult.items.length,
        errorMessage,
        errorStack,
        errorType: error?.constructor?.name,
      })
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
   * 内容优先级：content > description > (需要抓取全文)
   * 
   * - 优先使用 content 字段（RSS 的完整内容）
   * - 如果没有 content，使用 description
   * - 清理 HTML 标签和实体，转换为纯文本
   * - 截断到 800 字符
   * - 如果内容太短（<100字符），标记为需要抓取全文
   * - 保留 title、link、pubDate 等关键元数据
   * - 限制最多 100 篇文章
   */
  private prepareArticles(items: FetchResult['items']): PreScreeningArticle[] {
    // 限制文章数量
    const limitedItems = items.slice(0, MAX_INPUT_SIZE.articlesCount)

    return limitedItems.map(item => {
      // 优先使用 content（完整内容），其次 description（摘要）
      const rawContent = item.content || item.description || ''
      const cleanContent = sanitizeHtmlToText(rawContent)
      
      return {
        // 标题也可能包含 HTML 实体
        title: sanitizeHtmlToText(item.title) || '',
        link: item.link || '',
        // 使用最佳可用内容，截断到 800 字符
        description: truncateText(cleanContent, 800, ''),
        pubDate: item.pubDate?.toISOString() || '',
      }
    })
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
    const aiConfig = await getAIConfig()
    
    if (!aiConfig) {
      throw new Error('AI配置不存在')
    }
    
    preScreenLogger.debug('获取AI配置成功', {
      defaultProvider: aiConfig.preferredRemoteProvider,
    })

    // Feed初筛属于低频任务，使用lowFrequencyTasks配置
    const taskConfig = aiConfig.engineAssignment?.lowFrequencyTasks
    // 使用 resolveProvider 将抽象 provider（如 'remote'）解析为具体 provider（如 'deepseek'）
    const abstractProvider = taskConfig?.provider || 'remote'
    const provider = resolveProvider(abstractProvider, aiConfig)
    const model = taskConfig?.model || aiConfig.providers?.[provider as keyof typeof aiConfig.providers]?.model

    if (!model) {
      throw new Error(`模型配置不存在: ${provider}（原始配置: ${abstractProvider}）`)
    }

    // 获取语言设置（默认中文）
    const language = 'zh-CN'

    // 构建提示词
    const feedArticlesJson = JSON.stringify(articles, null, 2)
    const useReasoning = taskConfig?.useReasoning || false
    
    preScreenLogger.debug('准备调用AI初筛', {
      provider,
      model,
      articleCount: articles.length,
      jsonSize: feedArticlesJson.length,
      useReasoning,
    })
    
    const prompt = promptManager.getFeedPreScreeningPrompt(
      language as 'zh-CN' | 'en',
      feedTitle,
      feedLink,
      feedArticlesJson,
      userProfile
    )
    
    preScreenLogger.debug('提示词生成结果', {
      promptLength: prompt?.length || 0,
      promptPreview: prompt?.substring(0, 100) || 'empty',
    })
    
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('生成提示词失败：返回空字符串')
    }

    // 调用 AI 初筛专用方法
    // 使用 lowFrequencyTasks 配置，返回原始 JSON 响应
    const response = await this.aiManager.screenFeedArticles(prompt, {
      useReasoning,
      maxTokens: useReasoning ? 64000 : 4000  // 推理模式使用最大值 64K（跨度思考需要更多 token）
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
