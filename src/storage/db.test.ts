/**
 * 数据库测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, initializeDatabase, getSettings, updateSettings, getPageCount, getRecommendationStats, getStorageStats, markAsRead, dismissRecommendations, getUnreadRecommendations } from './db'
import type { ConfirmedVisit, Recommendation } from "@/types/database"
import type { UserSettings } from "@/types/config"
import type { InterestSnapshot, UserProfile } from "@/types/profile"

describe('数据库初始化', () => {
  beforeEach(async () => {
    // 清空数据库
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该成功创建数据库', async () => {
    expect(db.isOpen()).toBe(true)
    expect(db.name).toBe('FeedAIMuterDB')
  })

  it('应该包含所有必需的表', () => {
    expect(db.pendingVisits).toBeDefined()
    expect(db.confirmedVisits).toBeDefined()
    expect(db.settings).toBeDefined()
    expect(db.statistics).toBeDefined()
    expect(db.recommendations).toBeDefined() // Phase 2.7
  })

  it('应该在初始化时创建默认设置', async () => {
    await initializeDatabase()
    
    const settings = await db.settings.get('singleton')
    expect(settings).toBeDefined()
    expect(settings?.id).toBe('singleton')
    expect(settings?.dwellTime.mode).toBe('fixed')  // Phase 2.7改为fixed
    expect(settings?.dwellTime.fixedThreshold).toBe(30)
  })

  it('应该在设置不存在时创建，存在时跳过', async () => {
    // 场景1：数据库为空，应该创建设置
    const countBefore = await db.settings.count()
    expect(countBefore).toBe(0)
    
    await initializeDatabase()
    
    const countAfter = await db.settings.count()
    expect(countAfter).toBe(1)
    
    const settings = await db.settings.get('singleton')
    expect(settings).toBeDefined()
    expect(settings?.dwellTime.fixedThreshold).toBe(30)  // 默认值
    
    // 场景2：修改设置
    await db.settings.update('singleton', {
      dwellTime: {
        mode: 'fixed',
        fixedThreshold: 90,
        minThreshold: 15,
        maxThreshold: 120,
        calculatedThreshold: 90
      }
    })
    
    const updated = await db.settings.get('singleton')
    expect(updated?.dwellTime.fixedThreshold).toBe(90)
    
    // 场景3：再次调用initializeDatabase，应该检测到count > 0，不重复添加
    // 注意：由于测试环境的版本冲突检测，数据库可能被重建
    // 但重建后count仍然是1（不是2），说明没有重复添加
    await initializeDatabase()
    
    const finalCount = await db.settings.count()
    expect(finalCount).toBe(1)  // 关键：没有重复添加
  })
})

describe('设置管理', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该能获取设置', async () => {
    const settings = await getSettings()
    
    expect(settings.id).toBe('singleton')
    expect(settings.dwellTime).toBeDefined()
    expect(settings.exclusionRules).toBeDefined()
    expect(settings.dataRetention).toBeDefined()
  })

  it('应该能更新设置', async () => {
    await updateSettings({
      dwellTime: {
        mode: 'fixed',
        fixedThreshold: 45,
        minThreshold: 15,
        maxThreshold: 120,
        calculatedThreshold: 45
      }
    })
    
    const updated = await getSettings()
    expect(updated.dwellTime.mode).toBe('fixed')
    expect(updated.dwellTime.fixedThreshold).toBe(45)
  })

  it('应该能更新部分设置', async () => {
    const original = await getSettings()
    
    await updateSettings({
      exclusionRules: {
        ...original.exclusionRules,
        customDomains: ['example.com', 'test.com']
      }
    })
    
    const updated = await getSettings()
    expect(updated.exclusionRules.customDomains).toEqual(['example.com', 'test.com'])
    // 其他设置不变
    expect(updated.dwellTime.mode).toBe(original.dwellTime.mode)
  })
})

describe('页面计数', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('初始页面计数应该为 0', async () => {
    const count = await getPageCount()
    expect(count).toBe(0)
  })

  it('添加访问记录后应该正确计数', async () => {
    // 添加测试数据
    const visit: ConfirmedVisit = {
      id: 'test-1',
      url: 'https://example.com',
      title: 'Test Page',
      domain: 'example.com',
      meta: null,
      contentSummary: null,
      analysis: {
        keywords: ['test'],
        topics: ['technology'],
        language: 'en'
      },
      duration: 60,
      interactionCount: 5,
      visitTime: Date.now(),
      status: 'qualified',
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
      analysisRetainUntil: -1
    }
    
    await db.confirmedVisits.add(visit)
    
    const count = await getPageCount()
    expect(count).toBe(1)
  })

  it('应该能添加多个访问记录', async () => {
    const visits: ConfirmedVisit[] = [
      {
        id: 'test-1',
        url: 'https://example.com/1',
        title: 'Page 1',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: ['test'], topics: ['technology'], language: 'en' },
        duration: 60,
        interactionCount: 5,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      },
      {
        id: 'test-2',
        url: 'https://example.com/2',
        title: 'Page 2',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: ['test'], topics: ['design'], language: 'en' },
        duration: 90,
        interactionCount: 10,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }
    ]
    
    await db.confirmedVisits.bulkAdd(visits)
    
    const count = await getPageCount()
    expect(count).toBe(2)
  })
})

describe('数据库索引', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该能按域名查询', async () => {
    const visits: ConfirmedVisit[] = [
      {
        id: 'test-1',
        url: 'https://example.com/1',
        title: 'Page 1',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 60,
        interactionCount: 5,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      },
      {
        id: 'test-2',
        url: 'https://another.com/1',
        title: 'Page 2',
        domain: 'another.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 90,
        interactionCount: 10,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }
    ]
    
    await db.confirmedVisits.bulkAdd(visits)
    
    const exampleVisits = await db.confirmedVisits
      .where('domain')
      .equals('example.com')
      .toArray()
    
    expect(exampleVisits).toHaveLength(1)
    expect(exampleVisits[0].domain).toBe('example.com')
  })

  it('应该能按时间排序查询', async () => {
    const now = Date.now()
    const visits: ConfirmedVisit[] = [
      {
        id: 'test-1',
        url: 'https://example.com/1',
        title: 'Old Page',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 60,
        interactionCount: 5,
        visitTime: now - 1000,
        status: 'qualified',
        contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      },
      {
        id: 'test-2',
        url: 'https://example.com/2',
        title: 'New Page',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 90,
        interactionCount: 10,
        visitTime: now,
        status: 'qualified',
        contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }
    ]
    
    await db.confirmedVisits.bulkAdd(visits)
    
    const sortedVisits = await db.confirmedVisits
      .orderBy('visitTime')
      .reverse()
      .toArray()
    
    expect(sortedVisits[0].title).toBe('New Page')
    expect(sortedVisits[1].title).toBe('Old Page')
  })
})

// ==================== Phase 2.7: 推荐功能测试 ====================

describe('Phase 2.7 推荐功能', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('getRecommendationStats', () => {
    it('应该返回正确的推荐统计', async () => {
      const now = Date.now()
      
      const testRecommendations: Recommendation[] = [
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'TechCrunch',
          sourceUrl: 'https://techcrunch.com',
          recommendedAt: now - 1000,
          score: 0.9,
          isRead: true,
          clickedAt: now,
          readDuration: 150,
          scrollDepth: 0.8,
          effectiveness: 'effective'
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要 2',
          source: 'Hacker News',
          sourceUrl: 'https://news.ycombinator.com',
          recommendedAt: now - 2000,
          score: 0.8,
          isRead: true,
          clickedAt: now - 1000,
          readDuration: 60,
          scrollDepth: 0.5,
          effectiveness: 'neutral'
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '推荐 3',
          summary: '摘要 3',
          source: 'TechCrunch',
          sourceUrl: 'https://techcrunch.com',
          recommendedAt: now - 3000,
          score: 0.7,
          isRead: false,
          feedback: 'dismissed',
          feedbackAt: now - 2000,
          effectiveness: 'ineffective'
        }
      ]
      
      await db.recommendations.bulkAdd(testRecommendations)
      
      const stats = await getRecommendationStats(7)
      
      expect(stats.totalCount).toBe(3)
      expect(stats.readCount).toBe(2)
      expect(stats.unreadCount).toBe(1)
      expect(stats.dismissedCount).toBe(1)
      expect(stats.readLaterCount).toBe(0)
      expect(stats.avgReadDuration).toBe((150 + 60) / 2)
      
      expect(stats.topSources).toHaveLength(2)
      expect(stats.topSources[0].source).toBe('TechCrunch')
      expect(stats.topSources[0].count).toBe(2)
    })

    it('应该只统计指定天数内的数据', async () => {
      const now = Date.now()
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000
      
      await db.recommendations.bulkAdd([
        {
          id: 'old',
          url: 'https://example.com/old',
          title: '旧推荐',
          summary: '旧摘要',
          source: 'Old Source',
          sourceUrl: 'https://old.com',
          recommendedAt: eightDaysAgo,
          score: 0.5,
          isRead: false
        },
        {
          id: 'new',
          url: 'https://example.com/new',
          title: '新推荐',
          summary: '新摘要',
          source: 'New Source',
          sourceUrl: 'https://new.com',
          recommendedAt: now,
          score: 0.9,
          isRead: false
        }
      ])
      
      const stats = await getRecommendationStats(7)
      expect(stats.totalCount).toBe(1)
    })

    it('应该处理空数据', async () => {
      const stats = await getRecommendationStats(7)
      
      expect(stats.totalCount).toBe(0)
      expect(stats.readCount).toBe(0)
      expect(stats.unreadCount).toBe(0)
      expect(stats.avgReadDuration).toBe(0)
      expect(stats.topSources).toHaveLength(0)
    })
  })

  describe('getStorageStats', () => {
    it('应该返回正确的存储统计', async () => {
      await db.recommendations.add({
        id: '1',
        url: 'https://example.com/1',
        title: '推荐 1',
        summary: '摘要',
        source: 'Source',
        sourceUrl: 'https://source.com',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      const stats = await getStorageStats()
      
      // 验证 StorageStats 字段
      expect(stats.pageCount).toBeGreaterThanOrEqual(0)
      expect(stats.recommendationCount).toBe(1)
      expect(stats.totalSizeMB).toBeGreaterThan(0)
      expect(stats.pendingCount).toBeGreaterThanOrEqual(0)
      expect(stats.confirmedCount).toBeGreaterThanOrEqual(0)
      expect(stats.avgDailyPages).toBeGreaterThanOrEqual(0)
    })
  })

  describe('markAsRead', () => {
    it('应该正确标记推荐为已读（深度阅读）', async () => {
      await db.recommendations.add({
        id: 'test',
        url: 'https://example.com/test',
        title: '测试推荐',
        summary: '摘要',
        source: 'Test Source',
        sourceUrl: 'https://test.com',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      await markAsRead('test', 150, 0.8)
      
      const updated = await db.recommendations.get('test')
      
      expect(updated?.isRead).toBe(true)
      expect(updated?.clickedAt).toBeGreaterThan(0)
      expect(updated?.readDuration).toBe(150)
      expect(updated?.scrollDepth).toBe(0.8)
      expect(updated?.effectiveness).toBe('effective')
    })

    it('应该正确评估浅度阅读', async () => {
      await db.recommendations.add({
        id: 'test',
        url: 'https://example.com/test',
        title: '测试推荐',
        summary: '摘要',
        source: 'Test Source',
        sourceUrl: 'https://test.com',
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false
      })
      
      await markAsRead('test', 60, 0.5)
      
      const updated = await db.recommendations.get('test')
      expect(updated?.effectiveness).toBe('neutral')
    })

    it('应该在推荐不存在时抛出错误', async () => {
      await expect(markAsRead('nonexistent')).rejects.toThrow(
        '推荐记录不存在: nonexistent'
      )
    })
  })

  describe('dismissRecommendations', () => {
    it('应该正确标记推荐为"不想读"', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要 2',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.8,
          isRead: false
        }
      ])
      
      await dismissRecommendations(['1', '2'])
      
      const dismissed1 = await db.recommendations.get('1')
      const dismissed2 = await db.recommendations.get('2')
      
      expect(dismissed1?.feedback).toBe('dismissed')
      expect(dismissed1?.effectiveness).toBe('ineffective')
      expect(dismissed1?.feedbackAt).toBeGreaterThan(0)
      
      expect(dismissed2?.feedback).toBe('dismissed')
      expect(dismissed2?.effectiveness).toBe('ineffective')
    })

    it('应该支持批量操作', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`)
      
      await db.recommendations.bulkAdd(
        ids.map(id => ({
          id,
          url: `https://example.com/${id}`,
          title: `推荐 ${id}`,
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: Date.now(),
          score: 0.8,
          isRead: false
        }))
      )
      
      await dismissRecommendations(ids)
      
      const dismissed = await db.recommendations
        .where('id')
        .anyOf(ids)
        .toArray()
      
      expect(dismissed).toHaveLength(10)
      expect(dismissed.every(r => r.feedback === 'dismissed')).toBe(true)
    })
  })

  describe('getUnreadRecommendations', () => {
    it('应该返回未读推荐（按时间倒序）', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要 1',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 3000,
          score: 0.9,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要 2',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 2000,
          score: 0.8,
          isRead: true
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '推荐 3',
          summary: '摘要 3',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 1000,
          score: 0.7,
          isRead: false
        }
      ])
      
      const unread = await getUnreadRecommendations()
      
      expect(unread).toHaveLength(2)
      expect(unread[0].id).toBe('3')
      expect(unread[1].id).toBe('1')
    })

    it('应该限制返回数量', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd(
        Array.from({ length: 100 }, (_, i) => ({
          id: `${i}`,
          url: `https://example.com/${i}`,
          title: `推荐 ${i}`,
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - i * 1000,
          score: 0.8,
          isRead: false
        }))
      )
      
      const unread = await getUnreadRecommendations(20)
      expect(unread).toHaveLength(20)
    })

    it('应该处理空数据', async () => {
      const unread = await getUnreadRecommendations()
      expect(unread).toHaveLength(0)
    })
  })
})

// ==================== 用户画像功能测试 ====================

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
      const { Topic } = await import('@/core/profile/topics')
      
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
      const { Topic } = await import('@/core/profile/topics')
      
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

// ==================== 兴趣快照功能测试 ====================

describe('兴趣快照管理', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('saveInterestSnapshot & getInterestHistory', () => {
    it('应该保存并获取兴趣快照', async () => {
      const { saveInterestSnapshot, getInterestHistory } = await import('./db')
      const { Topic } = await import('@/core/profile/topics')
      
      const snapshot = {
        id: 'snapshot-1',
        timestamp: Date.now(),
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {
          [Topic.TECHNOLOGY]: 0.8,
          [Topic.DESIGN]: 0.2,
        },
        topKeywords: [
          { word: 'react', weight: 0.9 },
        ],
        basedOnPages: 100,
        trigger: 'manual' as const,
        changeNote: '首次建立画像',
      }

      await saveInterestSnapshot(snapshot)
      
      const history = await getInterestHistory(10)
      expect(history).toHaveLength(1)
      expect(history[0].primaryTopic).toBe(Topic.TECHNOLOGY)
    })

    it('应该按时间倒序返回快照', async () => {
      const { saveInterestSnapshot, getInterestHistory } = await import('./db')
      const { Topic } = await import('@/core/profile/topics')
      
      const now = Date.now()
      
      await saveInterestSnapshot({
        id: 'snapshot-1',
        timestamp: now - 2000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-2',
        timestamp: now,
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'primary_change' as const,
      })

      const history = await getInterestHistory(10)
      expect(history).toHaveLength(2)
      expect(history[0].id).toBe('snapshot-2') // 最新的在前
      expect(history[1].id).toBe('snapshot-1')
    })
  })

  describe('getPrimaryTopicChanges', () => {
    it('应该只返回主导兴趣变化的快照', async () => {
      const { saveInterestSnapshot, getPrimaryTopicChanges } = await import('./db')
      const { Topic } = await import('@/core/profile/topics')
      
      await saveInterestSnapshot({
        id: 'snapshot-1',
        timestamp: Date.now() - 3000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-2',
        timestamp: Date.now() - 2000,
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'primary_change' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-3',
        timestamp: Date.now(),
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.85,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 150,
        trigger: 'manual' as const,
      })

      const changes = await getPrimaryTopicChanges(10)
      
      // 只应该返回 primary_change 触发的快照
      expect(changes).toHaveLength(1)
      expect(changes[0].trigger).toBe('primary_change')
    })
  })

  describe('getTopicHistory', () => {
    it('应该返回特定主题的快照历史', async () => {
      const { saveInterestSnapshot, getTopicHistory } = await import('./db')
      const { Topic } = await import('@/core/profile/topics')
      
      await saveInterestSnapshot({
        id: 'snapshot-1',
        timestamp: Date.now() - 2000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-2',
        timestamp: Date.now(),
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'manual' as const,
      })

      const techHistory = await getTopicHistory(Topic.TECHNOLOGY, 10)
      expect(techHistory).toHaveLength(1)
      expect(techHistory[0].primaryTopic).toBe(Topic.TECHNOLOGY)
    })
  })

  describe('cleanOldSnapshots', () => {
    it('应该删除超过指定月数的快照', async () => {
      const { saveInterestSnapshot, getInterestHistory, cleanOldSnapshots } = await import('./db')
      const { Topic } = await import('@/core/profile/topics')
      
      const now = Date.now()
      const sevenMonthsAgo = now - 7 * 30 * 24 * 60 * 60 * 1000
      
      // 添加旧快照
      await saveInterestSnapshot({
        id: 'old-snapshot',
        timestamp: sevenMonthsAgo,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      // 添加新快照
      await saveInterestSnapshot({
        id: 'new-snapshot',
        timestamp: now,
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'manual' as const,
      })

      const beforeClean = await getInterestHistory(100)
      expect(beforeClean).toHaveLength(2)
      
      const deleted = await cleanOldSnapshots(6)
      expect(deleted).toBe(1)
      
      const afterClean = await getInterestHistory(100)
      expect(afterClean).toHaveLength(1)
      expect(afterClean[0].id).toBe('new-snapshot')
    })
  })
})

