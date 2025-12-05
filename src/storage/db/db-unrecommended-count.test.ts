import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db, getUnrecommendedArticleCount, initializeDatabase } from './index'
import { Topic } from '@/core/profile/topics'

/**
 * 覆盖 getUnrecommendedArticleCount：
 * - 订阅源统计
 * - 全部源统计
 * - 错误分支（数据库读取异常）
 */

describe('db: getUnrecommendedArticleCount', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该统计订阅源中的未分析文章数量 (source="subscribed")', async () => {
    // 创建两个源：一个 subscribed，一个 discovered
    await db.discoveredFeeds.bulkAdd([
      {
        id: 'feed-sub',
        url: 'https://example.com/feed-sub',
        title: '订阅源',
        status: 'subscribed',
        discoveredFrom: 'manual',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 0,
        recommendedCount: 0,
        unreadCount: 0
      },
      {
        id: 'feed-all',
        url: 'https://example.com/feed-all',
        title: '非订阅源',
        status: 'candidate',
        discoveredFrom: 'auto',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 0,
        recommendedCount: 0,
        unreadCount: 0
      }
    ])

    // 为两个源创建文章；仅统计 inFeed=true 且没有 analysis 的文章
    await db.feedArticles.bulkAdd([
      // 订阅源：2 篇未分析，1 篇已分析
      { id: 'a1', feedId: 'feed-sub', link: 'https://a1', title: 'a1', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false },
      { id: 'a2', feedId: 'feed-sub', link: 'https://a2', title: 'a2', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false },
      { id: 'a3', feedId: 'feed-sub', link: 'https://a3', title: 'a3', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false, analysis: { topicProbabilities: { [Topic.TECHNOLOGY]: 1, [Topic.SCIENCE]: 0, [Topic.BUSINESS]: 0, [Topic.DESIGN]: 0, [Topic.ARTS]: 0, [Topic.HEALTH]: 0, [Topic.SPORTS]: 0, [Topic.ENTERTAINMENT]: 0, [Topic.NEWS]: 0, [Topic.EDUCATION]: 0, [Topic.OTHER]: 0 }, confidence: 0.9, provider: 'test' } },
      // 非订阅源：1 篇未分析
      { id: 'b1', feedId: 'feed-all', link: 'https://b1', title: 'b1', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false }
    ])

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(2)
  })

  it('应该统计所有源中的未分析文章数量 (source="all")，不包含 inFeed=false', async () => {
    await db.discoveredFeeds.bulkAdd([
      { id: 'f1', url: 'https://f1', title: 'f1', status: 'subscribed', discoveredFrom: 'manual', discoveredAt: Date.now(), isActive: true, articleCount: 0, recommendedCount: 0, unreadCount: 0 },
      { id: 'f2', url: 'https://f2', title: 'f2', status: 'candidate', discoveredFrom: 'auto', discoveredAt: Date.now(), isActive: true, articleCount: 0, recommendedCount: 0, unreadCount: 0 }
    ])

    await db.feedArticles.bulkAdd([
      { id: 'c1', feedId: 'f1', link: 'https://c1', title: 'c1', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false },
      { id: 'c2', feedId: 'f1', link: 'https://c2', title: 'c2', published: Date.now(), fetched: Date.now(), inFeed: false, read: false, starred: false }, // 不计数
      { id: 'd1', feedId: 'f2', link: 'https://d1', title: 'd1', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false, analysis: { topicProbabilities: { [Topic.TECHNOLOGY]: 0, [Topic.SCIENCE]: 1, [Topic.BUSINESS]: 0, [Topic.DESIGN]: 0, [Topic.ARTS]: 0, [Topic.HEALTH]: 0, [Topic.SPORTS]: 0, [Topic.ENTERTAINMENT]: 0, [Topic.NEWS]: 0, [Topic.EDUCATION]: 0, [Topic.OTHER]: 0 }, confidence: 0.8, provider: 'test' } }, // 已分析不计数
      { id: 'd2', feedId: 'f2', link: 'https://d2', title: 'd2', published: Date.now(), fetched: Date.now(), inFeed: true, read: false, starred: false }
    ])

    const count = await getUnrecommendedArticleCount('all')
    expect(count).toBe(2) // c1 + d2
  })

  it('应该在数据库读取异常时返回 0（错误分支）', async () => {
    const spy = vi.spyOn(db.discoveredFeeds, 'toArray').mockRejectedValueOnce(new Error('DB error'))
    const count = await getUnrecommendedArticleCount('all')
    expect(count).toBe(0)
    spy.mockRestore()
  })
})
