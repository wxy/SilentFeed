/**
 * SourceAnalysisService 测试
 * 
 * 覆盖源分析的关键功能：
 * 1. 源质量分析
 * 2. 样本文章选择
 * 3. AI 分析调用
 * 4. 缓存管理
 * 5. 错误处理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SourceAnalysisService } from './SourceAnalysisService'
import { db } from '@/storage/db'
import { aiManager } from '@/core/ai/AICapabilityManager'
import type { FeedArticle, DiscoveredFeed } from '@/types/rss'

// Mock dependencies
vi.mock('@/storage/db', () => ({
  db: {
    feedArticles: {
      where: vi.fn(),
      filter: vi.fn(),
      toArray: vi.fn()
    },
    discoveredFeeds: {
      update: vi.fn(),
      get: vi.fn()
    }
  }
}))

vi.mock('@/core/ai/AICapabilityManager', () => ({
  aiManager: {
    analyzeContent: vi.fn(),
    analyzeSource: vi.fn(),
    initialize: vi.fn()
  }
}))

// 测试数据生成器
function createMockFeedArticle(overrides = {}): FeedArticle {
  return {
    id: `article-${Math.random()}`,
    feedId: 'feed-1',
    title: 'Test Article',
    link: 'https://example.com/article',
    description: 'Test description for analysis',
    content: 'Full content here',
    author: 'Test Author',
    published: Date.now() - 86400000,
    updated: Date.now(),
    guid: 'guid-1',
    categories: [],
    isRead: false,
    poolStatus: 'raw',
    inFeed: true,
    ...overrides
  }
}

function createMockFeed(overrides = {}): DiscoveredFeed {
  return {
    id: 'feed-1',
    url: 'https://example.com/feed.xml',
    title: 'Example Feed',
    description: 'Example RSS Feed',
    language: 'en',
    status: 'active',
    icon: '',
    lastFetchedAt: Date.now(),
    nextScheduledFetch: Date.now() + 3600000,
    articleCount: 10,
    unreadCount: 5,
    ...overrides
  }
}

describe('SourceAnalysisService', () => {
  let service: SourceAnalysisService

  beforeEach(() => {
    service = new SourceAnalysisService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('源分析流程', () => {
    it('应该完整分析订阅源的质量', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [
        createMockFeedArticle({ id: 'a1', published: Date.now() - 86400000 }),
        createMockFeedArticle({ id: 'a2', published: Date.now() - 172800000 }),
        createMockFeedArticle({ id: 'a3', published: Date.now() - 259200000 })
      ]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      const mockAnalysisResult = {
        qualityScore: 0.8,
        contentCategory: 'tech',
        topicTags: ['programming'],
        subscriptionAdvice: '文章质量稳定，更新频率适中',
        language: 'en',
        details: {
          contentQuality: 0.8,
          updateFrequency: 2.5,
          informationDensity: 0.85,
          promotionalRatio: 0.1
        }
      }

      vi.mocked(aiManager.analyzeContent).mockResolvedValue(mockAnalysisResult as any)
      vi.mocked(aiManager.analyzeSource).mockResolvedValue(mockAnalysisResult as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result).toBeDefined()
      expect(result?.qualityScore).toBeGreaterThan(0)
      expect(result?.isAIAnalyzed).toBe(true)
    })

    it('应该缓存分析结果', async () => {
      // Arrange
      const feedId = 'feed-1'
      const analysisResult = {
        feedId,
        analyzedAt: Date.now() - 3600000,
        isAIAnalyzed: true,
        qualityScore: 0.8,
        contentCategory: 'tech',
        topicTags: ['programming'],
        subscriptionAdvice: '质量不错'
      }

      const mockFeed = createMockFeed({
        id: feedId,
        aiAnalysis: analysisResult
      }) as any

      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)

      // Act
      const result = await service.analyze(feedId, false)

      // Assert
      expect(result).toBeDefined()
      expect(result?.qualityScore).toBe(0.8)
      // 缓存未过期，不应该调用 AI
      expect(aiManager.analyzeSource).not.toHaveBeenCalled()
    })

    it('应该在强制模式下重新分析', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [createMockFeedArticle()]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      const mockAnalysisResult = {
        qualityScore: 0.9,
        contentCategory: 'tech',
        topicTags: [],
        subscriptionAdvice: '很好'
      }

      vi.mocked(aiManager.analyzeSource).mockResolvedValue(mockAnalysisResult as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId, true) // force=true

      // Assert
      expect(aiManager.initialize).toHaveBeenCalled()
      expect(aiManager.analyzeSource).toHaveBeenCalled()
      expect(result?.qualityScore).toBe(0.9)
    })

    it('应该在缓存过期时重新分析', async () => {
      // Arrange
      const feedId = 'feed-1'
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const staleAnalysis = {
        feedId,
        analyzedAt: sevenDaysAgo,
        isAIAnalyzed: true,
        qualityScore: 0.8,
        contentCategory: 'tech',
        topicTags: [],
        subscriptionAdvice: '过期的分析'
      }

      const mockFeed = createMockFeed({
        id: feedId,
        aiAnalysis: staleAnalysis
      }) as any

      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed)

      const mockArticles = [createMockFeedArticle()]
      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      const mockAnalysisResult = {
        qualityScore: 0.85,
        contentCategory: 'news',
        topicTags: [],
        subscriptionAdvice: '新分析'
      }

      vi.mocked(aiManager.analyzeSource).mockResolvedValue(mockAnalysisResult as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(aiManager.initialize).toHaveBeenCalled()
      expect(result?.qualityScore).toBe(0.85)
    })
  })

  describe('样本文章选择', () => {
    it('应该正确选择样本文章', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = Array.from({ length: 20 }, (_, i) =>
        createMockFeedArticle({ id: `a${i}` })
      )

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles.slice(0, 5))
          })
        })
      } as any)

      const mockAnalysisResult = { qualityScore: 0.8, contentCategory: 'tech', topicTags: [], subscriptionAdvice: '' }
      vi.mocked(aiManager.analyzeSource).mockResolvedValue(mockAnalysisResult as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result).toBeDefined()
      // 应该调用 AI 进行分析
      expect(aiManager.analyzeSource).toHaveBeenCalled()
    })

    it('应该处理文章数量较少的情况', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [createMockFeedArticle()] // 仅 1 篇文章

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      const mockAnalysisResult = { qualityScore: 0.6, contentCategory: 'other', topicTags: [], subscriptionAdvice: '' }
      vi.mocked(aiManager.analyzeSource).mockResolvedValue(mockAnalysisResult as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result?.qualityScore).toBeDefined()
    })

    it('应该处理源无文章的情况', async () => {
      // Arrange
      const feedId = 'feed-1'

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([])
          })
        })
      } as any)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result).toBeDefined()
      expect(result?.isAIAnalyzed).toBe(false)
      expect(aiManager.analyzeSource).not.toHaveBeenCalled()
    })
  })

  describe('AI 分析调用', () => {
    it('应该正确调用 AI 进行分析', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [
        createMockFeedArticle({ title: 'Article 1', description: 'Desc 1' }),
        createMockFeedArticle({ title: 'Article 2', description: 'Desc 2' })
      ]

      const mockFeed = createMockFeed({ id: feedId, title: 'Test Feed' })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      vi.mocked(aiManager.analyzeSource).mockResolvedValue({
        qualityScore: 0.85,
        contentCategory: 'tech',
        topicTags: [],
        subscriptionAdvice: 'Good'
      } as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      await service.analyze(feedId)

      // Assert
      expect(aiManager.initialize).toHaveBeenCalled()
      expect(aiManager.analyzeSource).toHaveBeenCalledWith(
        expect.objectContaining({
          feedTitle: 'Test Feed',
          sampleArticles: expect.stringContaining('Article')
        })
      )
    })

    it('应该处理 AI 分析失败', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [createMockFeedArticle()]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      vi.mocked(aiManager.analyzeSource).mockRejectedValue(
        new Error('AI service unavailable')
      )
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result).toBeDefined()
      expect(result?.isAIAnalyzed).toBe(false)
      expect(result?.error).toBeDefined()
    })

    it('应该处理 AI 返回无效结果', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [createMockFeedArticle()]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      // 返回缺少必要字段的结果
      vi.mocked(aiManager.analyzeSource).mockResolvedValue({} as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result).toBeDefined()
      expect(result?.qualityScore === undefined || result?.qualityScore === 0).toBe(true)
    })
  })

  describe('首次触发分析', () => {
    it('应该异步触发首次抓取分析', async () => {
      // Arrange
      const feedId = 'feed-1'

      // Act
      const promise = service.triggerOnFirstFetch(feedId)

      // Assert
      expect(promise).toBeDefined()
      // 异步执行，不应该阻塞
      await expect(promise).resolves.toBeUndefined()
    })

    it('应该处理触发时的错误', async () => {
      // Arrange
      const feedId = 'feed-1'

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          toArray: vi.fn().mockRejectedValue(new Error('Database error'))
        })
      } as any)

      // Act & Assert
      // 异步函数应该优雅地处理错误而不抛出
      await expect(service.triggerOnFirstFetch(feedId)).resolves.not.toThrow()
    })
  })

  describe('文章格式化', () => {
    it('应该正确格式化样本文章文本', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [
        createMockFeedArticle({
          id: 'a1',
          title: 'Interesting Article',
          description: 'This is interesting'
        }),
        createMockFeedArticle({
          id: 'a2',
          title: 'Another Article',
          description: 'Another one'
        })
      ]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      let capturedCall: any = null
      vi.mocked(aiManager.analyzeSource).mockImplementation((params) => {
        capturedCall = params
        return Promise.resolve({
          qualityScore: 0.8,
          contentCategory: 'tech',
          topicTags: [],
          subscriptionAdvice: ''
        } as any)
      })
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      await service.analyze(feedId)

      // Assert
      expect(capturedCall?.sampleArticles).toContain('Interesting Article')
      expect(capturedCall?.sampleArticles).toContain('Another Article')
    })

    it('应该限制样本文本长度', async () => {
      // Arrange
      const feedId = 'feed-1'
      const longDescription = 'a'.repeat(5000) // 很长的描述

      const mockArticles = [
        createMockFeedArticle({
          description: longDescription
        })
      ]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      let capturedCall: any = null
      vi.mocked(aiManager.analyzeSource).mockImplementation((params) => {
        capturedCall = params
        return Promise.resolve({
          qualityScore: 0.8,
          contentCategory: 'tech',
          topicTags: [],
          subscriptionAdvice: ''
        } as any)
      })
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      await service.analyze(feedId)

      // Assert
      // 应该在合理的长度范围内
      expect(capturedCall?.sampleArticles.length).toBeLessThan(5000)
    })
  })

  describe('统计信息', () => {
    it('应该返回质量分数', async () => {
      // Arrange
      const feedId = 'feed-1'
      const now = Date.now()
      const mockArticles = [
        createMockFeedArticle({ id: 'a1', published: now }),
        createMockFeedArticle({ id: 'a2', published: now - 86400000 }),
        createMockFeedArticle({ id: 'a3', published: now - 172800000 })
      ]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      vi.mocked(aiManager.analyzeSource).mockResolvedValue({
        qualityScore: 0.8,
        contentCategory: 'tech',
        topicTags: [],
        subscriptionAdvice: 'Good feed',
        details: {
          contentQuality: 0.8,
          updateFrequency: 2.5,
          informationDensity: 0.85,
          promotionalRatio: 0.1
        }
      } as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result?.qualityScore).toBe(0.8)
      expect(result?.details?.updateFrequency).toBe(2.5)
    })

    it('应该返回内容质量指标', async () => {
      // Arrange
      const feedId = 'feed-1'
      const mockArticles = [
        createMockFeedArticle({
          description: 'High quality content with details'
        })
      ]

      const mockFeed = createMockFeed({ id: feedId })
      vi.mocked(db.discoveredFeeds.get).mockResolvedValue(mockFeed as any)

      vi.mocked(db.feedArticles.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockArticles)
          })
        })
      } as any)

      const mockResult = {
        qualityScore: 0.85,
        contentCategory: 'tech',
        topicTags: [],
        subscriptionAdvice: '',
        details: {
          contentQuality: 0.8,
          updateFrequency: 2.1,
          informationDensity: 0.85,
          promotionalRatio: 0.05
        }
      }

      vi.mocked(aiManager.analyzeSource).mockResolvedValue(mockResult as any)
      vi.mocked(aiManager.initialize).mockResolvedValue(undefined)

      // Act
      const result = await service.analyze(feedId)

      // Assert
      expect(result?.qualityScore).toBe(0.85)
      expect(result?.qualityScore).toBeGreaterThan(0)
      expect(result?.details?.contentQuality).toBe(0.8)
    })
  })
})
