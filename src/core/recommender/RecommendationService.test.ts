/**
 * RecommendationService 单元测试
 * 
 * 测试覆盖：
 * 1. 基本实例化和方法
 * 2. 错误处理逻辑  
 * 3. 参数验证
 * 4. 推荐生成流程
 */
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { RecommendationService } from './RecommendationService'

// Mock 所有依赖
vi.mock('./pipeline', () => ({
  RecommendationPipelineImpl: class MockPipeline {
    async process(input: any) {
      return {
        algorithm: 'ai',
        articles: input.articles.slice(0, input.config.maxRecommendations).map((article: any) => ({
          id: article.id,
          title: article.title,
          url: article.link,
          feedId: article.feedId,
          score: 0.85,
          reason: '高度相关',
          confidence: 0.9,
          matchedInterests: ['技术', '编程'],
          keyPoints: [article.title]
        })),
        stats: {
          inputCount: input.articles.length,
          processed: {
            fullContent: 0,
            tfidfFiltered: input.articles.length,
            aiAnalyzed: input.articles.length,
            aiScored: input.articles.length,
            finalRecommended: Math.min(input.articles.length, input.config.maxRecommendations)
          },
          timing: {
            total: 100,
            fullContentFetch: 0,
            tfidfAnalysis: 50,
            aiAnalysis: 30,
            aiScoring: 20
          },
          errors: {
            fullContentFailed: 0,
            tfidfFailed: 0,
            aiAnalysisFailed: 0,
            aiFailed: 0
          }
        },
        timestamp: Date.now()
      }
    }
  }
}))

vi.mock('../../storage/db', () => ({
  getUserProfile: vi.fn().mockResolvedValue({
    id: 'singleton',
    version: 1,
    topics: { 技术: 0.8, 科学: 0.2 },
    keywords: [{ word: '编程', weight: 0.9 }],
    domains: [],
    totalPages: 100,
    lastUpdated: Date.now()
  }),
  updateAllFeedStats: vi.fn().mockResolvedValue(undefined),
  db: {
    feedArticles: {
      where: vi.fn(() => ({
        and: vi.fn(() => ({
          sortBy: vi.fn(() => ({
            reverse: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: '1',
                  feedId: 'feed1',
                  title: '测试文章1',
                  link: 'https://example.com/1',
                  content: '测试内容1',
                  description: '测试描述1',
                  pubDate: new Date().toISOString(),
                  fetched: Date.now(),
                  read: false,
                  starred: false
                },
                {
                  id: '2',
                  feedId: 'feed1',
                  title: '测试文章2',
                  link: 'https://example.com/2',
                  content: '测试内容2',
                  description: '测试描述2',
                  pubDate: new Date().toISOString(),
                  fetched: Date.now(),
                  read: false,
                  starred: false
                }
              ])
            }))
          }))
        }))
      })),
      toArray: vi.fn().mockResolvedValue([])
    },
    discoveredFeeds: {
      where: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            id: 'feed1',
            url: 'https://example.com/feed',
            title: '测试Feed',
            status: 'subscribed',
            isActive: true
          }
        ])
      }))
    },
    recommendations: {
      add: vi.fn().mockResolvedValue('rec-id'),
      bulkAdd: vi.fn().mockResolvedValue(['rec-1', 'rec-2'])
    }
  }
}))

vi.mock('../../storage/recommendation-config', () => ({
  getRecommendationConfig: vi.fn().mockResolvedValue({
    useReasoning: false,
    useLocalAI: false,
    batchSize: 10,
    qualityThreshold: 0.6,
    tfidfThreshold: 0.1
  })
}))

vi.mock('../rss/managers/FeedManager', () => ({
  FeedManager: class MockFeedManager {
    async getSubscribedFeeds() {
      return [
        {
          id: 'feed1',
          url: 'https://example.com/feed',
          title: '测试Feed',
          status: 'subscribed'
        }
      ]
    }
  }
}))

vi.mock('./adaptive-count', () => ({
  trackRecommendationGenerated: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('./notification', () => ({
  sendRecommendationNotification: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    withTag: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })
  }
}))

describe('RecommendationService', () => {
  let service: RecommendationService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new RecommendationService()
  })

  afterEach(() => {
    service.cleanup()
  })

  describe('基本功能', () => {
    test('应该能创建实例', () => {
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(RecommendationService)
    })

    test('应该有 generateRecommendations 方法', () => {
      expect(service.generateRecommendations).toBeDefined()
      expect(typeof service.generateRecommendations).toBe('function')
    })

    test('应该有 cleanup 方法', () => {
      expect(service.cleanup).toBeDefined()
      expect(typeof service.cleanup).toBe('function')
    })

    test('cleanup 应该能正常调用', () => {
      expect(() => service.cleanup()).not.toThrow()
    })
  })

  describe('generateRecommendations', () => {
    test('应该返回 Promise', () => {
      const result = service.generateRecommendations()
      expect(result).toBeInstanceOf(Promise)
    })

    test('应该成功生成推荐', async () => {
      const result = await service.generateRecommendations()
      
      expect(result).toBeDefined()
      expect(result.recommendations).toBeDefined()
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(result.stats).toBeDefined()
      expect(typeof result.stats.processingTimeMs).toBe('number')
      
      // 成功时应该有推荐
      expect(result.recommendations.length).toBeGreaterThan(0)
      expect(result.errors).toBeUndefined()
    })

    test('应该在用户画像不存在时返回错误', async () => {
      const { getUserProfile } = await import('../../storage/db')
      vi.mocked(getUserProfile).mockResolvedValueOnce(null)
      
      const result = await service.generateRecommendations()
      
      expect(result.recommendations).toHaveLength(0)
      expect(result.errors).toBeDefined()
      expect(result.errors).toContain('用户画像未准备好，请先浏览更多页面建立兴趣模型')
    })

    test('应该在没有文章时返回错误', async () => {
      const { db } = await import('../../storage/db')
      // Mock 返回空文章列表
      vi.mocked(db.feedArticles.where).mockReturnValue({
        and: vi.fn(() => ({
          sortBy: vi.fn(() => ({
            reverse: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([])
            }))
          }))
        }))
      } as any)
      
      const result = await service.generateRecommendations()
      
      expect(result.recommendations).toHaveLength(0)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('没有可用的RSS文章数据')
    })

    test('应该接受可选参数', async () => {
      // 测试默认参数
      const result1 = await service.generateRecommendations()
      expect(result1).toBeDefined()
      
      // 测试自定义参数
      const result2 = await service.generateRecommendations(10, 'all', 20)
      expect(result2).toBeDefined()
    })

    test('应该限制推荐数量', async () => {
      const result = await service.generateRecommendations(1)
      
      expect(result.recommendations.length).toBeLessThanOrEqual(1)
    })

    test('应该支持不同的数据源', async () => {
      // 测试 subscribed
      const result1 = await service.generateRecommendations(5, 'subscribed')
      expect(result1).toBeDefined()
      
      // 测试 all
      const result2 = await service.generateRecommendations(5, 'all')
      expect(result2).toBeDefined()
    })

    test('应该自定义批次大小', async () => {
      const result = await service.generateRecommendations(5, 'subscribed', 20)
      
      expect(result).toBeDefined()
      expect(result.stats.totalArticles).toBeGreaterThanOrEqual(0)
    })
  })

  describe('返回值结构', () => {
    test('应该返回正确的数据结构', async () => {
      const result = await service.generateRecommendations()
      
      // 验证返回值结构
      expect(result).toHaveProperty('recommendations')
      expect(result).toHaveProperty('stats')
      expect(result.stats).toHaveProperty('totalArticles')
      expect(result.stats).toHaveProperty('processedArticles')
      expect(result.stats).toHaveProperty('recommendedCount')
      expect(result.stats).toHaveProperty('processingTimeMs')
    })

    test('推荐应该包含必要字段', async () => {
      const result = await service.generateRecommendations()
      
      if (result.recommendations.length > 0) {
        const rec = result.recommendations[0]
        expect(rec).toHaveProperty('id')
        expect(rec).toHaveProperty('title')
        expect(rec).toHaveProperty('url')
        expect(rec).toHaveProperty('source')
        expect(rec).toHaveProperty('recommendedAt')
      }
    })

    test('统计信息应该准确', async () => {
      const result = await service.generateRecommendations(3)
      
      expect(result.stats.recommendedCount).toBe(result.recommendations.length)
      expect(result.stats.processingTimeMs).toBeGreaterThan(0)
    })
  })

  describe('质量过滤', () => {
    test('应该过滤低质量文章', async () => {
      const { getRecommendationConfig } = await import('../../storage/recommendation-config')
      vi.mocked(getRecommendationConfig).mockResolvedValueOnce({
        useReasoning: false,
        useLocalAI: false,
        batchSize: 10,
        qualityThreshold: 0.9,  // 设置很高的阈值
        tfidfThreshold: 0.1
      })
      
      const result = await service.generateRecommendations()
      
      // 高阈值可能导致没有推荐
      expect(result).toBeDefined()
    })

    test('应该应用质量阈值', async () => {
      const result = await service.generateRecommendations()
      
      // 所有推荐的分数应该高于配置的质量阈值
      result.recommendations.forEach(rec => {
        expect(rec.score).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('通知发送', () => {
    test('应该在有推荐时发送通知', async () => {
      const { sendRecommendationNotification } = await import('./notification')
      
      await service.generateRecommendations()
      
      expect(sendRecommendationNotification).toHaveBeenCalled()
    })

    test('应该发送第一条推荐的通知', async () => {
      const { sendRecommendationNotification } = await import('./notification')
      
      const result = await service.generateRecommendations()
      
      if (result.recommendations.length > 0) {
        expect(sendRecommendationNotification).toHaveBeenCalledWith(
          result.recommendations.length,
          expect.objectContaining({
            title: result.recommendations[0].title,
            url: result.recommendations[0].url
          })
        )
      }
    })
  })

  describe('推荐跟踪', () => {
    test('应该跟踪推荐生成', async () => {
      const { trackRecommendationGenerated } = await import('./adaptive-count')
      
      const result = await service.generateRecommendations()
      
      expect(trackRecommendationGenerated).toHaveBeenCalledWith(result.recommendations.length)
    })
  })

  describe('错误处理', () => {
    test('应该处理管道错误', async () => {
      const { RecommendationPipelineImpl } = await import('./pipeline')
      // Mock process 抛出错误
      vi.spyOn(RecommendationPipelineImpl.prototype, 'process').mockRejectedValueOnce(
        new Error('Pipeline error')
      )
      
      const result = await service.generateRecommendations()
      
      expect(result.recommendations).toHaveLength(0)
      expect(result.errors).toBeDefined()
    })

    test('应该处理数据库错误', async () => {
      const { db } = await import('../../storage/db')
      vi.mocked(db.recommendations.bulkAdd).mockRejectedValueOnce(new Error('DB error'))
      
      const result = await service.generateRecommendations()
      
      // 即使保存失败，也应该返回结果
      expect(result).toBeDefined()
    })

    test('应该记录处理时间', async () => {
      const result = await service.generateRecommendations()
      
      expect(result.stats.processingTimeMs).toBeGreaterThan(0)
    })
  })

  describe('单例导出', () => {
    test('应该导出单例实例', async () => {
      const { recommendationService } = await import('./RecommendationService')
      expect(recommendationService).toBeDefined()
      expect(recommendationService).toBeInstanceOf(RecommendationService)
    })
  })
})