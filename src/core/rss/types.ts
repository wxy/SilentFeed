/**
 * RSS 模块类型定义
 */

import type { Topic } from "../profile/topics"

/**
 * RSS 源状态
 */
export type FeedStatus = 
  | 'candidate'     // 候选源（刚发现，等待评估）
  | 'recommended'   // 推荐源（评估通过，等待用户决策）
  | 'subscribed'    // 已订阅
  | 'ignored'       // 已忽略

/**
 * RSS 源质量评估
 * 
 * Phase 5.2: 扩展字段以支持详细评分和错误信息
 */
export interface FeedQuality {
  updateFrequency: number       // 更新频率（篇/周）
  formatValid: boolean          // 格式是否规范
  reachable: boolean            // 是否可达
  score: number                 // 质量评分 (0-100)
  lastChecked: number           // 最后检查时间戳
  
  /** 详细评分（可选，用于调试） */
  details?: {
    updateFrequencyScore: number  // 0-100
    completenessScore: number     // 0-100
    formatScore: number           // 0-100
    reachabilityScore: number     // 0-100
  }
  
  /** 错误信息（如果分析失败） */
  error?: string
}

/**
 * RSS 源相关性评估
 */
export interface FeedRelevance {
  matchScore: number            // 匹配分数 (0-100)
  matchedTopics: Topic[]        // 匹配的主题
  sampleArticles: {             // 样本文章
    title: string
    matchScore: number
  }[]
  analyzedAt: number            // 分析时间戳
}

/**
 * 发现的 RSS 源
 */
export interface DiscoveredFeed {
  // 基本信息
  id: string                    // UUID
  url: string                   // RSS 源 URL
  title: string                 // 源标题
  description?: string          // 源描述
  link?: string                 // 源网站 URL
  
  // Phase 5.1.6: 扩展元数据
  language?: string             // 语言（zh-CN, en-US等）
  category?: string             // 分类
  lastBuildDate?: number        // 最后构建日期
  itemCount?: number            // 条目数
  generator?: string            // 生成器
  
  // 发现信息
  discoveredFrom: string        // 发现来源页面 URL
  discoveredAt: number          // 发现时间戳
  
  // 状态管理
  status: FeedStatus            // 源状态
  
  // Phase 5.1.6: 订阅来源追踪
  subscriptionSource?: 'discovered' | 'manual' | 'imported'  // 订阅来源
  
  // 质量评估（后台填充）
  quality?: FeedQuality
  
  // 相关性分析（后台填充）
  relevance?: FeedRelevance
  
  // 订阅信息
  subscribedAt?: number         // 订阅时间戳
  enabled: boolean              // 是否启用（可以暂停订阅源）
  
  // 更新信息
  lastFetched?: number          // 最后抓取时间戳
  lastError?: string            // 最后错误信息
}

/**
 * RSS 文章
 */
export interface FeedArticle {
  id: string                    // UUID
  feedId: string                // 所属 RSS 源 ID
  
  // 文章信息
  title: string
  link: string
  description?: string
  content?: string
  author?: string
  
  // 时间信息
  published: number             // 发布时间戳
  fetched: number               // 抓取时间戳
  
  // AI 分析结果（可选）
  analysis?: {
    topicProbabilities: Record<Topic, number>
    confidence: number
    provider: string
  }
  
  // 用户行为
  read: boolean                 // 是否已读
  starred: boolean              // 是否收藏
}

/**
 * RSS 链接检测结果
 */
export interface RSSLink {
  url: string                   // RSS URL
  type: 'rss' | 'atom'          // 类型
  title?: string                // 标题（来自 <link> 标签）
}

/**
 * RSS 验证结果
 */
export interface ValidationResult {
  valid: boolean                // 是否有效
  type: 'rss' | 'atom' | null   // RSS 类型
  metadata?: FeedMetadata       // 元数据
  error?: string                // 错误信息
}

/**
 * RSS 源元数据
 */
export interface FeedMetadata {
  title: string
  description: string
  link: string
  
  // Phase 5.1.6: 扩展元数据
  language?: string           // 语言（如 zh-CN, en-US）
  category?: string           // 分类
  lastBuildDate?: number      // 最后构建日期（时间戳）
  pubDate?: number            // 发布日期（时间戳）
  itemCount?: number          // 条目数
  generator?: string          // 生成器
  copyright?: string          // 版权信息
}

/**
 * RSS 内容
 */
export interface RSSContent {
  raw: string                   // 原始 XML
  metadata: FeedMetadata        // 元数据
  articles: RSSArticle[]        // 文章列表
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
  published: number             // 发布时间戳
}
