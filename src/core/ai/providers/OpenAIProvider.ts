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
import type { AIProviderConfig } from "@/types/ai"
import { logger } from "@/utils/logger"

const openaiLogger = logger.withTag("OpenAIProvider")

/**
 * OpenAI 模型定价（每 1M tokens，美元）
 * 数据来源: https://openai.com/api/pricing/ (2025-11)
 */
const MODEL_PRICING = {
  "gpt-5-nano": {
    input: 0.050,
    inputCached: 0.005,
    output: 0.400
  },
  "gpt-5-mini": {
    input: 0.250,
    inputCached: 0.025,
    output: 2.0
  },
  "gpt-5": {
    input: 1.25,
    inputCached: 0.125,
    output: 10.0
  },
  "o4-mini": {
    input: 4.0,
    inputCached: 1.0,
    output: 16.0
  }
} as const

type OpenAIModel = keyof typeof MODEL_PRICING

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
  
  // 假设缓存命中率（用于成本估算）
  private readonly CACHE_HIT_RATE = 0.1 // 10%
  
  constructor(config: AIProviderConfig) {
    super(config)
    if (config.model && config.model in MODEL_PRICING) {
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
      max_tokens: options?.maxTokens || 1000,
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
   * 实现：计算成本（人民币）
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[this.lastUsedModel] || MODEL_PRICING["gpt-5-mini"]
    
    // 假设部分输入 tokens 命中缓存
    const cachedTokens = Math.floor(inputTokens * this.CACHE_HIT_RATE)
    const uncachedTokens = inputTokens - cachedTokens
    
    // 计算成本（美元）
    const inputCost = (uncachedTokens / 1_000_000) * pricing.input +
                     (cachedTokens / 1_000_000) * pricing.inputCached
    const outputCost = (outputTokens / 1_000_000) * pricing.output
    const totalCostUSD = inputCost + outputCost
    
    // 转换为人民币（汇率约 7.2）
    const totalCostCNY = totalCostUSD * 7.2
    
    openaiLogger.debug(`💰 成本计算: ${inputTokens} input (${cachedTokens} cached) + ${outputTokens} output = $${totalCostUSD.toFixed(4)} ≈ ¥${totalCostCNY.toFixed(4)}`)
    
    return totalCostCNY
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
      
      await this.callChatAPI("测试连接，请回复 OK", {
        maxTokens: 10,
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
