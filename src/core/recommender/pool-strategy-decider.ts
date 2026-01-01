/**
 * AI 推荐池策略决策器
 * 
 * 每天根据用户的 RSS 阅读情况，使用 AI 决策最优的推荐池策略
 * - 推荐池容量
 * - 补充间隔
 * - 每日补充次数上限
 * - 触发阈值
 */

import { logger } from '@/utils/logger'
import { db } from '@/storage/db'
import type { PoolRefillPolicy } from './pool-refill-policy'
import { aiManager } from '../ai/AICapabilityManager'
import { PromptManager, type SupportedLanguage } from '../ai/prompts'
import { getAIConfig } from '@/storage/ai-config'
import { getSystemStats } from '@/storage/system-stats'

const deciderLogger = logger.withTag('PoolStrategyDecider')

/**
 * 每日使用情况上下文
 */
export interface DailyUsageContext {
  /** 订阅源情况 */
  feeds: {
    totalCount: number
    avgUpdateFrequency: number  // 小时
    avgBatchSize: number
    activeFeeds: number         // 最近7天有更新的源
  }
  
  /** 文章情况 */
  articles: {
    unreadCount: number
    dailyAverage: number        // 最近7天平均
    yesterdayCount: number
  }
  
  /** 用户行为（昨天） */
  userBehavior: {
    recommendationsShown: number
    clicked: number
    dismissed: number
    saved: number
    avgReadTime: number         // 秒
    peakUsageHour: number       // 用户最活跃的时段
  }
  
  /** 当前配置 */
  currentPolicy: {
    poolSize: number
    refillInterval: number      // 分钟
    maxDailyRefills: number
  }
}

/**
 * AI 决策结果
 */
export interface AIPoolDecision extends PoolRefillPolicy {
  /** 建议的池容量 */
  poolSize: number
  /** 决策理由 */
  reasoning: string
  /** 决策置信度 0-1 */
  confidence: number
}

/**
 * AI 推荐池策略决策器
 */
export class AIPoolStrategyDecider {
  private cachedDecision: AIPoolDecision | null = null
  private lastDecisionDate: string = ''
  private promptManager: PromptManager
  
  constructor() {
    this.promptManager = new PromptManager()
  }
  
  /**
   * 决策今日推荐池策略
   * 
   * @param context - 使用情况上下文
   * @returns AI 决策结果
   */
  async decideDailyStrategy(context: DailyUsageContext): Promise<AIPoolDecision> {
    const today = this.getTodayString()
    
    // 检查是否已有今日决策
    if (this.cachedDecision && this.lastDecisionDate === today) {
      deciderLogger.debug('使用今日缓存的 AI 决策')
      return this.cachedDecision
    }
    
    // 调用 AI 进行决策
    deciderLogger.info('🤖 调用 AI 决策今日推荐池策略')
    
    try {
      const decision = await this.callAIDecider(context)
      
      // 缓存决策结果
      this.cachedDecision = decision
      this.lastDecisionDate = today
      
      // 保存到存储
      await chrome.storage.local.set({
        'pool_strategy_decision': {
          date: today,
          decision,
          context
        }
      })
      
      deciderLogger.info('✅ AI 决策完成', {
        poolSize: decision.poolSize,
        refillInterval: decision.minInterval / 1000 / 60,
        maxDailyRefills: decision.maxDailyRefills,
        reasoning: decision.reasoning,
        confidence: decision.confidence
      })
      
      return decision
      
    } catch (error) {
      deciderLogger.error('AI 决策失败，使用降级策略', error)
      return this.getFallbackDecision(context)
    }
  }
  
  /**
   * 获取今日缓存的决策（如果有）
   */
  async getCachedDecision(): Promise<AIPoolDecision | null> {
    const today = this.getTodayString()
    
    // 内存缓存优先
    if (this.cachedDecision && this.lastDecisionDate === today) {
      return this.cachedDecision
    }
    
    // 从存储加载
    try {
      const result = await chrome.storage.local.get('pool_strategy_decision')
      const stored = result.pool_strategy_decision
      
      if (stored && stored.date === today) {
        this.cachedDecision = stored.decision
        this.lastDecisionDate = today
        deciderLogger.debug('从存储加载今日决策')
        return stored.decision
      }
    } catch (error) {
      deciderLogger.warn('加载缓存决策失败', error)
    }
    
    return null
  }
  
  /**
   * 清除缓存（用于测试或强制重新决策）
   */
  async clearCache(): Promise<void> {
    this.cachedDecision = null
    this.lastDecisionDate = ''
    await chrome.storage.local.remove('pool_strategy_decision')
    deciderLogger.info('已清除决策缓存')
  }
  
  // ========== 私有方法 ==========
  
  private async callAIDecider(context: DailyUsageContext): Promise<AIPoolDecision> {
    // 获取 AI 配置
    const aiConfig = await getAIConfig()
    
    // 检查是否有任何可用的 AI Provider（不管 engineAssignment 配置）
    const hasRemoteProvider = Object.values(aiConfig.providers || {}).some(p => p && p.apiKey && p.model)
    const hasLocalProvider = aiConfig.local?.enabled && aiConfig.local?.endpoint && aiConfig.local?.model
    
    if (!hasRemoteProvider && !hasLocalProvider) {
      // 完全没有 AI 配置，使用基于规则的决策
      deciderLogger.info('没有配置任何 AI Provider，使用基于规则的决策')
      return this.getRuleBasedDecision(context)
    }
    
    // 使用低频任务配置（池策略决策属于低频任务）
    // 兼容旧配置：如果没有 lowFrequencyTasks，尝试使用 profileGeneration
    const lowFreqConfig = aiConfig.engineAssignment?.lowFrequencyTasks || 
                          aiConfig.engineAssignment?.profileGeneration
    
    if (!lowFreqConfig?.provider) {
      // 如果低频任务未配置，但有 provider，则使用首选 provider
      deciderLogger.info('低频任务未配置，使用基于规则的决策')
      return this.getRuleBasedDecision(context)
    }
    
    // 获取提示词模板
    const templates = this.promptManager.getTemplates('zh-CN')
    const promptTemplate = templates.poolStrategyDecision
    
    if (!promptTemplate) {
      throw new Error('推荐池策略决策提示词模板不存在')
    }
    
    // 构建提示词变量
    const variables: Record<string, string> = {
      feedCount: context.feeds.totalCount.toString(),
      activeFeeds: context.feeds.activeFeeds.toString(),
      avgUpdateFrequency: context.feeds.avgUpdateFrequency.toFixed(1),
      avgBatchSize: context.feeds.avgBatchSize.toFixed(0),
      unreadCount: context.articles.unreadCount.toString(),
      dailyAverage: context.articles.dailyAverage.toFixed(0),
      yesterdayCount: context.articles.yesterdayCount.toString(),
      recommendationsShown: context.userBehavior.recommendationsShown.toString(),
      clicked: context.userBehavior.clicked.toString(),
      dismissed: context.userBehavior.dismissed.toString(),
      saved: context.userBehavior.saved.toString(),
      avgReadTime: Math.round(context.userBehavior.avgReadTime).toString(),
      peakUsageHour: context.userBehavior.peakUsageHour.toString(),
      currentPoolSize: context.currentPolicy.poolSize.toString(),
      currentRefillInterval: context.currentPolicy.refillInterval.toString(),
      currentMaxDailyRefills: context.currentPolicy.maxDailyRefills.toString()
    }
    
    // 手动替换变量
    let prompt = promptTemplate.user
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }
    
    deciderLogger.debug('AI 决策提示词已生成', {
      promptLength: prompt.length
    })
    
    // 使用专门的推荐池策略决策方法（使用默认 60s 超时）
    const responseText = await aiManager.decidePoolStrategy(prompt, {
      maxTokens: 500
    })
    
    deciderLogger.debug('AI 原始响应文本', { text: responseText.substring(0, 300) })
    
    // 解析 AI 响应
    const decision = this.parseAIResponse(responseText)
    
    // 验证决策合理性
    return this.validateDecision(decision)
  }
  
  private parseAIResponse(responseText: string): AIPoolDecision {
    // responseText 是 AI 返回的原始文本
    deciderLogger.debug('准备解析的文本', { text: responseText.substring(0, 300) })
    
    // 提取 JSON（尝试多种格式）
    let jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                    responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                    responseText.match(/\{[\s\S]*\}/)
    
    // 如果还是找不到，尝试在整个文本中搜索 JSON 关键字段
    if (!jsonMatch) {
      const keywordMatch = responseText.match(/poolSize[\s\S]*triggerThreshold/)
      if (keywordMatch) {
        // 找到了关键字段，尝试提取包含它们的 JSON 对象
        const startIdx = responseText.indexOf('{', Math.max(0, responseText.indexOf('poolSize') - 50))
        const endIdx = responseText.lastIndexOf('}') + 1
        if (startIdx >= 0 && endIdx > startIdx) {
          jsonMatch = [responseText.substring(startIdx, endIdx)]
        }
      }
    }
    
    if (!jsonMatch) {
      deciderLogger.error('无法解析 AI 响应：未找到 JSON', { 
        response: responseText.substring(0, 500)
      })
      throw new Error('无法解析 AI 响应：未找到 JSON')
    }
    
    const extractedJson = jsonMatch[1] || jsonMatch[0]
    deciderLogger.debug('提取的 JSON', { json: extractedJson })
    
    try {
      const parsed = JSON.parse(extractedJson)
      
      // 转换为 AIPoolDecision 格式
      return {
        poolSize: parsed.poolSize,
        minInterval: parsed.refillInterval * 60 * 1000, // 分钟 → 毫秒
        maxDailyRefills: parsed.maxDailyRefills,
        triggerThreshold: parsed.triggerThreshold,
        reasoning: parsed.reasoning || '',
        confidence: parsed.confidence || 0.5
      }
    } catch (error) {
      deciderLogger.error('JSON 解析失败', { json: extractedJson, error })
      throw new Error(`无法解析 JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  private validateDecision(decision: AIPoolDecision): AIPoolDecision {
    // 验证并修正边界值
    return {
      poolSize: Math.max(3, Math.min(20, decision.poolSize)),
      minInterval: Math.max(15 * 60 * 1000, Math.min(120 * 60 * 1000, decision.minInterval)),
      maxDailyRefills: Math.max(3, Math.min(10, decision.maxDailyRefills)),
      triggerThreshold: Math.max(0.2, Math.min(0.5, decision.triggerThreshold)),
      reasoning: decision.reasoning,
      confidence: Math.max(0, Math.min(1, decision.confidence))
    }
  }
  
  private getFallbackDecision(context: DailyUsageContext): AIPoolDecision {
    // 降级策略：基于简单规则
    const dailyArticles = context.articles.dailyAverage
    
    let poolSize = 6
    let refillInterval = 45 * 60 * 1000 // 45分钟
    let maxDailyRefills = 5
    
    if (dailyArticles < 30) {
      // 轻度用户
      poolSize = 4
      refillInterval = 60 * 60 * 1000 // 60分钟
      maxDailyRefills = 3
    } else if (dailyArticles > 200) {
      // 重度用户
      poolSize = 12
      refillInterval = 30 * 60 * 1000 // 30分钟
      maxDailyRefills = 8
    }
    
    return {
      poolSize,
      minInterval: refillInterval,
      maxDailyRefills,
      triggerThreshold: 0.3,
      reasoning: 'AI 服务不可用，使用基于规则的降级策略',
      confidence: 0.6
    }
  }
  
  /**
   * 基于规则的决策（当完全没有 AI 配置时使用）
   */
  private getRuleBasedDecision(context: DailyUsageContext): AIPoolDecision {
    const { feeds, articles, userBehavior } = context
    
    // 计算点击率和不想读率
    const clickRate = userBehavior.recommendationsShown > 0 
      ? userBehavior.clicked / userBehavior.recommendationsShown 
      : 0.2
    const dismissRate = userBehavior.recommendationsShown > 0
      ? userBehavior.dismissed / userBehavior.recommendationsShown
      : 0.1
    
    // 基础池大小
    let poolSize = 6
    
    // 根据订阅源数量调整
    if (feeds.totalCount <= 5) {
      poolSize = 4  // 订阅少，推荐少一点
    } else if (feeds.totalCount >= 15) {
      poolSize = 10 // 订阅多，推荐多一点
    }
    
    // 根据用户行为微调
    if (clickRate > 0.3) {
      poolSize += 2  // 高点击率，增加推荐
    }
    if (dismissRate > 0.5) {
      poolSize = Math.max(3, poolSize - 2)  // 高不想读率，减少推荐
    }
    
    // 补充间隔：根据文章产出速度
    let refillInterval = 45 * 60 * 1000 // 默认 45 分钟
    if (articles.dailyAverage < 30) {
      refillInterval = 60 * 60 * 1000 // 文章少，60 分钟补充一次
    } else if (articles.dailyAverage > 100) {
      refillInterval = 30 * 60 * 1000 // 文章多，30 分钟补充一次
    }
    
    // 每日补充次数
    const maxDailyRefills = Math.max(3, Math.min(8, Math.ceil(24 * 60 / (refillInterval / 1000 / 60) * 0.6)))
    
    return {
      poolSize: Math.max(3, Math.min(15, poolSize)),
      minInterval: refillInterval,
      maxDailyRefills,
      triggerThreshold: 0.3,
      reasoning: '基于规则的智能决策：根据订阅源数量、文章产出和用户行为综合计算',
      confidence: 0.7
    }
  }
  
  private getTodayString(): string {
    const now = new Date()
    return now.toISOString().split('T')[0] // YYYY-MM-DD
  }
}

/**
 * 收集每日使用情况上下文
 * 
 * 从 chrome.storage.local 读取已维护的统计数据，避免实时查询数据库
 */
export async function collectDailyUsageContext(): Promise<DailyUsageContext> {
  try {
    // 从 SystemStats 读取统计数据（静态导入）
    const stats = await getSystemStats()
    
    if (!stats) {
      deciderLogger.warn('系统统计不可用，返回默认值')
      return getDefaultContext()
    }
    
    // 🔥 订阅源信息：只统计数量，不加载完整对象
    const subscribedCount = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .count()
    
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    
    // 🔥 活跃订阅源：只统计数量
    const activeFeedsCount = await db.discoveredFeeds
      .where('status')
      .equals('subscribed')
      .and(feed => feed.lastFetchedAt != null && feed.lastFetchedAt > sevenDaysAgo)
      .count()
    
    // 🔥 使用固定估算值，避免加载所有订阅源数据
    // 平均更新频率：24小时（保守估计）
    // 批量大小：10篇/天（经验值）
    const avgUpdateFrequency = 24
    const avgBatchSize = 10
    
    return {
      feeds: {
        totalCount: subscribedCount,
        avgUpdateFrequency,
        avgBatchSize,
        activeFeeds: activeFeedsCount
      },
      articles: {
        unreadCount: stats.articles.unreadCount,
        dailyAverage: stats.articles.dailyAverage,
        yesterdayCount: stats.articles.yesterdayCount
      },
      userBehavior: {
        recommendationsShown: stats.userBehavior.recommendationsShown,
        clicked: stats.userBehavior.clicked,
        dismissed: stats.userBehavior.dismissed,
        saved: stats.userBehavior.saved,
        avgReadTime: stats.userBehavior.avgReadTime,
        peakUsageHour: stats.userBehavior.peakUsageHour
      },
      currentPolicy: {
        poolSize: 6, // 从实际配置读取
        refillInterval: 45,
        maxDailyRefills: 5
      }
    }
  } catch (error) {
    deciderLogger.error('收集使用情况上下文失败，返回默认值', error)
    return getDefaultContext()
  }
}

/**
 * 返回默认上下文（统计不可用时）
 */
function getDefaultContext(): DailyUsageContext {
  return {
    feeds: {
      totalCount: 0,
      avgUpdateFrequency: 24,
      avgBatchSize: 10,
      activeFeeds: 0
    },
    articles: {
      unreadCount: 0,
      dailyAverage: 0,
      yesterdayCount: 0
    },
    userBehavior: {
      recommendationsShown: 0,
      clicked: 0,
      dismissed: 0,
      saved: 0,
      avgReadTime: 0,
      peakUsageHour: 9
    },
    currentPolicy: {
      poolSize: 6,
      refillInterval: 45,
      maxDailyRefills: 5
    }
  }
}

/**
 * 全局单例
 */
let globalDecider: AIPoolStrategyDecider | null = null

/**
 * 获取全局决策器实例
 */
export function getStrategyDecider(): AIPoolStrategyDecider {
  if (!globalDecider) {
    globalDecider = new AIPoolStrategyDecider()
  }
  return globalDecider
}
