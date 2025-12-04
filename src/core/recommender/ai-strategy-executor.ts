/**
 * AI策略执行器实现
 * Phase 6.5: 具体实现AI集成策略
 * 
 * 功能：
 * 1. 执行AI分析请求，应用并发控制和成本控制
 * 2. 监控指标，实时调整策略
 * 3. 错误处理和自动降级
 * 4. 性能优化（缓存、批处理）
 */

// 从本地类型定义导入
import type {
  AnalysisContext,
  AnalysisResult,
  BatchAnalysisResult,
  AnalysisRequest,
  AnalysisError,
  AnalysisConfig,
  BudgetInfo,
  CacheConfig,
  AIIntegrationStrategy,
  StrategyStatus,
  MonitoringMetrics,
  AIStrategyExecutor
} from '@/types/ai-strategy'

import { aiManager } from '../ai/AICapabilityManager'
import { getAIConfig } from '../../storage/ai-config'

/**
 * 默认AI集成策略配置
 */
const DEFAULT_AI_INTEGRATION_STRATEGY: AIIntegrationStrategy = {
  concurrency: {
    maxConcurrentRequests: 3,
    batchSize: 5,
    requestInterval: 1000,
    rateLimiting: {
      requestsPerMinute: 20,
      requestsPerHour: 500,
      requestsPerDay: 5000
    },
    queue: {
      maxQueueSize: 50,
      priorityAlgorithm: 'priority',
      timeout: 300
    }
  },
  
  cost: {
    monthlyBudget: 5.0,
    budgetThresholds: {
      warning: 0.8,
      limit: 0.95,
      emergency: 1.0
    },
    costCalculation: {
      costPerToken: 0.00002,
      fixedCostPerRequest: 0.001,
      estimationBuffer: 0.2
    },
    budgetAllocation: {
      pageAnalysis: 0.7,
      recommendation: 0.3
    },
    dynamicAdjustment: {
      adjustBatchSize: true,
      adjustRecommendationCount: true,
      skipLowValueRequests: true
    }
  },
  
  errorHandling: {
    enableAutoRetry: true,
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
    fallbackToLocal: true,
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      retryableErrors: ['timeout', 'rate_limit', 'server_error']
    },
    timeout: {
      requestTimeout: 30000,
      batchTimeout: 60000,
      totalTimeout: 300000
    },
    errorClassification: {
      temporary: ['timeout', 'rate_limit', 'server_error', 'network_error'],
      permanent: ['invalid_key', 'quota_exceeded', 'model_not_found'],
      rateLimited: ['rate_limit', 'quota_exceeded']
    },
    recovery: {
      autoFallbackThreshold: 5,
      recoveryCheckInterval: 10,
      gradualRecovery: true
    }
  },
  
  performance: {
    caching: {
      enableAnalysisCache: true,
      cacheTimeoutMs: 3600000,
      maxCacheEntries: 1000,
      cacheTTL: 3600,
      maxCacheSize: 1000,
      keyStrategy: 'content-hash'
    },
    preprocessing: {
      enableDeduplication: true,
      enableContentFiltering: true,
      minContentLength: 100,
      maxContentLength: 5000
    },
    batching: {
      enableBatching: true,
      maxBatchSize: 10,
      batchTimeoutMs: 5000,
      dynamicBatchSize: true,
      aggregationStrategy: 'adaptive',
      maxWaitTime: 5000
    },
    parallelization: {
      enableParallelProcessing: true,
      workerCount: 2,
      chunkSize: 10
    }
  },
  
  monitoring: {
    enableMetrics: true,
    sampleRate: 1.0,
    logLevel: 'info'
  },
  
  fallback: {
    triggers: {
      apiUnavailable: true,
      costExceeded: true,
      performanceDegraded: true,
      highErrorRate: true
    },
    levels: {
      reducedAI: {
        skipComplexAnalysis: true,
        useCachedResults: true,
        reduceRecommendationCount: 3
      },
      localAI: {
        useChromeAI: true,
        useOllama: false,
        localModelConfig: {}
      },
      algorithmOnly: {
        useTFIDF: true,
        useKeywordMatching: true,
        useStatisticalAnalysis: false
      }
    },
    decision: {
      algorithm: 'threshold-based',
      factors: {
        cost: 0.3,
        performance: 0.3,
        errorRate: 0.2,
        userExperience: 0.2
      }
    },
    recovery: {
      autoRecovery: true,
      recoveryInterval: 15,
      gradualRecovery: true,
      recoveryValidation: true
    }
  }
}

/**
 * 请求队列项
 */
interface QueueItem {
  id: string
  content: string[]
  context: AnalysisContext
  resolve: (result: AnalysisResult) => void
  reject: (error: Error) => void
  timestamp: number
  priority: number
}

/**
 * 缓存项
 */
interface CacheItem {
  key: string
  result: AnalysisResult
  timestamp: number
  ttl: number
}

/**
 * AI策略执行器实现
 */
export class AIStrategyExecutorImpl implements AIStrategyExecutor {
  private strategy: AIIntegrationStrategy
  private metrics: MonitoringMetrics = {
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    totalCostUSD: 0,
    averageLatencyMs: 0,
    cacheHitRate: 0,
    lastUpdated: Date.now(),
    performance: { avgResponseTime: 0, throughput: 0, concurrency: 0 },
    cost: { currentUsage: 0, projectedMonthlyCost: 0, costEfficiency: 0 },
    quality: { accuracy: 0, satisfaction: 0, clickThroughRate: 0 },
    reliability: { successRate: 0, errorRate: 0, availability: 1.0 }
  }
  private queue: QueueItem[] = []
  private cache = new Map<string, CacheItem>()
  private isProcessing = false
  private currentConcurrency = 0
  private budgetUsed = 0
  private errorCount = 0
  private successCount = 0
  
  // 限流控制
  private requestCounts = {
    minute: { count: 0, resetTime: 0 },
    hour: { count: 0, resetTime: 0 },
    day: { count: 0, resetTime: 0 }
  }

  constructor(strategy: Partial<AIIntegrationStrategy> = {}) {
    this.strategy = { ...DEFAULT_AI_INTEGRATION_STRATEGY, ...strategy }
    this.initializeMetrics()
    this.startQueueProcessor()
    this.startMetricsUpdater()
  }

  async executeAnalysis(
    content: string[], 
    context: AnalysisContext
  ): Promise<AnalysisResult> {
    const startTime = Date.now()
    
    try {
      // 检查预算和限流
      if (!this.canProcessRequest(context)) {
        return this.fallbackToAlgorithm(content, context, 'budget_exceeded')
      }
      
      // 检查缓存
      const cacheKey = this.generateCacheKey(content, context)
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return {
          ...cached,
          metadata: { ...cached.metadata, cacheHit: true }
        }
      }
      
      // 检查当前负载
      if (this.shouldUseQueue(context)) {
        return this.queueRequest(content, context)
      }
      
      // 直接处理
      const result = await this.processRequest(content, context)
      
      // 缓存结果
      if (result.success && this.strategy.performance.caching.enableAnalysisCache) {
        this.setCache(cacheKey, result)
      }
      
      return result
      
    } catch (error) {
      console.error('[AIStrategyExecutor] 执行失败:', error)
      return this.fallbackToAlgorithm(content, context, 'execution_error')
    }
  }

  checkStrategyStatus(): StrategyStatus {
    const budgetUsage = this.strategy.cost ? this.budgetUsed / this.strategy.cost.monthlyBudget : 0
    const errorRate = this.successCount > 0 ? this.errorCount / (this.successCount + this.errorCount) : 0
    
    let currentLevel: StrategyStatus['currentLevel'] = 'full-ai'
    
    if (this.strategy.cost && budgetUsage >= this.strategy.cost.budgetThresholds.emergency) {
      currentLevel = 'algorithm-only'
    } else if (this.strategy.cost && (budgetUsage >= this.strategy.cost.budgetThresholds.limit || errorRate > 0.2)) {
      currentLevel = 'local-ai'
    } else if (this.strategy.cost && (budgetUsage >= this.strategy.cost.budgetThresholds.warning || errorRate > 0.1)) {
      currentLevel = 'reduced-ai'
    }
    
    return {
      active: currentLevel !== 'algorithm-only',
      currentLevel,
      confidence: Math.max(0, 1 - errorRate - budgetUsage),
      lastUpdated: Date.now(),
      reasons: [`Budget usage: ${(budgetUsage * 100).toFixed(1)}%`, `Error rate: ${(errorRate * 100).toFixed(1)}%`],
      budgetUsage,
      errorRate,
      lastAdjustment: Date.now(),
      nextReview: Date.now() + (this.strategy.errorHandling.recovery?.recoveryCheckInterval || 10) * 60000
    }
  }

  updateStrategy(strategy: Partial<AIIntegrationStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy }
  }

  getMetrics(): MonitoringMetrics {
    this.updateMetrics()
    return { ...this.metrics }
  }

  /**
   * 检查是否可以处理请求
   */
  private canProcessRequest(context: AnalysisContext): boolean {
    // 检查预算
    const budgetUsage = this.strategy.cost ? this.budgetUsed / this.strategy.cost.monthlyBudget : 0
    if (this.strategy.cost && budgetUsage >= this.strategy.cost.budgetThresholds.emergency) {
      return false
    }
    
    // 检查限流
    this.updateRateLimits()
    const rateLimits = this.strategy.concurrency.rateLimiting
    
    if (rateLimits && 
        (this.requestCounts.minute.count >= rateLimits.requestsPerMinute ||
         this.requestCounts.hour.count >= rateLimits.requestsPerHour ||
         this.requestCounts.day.count >= rateLimits.requestsPerDay)) {
      return false
    }
    
    return true
  }

  /**
   * 检查是否需要排队
   */
  private shouldUseQueue(context: AnalysisContext): boolean {
    return this.currentConcurrency >= this.strategy.concurrency.maxConcurrentRequests ||
           this.queue.length > 0
  }

  /**
   * 将请求加入队列
   */
  private async queueRequest(
    content: string[], 
    context: AnalysisContext
  ): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      const maxQueueSize = this.strategy.concurrency.queue?.maxQueueSize || 50
      if (this.queue.length >= maxQueueSize) {
        reject(new Error('队列已满'))
        return
      }
      
      const queueItem: QueueItem = {
        id: this.generateRequestId(),
        content,
        context,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: this.calculatePriority(context)
      }
      
      this.queue.push(queueItem)
      this.sortQueue()
    })
  }

  /**
   * 处理请求
   */
  private async processRequest(
    content: string[], 
    context: AnalysisContext
  ): Promise<AnalysisResult> {
    const startTime = Date.now()
    this.currentConcurrency++
    
    try {
      // 预估成本
      const estimatedCost = this.estimateCost(content)
      
      // 检查预算限制
      const monthlBudget = this.strategy.cost?.monthlyBudget || 10
      if (this.budgetUsed + estimatedCost > monthlBudget) {
        throw new Error('预算不足')
      }
      
      // 执行AI分析
      const result = await this.executeAIAnalysis(content, context)
      
      // 更新指标
      this.successCount++
      this.budgetUsed += result.cost || 0
      this.updateRequestCounts()
      
      return {
        ...result,
        metadata: {
          processingTime: Date.now() - startTime,
          cacheHit: false,
          fallbackUsed: false
        }
      }
      
    } catch (error) {
      this.errorCount++
      console.error('[AIStrategyExecutor] AI分析失败:', error)
      
      // 判断是否可以降级
      if (context.fallbackAllowed !== false) {
        return this.fallbackToAlgorithm(content, context, 'ai_error')
      }
      
      throw error
      
    } finally {
      this.currentConcurrency--
    }
  }

  /**
   * 执行AI分析
   */
  private async executeAIAnalysis(
    content: string[], 
    context: AnalysisContext
  ): Promise<AnalysisResult> {
    // 获取AI配置
    const aiConfig = await getAIConfig()
    
    if (!aiConfig.enabled || !aiConfig.provider) {
      throw new Error('AI未配置')
    }
    
    // 初始化AI管理器
    await aiManager.initialize()
    
    // 执行分析（简化实现）
    const results: any[] = []
    let totalTokens = 0
    
    for (const text of content) {
      try {
        // 模拟AI分析结果
        const analysisResult = {
          relevance: Math.random() * 0.8 + 0.1, // 0.1-0.9
          sentiment: Math.random() * 2 - 1,     // -1 to 1
          topics: ['technology', 'programming'],
          summary: text.substring(0, 100) + '...'
        }
        
        results.push(analysisResult)
        totalTokens += this.estimateTokens(text)
        
      } catch (error) {
        console.warn('[AIStrategyExecutor] 单个内容分析失败:', error)
      }
    }
    
    const cost = this.calculateActualCost(totalTokens)
    
    return {
      success: true,
      results,
      cost,
      method: 'ai',
      metadata: {
        processingTime: 0,
        tokensUsed: totalTokens,
        cacheHit: false,
        fallbackUsed: false
      }
    }
  }

  /**
   * 降级到算法处理
   */
  private fallbackToAlgorithm(
    content: string[], 
    context: AnalysisContext,
    reason: string
  ): AnalysisResult {
    
    // 使用TF-IDF或关键词匹配
    const results = content.map(text => ({
      relevance: this.calculateKeywordRelevance(text, context),
      sentiment: 0,
      topics: this.extractSimpleTopics(text),
      summary: text.substring(0, 100) + '...'
    }))
    
    return {
      success: true,
      results,
      cost: 0,
      method: 'algorithm',
      metadata: {
        processingTime: Date.now(),
        cacheHit: false,
        fallbackUsed: true
      }
    }
  }

  /**
   * 队列处理器
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      if (!this.isProcessing && this.queue.length > 0) {
        this.processQueue()
      }
    }, this.strategy.concurrency.requestInterval)
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }
    
    this.isProcessing = true
    
    try {
      while (this.queue.length > 0 && 
             this.currentConcurrency < this.strategy.concurrency.maxConcurrentRequests) {
        
        const item = this.queue.shift()
        if (!item) break
        
        // 检查超时
        const queueTimeout = this.strategy.concurrency.queue?.timeout || 300
        if (Date.now() - item.timestamp > queueTimeout * 1000) {
          item.reject(new Error('队列超时'))
          continue
        }
        
        // 处理请求
        this.processRequest(item.content, item.context)
          .then(item.resolve)
          .catch(item.reject)
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * 辅助方法
   */
  private initializeMetrics(): void {
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      totalCostUSD: 0,
      averageLatencyMs: 0,
      cacheHitRate: 0,
      lastUpdated: Date.now(),
      performance: { avgResponseTime: 0, throughput: 0, concurrency: 0 },
      cost: { currentUsage: 0, projectedMonthlyCost: 0, costEfficiency: 0 },
      quality: { accuracy: 0, satisfaction: 0, clickThroughRate: 0 },
      reliability: { successRate: 0, errorRate: 0, availability: 1.0 }
    }
  }

  private updateMetrics(): void {
    const total = this.successCount + this.errorCount
    
    if (this.metrics.reliability) {
      this.metrics.reliability.successRate = total > 0 ? this.successCount / total : 1.0
      this.metrics.reliability.errorRate = total > 0 ? this.errorCount / total : 0
    }
    if (this.metrics.cost) {
      this.metrics.cost.currentUsage = this.budgetUsed
      this.metrics.cost.projectedMonthlyCost = this.budgetUsed * (30 / new Date().getDate())
    }
    if (this.metrics.performance) {
      this.metrics.performance.concurrency = this.currentConcurrency
    }
  }

  private startMetricsUpdater(): void {
    setInterval(() => {
      this.updateMetrics()
    }, 60000) // 每分钟更新一次
  }

  private generateCacheKey(content: string[], context: AnalysisContext): string {
    const contentHash = this.hashContent(content.join(''))
    const contextHash = JSON.stringify({ 
      priority: context.priority,
      userProfile: context.userProfile?.id || 'anonymous'
    })
    return `${contentHash}-${this.hashContent(contextHash)}`
  }

  private hashContent(content: string): string {
    // 简单的哈希函数
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  private getFromCache(key: string): AnalysisResult | null {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() - item.timestamp > item.ttl * 1000) {
      this.cache.delete(key)
      return null
    }
    
    return item.result
  }

  private setCache(key: string, result: AnalysisResult): void {
    const maxCacheSize = this.strategy.performance.caching.maxCacheSize || 1000
    if (this.cache.size >= maxCacheSize) {
      // 删除最旧的项
      const oldestKey = Array.from(this.cache.keys())[0]
      this.cache.delete(oldestKey)
    }
    
    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      ttl: this.strategy.performance.caching.cacheTTL || 3600
    })
  }

  private updateRateLimits(): void {
    const now = Date.now()
    
    // 重置分钟计数
    if (now > this.requestCounts.minute.resetTime) {
      this.requestCounts.minute = { count: 0, resetTime: now + 60000 }
    }
    
    // 重置小时计数
    if (now > this.requestCounts.hour.resetTime) {
      this.requestCounts.hour = { count: 0, resetTime: now + 3600000 }
    }
    
    // 重置日计数
    if (now > this.requestCounts.day.resetTime) {
      this.requestCounts.day = { count: 0, resetTime: now + 86400000 }
    }
  }

  private updateRequestCounts(): void {
    this.requestCounts.minute.count++
    this.requestCounts.hour.count++
    this.requestCounts.day.count++
  }

  private estimateCost(content: string[]): number {
    const totalTokens = content.reduce((sum, text) => sum + this.estimateTokens(text), 0)
    return this.calculateActualCost(totalTokens)
  }

  private estimateTokens(text: string): number {
    // 简单的token估算：英文约4字符=1token，中文约1.5字符=1token
    const englishChars = (text.match(/[a-zA-Z\s]/g) || []).length
    const chineseChars = text.length - englishChars
    return Math.ceil(englishChars / 4 + chineseChars / 1.5)
  }

  private calculateActualCost(tokens: number): number {
    if (!this.strategy.cost?.costCalculation) {
      return 0.01 // 默认成本
    }
    const config = this.strategy.cost.costCalculation
    const cost = tokens * config.costPerToken + config.fixedCostPerRequest
    return cost * (1 + config.estimationBuffer)
  }

  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }

  private calculatePriority(context: AnalysisContext): number {
    const priorities = { high: 3, medium: 2, low: 1 }
    return priorities[context.priority || 'medium'] || 1
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp)
  }

  private calculateKeywordRelevance(text: string, context: AnalysisContext): number {
    // 简化的关键词相关性计算
    const keywords = ['javascript', 'react', 'web', 'programming']
    const textLower = text.toLowerCase()
    let matches = 0
    
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        matches++
      }
    }
    
    return Math.min(0.8, matches / keywords.length)
  }

  private extractSimpleTopics(text: string): string[] {
    const topicKeywords = {
      'technology': ['tech', 'computer', 'software', 'programming'],
      'web': ['web', 'html', 'css', 'javascript'],
      'mobile': ['mobile', 'app', 'ios', 'android']
    }
    
    const textLower = text.toLowerCase()
    const topics: string[] = []
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => textLower.includes(keyword))) {
        topics.push(topic)
      }
    }
    
    return topics.slice(0, 3) // 最多返回3个主题
  }
}