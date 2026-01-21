/**
 * 补充调度器（RefillScheduler）
 * 
 * 职责：从候选池挑选文章补充到弹窗推荐
 * 
 * 工作流程：
 * 1. 定时检查弹窗推荐容量
 * 2. 从候选池挑选高分文章
 * 3. 更新 feedArticles 表的 poolStatus 为 'popup'
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

      // 1.5. 清理超出容量的推荐（退回候选池）
      await this.cleanupExcessRecommendations(targetPoolSize)

      // 2. 检查当前弹窗推荐状态
      const currentPool = await db.feedArticles
        .filter(a => {
          const isPopup = a.poolStatus === 'recommended'
          const isUnread = !a.isRead
          const notDismissed = a.feedback !== 'dismissed'
          return isPopup && isUnread && notDismissed
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

      // 7. 根据当前显示模式，立即处理阅读清单
      const config = await getRecommendationConfig()
      if (config.deliveryMode === 'readingList') {
        await this.writeToReadingList(recommendations)
      }

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
   * 清理超出容量的推荐（退回候选池）
   * 
   * 策略：保留高分推荐，将低分推荐退回候选池
   */
  private async cleanupExcessRecommendations(targetPoolSize: number): Promise<void> {
    try {
      // 获取当前所有推荐池文章（包括已读和未读）
      const allPopupArticles = await db.feedArticles
        .filter(a => a.poolStatus === 'recommended')
        .toArray()

      if (allPopupArticles.length <= targetPoolSize) {
        schedLogger.debug(`推荐池大小正常: ${allPopupArticles.length}/${targetPoolSize}`)
        return
      }

      schedLogger.warn(`⚠️ 推荐池超出容量: ${allPopupArticles.length}/${targetPoolSize}，开始清理...`)

      // 按评分降序排序
      const sorted = allPopupArticles.sort((a, b) => 
        (b.analysisScore || 0) - (a.analysisScore || 0)
      )

      // 保留高分的 targetPoolSize 篇，其余退回候选池
      const toKeep = sorted.slice(0, targetPoolSize)
      const toMoveBack = sorted.slice(targetPoolSize)

      const now = Date.now()
      let movedCount = 0

      for (const article of toMoveBack) {
        try {
          // 退回候选池
          await db.feedArticles.update(article.id, {
            poolStatus: 'candidate',
            popupAddedAt: undefined,
            poolExitedAt: now,
            poolExitReason: 'capacity_cleanup'
          })
          movedCount++
        } catch (error) {
          schedLogger.error(`退回候选池失败: ${article.id}`, error)
        }
      }

      schedLogger.info(`✅ 清理完成: 退回 ${movedCount} 篇到候选池，保留 ${toKeep.length} 篇高分推荐`)
      schedLogger.debug(`保留评分范围: ${toKeep[toKeep.length - 1]?.analysisScore?.toFixed(2)} - ${toKeep[0]?.analysisScore?.toFixed(2)}`)
      if (toMoveBack.length > 0) {
        schedLogger.debug(`退回评分范围: ${toMoveBack[toMoveBack.length - 1]?.analysisScore?.toFixed(2)} - ${toMoveBack[0]?.analysisScore?.toFixed(2)}`)
      }
    } catch (error) {
      schedLogger.error('❌ 清理推荐池失败:', error)
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
   * 创建推荐记录（Phase 13+: 直接更新 feedArticles，不再写入 recommendations 表）
   * 
   * 添加容量检查：
   * - 获取当前推荐池大小
   * - 只添加不超过目标容量的文章
   * - 超出部分保持在候选池中
   */
  private async createRecommendations(articles: FeedArticle[]): Promise<FeedArticle[]> {
    const updatedArticles: FeedArticle[] = []
    const now = Date.now()

    // 获取策略配置的推荐池容量
    const strategy = await getCurrentStrategy()
    const targetPoolSize = strategy?.strategy.recommendation.targetPoolSize || 6

    // 检查当前推荐池大小
    const currentPoolSize = await db.feedArticles
      .filter(a => {
        const isPopup = a.poolStatus === 'recommended'
        const isUnread = !a.isRead
        const notDismissed = a.feedback !== 'dismissed'
        return isPopup && isUnread && notDismissed
      })
      .count()

    // 计算可添加数量
    const remainingCapacity = Math.max(0, targetPoolSize - currentPoolSize)
    
    if (remainingCapacity === 0) {
      schedLogger.warn(`⚠️ 推荐池已满 (${currentPoolSize}/${targetPoolSize})，不添加新推荐`)
      return []
    }

    // 只处理容量范围内的文章
    const articlesToAdd = articles.slice(0, remainingCapacity)
    const articlesExcluded = articles.slice(remainingCapacity)

    if (articlesExcluded.length > 0) {
      schedLogger.info(`⚠️ 推荐池容量限制: 添加 ${articlesToAdd.length} 篇，跳过 ${articlesExcluded.length} 篇（保持在候选池）`)
    }

    schedLogger.debug(`开始将 ${articlesToAdd.length} 篇文章加入弹窗推荐 (当前: ${currentPoolSize}/${targetPoolSize})`)

    for (const article of articlesToAdd) {
      try {
        // 直接更新文章状态为弹窗推荐
        await db.feedArticles.update(article.id, {
          poolStatus: 'recommended',
          popupAddedAt: now,
          recommendedPoolAddedAt: now,  // 兼容旧字段
          isRead: false,                 // 初始化为未读
        })
        
        schedLogger.debug(`✅ 文章已加入弹窗: ${article.id}, title: ${article.title}`)
        
        // 验证更新成功
        const updated = await db.feedArticles.get(article.id)
        if (!updated || updated.poolStatus !== 'recommended') {
          schedLogger.error(`⚠️ 验证失败：文章状态未更新 ${article.id}`, {
            expected: 'recommended',
            actual: updated?.poolStatus
          })
        } else {
          schedLogger.debug(`✓ 验证成功：文章状态 = recommended, ${article.id}`)
          updatedArticles.push(updated)
        }
      } catch (error) {
        schedLogger.error(`❌ 更新文章状态失败: ${article.id}`, error)
      }
    }

    // 最终验证：查询数据库中弹窗状态的文章数量
    const finalCount = await db.feedArticles
      .filter(a => {
        const isPopup = a.poolStatus === 'recommended'
        const isUnread = !a.isRead
        const notDismissed = a.feedback !== 'dismissed'
        return isPopup && isUnread && notDismissed
      })
      .count()
    schedLogger.info(`📊 创建完成后数据库验证：弹窗未读文章数 = ${finalCount}`)

    return updatedArticles
  }

  /**
   * 写入阅读清单（Phase 13+: 改为接收 FeedArticle 数组）
   */
  private async writeToReadingList(articles: FeedArticle[]): Promise<void> {
    try {
      for (const article of articles) {
        await ReadingListManager.addToReadingList(
          article.title,
          article.link,
          article.isRead || false
        )
      }
      schedLogger.info(`✅ 已将 ${articles.length} 条推荐写入阅读清单`)
    } catch (error) {
      schedLogger.warn('写入阅读清单失败:', error)
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
