/**
 * 跨源主题聚类分析器测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { TopicClusterAnalyzer, type TopicCluster } from './topic-cluster'
import type { FeedArticle, DiscoveredFeed } from '@/types/rss'
import type { Topic } from '@/core/profile/topics'

describe('TopicClusterAnalyzer', () => {
  let analyzer: TopicClusterAnalyzer
  
  beforeEach(() => {
    analyzer = new TopicClusterAnalyzer()
  })

  describe('analyze', () => {
    it('应该在订阅源不足时返回空结果', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1', 'subscribed')
      ]
      const articles: FeedArticle[] = []

      const result = analyzer.analyze(feeds, articles)

      expect(result.hasEnoughData).toBe(false)
      expect(result.clusters).toHaveLength(0)
      expect(result.feedCount).toBe(1)
    })

    it('应该在文章不足时返回空结果', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1', 'subscribed'),
        createFeed('feed2', 'subscribed'),
        createFeed('feed3', 'subscribed')
      ]
      const articles: FeedArticle[] = [
        createAnalyzedArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>)
      ]

      const result = analyzer.analyze(feeds, articles)

      expect(result.hasEnoughData).toBe(false)
      expect(result.articleCount).toBe(1)
    })

    it('应该正确识别跨源热门主题', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1', 'subscribed'),
        createFeed('feed2', 'subscribed'),
        createFeed('feed3', 'subscribed')
      ]
      
      // 3 个源都有 technology 主题，programming 只在 feed1 和 feed2 中出现
      const articles: FeedArticle[] = [
        createAnalyzedArticle('a1', 'feed1', { 'technology': 0.8, 'programming': 0.5 } as Record<Topic, number>),
        createAnalyzedArticle('a2', 'feed1', { 'technology': 0.7 } as Record<Topic, number>),
        createAnalyzedArticle('a3', 'feed2', { 'technology': 0.9 } as Record<Topic, number>),
        createAnalyzedArticle('a4', 'feed2', { 'programming': 0.6 } as Record<Topic, number>),
        createAnalyzedArticle('a5', 'feed3', { 'technology': 0.6 } as Record<Topic, number>),
        createAnalyzedArticle('a6', 'feed3', { 'design': 0.7 } as Record<Topic, number>)
      ]

      const result = analyzer.analyze(feeds, articles)

      expect(result.hasEnoughData).toBe(true)
      expect(result.feedCount).toBe(3)
      expect(result.articleCount).toBe(6)
      
      // technology 应该是热度最高的（3 个源都有）
      const techCluster = result.clusters.find(c => c.topic === 'technology')
      expect(techCluster).toBeDefined()
      expect(techCluster!.sourceCount).toBe(3)
      expect(techCluster!.articleCount).toBe(4)

      // programming 在 2 个源中出现
      const progCluster = result.clusters.find(c => c.topic === 'programming')
      expect(progCluster).toBeDefined()
      expect(progCluster!.sourceCount).toBe(2)
    })

    it('应该忽略只在单一源中出现的主题', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1', 'subscribed'),
        createFeed('feed2', 'subscribed')
      ]
      
      const articles: FeedArticle[] = [
        createAnalyzedArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>),
        createAnalyzedArticle('a2', 'feed1', { 'technology': 0.7 } as Record<Topic, number>),
        createAnalyzedArticle('a3', 'feed2', { 'technology': 0.6 } as Record<Topic, number>),
        createAnalyzedArticle('a4', 'feed2', { 'design': 0.9 } as Record<Topic, number>), // 只在 feed2
        createAnalyzedArticle('a5', 'feed2', { 'design': 0.8 } as Record<Topic, number>)
      ]

      const result = analyzer.analyze(feeds, articles)

      // design 只在 feed2 中出现，不应该成为聚类
      const designCluster = result.clusters.find(c => c.topic === 'design')
      expect(designCluster).toBeUndefined()
      
      // technology 在两个源中出现，应该成为聚类
      const techCluster = result.clusters.find(c => c.topic === 'technology')
      expect(techCluster).toBeDefined()
    })

    it('应该忽略低置信度的主题', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1', 'subscribed'),
        createFeed('feed2', 'subscribed')
      ]
      
      const articles: FeedArticle[] = [
        createAnalyzedArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>),
        createAnalyzedArticle('a2', 'feed2', { 'technology': 0.7 } as Record<Topic, number>),
        // business 置信度太低
        createAnalyzedArticle('a3', 'feed1', { 'technology': 0.6, 'business': 0.1 } as Record<Topic, number>),
        createAnalyzedArticle('a4', 'feed2', { 'business': 0.2 } as Record<Topic, number>),
        createAnalyzedArticle('a5', 'feed1', { 'technology': 0.5 } as Record<Topic, number>)
      ]

      const result = analyzer.analyze(feeds, articles)

      // business 置信度太低，不应该成为聚类
      const businessCluster = result.clusters.find(c => c.topic === 'business')
      expect(businessCluster).toBeUndefined()
    })

    it('应该只分析已订阅的活跃源', () => {
      const feeds: DiscoveredFeed[] = [
        createFeed('feed1', 'subscribed'),
        createFeed('feed2', 'subscribed'),
        createFeed('feed3', 'ignored'),      // 被忽略的源
        createFeed('feed4', 'subscribed', false) // 非活跃的源
      ]
      
      const articles: FeedArticle[] = [
        createAnalyzedArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>),
        createAnalyzedArticle('a2', 'feed2', { 'technology': 0.7 } as Record<Topic, number>),
        createAnalyzedArticle('a3', 'feed3', { 'technology': 0.9 } as Record<Topic, number>), // 被忽略源的文章
        createAnalyzedArticle('a4', 'feed4', { 'technology': 0.9 } as Record<Topic, number>), // 非活跃源的文章
        createAnalyzedArticle('a5', 'feed1', { 'programming': 0.6 } as Record<Topic, number>),
        createAnalyzedArticle('a6', 'feed2', { 'programming': 0.5 } as Record<Topic, number>)
      ]

      const result = analyzer.analyze(feeds, articles)

      expect(result.feedCount).toBe(2) // 只有 2 个活跃订阅源
      expect(result.articleCount).toBe(4) // 只有来自活跃源的 4 篇文章
    })
  })

  describe('getArticleClusterScore', () => {
    it('应该根据聚类热度计算文章匹配分数', () => {
      const clusters: TopicCluster[] = [
        { topic: 'technology' as Topic, sourceCount: 3, sourceIds: [], articleCount: 10, avgConfidence: 0.7, heatScore: 0.9 },
        { topic: 'programming' as Topic, sourceCount: 2, sourceIds: [], articleCount: 5, avgConfidence: 0.6, heatScore: 0.5 }
      ]
      
      // 文章主要是 technology 主题
      const article = createAnalyzedArticle('a1', 'feed1', { 
        'technology': 0.8, 
        'programming': 0.4 
      } as Record<Topic, number>)

      const score = analyzer.getArticleClusterScore(article, clusters)

      expect(score).toBeGreaterThan(0.5) // 应该有较高分数
      expect(score).toBeLessThanOrEqual(1)
    })

    it('应该在无分析数据时返回 0', () => {
      const clusters: TopicCluster[] = [
        { topic: 'technology' as Topic, sourceCount: 3, sourceIds: [], articleCount: 10, avgConfidence: 0.7, heatScore: 0.9 }
      ]
      
      const article: FeedArticle = {
        id: 'a1',
        feedId: 'feed1',
        title: 'Test',
        link: 'http://test.com',
        published: Date.now(),
        fetched: Date.now(),
        read: false,
        starred: false
        // 无 analysis
      }

      const score = analyzer.getArticleClusterScore(article, clusters)

      expect(score).toBe(0)
    })

    it('应该在无聚类时返回 0', () => {
      const article = createAnalyzedArticle('a1', 'feed1', { 'technology': 0.8 } as Record<Topic, number>)

      const score = analyzer.getArticleClusterScore(article, [])

      expect(score).toBe(0)
    })
  })
})

// 辅助函数
function createFeed(id: string, status: 'subscribed' | 'ignored', isActive = true): DiscoveredFeed {
  return {
    id,
    url: `http://example.com/${id}`,
    title: `Feed ${id}`,
    discoveredFrom: 'test',
    discoveredAt: Date.now(),
    status,
    isActive,
    articleCount: 0,
    recommendedCount: 0,
    unreadCount: 0
  }
}

function createAnalyzedArticle(id: string, feedId: string, topicProbabilities: Record<Topic, number>): FeedArticle {
  return {
    id,
    feedId,
    title: `Article ${id}`,
    link: `http://example.com/${id}`,
    published: Date.now() - Math.random() * 86400000,
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
