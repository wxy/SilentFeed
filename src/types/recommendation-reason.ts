/**
 * 推荐理由数据类型
 * 
 * 用于国际化的结构化推荐理由数据
 */

/**
 * 推荐理由基础类型
 */
export type ReasonType = 
  | 'topic-match'      // 主题匹配
  | 'interest-match'   // 兴趣匹配
  | 'high-quality'     // 高质量内容
  | 'browsing-history' // 浏览历史相关
  | 'trending'         // 热门内容
  | 'cold-start'       // 冷启动推荐（基于订阅源聚类）

/**
 * AI 提供商类型
 */
export type AIProvider = 
  | 'keyword'    // 关键词匹配
  | 'deepseek'   // DeepSeek AI
  | 'openai'     // OpenAI
  | 'anthropic'  // Anthropic Claude
  | 'chrome-ai'  // Chrome 内置 AI

/**
 * 结构化推荐理由数据
 */
export interface ReasonData {
  /**
   * 推荐理由类型
   */
  type: ReasonType

  /**
   * AI 提供商（如果使用 AI）
   */
  provider?: AIProvider

  /**
   * 是否使用推理模型
   */
  isReasoning?: boolean

  /**
   * 匹配分数 (0-1)
   */
  score: number

  /**
   * 匹配的主题列表
   */
  topics?: string[]

  /**
   * 匹配的兴趣列表
   */
  interests?: string[]

  /**
   * 其他参数（用于模板插值）
   */
  params?: Record<string, any>
}

/**
 * 兼容旧版本的推荐理由类型
 * 可以是字符串（旧版本）或结构化数据（新版本）
 */
export type RecommendationReason = string | ReasonData
