/**
 * RSS 相关类型
 */

import type { Topic } from "@/core/profile/topics"

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
  recommendedCount: number     // 被推荐数量（已推荐）
  readCount?: number           // Phase 7: 已阅读数量（read=true）
  dislikedCount?: number       // Phase 7: 不想读数量（disliked=true）
  unreadCount: number
  recommendedReadCount?: number
  latestArticles?: FeedArticle[]
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
  recommended?: boolean
  read: boolean
  disliked?: boolean  // Phase 7: 标记不想读
  starred: boolean
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
