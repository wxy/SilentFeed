/**
 * AI 能力抽象层 - 类型定义
 * 
 * 提供统一的 AI 分析接口，支持多个提供商：
 * - OpenAI (GPT-4o-mini)
 * - Anthropic (Claude-3-Haiku)
 * - DeepSeek
 * - 关键词分析（降级策略）
 */

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
   * 分析元数据
   */
  metadata: {
    /** 提供商名称 */
    provider: "openai" | "anthropic" | "deepseek" | "deepseek-reasoner" | "keyword"
    
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
   * 测试连接
   * 
   * 发送最小请求测试 API 是否可用
   */
  testConnection(): Promise<{
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
