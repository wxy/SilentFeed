/**
 * RuleBasedRecommender 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { RuleBasedRecommender, type ArticleData, type UserInterests } from './RuleBasedRecommender'

describe('RuleBasedRecommender', () => {
  let recommender: RuleBasedRecommender
  let mockArticles: ArticleData[]
  let mockUserInterests: UserInterests

  beforeEach(() => {
    recommender = new RuleBasedRecommender()

    // 模拟文章数据
    mockArticles = [
      {
        id: '1',
        title: 'Vue.js 3.0 新特性详解',
        content: 'Vue.js 3.0 引入了 Composition API，提供了更好的TypeScript支持和性能优化。',
        publishDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2小时前
        feedId: 'tech-feed',
        url: 'https://example.com/vue3'
      },
      {
        id: '2', 
        title: 'React Hooks 最佳实践',
        content: 'React Hooks 改变了我们编写组件的方式，本文介绍了useState、useEffect等核心概念。',
        publishDate: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6小时前
        feedId: 'react-feed',
        url: 'https://example.com/react-hooks'
      },
      {
        id: '3',
        title: '人工智能在医疗领域的应用',
        content: '机器学习和深度学习技术正在revolutionize医疗诊断和治疗方案。',
        publishDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1天前
        feedId: 'ai-feed',
        url: 'https://example.com/ai-medical'
      },
      {
        id: '4',
        title: '老文章测试',
        content: '这是一篇很老的文章，应该被时间过滤掉',
        publishDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10天前
        feedId: 'old-feed',
        url: 'https://example.com/old'
      },
      {
        id: '5',
        title: '短文章',
        content: '太短',
        publishDate: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1小时前  
        feedId: 'short-feed',
        url: 'https://example.com/short'
      }
    ]

    // 模拟用户兴趣
    mockUserInterests = {
      keywords: [
        { word: 'Vue.js', weight: 0.8 },
        { word: 'React', weight: 0.7 },
        { word: 'TypeScript', weight: 0.6 },
        { word: '前端开发', weight: 0.5 }
      ]
    }
  })

  describe('recommend', () => {
    it('应该返回推荐列表', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests,
        5
      )

      expect(recommendations).toHaveLength(3) // 过滤掉老文章和短文章
      expect(recommendations[0]).toHaveProperty('articleId')
      expect(recommendations[0]).toHaveProperty('relevanceScore')
      expect(recommendations[0]).toHaveProperty('freshnessScore')
      expect(recommendations[0]).toHaveProperty('finalScore')
      expect(recommendations[0]).toHaveProperty('keywords')
    })

    it('应该按分数降序排列', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].finalScore).toBeGreaterThanOrEqual(
          recommendations[i + 1].finalScore
        )
      }
    })

    it('应该限制返回数量', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests,
        2
      )

      expect(recommendations).toHaveLength(2)
    })

    it('空文章列表应该返回空数组', async () => {
      const recommendations = await recommender.recommend(
        [],
        mockUserInterests
      )

      expect(recommendations).toHaveLength(0)
    })

    it('相关性高的文章应该排在前面', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      // Vue.js文章应该比AI医疗文章相关性更高
      const vueArticle = recommendations.find(r => r.articleId === '1')
      const aiArticle = recommendations.find(r => r.articleId === '3')

      if (vueArticle && aiArticle) {
        expect(vueArticle.relevanceScore).toBeGreaterThan(aiArticle.relevanceScore)
      }
    })
  })

  describe('时效性评分', () => {
    it('新文章应该有更高的时效性分数', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      // 2小时前的文章应该比24小时前的文章分数更高
      const recentArticle = recommendations.find(r => r.articleId === '1')
      const olderArticle = recommendations.find(r => r.articleId === '3')

      if (recentArticle && olderArticle) {
        expect(recentArticle.freshnessScore).toBeGreaterThan(olderArticle.freshnessScore)
      }
    })
  })

  describe('文章过滤', () => {
    it('应该过滤太老的文章', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      // 10天前的文章应该被过滤掉
      const oldArticle = recommendations.find(r => r.articleId === '4')
      expect(oldArticle).toBeUndefined()
    })

    it('应该过滤太短的文章', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      // 内容太短的文章应该被过滤掉
      const shortArticle = recommendations.find(r => r.articleId === '5')
      expect(shortArticle).toBeUndefined()
    })
  })

  describe('关键词匹配', () => {
    it('应该提取匹配的关键词', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      const vueRecommendation = recommendations.find(r => r.articleId === '1')
      expect(vueRecommendation?.keywords).toContain('Vue.js')
      expect(vueRecommendation?.keywords).toContain('TypeScript')
    })

    it('关键词数量应该有限制', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      for (const rec of recommendations) {
        expect(rec.keywords.length).toBeLessThanOrEqual(5)
      }
    })
  })

  describe('边界情况', () => {
    it('用户无兴趣关键词时应该正常工作', async () => {
      const emptyInterests: UserInterests = { keywords: [] }
      const recommendations = await recommender.recommend(
        mockArticles,
        emptyInterests
      )

      expect(recommendations).toBeDefined()
      // 应该主要基于时效性评分
      expect(recommendations.every(r => r.freshnessScore > 0)).toBe(true)
    })

    it('所有分数应该在0-1范围内', async () => {
      const recommendations = await recommender.recommend(
        mockArticles,
        mockUserInterests
      )

      for (const rec of recommendations) {
        expect(rec.relevanceScore).toBeGreaterThanOrEqual(0)
        expect(rec.relevanceScore).toBeLessThanOrEqual(1)
        expect(rec.freshnessScore).toBeGreaterThanOrEqual(0)
        expect(rec.freshnessScore).toBeLessThanOrEqual(1)
        expect(rec.finalScore).toBeGreaterThanOrEqual(0)
        expect(rec.finalScore).toBeLessThanOrEqual(1)
      }
    })
  })
})