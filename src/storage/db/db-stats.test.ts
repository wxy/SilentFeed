/**
 * 统计功能测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  db, 
  getUnrecommendedArticleCount,
  getStorageStats,
  getAnalysisStats,
  getAIAnalysisStats,
  getRSSArticleCount,
  getRecommendationFunnel,
  getRecommendationStats
} from './index'
import { Topic } from "@/core/profile/topics"

describe('getUnrecommendedArticleCount', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该在没有订阅源时返回 0', async () => {
    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(0)
  })

  it('应该正确统计订阅源中未分析的文章', async () => {
    const now = Date.now()
    
    // Phase 10: 直接插入 feedArticles 表
    await db.feedArticles.bulkAdd([
      {
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Article 1',
        link: 'https://example.com/1',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'article-2',
        feedId: 'feed-1',
        title: 'Article 2',
        link: 'https://example.com/2',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'article-3',
        feedId: 'feed-1',
        title: 'Article 3',
        link: 'https://example.com/3',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true,  // 在源中
        analysis: {  // 已分析
          topicProbabilities: {
            [Topic.TECHNOLOGY]: 0.8,
            [Topic.SCIENCE]: 0.1,
            [Topic.BUSINESS]: 0,
            [Topic.DESIGN]: 0,
            [Topic.ARTS]: 0,
            [Topic.HEALTH]: 0,
            [Topic.SPORTS]: 0,
            [Topic.ENTERTAINMENT]: 0,
            [Topic.NEWS]: 0,
            [Topic.EDUCATION]: 0.1,
            [Topic.OTHER]: 0
          },
          confidence: 0.8,
          provider: 'openai'
        }
      }
    ])
    
    // 添加 feed（用于过滤）
    await db.discoveredFeeds.add({
      id: 'feed-1',
      url: 'https://example.com/feed',
      title: 'Test Feed',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 3,
      unreadCount: 2,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(2)  // 只有 article-1 和 article-2 未分析
  })

  it('应该只统计已订阅源（source=subscribed）', async () => {
    const now = Date.now()
    
    // Phase 10: 直接插入 feedArticles 表
    // 订阅源：2 篇未分析
    await db.feedArticles.bulkAdd([
      {
        id: 'a1',
        feedId: 'feed-1',
        title: 'A1',
        link: 'https://example.com/a1',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'a2',
        feedId: 'feed-1',
        title: 'A2',
        link: 'https://example.com/a2',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      // 候选源：3 篇未分析（不应该统计）
      {
        id: 'b1',
        feedId: 'feed-2',
        title: 'B1',
        link: 'https://example.com/b1',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'b2',
        feedId: 'feed-2',
        title: 'B2',
        link: 'https://example.com/b2',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'b3',
        feedId: 'feed-2',
        title: 'B3',
        link: 'https://example.com/b3',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      }
    ])
    
    // 添加 feed（用于过滤）
    await db.discoveredFeeds.add({
      id: 'feed-1',
      url: 'https://example.com/feed1',
      title: 'Subscribed Feed',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 2,
      unreadCount: 2,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    await db.discoveredFeeds.add({
      id: 'feed-2',
      url: 'https://example.com/feed2',
      title: 'Candidate Feed',
      status: 'candidate',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 3,
      unreadCount: 3,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(2)  // 只统计订阅源
  })

  it('应该统计所有源（source=all）', async () => {
    const now = Date.now()
    
    // Phase 10: 直接插入 feedArticles 表
    // 订阅源：2 篇
    await db.feedArticles.bulkAdd([
      {
        id: 'a1',
        feedId: 'feed-1',
        title: 'A1',
        link: 'https://example.com/a1',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'a2',
        feedId: 'feed-1',
        title: 'A2',
        link: 'https://example.com/a2',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      // 候选源：3 篇
      {
        id: 'b1',
        feedId: 'feed-2',
        title: 'B1',
        link: 'https://example.com/b1',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'b2',
        feedId: 'feed-2',
        title: 'B2',
        link: 'https://example.com/b2',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      },
      {
        id: 'b3',
        feedId: 'feed-2',
        title: 'B3',
        link: 'https://example.com/b3',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      }
    ])
    
    // 添加 feed（用于过滤）
    await db.discoveredFeeds.add({
      id: 'feed-1',
      url: 'https://example.com/feed1',
      title: 'Subscribed Feed',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 2,
      unreadCount: 2,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    await db.discoveredFeeds.add({
      id: 'feed-2',
      url: 'https://example.com/feed2',
      title: 'Candidate Feed',
      status: 'candidate',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 3,
      unreadCount: 3,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    const count = await getUnrecommendedArticleCount('all')
    expect(count).toBe(5)  // 统计所有源
  })

  it('应该忽略没有文章的源', async () => {
    const now = Date.now()
    
    // Phase 10: 直接插入 feedArticles 表
    // 有文章的源
    await db.feedArticles.bulkAdd([
      {
        id: 'a1',
        feedId: 'feed-1',
        title: 'A1',
        link: 'https://example.com/a1',
        published: now,
        fetched: now,
        read: false,
        starred: false,
        inFeed: true  // 在源中
        // 没有 analysis 字段 → 未分析
      }
    ])
    
    // 添加 feed（用于过滤）
    await db.discoveredFeeds.add({
      id: 'feed-1',
      url: 'https://example.com/feed1',
      title: 'Feed with Articles',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 1,
      unreadCount: 1,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    // 空文章数组
    await db.discoveredFeeds.add({
      id: 'feed-2',
      url: 'https://example.com/feed2',
      title: 'Empty Feed',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 0,
      unreadCount: 0,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    // undefined latestArticles
    await db.discoveredFeeds.add({
      id: 'feed-3',
      url: 'https://example.com/feed3',
      title: 'No Articles Feed',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: now,
      isActive: true,
      articleCount: 0,
      unreadCount: 0,
      recommendedCount: 0,
      latestArticles: []  // Phase 10: 不再使用
    })

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(1)  // 只统计 feed-1 的 1 篇
  })

  it('应该在数据库错误时返回 0', async () => {
    // 关闭数据库模拟错误
    await db.close()

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(0)  // 错误时返回 0
  })
})

describe('getRecommendationStats', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('应该统计最近 N 天的推荐并支持活跃过滤', async () => {
    const now = Date.now()
    await db.recommendations.bulkAdd([
      { id: 'r1', recommendedAt: now - 2 * 24 * 60 * 60 * 1000, isRead: true, readDuration: 8, source: 'feedA', effectiveness: 'effective', status: 'active' },
      { id: 'r2', recommendedAt: now - 3 * 24 * 60 * 60 * 1000, isRead: false, source: 'feedA', effectiveness: 'neutral', status: 'active' },
      { id: 'r3', recommendedAt: now - 10 * 24 * 60 * 60 * 1000, isRead: false, source: 'feedB', effectiveness: 'ineffective', status: 'dismissed' }
    ])

    const { getRecommendationStats } = await import('./db-stats')
    const statsAll = await getRecommendationStats(30, false)
    expect(statsAll.totalCount).toBeGreaterThan(0)
    expect(statsAll.readCount).toBe(1)
    expect(statsAll.dismissedCount).toBe(1)

    const statsActive = await getRecommendationStats(30, true)
    expect(statsActive.totalCount).toBe(2)
    expect(statsActive.dismissedCount).toBe(0)
    expect(statsActive.topSources[0].source).toBe('feedA')
  })
})

describe('getAIAnalysisStats 远端 AI 成本与分布', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('应该只统计 openai/anthropic/deepseek 的成本并计算平均成本', async () => {
    const now = Date.now()
    await db.confirmedVisits.bulkAdd([
      { id: 'v1', visitTime: now - 1, analysis: { keywords: ['x'], aiAnalysis: { provider: 'deepseek', cost: 7, currency: 'CNY', tokensUsed: { total: 200 } } } },
      { id: 'v2', visitTime: now - 2, analysis: { keywords: ['y'], aiAnalysis: { provider: 'openai', cost: 1, currency: 'USD', tokensUsed: { total: 100 } } } },
      { id: 'v3', visitTime: now - 3, analysis: { keywords: ['z'], aiAnalysis: { provider: 'anthropic', cost: 2, currency: 'USD', tokensUsed: { total: 150 } } } },
      { id: 'v4', visitTime: now - 4, analysis: { keywords: ['k'] } }
    ])

    const s = await getAIAnalysisStats()
    expect(s.totalPages).toBe(4)
    expect(s.aiAnalyzedPages).toBe(3)
    expect(s.keywordAnalyzedPages).toBe(1)
    expect(s.totalTokens).toBe(200 + 100 + 150)
    expect(s.totalCostUSD).toBe(3)
    expect(s.totalCostCNY).toBe(7)
    expect(s.avgCostPerPage).toBeGreaterThan(0)
  })
  it("getAIAnalysisStats 在空数据时返回安全的默认值", async () => {
    const stats = await getAIAnalysisStats()
    expect(stats.totalPages).toBe(0)
    expect(stats.aiAnalyzedPages).toBe(0)
    expect(stats.keywordAnalyzedPages).toBe(0)
    expect(stats.totalTokens).toBe(0)
    expect(stats.totalCostUSD).toBe(0)
    expect(stats.totalCostCNY).toBe(0)
    expect(stats.avgCostPerPage).toBe(0)
  })
  
  it("getAIAnalysisStats 处理异常记录并跳过", async () => {
    // 注入一条异常 AI 记录
    await db.aiUsage.add({ id: "bad-1", provider: "remote-openai", tokens: -10, currency: "USD", cost: -1, createdAt: Date.now() })
    const stats = await getAIAnalysisStats()
    expect(stats.totalPages).toBe(0)
    expect(stats.totalTokens).toBe(0)
  })
  
  it("getRecommendationStats 在空数据与 onlyActive=true 时返回空集合", async () => {
    const stats = await getRecommendationStats(7, true)
    expect(stats.totalCount).toBe(0)
    expect(stats.topSources.length).toBe(0)
  })
})
