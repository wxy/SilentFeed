/**
 * 用户画像与兴趣快照类型
 */

import type { TopicDistribution } from "@/core/profile/TopicClassifier"

/**
 * 用户画像
 */
export interface UserProfile {
  id: "singleton" // 单例模式

  // 主题分布（核心数据）
  topics: TopicDistribution // 主题权重分布

  // 关键词（Top 50）
  keywords: Array<{
    word: string
    weight: number
  }>

  // 常访问域名（Top 20）
  domains: Array<{
    domain: string
    count: number
    avgDwellTime: number
  }>

  // === Phase 8: 语义化画像 ===
  
  /** AI 生成的语义摘要（丰富画像）*/
  aiSummary?: {
    /** 用户兴趣总结（100-200字，详细具体）*/
    interests: string
    /** 偏好特征（5-10条，如"深度技术解析"）*/
    preferences: string[]
    /** 避免主题（3-5条，基于拒绝记录）*/
    avoidTopics: string[]
    /** 生成元数据 */
    metadata: {
      provider: "openai" | "anthropic" | "deepseek" | "keyword" | "ollama"
      model: string
      timestamp: number
      tokensUsed?: {
        input: number
        output: number
      }
      /** 基于的数据量 */
      basedOn: {
        browses: number
        reads: number
        dismisses: number
      }
      /** API 调用成本（人民币，可选） */
      cost?: number
    }
  }
  
  /** 用户行为记录（强信号）*/
  behaviors?: {
    /** 阅读记录（保留最近 50 条）*/
    reads: Array<{
      articleId: string
      title: string
      summary: string           // 文章摘要（用于画像生成）
      feedUrl?: string
      readDuration: number      // 阅读时长（秒）
      scrollDepth: number       // 滚动深度 0-1
      timestamp: number
      weight: number            // 综合权重（基于时长+深度）
    }>
    /** 拒绝记录（保留最近 30 条）*/
    dismisses: Array<{
      articleId: string
      title: string
      summary: string           // 用于识别不喜欢的内容
      feedUrl?: string
      timestamp: number
      weight: number            // 负权重（固定 -1）
    }>
    /** 统计信息 */
    totalReads: number
    totalDismisses: number
    lastReadAt?: number
    lastDismissAt?: number
  }
  
  /** 展示关键词（用于 UI，20-30个）*/
  displayKeywords?: Array<{
    word: string
    weight: number
    source: 'browse' | 'read' | 'dismiss'
  }>

  // 元数据
  totalPages: number // 分析的页面总数
  lastUpdated: number // 最后更新时间
  version: number // 画像版本（用于迁移，v2 = 语义化）
}

/**
 * 画像构建配置
 */
export interface ProfileBuildConfig {
  /** 时间衰减系数（越大衰减越快） */
  timeDecayLambda: number

  /** 最大关键词数量 */
  maxKeywords: number

  /** 最大域名数量 */
  maxDomains: number

  /** 最小关键词权重阈值 */
  minKeywordWeight: number
}

/**
 * 兴趣变化快照
 * 
 * Phase 8.2: 扩展支持 AI 语义摘要和行为统计
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
  primaryLevel: "absolute" | "relative" | "leading"

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
  trigger: "manual" | "primary_change" | "periodic" | "rebuild" | "ai_change"

  /** 变化描述（如果是因为主导兴趣变化） */
  changeNote?: string
  
  /** Phase 8.2: AI 语义摘要（可选）*/
  aiSummary?: {
    /** 兴趣理解（简短摘要，50字以内） */
    interests: string
    /** Top 3 偏好标签 */
    topPreferences: string[]
    /** Provider 类型 */
    provider: "openai" | "deepseek" | "keyword" | "ollama"
  }
  
  /** Phase 8.2: 行为统计（可选）*/
  stats?: {
    totalBrowses: number
    totalReads: number
    totalDismisses: number
  }
}
