/**
 * 数据库迁移测试 - Version 10 → Version 11
 * 
 * 测试场景：
 * 1. 空数据库直接升级到 v11
 * 2. v10 数据库（包含 latestArticles）迁移到 v11
 * 3. 迁移后数据完整性验证
 * 4. 向后兼容性验证
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import type { DiscoveredFeed, FeedArticle } from '@/types/rss'

describe('数据库迁移 v10 → v11', () => {
  let testDb: Dexie

  beforeEach(async () => {
    // 每次测试前清理数据库
    if (testDb) {
      await testDb.delete()
    }
  })

  it('应该成功创建 v11 数据库（空数据库场景）', async () => {
    // 模拟新安装，直接创建 v11
    testDb = new Dexie('FeedAIMuter-v11-empty-test')
    
    // 定义 v11 schema
    testDb.version(11).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [feedId+read], [recommended+published]'
    })

    await testDb.open()

    // 验证表存在
    expect(testDb.table('discoveredFeeds')).toBeDefined()
    expect(testDb.table('feedArticles')).toBeDefined()

    // 验证表为空
    const feedsCount = await testDb.table('discoveredFeeds').count()
    const articlesCount = await testDb.table('feedArticles').count()
    
    expect(feedsCount).toBe(0)
    expect(articlesCount).toBe(0)

    await testDb.delete()
  })

  it('应该正确迁移 v10 数据到 v11（包含文章数据）', async () => {
    // 第一步：创建 v10 数据库并添加数据
    const dbV10 = new Dexie('FeedAIMuter-v10-migration-test')
    
    dbV10.version(10).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]'
    })

    await dbV10.open()

    // 添加测试数据（v10 格式，包含 latestArticles）
    const testFeed: DiscoveredFeed = {
      id: 'test-feed-1',
      url: 'https://example.com/feed.xml',
      title: '测试源',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: Date.now(),
      isActive: true,
      articleCount: 3,
      unreadCount: 3,
      recommendedCount: 0,
      latestArticles: [
        {
          id: 'article-1',
          feedId: 'test-feed-1',
          title: '文章 1',
          link: 'https://example.com/article-1',
          description: '描述 1',
          published: Date.now() - 86400000, // 1天前
          fetched: Date.now(),
          read: false,
          starred: false
        },
        {
          id: 'article-2',
          feedId: 'test-feed-1',
          title: '文章 2',
          link: 'https://example.com/article-2',
          description: '描述 2',
          published: Date.now() - 172800000, // 2天前
          fetched: Date.now(),
          read: true,
          starred: false
        },
        {
          id: 'article-3',
          feedId: 'test-feed-1',
          title: '文章 3',
          link: 'https://example.com/article-3',
          description: '描述 3',
          published: Date.now() - 259200000, // 3天前
          fetched: Date.now(),
          read: false,
          starred: true,
          analysis: {
            topicProbabilities: {
              technology: 0.8,
              science: 0.2,
              business: 0,
              design: 0,
              arts: 0,
              health: 0,
              sports: 0,
              entertainment: 0,
              news: 0,
              education: 0,
              other: 0
            },
            confidence: 0.9,
            provider: 'test'
          }
        }
      ]
    }

    await dbV10.table('discoveredFeeds').add(testFeed)
    await dbV10.close()

    // 第二步：升级到 v11
    testDb = new Dexie('FeedAIMuter-v10-migration-test')
    
    // 定义 v11 schema（包含迁移逻辑）
    testDb.version(11).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [feedId+read], [recommended+published]'
    }).upgrade(async (tx) => {
      // 迁移逻辑：从 latestArticles 复制到 feedArticles 表
      const feeds = await tx.table('discoveredFeeds').toArray() as DiscoveredFeed[]
      
      for (const feed of feeds) {
        if (feed.latestArticles && feed.latestArticles.length > 0) {
          const articles: FeedArticle[] = feed.latestArticles.map(article => ({
            ...article,
            feedId: feed.id
          }))
          
          // 批量插入，忽略重复（基于 link 的唯一索引）
          try {
            await tx.table('feedArticles').bulkAdd(articles)
          } catch (error: any) {
            // 忽略重复键错误
            if (error.name !== 'BulkError') {
              throw error
            }
          }
        }
      }
    })

    await testDb.open()

    // 第三步：验证迁移结果
    const migratedFeed = await testDb.table('discoveredFeeds').get('test-feed-1') as DiscoveredFeed
    const migratedArticles = await testDb.table('feedArticles')
      .where('feedId').equals('test-feed-1')
      .toArray() as FeedArticle[]

    // 验证 Feed 数据保留
    expect(migratedFeed).toBeDefined()
    expect(migratedFeed.title).toBe('测试源')
    expect(migratedFeed.latestArticles).toBeDefined() // 向后兼容

    // 验证文章已迁移到 feedArticles 表
    expect(migratedArticles).toHaveLength(3)
    
    // 验证文章内容
    const article1 = migratedArticles.find(a => a.id === 'article-1')
    const article2 = migratedArticles.find(a => a.id === 'article-2')
    const article3 = migratedArticles.find(a => a.id === 'article-3')
    
    expect(article1).toBeDefined()
    expect(article1?.title).toBe('文章 1')
    expect(article1?.read).toBe(false)
    expect(article1?.feedId).toBe('test-feed-1')
    
    expect(article2).toBeDefined()
    expect(article2?.read).toBe(true)
    
    expect(article3).toBeDefined()
    expect(article3?.starred).toBe(true)
    expect(article3?.analysis).toBeDefined()
    expect(article3?.analysis?.topicProbabilities.technology).toBe(0.8)

    await testDb.delete()
  })

  it('应该正确处理空文章列表的迁移', async () => {
    // 创建 v10 数据库
    const dbV10 = new Dexie('FeedAIMuter-v10-empty-articles-test')
    
    dbV10.version(10).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]'
    })

    await dbV10.open()

    // 添加没有文章的 Feed
    const emptyFeed: DiscoveredFeed = {
      id: 'empty-feed',
      url: 'https://example.com/empty.xml',
      title: '空源',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: Date.now(),
      isActive: true,
      articleCount: 0,
      unreadCount: 0,
      recommendedCount: 0,
      latestArticles: []
    }

    await dbV10.table('discoveredFeeds').add(emptyFeed)
    await dbV10.close()

    // 升级到 v11
    testDb = new Dexie('FeedAIMuter-v10-empty-articles-test')
    
    testDb.version(11).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [feedId+read], [recommended+published]'
    }).upgrade(async (tx) => {
      const feeds = await tx.table('discoveredFeeds').toArray() as DiscoveredFeed[]
      
      for (const feed of feeds) {
        if (feed.latestArticles && feed.latestArticles.length > 0) {
          const articles: FeedArticle[] = feed.latestArticles.map(article => ({
            ...article,
            feedId: feed.id
          }))
          
          try {
            await tx.table('feedArticles').bulkAdd(articles)
          } catch (error: any) {
            if (error.name !== 'BulkError') {
              throw error
            }
          }
        }
      }
    })

    await testDb.open()

    // 验证
    const feed = await testDb.table('discoveredFeeds').get('empty-feed')
    const articles = await testDb.table('feedArticles')
      .where('feedId').equals('empty-feed')
      .toArray()

    expect(feed).toBeDefined()
    expect(articles).toHaveLength(0)

    await testDb.delete()
  })

  it('应该正确处理多个 Feed 的批量迁移', async () => {
    // 创建 v10 数据库
    const dbV10 = new Dexie('FeedAIMuter-v10-multiple-feeds-test')
    
    dbV10.version(10).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]'
    })

    await dbV10.open()

    // 添加多个 Feed
    const feeds: DiscoveredFeed[] = [
      {
        id: 'feed-1',
        url: 'https://example.com/feed1.xml',
        title: '源 1',
        status: 'subscribed',
        discoveredFrom: 'manual',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 2,
        unreadCount: 2,
        recommendedCount: 0,
        latestArticles: [
          {
            id: 'f1-article-1',
            feedId: 'feed-1',
            title: 'Feed1 文章 1',
            link: 'https://example.com/f1/a1',
            published: Date.now(),
            fetched: Date.now(),
            read: false,
            starred: false
          },
          {
            id: 'f1-article-2',
            feedId: 'feed-1',
            title: 'Feed1 文章 2',
            link: 'https://example.com/f1/a2',
            published: Date.now(),
            fetched: Date.now(),
            read: false,
            starred: false
          }
        ]
      },
      {
        id: 'feed-2',
        url: 'https://example.com/feed2.xml',
        title: '源 2',
        status: 'subscribed',
        discoveredFrom: 'manual',
        discoveredAt: Date.now(),
        isActive: true,
        articleCount: 1,
        unreadCount: 1,
        recommendedCount: 0,
        latestArticles: [
          {
            id: 'f2-article-1',
            feedId: 'feed-2',
            title: 'Feed2 文章 1',
            link: 'https://example.com/f2/a1',
            published: Date.now(),
            fetched: Date.now(),
            read: false,
            starred: false
          }
        ]
      }
    ]

    await dbV10.table('discoveredFeeds').bulkAdd(feeds)
    await dbV10.close()

    // 升级到 v11
    testDb = new Dexie('FeedAIMuter-v10-multiple-feeds-test')
    
    testDb.version(11).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]',
      feedArticles: 'id, feedId, link, published, recommended, read, [feedId+published], [feedId+read], [recommended+published]'
    }).upgrade(async (tx) => {
      const feeds = await tx.table('discoveredFeeds').toArray() as DiscoveredFeed[]
      
      for (const feed of feeds) {
        if (feed.latestArticles && feed.latestArticles.length > 0) {
          const articles: FeedArticle[] = feed.latestArticles.map(article => ({
            ...article,
            feedId: feed.id
          }))
          
          try {
            await tx.table('feedArticles').bulkAdd(articles)
          } catch (error: any) {
            if (error.name !== 'BulkError') {
              throw error
            }
          }
        }
      }
    })

    await testDb.open()

    // 验证迁移结果
    const totalArticles = await testDb.table('feedArticles').count()
    expect(totalArticles).toBe(3) // 2 + 1

    const feed1Articles = await testDb.table('feedArticles')
      .where('feedId').equals('feed-1')
      .toArray()
    expect(feed1Articles).toHaveLength(2)

    const feed2Articles = await testDb.table('feedArticles')
      .where('feedId').equals('feed-2')
      .toArray()
    expect(feed2Articles).toHaveLength(1)

    await testDb.delete()
  })

  it('应该正确处理重复 URL 的文章（基于 link 索引去重）', async () => {
    // 这个测试验证如果有重复的 link，迁移应该优雅处理
    const dbV10 = new Dexie('FeedAIMuter-v10-duplicate-test')
    
    dbV10.version(10).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]'
    })

    await dbV10.open()

    // 添加包含重复 link 的文章（虽然正常情况不应该出现）
    const feedWithDuplicates: DiscoveredFeed = {
      id: 'dup-feed',
      url: 'https://example.com/dup.xml',
      title: '重复测试源',
      status: 'subscribed',
      discoveredFrom: 'manual',
      discoveredAt: Date.now(),
      isActive: true,
      articleCount: 2,
      unreadCount: 2,
      recommendedCount: 0,
      latestArticles: [
        {
          id: 'dup-article-1',
          feedId: 'dup-feed',
          title: '文章 1',
          link: 'https://example.com/same-link', // 重复 link
          published: Date.now(),
          fetched: Date.now(),
          read: false,
          starred: false
        },
        {
          id: 'dup-article-2',
          feedId: 'dup-feed',
          title: '文章 2',
          link: 'https://example.com/same-link', // 重复 link
          published: Date.now(),
          fetched: Date.now(),
          read: false,
          starred: false
        }
      ]
    }

    await dbV10.table('discoveredFeeds').add(feedWithDuplicates)
    await dbV10.close()

    // 升级到 v11（link 有唯一索引）
    testDb = new Dexie('FeedAIMuter-v10-duplicate-test')
    
    testDb.version(11).stores({
      discoveredFeeds: 'id, url, status, discoveredAt, [status+isActive]',
      feedArticles: 'id, feedId, &link, published, recommended, read, [feedId+published], [feedId+read], [recommended+published]' // &link = 唯一索引
    }).upgrade(async (tx) => {
      const feeds = await tx.table('discoveredFeeds').toArray() as DiscoveredFeed[]
      
      for (const feed of feeds) {
        if (feed.latestArticles && feed.latestArticles.length > 0) {
          // 去重：使用 Map 按 link 去重
          const uniqueArticles = new Map<string, FeedArticle>()
          
          for (const article of feed.latestArticles) {
            if (!uniqueArticles.has(article.link)) {
              uniqueArticles.set(article.link, {
                ...article,
                feedId: feed.id
              })
            }
          }
          
          const articles = Array.from(uniqueArticles.values())
          
          try {
            await tx.table('feedArticles').bulkAdd(articles)
          } catch (error: any) {
            if (error.name !== 'BulkError') {
              throw error
            }
          }
        }
      }
    })

    await testDb.open()

    // 验证：应该只有 1 篇文章（去重后）
    const articles = await testDb.table('feedArticles')
      .where('feedId').equals('dup-feed')
      .toArray()

    expect(articles).toHaveLength(1)
    expect(articles[0].link).toBe('https://example.com/same-link')

    await testDb.delete()
  })
})
