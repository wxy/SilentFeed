/**
 * 推荐生成调度器
 * 
 * Phase 7: 后台定时任务架构重构 + 动态推荐频率
 * 
 * 功能：
 * - 动态调整推荐生成频率（根据待推荐文章数量）
 * - 待推荐 >= 20 条 → 1 分钟
 * - 待推荐 10-19 条 → 3 分钟
 * - 待推荐 5-9 条 → 5 分钟
 * - 待推荐 1-4 条 → 10 分钟
 * - 待推荐 0 条 → 20 分钟（保持监控）
 * - 检查学习阶段（使用动态阈值，而非固定 100 页）
 * - 检查 AI 配置（未配置时跳过生成）
 * - 更新徽章显示新推荐
 * - 详细的日志记录
 */

import { getPageCount, getUnrecommendedArticleCount } from '../storage/db'
import { recommendationService } from '../core/recommender/RecommendationService'
import { logger } from '@/utils/logger'
import { OnboardingStateService } from '@/core/onboarding/OnboardingStateService'
import { hasAnyAIAvailable } from '@/storage/ai-config'
import { getCurrentStrategy } from '@/storage/strategy-storage'
import type { StrategyDecision } from '@/types/strategy'

const schedLogger = logger.withTag('RecommendationScheduler')

/**
 * 推荐调度器配置
 */
export interface RecommendationSchedulerConfig {
  /**
   * 最小间隔（分钟）
   * @default 1
   */
  minIntervalMinutes: number
  
  /**
   * 最大间隔（分钟）
   * @default 10
   */
  maxIntervalMinutes: number
  
  /**
   * 每次AI调用生成推荐数量
   * @default 1
   */
  recommendationsPerRun: number
  
  /**
   * 批次大小（一次处理的候选文章数）
   * @default 10
   */
  batchSize: number
  
  /**
   * 推荐来源
   * @default 'subscribed'
   */
  source: 'subscribed' | 'all'
  
  /**
   * 每次Alarm触发后的最大循环次数
   * @default 5
   */
  maxLoopIterations?: number
  
  /**
   * 循环内两次执行的间隔（毫秒）
   * @default 5000
   */
  loopDelay?: number
}

/**
 * 默认配置
 * 
 * 优化说明：
 * - minIntervalMinutes: 1（Chrome Alarm 最小间隔）
 * - maxIntervalMinutes: 10（保持活跃监控）
 * - recommendationsPerRun: 1（每次AI调用只分析1篇，避免超时和上下文过大）
 * - batchSize: 10（从10篇候选中选出1篇最优）
 * - maxLoopIterations: 5（每次Alarm触发后最多循环5次，避免阻塞）
 * - loopDelay: 5000（循环内两次执行间隔5秒）
 */
const DEFAULT_CONFIG: RecommendationSchedulerConfig = {
  minIntervalMinutes: 1,    // 1分钟（Chrome Alarm 最小值）
  maxIntervalMinutes: 10,   // 10分钟
  recommendationsPerRun: 1, // 每次AI调用生成1条
  batchSize: 10,            // 候选池10篇
  source: 'subscribed'
}

/**
 * 推荐生成调度器
 */
export class RecommendationScheduler {
  private config: RecommendationSchedulerConfig
  private alarmName = 'generate-recommendation'
  private isRunning = false
  private isGenerating = false  // Phase 7: 防止并发执行
  private consecutiveSkips = 0  // Phase 7: 连续跳过次数
  private adjustedInterval: number | null = null  // Phase 7: 调整后的间隔（分钟）
  public nextRunTime: number | null = null  // 下次执行时间（timestamp）
  private currentStrategy: StrategyDecision | null = null  // 当前策略
  
  constructor(config: Partial<RecommendationSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  /**
   * 更新策略配置
   * 当策略审查调度器生成新策略时调用
   * 
   * 注意：推荐调度器始终使用动态间隔（1-10分钟），根据待推荐文章数自动调整。
   * 策略中的 cooldownMinutes 由 PoolRefillManager 使用，控制推荐池补充频率。
   */
  async updateStrategy(strategy: StrategyDecision): Promise<void> {
    schedLogger.info('更新推荐调度器策略', {
      targetPoolSize: strategy.strategy.recommendation.targetPoolSize,
      cooldownMinutes: strategy.strategy.recommendation.cooldownMinutes
    })
    
    this.currentStrategy = strategy
    
    // 使用策略参数更新配置
    this.config.recommendationsPerRun = strategy.strategy.recommendation.targetPoolSize
    
    // 注意：不修改 minIntervalMinutes 和 maxIntervalMinutes
    // 这两个值保持默认（1分钟和10分钟），确保推荐调度器能快速响应待推荐文章积压
    // 策略中的 cooldownMinutes 由 PoolRefillManager 使用，控制推荐池补充频率
    
    schedLogger.info('✅ 推荐调度器配置已更新（间隔保持动态：1-10分钟）')
    
    // 如果调度器正在运行，重新启动以应用新配置
    if (this.isRunning) {
      schedLogger.info('重新启动调度器以应用新策略...')
      await this.stop()
      await this.start()
    }
  }
  
  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      schedLogger.warn('调度器已在运行')
      return
    }
    
    // 尝试加载策略配置
    if (!this.currentStrategy) {
      const strategy = await getCurrentStrategy()
      if (strategy) {
        schedLogger.info('加载当前策略配置')
        await this.updateStrategy(strategy)
      }
    }
    
    // 计算初始间隔
    const intervalMinutes = await this.calculateNextInterval()
    
    schedLogger.info(
      `启动推荐生成调度器（间隔: ${intervalMinutes} 分钟，每次生成 ${this.config.recommendationsPerRun} 条）...`
    )
    
    // 创建定时器
    await chrome.alarms.create(this.alarmName, {
      periodInMinutes: intervalMinutes
    })
    
    // 设置下次执行时间
    this.nextRunTime = Date.now() + intervalMinutes * 60 * 1000
    
    this.isRunning = true
    schedLogger.info('✅ 推荐生成调度器已启动')
  }
  
  /**
   * 计算下次推荐的间隔时间
   * 
   * 根据待推荐文章数量动态调整：
   * - >= 50 条 → 1 分钟（快速处理积压）
   * - 20-49 条 → 2 分钟
   * - 10-19 条 → 3 分钟
   * - 5-9 条 → 5 分钟
   * - 1-4 条 → 7 分钟
   * - 0 条 → 10 分钟（保持监控）
   * 
   * @returns 间隔时间（分钟）
   */
  private async calculateNextInterval(): Promise<number> {
    try {
      const count = await getUnrecommendedArticleCount(this.config.source)
      
      let interval: number
      if (count >= 50) {
        interval = this.config.minIntervalMinutes  // 1 分钟
      } else if (count >= 20) {
        interval = 2
      } else if (count >= 10) {
        interval = 3
      } else if (count >= 5) {
        interval = 5
      } else if (count >= 1) {
        interval = 7
      } else {
        interval = this.config.maxIntervalMinutes  // 10 分钟
      }
      
      schedLogger.debug(`待推荐文章: ${count} 条，下次间隔: ${interval} 分钟`)
      return interval
    } catch (error) {
      schedLogger.error('计算间隔失败，使用默认值:', error)
      return this.config.maxIntervalMinutes
    }
  }
  
  /**
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }
    
    schedLogger.info('停止推荐生成调度器...')
    await chrome.alarms.clear(this.alarmName)
    this.isRunning = false
    schedLogger.info('✅ 推荐生成调度器已停止')
  }
  
  /**
   * 手动触发一次推荐生成
   * 
   * @returns 生成结果
   */
  async triggerNow(): Promise<{
    success: boolean
    recommendedCount: number
    message?: string
  }> {
    schedLogger.info('手动触发推荐生成...')
    
    // Phase 7: 检查是否有任务正在执行
    if (this.isGenerating) {
      schedLogger.warn('⚠️ 推荐生成任务正在执行中，跳过本次触发')
      return {
        success: false,
        recommendedCount: 0,
        message: '有任务正在执行中，请稍后再试'
      }
    }
    
    try {
      const result = await this.generateRecommendations()
      
      if (!result.shouldGenerate) {
        return {
          success: false,
          recommendedCount: 0,
          message: result.message
        }
      }
      
      return {
        success: result.stats.recommendedCount > 0,
        recommendedCount: result.stats.recommendedCount,
        message: result.message
      }
    } catch (error) {
      schedLogger.error('手动触发失败:', error)
      return {
        success: false,
        recommendedCount: 0,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
  
  /**
   * 定时器回调处理函数
   * 
   * 由 chrome.alarms.onAlarm 监听器调用
   */
  async handleAlarm(): Promise<void> {
    schedLogger.debug('定时器触发')
    
    // Phase 7: 检查是否有任务正在执行
    if (this.isGenerating) {
      this.consecutiveSkips++
      schedLogger.warn(
        `⏭️ 跳过本次推荐生成：上一个任务仍在执行中 (连续跳过 ${this.consecutiveSkips} 次)`
      )
      
      // Phase 7: 如果连续跳过 3 次，说明任务执行时间 > 当前间隔
      // 自动增加间隔（翻倍），避免频繁冲突
      if (this.consecutiveSkips >= 3) {
        await this.adjustIntervalOnOverload()
        this.consecutiveSkips = 0  // 重置计数
      }
      
      return
    }
    
    try {
      // 1. 生成推荐
      await this.generateRecommendations()
      
      // 2. 成功执行，重置跳过计数
      this.consecutiveSkips = 0
      
      // 3. 重新计算并设置下次间隔
      await this.reschedule()
    } catch (error) {
      schedLogger.error('❌ 定时器处理失败:', error)
    }
  }
  
  /**
   * 重新计算并设置下次推荐时间
   * 
   * 在每次推荐生成后调用，根据当前待推荐数量动态调整
   */
  private async reschedule(): Promise<void> {
    if (!this.isRunning) {
      return
    }
    
    try {
      // Phase 7: 优先使用调整后的间隔
      let intervalMinutes = this.adjustedInterval
      
      // 如果没有调整过的间隔，使用动态计算
      if (intervalMinutes === null) {
        intervalMinutes = await this.calculateNextInterval()
      } else {
        // 使用调整后的间隔后，逐步恢复：每次成功执行后减少 20%
        intervalMinutes = Math.max(
          await this.calculateNextInterval(),
          Math.ceil(intervalMinutes * 0.8)
        )
        this.adjustedInterval = intervalMinutes > await this.calculateNextInterval() 
          ? intervalMinutes 
          : null
        
        if (this.adjustedInterval) {
          schedLogger.info(
            `⚡ 间隔逐步恢复中：${intervalMinutes} 分钟 (目标: ${await this.calculateNextInterval()} 分钟)`
          )
        }
      }
      
      // 清除旧的定时器并创建新的
      await chrome.alarms.clear(this.alarmName)
      await chrome.alarms.create(this.alarmName, {
        periodInMinutes: intervalMinutes
      })
      
      // 更新下次执行时间
      this.nextRunTime = Date.now() + intervalMinutes * 60 * 1000
      
      schedLogger.info(`⏰ 已重新安排：下次将在 ${intervalMinutes} 分钟后生成推荐`)
    } catch (error) {
      schedLogger.error('重新安排失败:', error)
    }
  }
  
  /**
   * Phase 7: 因任务过载调整间隔
   * 
   * 当连续跳过 3 次时调用，将当前间隔翻倍
   */
  private async adjustIntervalOnOverload(): Promise<void> {
    try {
      // 获取当前基础间隔
      const baseInterval = await this.calculateNextInterval()
      
      // 如果已经调整过，继续翻倍；否则从基础间隔翻倍
      const currentInterval = this.adjustedInterval || baseInterval
      const newInterval = Math.min(
        currentInterval * 2,
        this.config.maxIntervalMinutes  // 不超过最大间隔
      )
      
      this.adjustedInterval = newInterval
      
      schedLogger.warn(
        `🔧 检测到任务过载（连续跳过 3 次），间隔调整: ${currentInterval} → ${newInterval} 分钟`
      )
      
      // 立即应用新间隔
      await chrome.alarms.clear(this.alarmName)
      await chrome.alarms.create(this.alarmName, {
        periodInMinutes: newInterval
      })
      
      schedLogger.info(`⏰ 已应用新间隔：下次将在 ${newInterval} 分钟后生成推荐`)
    } catch (error) {
      schedLogger.error('调整间隔失败:', error)
    }
  }
  
  /**
   * 生成推荐（核心逻辑）
   * 
   * @returns 生成结果和统计信息
   */
  private async generateRecommendations(): Promise<{
    shouldGenerate: boolean
    stats: {
      recommendedCount: number
      processedArticles: number
      totalArticles: number
      processingTimeMs: number
    }
    message?: string
  }> {
    // Phase 7: 设置执行标志
    this.isGenerating = true
    
    try {
      // Phase 8: 检查 AI 是否可用
      const aiStatus = await hasAnyAIAvailable()
      if (!aiStatus.hasAny) {
        const message = '跳过推荐生成：未配置任何 AI 引擎（请先在设置中配置 DeepSeek/OpenAI/Ollama）'
        schedLogger.debug(message)
        return {
          shouldGenerate: false,
          stats: {
            recommendedCount: 0,
            processedArticles: 0,
            totalArticles: 0,
            processingTimeMs: 0
          },
          message
        }
      }
      
      // 1. 检查是否达到学习阈值（使用动态阈值）
      const stateInfo = await OnboardingStateService.getState()
      if (!stateInfo.isLearningComplete) {
        const message = `跳过推荐生成：当前 ${stateInfo.pageCount} 页，需要 ${stateInfo.threshold} 页`
        schedLogger.debug(message)
        return {
          shouldGenerate: false,
          stats: {
            recommendedCount: 0,
            processedArticles: 0,
            totalArticles: 0,
            processingTimeMs: 0
          },
        message
      }
    }
    
    // 2. 生成推荐
    schedLogger.info(`开始自动生成推荐（每次 ${this.config.recommendationsPerRun} 条）...`)
    
    const result = await recommendationService.generateRecommendations(
      this.config.recommendationsPerRun,
      this.config.source,
      this.config.batchSize
    )
    
    // 3. 记录详细日志
    schedLogger.info('推荐生成结果:', {
      生成数量: result.stats.recommendedCount,
      处理文章: result.stats.processedArticles,
      总文章数: result.stats.totalArticles,
      耗时: `${result.stats.processingTimeMs}ms`,
      推荐详情: result.recommendations.map(r => ({
        标题: r.title || 'untitled',
        评分: r.score || 0,
        来源: r.source || 'unknown'
      }))
    })
    
      // 4. 返回结果
      if (result.stats.recommendedCount > 0) {
        schedLogger.info(`✅ 自动推荐生成完成: ${result.stats.recommendedCount} 条`)
        return {
          shouldGenerate: true,
          stats: result.stats,
          message: `成功生成 ${result.stats.recommendedCount} 条推荐`
        }
      } else {
        schedLogger.info('暂无新推荐')
        return {
          shouldGenerate: true,
          stats: result.stats,
          message: '暂无符合条件的文章'
        }
      }
    } finally {
      // Phase 7: 清除执行标志
      this.isGenerating = false
    }
  }
  
  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean
    config: RecommendationSchedulerConfig
    alarmName: string
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      alarmName: this.alarmName
    }
  }
}

/**
 * 导出单例实例
 */
export const recommendationScheduler = new RecommendationScheduler()
