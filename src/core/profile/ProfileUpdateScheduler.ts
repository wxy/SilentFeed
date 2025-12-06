/**
 * 用户画像自动更新管理器
 * 
 * 负责智能调度用户画像的自动更新：
 * - 避免过度频繁的计算
 * - 根据内容质量决定更新时机
 * - 使用后台任务减少性能影响
 * - 提供手动强制更新选项
 */

import { profileManager } from '@/core/profile/ProfileManager'
import { getPageCount, getAnalysisStats, db } from '@/storage/db'
import { semanticProfileBuilder } from '@/core/profile/SemanticProfileBuilder'
import type { ConfirmedVisit } from '@/types/database'

interface UpdateSchedule {
  lastUpdateTime: number
  lastUpdatePageCount: number
  pendingUpdateCount: number
  isUpdating: boolean
}

export class ProfileUpdateScheduler {
  private static schedule: UpdateSchedule = {
    lastUpdateTime: 0,
    lastUpdatePageCount: 0,
    pendingUpdateCount: 0,
    isUpdating: false
  }

  /**
   * 智能判断是否需要更新用户画像
   */
  static async shouldUpdateProfile(): Promise<{
    shouldUpdate: boolean
    reason: string
    priority: 'low' | 'medium' | 'high'
  }> {
    const currentPageCount = await getPageCount()
    const timeSinceLastUpdate = Date.now() - this.schedule.lastUpdateTime
    const newPagesCount = currentPageCount - this.schedule.lastUpdatePageCount


    // 策略1: 首次更新（有10+页面时）
    // ⚠️ 修复：检查数据库中是否已有画像，避免扩展重载后重复触发
    if (this.schedule.lastUpdateTime === 0 && currentPageCount >= 10) {
      const profile = await db.userProfile.get('singleton')
      
      // 如果数据库中已有 AI 画像，说明不是真正的"首次"，跳过
      if (profile?.aiSummary) {
        // 重新初始化调度状态，避免后续误判
        this.schedule.lastUpdateTime = profile.lastUpdated || Date.now()
        this.schedule.lastUpdatePageCount = profile.totalPages || currentPageCount
        
        return {
          shouldUpdate: false,
          reason: '画像已存在，跳过首次更新',
          priority: 'low'
        }
      }
      
      return {
        shouldUpdate: true,
        reason: '首次构建画像',
        priority: 'high'
      }
    }

    // 策略2: 积累了足够新页面（5页以上）
    if (newPagesCount >= 5) {
      return {
        shouldUpdate: true,
        reason: `新增${newPagesCount}页面`,
        priority: 'medium'
      }
    }

    // 策略3: 时间间隔够长（6小时以上）且有新内容
    if (timeSinceLastUpdate > 6 * 60 * 60 * 1000 && newPagesCount > 0) {
      return {
        shouldUpdate: true,
        reason: '定期更新',
        priority: 'low'
      }
    }

    // 策略4: 超过24小时强制更新
    if (timeSinceLastUpdate > 24 * 60 * 60 * 1000) {
      return {
        shouldUpdate: true,
        reason: '强制定期更新',
        priority: 'medium'
      }
    }


    return {
      shouldUpdate: false,
      reason: '暂不需要更新',
      priority: 'low'
    }
  }

  /**
   * 检查是否应该触发自动更新
   * 在页面保存后调用
   * 
   * @param visit 可选的页面访问数据（Phase 8: 用于语义画像学习）
   */
  static async checkAndScheduleUpdate(visit?: ConfirmedVisit): Promise<void> {
    // 🆕 Phase 8: 如果提供了访问数据，触发语义画像更新（浏览行为）
    if (visit) {
      try {
        await semanticProfileBuilder.onBrowse(visit)
      } catch (profileError) {
        console.warn('[ProfileScheduler] 语义画像更新失败（不影响主流程）:', profileError)
      }
    }
    
    // 如果正在更新中，跳过
    if (this.schedule.isUpdating) {
      return
    }

    const decision = await this.shouldUpdateProfile()
    
    if (!decision.shouldUpdate) {
      return
    }


    // 根据优先级决定执行策略
    switch (decision.priority) {
      case 'high':
        // 高优先级：立即执行
        await this.executeUpdate(decision.reason)
        break

      case 'medium':
        // 中优先级：延迟2秒执行，避免阻塞
        setTimeout(() => this.executeUpdate(decision.reason), 2000)
        break

      case 'low':
        // 低优先级：延迟10秒执行
        setTimeout(() => this.executeUpdate(decision.reason), 10000)
        break
    }
  }

  /**
   * 执行用户画像更新
   */
  static async executeUpdate(reason: string): Promise<void> {
    if (this.schedule.isUpdating) {
      return
    }

    try {
      this.schedule.isUpdating = true
      
      const startTime = Date.now()
      
      // Phase 8.2: 使用完全重建策略（确保触发快照创建）
      await profileManager.rebuildProfile()
      
      // 更新调度状态
      const currentPageCount = await getPageCount()
      this.schedule.lastUpdateTime = Date.now()
      this.schedule.lastUpdatePageCount = currentPageCount
      this.schedule.pendingUpdateCount = 0

      const duration = Date.now() - startTime

    } catch (error) {
      console.error('[ProfileScheduler] ❌ 画像更新失败:', error)
    } finally {
      this.schedule.isUpdating = false
    }
  }

  /**
   * 手动强制更新（用于设置页面）
   */
  static async forceUpdate(): Promise<void> {
    await this.executeUpdate('手动触发')
  }

  /**
   * Phase 8.3: 用户行为立即反馈更新
   * 
   * 在用户阅读或拒绝推荐后立即触发画像更新，
   * 确保用户的最新偏好能立即影响下次推荐
   * 
   * @param trigger - 触发原因（'user_read', 'user_dismiss'）
   */
  static async forceUpdateProfile(trigger: string): Promise<void> {
    
    // 防止并发更新
    if (this.schedule.isUpdating) {
      return
    }
    
    await this.executeUpdate(trigger)
  }

  /**
   * 检查是否适合进行更新（性能检查）
   */
  static async isGoodTimeToUpdate(): Promise<boolean> {
    try {
      const analysisStats = await getAnalysisStats()
      
      // 如果分析的页面数太多，可能影响性能
      if (analysisStats.analyzedPages > 1000) {
        return Math.random() < 0.3 // 30% 概率执行
      }

      // 如果页面数较少，可以更频繁更新
      if (analysisStats.analyzedPages < 100) {
        return true
      }

      return Math.random() < 0.7 // 70% 概率执行
    } catch (error) {
      console.error('[ProfileScheduler] 性能检查失败:', error)
      return false
    }
  }

  /**
   * 获取当前调度状态（用于调试）
   */
  static getScheduleStatus() {
    return {
      ...this.schedule,
      nextUpdateETA: this.estimateNextUpdateTime()
    }
  }

  /**
   * 估算下次更新时间
   */
  private static estimateNextUpdateTime(): string {
    const timeSinceLastUpdate = Date.now() - this.schedule.lastUpdateTime
    const nextMajorUpdate = 6 * 60 * 60 * 1000 - timeSinceLastUpdate // 6小时周期

    if (nextMajorUpdate <= 0) {
      return '随时可能更新'
    }

    const hours = Math.floor(nextMajorUpdate / (60 * 60 * 1000))
    const minutes = Math.floor((nextMajorUpdate % (60 * 60 * 1000)) / (60 * 1000))
    
    return `约 ${hours}小时${minutes}分钟后`
  }
}