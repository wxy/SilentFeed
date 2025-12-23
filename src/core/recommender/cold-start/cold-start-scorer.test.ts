/**
 * 冷启动评分器测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ColdStartScorer } from './cold-start-scorer'
import type { FeedArticle, DiscoveredFeed } from '@/types/rss'
import type { Topic } from '@/core/profile/topics'

describe('ColdStartScorer', () => {
  let scorer: ColdStartScorer
  
  beforeEach(() => {
    scorer = new ColdStartScorer()
  })

  describe('score', () => {
    it('应该根据多维度计算文章分数', () => {
      const feeds: DiscoveredFeed[] = [
        createFeedWithQuality('feed1', 80),
        createFeedWithQuality('feed2', 90),
        createFeedWithQuality('feed3', 70)
      ]
      
      const articles: FeedArticle[] = [
        // 高质量源 + 热门主题 + 新鲜
        createArticle('a1', 'feed2', { 'technology': 0.8 } as Record<Topic, number>, Date.now() - 3600000),
        // 低质量源 + 热门主题 + 旧
        createArticle('a2', 'feed3', { 'technology': 0.7 } as Record<Topic, number>, Date.now() - 86400000 * 5),
        // 高质量源 + 非热门主题
        createArticle('a3', 'feed2', { 'lifestyle': 0.9 } as Record<Topic, number>, Date.now() - 7200000),
        // 跨源热门主题
        createArticle('a4', 'feed1', { 'technology': 0.6 } as Record<Topic, number>, Date.now() - 3600000),
        createArticle('a5', 'feed3', { 'technology': 0.5 } as Record<Topic, number>, Date.now() - 3600000)
      ]

      const scores = scorer.score(articles, feeds)

      // 应该返回分数列表
      expect(scores.length).toBeGreaterThan(0)
      
      // 分数应该是降序的
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1].finalScore).toBeGreaterThanOrEqual(scores[i].finalScore)
      }

      // 高质量源+热门主题+新鲜 的文章应该排名靠前
      const a1Score = scores.find(s => s.articleId === 'a1')
      expect(a1Score).toBeDefined()
      expect(a1Score!.feedTrustScore).toBeGreaterThan(0.8)
      expect(a1Score!.freshnessScore).toBe(1.0)
    })

    it('应该过滤低分文章', () => {
      const feeds: DiscoveredFeed[] = [
        createFeedWithQuality('feed1', 30), // 低质量源
        createFeedWithQuality('feed2', 30)
      ]
      
      const articles: FeedArticle[] = [
        // 低质量源 + 低置信度 + 旧 → 应该被过滤
        createArticle('a1', 'feed1', { 'technology': 0.35 } as Record<Topic, number>, Date.now() - 86400000 * 10),
        createArticle('a2', 'feed2', { 'technology': 0.35 } as Record<Topic, number>, Date.now() - 86400000 * 10)
      ]

      const scores = scorer.score(articles, feeds)

      // 低分文章应该被过滤
      expect(scores.length).toBeLessThan(articles.length)
    })

    it('应该在无质量数据时给中等分', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1'), // 无质量数据
        createFeed('feed2')
      ]
      
      const articles: FeedArticle[] = [
        createArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>, Date.now() - 3600000),
        createArticle('a2', 'feed2', { 'technology': 0.7 } as Record<Topic, number>, Date.now() - 3600000),
        createArticle('a3', 'feed1', { 'programming': 0.6 } as Record<Topic, number>, Date.now() - 7200000),
        createArticle('a4', 'feed2', { 'programming': 0.5 } as Record<Topic, number>, Date.now() - 7200000),
        createArticle('a5', 'feed1', { 'technology': 0.5 } as Record<Topic, number>, Date.now() - 7200000)
      ]

      const scores = scorer.score(articles, feeds)

      // 源信任度应该是 0.5（中等）
      for (const score of scores) {
        expect(score.feedTrustScore).toBe(0.5)
      }
    })
  })

  describe('时效性评分', () => {
    it('应该给最新文章满分', () => {
      const feeds: DiscoveredFeed[] = [
        createFeedWithQuality('feed1', 80),
        createFeedWithQuality('feed2', 80)
      ]
      
      const articles: FeedArticle[] = [
        createArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>, Date.now() - 1000), // 刚发布
        createArticle('a2', 'feed2', { 'technology': 0.7 } as Record<Topic, number>, Date.now() - 1000),
        createArticle('a3', 'feed1', { 'programming': 0.6 } as Record<Topic, number>, Date.now() - 2000),
        createArticle('a4', 'feed2', { 'programming': 0.5 } as Record<Topic, number>, Date.now() - 2000),
        createArticle('a5', 'feed1', { 'technology': 0.5 } as Record<Topic, number>, Date.now() - 3000)
      ]

      const scores = scorer.score(articles, feeds)
      const a1Score = scores.find(s => s.articleId === 'a1')

      expect(a1Score!.freshnessScore).toBe(1.0)
    })

    it('应该给老文章低分', () => {
      const feeds: DiscoveredFeed[] = [
        createFeedWithQuality('feed1', 80),
        createFeedWithQuality('feed2', 80)
      ]
      
      const articles: FeedArticle[] = [
        createArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>, Date.now() - 86400000 * 14), // 两周前
        createArticle('a2', 'feed2', { 'technology': 0.7 } as Record<Topic, number>, Date.now() - 86400000 * 14),
        createArticle('a3', 'feed1', { 'programming': 0.6 } as Record<Topic, number>, Date.now() - 86400000 * 15),
        createArticle('a4', 'feed2', { 'programming': 0.5 } as Record<Topic, number>, Date.now() - 86400000 * 15),
        createArticle('a5', 'feed1', { 'technology': 0.5 } as Record<Topic, number>, Date.now() - 86400000 * 16)
      ]

      const scores = scorer.score(articles, feeds)

      for (const score of scores) {
        expect(score.freshnessScore).toBeLessThanOrEqual(0.2)
      }
    })
  })

  describe('内容质量评分', () => {
    it('应该考虑 TF-IDF 分数', () => {
      const feeds: DiscoveredFeed[] = [
        createFeedWithQuality('feed1', 80),
        createFeedWithQuality('feed2', 80)
      ]
      
      const highTfidf = createArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>, Date.now())
      highTfidf.tfidfScore = 0.9
      
      const lowTfidf = createArticle('a2', 'feed2', { 'technology': 0.8 } as Record<Topic, number>, Date.now())
      lowTfidf.tfidfScore = 0.1
      
      const articles: FeedArticle[] = [
        highTfidf,
        lowTfidf,
        createArticle('a3', 'feed1', { 'technology': 0.6 } as Record<Topic, number>, Date.now()),
        createArticle('a4', 'feed2', { 'technology': 0.5 } as Record<Topic, number>, Date.now()),
        createArticle('a5', 'feed1', { 'programming': 0.5 } as Record<Topic, number>, Date.now())
      ]

      const scores = scorer.score(articles, feeds)
      
      const a1Score = scores.find(s => s.articleId === 'a1')
      const a2Score = scores.find(s => s.articleId === 'a2')

      expect(a1Score!.contentQualityScore).toBeGreaterThan(a2Score!.contentQualityScore)
    })

    it('应该考虑内容长度', () => {
      const feeds: DiscoveredFeed[] = [
        createFeedWithQuality('feed1', 80),
        createFeedWithQuality('feed2', 80)
      ]
      
      const longContent = createArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>, Date.now())
      longContent.content = 'x'.repeat(3000)
      
      const shortContent = createArticle('a2', 'feed2', { 'technology': 0.8 } as Record<Topic, number>, Date.now())
      shortContent.content = 'x'.repeat(100)
      
      const articles: FeedArticle[] = [
        longContent,
        shortContent,
        createArticle('a3', 'feed1', { 'technology': 0.6 } as Record<Topic, number>, Date.now()),
        createArticle('a4', 'feed2', { 'technology': 0.5 } as Record<Topic, number>, Date.now()),
        createArticle('a5', 'feed1', { 'programming': 0.5 } as Record<Topic, number>, Date.now())
      ]

      const scores = scorer.score(articles, feeds)
      
      const a1Score = scores.find(s => s.articleId === 'a1')
      const a2Score = scores.find(s => s.articleId === 'a2')

      expect(a1Score!.contentQualityScore).toBeGreaterThan(a2Score!.contentQualityScore)
    })
  })

  describe('配置', () => {
    it('应该允许自定义权重', () => {
      const customScorer = new ColdStartScorer({
        clusterWeight: 0.5,
        feedTrustWeight: 0.2,
        contentQualityWeight: 0.2,
        freshnessWeight: 0.1
      })

      const config = customScorer.getConfig()

      expect(config.clusterWeight).toBe(0.5)
      expect(config.feedTrustWeight).toBe(0.2)
    })

    it('应该允许更新配置', () => {
      scorer.updateConfig({ minScoreThreshold: 0.5 })

      const config = scorer.getConfig()

      expect(config.minScoreThreshold).toBe(0.5)
    })
  })
})

// 辅助函数
function createFeed(id: string): DiscoveredFeed {
  return {
    id,
    url: `http://example.com/${id}`,
    title: `Feed ${id}`,
    discoveredFrom: 'test',
    discoveredAt: Date.now(),
    status: 'subscribed',
    isActive: true,
    articleCount: 0,
    recommendedCount: 0,
    unreadCount: 0
  }
}

function createFeedWithQuality(id: string, qualityScore: number): DiscoveredFeed {
  return {
    ...createFeed(id),
    quality: {
      updateFrequency: 7,
      formatValid: true,
      reachable: true,
      score: qualityScore,
      lastChecked: Date.now()
    }
  }
}

function createArticle(
  id: string, 
  feedId: string, 
  topicProbabilities: Record<Topic, number>,
  published: number
): FeedArticle {
  return {
    id,
    feedId,
    title: `Article ${id}`,
    link: `http://example.com/${id}`,
    published,
    fetched: Date.now(),
    read: false,
    starred: false,
    analysis: {
      topicProbabilities,
      confidence: 0.8,
      provider: 'test'
    }
  }
}
