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
  
  /** 内容质量评估（冷启动/融合推荐） */
  evaluateQuality?: PromptTemplate
}

/**
 * 内容质量评估结果
 */
export interface QualityEvaluationResult {
  /** 综合质量分数 (0-1) */
  qualityScore: number
  /** 推荐理由（简短） */
  recommendationReason: string
  /** 主题标签 */
  topicTags: string[]
  /** 详细评分（可选） */
  details?: {
    /** 标题吸引力 */
    titleAppeal: number
    /** 内容深度 */
    contentDepth: number
    /** 信息价值 */
    informationValue: number
    /** 时效性 */
    timeliness: number
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
  /** 文章标题（用于质量评估）*/
  articleTitle?: string
  /** 文章摘要（用于质量评估）*/
  articleSummary?: string
  /** 订阅源名称（用于质量评估）*/
  feedTitle?: string
  /** 发布时间（用于质量评估）*/
  publishedAt?: string
}
