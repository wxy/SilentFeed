/**
 * AI集成策略设计文档
 * Phase 6.5: 制定三层推荐架构的具体实现策略
 * 
 * 设计目标：
 * 1. 并发控制策略（避免API限流和成本失控）
 * 2. 成本控制策略（预算管理和智能降级）
 * 3. 错误处理和降级策略（保证服务可用性）
 * 4. 性能优化策略（缓存、批处理、预加载）
 */

/**
 * AI集成策略配置
 */
export interface AIIntegrationStrategy {
  /** 并发控制 */
  concurrency: ConcurrencyStrategy
  
  /** 成本控制 */
  cost: CostControlStrategy
  
  /** 错误处理 */
  errorHandling: ErrorHandlingStrategy
  
  /** 性能优化 */
  performance: PerformanceStrategy
  
  /** 降级策略 */
  fallback: FallbackStrategy
}

/**
 * 并发控制策略
 */
export interface ConcurrencyStrategy {
  /** 同时运行的AI请求数上限 */
  maxConcurrentRequests: number
  
  /** 批处理大小 */
  batchSize: number
  
  /** 请求间隔（毫秒） */
  requestInterval: number
  
  /** 限流策略 */
  rateLimiting: {
    /** 每分钟最大请求数 */
    requestsPerMinute: number
    /** 每小时最大请求数 */
    requestsPerHour: number
    /** 每日最大请求数 */
    requestsPerDay: number
  }
  
  /** 队列管理 */
  queue: {
    /** 最大队列长度 */
    maxQueueSize: number
    /** 队列优先级算法 */
    priorityAlgorithm: 'fifo' | 'lifo' | 'priority'
    /** 超时处理（秒） */
    timeout: number
  }
}

/**
 * 成本控制策略
 */
export interface CostControlStrategy {
  /** 月度预算限制 */
  monthlyBudget: number
  
  /** 预算使用阈值 */
  budgetThresholds: {
    /** 警告阈值（80%） */
    warning: number
    /** 限制阈值（95%） */
    limit: number
    /** 紧急停止阈值（100%） */
    emergency: number
  }
  
  /** 成本计算 */
  costCalculation: {
    /** 每个token的成本（美元） */
    costPerToken: number
    /** 每次请求的固定成本 */
    fixedCostPerRequest: number
    /** 成本估算缓冲区（20%） */
    estimationBuffer: number
  }
  
  /** 预算分配策略 */
  budgetAllocation: {
    /** 页面分析预算比例 */
    pageAnalysis: number // 70%
    /** 推荐生成预算比例 */
    recommendation: number // 30%
  }
  
  /** 动态调整 */
  dynamicAdjustment: {
    /** 根据使用率调整批处理大小 */
    adjustBatchSize: boolean
    /** 根据预算调整推荐数量 */
    adjustRecommendationCount: boolean
    /** 智能跳过低价值请求 */
    skipLowValueRequests: boolean
  }
}

/**
 * 错误处理策略
 */
export interface ErrorHandlingStrategy {
  /** 重试策略 */
  retry: {
    /** 最大重试次数 */
    maxAttempts: number
    /** 重试间隔（指数退避） */
    baseDelay: number
    /** 最大重试间隔 */
    maxDelay: number
    /** 可重试的错误类型 */
    retryableErrors: string[]
  }
  
  /** 超时处理 */
  timeout: {
    /** 单个请求超时（毫秒） */
    requestTimeout: number
    /** 批处理超时 */
    batchTimeout: number
    /** 总体处理超时 */
    totalTimeout: number
  }
  
  /** 错误分类 */
  errorClassification: {
    /** 临时错误（可重试） */
    temporary: string[]
    /** 永久错误（不可重试） */
    permanent: string[]
    /** 限流错误（需要延迟） */
    rateLimited: string[]
  }
  
  /** 错误恢复 */
  recovery: {
    /** 自动降级阈值（连续失败次数） */
    autoFallbackThreshold: number
    /** 恢复检测间隔（分钟） */
    recoveryCheckInterval: number
    /** 渐进式恢复 */
    gradualRecovery: boolean
  }
}

/**
 * 性能优化策略
 */
export interface PerformanceStrategy {
  /** 缓存策略 */
  caching: {
    /** 启用分析结果缓存 */
    enableAnalysisCache: boolean
    /** 缓存TTL（秒） */
    cacheTTL: number
    /** 最大缓存大小 */
    maxCacheSize: number
    /** 缓存键生成策略 */
    keyStrategy: 'content-hash' | 'url-based' | 'hybrid'
  }
  
  /** 预处理 */
  preprocessing: {
    /** 启用内容去重 */
    enableDeduplication: boolean
    /** 启用内容过滤 */
    enableContentFiltering: boolean
    /** 最小内容长度 */
    minContentLength: number
    /** 最大内容长度 */
    maxContentLength: number
  }
  
  /** 批处理优化 */
  batching: {
    /** 动态批处理大小 */
    dynamicBatchSize: boolean
    /** 批处理聚合策略 */
    aggregationStrategy: 'immediate' | 'delayed' | 'adaptive'
    /** 最大等待时间（毫秒） */
    maxWaitTime: number
  }
  
  /** 并行处理 */
  parallelization: {
    /** 启用并行处理 */
    enableParallelProcessing: boolean
    /** 工作线程数量 */
    workerCount: number
    /** 任务分片大小 */
    chunkSize: number
  }
}

/**
 * 降级策略
 */
export interface FallbackStrategy {
  /** 降级触发条件 */
  triggers: {
    /** API不可用 */
    apiUnavailable: boolean
    /** 成本超限 */
    costExceeded: boolean
    /** 性能过慢 */
    performanceDegraded: boolean
    /** 错误率过高 */
    highErrorRate: boolean
  }
  
  /** 降级层级 */
  levels: {
    /** Level 1: 减少AI功能 */
    reducedAI: {
      /** 跳过复杂分析 */
      skipComplexAnalysis: boolean
      /** 使用缓存结果 */
      useCachedResults: boolean
      /** 减少推荐数量 */
      reduceRecommendationCount: number
    }
    
    /** Level 2: 本地AI */
    localAI: {
      /** 使用Chrome AI */
      useChromeAI: boolean
      /** 使用Ollama */
      useOllama: boolean
      /** 本地模型配置 */
      localModelConfig: any
    }
    
    /** Level 3: 纯算法 */
    algorithmOnly: {
      /** 使用TF-IDF */
      useTFIDF: boolean
      /** 使用关键词匹配 */
      useKeywordMatching: boolean
      /** 使用统计分析 */
      useStatisticalAnalysis: boolean
    }
  }
  
  /** 降级决策 */
  decision: {
    /** 决策算法 */
    algorithm: 'threshold-based' | 'ml-based' | 'rule-based'
    /** 决策因素权重 */
    factors: {
      cost: number
      performance: number
      errorRate: number
      userExperience: number
    }
  }
  
  /** 恢复策略 */
  recovery: {
    /** 自动恢复 */
    autoRecovery: boolean
    /** 恢复检测间隔（分钟） */
    recoveryInterval: number
    /** 渐进式恢复 */
    gradualRecovery: boolean
    /** 恢复验证 */
    recoveryValidation: boolean
  }
}

/**
 * 实时监控指标
 */
export interface MonitoringMetrics {
  /** 性能指标 */
  performance: {
    /** 平均响应时间（毫秒） */
    avgResponseTime: number
    /** 吞吐量（请求/秒） */
    throughput: number
    /** 并发度 */
    concurrency: number
  }
  
  /** 成本指标 */
  cost: {
    /** 当前使用量 */
    currentUsage: number
    /** 预计月度成本 */
    projectedMonthlyCost: number
    /** 成本效率（推荐质量/成本） */
    costEfficiency: number
  }
  
  /** 质量指标 */
  quality: {
    /** 推荐准确率 */
    accuracy: number
    /** 用户满意度 */
    satisfaction: number
    /** 点击转化率 */
    clickThroughRate: number
  }
  
  /** 可靠性指标 */
  reliability: {
    /** 成功率 */
    successRate: number
    /** 错误率 */
    errorRate: number
    /** 可用性 */
    availability: number
  }
}

/**
 * 自适应策略管理器
 */
export interface AdaptiveStrategyManager {
  /** 根据指标调整策略 */
  adjustStrategy(metrics: MonitoringMetrics): Promise<Partial<AIIntegrationStrategy>>
  
  /** 获取当前策略 */
  getCurrentStrategy(): AIIntegrationStrategy
  
  /** 获取策略历史 */
  getStrategyHistory(): StrategyHistoryEntry[]
  
  /** 预测性调整 */
  predictiveAdjustment(forecast: UsageForecast): Promise<void>
}

/**
 * 策略历史记录
 */
export interface StrategyHistoryEntry {
  timestamp: number
  strategy: AIIntegrationStrategy
  reason: string
  metrics: MonitoringMetrics
  effectiveness: number
}

/**
 * 使用量预测
 */
export interface UsageForecast {
  expectedVolume: number
  timeHorizon: number // 小时
  confidenceLevel: number
  factors: {
    seasonality: number
    trending: number
    userBehavior: number
  }
}

/**
 * 默认AI集成策略
 */
export const DEFAULT_AI_INTEGRATION_STRATEGY: AIIntegrationStrategy = {
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
    monthlyBudget: 5.0, // $5/月
    budgetThresholds: {
      warning: 0.8,
      limit: 0.95,
      emergency: 1.0
    },
    costCalculation: {
      costPerToken: 0.00002, // $0.02/1K tokens (DeepSeek)
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
 * AI策略执行器接口
 */
export interface AIStrategyExecutor {
  /** 执行AI分析（带策略控制） */
  executeAnalysis(
    content: string[], 
    context: AnalysisContext
  ): Promise<AnalysisResult>
  
  /** 检查策略状态 */
  checkStrategyStatus(): StrategyStatus
  
  /** 更新策略配置 */
  updateStrategy(strategy: Partial<AIIntegrationStrategy>): void
  
  /** 获取实时指标 */
  getMetrics(): MonitoringMetrics
}

/**
 * 分析上下文
 */
export interface AnalysisContext {
  userProfile: any
  priority: 'high' | 'medium' | 'low'
  timeout?: number
  maxCost?: number
  fallbackAllowed?: boolean
}

/**
 * 分析结果
 */
export interface AnalysisResult {
  success: boolean
  results: any[]
  cost: number
  method: 'ai' | 'local-ai' | 'algorithm'
  metadata: {
    processingTime: number
    tokensUsed?: number
    cacheHit: boolean
    fallbackUsed: boolean
  }
}

/**
 * 策略状态
 */
export interface StrategyStatus {
  active: boolean
  currentLevel: 'full-ai' | 'reduced-ai' | 'local-ai' | 'algorithm-only'
  budgetUsage: number
  errorRate: number
  lastAdjustment: number
  nextReview: number
}