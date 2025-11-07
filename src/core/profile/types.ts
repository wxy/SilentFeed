/**
 * 用户画像构建器类型定义
 */

import type { TopicDistribution } from "./TopicClassifier"

/**
 * 用户画像
 */
export interface UserProfile {
  id: 'singleton'             // 单例模式

  // 主题分布（核心数据）
  topics: TopicDistribution   // 主题权重分布

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
  totalPages: number          // 分析的页面总数
  lastUpdated: number         // 最后更新时间
  version: number             // 画像版本（用于迁移）
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