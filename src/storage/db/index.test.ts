/**
 * 数据库索引模块测试
 * 测试数据库导出和模块重导出
 */
import { describe, it, expect } from 'vitest'
import {
  db,
  statsCache,
  initializeDatabase,
  getSettings,
  updateSettings,
  getPageCount,
  saveUserProfile,
  getUserProfile,
  deleteUserProfile,
  saveInterestSnapshot,
  getInterestHistory,
  getPrimaryTopicChanges,
  getTopicHistory,
  cleanOldSnapshots,
  updateFeedStats,
  updateAllFeedStats,
  markAsRead,
  dismissRecommendations,
  getUnreadRecommendations,
  getUnrecommendedArticleCount,
  resetRecommendationData,
  getRecommendationStats,
  getStorageStats,
  getAnalysisStats,
  getAIAnalysisStats,
  getRSSArticleCount,
  getRecommendationFunnel
} from './index'

describe('Database Index Module - 数据库索引模块', () => {
  describe('数据库实例导出', () => {
    it('应该导出 db 数据库实例', () => {
      expect(db).toBeDefined()
      expect(db.name).toBe('SilentFeedDB')
    })

    it('应该导出 statsCache 缓存实例', () => {
      expect(statsCache).toBeDefined()
      expect(typeof statsCache.get).toBe('function')
      expect(typeof statsCache.invalidate).toBe('function')
      expect(typeof statsCache.clear).toBe('function')
    })

    it('数据库应该包含所有必需的表', () => {
      expect(db.pendingVisits).toBeDefined()
      expect(db.confirmedVisits).toBeDefined()
      expect(db.settings).toBeDefined()
      expect(db.recommendations).toBeDefined()
      expect(db.userProfile).toBeDefined()
      expect(db.interestSnapshots).toBeDefined()
      expect(db.discoveredFeeds).toBeDefined()
      expect(db.feedArticles).toBeDefined()
      expect(db.aiUsage).toBeDefined()
    })
  })

  describe('db-init 模块导出', () => {
    it('应该导出 initializeDatabase 函数', () => {
      expect(initializeDatabase).toBeDefined()
      expect(typeof initializeDatabase).toBe('function')
    })
  })

  describe('db-settings 模块导出', () => {
    it('应该导出设置管理函数', () => {
      expect(getSettings).toBeDefined()
      expect(typeof getSettings).toBe('function')
      
      expect(updateSettings).toBeDefined()
      expect(typeof updateSettings).toBe('function')
      
      expect(getPageCount).toBeDefined()
      expect(typeof getPageCount).toBe('function')
    })
  })

  describe('db-profile 模块导出', () => {
    it('应该导出用户画像管理函数', () => {
      expect(saveUserProfile).toBeDefined()
      expect(typeof saveUserProfile).toBe('function')
      
      expect(getUserProfile).toBeDefined()
      expect(typeof getUserProfile).toBe('function')
      
      expect(deleteUserProfile).toBeDefined()
      expect(typeof deleteUserProfile).toBe('function')
    })
  })

  describe('db-snapshots 模块导出', () => {
    it('应该导出兴趣快照管理函数', () => {
      expect(saveInterestSnapshot).toBeDefined()
      expect(typeof saveInterestSnapshot).toBe('function')
      
      expect(getInterestHistory).toBeDefined()
      expect(typeof getInterestHistory).toBe('function')
      
      expect(getPrimaryTopicChanges).toBeDefined()
      expect(typeof getPrimaryTopicChanges).toBe('function')
      
      expect(getTopicHistory).toBeDefined()
      expect(typeof getTopicHistory).toBe('function')
      
      expect(cleanOldSnapshots).toBeDefined()
      expect(typeof cleanOldSnapshots).toBe('function')
    })
  })

  describe('db-feeds 模块导出', () => {
    it('应该导出 RSS Feed 管理函数', () => {
      expect(updateFeedStats).toBeDefined()
      expect(typeof updateFeedStats).toBe('function')
      
      expect(updateAllFeedStats).toBeDefined()
      expect(typeof updateAllFeedStats).toBe('function')
    })
  })

  describe('db-recommendations 模块导出', () => {
    it('应该导出推荐管理函数', () => {
      expect(markAsRead).toBeDefined()
      expect(typeof markAsRead).toBe('function')
      
      expect(dismissRecommendations).toBeDefined()
      expect(typeof dismissRecommendations).toBe('function')
      
      expect(getUnreadRecommendations).toBeDefined()
      expect(typeof getUnreadRecommendations).toBe('function')
      
      expect(getUnrecommendedArticleCount).toBeDefined()
      expect(typeof getUnrecommendedArticleCount).toBe('function')
      
      expect(resetRecommendationData).toBeDefined()
      expect(typeof resetRecommendationData).toBe('function')
    })
  })

  describe('db-stats 模块导出', () => {
    it('应该导出统计查询函数', () => {
      expect(getRecommendationStats).toBeDefined()
      expect(typeof getRecommendationStats).toBe('function')
      
      expect(getStorageStats).toBeDefined()
      expect(typeof getStorageStats).toBe('function')
      
      expect(getAnalysisStats).toBeDefined()
      expect(typeof getAnalysisStats).toBe('function')
      
      expect(getAIAnalysisStats).toBeDefined()
      expect(typeof getAIAnalysisStats).toBe('function')
      
      expect(getRSSArticleCount).toBeDefined()
      expect(typeof getRSSArticleCount).toBe('function')
      
      expect(getRecommendationFunnel).toBeDefined()
      expect(typeof getRecommendationFunnel).toBe('function')
    })
  })

  describe('模块完整性检查', () => {
    it('所有导出的函数应该都可调用', () => {
      const exportedFunctions = [
        initializeDatabase,
        getSettings,
        updateSettings,
        getPageCount,
        saveUserProfile,
        getUserProfile,
        deleteUserProfile,
        saveInterestSnapshot,
        getInterestHistory,
        getPrimaryTopicChanges,
        getTopicHistory,
        cleanOldSnapshots,
        updateFeedStats,
        updateAllFeedStats,
        markAsRead,
        dismissRecommendations,
        getUnreadRecommendations,
        getUnrecommendedArticleCount,
        resetRecommendationData,
        getRecommendationStats,
        getStorageStats,
        getAnalysisStats,
        getAIAnalysisStats,
        getRSSArticleCount,
        getRecommendationFunnel
      ]

      exportedFunctions.forEach(fn => {
        expect(typeof fn).toBe('function')
      })

      // 预期导出 25 个函数 + 2 个对象（db, statsCache）
      expect(exportedFunctions.length).toBe(25)
    })
  })
})
