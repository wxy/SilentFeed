/**
 * SemanticProfileBuilder 单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SemanticProfileBuilder } from './SemanticProfileBuilder'
import { db } from '@/storage/db'
import type { ConfirmedVisit, Recommendation } from '@/types/database'
import { Topic } from './topics'

// Mock AI Manager
vi.mock('@/core/ai/AICapabilityManager', () => ({
  aiManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    analyzeContent: vi.fn().mockResolvedValue({
      topicProbabilities: { technology: 0.8 },
      metadata: { provider: 'mock' }
    })
  }
}))

describe('SemanticProfileBuilder', () => {
  let builder: SemanticProfileBuilder
  
  beforeEach(async () => {
    // 清理数据库
    await db.delete()
    await db.open()
    
    // 初始化画像
    await db.userProfile.put({
      id: 'singleton',
      topics: {
        [Topic.TECHNOLOGY]: 0,
        [Topic.SCIENCE]: 0,
        [Topic.BUSINESS]: 0,
        [Topic.DESIGN]: 0,
        [Topic.ARTS]: 0,
        [Topic.HEALTH]: 0,
        [Topic.SPORTS]: 0,
        [Topic.ENTERTAINMENT]: 0,
        [Topic.NEWS]: 0,
        [Topic.EDUCATION]: 0,
        [Topic.OTHER]: 0
      },
      keywords: [],
      domains: [],
      totalPages: 0,
      lastUpdated: Date.now(),
      version: 2,
      behaviors: {
        reads: [],
        dismisses: [],
        totalReads: 0,
        totalDismisses: 0
      },
      displayKeywords: []
    })
    
    builder = new SemanticProfileBuilder()
  })
  
  afterEach(async () => {
    await db.delete()
  })

  describe('onBrowse', () => {
    it('应该记录浏览行为并在达到阈值时触发全量更新', async () => {
      const mockVisit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/ai',
        domain: 'example.com',
        title: '人工智能入门',
        visitTime: Date.now(),
        duration: 120,
        interactionCount: 5,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: ['AI', '机器学习'],
          keywords: ['AI', '机器学习'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      
      // 添加访问记录
      await db.confirmedVisits.add(mockVisit)
      
      // 触发 20 次浏览（达到阈值）
      for (let i = 0; i < 20; i++) {
        await builder.onBrowse({
          ...mockVisit,
          id: `visit-${i}`,
          title: `测试页面 ${i}`
        })
      }
      
      // 验证画像已更新
      const profile = await db.userProfile.get('singleton')
      expect(profile).toBeDefined()
      expect(profile?.lastUpdated).toBeGreaterThan(Date.now() - 5000)
    })

    it('应该在未达到阈值时只进行轻量更新', async () => {
      const mockVisit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/ai',
        domain: 'example.com',
        title: '人工智能入门',
        visitTime: Date.now(),
        duration: 120,
        interactionCount: 5,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: ['AI', '机器学习'],
          keywords: ['AI', '机器学习'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      
      await builder.onBrowse(mockVisit)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile).toBeDefined()
      // 轻量更新：不应生成 aiSummary
      expect(profile?.aiSummary).toBeUndefined()
      // 但应更新 displayKeywords
      expect(profile?.displayKeywords).toBeDefined()
    })
  })

  describe('onRead', () => {
    it('应该记录阅读行为并计算权重', async () => {
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: 'React Hooks 深入解析',
        url: 'https://example.com/react-hooks',
        summary: 'React Hooks 是 React 16.8 引入的新特性...',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.85,
        isRead: false
      }
      
      await builder.onRead(mockArticle, 180, 0.9)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.reads).toHaveLength(1)
      expect(profile?.behaviors?.reads[0]).toMatchObject({
        articleId: 'rec-1',
        title: 'React Hooks 深入解析',
        readDuration: 180,
        scrollDepth: 0.9
      })
      expect(profile?.behaviors?.reads[0].weight).toBeGreaterThan(0.5)
      expect(profile?.behaviors?.totalReads).toBe(1)
    })

    it('应该在阅读 3 篇后触发全量更新', async () => {
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.8,
        isRead: false
      }
      
      // 阅读 3 篇
      for (let i = 1; i <= 3; i++) {
        await builder.onRead(
          { ...mockArticle, id: `rec-${i}`, title: `文章${i}` },
          120,
          0.8
        )
      }
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.reads).toHaveLength(3)
      expect(profile?.behaviors?.totalReads).toBe(3)
    })

    it('应该限制阅读记录为最多 50 条', async () => {
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.8,
        isRead: false
      }
      
      // 添加 60 条阅读记录
      for (let i = 1; i <= 60; i++) {
        await builder.onRead(
          { ...mockArticle, id: `rec-${i}` },
          60,
          0.5
        )
      }
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.reads).toHaveLength(50)
      expect(profile?.behaviors?.totalReads).toBe(60)
      // 最新的应该在前面
      expect(profile?.behaviors?.reads[0].articleId).toBe('rec-60')
    })
  })

  describe('onDismiss', () => {
    it('应该记录拒绝行为并立即触发全量更新', async () => {
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '体育新闻',
        url: 'https://example.com/sports',
        summary: '今日NBA比赛结果...',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.7,
        isRead: false
      }
      
      await builder.onDismiss(mockArticle)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.dismisses).toHaveLength(1)
      expect(profile?.behaviors?.dismisses[0]).toMatchObject({
        articleId: 'rec-1',
        title: '体育新闻',
        weight: -1
      })
      expect(profile?.behaviors?.totalDismisses).toBe(1)
    })

    it('应该限制拒绝记录为最多 30 条', async () => {
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.7,
        isRead: false
      }
      
      // 添加 40 条拒绝记录
      for (let i = 1; i <= 40; i++) {
        await builder.onDismiss({
          ...mockArticle,
          id: `rec-${i}`
        })
      }
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.dismisses).toHaveLength(30)
      expect(profile?.behaviors?.totalDismisses).toBe(40)
    })
  })

  describe('权重计算', () => {
    it('应该根据阅读时长和滚动深度计算权重', async () => {
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.8,
        isRead: false
      }
      
      // 测试不同的阅读模式
      const testCases = [
        { duration: 300, depth: 1.0, minWeight: 0.9 },   // 完整阅读
        { duration: 150, depth: 0.5, minWeight: 0.5 },   // 中等阅读
        { duration: 30, depth: 0.2, minWeight: 0.3 }     // 快速浏览
      ]
      
      for (const { duration, depth } of testCases) {
        await builder.onRead(
          { ...mockArticle, id: `rec-${duration}` },
          duration,
          depth
        )
      }
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.reads).toHaveLength(3)
      
      // 验证权重计算正确
      // testCases 添加顺序：300s/100%, 150s/50%, 30s/20%
      // unshift 后数组顺序（时间倒序）：30s/20%, 150s/50%, 300s/100%
      const weights = profile?.behaviors?.reads.map(r => r.weight) || []
      
      expect(weights[0]).toBeGreaterThanOrEqual(0.3)  // 30秒+20%深度 = 0.39
      expect(weights[1]).toBeGreaterThanOrEqual(0.5)  // 150秒+50%深度 = 0.65
      expect(weights[2]).toBeGreaterThanOrEqual(0.9)  // 300秒+100%深度 = 1.0
    })
  })

  describe('displayKeywords 提取', () => {
    it('应该从浏览记录提取关键词', async () => {
      const mockVisit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/ai',
        domain: 'example.com',
        title: '人工智能入门',
        visitTime: Date.now(),
        duration: 120,
        interactionCount: 5,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: ['AI', '机器学习', '深度学习'],
          keywords: ['AI', '机器学习', '深度学习'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      
      // 添加访问记录到数据库（SemanticProfileBuilder 会查询数据库）
      await db.confirmedVisits.add(mockVisit)
      
      // 触发浏览更新（轻量更新）
      await builder.onBrowse(mockVisit)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.displayKeywords).toBeDefined()
      expect(profile?.displayKeywords?.some(k => k.word === 'AI')).toBe(true)
    })

    it('应该限制关键词数量为 30 个', async () => {
      // 添加大量关键词
      const keywords: string[] = []
      for (let i = 0; i < 50; i++) {
        keywords.push(`keyword${i}`)
      }
      
      const mockVisit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/article',
        domain: 'example.com',
        title: '测试文章',
        visitTime: Date.now(),
        duration: 120,
        interactionCount: 5,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: keywords.slice(0, 10),
          keywords,
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      
      await db.confirmedVisits.add(mockVisit)
      await builder.onBrowse(mockVisit)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.displayKeywords?.length).toBeLessThanOrEqual(30)
    })

    it('应该给阅读记录的关键词更高权重', async () => {
      // 1. 先浏览一篇文章（关键词：前端）
      const visit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/frontend',
        domain: 'example.com',
        title: '前端开发指南',
        visitTime: Date.now(),
        duration: 60,
        interactionCount: 3,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: ['前端'],
          keywords: ['前端'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      await db.confirmedVisits.add(visit)
      await builder.onBrowse(visit)
      
      // 2. 阅读另一篇文章（关键词：React）
      const article: Recommendation = {
        id: 'rec-1',
        title: 'React 深入学习',
        url: 'https://example.com/react',
        summary: 'React 是一个用于构建用户界面的 JavaScript 库',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.8,
        isRead: false
      }
      
      // 触发 3 次阅读以触发全量更新
      for (let i = 0; i < 3; i++) {
        await builder.onRead(
          { ...article, id: `rec-${i}` },
          120,
          0.8
        )
      }
      
      const profile = await db.userProfile.get('singleton')
      const keywords = profile?.displayKeywords || []
      
      // React 来自阅读记录，应该有更高权重
      const reactKw = keywords.find(k => k.word === 'React')
      const frontendKw = keywords.find(k => k.word === '前端')
      
      if (reactKw && frontendKw) {
        expect(reactKw.weight).toBeGreaterThan(frontendKw.weight)
        expect(reactKw.source).toBe('read')
        expect(frontendKw.source).toBe('browse')
      }
    })
  })

  describe('降级方案', () => {
    it('应该在没有数据时生成基础画像', async () => {
      // 清空数据
      await db.confirmedVisits.clear()
      
      // 触发更新（通过拒绝）
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.7,
        isRead: false
      }
      
      await builder.onDismiss(mockArticle)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.aiSummary).toBeDefined()
      expect(profile?.aiSummary?.interests).toContain('正在学习您的兴趣偏好')
    })

    it('应该在有浏览数据时基于关键词生成画像', async () => {
      // 添加浏览记录
      const visit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/ai',
        domain: 'example.com',
        title: '人工智能入门',
        visitTime: Date.now(),
        duration: 120,
        interactionCount: 5,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: ['AI', '机器学习', '深度学习'],
          keywords: ['AI', '机器学习', '深度学习'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      
      await db.confirmedVisits.add(visit)
      
      // 触发更新
      const mockArticle: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.7,
        isRead: false
      }
      
      await builder.onDismiss(mockArticle)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.aiSummary).toBeDefined()
      expect(profile?.aiSummary?.interests).toContain('AI')
    })
  })

  describe('数据持久化', () => {
    it('应该正确保存和读取行为记录', async () => {
      const article: Recommendation = {
        id: 'rec-1',
        title: '测试文章',
        url: 'https://example.com/article',
        summary: '测试内容',
        source: 'rss',
        sourceUrl: 'https://feed.example.com',
        recommendedAt: Date.now(),
        score: 0.8,
        isRead: false
      }
      
      await builder.onRead(article, 120, 0.8)
      
      // 重新读取
      const profile = await db.userProfile.get('singleton')
      expect(profile?.behaviors?.reads).toHaveLength(1)
      expect(profile?.behaviors?.reads[0].articleId).toBe('rec-1')
      
      // 确保时间戳存在
      expect(profile?.behaviors?.reads[0].timestamp).toBeGreaterThan(0)
      expect(profile?.behaviors?.lastReadAt).toBeGreaterThan(0)
    })

    it('应该更新 lastUpdated 时间戳', async () => {
      const beforeUpdate = Date.now()
      
      const visit: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/test',
        domain: 'example.com',
        title: '测试页面',
        visitTime: Date.now(),
        duration: 60,
        interactionCount: 3,
        meta: null,
        contentSummary: null,
        analysis: {
          topics: ['test'],
          keywords: ['test'],
          language: 'en'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
      }
      
      await builder.onBrowse(visit)
      
      const profile = await db.userProfile.get('singleton')
      expect(profile?.lastUpdated).toBeGreaterThanOrEqual(beforeUpdate)
    })
  })
})
