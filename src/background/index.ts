/**
 * 后台调度器统一管理
 * 
 * Phase 7: 后台定时任务架构重构
 * Phase 9.1: 根据 Onboarding 状态控制任务执行
 * Phase: 推荐系统重构 - 多池架构 + 动态策略
 * Phase: 双调度器架构 - 分析与补充职责分离
 * 
 * 提供统一的接口来启动、停止和管理所有后台调度器
 * 
 * 调度器架构：
 * - FeedScheduler: RSS 源抓取
 * - AnalysisScheduler: AI 分析原始文章 → 候选池
 * - RefillScheduler: 从候选池补充 → 推荐池
 * - StrategyReviewScheduler: 策略审查和更新
 */

import { feedScheduler } from './feed-scheduler'
import { analysisScheduler } from './analysis-scheduler'
import { refillScheduler } from './refill-scheduler'
import { strategyReviewScheduler } from './strategy-review-scheduler'
import { getOnboardingState } from '@/storage/onboarding-state'
import { logger } from '@/utils/logger'

const bgLogger = logger.withTag('BackgroundSchedulers')

/**
 * 启动所有后台调度器
 * 
 * Phase 9.1: 根据 Onboarding 状态决定启动哪些调度器
 * - setup: 不启动任何调度器
 * - learning: 不启动任何调度器（学习阶段不需要抓取和推荐）
 * - ready: 启动所有调度器
 * 
 * Phase: 双调度器架构
 * - AnalysisScheduler: 分析原始文章
 * - RefillScheduler: 补充推荐池
 */
export async function startAllSchedulers(): Promise<void> {
  bgLogger.info('启动所有后台调度器...')
  
  try {
    // 检查 Onboarding 状态
    const status = await getOnboardingState()
    bgLogger.info(`当前状态: ${status.state}`)
    
    if (status.state === 'setup') {
      bgLogger.info('⏸️ 准备阶段，不启动任何调度器')
      return
    }
    
    if (status.state === 'learning') {
      bgLogger.info('⏳ 学习阶段，不启动任何调度器（等待用户画像建立）')
      return
    }
    
    // 只有 ready 状态才启动所有调度器
    if (status.state === 'ready') {
      // 1. 启动策略审查调度器（优先，因为它会生成初始策略）
      bgLogger.info('启动策略审查调度器...')
      
      // 注册策略更新回调：通知分析和补充调度器
      strategyReviewScheduler.onStrategyUpdate(async (newStrategy) => {
        bgLogger.info('策略已更新，通知所有调度器...')
        await analysisScheduler.updateStrategy(newStrategy)
        await refillScheduler.updateStrategy(newStrategy)
      })
      
      await strategyReviewScheduler.start()
      
      // 2. 启动 RSS 定时调度器
      bgLogger.info('启动 RSS 定时调度器...')
      feedScheduler.start(30) // 每 30 分钟检查一次
      
      // 3. 启动文章分析调度器
      bgLogger.info('启动文章分析调度器...')
      await analysisScheduler.start()
      
      // 4. 启动推荐池补充调度器
      bgLogger.info('启动推荐池补充调度器...')
      await refillScheduler.start()
    }
    
    bgLogger.info('✅ 后台调度器启动完成')
  } catch (error) {
    bgLogger.error('❌ 启动调度器失败:', error)
    throw error
  }
}

/**
 * 停止所有后台调度器
 */
export async function stopAllSchedulers(): Promise<void> {
  bgLogger.info('停止所有后台调度器...')
  
  try {
    feedScheduler.stop()
    await analysisScheduler.stop()
    await refillScheduler.stop()
    await strategyReviewScheduler.stop()
    
    bgLogger.info('✅ 所有后台调度器已停止')
  } catch (error) {
    bgLogger.error('❌ 停止调度器失败:', error)
    throw error
  }
}

/**
 * 获取所有调度器状态
 */
export function getAllSchedulersStatus(): {
  rss: {
    isRunning: boolean
  }
  analysis: {
    isRunning: boolean
    isAnalyzing: boolean
    adjustedInterval: number | null
    nextRunTime: number | null
  }
  refill: {
    isRunning: boolean
    isRefilling: boolean
    nextRunTime: number | null
  }
  strategy: {
    isRunning: boolean
    isReviewing: boolean
    callbackCount: number
  }
} {
  return {
    rss: {
      isRunning: feedScheduler['isRunning'] || false
    },
    analysis: analysisScheduler.getStatus(),
    refill: refillScheduler.getStatus(),
    strategy: strategyReviewScheduler.getStatus()
  }
}

/**
 * Phase 9.1: 根据新的 Onboarding 状态重新配置调度器
 * 
 * 当状态从 learning → ready 时调用，启动推荐生成
 */
export async function reconfigureSchedulersForState(newState: 'setup' | 'learning' | 'ready'): Promise<void> {
  bgLogger.info(`重新配置调度器，新状态: ${newState}`)
  
  try {
    // 先停止所有调度器
    await stopAllSchedulers()
    
    // 根据新状态重新启动
    await startAllSchedulers()
  } catch (error) {
    bgLogger.error('❌ 重新配置调度器失败:', error)
    throw error
  }
}

/**
 * 导出调度器实例（用于手动控制）
 */
export { feedScheduler, analysisScheduler, refillScheduler, strategyReviewScheduler }
