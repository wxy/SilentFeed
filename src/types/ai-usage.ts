/**
 * AI 用量计费类型定义
 * 
 * 用于追踪和统计 AI 调用的用量和费用
 */

/**
 * AI 调用用途
 */
export type AIUsagePurpose =
  | 'analyze-content'      // 内容分析（浏览页面）
  | 'recommend-content'    // 内容推荐（RSS文章）
  | 'generate-profile'     // 用户画像生成
  | 'translate'            // 翻译
  | 'test-connection'      // 连接测试
  | 'other'                // 其他

/**
 * AI 用量记录
 */
export interface AIUsageRecord {
  /** 记录 ID（自动生成） */
  id: string
  
  /** AI Provider 名称 */
  provider: 'openai' | 'deepseek' | 'ollama' | 'keyword'
  
  /** 使用的模型 */
  model: string
  
  /** 调用用途 */
  purpose: AIUsagePurpose
  
  /** Token 用量 */
  tokens: {
    /** 输入 tokens */
    input: number
    /** 输出 tokens */
    output: number
    /** 总计 */
    total: number
    /** 是否为预估值（true 表示预估，false 表示 API 返回的准确值） */
    estimated: boolean
  }
  
  /** 费用 */
  cost: {
    /** 货币类型（CNY=人民币, USD=美元, FREE=免费/本地模型）默认 CNY */
    currency?: 'CNY' | 'USD' | 'FREE'
    /** 输入成本 */
    input: number
    /** 输出成本 */
    output: number
    /** 总成本 */
    total: number
    /** 是否为预估值 */
    estimated: boolean
  }
  
  /** 是否使用推理模式（如 DeepSeek R1） */
  reasoning?: boolean
  
  /** 调用时间戳 */
  timestamp: number
  
  /** 调用延迟（毫秒） */
  latency: number
  
  /** 是否成功 */
  success: boolean
  
  /** 错误信息（如果失败） */
  error?: string
  
  /** 额外元数据 */
  metadata?: {
    /** 内容分析相关 */
    contentLength?: number
    topicCount?: number
    
    /** 用户画像生成相关 */
    profileType?: 'full' | 'incremental'
    keywordsCount?: number
    
    /** 翻译相关 */
    translationSource?: string
    translationTarget?: string
    
    /** 其他自定义数据 */
    [key: string]: any
  }
}

/**
 * AI 用量统计
 */
export interface AIUsageStats {
  /** 统计时间范围 */
  period: {
    start: number
    end: number
  }
  
  /** 总调用次数 */
  totalCalls: number
  
  /** 成功调用次数 */
  successfulCalls: number
  
  /** 失败调用次数 */
  failedCalls: number
  
  /** Token 用量统计 */
  tokens: {
    input: number
    output: number
    total: number
  }
  
  /** 费用统计（注：仅统计有费用的调用，本地模型cost=0会被统计但不影响总费用） */
  cost: {
    input: number
    output: number
    total: number
  }
  
  /** 按货币分组的费用统计 */
  byCurrency: {
    CNY: { input: number; output: number; total: number }
    USD: { input: number; output: number; total: number }
    FREE: { input: number; output: number; total: number }
  }
  
  /** 按 Provider 分组的统计 */
  byProvider: Record<string, {
    calls: number
    tokens: { input: number; output: number; total: number }
    cost: { input: number; output: number; total: number }
    /** 货币类型 */
    currency?: 'CNY' | 'USD' | 'FREE'
    /** 本地模型标记（如 Ollama） */
    isLocal?: boolean
  }>
  
  /** 按用途分组的统计 */
  byPurpose: Record<AIUsagePurpose, {
    calls: number
    tokens: { input: number; output: number; total: number }
    cost: { input: number; output: number; total: number }
  }>
  
  /** 按推理模式分组的统计（可选，仅在有推理调用时存在） */
  byReasoning?: {
    /** 使用推理模式的调用（如 DeepSeek R1） */
    withReasoning: {
      calls: number
      tokens: { input: number; output: number; total: number }
      cost: { input: number; output: number; total: number }
      avgLatency: number
    }
    /** 不使用推理模式的调用 */
    withoutReasoning: {
      calls: number
      tokens: { input: number; output: number; total: number }
      cost: { input: number; output: number; total: number }
      avgLatency: number
    }
  }
  
  /** 平均延迟（毫秒） */
  avgLatency: number
}

/**
 * 用量统计查询选项
 */
export interface UsageStatsQuery {
  /** 开始时间（时间戳） */
  startTime?: number
  
  /** 结束时间（时间戳） */
  endTime?: number
  
  /** 按 Provider 筛选 */
  provider?: string
  
  /** 按用途筛选 */
  purpose?: AIUsagePurpose
  
  /** 只统计成功的调用 */
  onlySuccess?: boolean
}
