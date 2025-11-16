/**
 * 数据流管道测试
 * Phase 6.4: 验证推荐处理流程
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecommendationPipelineImpl, createRecommendationPipeline } from './pipeline'
import type { RecommendationInput, RecommendationResult } from './types'
import type { FeedArticle } from '../rss/types'
import type { UserProfile } from '../profile/types'
import { Topic } from '../profile/topics'

// Mock依赖
vi.mock('./data-adapters', () => ({
  convertFeedArticlesToArticleData: vi.fn(articles => articles),
  convertUserProfileToUserInterests: vi.fn(() => ({
    keywords: [
      { word: 'javascript', weight: 0.8 },
      { word: 'react', weight: 0.6 },
      { word: 'web', weight: 0.4 }
    ]
  }))
}))

vi.mock('./RuleBasedRecommender', () => ({
  RuleBasedRecommender: class MockRuleBasedRecommender {
    recommend = vi.fn().mockResolvedValue([])
  }
}))

vi.mock('@/core/ai/AICapabilityManager', () => ({
  aiManager: {
    initialize: vi.fn(),
    testConnection: vi.fn()
  }
}))

// Mock fetch
global.fetch = vi.fn()

describe('推荐数据流管道', () => {
  let pipeline: RecommendationPipelineImpl
  let mockArticles: FeedArticle[]
  let mockUserProfile: UserProfile
  let mockInput: RecommendationInput

  beforeEach(() => {
    vi.clearAllMocks()
    
    // 创建测试数据
    mockArticles = [
      {
        id: '1',
        feedId: 'feed1',
        title: 'JavaScript 新特性介绍',
        description: 'JavaScript ES2024 的新功能详解',
        link: 'https://example.com/js-features',
        published: Date.now() - 3600000,
        fetched: Date.now(),
        read: false,
        starred: false
      },
      {
        id: '2', 
        feedId: 'feed1',
        title: 'React 18 性能优化',
        description: 'React 18 带来的性能改进和最佳实践',
        link: 'https://example.com/react-perf',
        published: Date.now() - 7200000,
        fetched: Date.now(),
        read: false,
        starred: false
      },
      {
        id: '3',
        feedId: 'feed2', 
        title: '美食制作技巧',
        description: '如何制作美味的意大利面',
        link: 'https://example.com/cooking',
        published: Date.now() - 10800000,
        fetched: Date.now(),
        read: false,
        starred: false
      }
    ]

    mockUserProfile = {
      id: 'singleton',
      version: 1,
      topics: {
        [Topic.TECHNOLOGY]: 0.8,
        [Topic.SCIENCE]: 0.1,
        [Topic.BUSINESS]: 0.0,
        [Topic.DESIGN]: 0.0,
        [Topic.ARTS]: 0.0,
        [Topic.HEALTH]: 0.0,
        [Topic.SPORTS]: 0.0,
        [Topic.ENTERTAINMENT]: 0.0,
        [Topic.NEWS]: 0.0,
        [Topic.EDUCATION]: 0.1,
        [Topic.OTHER]: 0.0
      },
      keywords: [
        { word: 'javascript', weight: 0.8 },
        { word: 'react', weight: 0.6 }
      ],
      domains: [
        { domain: 'developer.mozilla.org', count: 50, avgDwellTime: 120 },
        { domain: 'reactjs.org', count: 30, avgDwellTime: 90 }
      ],
      totalPages: 100,
      lastUpdated: Date.now()
    }

    mockInput = {
      articles: mockArticles,
      userProfile: mockUserProfile,
      config: {
        useReasoning: false,
        useLocalAI: false,
        maxRecommendations: 3
      }
    }

    pipeline = new RecommendationPipelineImpl()
  })

  describe('基础功能', () => {
    it('应该创建管道实例', () => {
      expect(pipeline).toBeInstanceOf(RecommendationPipelineImpl)
      expect(pipeline.getProgress().stage).toBe('idle')
    })

    it('应该通过工厂函数创建实例', () => {
      const factoryPipeline = createRecommendationPipeline()
      expect(factoryPipeline).toBeDefined()
    })

    it('应该支持自定义配置', () => {
      const customPipeline = createRecommendationPipeline({
        tfidf: { 
          targetCount: 20,
          minScore: 0.1,
          vocabularySize: 1000
        },
        ai: { 
          enabled: false,
          batchSize: 5,
          maxConcurrency: 2,
          timeout: 30000,
          costLimit: 1.0,
          fallbackToTFIDF: true
        }
      })
      expect(customPipeline).toBeDefined()
    })
  })

  describe('数据流处理', () => {
    it('应该处理AI推荐流程', async () => {
      const result = await pipeline.process(mockInput)
      
      expect(result).toBeDefined()
      expect(result.algorithm).toBe('ai')
      expect(result.articles).toHaveLength(3)
      expect(result.stats.inputCount).toBe(3)
      expect(result.stats.processed.finalRecommended).toBeLessThanOrEqual(3)
    })

    it('应该正确计算推荐分数', async () => {
      const result = await pipeline.process(mockInput)
      
      // JavaScript和React相关的文章应该有更高的分数
      const jsArticle = result.articles.find(a => a.title.includes('JavaScript'))
      const reactArticle = result.articles.find(a => a.title.includes('React'))
      const cookingArticle = result.articles.find(a => a.title.includes('美食'))
      
      if (jsArticle) {
        expect(jsArticle.score).toBeGreaterThan(0)
        expect(jsArticle.reason).toContain('相关度')
      }
      
      if (reactArticle) {
        expect(reactArticle.score).toBeGreaterThan(0)
      }
      
      // 美食文章的分数应该较低
      if (cookingArticle) {
        expect(cookingArticle.score).toBeLessThan(0.5)
      }
    })

    it('应该包含推荐理由和置信度', async () => {
      const result = await pipeline.process(mockInput)
      
      result.articles.forEach(article => {
        expect(article.reason).toBeDefined()
        expect(article.confidence).toBeGreaterThanOrEqual(0)
        expect(article.confidence).toBeLessThanOrEqual(1)
        expect(article.matchedInterests).toBeDefined()
      })
    })
  })

  describe('进度追踪', () => {
    it('应该更新处理进度', async () => {
      const progressUpdates: string[] = []
      
      // 监听进度更新
      const originalProgress = pipeline.getProgress
      pipeline.getProgress = vi.fn(() => {
        const progress = originalProgress.call(pipeline)
        progressUpdates.push(progress.stage)
        return progress
      })
      
      await pipeline.process(mockInput)
      
      // 验证进度更新
      const finalProgress = pipeline.getProgress()
      expect(finalProgress.stage).toBe('complete')
      expect(finalProgress.progress).toBe(1.0)
    })

    it('应该支持取消操作', () => {
      pipeline.cancel()
      const progress = pipeline.getProgress()
      expect(progress.message).toContain('取消')
    })
  })

  describe('错误处理', () => {
    it('应该处理空文章列表', async () => {
      const emptyInput = {
        ...mockInput,
        articles: []
      }
      
      const result = await pipeline.process(emptyInput)
      
      expect(result.articles).toHaveLength(0)
      expect(result.stats.inputCount).toBe(0)
    })

    it('应该处理无效用户配置', async () => {
      const invalidInput = {
        ...mockInput,
        config: {
          useReasoning: false,
          useLocalAI: false,
          maxRecommendations: -1 // 无效值
        }
      }
      
      const result = await pipeline.process(invalidInput)
      
      // 应该有合理的降级处理
      expect(result.articles.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('性能统计', () => {
    it('应该记录处理时间', async () => {
      const result = await pipeline.process(mockInput)
      
      expect(result.stats.timing.total).toBeGreaterThan(0)
      expect(result.stats.timing.tfidfAnalysis).toBeGreaterThanOrEqual(0)
      expect(result.timestamp).toBeCloseTo(Date.now(), -3) // 3位精度
    })

    it('应该记录处理统计', async () => {
      const result = await pipeline.process(mockInput)
      
      expect(result.stats.processed.tfidfFiltered).toBeGreaterThanOrEqual(0)
      expect(result.stats.processed.finalRecommended).toBeGreaterThanOrEqual(0)
      expect(result.stats.errors.tfidfFailed).toBeGreaterThanOrEqual(0)
    })
  })

  describe('配置选项', () => {
    it('应该支持跳过全文抓取', async () => {
      const inputWithOptions = {
        ...mockInput,
        options: {
          skipFullContent: true
        }
      }
      
      const result = await pipeline.process(inputWithOptions)
      
      expect(result.stats.processed.fullContent).toBe(0)
      expect(result.stats.timing.fullContentFetch).toBe(0)
    })

    it('应该支持限制文章数量', async () => {
      const inputWithOptions = {
        ...mockInput,
        options: {
          maxArticles: 2
        }
      }
      
      const result = await pipeline.process(inputWithOptions)
      
      expect(result.stats.inputCount).toBeLessThanOrEqual(2)
    })
  })
})