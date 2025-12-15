/**
 * Chrome Reading List 管理器
 * 
 * 功能：
 * - 管理 Chrome 阅读列表条目（添加/删除/更新/查询）
 * - 追踪从推荐系统保存的文章
 * - 监听阅读列表变化，检测"稍后读"文章被真实阅读
 * - 管理首次使用提示
 */

import { logger } from '@/utils/logger'
import type { Recommendation, ConfirmedVisit } from '@/types/database'
import { db } from '@/storage/db'

const rlLogger = logger.withTag('ReadingListManager')

/**
 * 阅读列表引导状态
 */
interface ReadingListOnboarding {
  tipCount: number          // 已显示提示次数
  firstSaveTime?: number    // 首次保存时间
}

const ONBOARDING_KEY = 'readingListOnboarding'
const MAX_TIP_COUNT = 3

export class ReadingListManager {
  /**
   * 将推荐文章保存到 Chrome 阅读列表
   * @param recommendation 推荐条目
   * @returns 是否成功保存
   */
  static async saveRecommendation(recommendation: Recommendation): Promise<boolean> {
    try {
      // 1. 添加到 Chrome 阅读列表（使用原文链接）
      await chrome.readingList.addEntry({
        title: recommendation.title,
        url: recommendation.url,
        hasBeenRead: false,
      })

      // 2. 更新 Dexie 中的推荐状态
      await db.recommendations.update(recommendation.id, {
        savedToReadingList: true,
        savedAt: Date.now(),
      })

      rlLogger.info('已保存到阅读列表', {
        id: recommendation.id,
        title: recommendation.title,
        url: recommendation.url,
      })

      // 3. 检查是否需要显示提示
      await this.maybeShowOnboardingTip()

      return true
    } catch (error) {
      const errorMessage = (error as Error).message || ''
      
      // 如果文章已在阅读列表中，也算成功
      if (errorMessage.includes('Duplicate') || errorMessage.includes('already exists')) {
        rlLogger.debug('文章已在阅读列表中', { url: recommendation.url })
        
        // 仍然更新 Dexie 状态
        await db.recommendations.update(recommendation.id, {
          savedToReadingList: true,
          savedAt: Date.now(),
        })
        
        return true
      }
      
      rlLogger.error('保存到阅读列表失败', error)
      return false
    }
  }

  /**
   * 检查是否需要显示首次使用提示
   */
  private static async maybeShowOnboardingTip(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(ONBOARDING_KEY)
      const onboarding: ReadingListOnboarding = result[ONBOARDING_KEY] || {
        tipCount: 0,
      }

      // 如果已经提示过 3 次，不再提示
      if (onboarding.tipCount >= MAX_TIP_COUNT) {
        return
      }

      // 更新提示次数
      onboarding.tipCount++
      if (!onboarding.firstSaveTime) {
        onboarding.firstSaveTime = Date.now()
      }
      await chrome.storage.local.set({ [ONBOARDING_KEY]: onboarding })

      // 根据提示次数显示不同内容
      let message: string
      if (onboarding.tipCount === 1) {
        message = 
          '✅ 已保存到阅读列表！\n\n' +
          '你可以在 Chrome 侧边栏中查看：\n' +
          '1. 点击地址栏旁的 📑 图标\n' +
          '2. 选择"阅读列表"'
      } else if (onboarding.tipCount === 2) {
        const count = await this.getUnreadCount()
        message = 
          `💡 阅读列表中已有 ${count} 篇文章\n\n` +
          '点击地址栏旁的 📑 图标可随时查看'
      } else {
        message = '✅ 已保存到阅读列表'
      }

      // 使用 alert 显示提示
      alert(message)

      rlLogger.info('已显示首次使用提示', { count: onboarding.tipCount })
    } catch (error) {
      rlLogger.error('显示提示失败', error)
    }
  }

  /**
   * 查询阅读列表中的条目
   */
  static async getEntries(filter?: {
    url?: string
    hasBeenRead?: boolean
  }): Promise<chrome.readingList.ReadingListEntry[]> {
    try {
      return await chrome.readingList.query(filter || {})
    } catch (error) {
      rlLogger.error('查询阅读列表失败', error)
      return []
    }
  }

  /**
   * 获取未读条目数量
   */
  static async getUnreadCount(): Promise<number> {
    try {
      const entries = await chrome.readingList.query({ hasBeenRead: false })
      return entries.length
    } catch (error) {
      rlLogger.error('获取未读数量失败', error)
      return 0
    }
  }

  /**
   * 检查 URL 是否在阅读列表中
   */
  static async isInReadingList(url: string): Promise<boolean> {
    try {
      const entries = await chrome.readingList.query({ url })
      return entries.length > 0
    } catch (error) {
      rlLogger.error('检查阅读列表状态失败', error)
      return false
    }
  }

  /**
   * 设置阅读列表事件监听器
   * 监听文章被标记为已读，并将其记录为真实阅读
   */
  static setupListeners(): void {
    // 监听条目更新（仅记录日志，不作为阅读信号）
    chrome.readingList.onEntryUpdated.addListener(async (entry) => {
      // 策略B：忽略"已读"按钮，依赖实际访问监控
      rlLogger.debug('阅读列表条目更新（忽略，仅记录日志）', {
        title: entry.title,
        url: entry.url,
        hasBeenRead: entry.hasBeenRead,
      })
    })

    // 监听新增条目（用于调试和统计）
    chrome.readingList.onEntryAdded.addListener((entry) => {
      rlLogger.debug('阅读列表新增条目', {
        title: entry.title,
        url: entry.url,
      })
    })

    // 监听移除条目（区分是否阅读后删除）
    chrome.readingList.onEntryRemoved.addListener(async (entry) => {
      rlLogger.debug('阅读列表移除条目', {
        title: entry.title,
        url: entry.url,
      })
      
      // 检查是否是未读删除（视为"不想读"）
      await this.handleReadingListRemoved(entry.url)
    })

    rlLogger.info('阅读列表事件监听器已设置')
  }

  /**
   * 处理阅读列表条目被删除
   * 策略B：检查数据库中是否有实际访问记录，而不是 session storage
   */
  private static async handleReadingListRemoved(url: string): Promise<void> {
    try {
      // 1. 查找对应的推荐记录
      const recommendation = await db.recommendations
        .filter((rec) => rec.url === url && rec.savedToReadingList === true)
        .first()

      if (!recommendation) {
        rlLogger.debug('未找到对应的推荐记录或该条目非推荐保存', { url })
        return
      }

      // 2. 检查数据库中是否有实际访问记录（策略B）
      const confirmedVisit = await db.confirmedVisits
        .filter((visit) => visit.url === url && visit.recommendationId === recommendation.id)
        .first()

      if (confirmedVisit) {
        // 有访问记录，说明用户真的打开并阅读了（达到 30 秒阈值）
        rlLogger.info('✅ [稍后读] 删除前已实际阅读 → 视为【正式阅读】', {
          id: recommendation.id,
          title: recommendation.title,
          url,
          visitTime: new Date(confirmedVisit.visitTime).toISOString(),
          duration: confirmedVisit.duration,
          处理方式: '已有 ConfirmedVisit，无需额外处理',
        })

        // 更新推荐记录的 readAt 时间
        await db.recommendations.update(recommendation.id, {
          readAt: confirmedVisit.visitTime,
          visitCount: (recommendation.visitCount || 0) + 1,
        })
        return
      }

      // 3. 没有访问记录，说明从未打开或未达到 30 秒阈值，视为"不想读"
      rlLogger.info('❌ [稍后读] 删除前从未阅读 → 视为【不想读】', {
        id: recommendation.id,
        title: recommendation.title,
        url,
        处理方式: '标记 feedback=dismissed（无 ConfirmedVisit）',
      })

      await db.recommendations.update(recommendation.id, {
        feedback: 'dismissed' as const,
        feedbackAt: Date.now(),
        status: 'dismissed' as const,
      })

      // 注意：不需要发送消息通知 background
      // 推荐状态已更新，如需要可以在 ProfileUpdateScheduler 中处理
    } catch (error) {
      rlLogger.error('处理阅读列表删除失败', error)
    }
  }

  /**
   * 获取已保存到阅读列表的推荐数量
   */
  static async getSavedRecommendationsCount(): Promise<number> {
    try {
      return await db.recommendations
        .where('savedToReadingList')
        .equals(1)
        .count()
    } catch (error) {
      rlLogger.error('获取已保存推荐数量失败', error)
      return 0
    }
  }

  /**
   * 获取已从阅读列表真实阅读的推荐数量
   */
  static async getReadFromListCount(): Promise<number> {
    try {
      return await db.recommendations
        .filter((rec) => rec.savedToReadingList === true && rec.readAt !== undefined)
        .count()
    } catch (error) {
      rlLogger.error('获取真实阅读数量失败', error)
      return 0
    }
  }
}
