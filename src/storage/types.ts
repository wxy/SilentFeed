/**
 * 数据类型定义
 * 
 * 定义 Phase 2 所有数据结构
 */

/**
 * 临时访问记录（PendingVisit）
 * 用途：临时存储正在浏览的页面，5 分钟无交互自动清理
 */
export interface PendingVisit {
  id: string                    // UUID
  url: string                   // 完整 URL
  title: string                 // 页面标题
  domain: string                // 域名
  startTime: number             // 开始时间戳
  lastActiveTime: number        // 最后激活时间
  lastInteractionTime: number   // 最后交互时间
  activeDuration: number        // 累计激活时间（秒）
  interactionCount: number      // 交互次数
  isActive: boolean             // 当前是否激活
  expiresAt: number             // 过期时间（5 分钟后）
  status: 'pending'
}

/**
 * 页面元数据
 */
export interface PageMetadata {
  description?: string          // 页面描述
  keywords?: string[]           // 元关键词
  author?: string               // 作者
  publishedTime?: string        // 发布时间
  ogImage?: string              // OG 图片
  canonical?: string            // 规范链接
}

/**
 * 页面内容摘要
 */
export interface ContentSummary {
  firstParagraph: string        // 首段（500 字）
  extractedText: string         // 正文摘要（2000 字）
  wordCount: number             // 字数
  language: 'zh' | 'en' | 'other' // 语言（扩展支持 other）
}

/**
 * 页面分析结果
 */
export interface AnalysisResult {
  keywords: string[]            // Top 20 关键词（TF-IDF）
  topics: string[]              // 主题标签
  language: 'zh' | 'en' | 'other' // 语言（扩展支持 other）
  
  // Phase 4: AI 分析结果（可选）
  aiAnalysis?: {
    topics: Record<string, number>  // 主题概率分布 {"技术": 0.7, "设计": 0.3}
    provider: 'deepseek' | 'keyword' | 'openai' | 'anthropic' // AI 提供商
    model: string                   // 模型名称
    timestamp: number               // 分析时间戳
    cost?: number                   // 分析成本（美元）
    tokensUsed?: {                  // Token 使用量
      prompt: number
      completion: number
      total: number
    }
  }
}

/**
 * 正式访问记录（ConfirmedVisit）
 * 用途：存储满足条件的访问记录，原始内容 90 天后删除，分析结果永久保留
 */
export interface ConfirmedVisit {
  id: string                    // UUID
  url: string                   // 完整 URL
  title: string                 // 页面标题
  domain: string                // 域名
  
  // 内容信息（90 天后删除）
  meta: PageMetadata | null
  contentSummary: ContentSummary | null
  
  // 分析结果（永久保留）
  analysis: AnalysisResult
  
  // 访问信息
  duration: number              // 停留时长（秒）
  interactionCount: number      // 交互次数
  visitTime: number             // 访问时间戳
  
  // Phase 2.7: 来源追踪
  source?: 'organic' | 'recommended' | 'search' // 访问来源
  recommendationId?: string     // 如果来自推荐，记录推荐ID
  
  status: 'qualified'
  
  // 数据生命周期
  contentRetainUntil: number    // 内容保留到期时间（90 天后）
  analysisRetainUntil: number   // 分析结果永久保留（-1）
}

/**
 * 停留时间配置
 */
export interface DwellTimeConfig {
  mode: 'auto' | 'fixed'        // 自动 or 手动
  fixedThreshold: number         // 手动设定值（秒）
  minThreshold: number           // 最小阈值（默认 15 秒）
  maxThreshold: number           // 最大阈值（默认 120 秒）
  calculatedThreshold: number    // 当前计算值（秒）
}

/**
 * 用户设置
 */
export interface UserSettings {
  id: 'singleton'               // 单例
  
  // AI 配置（Phase 1 已有）
  aiConfig?: {
    provider: 'openai' | 'anthropic' | 'deepseek' | 'chrome' | 'none'
    apiKey?: string
    baseURL?: string
    model?: string
  }
  
  // 停留时间配置（Phase 2 新增）
  dwellTime: DwellTimeConfig
  
  // 排除规则（Phase 2 新增）
  exclusionRules: {
    autoExcludeIntranet: boolean        // 自动排除内网
    autoExcludeSensitive: boolean       // 排除银行/医疗
    customDomains: string[]             // 用户自定义排除域名
  }
  
  // 数据保留策略（Phase 2 新增）
  dataRetention: {
    rawVisitsDays: number               // 原始访问数据保留天数（默认 90）
    statisticsDays: number              // 统计数据保留天数（默认 365）
  }
  
  // 初始化阶段（Phase 1 已有）
  initPhase?: {
    completed: boolean
    pageCount: number
  }
  
  // 通知设置（Phase 1 已有）
  notifications?: {
    enabled: boolean
    dailyLimit: number
  }
}

/**
 * 推荐记录（Recommendation）
 * Phase 2.7: 实时反馈界面
 */
export interface Recommendation {
  id: string                    // UUID
  url: string                   // 推荐内容链接
  title: string                 // 标题
  summary: string               // 摘要
  source: string                // 来源（RSS 源名称或域名）
  sourceUrl: string             // 来源 URL
  
  // 推荐信息
  recommendedAt: number         // 推荐时间戳
  score: number                 // 推荐分数（0-1）
  reason?: string               // 推荐理由（可选）
  
  // 阅读状态
  isRead: boolean               // 是否已读
  clickedAt?: number            // 点击时间
  readDuration?: number         // 阅读时长（秒）
  scrollDepth?: number          // 滚动深度（0-1）
  
  // 用户反馈
  feedback?: 'later' | 'dismissed' // 稍后阅读 | 不想读
  feedbackAt?: number           // 反馈时间
  
  // 效果评估（自动计算）
  effectiveness?: 'effective' | 'neutral' | 'ineffective'
  // effective: 点击且深度阅读（>2min, >70% scroll）
  // neutral: 点击但浅度阅读
  // ineffective: 不想读
}

/**
 * 推荐统计数据（实时查询结果）
 * Phase 2.7: 设置页面展示
 */
export interface RecommendationStats {
  totalCount: number            // 推荐总数
  unreadCount: number           // 未读数
  readCount: number             // 已读数
  readLaterCount: number        // 稍后读数
  dismissedCount: number        // 不想读数
  avgReadDuration: number       // 平均阅读时长（秒）
  topSources: Array<{           // Top 推荐来源
    source: string
    count: number
    readRate: number
  }>
}

/**
 * 存储统计数据（实时查询结果）
 * Phase 2.7: 设置页面展示
 */
export interface StorageStats {
  pageCount: number             // 页面总数
  pendingCount: number          // 临时记录数
  confirmedCount: number        // 正式记录数
  recommendationCount: number   // 推荐记录数
  totalSizeMB: number           // 估算总占用（MB）
  firstCollectionTime?: number  // 最早开始采集时间戳
  avgDailyPages: number         // 平均每天采集页面数
}

/**
 * 统计数据缓存
 */
export interface Statistics {
  id: string                    // 统计类型（如 'daily-2025-11-02'）
  type: 'daily' | 'weekly' | 'monthly'
  timestamp: number             // 统计时间戳
  
  data: {
    // 原有的访问统计
    totalVisits: number         // 总访问数
    qualifiedVisits: number     // 有效访问数
    excludedVisits: number      // 已排除访问数
    avgDwellTime: number        // 平均停留时间
    topDomains: Array<{         // Top 域名
      domain: string
      count: number
    }>
    topTopics: Array<{          // Top 主题
      topic: string
      count: number
      percentage: number
    }>
    
    // Phase 2.7: 推荐统计
    recommendations?: {
      total: number             // 推荐总数
      read: number              // 已读数
      readRate: number          // 阅读率（%）
      avgReadDuration: number   // 平均阅读时长
      dismissed: number         // 不想读数量
      effective: number         // 有效推荐数
      neutral: number           // 中性推荐数
      ineffective: number       // 无效推荐数
      topSources: Array<{       // Top 推荐来源
        source: string
        count: number
        readRate: number
      }>
    }
    
    // Phase 2.7: 存储统计
    storage?: {
      totalRecords: number      // 总记录数
      totalSizeMB: number       // 存储占用（MB）
      pendingVisits: number     // 临时访问记录数
      confirmedVisits: number   // 正式访问记录数
      recommendations: number   // 推荐记录数
      avgRecordSizeKB: number   // 平均记录大小（KB）
    }
  }
}

/**
 * 🔄 Phase 3.4: 兴趣变化快照
 * 
 * 记录用户兴趣演化历史，支持变化追踪和趋势分析
 */
export interface InterestSnapshot {
  /** 快照 ID */
  id: string
  
  /** 快照创建时间 */
  timestamp: number
  
  /** 主导兴趣类型 */
  primaryTopic: string
  
  /** 主导兴趣占比 (0-1) */
  primaryScore: number
  
  /** 主导程度级别 */
  primaryLevel: 'absolute' | 'relative' | 'leading'
  
  /** 完整兴趣分布快照 */
  topics: Record<string, number>
  
  /** Top 10 关键词快照 */
  topKeywords: Array<{
    word: string
    weight: number
  }>
  
  /** 基于的页面数量 */
  basedOnPages: number
  
  /** 快照触发原因 */
  trigger: 'manual' | 'primary_change' | 'periodic' | 'rebuild'
  
  /** 变化描述（如果是因为主导兴趣变化） */
  changeNote?: string
}
