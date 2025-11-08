/**
 * 用户画像管理器
 *
 * 提供用户画像的构建、更新和管理功能
 */

import { db } from "@/storage/db"
import { profileBuilder } from "@/core/profile/ProfileBuilder"
import { InterestSnapshotManager } from "@/core/profile/InterestSnapshotManager"
import type { UserProfile } from "@/core/profile/types"

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
    console.log("[ProfileManager] 开始重建用户画像...")

    try {
      // 1. 获取所有确认的访问记录
      const visits = await db.confirmedVisits.orderBy('visitTime').toArray()
      console.log(`[ProfileManager] 获取到 ${visits.length} 条访问记录`)

      // 2. 过滤出有内容分析的记录（使用严格的过滤条件）
      const analyzedVisits = visits.filter(visit => {
        if (!visit.analysis) return false
        if (!visit.analysis.keywords) return false
        if (!Array.isArray(visit.analysis.keywords)) return false
        if (visit.analysis.keywords.length === 0) return false
        return true
      })
      console.log(`[ProfileManager] 其中 ${analyzedVisits.length} 条记录有内容分析`)

      // 如果有分析数据但数量很少，也要构建画像
      if (analyzedVisits.length === 0) {
        console.log("[ProfileManager] 没有可分析的记录，创建空画像")
        const emptyProfile = await profileBuilder.buildFromVisits([])
        await db.userProfile.put(emptyProfile)
        return emptyProfile
      }

      // 3. 构建新的用户画像
      const newProfile = await profileBuilder.buildFromVisits(analyzedVisits)
      console.log(`[ProfileManager] 构建完成，包含 ${newProfile.keywords.length} 个关键词，${newProfile.domains.length} 个域名`)

      // 4. 保存到数据库
      await db.userProfile.put(newProfile)
      console.log("[ProfileManager] 用户画像已保存到数据库")

      // 5. 处理兴趣变化追踪
      await InterestSnapshotManager.handleProfileUpdate(newProfile, 'rebuild')

      return newProfile
    } catch (error) {
      console.error("[ProfileManager] 重建用户画像失败:", error)
      throw error
    }
  }

  /**
   * 增量更新用户画像
   *
   * 基于新的访问记录更新用户画像
   */
  async updateProfile(newVisits: any[]): Promise<UserProfile> {
    console.log(`[ProfileManager] 开始增量更新用户画像，新增 ${newVisits.length} 条记录`)

    try {
      // 获取当前用户画像
      let currentProfile = await db.userProfile.get('singleton')

      // 如果没有现有画像，则重新构建
      if (!currentProfile) {
        console.log("[ProfileManager] 未找到现有画像，执行完整重建")
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
      const updatedProfile = await profileBuilder.buildFromVisits(analyzedVisits)

      // 保存更新后的画像
      await db.userProfile.put(updatedProfile)
      console.log("[ProfileManager] 用户画像增量更新完成")

      // 处理兴趣变化追踪
      await InterestSnapshotManager.handleProfileUpdate(updatedProfile, 'manual')

      return updatedProfile
    } catch (error) {
      console.error("[ProfileManager] 增量更新用户画像失败:", error)
      throw error
    }
  }

  /**
   * 清除用户画像
   */
  async clearProfile(): Promise<void> {
    console.log("[ProfileManager] 开始清除用户画像...")

    try {
      await db.userProfile.delete('singleton')
      console.log("[ProfileManager] 用户画像已清除")
    } catch (error) {
      console.error("[ProfileManager] 清除用户画像失败:", error)
      throw error
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
    try {
      const profile = await db.userProfile.get('singleton')

      if (!profile) {
        return {
          hasProfile: false,
          totalPages: 0,
          keywordCount: 0,
          domainCount: 0,
          topTopics: [],
        }
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
    } catch (error) {
      console.error("[ProfileManager] 获取画像统计失败:", error)
      return {
        hasProfile: false,
        totalPages: 0,
        keywordCount: 0,
        domainCount: 0,
        topTopics: [],
      }
    }
  }
}

/**
 * 默认导出实例
 */
export const profileManager = new ProfileManager()