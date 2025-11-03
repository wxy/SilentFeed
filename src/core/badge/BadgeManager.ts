/**
 * BadgeManager - 管理扩展图标徽章显示
 * 
 * Phase 2.7 升级：
 * - 冷启动阶段（0-1000 页）：显示成长树 emoji
 * - 推荐阶段（1000+ 页）：显示未读推荐数字徽章
 * 
 * 职责：
 * - 根据页面收集进度显示不同阶段的 emoji 徽章
 * - 根据推荐状态显示数字徽章
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
  MASTER = 'master'         // 大师 (1000+ 页，进入推荐阶段)
}

/**
 * 徽章模式
 */
export enum BadgeMode {
  COLD_START = 'cold_start',    // 冷启动：显示成长树
  RECOMMENDATION = 'recommendation'  // 推荐阶段：显示数字
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
 * 
 * Phase 2.7: 支持两阶段徽章显示
 */
export class BadgeManager {
  /**
   * 冷启动阶段阈值（达到此页面数后进入推荐阶段）
   */
  private static readonly COLD_START_THRESHOLD = 1000

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
   * 徽章颜色配置
   * Phase 2.7: 使用较淡的颜色，避免遮挡图标
   * 注意：Chrome Badge API 对透明度支持有限，使用淡色代替
   */
  private static readonly BADGE_COLORS = {
    COLD_START: [76, 175, 147, 255] as chrome.action.ColorArray,      // 淡绿色（冷启动 emoji）
    HAS_RECOMMENDATIONS: [255, 107, 53, 255] as chrome.action.ColorArray,  // 橙色（有推荐）
    NO_RECOMMENDATIONS: [156, 163, 175, 255] as chrome.action.ColorArray    // 淡灰色（无推荐）
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
   * 判断当前是否处于冷启动阶段
   * @param pageCount 页面访问计数
   * @returns 是否冷启动
   */
  static isColdStart(pageCount: number): boolean {
    return pageCount < this.COLD_START_THRESHOLD
  }

  /**
   * 更新徽章（Phase 2.7: 支持两阶段）
   * 
   * @param pageCount 页面访问计数
   * @param unreadCount 未读推荐数（可选，推荐阶段使用）
   */
  static async updateBadge(pageCount: number, unreadCount?: number): Promise<void> {
    try {
      if (this.isColdStart(pageCount)) {
        // 冷启动阶段：显示成长树 emoji
        await this.updateColdStartBadge(pageCount)
      } else {
        // 推荐阶段：显示未读数字徽章
        await this.updateRecommendationBadge(unreadCount ?? 0)
      }
    } catch (error) {
      console.error('[BadgeManager] ❌ 更新徽章失败:', error)
    }
  }

  /**
   * 更新冷启动阶段徽章（成长树 emoji）
   * @param pageCount 页面计数
   */
  private static async updateColdStartBadge(pageCount: number): Promise<void> {
    const stage = this.getStage(pageCount)
    const config = this.getStageConfig(stage)
    
    await chrome.action.setBadgeText({ text: config.emoji })
    await chrome.action.setBadgeBackgroundColor({ color: this.BADGE_COLORS.COLD_START })
    
    console.log(`[BadgeManager] ✅ 徽章已更新（冷启动）: ${config.emoji} (${config.name}, ${pageCount}/${this.COLD_START_THRESHOLD} 页)`)
  }

  /**
   * 更新推荐阶段徽章（数字）
   * @param unreadCount 未读推荐数
   */
  private static async updateRecommendationBadge(unreadCount: number): Promise<void> {
    const text = unreadCount > 0 ? String(unreadCount) : ''
    const color = unreadCount > 0 
      ? this.BADGE_COLORS.HAS_RECOMMENDATIONS 
      : this.BADGE_COLORS.NO_RECOMMENDATIONS
    
    await chrome.action.setBadgeText({ text })
    await chrome.action.setBadgeBackgroundColor({ color })
    
    console.log(`[BadgeManager] ✅ 徽章已更新（推荐）: ${text || '(空)'} (${unreadCount} 条未读)`)
  }

  /**
   * 清除徽章
   */
  static async clearBadge(): Promise<void> {
    try {
      await chrome.action.setBadgeText({ text: '' })
      console.log('[BadgeManager] ✅ 徽章已清除')
    } catch (error) {
      console.error('[BadgeManager] ❌ 清除徽章失败:', error)
    }
  }
}
