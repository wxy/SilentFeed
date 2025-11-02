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
  language: 'zh' | 'en'         // 语言
}

/**
 * 页面分析结果
 */
export interface AnalysisResult {
  keywords: string[]            // Top 20 关键词（TF-IDF）
  topics: string[]              // 主题标签
  language: 'zh' | 'en'         // 语言
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
 * 统计数据缓存
 */
export interface Statistics {
  id: string                    // 统计类型（如 'daily-2025-11-02'）
  type: 'daily' | 'weekly' | 'monthly'
  timestamp: number             // 统计时间戳
  
  data: {
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
  }
}
