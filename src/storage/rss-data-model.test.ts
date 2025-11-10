/**
 * RSS 数据模型测试
 * 
 * 验证 discoveredFeeds 和 feedArticles 表的结构
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { db } from "./db"
import type { DiscoveredFeed, FeedArticle } from "../core/rss/types"
import { Topic } from "../core/profile/topics"

describe("RSS 数据模型", () => {
  beforeEach(async () => {
    // 确保数据库已打开
    if (!db.isOpen()) {
      await db.open()
    }
    
    // 清空测试数据
    await db.discoveredFeeds.clear()
    await db.feedArticles.clear()
  })
  
  afterEach(async () => {
    // 清理测试数据
    await db.discoveredFeeds.clear()
    await db.feedArticles.clear()
  })
  
  describe("discoveredFeeds 表", () => {
    it("应该能添加发现的 RSS 源", async () => {
      const feed: DiscoveredFeed = {
        id: "test-feed-1",
        url: "https://example.com/feed",
        title: "Example Feed",
        description: "This is an example feed",
        link: "https://example.com",
        discoveredFrom: "https://example.com/page",
        discoveredAt: Date.now(),
        status: "candidate",
        enabled: true,
      }
      
      await db.discoveredFeeds.add(feed)
      
      const retrieved = await db.discoveredFeeds.get("test-feed-1")
      expect(retrieved).toBeDefined()
      expect(retrieved?.title).toBe("Example Feed")
      expect(retrieved?.status).toBe("candidate")
    })
    
    it("应该能按状态查询 RSS 源", async () => {
      // 添加不同状态的源
      await db.discoveredFeeds.bulkAdd([
        {
          id: "feed-1",
          url: "https://example.com/feed1",
          title: "Feed 1",
          discoveredFrom: "https://example.com",
          discoveredAt: Date.now(),
          status: "candidate",
          enabled: true,
        },
        {
          id: "feed-2",
          url: "https://example.com/feed2",
          title: "Feed 2",
          discoveredFrom: "https://example.com",
          discoveredAt: Date.now(),
          status: "recommended",
          enabled: true,
        },
        {
          id: "feed-3",
          url: "https://example.com/feed3",
          title: "Feed 3",
          discoveredFrom: "https://example.com",
          discoveredAt: Date.now(),
          status: "subscribed",
          subscribedAt: Date.now(),
          enabled: true,
        },
      ])
      
      const candidates = await db.discoveredFeeds.where("status").equals("candidate").toArray()
      const recommended = await db.discoveredFeeds.where("status").equals("recommended").toArray()
      const subscribed = await db.discoveredFeeds.where("status").equals("subscribed").toArray()
      
      expect(candidates).toHaveLength(1)
      expect(recommended).toHaveLength(1)
      expect(subscribed).toHaveLength(1)
    })
    
    it("应该支持质量评估数据", async () => {
      const feed: DiscoveredFeed = {
        id: "feed-with-quality",
        url: "https://example.com/feed",
        title: "Feed with Quality",
        discoveredFrom: "https://example.com",
        discoveredAt: Date.now(),
        status: "recommended",
        enabled: true,
        quality: {
          updateFrequency: 7, // 7 篇/周
          formatValid: true,
          reachable: true,
          score: 85,
          lastChecked: Date.now(),
        },
      }
      
      await db.discoveredFeeds.add(feed)
      
      const retrieved = await db.discoveredFeeds.get("feed-with-quality")
      expect(retrieved?.quality?.score).toBe(85)
      expect(retrieved?.quality?.updateFrequency).toBe(7)
    })
    
    it("应该支持相关性评估数据", async () => {
      const feed: DiscoveredFeed = {
        id: "feed-with-relevance",
        url: "https://example.com/feed",
        title: "Feed with Relevance",
        discoveredFrom: "https://example.com",
        discoveredAt: Date.now(),
        status: "recommended",
        enabled: true,
        relevance: {
          matchScore: 78,
          matchedTopics: [Topic.TECHNOLOGY, Topic.SCIENCE],
          sampleArticles: [
            { title: "Sample Article 1", matchScore: 80 },
            { title: "Sample Article 2", matchScore: 76 },
          ],
          analyzedAt: Date.now(),
        },
      }
      
      await db.discoveredFeeds.add(feed)
      
      const retrieved = await db.discoveredFeeds.get("feed-with-relevance")
      expect(retrieved?.relevance?.matchScore).toBe(78)
      expect(retrieved?.relevance?.matchedTopics).toContain(Topic.TECHNOLOGY)
    })
    
    it("应该能更新源状态", async () => {
      const feed: DiscoveredFeed = {
        id: "feed-status-update",
        url: "https://example.com/feed",
        title: "Feed for Status Update",
        discoveredFrom: "https://example.com",
        discoveredAt: Date.now(),
        status: "candidate",
        enabled: true,
      }
      
      await db.discoveredFeeds.add(feed)
      
      // 更新状态为 recommended
      await db.discoveredFeeds.update("feed-status-update", {
        status: "recommended",
      })
      
      const updated = await db.discoveredFeeds.get("feed-status-update")
      expect(updated?.status).toBe("recommended")
      
      // 更新状态为 subscribed
      await db.discoveredFeeds.update("feed-status-update", {
        status: "subscribed",
        subscribedAt: Date.now(),
      })
      
      const subscribed = await db.discoveredFeeds.get("feed-status-update")
      expect(subscribed?.status).toBe("subscribed")
      expect(subscribed?.subscribedAt).toBeDefined()
    })
  })
  
  describe("feedArticles 表", () => {
    it("应该能添加文章", async () => {
      const article: FeedArticle = {
        id: "article-1",
        feedId: "feed-1",
        title: "Example Article",
        link: "https://example.com/article1",
        description: "This is an example article",
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
      }
      
      await db.feedArticles.add(article)
      
      const retrieved = await db.feedArticles.get("article-1")
      expect(retrieved).toBeDefined()
      expect(retrieved?.title).toBe("Example Article")
    })
    
    it("应该能按 feedId 查询文章", async () => {
      const now = Date.now()
      
      await db.feedArticles.bulkAdd([
        {
          id: "article-1",
          feedId: "feed-1",
          title: "Article 1",
          link: "https://example.com/1",
          published: now - 3600000,
          fetched: now,
          read: false,
          starred: false,
        },
        {
          id: "article-2",
          feedId: "feed-1",
          title: "Article 2",
          link: "https://example.com/2",
          published: now - 1800000,
          fetched: now,
          read: false,
          starred: false,
        },
        {
          id: "article-3",
          feedId: "feed-2",
          title: "Article 3",
          link: "https://example.com/3",
          published: now,
          fetched: now,
          read: false,
          starred: false,
        },
      ])
      
      const feed1Articles = await db.feedArticles.where("feedId").equals("feed-1").toArray()
      const feed2Articles = await db.feedArticles.where("feedId").equals("feed-2").toArray()
      
      expect(feed1Articles).toHaveLength(2)
      expect(feed2Articles).toHaveLength(1)
    })
    
    it("应该支持 AI 分析结果", async () => {
      const article: FeedArticle = {
        id: "article-with-ai",
        feedId: "feed-1",
        title: "Article with AI Analysis",
        link: "https://example.com/article",
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
        analysis: {
          topicProbabilities: {
            [Topic.TECHNOLOGY]: 0.7,
            [Topic.SCIENCE]: 0.3,
            [Topic.BUSINESS]: 0,
            [Topic.DESIGN]: 0,
            [Topic.ARTS]: 0,
            [Topic.HEALTH]: 0,
            [Topic.SPORTS]: 0,
            [Topic.ENTERTAINMENT]: 0,
            [Topic.NEWS]: 0,
            [Topic.EDUCATION]: 0,
            [Topic.OTHER]: 0,
          },
          confidence: 0.85,
          provider: "OpenAI",
        },
      }
      
      await db.feedArticles.add(article)
      
      const retrieved = await db.feedArticles.get("article-with-ai")
      expect(retrieved?.analysis?.confidence).toBe(0.85)
      expect(retrieved?.analysis?.topicProbabilities[Topic.TECHNOLOGY]).toBe(0.7)
    })
    
    it("应该能标记文章为已读/收藏", async () => {
      const article: FeedArticle = {
        id: "article-read-star",
        feedId: "feed-1",
        title: "Article to Read and Star",
        link: "https://example.com/article",
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false,
      }
      
      await db.feedArticles.add(article)
      
      // 标记为已读
      await db.feedArticles.update("article-read-star", { read: true })
      let updated = await db.feedArticles.get("article-read-star")
      expect(updated?.read).toBe(true)
      
      // 标记为收藏
      await db.feedArticles.update("article-read-star", { starred: true })
      updated = await db.feedArticles.get("article-read-star")
      expect(updated?.starred).toBe(true)
    })
  })
})
