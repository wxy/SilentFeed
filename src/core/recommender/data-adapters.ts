/**
 * 数据适配器
 * Phase 6: AI推荐引擎
 * 
 * 功能：解决不同模块间的数据格式兼容性问题
 * 1. FeedArticle → ArticleData 转换（RSS → 推荐引擎）
 * 2. UserProfile → UserInterests 转换（用户画像 → 推荐引擎）
 * 3. AI分析结果集成到推荐流程
 */

import type { FeedArticle } from '../rss/types'
import type { UserProfile } from '../profile/types'
import type { ArticleData, UserInterests } from './RuleBasedRecommender'
import type { ArticleContent } from '../rss/article-fetcher'

/**
 * RSS文章转换为推荐引擎数据格式
 * 
 * @param feedArticles - RSS文章列表
 * @returns 推荐引擎数据格式
 */
export function convertFeedArticlesToArticleData(
  feedArticles: FeedArticle[]
): ArticleData[] {
  return feedArticles.map(article => ({
    id: article.id,
    title: article.title,
    content: article.description || article.content || '',
    publishDate: new Date(article.published),
    feedId: article.feedId,
    url: article.link
  }))
}

/**
 * 用户画像转换为推荐引擎兴趣格式
 * 
 * @param userProfile - 用户画像
 * @returns 推荐引擎兴趣格式
 */
export function convertUserProfileToUserInterests(
  userProfile: UserProfile
): UserInterests {
  // 将用户画像的关键词转换为推荐引擎需要的格式
  return {
    keywords: userProfile.keywords.map(keyword => ({
      word: keyword.word,
      weight: keyword.weight
    }))
  }
}

/**
 * 增强RSS文章内容（使用全文抓取器）
 * 
 * @param feedArticle - RSS文章
 * @param fullContent - 全文抓取内容
 * @returns 增强后的文章数据
 */
export function enhanceArticleWithFullContent(
  feedArticle: FeedArticle,
  fullContent: ArticleContent | null
): ArticleData {
  // 优先使用全文内容，降级到RSS描述
  let content = feedArticle.description || feedArticle.content || ''
  
  if (fullContent) {
    // 使用全文抓取的内容，但限制长度避免性能问题
    content = fullContent.textContent.length > 5000 
      ? fullContent.textContent.substring(0, 5000) + '...'
      : fullContent.textContent
  }
  
  return {
    id: feedArticle.id,
    title: feedArticle.title,
    content: content,
    publishDate: new Date(feedArticle.published),
    feedId: feedArticle.feedId,
    url: feedArticle.link
  }
}

/**
 * 批量增强RSS文章内容
 * 
 * @param feedArticles - RSS文章列表
 * @param fetchFullContent - 全文抓取函数
 * @param maxConcurrent - 最大并发数
 * @returns 增强后的文章数据列表
 */
export async function batchEnhanceArticles(
  feedArticles: FeedArticle[],
  fetchFullContent: (url: string) => Promise<ArticleContent | null>,
  maxConcurrent: number = 5
): Promise<ArticleData[]> {
  const results: ArticleData[] = []
  
  // 分批处理，控制并发
  for (let i = 0; i < feedArticles.length; i += maxConcurrent) {
    const batch = feedArticles.slice(i, i + maxConcurrent)
    
    const batchPromises = batch.map(async (article) => {
      try {
        // 尝试抓取全文，失败时使用RSS内容
        const fullContent = await fetchFullContent(article.link)
        return enhanceArticleWithFullContent(article, fullContent)
      } catch (error) {
        console.warn(`[DataAdapter] 全文抓取失败: ${article.link}`, error)
        // 降级到RSS内容
        return enhanceArticleWithFullContent(article, null)
      }
    })
    
    const batchResults = await Promise.allSettled(batchPromises)
    
    // 收集成功的结果
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        // 即使全文抓取失败，也要保留RSS基础信息
        const article = batch[index]
        console.warn(`[DataAdapter] 文章处理完全失败: ${article.id}`, result.reason)
        results.push(enhanceArticleWithFullContent(article, null))
      }
    })
  }
  
  return results
}

/**
 * 验证数据完整性
 * 
 * @param articleData - 文章数据
 * @returns 是否有效
 */
export function validateArticleData(articleData: ArticleData): boolean {
  return !!(
    articleData.id &&
    articleData.title &&
    articleData.content &&
    articleData.url &&
    articleData.publishDate
  )
}

/**
 * 验证用户兴趣数据完整性
 * 
 * @param userInterests - 用户兴趣
 * @returns 是否有效
 */
export function validateUserInterests(userInterests: UserInterests): boolean {
  return !!(
    userInterests.keywords &&
    Array.isArray(userInterests.keywords) &&
    userInterests.keywords.length > 0
  )
}

/**
 * 创建空的用户兴趣（用于无画像时的降级）
 * 
 * @returns 空的用户兴趣
 */
export function createEmptyUserInterests(): UserInterests {
  return {
    keywords: [
      // 提供一些通用的关键词，确保推荐引擎不会完全失效
      { word: '技术', weight: 0.1 },
      { word: '科技', weight: 0.1 },
      { word: '新闻', weight: 0.1 }
    ]
  }
}

/**
 * 数据适配器统计信息
 */
export interface AdapterStats {
  totalArticles: number
  enhancedArticles: number
  failedEnhancements: number
  averageContentLength: number
  conversionTime: number
}

/**
 * 带统计的批量转换
 * 
 * @param feedArticles - RSS文章列表
 * @param fetchFullContent - 全文抓取函数（可选）
 * @returns 转换结果和统计信息
 */
export async function convertWithStats(
  feedArticles: FeedArticle[],
  fetchFullContent?: (url: string) => Promise<ArticleContent | null>
): Promise<{
  articles: ArticleData[]
  stats: AdapterStats
}> {
  const startTime = Date.now()
  let enhancedCount = 0
  let failedCount = 0
  let totalContentLength = 0
  
  let articles: ArticleData[]
  
  if (fetchFullContent) {
    // 使用全文抓取增强
    articles = await batchEnhanceArticles(feedArticles, fetchFullContent)
    enhancedCount = articles.length
  } else {
    // 仅转换格式
    articles = convertFeedArticlesToArticleData(feedArticles)
  }
  
  // 统计内容长度
  articles.forEach(article => {
    totalContentLength += article.content.length
  })
  
  const stats: AdapterStats = {
    totalArticles: feedArticles.length,
    enhancedArticles: enhancedCount,
    failedEnhancements: failedCount,
    averageContentLength: totalContentLength / articles.length || 0,
    conversionTime: Date.now() - startTime
  }
  
  return { articles, stats }
}