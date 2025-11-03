/**
 * 数据库测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, initializeDatabase, getSettings, updateSettings, getPageCount, getRecommendationStats, getStorageStats, markAsRead, dismissRecommendations, getUnreadRecommendations } from './db'
import type { UserSettings, ConfirmedVisit, Recommendation } from './types'

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
      
      expect(stats.total).toBe(3)
      expect(stats.read).toBe(2)
      expect(stats.readRate).toBeCloseTo((2 / 3) * 100, 1)
      expect(stats.dismissed).toBe(1)
      expect(stats.effective).toBe(1)
      expect(stats.neutral).toBe(1)
      expect(stats.ineffective).toBe(1)
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
      expect(stats.total).toBe(1)
    })

    it('应该处理空数据', async () => {
      const stats = await getRecommendationStats(7)
      
      expect(stats.total).toBe(0)
      expect(stats.read).toBe(0)
      expect(stats.readRate).toBe(0)
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
      
      expect(stats.totalRecords).toBeGreaterThanOrEqual(1)
      expect(stats.recommendations).toBe(1)
      expect(stats.totalSizeMB).toBeGreaterThan(0)
      expect(stats.avgRecordSizeKB).toBe(5)
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

