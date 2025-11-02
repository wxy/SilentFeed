/**
 * 停留时间计算器
 * 
 * 职责：
 * - 监听页面激活状态（visibilitychange）
 * - 检测用户交互（scroll, click, keypress, mousemove）
 * - 计算有效停留时间（激活 + 有交互）
 * 
 * 核心算法：
 * - 只有页面激活且有用户交互才计入停留时间
 * - 30 秒无交互后停止计时
 * - 支持页面切换暂停/恢复计时
 */

import { logger } from '../../utils/logger'

/**
 * 交互事件类型
 */
export type InteractionType = 'scroll' | 'click' | 'keypress' | 'mousemove'

/**
 * 停留时间计算器
 */
export class DwellTimeCalculator {
  private startTime: number
  private lastActiveTime: number
  private lastInteractionTime: number
  private totalActiveTime: number = 0
  private isCurrentlyActive: boolean = true
  private isStopped: boolean = false // 是否已停止
  
  // 常量
  private static readonly INTERACTION_TIMEOUT = 30 // 30 秒无交互停止计时
  
  constructor() {
    const now = Date.now()
    this.startTime = now
    this.lastActiveTime = now
    this.lastInteractionTime = now
    
    logger.debug('🕐 [DwellTime] 计算器已初始化', {
      startTime: new Date(now).toLocaleTimeString()
    })
  }
  
  /**
   * 页面可见性变化
   */
  onVisibilityChange(isVisible: boolean): void {
    if (this.isStopped) return // 已停止，忽略事件
    
    const now = Date.now()
    
    if (isVisible) {
      // 页面激活
      this.isCurrentlyActive = true
      this.lastActiveTime = now
      
      logger.debug('👁️ [DwellTime] 页面激活', {
        time: new Date(now).toLocaleTimeString(),
        '累计激活时间': `${this.totalActiveTime.toFixed(1)}秒`
      })
    } else {
      // 页面失活
      if (this.isCurrentlyActive) {
        const activeSegmentDuration = (now - this.lastActiveTime) / 1000
        this.totalActiveTime += activeSegmentDuration
        
        logger.debug('🙈 [DwellTime] 页面失活', {
          time: new Date(now).toLocaleTimeString(),
          '本次激活时长': `${activeSegmentDuration.toFixed(1)}秒`,
          '累计激活时间': `${this.totalActiveTime.toFixed(1)}秒`
        })
      }
      
      this.isCurrentlyActive = false
    }
  }
  
  /**
   * 用户交互事件
   * @param type 交互类型
   */
  onInteraction(type: InteractionType): void {
    if (this.isStopped) return // 已停止，忽略事件
    
    const now = Date.now()
    const timeSinceLastInteraction = (now - this.lastInteractionTime) / 1000
    this.lastInteractionTime = now
    
    logger.debug(`👆 [DwellTime] 用户交互: ${type}`, {
      time: new Date(now).toLocaleTimeString(),
      距上次交互: `${timeSinceLastInteraction.toFixed(1)}秒`,
      当前有效时间: `${this.getEffectiveDwellTime().toFixed(1)}秒`
    })
    
    // 注意：不更新 lastActiveTime
    // lastActiveTime 只在 onVisibilityChange(true) 时设置
    // 用来标记当前激活片段的开始时间
  }
  
  /**
   * 获取当前有效停留时间（秒）
   * 
   * 逻辑：
   * 1. 计算累计激活时间
   * 2. 如果当前激活，加上当前的激活时间
   * 3. 如果超过 30 秒没有交互，只计算到最后交互 + 30 秒的时间
   * 
   * @returns 有效停留时间（秒）
   */
  getEffectiveDwellTime(): number {
    if (this.isStopped) return this.totalActiveTime // 已停止，返回最终时间
    
    const now = Date.now()
    let effectiveTime = this.totalActiveTime
    
    // 计算有效的截止时间
    const timeSinceLastInteraction = (now - this.lastInteractionTime) / 1000
    const isTimeout = timeSinceLastInteraction > DwellTimeCalculator.INTERACTION_TIMEOUT
    
    // 如果超时，有效时间截止到最后交互 + 30 秒
    const effectiveDeadline = isTimeout 
      ? this.lastInteractionTime + (DwellTimeCalculator.INTERACTION_TIMEOUT * 1000)
      : now
    
    // 如果当前激活，计算当前激活片段的有效时间
    if (this.isCurrentlyActive) {
      // 当前片段的结束时间不能超过有效截止时间
      const segmentEnd = Math.min(effectiveDeadline, now)
      const currentSegment = (segmentEnd - this.lastActiveTime) / 1000
      effectiveTime += Math.max(0, currentSegment)
    }
    
    // 添加调试日志（仅在超时或每 10 秒记录一次）
    if (isTimeout || Math.floor(timeSinceLastInteraction) % 10 === 0) {
      logger.debug('⏱️ [DwellTime] 有效停留时间', {
        累计激活: `${this.totalActiveTime.toFixed(1)}秒`,
        当前片段: this.isCurrentlyActive ? `${((now - this.lastActiveTime) / 1000).toFixed(1)}秒` : '页面失活',
        有效时间: `${effectiveTime.toFixed(1)}秒`,
        距上次交互: `${timeSinceLastInteraction.toFixed(1)}秒`,
        状态: isTimeout ? '⚠️ 超时（30秒无交互）' : '✅ 正常'
      })
    }
    
    return effectiveTime
  }
  
  /**
   * 获取最后交互时间戳
   */
  getLastInteractionTime(): number {
    return this.lastInteractionTime
  }
  
  /**
   * 获取是否当前激活
   */
  isActive(): boolean {
    return this.isCurrentlyActive
  }
  
  /**
   * 获取自最后交互以来的秒数
   */
  getTimeSinceLastInteraction(): number {
    return (Date.now() - this.lastInteractionTime) / 1000
  }
  
  /**
   * 重置计算器（用于新页面）
   */
  reset(): void {
    this.startTime = Date.now()
    this.lastActiveTime = this.startTime
    this.lastInteractionTime = this.startTime
    this.totalActiveTime = 0
    this.isCurrentlyActive = true
    this.isStopped = false
    
    logger.debug('🔄 [DwellTime] 计算器已重置', {
      time: new Date().toLocaleTimeString()
    })
  }
  
  /**
   * 停止计算器（记录后不再需要）
   */
  stop(): void {
    if (this.isStopped) return
    
    this.isStopped = true
    const finalTime = this.getEffectiveDwellTime()
    
    logger.debug('🛑 [DwellTime] 计算器已停止', {
      最终停留时间: `${finalTime.toFixed(1)}秒`,
      time: new Date().toLocaleTimeString()
    })
  }
}
