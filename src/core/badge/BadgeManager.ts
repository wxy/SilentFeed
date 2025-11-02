/**
 * BadgeManager - 管理扩展图标徽章显示
 * 
 * 职责：
 * - 根据页面收集进度显示不同阶段的 emoji 徽章
 * - 提供进度阶段计算逻辑
 * - 封装 Chrome Badge API 调用
 */

/**
 * 进度阶段枚举
 */
export enum ProgressStage {
  EXPLORER = 'explorer',    // 探索者 (0-250 页)
  LEARNER = 'learner',      // 学习者 (251-600 页)
  GROWER = 'grower',        // 成长者 (601-1000 页)
  MASTER = 'master'         // 大师 (1000+ 页)
}

/**
 * 阶段配置
 */
interface StageConfig {
  emoji: string
  minPages: number
  maxPages: number
  name: string
}

/**
 * 徽章管理器
 */
export class BadgeManager {
  private static readonly STAGES: Record<ProgressStage, StageConfig> = {
    [ProgressStage.EXPLORER]: {
      emoji: '🌱',
      minPages: 0,
      maxPages: 250,
      name: '探索者'
    },
    [ProgressStage.LEARNER]: {
      emoji: '🌿',
      minPages: 251,
      maxPages: 600,
      name: '学习者'
    },
    [ProgressStage.GROWER]: {
      emoji: '🌳',
      minPages: 601,
      maxPages: 1000,
      name: '成长者'
    },
    [ProgressStage.MASTER]: {
      emoji: '🌲',
      minPages: 1001,
      maxPages: Infinity,
      name: '大师'
    }
  }

  /**
   * 根据页面数计算当前阶段
   * @param pageCount 页面访问计数
   * @returns 当前阶段
   */
  static getStage(pageCount: number): ProgressStage {
    // 确保页面数非负
    const normalizedCount = Math.max(0, pageCount)
    
    for (const [stage, config] of Object.entries(this.STAGES)) {
      if (normalizedCount >= config.minPages && normalizedCount <= config.maxPages) {
        return stage as ProgressStage
      }
    }
    return ProgressStage.MASTER
  }

  /**
   * 获取阶段配置
   * @param stage 阶段
   * @returns 阶段配置
   */
  static getStageConfig(stage: ProgressStage): StageConfig {
    return this.STAGES[stage]
  }

  /**
   * 更新徽章文本
   * @param pageCount 页面访问计数
   */
  static async updateBadge(pageCount: number): Promise<void> {
    const stage = this.getStage(pageCount)
    const config = this.getStageConfig(stage)
    
    try {
      await chrome.action.setBadgeText({ text: config.emoji })
      console.log(`徽章已更新: ${config.emoji} (${config.name}, ${pageCount} 页)`)
    } catch (error) {
      console.error('更新徽章失败:', error)
    }
  }

  /**
   * 清除徽章
   */
  static async clearBadge(): Promise<void> {
    try {
      await chrome.action.setBadgeText({ text: '' })
      console.log('徽章已清除')
    } catch (error) {
      console.error('清除徽章失败:', error)
    }
  }
}
