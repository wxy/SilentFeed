/**
 * 数据库存储相关类型
 */

import type { RecommendationReason } from "./recommendation-reason"

/**
 * 临时访问记录（PendingVisit）
 */
export interface PendingVisit {
  id: string
  url: string
  title: string
  domain: string
  startTime: number
  lastActiveTime: number
  lastInteractionTime: number
  activeDuration: number
  interactionCount: number
  isActive: boolean
  expiresAt: number
  status: "pending"
}

/**
 * 页面元数据
 */
export interface PageMetadata {
  description?: string
  keywords?: string[]
  author?: string
  publishedTime?: string
  ogImage?: string
  canonical?: string
}

/**
 * 页面内容摘要
 */
export interface ContentSummary {
  firstParagraph: string
  extractedText: string
  wordCount: number
  language: "zh" | "en" | "other"
}

/**
 * 页面分析结果
 */
export interface AnalysisResult {
  keywords: string[]
  topics: string[]
  language: "zh" | "en" | "other"
  aiAnalysis?: {
    topics: Record<string, number>
    provider: "deepseek" | "keyword" | "openai" | "anthropic" | "ollama"
    model: string
    timestamp: number
    cost?: number
    currency?: "USD" | "CNY"
    tokensUsed?: {
      prompt: number
      completion: number
      total: number
    }
  }
}

/**
 * AI 分析结果（用于 page-visit-handler）
 */
export type AIAnalysisResult = AnalysisResult

/**
 * 正式访问记录（ConfirmedVisit）
 */
export interface ConfirmedVisit {
  id: string
  url: string
  title: string
  domain: string
  meta: PageMetadata | null
  contentSummary: ContentSummary | null
  analysis: AnalysisResult
  duration: number
  interactionCount: number
  visitTime: number
  source?: "organic" | "recommended" | "search"
  recommendationId?: string
  status: "qualified"
  contentRetainUntil: number
  analysisRetainUntil: number
  /** Phase 12.8: 重复访问时指向已存在的记录ID（仅用于传递，不保存到数据库） */
  existingVisitId?: string
}

/**
 * 推荐记录（Recommendation）
 */
export interface Recommendation {
  id: string
  url: string
  title: string
  summary: string
  source: string
  sourceUrl: string
  recommendedAt: number
  score: number
  /** 推荐理由（支持字符串或结构化数据） */
  reason?: RecommendationReason
  wordCount?: number
  readingTime?: number
  excerpt?: string
  isRead: boolean
  clickedAt?: number
  readDuration?: number
  scrollDepth?: number
  feedback?: "later" | "dismissed"
  feedbackAt?: number
  effectiveness?: "effective" | "neutral" | "ineffective"
  
  /** 
   * Phase 7: 推荐状态（软删除机制）
   * - active: 当前活跃的推荐（在推荐池中）
   * - replaced: 被更高分推荐替换（淘汰但保留历史）
   * - dismissed: 用户标记为不想读
   * - expired: 过期推荐（可选，用于定期清理）
   */
  status?: 'active' | 'replaced' | 'dismissed' | 'expired'
  
  /**
   * Phase 7: 替换时间（被淘汰的时间戳）
   */
  replacedAt?: number
  
  /**
   * Phase 7: 替换者ID（被哪个推荐替换）
   */
  replacedBy?: string
  
  /**
   * 翻译数据（可选）
   * 当启用自动翻译时，存储翻译后的标题和摘要
   */
  translation?: {
    /** 原文语言（由 AI 识别） */
    sourceLanguage: string
    /** 译文语言（界面语言） */
    targetLanguage: string
    /** 翻译后的标题 */
    translatedTitle: string
    /** 翻译后的摘要 */
    translatedSummary: string
    /** 翻译时间 */
    translatedAt: number
  }

  /**
   * AI 生成的摘要（优先显示）
   * Phase 14: AI 分析时生成的中文摘要，优先级高于原始 description
   */
  aiSummary?: string

  /**
   * 阅读列表相关字段
   * 追踪"稍后读"行为及后续真实阅读
   */
  
  /** 是否已保存到 Chrome 阅读列表 */
  savedToReadingList?: boolean
  
  /** 保存到阅读列表的时间戳 */
  savedAt?: number
  
  /** 从阅读列表真实阅读的时间戳 */
  readAt?: number
  
  /** 访问次数（包括从阅读列表的访问） */
  visitCount?: number
}

/**
 * 阅读列表追踪记录
 */
export interface ReadingListEntry {
  /** 唯一键，使用规范化的 URL（去掉 UTM 参数后），确保翻译 URL 和原始 URL 能匹配 */
  normalizedUrl: string
  /** 实际保存到阅读列表的 URL（可能为翻译链接） */
  url: string
  /** 原始 URL（文章的原始链接，不含翻译参数） */
  originalUrl?: string
  /** 对应的推荐 ID，用于统计与清理 */
  recommendationId?: string
  /** 保存时间戳 */
  addedAt: number
  /** 使用的标题前缀（用于排查清理策略） */
  titlePrefix?: string
}

/**
 * 推荐统计数据（实时查询）
 */
export interface RecommendationStats {
  totalCount: number
  unreadCount: number
  readCount: number
  readLaterCount: number
  dismissedCount: number
  avgReadDuration: number
  topSources: Array<{
    source: string
    count: number
    readRate: number
  }>
}

/**
 * 存储统计数据
 */
export interface StorageStats {
  pageCount: number
  pendingCount: number
  confirmedCount: number
  recommendationCount: number
  totalSizeMB: number
  firstCollectionTime?: number
  avgDailyPages: number
}

/**
 * 统计数据缓存
 */
export interface Statistics {
  id: string
  type: "daily" | "weekly" | "monthly"
  timestamp: number
  data: {
    totalVisits: number
    qualifiedVisits: number
    excludedVisits: number
    avgDwellTime: number
    topDomains: Array<{
      domain: string
      count: number
    }>
    topTopics: Array<{
      topic: string
      count: number
      percentage: number
    }>
    recommendations?: {
      total: number
      read: number
      readRate: number
      avgReadDuration: number
      dismissed: number
      effective: number
      neutral: number
      ineffective: number
      topSources: Array<{
        source: string
        count: number
        readRate: number
      }>
    }
    storage?: {
      totalRecords: number
      totalSizeMB: number
      pendingVisits: number
      confirmedVisits: number
      recommendations: number
      avgRecordSizeKB: number
    }
  }
}
