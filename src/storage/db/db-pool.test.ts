/**
 * 文章池管理存储模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './index'
import {
  getRawPoolArticles,
  getCandidatePoolArticles,
  getRecommendedPoolArticles,
  moveToCandidate,
  moveToAnalyzedNotQualified,
  moveToRecommended,
  removeFromPool,
  batchMoveToCandidate,
  batchMoveToRecommended,
  getPoolStats,
  cleanupExpiredCandidates
} from './db-pool'
import type { FeedArticle } from '@/types/rss'

describe('db-pool', () => {
  beforeEach(async () => {
    // 清空文章表
    await db.feedArticles.clear()
  })

  describe('getRawPoolArticles', () => {
    it('应该返回 Raw 池文章', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'raw-1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Raw Article 1',
          published: Date.now(),
          poolStatus: 'raw'
        } as FeedArticle,
        {
          id: 'raw-2',
          feedId: 'feed-1',
          link: 'http://example.com/2',
          title: 'Raw Article 2',
          published: Date.now(),
          poolStatus: 'raw'
        } as FeedArticle,
        {
          id: 'candidate-1',
          feedId: 'feed-1',
          link: 'http://example.com/3',
          title: 'Candidate Article',
          published: Date.now(),
          poolStatus: 'candidate'
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const rawArticles = await getRawPoolArticles()
      expect(rawArticles).toHaveLength(2)
      expect(rawArticles[0].poolStatus).toBe('raw')
    })

    it('应该遵守 limit 参数', async () => {
      // 添加 10 篇 Raw 文章
      const articles: FeedArticle[] = Array.from({ length: 10 }, (_, i) => ({
        id: `raw-${i}`,
        feedId: 'feed-1',
        link: `http://example.com/${i}`,
        title: `Article ${i}`,
        published: Date.now(),
        poolStatus: 'raw'
      })) as FeedArticle[]

      await db.feedArticles.bulkAdd(articles)

      const limited = await getRawPoolArticles(5)
      expect(limited).toHaveLength(5)
    })
  })

  describe('getCandidatePoolArticles', () => {
    it('应该返回 Candidate 池文章', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'candidate-1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Candidate 1',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 7.5,
          candidatePoolAddedAt: Date.now() - 2000
        } as FeedArticle,
        {
          id: 'candidate-2',
          feedId: 'feed-1',
          link: 'http://example.com/2',
          title: 'Candidate 2',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 8.0,
          candidatePoolAddedAt: Date.now() - 1000
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const candidates = await getCandidatePoolArticles()
      expect(candidates).toHaveLength(2)
    })

    it('应该按 minScore 过滤', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'c1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Low Score',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 7.0,
          candidatePoolAddedAt: Date.now()
        } as FeedArticle,
        {
          id: 'c2',
          feedId: 'feed-1',
          link: 'http://example.com/2',
          title: 'High Score',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 8.5,
          candidatePoolAddedAt: Date.now()
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const filtered = await getCandidatePoolArticles(8.0)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('c2')
    })
  })

  describe('getRecommendedPoolArticles', () => {
    it('应该返回 Recommended 池文章', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'rec-1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Recommended 1',
          published: Date.now(),
          poolStatus: 'recommended',
          recommendedPoolAddedAt: Date.now() - 2000
        } as FeedArticle,
        {
          id: 'rec-2',
          feedId: 'feed-1',
          link: 'http://example.com/2',
          title: 'Recommended 2',
          published: Date.now(),
          poolStatus: 'recommended',
          recommendedPoolAddedAt: Date.now() - 1000
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const recommended = await getRecommendedPoolArticles()
      expect(recommended).toHaveLength(2)
    })
  })

  describe('moveToCandidate', () => {
    it('应该将文章移至 Candidate 池', async () => {
      const article: FeedArticle = {
        id: 'test-1',
        feedId: 'feed-1',
        link: 'http://example.com/1',
        title: 'Test Article',
        published: Date.now(),
        poolStatus: 'raw'
      } as FeedArticle

      await db.feedArticles.add(article)
      await moveToCandidate('test-1', 7.8)

      const updated = await db.feedArticles.get('test-1')
      expect(updated?.poolStatus).toBe('candidate')
      expect(updated?.analysisScore).toBe(7.8)
      expect(updated?.candidatePoolAddedAt).toBeDefined()
    })
  })

  describe('moveToAnalyzedNotQualified', () => {
    it('应该将文章移至 Analyzed-Not-Qualified 池', async () => {
      const article: FeedArticle = {
        id: 'test-2',
        feedId: 'feed-1',
        link: 'http://example.com/2',
        title: 'Low Score Article',
        published: Date.now(),
        poolStatus: 'raw'
      } as FeedArticle

      await db.feedArticles.add(article)
      await moveToAnalyzedNotQualified('test-2', 5.5)

      const updated = await db.feedArticles.get('test-2')
      expect(updated?.poolStatus).toBe('analyzed-not-qualified')
      expect(updated?.analysisScore).toBe(5.5)
    })
  })

  describe('moveToRecommended', () => {
    it('应该将文章移至 Recommended 池', async () => {
      const article: FeedArticle = {
        id: 'test-3',
        feedId: 'feed-1',
        link: 'http://example.com/3',
        title: 'Ready to Recommend',
        published: Date.now(),
        poolStatus: 'candidate',
        analysisScore: 8.0
      } as FeedArticle

      await db.feedArticles.add(article)
      await moveToRecommended('test-3')

      const updated = await db.feedArticles.get('test-3')
      expect(updated?.poolStatus).toBe('recommended')
      expect(updated?.recommended).toBe(true)
      expect(updated?.recommendedPoolAddedAt).toBeDefined()
    })
  })

  describe('removeFromPool', () => {
    it('应该移除文章并记录原因', async () => {
      const article: FeedArticle = {
        id: 'test-4',
        feedId: 'feed-1',
        link: 'http://example.com/4',
        title: 'To Be Removed',
        published: Date.now(),
        poolStatus: 'recommended'
      } as FeedArticle

      await db.feedArticles.add(article)
      await removeFromPool('test-4', 'read')

      const updated = await db.feedArticles.get('test-4')
      expect(updated?.poolStatus).toBe('exited')
      expect(updated?.poolExitReason).toBe('read')
      expect(updated?.poolExitedAt).toBeDefined()
    })
  })

  describe('batchMoveToCandidate', () => {
    it('应该批量移动文章到 Candidate 池', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'batch-1',
          feedId: 'feed-1',
          link: 'http://example.com/b1',
          title: 'Batch 1',
          published: Date.now(),
          poolStatus: 'raw'
        } as FeedArticle,
        {
          id: 'batch-2',
          feedId: 'feed-1',
          link: 'http://example.com/b2',
          title: 'Batch 2',
          published: Date.now(),
          poolStatus: 'raw'
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const updates = [
        { id: 'batch-1', score: 7.5 },
        { id: 'batch-2', score: 8.0 }
      ]

      await batchMoveToCandidate(updates)

      const updated1 = await db.feedArticles.get('batch-1')
      const updated2 = await db.feedArticles.get('batch-2')

      expect(updated1?.poolStatus).toBe('candidate')
      expect(updated1?.analysisScore).toBe(7.5)
      expect(updated2?.poolStatus).toBe('candidate')
      expect(updated2?.analysisScore).toBe(8.0)
    })
  })

  describe('batchMoveToRecommended', () => {
    it('应该批量移动文章到 Recommended 池', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'rec-batch-1',
          feedId: 'feed-1',
          link: 'http://example.com/r1',
          title: 'Rec Batch 1',
          published: Date.now(),
          poolStatus: 'candidate'
        } as FeedArticle,
        {
          id: 'rec-batch-2',
          feedId: 'feed-1',
          link: 'http://example.com/r2',
          title: 'Rec Batch 2',
          published: Date.now(),
          poolStatus: 'candidate'
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)
      await batchMoveToRecommended(['rec-batch-1', 'rec-batch-2'])

      const updated1 = await db.feedArticles.get('rec-batch-1')
      const updated2 = await db.feedArticles.get('rec-batch-2')

      expect(updated1?.poolStatus).toBe('recommended')
      expect(updated1?.recommended).toBe(true)
      expect(updated2?.poolStatus).toBe('recommended')
      expect(updated2?.recommended).toBe(true)
    })
  })

  describe('getPoolStats', () => {
    it('应该返回各池的统计信息', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'raw-stat',
          feedId: 'feed-1',
          link: 'http://example.com/raw',
          title: 'Raw',
          published: Date.now(),
          poolStatus: 'raw'
        } as FeedArticle,
        {
          id: 'analyzed-stat',
          feedId: 'feed-1',
          link: 'http://example.com/analyzed',
          title: 'Analyzed Not Qualified',
          published: Date.now(),
          poolStatus: 'analyzed-not-qualified'
        } as FeedArticle,
        {
          id: 'candidate-stat',
          feedId: 'feed-1',
          link: 'http://example.com/candidate',
          title: 'Candidate',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 7.5,
          candidatePoolAddedAt: Date.now()
        } as FeedArticle,
        {
          id: 'recommended-stat',
          feedId: 'feed-1',
          link: 'http://example.com/recommended',
          title: 'Recommended',
          published: Date.now(),
          poolStatus: 'recommended',
          recommendedPoolAddedAt: Date.now()
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const stats = await getPoolStats()
      expect(stats.raw).toBe(1)
      expect(stats.analyzedNotQualified).toBe(1)
      expect(stats.candidate.count).toBe(1)
      expect(stats.candidate.avgScore).toBe(7.5)
      expect(stats.recommended.count).toBe(1)
      expect(stats.activeTotal).toBe(4)
    })
  })

  describe('cleanupExpiredCandidates', () => {
    it('应该清理过期的 Candidate 文章', async () => {
      const now = Date.now()
      const expiredTime = now - 31 * 24 * 60 * 60 * 1000 // 31 天前

      const articles: FeedArticle[] = [
        {
          id: 'expired-candidate',
          feedId: 'feed-1',
          link: 'http://example.com/expired',
          title: 'Expired Candidate',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 7.5,
          candidatePoolAddedAt: expiredTime
        } as FeedArticle,
        {
          id: 'fresh-candidate',
          feedId: 'feed-1',
          link: 'http://example.com/fresh',
          title: 'Fresh Candidate',
          published: Date.now(),
          poolStatus: 'candidate',
          analysisScore: 7.5,
          candidatePoolAddedAt: now
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const cleaned = await cleanupExpiredCandidates(30)
      expect(cleaned).toBe(1)

      const expired = await db.feedArticles.get('expired-candidate')
      expect(expired?.poolStatus).toBe('exited')
      expect(expired?.poolExitReason).toBe('expired')

      const fresh = await db.feedArticles.get('fresh-candidate')
      expect(fresh?.poolStatus).toBe('candidate')
    })

    it('没有过期文章时不应清理任何记录', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'fresh',
          feedId: 'feed-1',
          link: 'http://example.com/fresh',
          title: 'Fresh',
          published: Date.now(),
          poolStatus: 'candidate',
          candidatePoolAddedAt: Date.now()
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const cleaned = await cleanupExpiredCandidates(30)
      expect(cleaned).toBe(0)
    })

    it('应该正确处理没有 candidatePoolAddedAt 的文章', async () => {
      const articles: FeedArticle[] = [
        {
          id: 'no-timestamp',
          feedId: 'feed-1',
          link: 'http://example.com/no-ts',
          title: 'No Timestamp',
          published: Date.now(),
          poolStatus: 'candidate',
          // candidatePoolAddedAt 未设置
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      // 没有时间戳的文章会被视为时间戳为 0，应该被清理
      const cleaned = await cleanupExpiredCandidates(30)
      expect(cleaned).toBe(1)

      const article = await db.feedArticles.get('no-timestamp')
      expect(article?.poolStatus).toBe('exited')
    })
  })

  describe('边界情况测试', () => {
    it('moveToCandidate 应该成功更新存在的文章', async () => {
      await db.feedArticles.add({
        id: 'test-id',
        feedId: 'feed-1',
        link: 'http://example.com',
        title: 'Test',
        published: Date.now(),
        poolStatus: 'raw'
      } as FeedArticle)

      await moveToCandidate('test-id', 8.0)
      const article = await db.feedArticles.get('test-id')
      expect(article?.poolStatus).toBe('candidate')
      expect(article?.analysisScore).toBe(8.0)
    })

    it('moveToRecommended 应该成功更新存在的文章', async () => {
      await db.feedArticles.add({
        id: 'test-id',
        feedId: 'feed-1',
        link: 'http://example.com',
        title: 'Test',
        published: Date.now(),
        poolStatus: 'candidate'
      } as FeedArticle)

      await moveToRecommended('test-id')
      const article = await db.feedArticles.get('test-id')
      expect(article?.poolStatus).toBe('recommended')
    })

    it('removeFromPool 应该成功移除存在的文章', async () => {
      await db.feedArticles.add({
        id: 'test-id',
        feedId: 'feed-1',
        link: 'http://example.com',
        title: 'Test',
        published: Date.now(),
        poolStatus: 'candidate'
      } as FeedArticle)

      await removeFromPool('test-id', 'test-reason')
      const article = await db.feedArticles.get('test-id')
      expect(article?.poolStatus).toBe('exited')
      expect(article?.poolExitReason).toBe('test-reason')
    })

    it('getPoolStats 应该处理空数据库', async () => {
      const stats = await getPoolStats()
      expect(stats.raw).toBe(0)
      expect(stats.candidate.count).toBe(0)
      expect(stats.recommended.count).toBe(0)
      expect(stats.activeTotal).toBe(0)
    })

    it('batchMoveToCandidate 应该处理空数组', async () => {
      // 空数组时不应抛出错误
      await expect(batchMoveToCandidate([])).resolves.toBeUndefined()
    })

    it('batchMoveToRecommended 应该处理空数组', async () => {
      // 空数组时不应抛出错误
      await expect(batchMoveToRecommended([])).resolves.toBeUndefined()
    })

    it('getCandidatePoolArticles 应该正确排序', async () => {
      const now = Date.now()
      const articles: FeedArticle[] = [
        {
          id: 'c1',
          feedId: 'feed-1',
          link: 'http://example.com/1',
          title: 'Newer',
          published: now,
          poolStatus: 'candidate',
          analysisScore: 7.5,
          candidatePoolAddedAt: now - 1000 // 1秒前
        } as FeedArticle,
        {
          id: 'c2',
          feedId: 'feed-1',
          link: 'http://example.com/2',
          title: 'Older',
          published: now,
          poolStatus: 'candidate',
          analysisScore: 7.5,
          candidatePoolAddedAt: now - 5000 // 5秒前
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const candidates = await getCandidatePoolArticles()
      // 应该按加入时间排序，旧的在前
      expect(candidates[0].id).toBe('c2')
      expect(candidates[1].id).toBe('c1')
    })

    it('getRecommendedPoolArticles 应该只返回未退出的文章', async () => {
      const now = Date.now()
      const articles: FeedArticle[] = [
        {
          id: 'active',
          feedId: 'feed-1',
          link: 'http://example.com/active',
          title: 'Active',
          published: now,
          poolStatus: 'recommended',
          isRead: false,
          feedback: null
        } as FeedArticle,
        {
          id: 'read',
          feedId: 'feed-1',
          link: 'http://example.com/read',
          title: 'Read',
          published: now,
          poolStatus: 'recommended',
          isRead: true // 已读但未退出池
        } as FeedArticle,
        {
          id: 'dismissed',
          feedId: 'feed-1',
          link: 'http://example.com/dismissed',
          title: 'Dismissed',
          published: now,
          poolStatus: 'recommended',
          feedback: 'dismissed' // 已拒绝但未退出池
        } as FeedArticle
      ]

      await db.feedArticles.bulkAdd(articles)

      const recommended = await getRecommendedPoolArticles()
      // 应该返回所有 recommended 状态的文章，包括已读和已拒绝的
      expect(recommended.length).toBe(3)
    })
  })
})
