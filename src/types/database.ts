/**
 * 数据库存储相关类型
 */

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
    provider: "deepseek" | "keyword" | "openai" | "anthropic"
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
  reason?: string
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
