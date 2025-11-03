/**
 * 推荐状态管理（Zustand）
 * Phase 2.7: 实时反馈界面
 */

import { create } from 'zustand'
import type { Recommendation } from '@/storage/types'
import {
  getUnreadRecommendations,
  markAsRead,
  dismissRecommendations,
  getRecommendationStats
} from '@/storage/db'

/**
 * 推荐统计数据
 */
interface RecommendationStats {
  total: number
  read: number
  readRate: number
  avgReadDuration: number
  dismissed: number
  effective: number
  neutral: number
  ineffective: number
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
   * 加载未读推荐
   */
  loadRecommendations: async () => {
    set({ isLoading: true, error: null })
    
    try {
      const recommendations = await getUnreadRecommendations(50)
      set({ recommendations, isLoading: false })
    } catch (error) {
      console.error('加载推荐失败:', error)
      set({
        error: error instanceof Error ? error.message : '加载失败',
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
      await markAsRead(id, duration, depth)
      
      // 从列表中移除已读推荐
      const { recommendations } = get()
      set({
        recommendations: recommendations.filter(r => r.id !== id)
      })
      
      // 刷新统计
      await get().refreshStats()
    } catch (error) {
      console.error('标记已读失败:', error)
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
    
    set({ isLoading: true, error: null })
    
    try {
      await dismissRecommendations(ids)
      
      // 从列表中移除
      const { recommendations } = get()
      set({
        recommendations: recommendations.filter(r => !ids.includes(r.id)),
        isLoading: false
      })
      
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
   * 重新加载（推荐 + 统计）
   */
  reload: async () => {
    await Promise.all([
      get().loadRecommendations(),
      get().refreshStats()
    ])
  }
}))
