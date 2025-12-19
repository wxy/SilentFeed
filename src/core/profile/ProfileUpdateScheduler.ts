/**
 * 用户画像自动更新管理器
 * 
 * Phase 12.7 简化版：
 * - 仅负责首次画像生成和手动更新
 * - 浏览/阅读/拒绝行为的触发逻辑已迁移到 SemanticProfileBuilder
 * - 使用统一的 3 小时全局时间间隔（在 SemanticProfileBuilder 中控制）
 */

import { profileManager } from '@/core/profile/ProfileManager'
import { getPageCount, db } from '@/storage/db'
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
   * Phase 12.7: 简化判断逻辑
   * 仅检查首次画像生成条件
   * 其他更新策略由 SemanticProfileBuilder 统一控制
   */
  static async shouldUpdateProfile(): Promise<{
    shouldUpdate: boolean
    reason: string
    priority: 'low' | 'medium' | 'high'
  }> {
    const currentPageCount = await getPageCount()

    // 策略1: 首次更新（有10+页面且无 AI 画像时）
    // ⚠️ 检查数据库中是否已有画像，避免扩展重载后重复触发
    if (this.schedule.lastUpdateTime === 0 && currentPageCount >= 10) {
      const profile = await db.userProfile.get('singleton')
      
      // 如果数据库中已有 AI 画像，说明不是真正的"首次"，跳过
      if (profile?.aiSummary) {
        // 重新初始化调度状态，避免后续误判
        this.schedule.lastUpdateTime = profile.lastUpdated || Date.now()
        this.schedule.lastUpdatePageCount = profile.totalPages || currentPageCount
        
        console.log('[ProfileScheduler] 检测到已有画像，跳过首次更新', {
          lastUpdated: new Date(profile.lastUpdated).toLocaleString(),
          totalPages: profile.totalPages,
          currentPageCount
        })
        
        return {
          shouldUpdate: false,
          reason: '画像已存在，跳过首次更新',
          priority: 'low'
        }
      }
      
      console.log('[ProfileScheduler] 数据库中无 AI 画像，触发首次更新', {
        hasProfile: !!profile,
        hasAISummary: !!profile?.aiSummary,
        currentPageCount
      })
      
      return {
        shouldUpdate: true,
        reason: '首次构建画像',
        priority: 'high'
      }
    }

    // Phase 12.7: 移除策略2/3/4（已迁移到 SemanticProfileBuilder）
    // 浏览/阅读/拒绝行为的触发由 SemanticProfileBuilder.onBrowse/onRead/onDismiss 处理
    // 使用统一的 3 小时全局时间间隔

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
   * @deprecated Phase 12.7: 此方法已弃用，阅读/拒绝行为由 SemanticProfileBuilder 直接处理
   */
  static async forceUpdateProfile(trigger: string): Promise<void> {
    // 弃用方法，保留空实现以保持向后兼容
    // Phase 12.7: 不再直接执行更新，由 SemanticProfileBuilder 的 onRead/onDismiss 处理
  }

  /**
   * 获取当前调度状态（用于调试）
   */
  static getScheduleStatus() {
    return {
      ...this.schedule,
      nextUpdateETA: '由 SemanticProfileBuilder 控制'
    }
  }
}