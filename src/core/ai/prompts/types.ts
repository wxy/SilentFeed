/**
 * 提示词模板类型定义
 * 
 * @module core/ai/prompts/types
 */

/**
 * 提示词模板
 */
export interface PromptTemplate {
  /** 系统提示词（可选） */
  system?: string
  /** 用户提示词模板 */
  user: string
}

/**
 * 用户画像信息
 */
export interface UserProfile {
  /** 兴趣领域描述 */
  interests: string
  /** 内容偏好列表 */
  preferences: string[]
  /** 避免的主题列表 */
  avoidTopics: string[]
}

/**
 * 所有提示词模板的集合
 */
export interface PromptTemplates {
  /** 内容分析（标准模式） */
  analyzeContent: {
    /** 有用户画像时的提示词 */
    withProfile: PromptTemplate
    /** 无用户画像时的提示词 */
    withoutProfile: PromptTemplate
  }
  
  /** 内容分析（推理模式） */
  analyzeContentReasoning: {
    /** 有用户画像时的提示词 */
    withProfile: PromptTemplate
    /** 无用户画像时的提示词 */
    withoutProfile: PromptTemplate
  }
  
  /** 用户画像生成（全量） */
  generateProfileFull: PromptTemplate
  
  /** 用户画像生成（增量更新） */
  generateProfileIncremental: PromptTemplate
  
  /** 订阅源质量分析（添加订阅源时评估订阅源整体质量） */
  sourceAnalysis?: PromptTemplate
}

/**
 * 订阅源质量分析结果
 */
export interface SourceAnalysisResult {
  /** 订阅源综合质量分数 (0-1) */
  qualityScore: number
  /** 主要内容分类（如：技术、新闻、生活等） */
  contentCategory: string
  /** 细分领域标签 */
  topicTags: string[]
  /** 订阅建议（简短描述） */
  subscriptionAdvice: string
  /** 详细评分（可选） */
  details?: {
    /** 内容质量：原创性、深度、专业性 */
    contentQuality: number
    /** 更新频率：活跃程度 */
    updateFrequency: number
    /** 信息密度：有价值内容占比 */
    informationDensity: number
    /** 广告/营销内容占比（越低越好，0-1，0为无广告） */
    promotionalRatio: number
  }
}

/**
 * 提示词变量替换
 */
export interface PromptVariables {
  /** 文章内容 */
  content?: string
  /** 用户画像 */
  userProfile?: UserProfile
  /** 当前画像 */
  currentProfile?: UserProfile
  /** 行为摘要 */
  behaviorSummary?: string
  /** 原文标题（用于翻译）*/
  originalTitle?: string
  /** 订阅源名称（用于订阅源分析）*/
  feedTitle?: string
  /** 订阅源描述（用于订阅源分析）*/
  feedDescription?: string
  /** 订阅源链接（用于订阅源分析）*/
  feedLink?: string
  /** 样本文章列表（用于订阅源分析，JSON格式）*/
  sampleArticles?: string
}
