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
      
      // 动态导入推荐服务
      const { recommendationService } = await import('../core/recommender/RecommendationService')
      
      // Phase 6: 传递 batchSize 参数
      const result = await recommendationService.generateRecommendations(
        config.maxRecommendations, 
        'subscribed',
        config.batchSize
      )
      
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
      console.log('[RecommendationStore] 开始标记已读:', id)
      
      // 调用数据库标记已读（会自动更新 RSS 源统计）
      await markAsRead(id, duration, depth)
      console.log('[RecommendationStore] 数据库标记已读成功:', id)
      
      // 🔧 关键修复：从数据库重新加载未读推荐，而不是 filter 内存数组
      // 原因：内存数组可能已过期，filter 会找不到对应的 ID
      const config = await getRecommendationConfig()
      const freshRecommendations = await getUnreadRecommendations(config.maxRecommendations)
      
      console.log('[RecommendationStore] 重新加载未读推荐:', {
        beforeCount: get().recommendations.length,
        afterCount: freshRecommendations.length,
        removedId: id
      })
      
      // 更新 store 状态
      set({
        recommendations: freshRecommendations
      })
      
      console.log('[RecommendationStore] UI状态更新完成')
      
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
      // 调用数据库标记为不想读
      await dismissRecommendations(ids)
      console.log('[RecommendationStore] 数据库标记不想读成功:', ids)
      
      // 🔧 关键修复：从数据库重新加载未读推荐
      const config = await getRecommendationConfig()
      const freshRecommendations = await getUnreadRecommendations(config.maxRecommendations)
      
      console.log('[RecommendationStore] 重新加载未读推荐:', {
        beforeCount: get().recommendations.length,
        afterCount: freshRecommendations.length,
        dismissedIds: ids
      })
      
      set({
        recommendations: freshRecommendations,
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
