/**
 * AI推荐系统数据流架构
 * Phase 6.4: 数据流设计
 * 
 * 设计目标：
 * 1. 从RSS源到推荐展示的完整数据流
 * 2. 三层筛选架构：TF-IDF预筛选 → AI评分 → Chrome AI增强  
 * 3. 异步处理管道，支持并发控制和错误降级
 * 4. 性能监控和进度追踪
 */

import type { FeedArticle } from '@/core/rss/types'
import type { UserProfile } from '@/core/profile/types' 
import type { RecommendationConfig } from '@/storage/recommendation-config'

/**
 * 推荐数据流输入
 */
export interface RecommendationInput {
  /** RSS文章列表（原始数据） */
  articles: FeedArticle[]
  
  /** 用户兴趣画像 */
  userProfile: UserProfile
  
  /** 推荐配置 */
  config: RecommendationConfig
  
  /** 处理选项 */
  options?: {
    /** 最大处理数量（默认200条） */
    maxArticles?: number
    /** 是否跳过全文抓取 */
    skipFullContent?: boolean
    /** 强制使用特定算法 */
    forceAlgorithm?: 'tfidf' | 'ai' | 'hybrid'
  }
}

/**
 * 推荐结果
 */
export interface RecommendationResult {
  /** 推荐的文章列表 */
  articles: RecommendedArticle[]
  
  /** 处理统计信息 */
  stats: RecommendationStats
  
  /** 使用的算法 */
  algorithm: 'tfidf' | 'ai' | 'hybrid'
  
  /** 处理时间戳 */
  timestamp: number
  
  /** 错误信息（如果有） */
  errors?: ProcessingError[]
}

/**
 * 推荐的文章（增强版）
 */
export interface RecommendedArticle extends FeedArticle {
  /** 推荐分数 (0-1) */
  score: number
  
  /** 推荐理由 */
  reason: string
  
  /** 置信度 (0-1) */
  confidence: number
  
  /** 匹配的用户兴趣标签 */
  matchedInterests: string[]
  
  /** 全文内容（如果抓取成功） */
  fullContent?: string
  
  /** TF-IDF特征向量 */
  features?: Record<string, number>
  
  /** AI分析结果（如果使用AI） */
  aiAnalysis?: {
    relevanceScore: number
    keyPoints: string[]
    sentimentScore?: number
  }
}

/**
 * 处理统计信息
 */
export interface RecommendationStats {
  /** 输入文章数量 */
  inputCount: number
  
  /** 各阶段处理数量 */
  processed: {
    fullContent: number  // 成功抓取全文的数量
    tfidfFiltered: number // TF-IDF筛选后数量
    aiScored: number     // AI评分的数量
    finalRecommended: number // 最终推荐数量
  }
  
  /** 处理时间（毫秒） */
  timing: {
    total: number
    fullContentFetch: number
    tfidfAnalysis: number
    aiScoring: number
    totalPipeline: number
  }
  
  /** 错误统计 */
  errors: {
    fullContentFailed: number
    tfidfFailed: number
    aiFailed: number
  }
  
  /** 成本统计（如果使用AI） */
  cost?: {
    apiCalls: number
    estimatedCost: number // 美元
    tokensUsed: number
  }
}

/**
 * 处理错误
 */
export interface ProcessingError {
  stage: 'input' | 'fullContent' | 'tfidf' | 'ai' | 'output'
  message: string
  articleId?: string
  timestamp: number
  recoverable: boolean
}

/**
 * 数据流处理管道接口
 */
export interface RecommendationPipeline {
  /**
   * 执行推荐流程
   */
  process(input: RecommendationInput): Promise<RecommendationResult>
  
  /**
   * 获取处理进度（用于UI展示）
   */
  getProgress(): PipelineProgress
  
  /**
   * 取消当前处理
   */
  cancel(): void
  
  /**
   * 清理资源
   */
  cleanup(): void
}

/**
 * 管道处理进度
 */
export interface PipelineProgress {
  stage: 'idle' | 'fullContent' | 'tfidf' | 'ai' | 'finalizing' | 'complete' | 'error'
  progress: number // 0-1
  message: string
  estimatedTimeRemaining?: number // 秒
}

/**
 * 处理阶段接口
 */
export interface PipelineStage<TInput, TOutput> {
  name: string
  process(input: TInput, context: ProcessingContext): Promise<TOutput>
  canRecover(error: Error): boolean
}

/**
 * 处理上下文
 */
export interface ProcessingContext {
  config: RecommendationConfig
  userProfile: UserProfile
  stats: Partial<RecommendationStats>
  abortSignal: AbortSignal
  
  /** 进度更新回调 */
  onProgress(stage: string, progress: number, message: string): void
  
  /** 错误记录回调 */
  onError(error: ProcessingError): void
}

/**
 * 全文内容抓取阶段
 */
export interface FullContentStage extends PipelineStage<FeedArticle[], EnhancedArticle[]> {
  /** 并发限制 */
  concurrency: number
  
  /** 超时设置 */
  timeout: number
}

/**
 * 增强后的文章
 */
export interface EnhancedArticle extends FeedArticle {
  fullContent?: string
  contentFetchError?: string
}

/**
 * TF-IDF预筛选阶段
 */
export interface TFIDFStage extends PipelineStage<EnhancedArticle[], ScoredArticle[]> {
  /** 筛选数量 */
  targetCount: number
}

/**
 * TF-IDF评分后的文章
 */
export interface ScoredArticle extends EnhancedArticle {
  tfidfScore: number
  features: Record<string, number>
}

/**
 * AI评分阶段
 */
export interface AIStage extends PipelineStage<ScoredArticle[], RecommendedArticle[]> {
  /** 批处理大小 */
  batchSize: number
  
  /** 并发请求限制 */
  maxConcurrency: number
  
  /** 成本控制 */
  costLimit: number
}

/**
 * 缓存策略接口
 */
export interface CacheStrategy {
  /** 获取缓存的推荐结果 */
  getRecommendation(key: string): Promise<RecommendationResult | null>
  
  /** 保存推荐结果到缓存 */
  setRecommendation(key: string, result: RecommendationResult): Promise<void>
  
  /** 生成缓存键 */
  generateKey(input: RecommendationInput): string
  
  /** 清理过期缓存 */
  cleanup(): Promise<void>
}

/**
 * 性能监控接口
 */
export interface PerformanceMonitor {
  /** 开始计时 */
  startTimer(name: string): string
  
  /** 结束计时 */
  endTimer(timerId: string): number
  
  /** 记录指标 */
  recordMetric(name: string, value: number, unit?: string): void
  
  /** 获取统计报告 */
  getReport(): PerformanceReport
}

/**
 * 性能报告
 */
export interface PerformanceReport {
  averageProcessingTime: number
  successRate: number
  errorRate: number
  costPerRecommendation?: number
  throughput: number // 每分钟处理的文章数
}

/**
 * 数据流配置
 */
export interface PipelineConfig {
  /** 全文抓取配置 */
  fullContent: {
    enabled: boolean
    concurrency: number
    timeout: number
    retries: number
  }
  
  /** TF-IDF配置 */
  tfidf: {
    targetCount: number
    minScore: number
    vocabularySize: number
  }
  
  /** AI配置 */
  ai: {
    enabled: boolean
    batchSize: number
    maxConcurrency: number
    timeout: number
    costLimit: number
    fallbackToTFIDF: boolean
  }
  
  /** 缓存配置 */
  cache: {
    enabled: boolean
    ttl: number // 缓存时间（秒）
    maxSize: number
  }
  
  /** 监控配置 */
  monitoring: {
    enabled: boolean
    sampleRate: number
  }
}