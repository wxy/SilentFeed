/**
 * DeepSeek Provider V2 (重构版)
 * 
 * 继承 BaseAIService，只实现 API 调用逻辑
 * 提示词和通用逻辑由基类提供
 */

import { BaseAIService } from "../BaseAIService"
import type { AIProviderConfig } from "@/types/ai"
import { logger } from "@/utils/logger"

const deepseekLogger = logger.withTag("DeepSeekProvider")

/**
 * DeepSeek API 请求类型
 */
interface DeepSeekRequest {
  model: string
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string
  }>
  response_format?: {
    type: "json_object"
  }
  max_tokens?: number
  stream?: boolean
}

/**
 * DeepSeek API 响应类型
 */
interface DeepSeekResponse {
  choices: Array<{
    message: {
      role: string
      content: string
      reasoning_content?: string // DeepSeek 推理模式特有
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class DeepSeekProvider extends BaseAIService {
  readonly name = "DeepSeek"
  
  private endpoint = "https://api.deepseek.com/v1/chat/completions"
  private model = "deepseek-chat"
  
  // 定价（每 1M tokens，人民币）
  private readonly PRICE_INPUT_CACHED = 0.2 // ¥0.2/M (缓存命中)
  private readonly PRICE_INPUT_UNCACHED = 2.0 // ¥2/M (缓存未命中)
  private readonly PRICE_OUTPUT = 3.0 // ¥3/M
  
  constructor(config: AIProviderConfig) {
    super(config)
    this.model = (config.model as string) || this.model
    this.config.model = this.model
    
    if (config.endpoint) {
      this.endpoint = config.endpoint
    }
  }
  
  /**
   * 实现：调用 DeepSeek Chat API
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
    const request: DeepSeekRequest = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: options?.maxTokens || 1000,
      stream: false
    }
    
    // 启用 JSON Mode
    if (options?.responseFormat) {
      request.response_format = options.responseFormat as { type: "json_object" }
    } else if (options?.jsonMode) {
      request.response_format = {
        type: "json_object"
      }
    }
    
    // 推理模式（DeepSeek 特有）
    if (options?.useReasoning) {
      // @ts-ignore - reasoning_effort 是 DeepSeek 特有参数
      request.reasoning_effort = "high"
    }
    
    // 超时设置
    const defaultTimeout = options?.useReasoning ? 120000 : 60000
    const timeout = options?.timeout || defaultTimeout
    
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeout)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`DeepSeek API error: ${response.status} ${errorText}`)
      }
      
      const data = await response.json() as DeepSeekResponse
      
      // 提取内容（优先使用 content，不使用 reasoning_content）
      const message = data.choices[0]?.message
      const content = message?.content
      
      if (!content) {
        throw new Error("Empty response from DeepSeek API")
      }
      
      return {
        content,
        tokensUsed: {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens
        },
        model: request.model
      }
    } catch (error) {
      // 网络错误是临时性的，使用 warn 级别
      if (isNetworkError(error)) {
        deepseekLogger.warn("⚠️ API 调用失败（网络问题）", error)
      } else {
        deepseekLogger.error("❌ API 调用失败", error)
      }
      throw error
    }
  }
  
  /**
   * 实现：计算成本
   * 
   * 假设 10% 缓存命中率
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const cacheHitRate = 0.1
    
    const cachedInputCost = (inputTokens * cacheHitRate / 1000000) * this.PRICE_INPUT_CACHED
    const uncachedInputCost = (inputTokens * (1 - cacheHitRate) / 1000000) * this.PRICE_INPUT_UNCACHED
    const outputCost = (outputTokens / 1000000) * this.PRICE_OUTPUT
    
    return cachedInputCost + uncachedInputCost + outputCost
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
      
      await this.callChatAPI("测试连接", {
        maxTokens: 10,
        timeout: 10000,
        jsonMode: false
      })
      
      const latency = Date.now() - startTime
      
      return {
        success: true,
        message: `连接成功！DeepSeek API 正常工作`,
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
