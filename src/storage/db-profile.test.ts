/**
 * 用户画像管理测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, initializeDatabase } from './db'
import type { ConfirmedVisit } from "@/types/database"
import type { UserProfile } from "@/types/profile"
import { Topic } from "@/core/profile/topics"

describe('用户画像管理', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('saveUserProfile', () => {
    it('应该保存用户画像', async () => {
      const { saveUserProfile, getUserProfile } = await import('./db')
      
      const profile: UserProfile = {
        id: 'singleton' as const,
        totalPages: 100,
        topics: {
          [Topic.TECHNOLOGY]: 0.6,
          [Topic.DESIGN]: 0.4,
          [Topic.SCIENCE]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [
          { word: 'react', weight: 0.9 },
          { word: 'vue', weight: 0.8 },
        ],
        domains: [
          { domain: 'github.com', count: 50, avgDwellTime: 120 },
        ],
        lastUpdated: Date.now(),
        version: 1,
      }

      await saveUserProfile(profile)
      
      const saved = await getUserProfile()
      expect(saved).toBeDefined()
      expect(saved?.totalPages).toBe(100)
      expect(saved?.keywords).toHaveLength(2)
    })
  })

  describe('getUserProfile', () => {
    it('应该在没有画像时返回null', async () => {
      const { getUserProfile } = await import('./db')
      
      const profile = await getUserProfile()
      expect(profile).toBeNull()
    })
  })

  describe('deleteUserProfile', () => {
    it('应该删除用户画像', async () => {
      const { saveUserProfile, getUserProfile, deleteUserProfile } = await import('./db')
      
      const profile: UserProfile = {
        id: 'singleton' as const,
        totalPages: 10,
        topics: {
          [Topic.TECHNOLOGY]: 1.0,
          [Topic.DESIGN]: 0.0,
          [Topic.SCIENCE]: 0.0,
          [Topic.BUSINESS]: 0.0,
          [Topic.ARTS]: 0.0,
          [Topic.HEALTH]: 0.0,
          [Topic.SPORTS]: 0.0,
          [Topic.ENTERTAINMENT]: 0.0,
          [Topic.NEWS]: 0.0,
          [Topic.EDUCATION]: 0.0,
          [Topic.OTHER]: 0.0,
        },
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        version: 1,
      }

      await saveUserProfile(profile)
      expect(await getUserProfile()).not.toBeNull()
      
      await deleteUserProfile()
      expect(await getUserProfile()).toBeNull()
    })
  })

  describe('getAnalysisStats', () => {
    it('应该返回分析统计信息', async () => {
      const { getAnalysisStats } = await import('./db')
      
      // 添加测试数据
      const visit: ConfirmedVisit = {
        id: 'test-1',
        url: 'https://example.com',
        title: 'Test',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: {
          keywords: ['react', 'vue', 'angular'],
          topics: ['technology'],
          language: 'en',
        },
        duration: 120,
        interactionCount: 5,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1,
      }

      await db.confirmedVisits.add(visit)
      
      const stats = await getAnalysisStats()
      
      expect(stats.analyzedPages).toBe(1)
      expect(stats.totalKeywords).toBe(3)
      expect(stats.avgKeywordsPerPage).toBe(3)
      expect(stats.languageDistribution).toHaveLength(1)
      expect(stats.topKeywords).toHaveLength(3)
    })

    it('应该处理空数据', async () => {
      const { getAnalysisStats } = await import('./db')
      
      const stats = await getAnalysisStats()
      
      expect(stats.analyzedPages).toBe(0)
      expect(stats.totalKeywords).toBe(0)
      expect(stats.avgKeywordsPerPage).toBe(0)
    })
  })
})
