/**
 * 推荐系统类型定义
 * Phase 6: 核心类型接口
 */

import type { FeedArticle } from '../rss/types'
import type { UserProfile } from '../profile/types'

/**
 * 推荐输入
 */
export interface RecommendationInput {
  articles: FeedArticle[]
  userProfile: UserProfile
  config: RecommendationConfig
  options?: RecommendationOptions
}

/**
 * 推荐配置
 */
export interface RecommendationConfig {
  useReasoning?: boolean
  useLocalAI?: boolean
  maxRecommendations?: number
  tfidfThreshold?: number  // Phase 6: TF-IDF 最低分数阈值（低于此分数的文章不送 AI 分析）
  qualityThreshold?: number  // Phase 6: AI 分析质量阈值（进入推荐池的最低分数）
  batchSize?: number  // Phase 6: 批次大小（每次处理的文章数量）
}

/**
 * 推荐选项
 */
export interface RecommendationOptions {
  skipFullContent?: boolean
  maxArticles?: number
}

/**
 * 推荐结果
 */
export interface RecommendationResult {
  articles: RecommendedArticle[]
  algorithm: 'tfidf' | 'ai' | 'hybrid' | 'reasoning-ai'
  stats: RecommendationStats
  timestamp: number
}

/**
 * 推荐的文章
 */
export interface RecommendedArticle {
  id: string
  title: string
  url: string
  feedId?: string  // Phase 6: RSS 源 ID，用于准确匹配统计
  score: number
  reason: string
  confidence: number
  matchedInterests: string[]
  keyPoints?: string[]
  aiAnalysis?: {
    relevanceScore: number
    keyPoints: string[]
    topics?: Record<string, number>
    provider?: string
  }
}

/**
 * 推荐统计
 */
export interface RecommendationStats {
  inputCount: number
  processed: {
    fullContent: number
    tfidfFiltered: number
    aiAnalyzed: number
    aiScored: number
    finalRecommended: number
  }
  timing: {
    total: number
    fullContentFetch: number
    tfidfAnalysis: number
    aiAnalysis: number
    aiScoring: number
  }
  errors: {
    fullContentFailed: number
    tfidfFailed: number
    aiAnalysisFailed: number
    aiFailed: number
  }
}

/**
 * 管道进度
 */
export interface PipelineProgress {
  stage: 'idle' | 'fetching' | 'fullContent' | 'tfidf' | 'ai' | 'finalizing' | 'complete' | 'error'
  progress: number
  message: string
  currentArticle?: number
  totalArticles?: number
  estimatedTimeRemaining?: number
}

/**
 * 处理错误
 */
export interface ProcessingError {
  stage: string
  articleId: string
  error: string
  recoverable: boolean
}

/**
 * 处理上下文
 */
export interface ProcessingContext {
  config: any
  userProfile: any
  stats: any
  abortSignal: AbortSignal
  onProgress: (stage: PipelineProgress['stage'], progress: number, message: string) => void
  onError: (error: ProcessingError) => void
}

/**
 * 增强的文章（带全文内容）
 */
export interface EnhancedArticle extends FeedArticle {
  fullContent?: string
  contentFetchError?: string
}

/**
 * 评分的文章
 */
export interface ScoredArticle extends EnhancedArticle {
  tfidfScore: number
  features: { content: number }
}

/**
 * 管道配置
 */
export interface PipelineConfig {
  fullContent: {
    enabled: boolean
    concurrency: number
    timeout: number
    retries: number
  }
  tfidf: {
    targetCount: number
    minScore: number
    vocabularySize: number
  }
  ai: {
    enabled: boolean
    batchSize: number
    maxConcurrency: number
    timeout: number
    costLimit: number
    fallbackToTFIDF: boolean
  }
  cache: {
    enabled: boolean
    ttl: number
    maxSize: number
  }
  monitoring: {
    enabled: boolean
    sampleRate: number
  }
}

/**
 * 推荐管道接口
 */
export interface RecommendationPipeline {
  process(input: RecommendationInput): Promise<RecommendationResult>
  getProgress(): PipelineProgress
  cancel(): void
  cleanup(): void
}