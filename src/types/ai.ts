/**
 * AI 能力抽象层 - 类型定义
 *
 * 提供统一的 AI 分析接口，支持多个提供商：
 * - OpenAI (GPT-4o-mini)
 * - Anthropic (Claude-3-Haiku)
 * - DeepSeek
 * - 关键词分析（降级策略）
 *
 * 新增推荐功能支持
 */

/**
 * 推荐理由生成请求
 */
export interface RecommendationReasonRequest {
  /** 文章标题 */
  articleTitle: string

  /** 文章内容摘要 */
  articleSummary: string

  /** 用户兴趣关键词 */
  userInterests: string[]

  /** 相关性评分 */
  relevanceScore: number

  /** 
   * Phase 8: 语义化用户画像（可选）
   * 如果提供，AI 将使用丰富的画像信息进行评分
   */
  userProfile?: {
    /** 兴趣领域描述（自然语言） */
    interests: string
    /** 内容偏好列表 */
    preferences: string[]
    /** 避免的主题列表 */
    avoidTopics: string[]
  }
}

/**
 * 推荐理由生成结果
 */
export interface RecommendationReasonResult {
  /** 推荐理由（简短，1-2句话） */
  reason: string

  /** 匹配的兴趣点 */
  matchedInterests: string[]

  /** 置信度 (0-1) */
  confidence: number

  /** 生成元数据 */
  metadata: {
    provider: "openai" | "anthropic" | "deepseek" | "keyword" | "ollama"
    model: string
    timestamp: number
    tokensUsed?: {
      input: number
      output: number
      total?: number
    }
  }
}

/**
 * Phase 8: 用户画像生成请求
 */
export interface UserProfileGenerationRequest {
  /** 用户行为数据 */
  behaviors: {
    /** 浏览行为（最近 100 条） */
    browses?: Array<{
      keywords: string[]
      topics: string[]
      weight: number
      timestamp: number
    }>
    
    /** 阅读行为（最近 50 条） */
    reads?: Array<{
      title: string
      keywords: string[]
      topics: string[]
      readDuration: number
      scrollDepth: number
      weight: number
      timestamp: number
    }>
    
    /** 拒绝行为（最近 20 条） */
    dismisses?: Array<{
      title: string
      keywords: string[]
      topics: string[]
      weight: number
      timestamp: number
    }>
  }
  
  /** 聚合的关键词权重（Top 50） */
  topKeywords: Array<{
    word: string
    weight: number
  }>
  
  /** 主题分布 */
  topicDistribution: Record<string, number>
  
  /** Phase 8.2: 真实的行为总数（用于 metadata.basedOn）*/
  totalCounts: {
    browses: number
    reads: number
    dismisses: number
  }
  
  /** 可选：当前画像（用于增量更新） */
  currentProfile?: {
    interests: string
    preferences: string[]
    avoidTopics: string[]
  }
}

/**
 * Phase 8: 用户画像生成结果
 */
export interface UserProfileGenerationResult {
  /** 兴趣领域描述（自然语言，50-200字） */
  interests: string
  
  /** 内容偏好列表（3-5条） */
  preferences: string[]
  
  /** 避免的主题列表（0-5条） */
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

/**
 * 订阅源分析请求
 */
export interface SourceAnalysisRequest {
  /** 订阅源标题 */
  feedTitle: string
  /** 订阅源描述 */
  feedDescription?: string
  /** 订阅源链接 */
  feedLink?: string
  /** 样本文章（格式化的字符串） */
  sampleArticles: string
  /** 是否使用推理模式 */
  useReasoning?: boolean
}

/**
 * 订阅源分析响应
 */
export interface SourceAnalysisResponse {
  /** 主题分布 */
  topics: Record<string, number>
  /** 内容分类 */
  category: string
  /** 内容语言 */
  language?: string
  /** 原创性评分 (0-100) */
  originality?: number
  /** 信息密度评分 (0-100) */
  informationDensity?: number
  /** 标题党程度 (0-100) */
  clickbaitScore?: number
  /** 垃圾内容程度 (0-100) */
  spamScore?: number
  /** 分析依据 */
  reasoning?: string
  /** 元数据 */
  metadata: {
    provider: "openai" | "anthropic" | "deepseek" | "keyword" | "ollama"
    model: string
    timestamp: number
    tokensUsed?: {
      input: number
      output: number
    }
    cost?: number
  }
}

/**
 * 统一分析结果
 *
 * 所有 AI Provider 必须返回此格式，确保数据一致性
 */
export interface UnifiedAnalysisResult {
  /**
   * 主题概率分布
   *
   * @example
   * {
   *   "技术": 0.8,
   *   "设计": 0.15,
   *   "商业": 0.05
   * }
   */
  topicProbabilities: Record<string, number>

  /**
   * 可选：向量嵌入（用于相似度计算）
   *
   * 某些 Provider（如 OpenAI）可以提供 embedding
   * 用于更精确的内容相似度计算
   */
  embedding?: number[]

  /**
   * 可选：AI 生成的摘要（替代 RSS 摘要）
   * Phase 8: 用于推荐弹窗显示
   */
  summary?: string

  /**
   * 可选：AI 翻译的标题
   * Phase 9: 当原文标题与界面语言不同时，AI 同时生成翻译后的标题
   */
  translatedTitle?: string

  /**
   * 分析元数据
   */
  metadata: {
    /** 提供商名称 */
    provider: "openai" | "anthropic" | "deepseek" | "keyword" | "ollama"

    /** 使用的模型 */
    model: string

    /** 分析时间戳 */
    timestamp: number

    /** Token 消耗（如果适用） */
    tokensUsed?: {
      prompt: number
      completion: number
      total: number
    }

    /** 成本（美元） */
    cost?: number
  }
}

/**
 * AI Provider 接口
 *
 * 所有提供商必须实现此接口
 */
export interface AIProvider {
  /**
   * 提供商名称
   */
  readonly name: string

  /**
   * 检查提供商是否可用
   *
   * - 检查 API Key 配置
   * - 检查网络连接（可选）
   * - 检查预算限制（可选）
   */
  isAvailable(): Promise<boolean>

  /**
   * 分析内容
   *
   * @param content - 页面文本内容
   * @param options - 可选参数
   * @returns 统一分析结果
   * @throws Error 如果分析失败
   */
  analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult>

  /**
   * Phase 8: 生成用户画像（可选功能）
   * 
   * 基于用户行为数据生成语义化的用户兴趣画像
   * 
   * @param request - 用户画像生成请求
   * @returns 用户画像生成结果
   * @throws Error 如果生成失败
   */
  generateUserProfile?(
    request: UserProfileGenerationRequest
  ): Promise<UserProfileGenerationResult>

  /**
   * 订阅源质量分析（可选功能）
   * 
   * 分析 RSS 订阅源的质量、分类和语言
   * 
   * @param request - 订阅源分析请求
   * @returns 订阅源分析结果
   * @throws Error 如果分析失败
   */
  analyzeSource?(
    request: SourceAnalysisRequest
  ): Promise<SourceAnalysisResponse>

  /**
   * 生成推荐理由（可选功能）
   *
   * @param request - 推荐理由生成请求
   * @returns 推荐理由结果
   */
  generateRecommendationReason?(
    request: RecommendationReasonRequest
  ): Promise<RecommendationReasonResult>

  /**
   * 测试连接
   *
   * 发送最小请求测试 API 是否可用
   * 
   * @param useReasoning - 是否启用推理模式进行测试
   */
  testConnection(useReasoning?: boolean): Promise<{
    success: boolean
    message: string
    latency?: number
  }>
}

/**
 * 分析选项
 */
export interface AnalyzeOptions {
  /** 最大内容长度（字符数） */
  maxLength?: number

  /** 是否需要 embedding */
  includeEmbedding?: boolean

  /** 超时时间（毫秒） */
  timeout?: number

  /** 是否使用推理模式（Phase 6）*/
  useReasoning?: boolean

  /** 
   * AI 用量记录用途（可选）
   * 如果不提供，默认为 'analyze-content'
   */
  purpose?: import('./ai-usage').AIUsagePurpose

  /** 
   * Phase 8: 语义化用户画像（可选）
   * 如果提供，AI 将根据用户兴趣评估内容相关性
   */
  userProfile?: {
    /** 兴趣领域描述（自然语言） */
    interests: string
    /** 内容偏好列表 */
    preferences: string[]
    /** 避免的主题列表 */
    avoidTopics: string[]
  }

  /**
   * Phase 9: 原文标题（可选，用于 AI 翻译）
   * 如果提供，AI 将在生成摘要的同时翻译标题
   */
  originalTitle?: string
}

/**
 * AI Provider 配置
 */
export interface AIProviderConfig {
  /** API Key */
  apiKey: string

  /** API 端点（可选，某些提供商需要） */
  endpoint?: string

  /** 模型名称（可选，使用默认值） */
  model?: string

  /** 月度预算限制（美元） */
  monthlyBudget?: number
}

/**
 * DeepSeek API 请求
 */
export interface DeepSeekRequest {
  model: string
  messages: Array<{
    role: "system" | "user" | "assistant"
    content: string
  }>
  temperature?: number
  max_tokens?: number
  stream?: boolean
  response_format?: {
    type: "json_object" | "text"
  }
}

/**
 * DeepSeek API 响应
 */
export interface DeepSeekResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * 分析结果（AI 返回的原始 JSON）
 */
export interface AIAnalysisOutput {
  topics: Record<string, number>
  summary?: string
}
