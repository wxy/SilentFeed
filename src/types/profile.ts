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

  // 元数据
  totalPages: number // 分析的页面总数
  lastUpdated: number // 最后更新时间
  version: number // 画像版本（用于迁移）
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
  trigger: "manual" | "primary_change" | "periodic" | "rebuild"

  /** 变化描述（如果是因为主导兴趣变化） */
  changeNote?: string
}
