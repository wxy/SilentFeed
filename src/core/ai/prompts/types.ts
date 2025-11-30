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
}
