/**
 * 用户画像管理器
 *
 * 提供用户画像的构建、更新和管理功能
 */

import { db } from "@/storage/db"
import { profileBuilder } from "@/core/profile/ProfileBuilder"
import { InterestSnapshotManager } from "@/core/profile/InterestSnapshotManager"
import { semanticProfileBuilder } from "@/core/profile/SemanticProfileBuilder"
import { logger } from "@/utils/logger"
import { withErrorHandling } from "@/utils/error-handler"
import type { UserProfile } from "@/types/profile"

const profileLogger = logger.withTag('ProfileManager')

/**
 * 用户画像管理器类
 */
export class ProfileManager {
  /**
   * 重新构建用户画像
   *
   * 从所有确认的访问记录重新分析构建用户画像
   */
  async rebuildProfile(): Promise<UserProfile> {
    return (await withErrorHandling<UserProfile>(
      async () => {
        profileLogger.info('开始重建用户画像...')

        // 1. 获取所有确认的访问记录
        const visits = await db.confirmedVisits.orderBy('visitTime').toArray()
        profileLogger.info(`获取到 ${visits.length} 条访问记录`)

        // 2. 过滤出有内容分析的记录（使用严格的过滤条件）
        const analyzedVisits = visits.filter(visit => {
          if (!visit.analysis) return false
          if (!visit.analysis.keywords) return false
          if (!Array.isArray(visit.analysis.keywords)) return false
          if (visit.analysis.keywords.length === 0) return false
          return true
        })
        profileLogger.info(`其中 ${analyzedVisits.length} 条记录有内容分析`)

        // 如果有分析数据但数量很少，也要构建画像
        if (analyzedVisits.length === 0) {
          profileLogger.info('没有可分析的记录，创建空画像')
          const emptyProfile = await profileBuilder.buildFromVisits([])
          await db.userProfile.put(emptyProfile)
          return emptyProfile
        }

        // 3. 构建新的用户画像（传入总记录数，确保 totalPages 正确）
        const newProfile = await profileBuilder.buildFromVisits(analyzedVisits, visits.length)
        profileLogger.info(`构建完成，包含 ${newProfile.keywords.length} 个关键词，${newProfile.domains.length} 个域名`)
        profileLogger.info(`总页面数: ${newProfile.totalPages} (基于 ${visits.length} 条确认记录，${analyzedVisits.length} 条有分析)`)

        // 4. 保存到数据库（临时保存，可能被 AI 生成覆盖）
        await db.userProfile.put(newProfile)
        profileLogger.info('用户画像已保存到数据库')
        
        // 5. Phase 8: 尝试生成或更新 AI 语义画像（会更新数据库中的画像）
        await this.tryGenerateAIProfile(newProfile, 'rebuild')
        
        // 6. 重新读取画像（可能包含 AI 数据）
        const finalProfile = await db.userProfile.get('singleton') || newProfile

        // 7. 处理兴趣变化追踪（使用包含 AI 的最终画像）
        await InterestSnapshotManager.handleProfileUpdate(finalProfile, 'rebuild')

        return finalProfile
      },
      {
        tag: 'ProfileManager.rebuildProfile',
        rethrow: true,
        errorCode: 'PROFILE_REBUILD_ERROR',
        userMessage: '重建用户画像失败'
      }
    )) as UserProfile
  }

  /**
   * 增量更新用户画像
   *
   * 基于新的访问记录更新用户画像
   */
  async updateProfile(newVisits: any[]): Promise<UserProfile> {
    return (await withErrorHandling<UserProfile>(
      async () => {
        profileLogger.info(`开始增量更新用户画像，新增 ${newVisits.length} 条记录`)

        // 获取当前用户画像
        let currentProfile = await db.userProfile.get('singleton')

        // 如果没有现有画像，则重新构建
        if (!currentProfile) {
          profileLogger.info('未找到现有画像，执行完整重建')
          return await this.rebuildProfile()
        }

        // 合并新旧访问记录
        const allVisits = await db.confirmedVisits.orderBy('visitTime').toArray()
        const analyzedVisits = allVisits.filter(visit => 
          visit.analysis && 
          visit.analysis.keywords && 
          visit.analysis.keywords.length > 0
        )

        // 重新构建画像（简化版本，实际可以做增量计算）
        // 传入总记录数，确保 totalPages 正确
        const updatedProfile = await profileBuilder.buildFromVisits(analyzedVisits, allVisits.length)

        // 保存更新后的画像
        await db.userProfile.put(updatedProfile)
        profileLogger.info('用户画像增量更新完成')
        profileLogger.info(`总页面数: ${updatedProfile.totalPages} (基于 ${allVisits.length} 条确认记录，${analyzedVisits.length} 条有分析)`)

        // 处理兴趣变化追踪
        await InterestSnapshotManager.handleProfileUpdate(updatedProfile, 'manual')
        
        // Phase 8: 尝试生成或更新 AI 语义画像
        await this.tryGenerateAIProfile(updatedProfile, 'manual')

        return updatedProfile
      },
      {
        tag: 'ProfileManager.updateProfile',
        rethrow: true,
        errorCode: 'PROFILE_UPDATE_ERROR',
        userMessage: '更新用户画像失败'
      }
    )) as UserProfile
  }

  /**
   * 清除用户画像
   */
  async clearProfile(): Promise<void> {
    return withErrorHandling<void>(
      async () => {
        profileLogger.info('开始清除用户画像...')
        await db.userProfile.delete('singleton')
        profileLogger.info('用户画像已清除')
      },
      {
        tag: 'ProfileManager.clearProfile',
        rethrow: true,
        errorCode: 'PROFILE_CLEAR_ERROR',
        userMessage: '清除用户画像失败'
      }
    ) as Promise<void>
  }
  
  /**
   * Phase 8: 尝试生成 AI 语义画像
   * 
   * 检查条件并决定是否生成 AI 画像，不阻塞主流程
   * 
   * 触发条件（满足任意一个）：
   * - 浏览页面 ≥ 20 页
   * - 阅读推荐 ≥ 5 篇
   * - 拒绝推荐 ≥ 5 篇
   */
  private async tryGenerateAIProfile(
    profile: UserProfile,
    trigger: 'manual' | 'rebuild' | 'update'
  ): Promise<void> {
    try {
      // 1. 检查是否已有 AI 画像
      const hasAIProfile = !!profile.aiSummary
      
      // 2. 检查触发条件
      const totalPages = profile.totalPages || 0
      const readCount = profile.behaviors?.reads?.length || 0
      const dismissCount = profile.behaviors?.dismisses?.length || 0
      
      const shouldGenerate = 
        totalPages >= 10 ||   // 浏览 ≥10 页（降低门槛：更快生成 AI 画像）
        readCount >= 3 ||     // 阅读 ≥3 篇（降低门槛）
        dismissCount >= 3     // 拒绝 ≥3 篇（降低门槛）
      
      profileLogger.info('[AI Profile] 检查生成条件', {
        hasAIProfile,
        totalPages,
        readCount,
        dismissCount,
        shouldGenerate,
        trigger
      })
      
      if (!shouldGenerate) {
        profileLogger.info('[AI Profile] 条件不满足，跳过生成', {
          提示: `需要：浏览≥20页(当前${totalPages}) 或 阅读≥5篇(当前${readCount}) 或 拒绝≥5篇(当前${dismissCount})`
        })
        return
      }
      
      // 3. 如果已有 AI 画像且是普通更新（非手动触发），跳过
      if (hasAIProfile && trigger !== 'manual') {
        profileLogger.info('[AI Profile] 已有画像，跳过生成（非手动触发）')
        return
      }
      
      // 4. 调用 SemanticProfileBuilder 强制生成 AI 画像
      profileLogger.info('[AI Profile] 🤖 开始生成 AI 语义画像...')
      
      await semanticProfileBuilder.forceGenerateAIProfile(trigger)
      
      profileLogger.info('[AI Profile] ✅ AI 画像生成完成')
      
    } catch (error) {
      // 不阻塞主流程，只记录错误
      profileLogger.error('[AI Profile] 生成失败（不影响基础画像）:', error)
    }
  }

  /**
   * 获取用户画像统计信息
   */
  async getProfileStats(): Promise<{
    hasProfile: boolean
    totalPages: number
    keywordCount: number
    domainCount: number
    lastUpdated?: number
    topTopics: Array<{ topic: string; score: number }>
  }> {
    const defaultStats = {
      hasProfile: false,
      totalPages: 0,
      keywordCount: 0,
      domainCount: 0,
      topTopics: [],
    }

    return withErrorHandling(
      async () => {
        const profile = await db.userProfile.get('singleton')

        if (!profile) {
          return defaultStats
        }

        // 获取 Top 3 主题
        const topTopics = Object.entries(profile.topics)
          .filter(([topic, score]) => topic !== 'other' && score > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([topic, score]) => ({ topic, score }))

        return {
          hasProfile: true,
          totalPages: profile.totalPages,
          keywordCount: profile.keywords.length,
          domainCount: profile.domains.length,
          lastUpdated: profile.lastUpdated,
          topTopics,
        }
      },
      {
        tag: 'ProfileManager.getProfileStats',
        fallback: defaultStats,
        errorCode: 'PROFILE_STATS_ERROR',
        userMessage: '获取画像统计失败'
      }
    ) as Promise<typeof defaultStats>
  }
}

/**
 * 默认导出实例
 */
export const profileManager = new ProfileManager()