/**
 * 补充调度器（RefillScheduler）
 * 
 * 职责：从候选池挑选文章补充到推荐池
 * 
 * 工作流程：
 * 1. 定时检查推荐池容量
 * 2. 从候选池挑选高分文章
 * 3. 写入 recommendations 表
 * 4. 根据显示模式设置，可选地写入阅读清单
 * 
 * 调度策略：
 * - 固定间隔：5 分钟检查一次
 * - 冷却期由策略控制（30-180 分钟）
 * - 每日补充上限由策略控制
 */

import { db } from '@/storage/db'
import { getRecommendationConfig } from '@/storage/recommendation-config'
import { getCurrentStrategy } from '@/storage/strategy-storage'
import { getRefillManager } from '@/core/recommender/pool-refill-policy'
import { ReadingListManager } from '@/core/reading-list/reading-list-manager'
import { getUIConfig } from '@/storage/ui-config'
import { logger } from '@/utils/logger'
import type { Recommendation } from '@/types/database'
import type { FeedArticle } from '@/types/rss'

const schedLogger = logger.withTag('RefillScheduler')

/**
 * 补充调度器配置
 */
export interface RefillSchedulerConfig {
  /** 检查间隔（分钟） */
  checkIntervalMinutes: number
}

const DEFAULT_CONFIG: RefillSchedulerConfig = {
  checkIntervalMinutes: 5
}

/**
 * 补充调度器
 */
export class RefillScheduler {
  private config: RefillSchedulerConfig
  private alarmName = 'refill-recommendation-pool'
  private isRunning = false
  private isRefilling = false
  public nextRunTime: number | null = null

  constructor(config: Partial<RefillSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      schedLogger.warn('补充调度器已在运行')
      return
    }

    schedLogger.info('启动补充调度器...')
    
    try {
      // 注册 Alarm 监听器
      chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this))
      
      // 立即执行一次
      await this.runRefill()
      
      // 设置定时任务
      await this.scheduleNext()
      
      this.isRunning = true
      schedLogger.info('✅ 补充调度器已启动')
    } catch (error) {
      schedLogger.error('❌ 启动补充调度器失败:', error)
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

    schedLogger.info('停止补充调度器...')
    
    try {
      await chrome.alarms.clear(this.alarmName)
      this.isRunning = false
      this.nextRunTime = null
      schedLogger.info('✅ 补充调度器已停止')
    } catch (error) {
      schedLogger.error('❌ 停止补充调度器失败:', error)
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
    await this.runRefill()
    await this.scheduleNext()
  }

  /**
   * 执行推荐池补充
   */
  private async runRefill(): Promise<void> {
    if (this.isRefilling) {
      schedLogger.debug('补充正在进行中，跳过本次执行')
      return
    }

    this.isRefilling = true
    const startTime = Date.now()

    try {
      schedLogger.info('开始推荐池补充...')

      // 1. 获取策略配置
      const strategy = await getCurrentStrategy()
      if (!strategy) {
        schedLogger.warn('⚠️ 策略未配置，跳过补充')
        return
      }

      const targetPoolSize = strategy.strategy.recommendation.targetPoolSize
      const qualityThreshold = strategy.strategy.candidatePool.entryThreshold

      // 2. 检查当前推荐池状态
      const currentPool = await db.recommendations
        .filter(r => {
          const isActive = !r.status || r.status === 'active'
          const isUnread = !r.isRead
          return isActive && isUnread
        })
        .toArray()

      const currentPoolSize = currentPool.length
      schedLogger.debug(`📊 推荐池状态: ${currentPoolSize}/${targetPoolSize}`)

      // 3. 检查是否允许补充（冷却期、每日限额、容量阈值）
      const refillManager = getRefillManager()
      const shouldRefill = await refillManager.shouldRefill(currentPoolSize, targetPoolSize)
      
      if (!shouldRefill) {
        schedLogger.info(`⏸️ 补充受限：不满足补充条件 (${currentPoolSize}/${targetPoolSize})`)
        return
      }

      // 4. 从候选池获取高分文章
      const remainingCapacity = targetPoolSize - currentPoolSize
      const candidates = await this.getCandidateArticles(remainingCapacity, qualityThreshold)

      if (candidates.length === 0) {
        schedLogger.info('📭 候选池为空或无合适文章，跳过本次补充')
        return
      }

      schedLogger.info(`📦 从候选池选取 ${candidates.length} 篇文章`)

      // 5. 创建推荐记录
      const recommendations = await this.createRecommendations(candidates)
      
      // 6. 记录补充操作
      await refillManager.recordRefill()

      // 7. 根据显示模式决定是否写入阅读清单
      await this.handleDisplayMode(recommendations)

      // 8. 图标会在下次 updateBadge() 调用时自动更新（无需手动触发）

      const duration = Date.now() - startTime
      schedLogger.info(`✅ 推荐池补充完成`, {
        '补充数量': recommendations.length,
        '当前池容量': `${currentPoolSize + recommendations.length}/${targetPoolSize}`,
        '耗时': `${duration}ms`
      })

    } catch (error) {
      schedLogger.error('❌ 推荐池补充失败:', error)
    } finally {
      this.isRefilling = false
    }
  }

  /**
   * 从候选池获取文章
   */
  private async getCandidateArticles(limit: number, threshold: number): Promise<FeedArticle[]> {
    try {
      const candidates = await db.feedArticles
        .filter(a => {
          // 必须是候选池文章
          if (a.poolStatus !== 'candidate') return false
          // 必须还在源中
          if (a.inFeed === false) return false
          // 必须有评分且达到阈值
          if (!a.analysisScore || a.analysisScore < threshold) return false
          return true
        })
        .toArray()

      // 按评分降序排序，取前 N 篇
      const sorted = candidates.sort((a, b) => 
        (b.analysisScore || 0) - (a.analysisScore || 0)
      )

      return sorted.slice(0, limit)
    } catch (error) {
      schedLogger.error('获取候选文章失败:', error)
      return []
    }
  }

  /**
   * 创建推荐记录
   */
  private async createRecommendations(articles: FeedArticle[]): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = []
    const now = Date.now()

    for (const article of articles) {
      const recommendation: Recommendation = {
        id: `rec-${article.id}-${now}`,
        url: article.link,
        title: article.title,
        summary: article.description || '',
        source: article.feedId || 'unknown',
        sourceUrl: article.link,
        recommendedAt: now,
        score: article.analysisScore || 0,
        isRead: false,
        status: 'active'
      }

      // 保存到数据库
      await db.recommendations.add(recommendation)
      
      // 更新文章状态
      await db.feedArticles.update(article.id, {
        poolStatus: 'recommended',
        recommendedPoolAddedAt: now
      })

      recommendations.push(recommendation)
    }

    return recommendations
  }

  /**
   * 根据显示模式处理推荐
   */
  private async handleDisplayMode(recommendations: Recommendation[]): Promise<void> {
    try {
      const config = await getRecommendationConfig()
      const displayMode = config.deliveryMode || 'popup'

      schedLogger.debug(`显示模式: ${displayMode}`)

      if (displayMode === 'readingList') {
        // 写入阅读清单
        for (const rec of recommendations) {
          await ReadingListManager.addToReadingList(
            rec.title,
            rec.url,
            rec.isRead
          )
        }

        schedLogger.info(`✅ 已将 ${recommendations.length} 条推荐写入阅读清单`)
      } else {
        schedLogger.debug('弹窗模式，无需写入阅读清单')
      }
    } catch (error) {
      schedLogger.warn('处理显示模式失败:', error)
      // 不抛出错误，显示模式处理失败不影响推荐生成
    }
  }

  /**
   * 调度下次执行
   */
  private async scheduleNext(): Promise<void> {
    try {
      const intervalMinutes = this.config.checkIntervalMinutes
      this.nextRunTime = Date.now() + intervalMinutes * 60 * 1000

      await chrome.alarms.create(this.alarmName, {
        delayInMinutes: intervalMinutes
      })

      schedLogger.debug(`📅 下次补充检查: ${intervalMinutes} 分钟后`)
    } catch (error) {
      schedLogger.error('调度下次补充失败:', error)
    }
  }

  /**
   * 更新策略配置
   */
  async updateStrategy(strategy: any): Promise<void> {
    schedLogger.info('更新补充调度器策略', {
      targetPoolSize: strategy.strategy.recommendation.targetPoolSize,
      cooldownMinutes: strategy.strategy.recommendation.cooldownMinutes,
      dailyLimit: strategy.strategy.recommendation.dailyLimit
    })

    // 更新 PoolRefillManager 的策略
    const refillManager = getRefillManager()
    refillManager.updatePolicy({
      minInterval: strategy.strategy.recommendation.cooldownMinutes * 60 * 1000,
      maxDailyRefills: strategy.strategy.recommendation.dailyLimit
    })

    schedLogger.info('✅ 补充调度器策略已更新')

    // 如果正在运行，重新启动以应用新配置
    if (this.isRunning) {
      schedLogger.info('重新启动调度器以应用新策略...')
      await this.stop()
      await this.start()
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isRefilling: this.isRefilling,
      nextRunTime: this.nextRunTime,
      config: this.config
    }
  }

  /**
   * 手动触发补充
   */
  async triggerManual(): Promise<void> {
    schedLogger.info('手动触发推荐池补充...')
    await this.runRefill()
  }
}

// 导出单例
export const refillScheduler = new RefillScheduler()
