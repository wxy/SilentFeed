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
  currentRecommendedCount?: number  // 当前文章中推荐状态的数量 - 用于UI显示
  currentDislikedCount?: number     // 当前文章中不想读的数量 - 用于UI显示
  currentRecommendedReadCount?: number  // 当前推荐文章中已读的数量 - 用于UI显示
  latestArticles?: FeedArticle[]
  
  /** Phase 9: 分析引擎选择（默认 remoteAI） */
  analysisEngine?: FeedAnalysisEngine
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
  tfidfScore?: number
  
  // ===== 用户操作状态 =====
  recommended?: boolean   // 是否曾被推荐
  read: boolean          // 是否已读
  disliked?: boolean     // 是否不想读
  starred: boolean       // 是否收藏
  
  // ===== 推荐池管理 (Phase 8: 文章持久化重构) =====
  inPool?: boolean               // 是否在推荐池中（候选）
  poolAddedAt?: number           // 加入推荐池时间
  poolRemovedAt?: number         // 移出推荐池时间
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
