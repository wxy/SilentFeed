/**
 * 数据适配器测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Topic } from '../profile/topics'
import type { FeedArticle } from '@/types/rss'
import type { UserProfile } from '@/types/profile'
import type { ArticleContent } from '../rss/article-fetcher'
import {
  convertFeedArticlesToArticleData,
  convertUserProfileToUserInterests,
  enhanceArticleWithFullContent,
  batchEnhanceArticles,
  validateArticleData,
  validateUserInterests,
  createEmptyUserInterests,
  convertWithStats
} from './data-adapters'

describe('数据适配器', () => {
  let mockFeedArticles: FeedArticle[]
  let mockUserProfile: UserProfile
  let mockArticleContent: ArticleContent

  beforeEach(() => {
    // Mock RSS文章数据
    mockFeedArticles = [
      {
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Vue.js 3.0 新特性详解',
        link: 'https://example.com/vue3',
        description: 'Vue.js 3.0 引入了 Composition API',
        content: 'Vue.js 3.0 是一个重大更新...',
        author: 'Vue Team',
        published: Date.now() - 2 * 60 * 60 * 1000, // 2小时前
        fetched: Date.now(),
        read: false,
        starred: false
      },
      {
        id: 'article-2',
        feedId: 'feed-1',
        title: 'React vs Vue 对比分析',
        link: 'https://example.com/react-vue',
        description: '深入对比两大前端框架',
        published: Date.now() - 4 * 60 * 60 * 1000, // 4小时前
        fetched: Date.now(),
        read: false,
        starred: false
      }
    ]

    // Mock 用户画像数据
    mockUserProfile = {
      id: 'singleton',
      topics: {
        [Topic.TECHNOLOGY]: 0.7,
        [Topic.DESIGN]: 0.2,
        [Topic.BUSINESS]: 0.1,
        [Topic.SCIENCE]: 0,
        [Topic.ARTS]: 0,
        [Topic.HEALTH]: 0,
        [Topic.SPORTS]: 0,
        [Topic.ENTERTAINMENT]: 0,
        [Topic.NEWS]: 0,
        [Topic.EDUCATION]: 0,
        [Topic.OTHER]: 0,
      },
      keywords: [
        { word: 'Vue.js', weight: 0.9 },
        { word: 'React', weight: 0.8 },
        { word: '前端', weight: 0.7 }
      ],
      domains: [
        { domain: 'github.com', count: 20, avgDwellTime: 180 }
      ],
      totalPages: 100,
      lastUpdated: Date.now(),
      version: 1
    }

    // Mock 全文抓取内容
    mockArticleContent = {
      title: 'Vue.js 3.0 新特性详解',
      textContent: 'Vue.js 3.0 是一个重大更新，引入了 Composition API、更好的 TypeScript 支持、Teleport 组件等众多新特性。本文将详细介绍这些新功能。',
      htmlContent: '<p>Vue.js 3.0 是一个重大更新...</p>',
      excerpt: 'Vue.js 3.0 是一个重大更新，引入了 Composition API...',
      wordCount: 500,
      readingTime: 2,
      fetchedAt: Date.now()
    }
  })

  describe('convertFeedArticlesToArticleData', () => {
    it('应该正确转换RSS文章到推荐引擎格式', () => {
      const result = convertFeedArticlesToArticleData(mockFeedArticles)
      
      expect(result).toHaveLength(2)
      
      const first = result[0]
      expect(first.id).toBe('article-1')
      expect(first.title).toBe('Vue.js 3.0 新特性详解')
      expect(first.content).toBe('Vue.js 3.0 引入了 Composition API')
      expect(first.url).toBe('https://example.com/vue3')
      expect(first.feedId).toBe('feed-1')
      expect(first.publishDate).toBeInstanceOf(Date)
    })

    it('应该处理缺失内容的文章', () => {
      const articleWithoutContent: FeedArticle = {
        ...mockFeedArticles[0],
        description: undefined,
        content: undefined
      }
      
      const result = convertFeedArticlesToArticleData([articleWithoutContent])
      
      expect(result[0].content).toBe('')
    })

    it('应该优先使用description而非content', () => {
      const article: FeedArticle = {
        ...mockFeedArticles[0],
        description: '简短描述',
        content: '很长的完整内容...'
      }
      
      const result = convertFeedArticlesToArticleData([article])
      
      expect(result[0].content).toBe('简短描述')
    })
  })

  describe('convertUserProfileToUserInterests', () => {
    it('应该正确转换用户画像到推荐引擎格式', () => {
      const result = convertUserProfileToUserInterests(mockUserProfile)
      
      expect(result.keywords).toHaveLength(3)
      expect(result.keywords[0]).toEqual({ word: 'Vue.js', weight: 0.9 })
      expect(result.keywords[1]).toEqual({ word: 'React', weight: 0.8 })
      expect(result.keywords[2]).toEqual({ word: '前端', weight: 0.7 })
    })

    it('应该处理空关键词列表', () => {
      const emptyProfile: UserProfile = {
        ...mockUserProfile,
        keywords: []
      }
      
      const result = convertUserProfileToUserInterests(emptyProfile)
      
      expect(result.keywords).toHaveLength(0)
    })
  })

  describe('enhanceArticleWithFullContent', () => {
    it('应该使用全文内容增强文章', () => {
      const result = enhanceArticleWithFullContent(
        mockFeedArticles[0], 
        mockArticleContent
      )
      
      expect(result.content).toBe(mockArticleContent.textContent)
      expect(result.title).toBe('Vue.js 3.0 新特性详解')
    })

    it('应该在全文抓取失败时降级到RSS内容', () => {
      const result = enhanceArticleWithFullContent(
        mockFeedArticles[0], 
        null
      )
      
      expect(result.content).toBe('Vue.js 3.0 引入了 Composition API')
    })

    it('应该截断过长的全文内容', () => {
      const longContent: ArticleContent = {
        ...mockArticleContent,
        textContent: 'a'.repeat(6000)
      }
      
      const result = enhanceArticleWithFullContent(
        mockFeedArticles[0], 
        longContent
      )
      
      expect(result.content).toHaveLength(5003) // 5000 + '...'
      expect(result.content.endsWith('...')).toBe(true)
    })
  })

  describe('batchEnhanceArticles', () => {
    it('应该批量增强文章内容', async () => {
      const mockFetchFullContent = vi.fn()
        .mockResolvedValueOnce(mockArticleContent)
        .mockResolvedValueOnce({
          ...mockArticleContent,
          textContent: 'React 是 Facebook 开发的前端库...'
        })
      
      const result = await batchEnhanceArticles(
        mockFeedArticles, 
        mockFetchFullContent, 
        2
      )
      
      expect(result).toHaveLength(2)
      expect(mockFetchFullContent).toHaveBeenCalledTimes(2)
      expect(result[0].content).toBe(mockArticleContent.textContent)
    })

    it('应该处理全文抓取失败的情况', async () => {
      const mockFetchFullContent = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockArticleContent)
      
      const result = await batchEnhanceArticles(
        mockFeedArticles, 
        mockFetchFullContent
      )
      
      expect(result).toHaveLength(2)
      // 第一个文章抓取失败，应该降级到RSS内容
      expect(result[0].content).toBe('Vue.js 3.0 引入了 Composition API')
      // 第二个文章抓取成功
      expect(result[1].content).toBe(mockArticleContent.textContent)
    })
  })

  describe('验证函数', () => {
    describe('validateArticleData', () => {
      it('应该验证有效的文章数据', () => {
        const validArticle = {
          id: 'test',
          title: 'Test Title',
          content: 'Test Content',
          url: 'https://test.com',
          publishDate: new Date(),
          feedId: 'feed-1'
        }
        
        expect(validateArticleData(validArticle)).toBe(true)
      })

      it('应该拒绝无效的文章数据', () => {
        const invalidArticle = {
          id: '',
          title: 'Test Title',
          content: 'Test Content',
          url: '',
          publishDate: new Date(),
          feedId: 'feed-1'
        }
        
        expect(validateArticleData(invalidArticle)).toBe(false)
      })
    })

    describe('validateUserInterests', () => {
      it('应该验证有效的用户兴趣', () => {
        const validInterests = {
          keywords: [{ word: 'test', weight: 0.5 }]
        }
        
        expect(validateUserInterests(validInterests)).toBe(true)
      })

      it('应该拒绝空的用户兴趣', () => {
        const invalidInterests = {
          keywords: []
        }
        
        expect(validateUserInterests(invalidInterests)).toBe(false)
      })
    })
  })

  describe('createEmptyUserInterests', () => {
    it('应该创建有效的空用户兴趣', () => {
      const result = createEmptyUserInterests()
      
      expect(result.keywords).toHaveLength(3)
      expect(validateUserInterests(result)).toBe(true)
    })
  })

  describe('convertWithStats', () => {
    it('应该返回转换结果和统计信息', async () => {
      const mockFetchFullContent = vi.fn()
        .mockResolvedValue(mockArticleContent)
      
      const result = await convertWithStats(mockFeedArticles, mockFetchFullContent)
      
      expect(result.articles).toHaveLength(2)
      expect(result.stats.totalArticles).toBe(2)
      expect(result.stats.enhancedArticles).toBe(2)
      expect(result.stats.averageContentLength).toBeGreaterThan(0)
      expect(result.stats.conversionTime).toBeGreaterThanOrEqual(0)
    })

    it('应该在不使用全文抓取时正常工作', async () => {
      const result = await convertWithStats(mockFeedArticles)
      
      expect(result.articles).toHaveLength(2)
      expect(result.stats.totalArticles).toBe(2)
      expect(result.stats.enhancedArticles).toBe(0)
    })
  })
})