/**
 * 策略决策服务
 * 
 * 负责调用 AI 生成推荐系统的动态策略，包括：
 * - 收集系统状态（供给、需求、历史、画像）
 * - 调用 AI 生成策略（基于量化规则）
 * - 验证和后处理策略参数
 * - 保存和管理策略决策
 */

import { logger } from '@/utils/logger'
import { db, getPoolStats } from '@/storage/db'
import type { 
  StrategyDecisionContext, 
  RecommendationStrategy, 
  StrategyDecision 
} from '@/types/strategy'
import { 
  saveStrategyDecision, 
  getCurrentStrategy as getStoredStrategy,
  invalidateStrategy 
} from '@/storage/db/db-strategy'
import { 
  cacheStrategy,
  cacheSystemContext,
  getCachedSystemContext 
} from '@/storage/strategy-cache'
import { getOnboardingState } from '@/storage/onboarding-state'
import { AICapabilityManager } from '@/core/ai/AICapabilityManager'
import { promptManager } from '@/core/ai/prompts'
import { getSettings } from '@/storage/db/db-settings'
import { getAIConfig } from '@/storage/ai-config'
import { getRecommendationConfig } from '@/storage/recommendation-config'
import { getUserProfile } from '@/storage/db/db-profile'

const strategyLogger = logger.withTag('StrategyService')

/**
 * 策略决策服务类
 */
export class StrategyDecisionService {
  private aiManager: AICapabilityManager

  constructor() {
    this.aiManager = new AICapabilityManager()
  }

  /**
   * 获取当前有效策略
   * 如果没有有效策略，返回 null
   */
  async getCurrentStrategy(): Promise<StrategyDecision | null> {
    try {
      const strategy = await getStoredStrategy()
      
      if (!strategy) {
        strategyLogger.info('没有找到当前有效策略')
        return null
      }

      // 检查是否过期
      if (strategy.validUntil < Date.now()) {
        strategyLogger.info('当前策略已过期', {
          id: strategy.id,
          validUntil: new Date(strategy.validUntil).toISOString()
        })
        
        // 标记为过期
        await invalidateStrategy(strategy.id)
        return null
      }

      return strategy
    } catch (error) {
      strategyLogger.error('获取当前策略失败', { error })
      throw error
    }
  }

  /**
   * 生成新的策略决策
   * @returns 新的策略决策
   */
  async generateNewStrategy(): Promise<StrategyDecision> {
    strategyLogger.info('开始生成新策略决策...')

    try {
      // 0. 提前检查 AI 配置是否可用
      const aiConfig = await getAIConfig()
      if (!aiConfig.enabled) {
        const error = new Error('AI 功能未启用，无法生成策略决策')
        strategyLogger.warn('⚠️ AI 功能未启用，跳过策略生成')
        throw error
      }
      
      // 检查是否有配置的 Provider
      const hasRemoteProvider = aiConfig.providers?.deepseek?.apiKey || aiConfig.providers?.openai?.apiKey
      const hasLocalProvider = aiConfig.providers?.ollama?.enabled
      if (!hasRemoteProvider && !hasLocalProvider) {
        const error = new Error('未配置任何 AI Provider，无法生成策略决策')
        strategyLogger.warn('⚠️ 未配置任何 AI Provider，跳过策略生成')
        throw error
      }

      // 1. 收集系统状态
      const context = await this.collectContext()
      strategyLogger.debug('系统状态收集完成', {
        rawPool: context.supply.rawPoolSize,
        candidatePool: context.supply.candidatePoolSize,
        dailyReads: context.demand.dailyReadCount
      })

      // 2. 调用 AI 生成策略
      const strategy = await this.callAIDecision(context)
      strategyLogger.debug('AI 策略生成完成', {
        analysisInterval: strategy.scheduling.analysisIntervalMinutes,
        cooldown: strategy.recommendation.cooldownMinutes
      })

      // 3. 验证和后处理
      const validatedStrategy = this.validateStrategy(strategy)

      // 4. 创建策略决策记录
      const now = Date.now()
      const decision: StrategyDecision = {
        id: `strategy-${now}`,
        createdAt: now,
        validUntil: now + validatedStrategy.meta.validHours * 60 * 60 * 1000,
        nextReview: now + validatedStrategy.meta.nextReviewHours * 60 * 60 * 1000,
        context,
        strategy: validatedStrategy,
        status: 'active'
      }

      // 5. 保存到数据库
      await saveStrategyDecision(decision)
      
      // 6. 缓存到 chrome.storage.local
      await cacheStrategy(decision)
      
      strategyLogger.info('新策略决策已保存并缓存', {
        id: decision.id,
        validUntil: new Date(decision.validUntil).toISOString(),
        nextReview: new Date(decision.nextReview).toISOString()
      })

      return decision
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      strategyLogger.error('生成策略决策失败', { 
        errorMessage,
        errorStack,
        errorType: error?.constructor?.name 
      })
      throw error
    }
  }

  /**
   * 收集系统状态作为决策上下文
   * 
   * 优化：优先从缓存读取，如果缓存不存在或过时才重新计算
   * 
   * @returns 策略决策上下文
   */
  async collectContext(): Promise<StrategyDecisionContext> {
    strategyLogger.debug('开始收集系统状态...')

    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    try {
      // 1. 尝试从缓存获取系统上下文
      const cachedContext = await getCachedSystemContext()
      
      // 并行查询所有数据
      const [
        settings,
        recommendationConfig,
        userProfile,
        onboardingStatus,
        poolStats,
        allFeeds,
        allArticles,
        allRecommendations,
        allAIUsage
      ] = await Promise.all([
        getSettings(),
        getRecommendationConfig(),
        getUserProfile(),
        getOnboardingState(),
        cachedContext ? Promise.resolve({
          raw: cachedContext.rawPoolSize,
          candidate: { count: cachedContext.candidatePoolSize },
          analyzedNotQualified: 0
        }) : getPoolStats(),
        db.discoveredFeeds.toArray(),  // 获取所有订阅源，稍后过滤
        cachedContext ? Promise.resolve([]) : db.feedArticles.toArray(),  // 如果有缓存就不查询
        cachedContext ? Promise.resolve([]) : db.recommendations.toArray(),
        cachedContext ? Promise.resolve([]) : db.aiUsage.toArray()
      ])

      // 过滤数据
      const feeds = allFeeds.filter(f => f.isActive === true)
      
      let dailyNewArticles: number
      let dailyReadCount: number
      let recommendedPool: number
      let totalTokensToday: number
      let analyzedToday: number
      
      if (cachedContext) {
        // 使用缓存的数据
        strategyLogger.debug('使用缓存的系统上下文')
        dailyNewArticles = cachedContext.dailyNewArticles
        dailyReadCount = cachedContext.dailyReadCount
        recommendedPool = cachedContext.recommendationPoolSize
        totalTokensToday = cachedContext.aiTokensUsedToday
        analyzedToday = cachedContext.analyzedArticlesToday
      } else {
        // 重新计算
        strategyLogger.debug('重新计算系统上下文（缓存不可用）')
        
        const recentArticles = allArticles.filter(
          a => a.fetched && a.fetched > sevenDaysAgo
        )
        const recentRecommendations = allRecommendations.filter(
          r => r.recommendedAt && r.recommendedAt > sevenDaysAgo
        )
        const aiUsageToday = allAIUsage.filter(
          u => u.timestamp && u.timestamp > oneDayAgo
        )
        
        dailyNewArticles = recentArticles.filter(a => a.fetched > oneDayAgo).length
        dailyReadCount = recentRecommendations.filter(
          r => r.isRead && r.readAt && r.readAt > oneDayAgo
        ).length
        recommendedPool = await db.feedArticles
          .where('poolStatus')
          .equals('recommended')
          .count()
        totalTokensToday = aiUsageToday.reduce(
          (sum, u) => sum + (u.tokens?.total || 0), 0
        )
        analyzedToday = aiUsageToday.filter(
          u => u.purpose === 'analyze-content'
        ).length
        
        // 缓存计算结果
        await cacheSystemContext({
          activeFeeds: feeds.length,
          dailyNewArticles,
          rawPoolSize: poolStats.raw,
          candidatePoolSize: poolStats.candidate.count,
          dailyReadCount,
          recommendationPoolSize: recommendedPool,
          aiTokensUsedToday: totalTokensToday,
          analyzedArticlesToday: analyzedToday
        })
      }

      // 如果没有缓存，需要计算更多详细数据
      let avgUpdateFrequency = 0
      let avgReadSpeed = 0
      let dismissRate = 0
      let likeRate = 0
      let totalCostToday = 0
      let recommendedToday = 0
      let last7DaysReadCount = 0
      let last7DaysRecommendedCount = 0
      let last7DaysAnalyzedCount = 0
      
      if (!cachedContext) {
        const recentArticles = allArticles.filter(
          a => a.fetched && a.fetched > sevenDaysAgo
        )
        const recentRecommendations = allRecommendations.filter(
          r => r.recommendedAt && r.recommendedAt > sevenDaysAgo
        )
        const aiUsageToday = allAIUsage.filter(
          u => u.timestamp && u.timestamp > oneDayAgo
        )
        
        // 供给侧：更新频率
        const activeFeeds = feeds.filter(f => f.isActive)
        avgUpdateFrequency = activeFeeds.length > 0
          ? activeFeeds.reduce((sum, f) => {
              const recentArticlesCount = recentArticles.filter(a => a.feedId === f.id).length
              return sum + (recentArticlesCount / 7 * 7)
            }, 0) / activeFeeds.length
          : 0
        
        // 需求侧：阅读速度和反馈
        avgReadSpeed = recentRecommendations.filter(r => r.isRead).length / 7
        
        const totalRecommendations = recentRecommendations.length
        const dismissedCount = recentRecommendations.filter(
          r => r.feedback === 'dismissed' || r.status === 'dismissed'
        ).length
        const likedCount = recentRecommendations.filter(
          r => r.isRead && r.readDuration && r.readDuration > 60 // 阅读时长 > 1分钟视为喜欢
        ).length
        
        dismissRate = totalRecommendations > 0 
          ? (dismissedCount / totalRecommendations) * 100 
          : 0
        likeRate = totalRecommendations > 0 
          ? (likedCount / totalRecommendations) * 100 
          : 0
        
        // 系统：成本和今日推荐数
        totalCostToday = aiUsageToday.reduce(
          (sum, u) => sum + (u.cost?.total || 0), 0
        )
        recommendedToday = recentRecommendations.filter(
          r => r.recommendedAt > oneDayAgo
        ).length
        
        // 历史：7天统计
        last7DaysReadCount = recentRecommendations.filter(r => r.isRead).length
        last7DaysRecommendedCount = totalRecommendations
        last7DaysAnalyzedCount = recentArticles.filter(
          a => a.analysis && a.analysis.provider !== 'keyword'
        ).length
      }

      // 构建上下文
      const context: StrategyDecisionContext = {
        supply: {
          totalFeeds: feeds.length,
          activeFeeds: feeds.length,
          avgUpdateFrequency,
          dailyNewArticles,
          rawPoolSize: poolStats.raw,
          candidatePoolSize: poolStats.candidate.count,
          analyzedNotQualifiedSize: poolStats.analyzedNotQualified || 0
        },
        demand: {
          dailyReadCount,
          avgReadSpeed,
          dismissRate,
          likeRate,
          recommendationPoolSize: recommendedPool,
          recommendationPoolCapacity: recommendationConfig.maxRecommendations * 2
        },
        system: {
          aiTokensUsedToday: totalTokensToday,
          aiTokensBudgetDaily: 100000,  // 默认每日 Token 预算
          aiCostToday: totalCostToday,
          analyzedArticlesToday: analyzedToday,
          recommendedArticlesToday: recommendedToday
        },
        history: {
          last7DaysReadCount,
          last7DaysRecommendedCount,
          last7DaysAnalyzedCount
        },
        userProfile: {
          pageVisitCount: userProfile?.totalPages || 0,
          onboardingComplete: onboardingStatus.state === 'ready',
          topTopics: userProfile?.topics ? 
            Object.entries(userProfile.topics)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([topic]) => topic as any)  // Topic 类型已在 userProfile.topics 中定义
            : [],
          profileConfidence: userProfile?.totalPages ? 
            Math.min(100, (userProfile.totalPages / 1000) * 100) : 0
        },
        timestamp: now
      }

      strategyLogger.debug('系统状态收集完成', {
        供给: {
          活跃源: context.supply.activeFeeds,
          日均新文章: context.supply.dailyNewArticles,
          原料池: context.supply.rawPoolSize,
          候选池: context.supply.candidatePoolSize
        },
        需求: {
          日均阅读: context.demand.dailyReadCount,
          拒绝率: context.demand.dismissRate.toFixed(1) + '%',
          喜欢率: context.demand.likeRate.toFixed(1) + '%',
          推荐池: context.demand.recommendationPoolSize
        },
        系统: {
          今日分析: context.system.analyzedArticlesToday,
          今日推荐: context.system.recommendedArticlesToday,
          今日成本: '$' + context.system.aiCostToday.toFixed(4)
        }
      })

      return context
    } catch (error) {
      strategyLogger.error('收集系统状态失败', { error })
      throw error
    }
  }

  /**
   * 调用 AI 生成策略
   * @param context 决策上下文
   * @returns AI 生成的策略
   */
  private async callAIDecision(
    context: StrategyDecisionContext
  ): Promise<RecommendationStrategy> {
    strategyLogger.debug('调用 AI 生成策略...', {
      rawPool: context.supply.rawPoolSize,
      candidatePool: context.supply.candidatePoolSize,
      dailyReads: context.demand.dailyReadCount
    })

    try {
      // 1. 准备变量（转换为字符串）
      const timestamp = Date.now()
      const variables: Record<string, string | number> = {
        activeFeeds: context.supply.activeFeeds,
        dailyNewArticles: context.supply.dailyNewArticles,
        rawPoolSize: context.supply.rawPoolSize,
        candidatePoolSize: context.supply.candidatePoolSize,
        analyzedNotQualifiedSize: context.supply.analyzedNotQualifiedSize,
        dailyReadCount: context.demand.dailyReadCount,
        avgReadSpeed: context.demand.avgReadSpeed.toFixed(1),
        dismissRate: context.demand.dismissRate.toFixed(1),
        likeRate: context.demand.likeRate.toFixed(1),
        recommendationPoolSize: context.demand.recommendationPoolSize,
        recommendationPoolCapacity: context.demand.recommendationPoolCapacity,
        aiTokensUsedToday: context.system.aiTokensUsedToday,
        aiTokensBudgetDaily: context.system.aiTokensBudgetDaily,
        aiCostToday: context.system.aiCostToday.toFixed(4),
        analyzedArticlesToday: context.system.analyzedArticlesToday,
        recommendedArticlesToday: context.system.recommendedArticlesToday,
        last7DaysReadCount: context.history.last7DaysReadCount,
        last7DaysRecommendedCount: context.history.last7DaysRecommendedCount,
        last7DaysAnalyzedCount: context.history.last7DaysAnalyzedCount,
        onboardingComplete: context.userProfile.onboardingComplete ? '是' : '否',
        pageVisitCount: context.userProfile.pageVisitCount,
        profileConfidence: context.userProfile.profileConfidence.toFixed(2),
        timestamp
      }

      // 2. 使用 promptManager 获取提示词
      const prompts = promptManager.getStrategyDecisionPrompt('zh-CN', variables)

      // 3. 调用 AI 生成策略决策
      const fullPrompt = `${prompts.system}\n\n${prompts.user}`
      const response = await this.aiManager.decidePoolStrategy(fullPrompt, {
        maxTokens: 1000
      })

      if (!response) {
        throw new Error('AI 返回内容为空')
      }

      // 4. 解析 JSON 响应
      let jsonText = response.trim()
      
      // 移除可能的 markdown 代码块标记
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      const strategy = JSON.parse(jsonText) as RecommendationStrategy
      
      strategyLogger.info('AI 策略生成成功', {
        batchSize: strategy.analysis.batchSize,
        scoreThreshold: strategy.analysis.scoreThreshold,
        analysisInterval: strategy.scheduling.analysisIntervalMinutes,
        cooldown: strategy.recommendation.cooldownMinutes
      })

      return strategy
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      strategyLogger.error('调用 AI 生成策略失败', { 
        errorMessage,
        errorStack,
        errorType: error?.constructor?.name 
      })
      throw error
    }
  }

  /**
   * 验证和后处理策略参数
   * 确保所有值在合理范围内
   * @param strategy AI 输出的策略
   * @returns 验证后的策略
   */
  private validateStrategy(
    strategy: RecommendationStrategy
  ): RecommendationStrategy {
    strategyLogger.debug('验证策略参数...', strategy)

    const validated: RecommendationStrategy = {
      analysis: {
        batchSize: this.clamp(strategy.analysis.batchSize, 1, 20),
        scoreThreshold: this.clamp(strategy.analysis.scoreThreshold, 6.0, 8.5)
      },
      recommendation: {
        targetPoolSize: this.clamp(strategy.recommendation.targetPoolSize, 3, 10),
        refillThreshold: this.clamp(strategy.recommendation.refillThreshold, 1, 5),
        dailyLimit: this.clamp(strategy.recommendation.dailyLimit, 5, 30),
        cooldownMinutes: this.clamp(strategy.recommendation.cooldownMinutes, 30, 180)
      },
      scheduling: {
        analysisIntervalMinutes: this.clamp(strategy.scheduling.analysisIntervalMinutes, 1, 60),
        recommendIntervalMinutes: this.clamp(strategy.scheduling.recommendIntervalMinutes, 1, 60),
        loopIterations: this.clamp(strategy.scheduling.loopIterations, 1, 10)
      },
      candidatePool: {
        targetSize: this.clamp(strategy.candidatePool.targetSize, 10, 100),
        maxSize: this.clamp(strategy.candidatePool.maxSize, 20, 200),
        expiryHours: this.clamp(strategy.candidatePool.expiryHours, 24, 336)
      },
      meta: {
        validHours: this.clamp(strategy.meta.validHours, 12, 48),
        generatedAt: strategy.meta.generatedAt,
        version: strategy.meta.version || 'v1.0',
        nextReviewHours: this.clamp(strategy.meta.nextReviewHours, 6, 24)
      }
    }

    // 记录被修正的参数
    const corrections: string[] = []
    if (validated.analysis.batchSize !== strategy.analysis.batchSize) {
      corrections.push(`batchSize: ${strategy.analysis.batchSize} -> ${validated.analysis.batchSize}`)
    }
    if (validated.analysis.scoreThreshold !== strategy.analysis.scoreThreshold) {
      corrections.push(`scoreThreshold: ${strategy.analysis.scoreThreshold} -> ${validated.analysis.scoreThreshold}`)
    }
    if (validated.recommendation.cooldownMinutes !== strategy.recommendation.cooldownMinutes) {
      corrections.push(`cooldownMinutes: ${strategy.recommendation.cooldownMinutes} -> ${validated.recommendation.cooldownMinutes}`)
    }
    if (validated.scheduling.analysisIntervalMinutes !== strategy.scheduling.analysisIntervalMinutes) {
      corrections.push(`analysisIntervalMinutes: ${strategy.scheduling.analysisIntervalMinutes} -> ${validated.scheduling.analysisIntervalMinutes}`)
    }

    if (corrections.length > 0) {
      strategyLogger.warn('策略参数被修正', { corrections })
    } else {
      strategyLogger.debug('策略参数验证通过')
    }

    return validated
  }

  /**
   * 限制数值在指定范围内
   * @param value 值
   * @param min 最小值
   * @param max 最大值
   * @returns 限制后的值
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }
}
