/**
 * 策略审查调度器
 * 
 * Phase: 推荐系统重构 - 多池架构 + 动态策略
 * 
 * 功能：
 * - 定期检查当前策略是否需要审查（根据 nextReview 时间）
 * - 检查策略是否过期（validUntil）
 * - 自动生成新策略并通知其他调度器更新
 * - 默认每30分钟检查一次
 */

import { logger } from '@/utils/logger'
import { StrategyDecisionService } from '@/core/strategy/StrategyDecisionService'
import type { StrategyDecision } from '@/types/strategy'

const schedLogger = logger.withTag('StrategyReviewScheduler')

/**
 * 策略审查回调函数
 * 当生成新策略时调用，通知其他组件更新配置
 */
export type StrategyUpdateCallback = (newStrategy: StrategyDecision) => Promise<void> | void

/**
 * 策略审查调度器
 */
export class StrategyReviewScheduler {
  private alarmName = 'strategy-review'
  private isRunning = false
  private isReviewing = false // 防止并发执行
  private strategyService: StrategyDecisionService
  private updateCallbacks: StrategyUpdateCallback[] = []
  
  // 检查间隔：每天检查一次（当扩展启动时）
  // 不使用定期 alarm，而是在启动时检查
  private readonly CHECK_ON_STARTUP = true
  
  constructor() {
    this.strategyService = new StrategyDecisionService()
  }
  
  /**
   * 注册策略更新回调
   * 其他调度器可以注册回调，在策略更新时得到通知
   */
  onStrategyUpdate(callback: StrategyUpdateCallback): void {
    this.updateCallbacks.push(callback)
    schedLogger.debug(`注册策略更新回调，当前回调数: ${this.updateCallbacks.length}`)
  }
  
  /**
   * 启动调度器
   * 
   * 策略：每天启动时检查一次，而不是每30分钟
   * - 立即执行一次检查
   * - 创建每日定时器（24小时后再次检查）
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      schedLogger.warn('策略审查调度器已在运行')
      return
    }
    
    schedLogger.info('启动策略审查调度器（每天检查一次）...')
    
    // 创建每日定时器（24小时 = 1440分钟）
    // Chrome Alarm 最小间隔是1分钟，但我们可以设置为24小时
    const oneDayInMinutes = 24 * 60 // 1440分钟
    await chrome.alarms.create(this.alarmName, {
      periodInMinutes: oneDayInMinutes
    })
    
    this.isRunning = true
    
    // 立即执行一次检查（异步，不阻塞启动）
    schedLogger.info('执行首次策略检查...')
    this.checkAndReview().catch(error => {
      schedLogger.error('初始策略检查失败:', error)
    })
    
    schedLogger.info('✅ 策略审查调度器已启动（每24小时检查一次）')
  }
  
  /**
   * 停止调度器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }
    
    schedLogger.info('停止策略审查调度器...')
    await chrome.alarms.clear(this.alarmName)
    this.isRunning = false
    schedLogger.info('✅ 策略审查调度器已停止')
  }
  
  /**
   * 定时器回调处理函数
   * 由 chrome.alarms.onAlarm 监听器调用
   */
  async handleAlarm(): Promise<void> {
    schedLogger.debug('策略审查定时器触发')
    
    // 防止并发执行
    if (this.isReviewing) {
      schedLogger.warn('⚠️ 策略审查正在执行中，跳过本次检查')
      return
    }
    
    await this.checkAndReview()
  }
  
  /**
   * 检查并审查策略
   * 
   * @returns 是否生成了新策略
   */
  private async checkAndReview(): Promise<boolean> {
    if (this.isReviewing) {
      return false
    }
    
    this.isReviewing = true
    
    try {
      // 1. 获取当前策略
      const currentStrategy = await this.strategyService.getCurrentStrategy()
      
      if (!currentStrategy) {
        schedLogger.info('📋 没有当前策略，生成初始策略...')
        return await this.generateNewStrategy('initial')
      }
      
      const now = Date.now()
      
      // 2. 检查是否过期
      if (currentStrategy.validUntil < now) {
        schedLogger.info('⏰ 当前策略已过期，生成新策略...', {
          validUntil: new Date(currentStrategy.validUntil).toISOString()
        })
        return await this.generateNewStrategy('expired')
      }
      
      // 3. 检查是否需要审查
      if (currentStrategy.nextReview < now) {
        schedLogger.info('🔍 当前策略需要审查，生成新策略...', {
          nextReview: new Date(currentStrategy.nextReview).toISOString()
        })
        return await this.generateNewStrategy('review')
      }
      
      // 4. 策略仍然有效
      const hoursUntilReview = Math.round((currentStrategy.nextReview - now) / (60 * 60 * 1000))
      schedLogger.debug(`✅ 当前策略有效，${hoursUntilReview} 小时后审查`)
      
      return false
    } catch (error) {
      schedLogger.error('策略审查失败:', error)
      return false
    } finally {
      this.isReviewing = false
    }
  }
  
  /**
   * 生成新策略
   * 
   * @param reason 生成原因
   * @returns 是否成功
   */
  private async generateNewStrategy(reason: 'initial' | 'expired' | 'review'): Promise<boolean> {
    try {
      schedLogger.info(`生成新策略（原因: ${reason}）...`)
      
      const newStrategy = await this.strategyService.generateNewStrategy()
      
      schedLogger.info('✅ 新策略已生成', {
        id: newStrategy.id,
        validUntil: new Date(newStrategy.validUntil).toISOString(),
        nextReview: new Date(newStrategy.nextReview).toISOString(),
        strategy: {
          analysis: newStrategy.strategy.analysis,
          recommendation: newStrategy.strategy.recommendation,
          scheduling: newStrategy.strategy.scheduling
        }
      })
      
      // 通知所有注册的回调
      await this.notifyStrategyUpdate(newStrategy)
      
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // 检查是否是配置问题
      if (errorMessage.includes('AI 功能未启用') || errorMessage.includes('未配置任何 AI Provider')) {
        schedLogger.warn('⚠️ 策略生成跳过:', errorMessage)
      } else {
        schedLogger.error('生成新策略失败:', error)
      }
      return false
    }
  }
  
  /**
   * 通知所有回调函数策略已更新
   */
  private async notifyStrategyUpdate(newStrategy: StrategyDecision): Promise<void> {
    if (this.updateCallbacks.length === 0) {
      schedLogger.debug('没有注册的策略更新回调')
      return
    }
    
    schedLogger.info(`通知 ${this.updateCallbacks.length} 个回调函数策略已更新...`)
    
    const promises = this.updateCallbacks.map(async (callback, index) => {
      try {
        await callback(newStrategy)
        schedLogger.debug(`回调 ${index + 1} 执行成功`)
      } catch (error) {
        schedLogger.error(`回调 ${index + 1} 执行失败:`, error)
      }
    })
    
    await Promise.allSettled(promises)
    schedLogger.info('✅ 策略更新通知完成')
  }
  
  /**
   * 手动触发策略审查
   * 
   * @returns 审查结果
   */
  async triggerReview(): Promise<{
    success: boolean
    strategyGenerated: boolean
    message: string
  }> {
    schedLogger.info('手动触发策略审查...')
    
    if (this.isReviewing) {
      return {
        success: false,
        strategyGenerated: false,
        message: '策略审查正在执行中，请稍后再试'
      }
    }
    
    try {
      const strategyGenerated = await this.checkAndReview()
      
      return {
        success: true,
        strategyGenerated,
        message: strategyGenerated ? '已生成新策略' : '当前策略仍然有效'
      }
    } catch (error) {
      schedLogger.error('手动触发失败:', error)
      return {
        success: false,
        strategyGenerated: false,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
  
  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean
    isReviewing: boolean
    callbackCount: number
  } {
    return {
      isRunning: this.isRunning,
      isReviewing: this.isReviewing,
      callbackCount: this.updateCallbacks.length
    }
  }
}

/**
 * 导出单例实例
 */
export const strategyReviewScheduler = new StrategyReviewScheduler()
