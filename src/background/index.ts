/**
 * 后台调度器统一管理
 * 
 * Phase 7: 后台定时任务架构重构
 * Phase 9.1: 根据 Onboarding 状态控制任务执行
 * 
 * 提供统一的接口来启动、停止和管理所有后台调度器
 */

import { feedScheduler } from './feed-scheduler'
import { recommendationScheduler } from './recommendation-scheduler'
import { getOnboardingState } from '@/storage/onboarding-state'
import { logger } from '@/utils/logger'

const bgLogger = logger.withTag('BackgroundSchedulers')

/**
 * 启动所有后台调度器
 * 
 * Phase 9.1: 根据 Onboarding 状态决定启动哪些调度器
 * - setup: 不启动任何调度器
 * - learning: 不启动任何调度器（学习阶段不需要抓取和推荐）
 * - ready: 启动 RSS 抓取 + 推荐生成
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
    
    // 只有 ready 状态才启动 RSS 抓取和推荐生成
    if (status.state === 'ready') {
      bgLogger.info('启动 RSS 定时调度器...')
      feedScheduler.start(30) // 每 30 分钟检查一次
      
      bgLogger.info('启动推荐生成调度器...')
      await recommendationScheduler.start() // 每 20 分钟生成一次
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
    await recommendationScheduler.stop()
    
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
  recommendation: {
    isRunning: boolean
    config: any
  }
} {
  return {
    rss: {
      isRunning: feedScheduler['isRunning'] || false
    },
    recommendation: recommendationScheduler.getStatus()
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
export { feedScheduler, recommendationScheduler }
