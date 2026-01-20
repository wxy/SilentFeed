/**
 * 分析调度器（AnalysisScheduler）
 * 
 * 职责：AI 从原始文章挑选进入候选池
 * 
 * 工作流程：
 * 1. 定时扫描原始文章池（poolStatus='raw'）
 * 2. 调用 AI 进行分析和评分
 * 3. 根据评分标记文章状态：
 *    - ≥ 阈值 → candidate（候选池）
 *    - < 阈值 → analyzed-not-qualified（不合格）
 * 
 * 调度策略：
 * - 动态间隔：1-10 分钟
 * - 根据原始文章积压量调整
 * - 原始文章 ≥ 50 → 1 分钟
 * - 原始文章 20-49 → 3 分钟
 * - 原始文章 10-19 → 5 分钟
 * - 原始文章 1-9 → 10 分钟
 * - 原始文章 0 → 20 分钟
 */

import { db } from '@/storage/db'
import { RecommendationPipelineImpl } from '@/core/recommender/pipeline'
import { getUserProfile } from '@/storage/db'
import { getRecommendationConfig } from '@/storage/recommendation-config'
import { getAIConfig } from '@/storage/ai-config'
import { resolveProvider } from '@/utils/ai-provider-resolver'
import { FeedManager } from '@/core/rss/managers/FeedManager'
import { logger } from '@/utils/logger'
import { getCurrentStrategy } from '@/storage/strategy-storage'
import type { UserProfile } from '@/types/profile'
import type { FeedArticle } from '@/types/rss'
import type { RecommendationInput } from '@/types/recommendation'

const schedLogger = logger.withTag('AnalysisScheduler')

/**
 * 分析调度器配置
 */
export interface AnalysisSchedulerConfig {
  /** 最小间隔（分钟） */
  minIntervalMinutes: number
  /** 最大间隔（分钟） */
  maxIntervalMinutes: number
  /** 每次分析的文章数量 */
  batchSize: number
}

const DEFAULT_CONFIG: AnalysisSchedulerConfig = {
  minIntervalMinutes: 1,
  maxIntervalMinutes: 20,
  batchSize: 10
}

/**
 * 分析调度器
 */
export class AnalysisScheduler {
  private config: AnalysisSchedulerConfig
  private alarmName = 'analyze-articles'
  private isRunning = false
  private isAnalyzing = false
  private adjustedInterval: number | null = null
  public nextRunTime: number | null = null
  private pipeline: RecommendationPipelineImpl

  constructor(config: Partial<AnalysisSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.pipeline = new RecommendationPipelineImpl()
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      schedLogger.warn('分析调度器已在运行')
      return
    }

    schedLogger.info('启动分析调度器...')
    
    try {
      // 注册 Alarm 监听器
      chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this))
      
      // 立即执行一次
      await this.runAnalysis()
      
      // 设置定时任务
      await this.scheduleNext()
      
      this.isRunning = true
      schedLogger.info('✅ 分析调度器已启动')
    } catch (error) {
      schedLogger.error('❌ 启动分析调度器失败:', error)
      throw error
    }
  }

  /**
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    schedLogger.info('停止分析调度器...')
    
    try {
      await chrome.alarms.clear(this.alarmName)
      this.isRunning = false
      this.nextRunTime = null
      schedLogger.info('✅ 分析调度器已停止')
    } catch (error) {
      schedLogger.error('❌ 停止分析调度器失败:', error)
    }
  }

  /**
   * 处理 Alarm 触发
   */
  private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== this.alarmName) {
      return
    }

    schedLogger.debug(`Alarm 触发: ${alarm.name}`)
    await this.runAnalysis()
    await this.scheduleNext()
  }

  /**
   * 执行文章分析
   */
  private async runAnalysis(): Promise<void> {
    if (this.isAnalyzing) {
      schedLogger.debug('分析正在进行中，跳过本次执行')
      return
    }

    this.isAnalyzing = true
    const startTime = Date.now()

    try {
      schedLogger.info('开始分析原始文章...')

      // 1. 获取原始文章（每次只取一篇，避免长时间阻塞）
      const rawArticles = await this.getRawArticles()
      
      if (rawArticles.length === 0) {
        schedLogger.info('📭 没有需要分析的原始文章')
        return
      }

      // 只分析第一篇文章
      const article = rawArticles[0]
      schedLogger.info(`📦 准备分析文章: ${article.title?.substring(0, 50)}...`)

      // 2. 获取用户画像
      const userProfile = await getUserProfile()
      if (!userProfile) {
        schedLogger.warn('⚠️ 用户画像未建立，跳过分析')
        return
      }

      // 3. 获取配置
      const recommendationConfig = await getRecommendationConfig()
      const aiConfig = await getAIConfig()
      const strategy = await getCurrentStrategy()
      
      if (!strategy) {
        schedLogger.warn('⚠️ 策略未配置，跳过分析')
        return
      }

      // 4. 获取 Feed 列表（用于冷启动判断）
      const feedManager = new FeedManager()
      const feeds = await feedManager.getFeeds()

      // 5. 准备分析输入
      const input: RecommendationInput = {
        articles: rawArticles,
        userProfile,
        config: {
          ...recommendationConfig,
          qualityThreshold: strategy.strategy.candidatePool.entryThreshold
        },
        options: {
          maxArticles: rawArticles.length
        }
      }

      // 6. 执行 AI 分析（单篇）
      schedLogger.info(`🤖 开始 AI 分析...`)
      
      const threshold = strategy.strategy.candidatePool.entryThreshold

      // 准备用户兴趣（用于评分）
      const userInterests = {
        keywords: userProfile.keywords
      }

      // 初始化 AI 管理器
      const { aiManager } = await import('@/core/ai/AICapabilityManager')
      await aiManager.initialize()

      try {
        // 准备内容
        const content = article.content || article.description || article.title || ''
        if (!content.trim()) {
          schedLogger.warn(`文章内容为空，标记为失败: ${article.title}`)
          await db.feedArticles.update(article.id, {
            poolStatus: 'analyzed-not-qualified',
            poolExitedAt: Date.now(),
            poolExitReason: 'empty-content'
          })
          return
        }

        // 调用 AI 分析
        const analysis = await aiManager.analyzeContent(content, {
          userProfile: userProfile.aiSummary ? {
            interests: userProfile.aiSummary.interests,
            preferences: userProfile.aiSummary.preferences,
            avoidTopics: userProfile.aiSummary.avoidTopics
          } : undefined,
          purpose: 'recommend-content'
        }, 'articleAnalysis')

        // 计算相关性评分（根据主题匹配用户兴趣）
        let relevanceScore = 0
        const topics = analysis.topicProbabilities || {}
        
        for (const [topic, probability] of Object.entries(topics)) {
          const prob = probability as number
          if (prob > 0.2) {
            // 查找匹配的用户兴趣
            const matchingInterests = userInterests.keywords.filter(k => 
              topic.includes(k.word) || k.word.includes(topic)
            )
            
            if (matchingInterests.length > 0) {
              const maxWeight = Math.max(...matchingInterests.map(i => i.weight))
              relevanceScore += prob * maxWeight
            }
          }
        }

        // 归一化评分
        const totalProbability = Object.values(topics).reduce((sum: number, p) => sum + (p as number), 0)
        if (totalProbability > 0) {
          relevanceScore = Math.min(1.0, relevanceScore / totalProbability)
        } else {
          relevanceScore = 0.3 // 默认分数
        }

        // 保存分析结果
        await db.feedArticles.update(article.id, {
          analysis,
          analysisScore: relevanceScore
        })

        // 根据评分更新池状态
        const duration = Date.now() - startTime
        if (relevanceScore >= threshold) {
          await db.feedArticles.update(article.id, {
            poolStatus: 'candidate',
            poolEnteredAt: Date.now()
          })
          schedLogger.info(`✅ 进入候选池: ${article.title?.substring(0, 40)}... (评分: ${relevanceScore.toFixed(2)}, 耗时: ${duration}ms)`)
        } else {
          await db.feedArticles.update(article.id, {
            poolStatus: 'analyzed-not-qualified',
            poolExitedAt: Date.now(),
            poolExitReason: 'below-threshold'
          })
          schedLogger.info(`❌ 未达标: ${article.title?.substring(0, 40)}... (评分: ${relevanceScore.toFixed(2)}, 阈值: ${threshold}, 耗时: ${duration}ms)`)
        }

      } catch (error) {
        // 提取详细错误信息
        const errorDetails = {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          type: typeof error,
          raw: error
        }
        schedLogger.error(`❌ 分析失败: ${article.title}`, errorDetails)
        
        // 标记为失败，下次重试
        try {
          await db.feedArticles.update(article.id, {
            poolStatus: 'raw'  // 保持 raw 状态，下次继续尝试
          })
        } catch (updateError) {
          schedLogger.error('更新文章状态失败:', updateError)
        }
      }

    } catch (error) {
      const errorDetails = {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
      schedLogger.error('❌ 分析文章失败:', errorDetails)
    } finally {
      this.isAnalyzing = false
    }
  }

  /**
   * 获取原始文章
   */
  private async getRawArticles(): Promise<FeedArticle[]> {
    try {
      const articles = await db.feedArticles
        .filter(a => {
          // 只处理原始文章
          if (a.poolStatus !== 'raw') return false
          // 必须还在源中
          if (a.inFeed === false) return false
          // 跳过已删除
          if (a.deleted) return false
          return true
        })
        .limit(this.config.batchSize)
        .toArray()

      return articles
    } catch (error) {
      schedLogger.error('获取原始文章失败:', error)
      return []
    }
  }

  /**
   * 调度下次执行
   */
  private async scheduleNext(): Promise<void> {
    try {
      // 计算动态间隔
      const rawCount = await db.feedArticles
        .filter(a => a.poolStatus === 'raw' && a.inFeed !== false && !a.deleted)
        .count()

      let intervalMinutes: number
      if (rawCount >= 50) {
        intervalMinutes = 1
      } else if (rawCount >= 20) {
        intervalMinutes = 3
      } else if (rawCount >= 10) {
        intervalMinutes = 5
      } else if (rawCount >= 1) {
        intervalMinutes = 10
      } else {
        intervalMinutes = 20
      }

      this.adjustedInterval = intervalMinutes
      this.nextRunTime = Date.now() + intervalMinutes * 60 * 1000

      await chrome.alarms.create(this.alarmName, {
        delayInMinutes: intervalMinutes
      })

      schedLogger.debug(`📅 下次分析: ${intervalMinutes} 分钟后（原始文章: ${rawCount} 篇）`)
    } catch (error) {
      schedLogger.error('调度下次分析失败:', error)
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isAnalyzing: this.isAnalyzing,
      adjustedInterval: this.adjustedInterval,
      nextRunTime: this.nextRunTime,
      config: this.config
    }
  }

  /**
   * 更新策略配置
   */
  async updateStrategy(strategy: any): Promise<void> {
    schedLogger.info('更新分析调度器策略', {
      entryThreshold: strategy.strategy.candidatePool.entryThreshold,
      targetPoolSize: strategy.strategy.recommendation.targetPoolSize
    })

    // 分析调度器主要受候选池阈值影响，不需要修改配置
    // 策略会在 runAnalysis 时实时读取

    schedLogger.info('✅ 分析调度器策略已更新')
  }

  /**
   * 手动触发分析
   */
  async triggerManual(): Promise<void> {
    schedLogger.info('手动触发文章分析...')
    await this.runAnalysis()
  }
}

// 导出单例
export const analysisScheduler = new AnalysisScheduler()
