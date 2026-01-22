/**
 * AI 策略决策相关类型
 * Phase 13: 推荐系统重构
 */

import type { Topic } from "@/core/profile/topics"

/**
 * 策略决策上下文：AI 决策所需的系统状态快照
 */
export interface StrategyDecisionContext {
  /** 供给侧数据 */
  supply: {
    totalFeeds: number
    activeFeeds: number
    avgUpdateFrequency: number     // 平均更新频率（篇/周）
    dailyNewArticles: number       // 日均新增文章数
    rawPoolSize: number            // 原料池大小（未分析）
    candidatePoolSize: number      // 候选池大小（高分文章）
    analyzedNotQualifiedSize: number // 已分析但未达标的文章数
  }
  
  /** 需求侧数据 */
  demand: {
    dailyReadCount: number         // 日均阅读数
    avgReadSpeed: number           // 平均阅读速度（篇/天）
    dismissRate: number            // 拒绝率（%）
    likeRate: number               // 喜欢率（%）
    recommendationPoolSize: number // 当前推荐池大小
    recommendationPoolCapacity: number // 推荐池容量（maxRecommendations × 2）
  }
  
  /** 系统状态数据 */
  system: {
    aiTokensUsedToday: number      // 今日 AI tokens 使用量
    aiTokensBudgetDaily: number    // 日预算 tokens
    aiCostToday: number            // 今日成本（USD）
    analyzedArticlesToday: number  // 今日分析数
    recommendedArticlesToday: number // 今日推荐数
  }
  
  /** 历史数据 */
  history: {
    last7DaysReadCount: number     // 7天阅读总数
    last7DaysRecommendedCount: number // 7天推荐总数
    last7DaysAnalyzedCount: number // 7天分析总数
  }
  
  /** 用户画像 */
  userProfile: {
    pageVisitCount: number         // 总页面访问数
    onboardingComplete: boolean    // 是否完成引导
    topTopics: Topic[]             // 主要兴趣话题
    profileConfidence: number      // 画像置信度 (0-1)
  }
  
  /** 上下文生成时间 */
  timestamp: number
}

/**
 * 推荐策略：AI 输出的参数化策略
 */
export interface RecommendationStrategy {
  /** 推荐策略 */
  recommendation: {
    targetPoolSize: number         // 推荐池目标容量 (3-10)
    refillThreshold: number        // 触发补充的阈值 (1-5)
    dailyLimit: number             // 每日推荐上限 (5-30)
    cooldownMinutes: number        // 补充冷却时间 (30-180分钟)
  }
  
  /** 候选池管理 */
  candidatePool: {
    expiryHours: number            // 过期时间（小时，24-336），超过此时间自动淘汰
    entryThreshold: number         // 准入阈值 (0.5-0.9)，AI 评分高于此值才能进入候选池
  }
  
  /** 元数据 */
  meta: {
    validHours: number             // 策略有效期（小时，12-48）
    generatedAt: number            // 生成时间戳
    version: string                // 策略版本号
    nextReviewHours: number        // 下次审查时间（小时）
  }
}

/**
 * 策略决策记录
 */
export interface StrategyDecision {
  id: string
  
  /** 决策时间 */
  createdAt: number
  
  /** 策略有效期至 */
  validUntil: number
  
  /** 下次审查时间 */
  nextReview: number
  
  /** 决策上下文（快照） */
  context: StrategyDecisionContext
  
  /** AI 输出的策略 */
  strategy: RecommendationStrategy
  
  /** AI 推理过程（可选，用于调试） */
  reasoning?: string
  
  /** 执行结果（用于学习和优化） */
  execution?: {
    appliedAt?: number             // 应用时间
    articlesAnalyzed?: number      // 实际分析数
    recommendationsGenerated?: number // 实际推荐数
    avgScore?: number              // 平均推荐分数
    effectiveness?: number         // 有效性 (0-1)，基于用户反馈
    actualCostUSD?: number         // 实际成本（USD）
    completedAt?: number           // 完成时间
  }
  
  /** 策略状态 */
  status: 'active' | 'completed' | 'invalidated' | 'expired' | 'replaced' | 'failed'
  
  /** 失败原因（如果有） */
  failureReason?: string
}

/**
 * 策略性能指标
 */
export interface StrategyPerformance {
  strategyId: string
  
  /** 分析效率 */
  analysisMetrics: {
    totalAnalyzed: number
    avgBatchTime: number           // 平均批次耗时（秒）
    successRate: number            // 成功率 (0-1)
    avgScore: number               // 平均得分
  }
  
  /** 推荐效果 */
  recommendationMetrics: {
    totalRecommended: number
    readCount: number
    readRate: number               // 阅读率 (0-1)
    dismissedCount: number
    dismissRate: number            // 拒绝率 (0-1)
    avgReadDuration: number        // 平均阅读时长（秒）
  }
  
  /** 成本效率 */
  costMetrics: {
    totalTokensUsed: number
    totalCost: number              // USD
    costPerRecommendation: number  // USD
    costPerRead: number            // USD
  }
  
  /** 用户满意度 */
  satisfactionMetrics: {
    likeCount: number
    likeRate: number               // 喜欢率 (0-1)
    starredCount: number
    feedbackScore: number          // 综合反馈分数 (0-10)
  }
  
  /** 测量时间范围 */
  measuredFrom: number
  measuredUntil: number
}
