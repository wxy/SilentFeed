/**
 * 标题状态管理器
 * 负责在页面标题中显示学习状态 emoji
 */

import { logger } from '@/utils/logger'

export class TitleStateManager {
  private originalTitle: string = document.title
  private currentEmoji: string = ''
  
  // Emoji 定义
  private readonly EMOJIS = {
    LEARNING: '📖',   // 学习中（正在阅读）
    PAUSED: '⏸️',     // 已暂停（标签页未激活）
    LEARNED: '✅',    // 已学习完成
  }
  
  /**
   * 标记页面开始学习（添加阅读 emoji）
   */
  startLearning(): void {
    this.originalTitle = this.getCleanTitle()
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
    logger.info('📖 [TitleState] 开始学习', { title: document.title })
  }
  
  /**
   * 标记页面暂停学习（标签页失活）
   */
  pauseLearning(): void {
    this.currentEmoji = this.EMOJIS.PAUSED
    this.updateTitle()
    logger.debug('⏸️ [TitleState] 学习暂停', { title: document.title })
  }
  
  /**
   * 恢复学习状态（标签页激活）
   */
  resumeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
    logger.debug('▶️ [TitleState] 恢复学习', { title: document.title })
  }
  
  /**
   * 标记页面学习完成（添加完成 emoji）
   */
  completeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNED
    this.updateTitle()
    logger.info('✅ [TitleState] 学习完成', { title: document.title })
    
    // 3 秒后移除完成标记
    setTimeout(() => {
      this.clearLearning()
    }, 3000)
  }
  
  /**
   * 清除学习状态（移除 emoji）
   */
  clearLearning(): void {
    this.currentEmoji = ''
    this.updateTitle()
    logger.debug('🧹 [TitleState] 清除状态', { title: document.title })
  }
  
  /**
   * 重置（用于 SPA 导航）
   */
  reset(): void {
    this.clearLearning()
    this.originalTitle = document.title
  }
  
  /**
   * 获取清理后的标题（移除所有学习相关 emoji）
   */
  private getCleanTitle(): string {
    let title = document.title
    Object.values(this.EMOJIS).forEach(emoji => {
      title = title.replace(emoji + ' ', '')
    })
    return title
  }
  
  /**
   * 更新文档标题
   */
  private updateTitle(): void {
    const cleanTitle = this.getCleanTitle()
    document.title = this.currentEmoji ? `${this.currentEmoji} ${cleanTitle}` : cleanTitle
  }
}
