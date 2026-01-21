/**
 * RSS 相关类型
 */

import type { Topic } from "@/core/profile/topics"
import type { FeedAnalysisEngine } from "./analysis-engine"

/**
 * RSS 源状态
 */
export type FeedStatus =
  | "candidate"
  | "recommended"
  | "subscribed"
  | "ignored"

/**
 * RSS 源质量评估
 */
export interface FeedQuality {
  updateFrequency: number // 更新频率（篇/周）
  formatValid: boolean // 格式是否规范
  reachable: boolean // 是否可达
  score: number // 质量评分 (0-100)
  lastChecked: number // 最后检查时间戳
  details?: {
    updateFrequencyScore: number
    completenessScore: number
    formatScore: number
    reachabilityScore: number
  }
  error?: string
}

/**
 * RSS 源相关性评估
 */
export interface FeedRelevance {
  matchScore: number // 匹配分数 (0-100)
  matchedTopics: Topic[] // 匹配的主题
  sampleArticles: {
    title: string
    matchScore: number
  }[]
  analyzedAt: number
}

/**
 * 发现的 RSS 源
 */
export interface DiscoveredFeed {
  id: string
  url: string
  title: string
  description?: string
  link?: string
  language?: string
  category?: string
  lastBuildDate?: number
  itemCount?: number
  generator?: string
  discoveredFrom: string
  discoveredAt: number
  status: FeedStatus
  subscriptionSource?: "discovered" | "manual" | "imported"
  quality?: FeedQuality
  relevance?: FeedRelevance
  subscribedAt?: number
  unsubscribedAt?: number      // 取消订阅时间
  isActive: boolean
  lastFetchedAt?: number
  nextScheduledFetch?: number  // Phase 7: 下次计划抓取时间
  updateFrequency?: number     // Phase 7: 更新频率（篇/周）
  lastError?: string
  articleCount: number         // 总文章数
  analyzedCount?: number       // Phase 7: 已分析数量（有 analysis 字段）
  recommendedCount: number     // 历史推荐总数（包括被替换的）- 用于历史统计
  readCount?: number           // Phase 7: 已阅读数量（read=true）
  dislikedCount?: number       // 历史不想读总数（包括被替换的）- 用于历史统计
  unreadCount: number
  recommendedReadCount?: number  // 历史推荐已读数 - 用于历史统计
  
  // Phase 10: 新架构统计字段
  inFeedCount?: number         // 仍在 RSS 源中的文章数（inFeed=true）
  inPoolCount?: number         // 当前在推荐池中的文章数（inPool=true）
  inFeedAnalyzedCount?: number // 在源中且已分析的文章数
  inFeedRecommendedCount?: number  // 在源中且在推荐池的文章数（绿色）
  inFeedReadCount?: number     // 在源中且已阅读的文章数（蓝色）
  inFeedDislikedCount?: number // 在源中且不想读的文章数（红色）
  
  // Phase 13: 池状态统计字段
  inFeedCandidateCount?: number   // 在源中的候选池文章数（黄色）
  inFeedEliminatedCount?: number  // 在源中已淘汰的文章数（灰色：初筛淘汰+分析未达标）
  inFeedRawCount?: number         // 在源中原始池文章数（白色：未分析）
  
  latestArticles?: FeedArticle[]
  
  /** Phase 9: 分析引擎选择（默认 remoteAI） */
  analysisEngine?: FeedAnalysisEngine
  
  /** AI 订阅源质量分析结果 */
  aiAnalysis?: AISourceAnalysis
  
  /** 是否使用谷歌翻译打开链接（默认 true） */
  useGoogleTranslate?: boolean
}

/**
 * AI 订阅源质量分析结果
 */
export interface AISourceAnalysis {
  /** 订阅源 ID */
  feedId: string
  /** 分析时间戳 */
  analyzedAt: number
  /** 是否使用了 AI 分析 */
  isAIAnalyzed: boolean
  /** 综合质量分数 (0-1) */
  qualityScore: number
  /** 主要内容分类 */
  contentCategory: string
  /** 细分领域标签 */
  topicTags: string[]
  /** 订阅建议 */
  subscriptionAdvice: string
  /** 详细评分 */
  details?: {
    contentQuality: number
    updateFrequency: number
    informationDensity: number
    promotionalRatio: number
  }
  /** 分析错误（如果有） */
  error?: string
}

/**
 * RSS 文章
 */
export interface FeedArticle {
  id: string
  feedId: string
  title: string
  link: string
  description?: string
  content?: string
  author?: string
  published: number
  fetched: number
  analysis?: {
    topicProbabilities: Record<Topic, number>
    confidence: number
    provider: string
  }
  
  // ===== 用户操作状态 =====
  recommended?: boolean   // 是否曾被推荐
  read: boolean          // 是否已读
  disliked?: boolean     // 是否不想读
  starred: boolean       // 是否收藏
  
  // ===== 推荐池管理 (Phase 8: 文章持久化重构) =====
  /**
   * @deprecated 使用 poolStatus 代替。此字段仅为向后兼容保留。
   * Phase 13 后，poolStatus 是主要状态字段。
   */
  inPool?: boolean               // 是否在推荐池中（候选）
  /** @deprecated 使用 recommendedPoolAddedAt 或 candidatePoolAddedAt */
  poolAddedAt?: number           // 加入推荐池时间
  /** @deprecated 使用 poolExitedAt */
  poolRemovedAt?: number         // 移出推荐池时间
  /** @deprecated 使用 poolExitReason */
  poolRemovedReason?: 'read' | 'disliked' | 'replaced' | 'expired'
  
  // ===== RSS 源状态管理 (Phase 8) =====
  inFeed?: boolean               // 是否仍在 RSS 源中
  lastSeenInFeed?: number        // 最后一次在 RSS 源中出现的时间
  
  // ===== 软删除 (Phase 8) =====
  deleted?: boolean              // 软删除标记
  deletedAt?: number             // 删除时间
  deleteReason?: 'cleanup' | 'user' | 'feed_removed'
  
  // ===== 元数据更新追踪 (Phase 8) =====
  metadataUpdatedAt?: number     // 元数据最后更新时间
  updateCount?: number           // 更新次数
  
  // ===== 重要性评分 (Phase 8) =====
  importance?: number            // 重要性评分 0-100，用于清理决策
  
  // ===== 多池架构 (Phase 13: 推荐系统重构) =====
  /**
   * 池子状态：文章在推荐系统中的位置
   * - raw: 原料池（未分析，等待AI分析）
   * - prescreened-out: 初筛淘汰（AI初筛认为不值得详细分析）
   * - analyzed-not-qualified: 已分析但未达到推荐阈值
   * - candidate: 候选池（高分文章，等待推荐）
   * - recommended: 推荐池（已推荐给用户，待处理）- 显示方式由 deliveryMode 决定
   * - exited: 已退出（用户操作或订阅源变更导致退出）
   * - stale: 已过时（文章已从RSS源中移除，跳过分析）
   */
  poolStatus?: 'raw' | 'prescreened-out' | 'analyzed-not-qualified' | 'candidate' | 'recommended' | 'exited' | 'stale'
  
  /**
   * 分析得分：AI 分析后的推荐分数 (0-10)
   * 只有 analysis 存在时才有值
   */
  analysisScore?: number
  
  /**
   * 进入候选池时间
   */
  candidatePoolAddedAt?: number
  
  /**
   * 进入推荐池时间（已推荐给用户）
   * @deprecated Phase 13+: 改用 popupAddedAt，语义更明确
   */
  recommendedPoolAddedAt?: number
  
  /**
   * 加入弹窗时间（Phase 13+: 新字段，替代 recommendedPoolAddedAt）
   */
  popupAddedAt?: number
  
  /**
   * 从候选池/推荐池移除的原因
   * - read: 用户已阅读
   * - disliked: 用户不想读
   * - saved: 用户稍后读（加入阅读列表）
   * - replaced: 被更高分文章替换
   * - expired: 过期（超过保鲜期）
   * - quality_dropped: 质量下降（重新分析后）
   * - feed_unsubscribed: 所属订阅源被取消订阅
   * - feed_deleted: 所属订阅源被删除
   */
  poolExitReason?: 'read' | 'disliked' | 'saved' | 'replaced' | 'expired' | 'quality_dropped' | 'feed_unsubscribed' | 'feed_deleted'
  
  /**
   * 池子退出时间
   */
  poolExitedAt?: number
  
  // ===== 弹窗推荐相关字段 (Phase 13+: 从 Recommendation 表迁移) =====
  
  /**
   * 是否已读（用户点击查看）
   */
  isRead?: boolean
  
  /**
   * 点击时间
   */
  clickedAt?: number
  
  /**
   * 阅读时长（秒）
   */
  readDuration?: number
  
  /**
   * 滚动深度 (0-1)
   */
  scrollDepth?: number
  
  /**
   * 用户反馈
   * - later: 稍后读（加入阅读列表）
   * - dismissed: 不想读
   */
  feedback?: 'later' | 'dismissed'
  
  /**
   * 反馈时间
   */
  feedbackAt?: number
  
  /**
   * 推荐有效性评估
   * - effective: 有效（深度阅读）
   * - neutral: 中性（浅度阅读）
   * - ineffective: 无效（未读或拒绝）
   */
  effectiveness?: 'effective' | 'neutral' | 'ineffective'
  
  /**
   * 推荐理由（从 Recommendation 表迁移）
   */
  recommendationReason?: string | {
    primary: string
    secondary?: string[]
    confidence: number
  }
  
  /**
   * 翻译数据（可选）
   * 当启用自动翻译时，存储翻译后的标题和摘要
   */
  translation?: {
    sourceLanguage: string     // 原文语言（由 AI 识别）
    targetLanguage: string     // 译文语言（界面语言）
    translatedTitle: string    // 翻译后的标题
    translatedSummary?: string // 翻译后的摘要
    translatedAt: number       // 翻译时间
  }
  
  /**
   * 阅读列表相关字段
   * 追踪"稍后读"行为及后续真实阅读
   */
  addedToReadingListAt?: number
  readFromReadingListAt?: number
  readingListConversionRate?: number  // 从稍后读到实际阅读的转化率
}

/**
 * RSS 链接检测结果
 */
export interface RSSLink {
  url: string
  type: "rss" | "atom"
  title?: string
}

/**
 * RSS 验证结果
 */
export interface ValidationResult {
  valid: boolean
  type: "rss" | "atom" | null
  metadata?: FeedMetadata
  error?: string
}

/**
 * RSS 源元数据
 */
export interface FeedMetadata {
  title: string
  description: string
  link: string
  language?: string
  category?: string
  lastBuildDate?: number
  pubDate?: number
  itemCount?: number
  generator?: string
  copyright?: string
}

/**
 * RSS 内容
 */
export interface RSSContent {
  raw: string
  metadata: FeedMetadata
  articles: RSSArticle[]
}

/**
 * RSS 文章（未保存到数据库的临时数据）
 */
export interface RSSArticle {
  title: string
  link: string
  description?: string
  content?: string
  author?: string
  published: number
}
