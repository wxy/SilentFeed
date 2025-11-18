/**
 * 后台调度器统一管理
 * 
 * Phase 7: 后台定时任务架构重构
 * 
 * 提供统一的接口来启动、停止和管理所有后台调度器
 */

import { feedScheduler } from './feed-scheduler'
import { recommendationScheduler } from './recommendation-scheduler'
import { logger } from '@/utils/logger'

const bgLogger = logger.withTag('BackgroundSchedulers')

/**
 * 启动所有后台调度器
 */
export async function startAllSchedulers(): Promise<void> {
  bgLogger.info('启动所有后台调度器...')
  
  try {
    // 1. 启动 RSS 定时调度器
    bgLogger.info('启动 RSS 定时调度器...')
    feedScheduler.start(30) // 每 30 分钟检查一次
    
    // 2. 启动推荐生成调度器
    bgLogger.info('启动推荐生成调度器...')
    await recommendationScheduler.start() // 每 20 分钟生成一次
    
    bgLogger.info('✅ 所有后台调度器已启动')
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
 * 导出调度器实例（用于手动控制）
 */
export { feedScheduler, recommendationScheduler }
