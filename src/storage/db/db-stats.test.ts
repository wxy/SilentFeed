/**
 * 统计功能测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, getUnrecommendedArticleCount } from './index'
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
    
    // 添加一个订阅源，包含 3 篇文章（2 篇未分析，1 篇已分析）
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
      latestArticles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          link: 'https://example.com/1',
          published: now,
          fetched: now,
          read: false,
          starred: false
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
          starred: false
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
      ]
    })

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(2)  // 只有 article-1 和 article-2 未分析
  })

  it('应该只统计已订阅源（source=subscribed）', async () => {
    const now = Date.now()
    
    // 订阅源：2 篇未分析
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
      latestArticles: [
        {
          id: 'a1',
          feedId: 'feed-1',
          title: 'A1',
          link: 'https://example.com/a1',
          published: now,
          fetched: now,
          read: false,
          starred: false
        },
        {
          id: 'a2',
          feedId: 'feed-1',
          title: 'A2',
          link: 'https://example.com/a2',
          published: now,
          fetched: now,
          read: false,
          starred: false
        }
      ]
    })

    // 候选源：3 篇未分析（不应该统计）
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
      latestArticles: [
        {
          id: 'b1',
          feedId: 'feed-2',
          title: 'B1',
          link: 'https://example.com/b1',
          published: now,
          fetched: now,
          read: false,
          starred: false
        },
        {
          id: 'b2',
          feedId: 'feed-2',
          title: 'B2',
          link: 'https://example.com/b2',
          published: now,
          fetched: now,
          read: false,
          starred: false
        },
        {
          id: 'b3',
          feedId: 'feed-2',
          title: 'B3',
          link: 'https://example.com/b3',
          published: now,
          fetched: now,
          read: false,
          starred: false
        }
      ]
    })

    const count = await getUnrecommendedArticleCount('subscribed')
    expect(count).toBe(2)  // 只统计订阅源
  })

  it('应该统计所有源（source=all）', async () => {
    const now = Date.now()
    
    // 订阅源：2 篇
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
      latestArticles: [
        {
          id: 'a1',
          feedId: 'feed-1',
          title: 'A1',
          link: 'https://example.com/a1',
          published: now,
          fetched: now,
          read: false,
          starred: false
        },
        {
          id: 'a2',
          feedId: 'feed-1',
          title: 'A2',
          link: 'https://example.com/a2',
          published: now,
          fetched: now,
          read: false,
          starred: false
        }
      ]
    })

    // 候选源：3 篇
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
      latestArticles: [
        {
          id: 'b1',
          feedId: 'feed-2',
          title: 'B1',
          link: 'https://example.com/b1',
          published: now,
          fetched: now,
          read: false,
          starred: false
        },
        {
          id: 'b2',
          feedId: 'feed-2',
          title: 'B2',
          link: 'https://example.com/b2',
          published: now,
          fetched: now,
          read: false,
          starred: false
        },
        {
          id: 'b3',
          feedId: 'feed-2',
          title: 'B3',
          link: 'https://example.com/b3',
          published: now,
          fetched: now,
          read: false,
          starred: false
        }
      ]
    })

    const count = await getUnrecommendedArticleCount('all')
    expect(count).toBe(5)  // 统计所有源
  })

  it('应该忽略没有文章的源', async () => {
    const now = Date.now()
    
    // 有文章的源
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
      latestArticles: [
        {
          id: 'a1',
          feedId: 'feed-1',
          title: 'A1',
          link: 'https://example.com/a1',
          published: now,
          fetched: now,
          read: false,
          starred: false
        }
      ]
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
      latestArticles: []
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
      recommendedCount: 0
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
