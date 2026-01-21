/**
 * 推荐池补充策略
 * 
 * 防止推荐池无限填充的核心机制：
 * - 补充冷却期：限制补充频率
 * - 每日补充次数上限：防止过度补充
 * - 容量阈值：只有池容量低于阈值时才补充
 */

import { logger } from '@/utils/logger'

const refillLogger = logger.withTag('PoolRefillPolicy')

/**
 * 推荐池补充策略配置
 */
export interface PoolRefillPolicy {
  /** 最小补充间隔（毫秒） */
  minInterval: number
  
  /** 每日最大补充次数 */
  maxDailyRefills: number
  
  /** 触发补充的阈值（池容量百分比）
   * 例如：0.3 表示池容量低于 30% 时才触发补充
   */
  triggerThreshold: number
}

/**
 * 默认补充策略
 * 
 * 基于以下原则设定：
 * - 30分钟冷却期：避免频繁补充，减少 AI 调用
 * - 每日5次上限：覆盖大部分用户场景（早中晚+额外2次）
 * - 80%阈值：池容量低于 80% 时补充，确保用户有充足的推荐
 *   （例如：6篇目标容量，低于 5 篇时触发补充）
 */
export const DEFAULT_REFILL_POLICY: PoolRefillPolicy = {
  minInterval: 30 * 60 * 1000,  // 30分钟
  maxDailyRefills: 5,
  triggerThreshold: 0.8  // 从 0.3 改为 0.8，更容易补满
}

/**
 * 补充状态追踪
 */
interface RefillState {
  /** 上次补充时间戳 */
  lastRefillTime: number
  
  /** 今日已补充次数 */
  dailyRefillCount: number
  
  /** 当前日期（YYYY-MM-DD） */
  currentDate: string
}

/**
 * 推荐池补充管理器
 */
export class PoolRefillManager {
  private state: RefillState = {
    lastRefillTime: 0,
    dailyRefillCount: 0,
    currentDate: this.getTodayString()
  }
  
  private policy: PoolRefillPolicy
  
  constructor(policy: PoolRefillPolicy = DEFAULT_REFILL_POLICY) {
    this.policy = policy
    this.loadState()
  }
  
  /**
   * 检查是否应该补充推荐池
   * 
   * @param currentPoolSize - 当前池容量
   * @param maxPoolSize - 最大池容量
   * @returns 是否允许补充
   */
  async shouldRefill(
    currentPoolSize: number,
    maxPoolSize: number
  ): Promise<boolean> {
    const now = Date.now()
    
    // 检查日期是否变更（跨天重置计数）
    const today = this.getTodayString()
    if (today !== this.state.currentDate) {
      refillLogger.info(`📅 日期变更：${this.state.currentDate} → ${today}，重置每日补充计数`)
      this.state.currentDate = today
      this.state.dailyRefillCount = 0
      await this.saveState()
    }
    
    // 🚨 紧急通道：推荐池完全为空时跳过冷却时间限制，但仍需检查每日次数上限
    if (currentPoolSize === 0) {
      if (this.state.dailyRefillCount >= this.policy.maxDailyRefills) {
        refillLogger.info(
          `🚫 推荐池已空但已达每日补充上限：${this.state.dailyRefillCount}/${this.policy.maxDailyRefills}，` +
          `今日不再补充`
        )
        return false
      }
      refillLogger.info('🚨 推荐池已空，跳过冷却时间限制，立即补充')
      return true
    }
    
    // 检查 1：时间间隔
    const timeSinceLastRefill = now - this.state.lastRefillTime
    if (this.state.lastRefillTime > 0 && timeSinceLastRefill < this.policy.minInterval) {
      refillLogger.debug(
        `⏰ 补充冷却中：已过 ${Math.round(timeSinceLastRefill / 1000 / 60)}分钟，` +
        `需要 ${Math.round(this.policy.minInterval / 1000 / 60)}分钟`
      )
      return false
    }
    
    // 检查 2：每日次数限制
    if (this.state.dailyRefillCount >= this.policy.maxDailyRefills) {
      refillLogger.debug(
        `🚫 今日补充次数已达上限：${this.state.dailyRefillCount}/${this.policy.maxDailyRefills}`
      )
      return false
    }
    
    // 检查 3：容量阈值
    const fillRate = currentPoolSize / maxPoolSize
    if (fillRate > this.policy.triggerThreshold) {
      refillLogger.debug(
        `📊 池容量充足：${(fillRate * 100).toFixed(0)}% > ` +
        `${(this.policy.triggerThreshold * 100).toFixed(0)}%，不需要补充`
      )
      return false
    }
    
    // 所有检查通过，允许补充
    refillLogger.info(
      `✅ 允许补充推荐池：` +
      `容量 ${currentPoolSize}/${maxPoolSize} (${(fillRate * 100).toFixed(0)}%)，` +
      `今日第 ${this.state.dailyRefillCount + 1}/${this.policy.maxDailyRefills} 次`
    )
    
    return true
  }
  
  /**
   * 记录补充操作
   */
  async recordRefill(): Promise<void> {
    this.state.lastRefillTime = Date.now()
    this.state.dailyRefillCount++
    await this.saveState()
    
    refillLogger.info(
      `📝 已记录补充操作：今日累计 ${this.state.dailyRefillCount} 次`
    )
  }
  
  /**
   * 获取当前补充状态（用于监控和调试）
   */
  getState(): Readonly<RefillState> {
    return { ...this.state }
  }
  
  /**
   * 更新补充策略
   */
  updatePolicy(policy: Partial<PoolRefillPolicy>): void {
    this.policy = { ...this.policy, ...policy }
    refillLogger.info('📝 已更新补充策略', this.policy)
  }
  
  /**
   * 重置状态（用于测试）
   */
  async resetState(): Promise<void> {
    this.state = {
      lastRefillTime: 0,
      dailyRefillCount: 0,
      currentDate: this.getTodayString()
    }
    await this.saveState()
    refillLogger.info('🔄 已重置补充状态')
  }
  
  // ========== 私有方法 ==========
  
  private getTodayString(): string {
    const now = new Date()
    return now.toISOString().split('T')[0] // YYYY-MM-DD
  }
  
  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('pool_refill_state')
      if (result.pool_refill_state) {
        this.state = result.pool_refill_state
        refillLogger.debug('📥 已加载补充状态', this.state)
      }
    } catch (error) {
      refillLogger.warn('加载补充状态失败，使用默认值', error)
    }
  }
  
  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        pool_refill_state: this.state
      })
      refillLogger.debug('💾 已保存补充状态', this.state)
    } catch (error) {
      refillLogger.error('保存补充状态失败', error)
    }
  }
}

/**
 * 全局单例
 */
let globalRefillManager: PoolRefillManager | null = null

/**
 * 获取全局补充管理器实例
 */
export function getRefillManager(): PoolRefillManager {
  if (!globalRefillManager) {
    globalRefillManager = new PoolRefillManager()
  }
  return globalRefillManager
}
