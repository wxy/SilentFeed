/**
 * 文章池管理存储模块
 * 
 * 负责多池架构的文章状态管理，包括：
 * - Raw 池（未分析）
 * - Analyzed-Not-Qualified 池（已分析但不合格）
 * - Candidate 池（候选池）
 * - Recommended 池（推荐池）
 */

import { db } from './index'
import type { FeedArticle } from '@/types/rss'
import { logger } from '@/utils/logger'

const poolLogger = logger.withTag('PoolDB')

/**
 * 获取 Raw 池文章（未分析的文章）
 * @param limit 返回的最大数量
 * @returns Raw 池文章列表
 */
export async function getRawPoolArticles(limit: number = 50): Promise<FeedArticle[]> {
  try {
    const articles = await db.feedArticles
      .where('poolStatus')
      .equals('raw')
      .limit(limit)
      .toArray()
    
    poolLogger.debug('获取 Raw 池文章', { count: articles.length, limit })
    return articles
  } catch (error) {
    poolLogger.error('获取 Raw 池文章失败', { error })
    throw error
  }
}

/**
 * 获取 Candidate 池文章（候选池）
 * @param minScore 最小分数阈值（可选）
 * @param limit 返回的最大数量
 * @returns Candidate 池文章列表（按加入时间排序）
 */
export async function getCandidatePoolArticles(
  minScore?: number,
  limit?: number
): Promise<FeedArticle[]> {
  try {
    let query = db.feedArticles
      .where('poolStatus')
      .equals('candidate')
      .sortBy('candidatePoolAddedAt')
    
    const articles = await query
    
    // 如果有最小分数要求，过滤
    let filtered = articles
    if (minScore !== undefined) {
      filtered = articles.filter(a => (a.analysisScore || 0) >= minScore)
    }
    
    // 如果有数量限制，应用
    if (limit !== undefined) {
      filtered = filtered.slice(0, limit)
    }
    
    poolLogger.debug('获取 Candidate 池文章', {
      total: articles.length,
      filtered: filtered.length,
      minScore,
      limit
    })
    
    return filtered
  } catch (error) {
    poolLogger.error('获取 Candidate 池文章失败', { error })
    throw error
  }
}

/**
 * 获取 Recommended 池文章（推荐池）
 * @param limit 返回的最大数量
 * @returns Recommended 池文章列表（按推荐时间倒序）
 */
export async function getRecommendedPoolArticles(limit?: number): Promise<FeedArticle[]> {
  try {
    const query = db.feedArticles
      .where('poolStatus')
      .equals('recommended')
      .reverse()
      .sortBy('recommendedPoolAddedAt')
    
    const articles = await query
    
    const result = limit ? articles.slice(0, limit) : articles
    
    poolLogger.debug('获取 Recommended 池文章', { count: result.length, limit })
    return result
  } catch (error) {
    poolLogger.error('获取 Recommended 池文章失败', { error })
    throw error
  }
}

/**
 * 移动文章到 Candidate 池
 * @param articleId 文章ID
 * @param analysisScore 分析分数
 */
export async function moveToCandidate(articleId: string, analysisScore: number): Promise<void> {
  try {
    await db.feedArticles.update(articleId, {
      poolStatus: 'candidate',
      analysisScore,
      candidatePoolAddedAt: Date.now()
    })
    
    poolLogger.info('文章移至 Candidate 池', { articleId, score: analysisScore })
  } catch (error) {
    poolLogger.error('移动文章到 Candidate 池失败', { error, articleId })
    throw error
  }
}

/**
 * 移动文章到 Analyzed-Not-Qualified 池
 * @param articleId 文章ID
 * @param analysisScore 分析分数
 */
export async function moveToAnalyzedNotQualified(
  articleId: string,
  analysisScore: number
): Promise<void> {
  try {
    await db.feedArticles.update(articleId, {
      poolStatus: 'analyzed-not-qualified',
      analysisScore
    })
    
    poolLogger.info('文章移至 Analyzed-Not-Qualified 池', { articleId, score: analysisScore })
  } catch (error) {
    poolLogger.error('移动文章到 Analyzed-Not-Qualified 池失败', { error, articleId })
    throw error
  }
}

/**
 * 移动文章到 Recommended 池
 * @param articleId 文章ID
 */
export async function moveToRecommended(articleId: string): Promise<void> {
  try {
    await db.feedArticles.update(articleId, {
      poolStatus: 'recommended',
      recommendedPoolAddedAt: Date.now(),
      recommended: true
    })
    
    poolLogger.info('文章移至 Recommended 池', { articleId })
  } catch (error) {
    poolLogger.error('移动文章到 Recommended 池失败', { error, articleId })
    throw error
  }
}

/**
 * 移除文章（从任何池退出）
 * @param articleId 文章ID
 * @param reason 退出原因
 */
export async function removeFromPool(
  articleId: string,
  reason: 'read' | 'disliked' | 'replaced' | 'expired' | 'quality_dropped'
): Promise<void> {
  try {
    const article = await db.feedArticles.get(articleId)
    if (!article) {
      poolLogger.warn('文章不存在，无法移除', { articleId })
      return
    }
    
    await db.feedArticles.update(articleId, {
      poolStatus: undefined,  // 清除池状态
      poolExitReason: reason,
      poolExitedAt: Date.now()
    })
    
    poolLogger.info('文章移出池', { articleId, reason, previousPool: article.poolStatus })
  } catch (error) {
    poolLogger.error('移出文章失败', { error, articleId, reason })
    throw error
  }
}

/**
 * 批量移动文章到 Candidate 池
 * @param updates 文章ID和分数的映射
 */
export async function batchMoveToCandidate(
  updates: Array<{ id: string; score: number }>
): Promise<void> {
  try {
    const now = Date.now()
    
    await db.transaction('rw', db.feedArticles, async () => {
      for (const { id, score } of updates) {
        await db.feedArticles.update(id, {
          poolStatus: 'candidate',
          analysisScore: score,
          candidatePoolAddedAt: now
        })
      }
    })
    
    poolLogger.info('批量移至 Candidate 池', { count: updates.length })
  } catch (error) {
    poolLogger.error('批量移动到 Candidate 池失败', { error })
    throw error
  }
}

/**
 * 批量移动文章到 Recommended 池
 * @param articleIds 文章ID数组
 */
export async function batchMoveToRecommended(articleIds: string[]): Promise<void> {
  try {
    const now = Date.now()
    
    await db.transaction('rw', db.feedArticles, async () => {
      for (const id of articleIds) {
        await db.feedArticles.update(id, {
          poolStatus: 'recommended',
          recommendedPoolAddedAt: now,
          recommended: true
        })
      }
    })
    
    poolLogger.info('批量移至 Recommended 池', { count: articleIds.length })
  } catch (error) {
    poolLogger.error('批量移动到 Recommended 池失败', { error })
    throw error
  }
}

/**
 * 获取各池的统计信息
 * @returns 池统计数据
 */
export async function getPoolStats() {
  try {
    const [rawCount, analyzedNotQualifiedCount, candidateCount, recommendedCount] = await Promise.all([
      db.feedArticles.where('poolStatus').equals('raw').count(),
      db.feedArticles.where('poolStatus').equals('analyzed-not-qualified').count(),
      db.feedArticles.where('poolStatus').equals('candidate').count(),
      db.feedArticles.where('poolStatus').equals('recommended').count()
    ])
    
    // 计算候选池的平均分数
    const candidateArticles = await db.feedArticles
      .where('poolStatus')
      .equals('candidate')
      .toArray()
    
    const avgCandidateScore = candidateArticles.length > 0
      ? candidateArticles.reduce((sum, a) => sum + (a.analysisScore || 0), 0) / candidateArticles.length
      : 0
    
    // 计算推荐池的平均存留时间
    const now = Date.now()
    const recommendedArticles = await db.feedArticles
      .where('poolStatus')
      .equals('recommended')
      .toArray()
    
    const avgRecommendedAge = recommendedArticles.length > 0
      ? recommendedArticles.reduce((sum, a) => {
          const age = now - (a.recommendedPoolAddedAt || now)
          return sum + age
        }, 0) / recommendedArticles.length
      : 0
    
    const stats = {
      raw: rawCount,
      analyzedNotQualified: analyzedNotQualifiedCount,
      candidate: {
        count: candidateCount,
        avgScore: avgCandidateScore
      },
      recommended: {
        count: recommendedCount,
        avgAgeMs: avgRecommendedAge,
        avgAgeDays: avgRecommendedAge / (24 * 60 * 60 * 1000)
      },
      total: rawCount + analyzedNotQualifiedCount + candidateCount + recommendedCount
    }
    
    poolLogger.debug('池统计', stats)
    return stats
  } catch (error) {
    poolLogger.error('获取池统计失败', { error })
    throw error
  }
}

/**
 * 清理过期的 Candidate 池文章
 * @param maxAgeDays Candidate 池文章的最大存留天数，超过则移除
 * @returns 清理的文章数
 */
export async function cleanupExpiredCandidates(maxAgeDays: number = 30): Promise<number> {
  try {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    const cutoffTime = Date.now() - maxAgeMs
    
    const expiredArticles = await db.feedArticles
      .where('poolStatus')
      .equals('candidate')
      .filter(a => (a.candidatePoolAddedAt || 0) < cutoffTime)
      .toArray()
    
    if (expiredArticles.length === 0) {
      poolLogger.debug('没有过期的 Candidate 文章需要清理')
      return 0
    }
    
    await db.transaction('rw', db.feedArticles, async () => {
      for (const article of expiredArticles) {
        await removeFromPool(article.id, 'expired')
      }
    })
    
    poolLogger.info('清理过期 Candidate 文章', {
      count: expiredArticles.length,
      maxAgeDays
    })
    
    return expiredArticles.length
  } catch (error) {
    poolLogger.error('清理过期 Candidate 文章失败', { error })
    throw error
  }
}
