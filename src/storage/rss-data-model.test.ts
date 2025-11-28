/**
 * RSS 数据模型测试
 * 
 * 验证 discoveredFeeds 表的结构
 * 文章数据存储在 discoveredFeeds.latestArticles 数组中
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { db } from "./db/index"
import type { DiscoveredFeed } from "@/types/rss"
import { Topic } from "../core/profile/topics"

describe("RSS 数据模型", () => {
  beforeEach(async () => {
    // 确保数据库已打开
    if (!db.isOpen()) {
      await db.open()
    }
    
    // 清空测试数据
    await db.discoveredFeeds.clear()
  })
  
  afterEach(async () => {
    // 清理测试数据
    await db.discoveredFeeds.clear()
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
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
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
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
          recommendedCount: 0,
        },
        {
          id: "feed-2",
          url: "https://example.com/feed2",
          title: "Feed 2",
          discoveredFrom: "https://example.com",
          discoveredAt: Date.now(),
          status: "recommended",
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
          recommendedCount: 0,
        },
        {
          id: "feed-3",
          url: "https://example.com/feed3",
          title: "Feed 3",
          discoveredFrom: "https://example.com",
          discoveredAt: Date.now(),
          status: "subscribed",
          subscribedAt: Date.now(),
          isActive: true,
          articleCount: 0,
          unreadCount: 0,
          recommendedCount: 0,
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
        id: "test-feed-quality",
        url: "https://example.com/feed",
        title: "Feed with Quality",
        discoveredFrom: "https://example.com",
        discoveredAt: Date.now(),
        status: "recommended",
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        quality: {
          updateFrequency: 5,
          formatValid: true,
          reachable: true,
          score: 85,
          lastChecked: Date.now(),
        },
      }
      
      await db.discoveredFeeds.add(feed)
      
      const retrieved = await db.discoveredFeeds.get("test-feed-quality")
      expect(retrieved?.quality?.score).toBe(85)
      expect(retrieved?.quality?.updateFrequency).toBe(5)
    })
    
    it("应该支持相关性评估数据", async () => {
      const feed: DiscoveredFeed = {
        id: "test-feed-relevance",
        url: "https://example.com/feed",
        title: "Feed with Relevance",
        discoveredFrom: "https://example.com",
        discoveredAt: Date.now(),
        status: "recommended",
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
        relevance: {
          matchScore: 75,
          matchedTopics: [Topic.TECHNOLOGY, Topic.SCIENCE],
          sampleArticles: [
            { title: "Sample 1", matchScore: 80 },
            { title: "Sample 2", matchScore: 70 },
          ],
          analyzedAt: Date.now(),
        },
      }
      
      await db.discoveredFeeds.add(feed)
      
      const retrieved = await db.discoveredFeeds.get("test-feed-relevance")
      expect(retrieved?.relevance?.matchScore).toBe(75)
      expect(retrieved?.relevance?.matchedTopics).toHaveLength(2)
    })
    
    it("应该能更新源状态", async () => {
      const feed: DiscoveredFeed = {
        id: "test-feed-status",
        url: "https://example.com/feed",
        title: "Feed to Update",
        discoveredFrom: "https://example.com",
        discoveredAt: Date.now(),
        status: "candidate",
        isActive: true,
        articleCount: 0,
        unreadCount: 0,
        recommendedCount: 0,
      }
      
      await db.discoveredFeeds.add(feed)
      
      // 更新状态
      await db.discoveredFeeds.update("test-feed-status", {
        status: "subscribed",
        subscribedAt: Date.now(),
      })
      
      const updated = await db.discoveredFeeds.get("test-feed-status")
      expect(updated?.status).toBe("subscribed")
      expect(updated?.subscribedAt).toBeDefined()
    })
  })
})
