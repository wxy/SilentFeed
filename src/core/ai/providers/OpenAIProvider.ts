/**
 * OpenAI Provider V2 (重构版)
 * 
 * 继承 BaseAIService，只实现 API 调用逻辑
 * 提示词和通用逻辑由基类提供
 * 
 * 支持的模型：
 * - gpt-4o-mini: 最快最便宜 ($0.150 输入, $0.600 输出 / 1M tokens)
 * - gpt-4o: 强大模型 ($2.50 输入, $10.0 输出 / 1M tokens)
 * - o1-mini: 推理模型 ($3.0 输入, $12.0 输出 / 1M tokens)
 * - o1: 高级推理模型 ($15.0 输入, $60.0 输出 / 1M tokens)
 */

import { BaseAIService } from "../BaseAIService"
import { OpenAICostCalculator, type TokenUsage } from "../CostCalculator"
import type { AIProviderConfig } from "@/types/ai"
import { logger } from "@/utils/logger"

const openaiLogger = logger.withTag("OpenAIProvider")

// 使用统一的成本计算器
const costCalculator = new OpenAICostCalculator()

// 支持的模型列表（用于类型检查）
const SUPPORTED_MODELS = [
  'gpt-4o', 'gpt-4o-mini',
  'o1', 'o1-mini',
  'gpt-5-nano', 'gpt-5-mini', 'gpt-5', 'o4-mini'
] as const

type OpenAIModel = typeof SUPPORTED_MODELS[number]

type OpenAIResponseFormat =
  | {
      type: "json_object"
    }
  | {
      type: "json_schema"
      json_schema: {
        name: string
        strict?: boolean
        schema: Record<string, unknown>
      }
    }

/**
 * OpenAI API 请求类型
 */
interface OpenAIRequest {
  model: string
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
  response_format?: OpenAIResponseFormat
  max_tokens?: number
  temperature?: number
  stream?: boolean
}

/**
 * OpenAI API 响应类型
 */
interface OpenAIResponse {
  choices: Array<{
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
    prompt_tokens_details?: {
      cached_tokens?: number
      audio_tokens?: number
    }
  }
}

export class OpenAIProvider extends BaseAIService {
  readonly name = "OpenAI"
  
  private endpoint = "https://api.openai.com/v1/chat/completions"
  private model: OpenAIModel = "gpt-5-mini"
  private lastUsedModel: OpenAIModel = this.model
  
  // 追踪最后一次请求的缓存命中情况（用于精确计费）
  private lastCacheStats: {
    cachedTokens: number
    uncachedTokens: number
  } | null = null
  
  constructor(config: AIProviderConfig) {
    super(config)
    if (config.model && SUPPORTED_MODELS.includes(config.model as OpenAIModel)) {
      this.model = config.model as OpenAIModel
    }
    this.lastUsedModel = this.model
    this.config.model = this.model
    
    if (config.endpoint) {
      this.endpoint = config.endpoint
    }
  }
  
  /**
   * 实现：调用 OpenAI Chat API
   */
  protected async callChatAPI(
    prompt: string,
    options?: {
      maxTokens?: number
      timeout?: number
      jsonMode?: boolean
      useReasoning?: boolean
      responseFormat?: Record<string, unknown>
      temperature?: number
    }
  ): Promise<{
    content: string
    tokensUsed: {
      input: number
      output: number
    }
    model?: string
  }> {
    const isReasoning = options?.useReasoning ?? false
    const requestModel: OpenAIModel = isReasoning ? "o4-mini" : this.model
    const request: OpenAIRequest = {
      model: requestModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: options?.maxTokens || 8000,  // 使用 8K 作为默认值，避免截断
      temperature: options?.temperature ?? (isReasoning ? undefined : 0.7),
      stream: false
    }
    
    if (options?.responseFormat) {
      request.response_format = options.responseFormat as OpenAIRequest["response_format"]
    } else if (options?.jsonMode) {
      request.response_format = { type: "json_object" }
    }
    
    // 推理模型不支持某些参数
    if (isReasoning) {
      delete request.temperature
      delete request.response_format // o1 系列不支持 JSON Mode
    }
    
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(request),
        signal: options?.timeout 
          ? AbortSignal.timeout(options.timeout)
          : undefined
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${error}`)
      }
      
      const data: OpenAIResponse = await response.json()
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error("OpenAI API returned no choices")
      }
      
      const content = data.choices[0].message.content
      
      // 对于推理模型，可能需要特殊处理
      // o1 模型会在 reasoning 字段返回思维链，但我们只需要最终答案
      
      this.lastUsedModel = requestModel
      
      // 保存缓存统计信息（用于成本计算）
      const cachedTokens = data.usage.prompt_tokens_details?.cached_tokens || 0
      this.lastCacheStats = {
        cachedTokens,
        uncachedTokens: data.usage.prompt_tokens - cachedTokens
      }
      
      // 日志记录缓存命中情况
      if (cachedTokens > 0) {
        openaiLogger.debug("缓存统计", {
          cachedTokens,
          uncachedTokens: this.lastCacheStats.uncachedTokens,
          hitRate: (cachedTokens / data.usage.prompt_tokens) * 100
        })
      }
      
      return {
        content,
        tokensUsed: {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens
        },
        model: requestModel
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI API timeout (${options?.timeout}ms)`)
      }
      throw error
    }
  }
  
  /**
   * 实现：获取货币类型
   */
  protected getCurrency(): 'CNY' | 'USD' | 'FREE' {
    return 'USD'  // OpenAI 使用美元
  }

  /**
   * 实现：计算成本（美元）
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const breakdown = this.calculateCostBreakdown(inputTokens, outputTokens)
    return breakdown.input + breakdown.output
  }
  
  /**
   * 实现：计算成本明细（输入和输出分开，美元）
   * 
   * 使用 API 返回的真实缓存命中数据计算成本
   */
  protected calculateCostBreakdown(inputTokens: number, outputTokens: number): { input: number; output: number } {
    // 构建 TokenUsage 对象
    const usage: TokenUsage = {
      input: inputTokens,
      output: outputTokens,
      // 如果有缓存数据，使用真实的缓存命中数
      cachedInput: this.lastCacheStats?.cachedTokens
    }
    
    // 使用统一的成本计算器
    const result = costCalculator.calculateCost(usage, this.lastUsedModel)
    
    openaiLogger.debug(`💰 成本计算: ${inputTokens} input (${usage.cachedInput || 0} cached) + ${outputTokens} output = $${result.total.toFixed(6)}`)
    
    return { input: result.input, output: result.output }
  }

  protected getProfileResponseFormat(): Record<string, unknown> | null {
    return {
      type: "json_schema",
      json_schema: {
        name: "user_profile",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["interests", "preferences", "avoidTopics"],
          properties: {
            interests: {
              type: "string",
              minLength: 20,
              maxLength: 400
            },
            preferences: {
              type: "array",
              minItems: 3,
              maxItems: 10,
              items: {
                type: "string",
                minLength: 2,
                maxLength: 80
              }
            },
            avoidTopics: {
              type: "array",
              minItems: 0,
              maxItems: 5,
              items: {
                type: "string",
                minLength: 2,
                maxLength: 60
              }
            }
          }
        }
      }
    }
  }
  
  /**
   * 测试连接
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    try {
      const startTime = Date.now()
      
      // 使用足够大的 maxTokens 避免触发截断警告
      await this.callChatAPI("测试连接，请回复 OK", {
        maxTokens: 200,
        timeout: 10000,
        jsonMode: false
      })
      
      const latency = Date.now() - startTime
      
      return {
        success: true,
        message: `连接成功！OpenAI API 正常工作 (模型: ${this.model})`,
        latency
      }
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}
