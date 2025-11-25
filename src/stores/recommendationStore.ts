/**
 * 推荐状态管理（Zustand）
 * Phase 2.7: 实时反馈界面
 */

import { create } from 'zustand'
import type { Recommendation } from '@/types/database'
import { getRecommendationConfig } from '@/storage/recommendation-config'
import {
  getUnreadRecommendations,
  markAsRead,
  dismissRecommendations,
  getRecommendationStats,
  db
} from '@/storage/db'
import { semanticProfileBuilder } from '@/core/profile/SemanticProfileBuilder'

/**
 * 推荐统计数据
 * 
 * 注意：字段名与 getRecommendationStats() 返回值保持一致
 */
interface RecommendationStats {
  totalCount: number        // 总推荐数
  readCount: number         // 已读数
  unreadCount: number       // 未读数
  readLaterCount: number    // 稍后阅读数
  dismissedCount: number    // 已忽略数
  avgReadDuration: number   // 平均阅读时长（秒）
  topSources: Array<{
    source: string
    count: number
    readRate: number
  }>
}

/**
 * Store 状态
 */
interface RecommendationState {
  // 数据
  recommendations: Recommendation[]
  stats: RecommendationStats | null
  
  // UI 状态
  isLoading: boolean
  error: string | null
  
  // Actions
  loadRecommendations: () => Promise<void>
  generateRecommendations: () => Promise<void>
  refreshStats: (days?: number) => Promise<void>
  markAsRead: (id: string, duration?: number, depth?: number) => Promise<void>
  dismissAll: () => Promise<void>
  dismissSelected: (ids: string[]) => Promise<void>
  reload: () => Promise<void>
}

/**
 * 推荐 Store
 */
export const useRecommendationStore = create<RecommendationState>((set, get) => ({
  // 初始状态
  recommendations: [],
  stats: null,
  isLoading: false,
  error: null,
  
  /**
   * 加载未读推荐（仅从数据库加载，不生成新推荐）
   */
  loadRecommendations: async () => {
    set({ isLoading: true, error: null })
    
    try {
      // 获取推荐配置
      const config = await getRecommendationConfig()
      
      // 只从数据库加载现有推荐，不生成新的
      const recommendations = await getUnreadRecommendations(config.maxRecommendations * 2)
      
      console.log('[RecommendationStore] 加载推荐数据:', recommendations.length, '条（限制:', config.maxRecommendations, '）')
      console.log('[RecommendationStore] 推荐详情:', recommendations.map(r => ({
        id: r.id,
        title: r.title,
        isRead: r.isRead,
        feedback: r.feedback,
        recommendedAt: new Date(r.recommendedAt).toLocaleString()
      })))
      
      // 按评分降序排序并限制数量
      const sortedRecommendations = recommendations
        .sort((a: Recommendation, b: Recommendation) => b.score - a.score)
        .slice(0, config.maxRecommendations)
      
      set({ 
        recommendations: sortedRecommendations, 
        isLoading: false 
      })
      
    } catch (error) {
      console.error('[RecommendationStore] 加载推荐失败:', error)
      set({ 
        error: error instanceof Error ? error.message : '加载失败',
        isLoading: false,
        recommendations: []
      })
    }
  },
  
  /**
   * 手动生成推荐
   */
  generateRecommendations: async () => {
    set({ isLoading: true, error: null })
    
    try {
      console.log('[RecommendationStore] 手动触发推荐生成...')
      
      // 获取推荐配置
      const config = await getRecommendationConfig()
      
      // Phase 6: 传递 batchSize 参数
      const result = await recommendationService.generateRecommendations(
        config.maxRecommendations, 
        'subscribed',
        config.batchSize
      )
      
      // 无数据时不是错误，只是空状态
      if (result.recommendations.length === 0 && result.stats?.reason) {
        console.warn('[RecommendationStore] 无推荐数据:', result.stats.reason)
        set({ 
          recommendations: [], 
          isLoading: false,
          error: null // 不设置错误，让UI显示空状态
        })
        return
      }
      
      if (result.errors && result.errors.length > 0) {
        console.warn('[RecommendationStore] 推荐生成有警告:', result.errors)
        // 即使有警告也继续，除非完全失败
        if (result.recommendations.length === 0) {
          throw new Error(result.errors.join('; '))
        }
      }
      
      // 重新加载推荐（从数据库）
      const recommendations = await getUnreadRecommendations(config.maxRecommendations)
      
      console.log('[RecommendationStore] 手动生成推荐完成:', recommendations.length, '条')
      set({ recommendations, isLoading: false })
      
    } catch (error) {
      console.error('[RecommendationStore] 手动生成推荐失败:', error)
      set({
        error: error instanceof Error ? error.message : '生成推荐失败',
        isLoading: false
      })
    }
  },
  
  /**
   * 刷新统计数据
   */
  refreshStats: async (days: number = 7) => {
    try {
      const stats = await getRecommendationStats(days)
      set({ stats })
    } catch (error) {
      console.error('刷新统计失败:', error)
    }
  },
  
  /**
   * 标记推荐为已读
   */
  markAsRead: async (id: string, duration?: number, depth?: number) => {
    try {
      const beforeState = get().recommendations
      console.log('[RecommendationStore] 🔵 开始标记已读:', {
        id,
        当前推荐数: beforeState.length,
        推荐列表: beforeState.map(r => ({ id: r.id, title: r.title.substring(0, 20) }))
      })
      
      // 🆕 Phase 8: 获取推荐对象用于用户画像学习
      const recommendation = await db.recommendations.get(id)
      
      // 调用数据库标记已读（会自动更新 RSS 源统计）
      await markAsRead(id, duration, depth)
      console.log('[RecommendationStore] ✅ 数据库标记已读成功:', id)
      
      // 🆕 Phase 8: 更新用户画像（阅读行为）
      if (recommendation && duration && depth !== undefined) {
        try {
          await semanticProfileBuilder.onRead(recommendation, duration, depth)
          console.log('[RecommendationStore] ✅ 用户画像已更新（阅读）')
        } catch (profileError) {
          console.warn('[RecommendationStore] 画像更新失败（不影响主流程）:', profileError)
        }
      }
      
      // 🔧 关键修复：从数据库重新加载未读推荐，而不是 filter 内存数组
      // 原因：内存数组可能已过期，filter 会找不到对应的 ID
      const config = await getRecommendationConfig()
      const recommendations = await getUnreadRecommendations(config.maxRecommendations * 2)
      
      // ✅ 按评分降序排序并限制数量
      // 注意：getUnreadRecommendations 已按分数排序，这里再次排序确保一致性
      const sortedRecommendations = recommendations
        .sort((a: Recommendation, b: Recommendation) => b.score - a.score)
        .slice(0, config.maxRecommendations)
      
      console.log('[RecommendationStore] 🔄 重新加载未读推荐:', {
        更新前数量: beforeState.length,
        更新后数量: sortedRecommendations.length,
        移除的ID: id,
        sorted: true,
        新推荐列表: sortedRecommendations.map(r => ({ id: r.id, title: r.title.substring(0, 20), score: r.score }))
      })
      
      // 更新 store 状态
      set({
        recommendations: sortedRecommendations
      })
      
      const afterState = get().recommendations
      console.log('[RecommendationStore] ✅ Store状态已更新:', {
        更新后的推荐数: afterState.length,
        是否变化: afterState.length !== beforeState.length,
        推荐列表: afterState.map(r => ({ id: r.id, title: r.title.substring(0, 20) }))
      })
      
      // 通知背景脚本更新图标
      try {
        await chrome.runtime.sendMessage({
          type: 'RECOMMENDATIONS_DISMISSED'
        })
      } catch (messageError) {
        console.warn('[RecommendationStore] 无法通知背景脚本更新图标:', messageError)
      }
      
      // 刷新统计
      await get().refreshStats()
    } catch (error) {
      console.error('[RecommendationStore] 标记已读失败:', id, error)
      set({
        error: error instanceof Error ? error.message : '标记失败'
      })
    }
  },
  
  /**
   * 标记所有推荐为"不想读"
   */
  dismissAll: async () => {
    const { recommendations } = get()
    const ids = recommendations.map(r => r.id)
    
    if (ids.length === 0) return
    
    set({ isLoading: true, error: null })
    
    try {
      await dismissRecommendations(ids)
      set({ recommendations: [], isLoading: false })
      
      // 刷新统计
      await get().refreshStats()
    } catch (error) {
      console.error('标记"不想读"失败:', error)
      set({
        error: error instanceof Error ? error.message : '操作失败',
        isLoading: false
      })
    }
  },
  
  /**
   * 标记选中推荐为"不想读"
   */
  dismissSelected: async (ids: string[]) => {
    if (ids.length === 0) return
    
    console.log('[RecommendationStore] 开始标记不想读:', ids)
    set({ isLoading: true, error: null })
    
    try {
      // 🆕 Phase 8: 获取推荐对象用于用户画像学习（在删除前）
      const dismissedRecs = await db.recommendations.bulkGet(ids)
      
      // 调用数据库标记为不想读
      await dismissRecommendations(ids)
      console.log('[RecommendationStore] 数据库标记不想读成功:', ids)
      
      // 🆕 Phase 8: 更新用户画像（拒绝行为）
      for (const recommendation of dismissedRecs) {
        if (recommendation) {
          try {
            await semanticProfileBuilder.onDismiss(recommendation)
            console.log('[RecommendationStore] ✅ 用户画像已更新（拒绝）:', recommendation.title.substring(0, 20))
          } catch (profileError) {
            console.warn('[RecommendationStore] 画像更新失败（不影响主流程）:', profileError)
          }
        }
      }
      
      // 🔧 关键修复：从数据库重新加载未读推荐
      const config = await getRecommendationConfig()
      const recommendations = await getUnreadRecommendations(config.maxRecommendations * 2)
      
      // ✅ 按评分降序排序并限制数量
      // 注意：getUnreadRecommendations 已按分数排序，这里再次排序确保一致性
      const sortedRecommendations = recommendations
        .sort((a: Recommendation, b: Recommendation) => b.score - a.score)
        .slice(0, config.maxRecommendations)
      
      console.log('[RecommendationStore] 重新加载未读推荐:', {
        beforeCount: get().recommendations.length,
        afterCount: sortedRecommendations.length,
        dismissedIds: ids,
        sorted: true
      })
      
      set({
        recommendations: sortedRecommendations,
        isLoading: false
      })
      
      console.log('[RecommendationStore] UI状态更新完成')
      
      // 刷新统计
      await get().refreshStats()
      
      // 通知背景脚本更新图标（更新推荐数字徽章）
      try {
        await chrome.runtime.sendMessage({ type: 'RECOMMENDATIONS_DISMISSED' })
        console.log('[RecommendationStore] 已通知背景脚本更新图标')
      } catch (messageError) {
        console.warn('[RecommendationStore] 无法通知背景脚本:', messageError)
      }
    } catch (error) {
      console.error('[RecommendationStore] 标记不想读失败:', ids, error)
      set({
        error: error instanceof Error ? error.message : '操作失败',
        isLoading: false
      })
    }
  },
  
  /**
   * 重新加载（推荐 + 统计）
   */
  reload: async () => {
    await Promise.all([
      get().loadRecommendations(),
      get().refreshStats()
    ])
  }
}))
