/** AI 策略执行相关类型 */

import type { AIProvider } from '@/types/ai'
import type { FeedArticle } from '@/types/rss'
import type { UserProfile } from '@/types/profile'

/** 分析上下文 */ export interface AnalysisContext {
  provider?: AIProvider
  config?: AnalysisConfig
  budget?: BudgetInfo
  cache?: CacheConfig
  userProfile?: UserProfile | { id: string }
  priority?: 'high' | 'medium' | 'low'
  timeout?: number
  maxCost?: number
  fallbackAllowed?: boolean
}

/** 分析配置 */ export interface AnalysisConfig {
  maxConcurrent: number
  timeout: number
  retryAttempts: number
  priority: 'speed' | 'accuracy' | 'balanced'
}

/** 预算信息 */ export interface BudgetInfo {
  maxTokens: number
  usedTokens: number
  maxCost: number
  usedCost: number
  maxDailyRequests: number
  usedDailyRequests: number
}

/** 缓存配置 */ export interface CacheConfig {
  enabled: boolean
  ttl: number
  maxSize: number
  compressionEnabled: boolean
}

/** AI 分析请求 */ export interface AnalysisRequest {
  article: FeedArticle
  userProfile: UserProfile
  context: AnalysisContext
  priority: number
}

/** AI 分析结果 */ export interface AnalysisResult {
  success?: boolean
  results?: any[]
  cost?: number
  method?: 'ai' | 'local-ai' | 'algorithm'
  metadata?: {
    processingTime?: number
    tokensUsed?: number
    cacheHit?: boolean
    fallbackUsed?: boolean
  }
  articleId?: string
  relevanceScore?: number
  confidence?: number
  reasoning?: string
  matchedInterests?: string[]
  keyPoints?: string[]
  sentiment?: 'positive' | 'neutral' | 'negative'
  complexity?: number
  estimatedReadTime?: number
  fromCache?: boolean
}

/** 批量分析结果 */ export interface BatchAnalysisResult {
  results: AnalysisResult[]
  totalTokensUsed: number
  totalCost: number
  cacheHitRate: number
  averageProcessingTime: number
  errors: AnalysisError[]
}

/** 分析错误 */ export interface AnalysisError {
  articleId: string
  error: string
  stage: 'validation' | 'analysis' | 'parsing'
  recoverable: boolean
  retryCount: number
}

/** 并发配置 */ export interface ConcurrencyConfig {
  maxConcurrentRequests: number
  requestQueueSize?: number
  timeoutMs?: number
  batchSize?: number
  requestInterval?: number
  rateLimiting?: {
    requestsPerMinute: number
    requestsPerHour: number
    requestsPerDay: number
  }
  queue?: {
    maxQueueSize: number
    priorityAlgorithm: string
    timeout: number
  }
}

/** 成本配置 */ export interface CostConfig {
  monthlyBudget: number
  budgetThresholds: {
    warning: number
    limit: number
    emergency: number
  }
  costCalculation: {
    costPerToken: number
    fixedCostPerRequest: number
    estimationBuffer: number
  }
  budgetAllocation: {
    pageAnalysis: number
    recommendation: number
  }
  dynamicAdjustment: {
    adjustBatchSize: boolean
    adjustRecommendationCount: boolean
    skipLowValueRequests: boolean
  }
}

/** 费用控制 */ export interface CostControlConfig {
  enableBudgetTracking: boolean
  maxDailyCostUSD: number
  maxTokensPerRequest: number
  costPerTokenUSD: number
}

/** 错误处理配置 */ export interface ErrorHandlingConfig {
  enableAutoRetry: boolean
  maxRetryAttempts: number
  retryDelayMs: number
  fallbackToLocal: boolean
  retry?: {
    maxAttempts: number
    baseDelay: number
    maxDelay: number
    retryableErrors: string[]
  }
  timeout?: {
    requestTimeout: number
    batchTimeout: number
    totalTimeout: number
  }
  errorClassification?: {
    temporary: string[]
    permanent: string[]
    rateLimited: string[]
  }
  recovery?: {
    autoFallbackThreshold: number
    recoveryCheckInterval: number
    gradualRecovery: boolean
  }
}

/** 性能配置 */ export interface PerformanceConfig {
  caching: {
    enableAnalysisCache: boolean
    cacheTimeoutMs: number
    maxCacheEntries: number
    cacheTTL?: number
    maxCacheSize?: number
    keyStrategy?: string
  }
  batching: {
    enableBatching: boolean
    maxBatchSize: number
    batchTimeoutMs: number
    dynamicBatchSize?: boolean
    aggregationStrategy?: string
    maxWaitTime?: number
  }
  preprocessing?: {
    enableDeduplication: boolean
    enableContentFiltering: boolean
    minContentLength: number
    maxContentLength: number
  }
  parallelization?: {
    enableParallelProcessing: boolean
    workerCount: number
    chunkSize: number
  }
}

/** 监控配置 */ export interface MonitoringConfig {
  enableMetrics: boolean
  sampleRate: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/** 兜底策略 */ export interface FallbackStrategyConfig {
  triggers: {
    apiUnavailable: boolean
    costExceeded: boolean
    performanceDegraded: boolean
    highErrorRate: boolean
  }
  levels: {
    reducedAI: {
      skipComplexAnalysis: boolean
      useCachedResults: boolean
      reduceRecommendationCount: number
    }
    localAI: {
      useChromeAI: boolean
      useOllama: boolean
      localModelConfig: any
    }
    algorithmOnly: {
      useTFIDF: boolean
      useKeywordMatching: boolean
      useStatisticalAnalysis: boolean
    }
  }
  decision: {
    algorithm: string
    factors: {
      cost: number
      performance: number
      errorRate: number
      userExperience: number
    }
  }
  recovery: {
    autoRecovery: boolean
    recoveryInterval: number
    gradualRecovery: boolean
    recoveryValidation: boolean
  }
}

/** AI 集成策略 */ export interface AIIntegrationStrategy {
  concurrency: ConcurrencyConfig
  cost?: CostConfig
  costControl?: CostControlConfig
  errorHandling: ErrorHandlingConfig
  performance: PerformanceConfig
  monitoring: MonitoringConfig
  fallback?: FallbackStrategyConfig
}

/** 策略状态 */ export interface StrategyStatus {
  active?: boolean
  currentLevel: 'full-ai' | 'hybrid' | 'local-only' | 'disabled' | 'reduced-ai' | 'local-ai' | 'algorithm-only'
  confidence: number
  lastUpdated: number
  reasons: string[]
  budgetUsage?: number
  errorRate?: number
  lastAdjustment?: number
  nextReview?: number
}

/** 监控指标 */ export interface MonitoringMetrics {
  requestCount: number
  successCount: number
  errorCount: number
  totalCostUSD: number
  averageLatencyMs: number
  cacheHitRate: number
  lastUpdated: number
  performance?: {
    avgResponseTime: number
    throughput: number
    concurrency: number
  }
  cost?: {
    currentUsage: number
    projectedMonthlyCost: number
    costEfficiency: number
  }
  quality?: {
    accuracy: number
    satisfaction: number
    clickThroughRate: number
  }
  reliability?: {
    successRate: number
    errorRate: number
    availability: number
  }
}

/** AI 策略执行器接口 */ export interface AIStrategyExecutor {
  executeAnalysis(content: string[], context: AnalysisContext): Promise<AnalysisResult>
  checkStrategyStatus(): StrategyStatus
  updateStrategy(strategy: Partial<AIIntegrationStrategy>): void
  getMetrics(): MonitoringMetrics
}
