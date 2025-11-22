/**
 * OpenAI Provider (Unified)
 * 
 * 统一的 OpenAI Provider，支持多种模型：
 * 
 * 标准模型（适合日常内容分析）：
 * - gpt-5-nano: 最快最便宜 ($0.050 输入, $0.400 输出)
 * - gpt-5-mini: 平衡性能和成本 ($0.250 输入, $2.0 输出)
 * - gpt-5: 最强性能 ($1.25 输入, $10.0 输出)
 * 
 * 推理模型（适合复杂多步骤推理）：
 * - o4-mini: 推理模型，会生成思维链 ($4.0 输入, $16.0 输出)
 * 
 * 特点：
 * - 支持提示缓存（Prompt Caching），节省成本
 * - OpenAI 兼容接口
 * - 自动根据 model 参数选择模型
 * 
 * 注：本实现假设 10% 缓存命中率进行成本估算
 */

import type {
  AIProvider,
  AIProviderConfig,
  UnifiedAnalysisResult,
  AnalyzeOptions,
  DeepSeekRequest,
  DeepSeekResponse,
  AIAnalysisOutput
} from "@/types/ai"
import { logger } from "../../../utils/logger"

const openaiLogger = logger.withTag("OpenAIProvider")

// 模型定价（每 1M tokens，美元）
// 数据来源：https://openai.com/api/pricing/ (2025-01)
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
    // 推理模型
    input: 4.0,
    inputCached: 1.0,
    output: 16.0
  }
} as const

type OpenAIModel = keyof typeof MODEL_PRICING

export class OpenAIProvider implements AIProvider {
  readonly name = "OpenAI"
  
  private config: AIProviderConfig
  private endpoint = "https://api.openai.com/v1/chat/completions"
  private model: OpenAIModel = "gpt-5-mini"
  
  constructor(config: AIProviderConfig) {
    this.config = config
    if (config.endpoint) {
      this.endpoint = config.endpoint
    }
    if (config.model && config.model in MODEL_PRICING) {
      this.model = config.model as OpenAIModel
    }
  }
  
  /**
   * 检查是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 检查 API Key
      if (!this.config.apiKey || this.config.apiKey.length < 20) {
        openaiLogger.warn("Invalid API Key")
        return false
      }
      
      // 检查网络（简单验证）
      if (!navigator.onLine) {
        openaiLogger.warn("No network connection")
        return false
      }
      
      return true
    } catch (error) {
      openaiLogger.error("isAvailable check failed:", error)
      return false
    }
  }
  
  /**
   * 分析内容
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult> {
    const startTime = Date.now()
    
    try {
      // 1. 内容预处理
      const processedContent = this.preprocessContent(content, options)
      
      // 2. 构建提示词
      const prompt = this.buildPrompt(processedContent)
      
      // 3. 调用 OpenAI API
      const response = await this.callAPI(prompt, options)
      
      // 4. 解析响应
      const analysis = this.parseResponse(response)
      
      // 5. 计算成本
      const cost = this.calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens
      )
      
      // 6. 返回统一格式
      return {
        topicProbabilities: analysis.topics,
        metadata: {
          provider: "openai",
          model: this.model,
          timestamp: Date.now(),
          tokensUsed: {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens
          },
          cost
        }
      }
    } catch (error) {
      openaiLogger.error("analyzeContent failed:", error)
      throw error
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
    const startTime = Date.now()
    
    try {
      // 发送最小请求
      const request: DeepSeekRequest = {
        model: this.model,
        messages: [
          {
            role: "user",
            content: "Hello"
          }
        ],
        max_tokens: 10
      }
      
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10000) // 10秒超时
      })
      
      const latency = Date.now() - startTime
      
      if (!response.ok) {
        const error = await response.text()
        return {
          success: false,
          message: `API 返回错误: ${response.status} ${error}`,
          latency
        }
      }
      
      return {
        success: true,
        message: `连接成功！OpenAI ${this.model} API 正常工作`,
        latency
      }
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  
  /**
   * 预处理内容
   */
  private preprocessContent(content: string, options?: AnalyzeOptions): string {
    const maxLength = options?.maxLength || 3000
    
    // 截取内容
    let processed = content.substring(0, maxLength)
    
    // 清理多余空白
    processed = processed.replace(/\s+/g, " ").trim()
    
    return processed
  }
  
  /**
   * 构建提示词
   */
  private buildPrompt(content: string): string {
    // 判断是否为推理模型
    const isReasoningModel = this.model.startsWith("o")
    
    if (isReasoningModel) {
      // 推理模型：更详细的提示，引导思考过程
      return `你是一个内容分析专家。请深入分析以下文本的主题分布。

文本内容：
${content}

请仔细思考：
1. 这篇文本主要讨论什么话题？
2. 有哪些次要主题？
3. 每个主题占据多大比重？

以 JSON 格式返回分析结果，包含主题及其概率（0-1之间的数字，总和为1）。
主题应该是具体的、有意义的类别（如"技术"、"设计"、"商业"等）。

返回格式示例：
{
  "topics": {
    "技术": 0.7,
    "开源": 0.2,
    "教程": 0.1
  }
}

只返回 JSON，不要其他解释。`
    } else {
      // 标准模型：简洁提示
      return `分析以下文本的主题分布，输出 JSON 格式结果。

文本：
${content}

请识别 3-5 个主要主题（如"技术"、"设计"、"商业"等），并给出每个主题的概率（0-1之间，总和为1）。

输出格式（JSON）：
{
  "topics": {
    "技术": 0.6,
    "API": 0.3,
    "教程": 0.1
  }
}

只输出 JSON，不要其他内容。`
    }
  }
  
  /**
   * 调用 OpenAI API
   */
  private async callAPI(
    prompt: string,
    options?: AnalyzeOptions
  ): Promise<DeepSeekResponse> {
    // 根据配置或参数选择模型
    let selectedModel: OpenAIModel = this.model // 使用实例的默认模型
    
    // 如果指定了 useReasoning，覆盖默认模型
    if (options?.useReasoning !== undefined) {
      if (options.useReasoning) {
        // 使用推理模型
        selectedModel = "o4-mini"
      } else {
        // 使用标准模型（如果当前是推理模型，切换到 gpt-5-mini）
        selectedModel = this.model.startsWith("o") ? "gpt-5-mini" : this.model
      }
    }
    
    openaiLogger.debug(`Using model: ${selectedModel}, useReasoning: ${options?.useReasoning}`)
    
    const request: DeepSeekRequest = {
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      
      // 推理模型不支持 response_format
      ...(selectedModel.startsWith("o") ? {} : {
        // 启用 JSON Mode，强制模型输出 JSON
        response_format: {
          type: "json_object"
        }
      }),
      
      // max_tokens 根据模型类型调整
      max_tokens: selectedModel.startsWith("o") ? 4000 : 500,
      stream: false
    }
    
    // 根据模型类型设置不同超时
    const defaultTimeout = selectedModel.startsWith("o") ? 120000 : 60000
    const timeout = options?.timeout || defaultTimeout
    
    openaiLogger.debug(`Timeout: ${timeout}ms for model ${selectedModel}`)
    
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
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
    }
    
    const result = await response.json()
    
    // 更新实际使用的模型（用于成本计算）
    this.model = selectedModel as OpenAIModel
    
    return result
  }
  
  /**
   * 解析响应
   */
  private parseResponse(response: DeepSeekResponse): AIAnalysisOutput {
    try {
      const message = response.choices[0]?.message
      
      // 推理模型可能有 reasoning_content（类似 DeepSeek）
      const reasoningContent = (message as any)?.reasoning_content
      const finalContent = message?.content
      const finishReason = response.choices[0]?.finish_reason
      
      openaiLogger.debug("Response structure:", {
        hasReasoningContent: !!reasoningContent,
        hasFinalContent: !!finalContent,
        reasoningLength: reasoningContent?.length || 0,
        finalLength: finalContent?.length || 0,
        finishReason
      })
      
      // 推理内容仅记录长度
      if (reasoningContent) {
        openaiLogger.debug(`Reasoning content length: ${reasoningContent.length} chars`)
      }
      
      // 检查是否截断
      if (finishReason === 'length') {
        openaiLogger.warn("Response truncated due to max_tokens limit")
      }
      
      // 优先使用最终回答
      let content = finalContent
      
      // 如果最终回答为空，尝试从推理内容提取
      if (!content || content.trim().length === 0) {
        openaiLogger.warn("Final content is empty")
        
        if (reasoningContent && typeof reasoningContent === 'string') {
          openaiLogger.debug("Attempting to extract JSON from reasoning_content")
          content = reasoningContent
        } else {
          throw new Error("Both content and reasoning_content are empty")
        }
      }
      
      // 提取 JSON（处理可能的 markdown 代码块）
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("No JSON found in response")
      }
      
      const analysis = JSON.parse(jsonMatch[0]) as AIAnalysisOutput
      
      // 验证格式
      if (!analysis.topics || typeof analysis.topics !== "object") {
        throw new Error("Invalid topics format")
      }
      
      // 归一化概率
      const topics = this.normalizeProbabilities(analysis.topics)
      
      return { topics }
    } catch (error) {
      openaiLogger.error("Failed to parse response:", error)
      openaiLogger.error("Response:", response)
      throw new Error(`解析 AI 响应失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * 归一化概率分布
   */
  private normalizeProbabilities(topics: Record<string, number>): Record<string, number> {
    const total = Object.values(topics).reduce((sum, prob) => sum + prob, 0)
    
    if (total === 0) {
      const count = Object.keys(topics).length
      return Object.fromEntries(
        Object.keys(topics).map(key => [key, 1 / count])
      )
    }
    
    return Object.fromEntries(
      Object.entries(topics).map(([key, prob]) => [key, prob / total])
    )
  }
  
  /**
   * 计算成本（USD → CNY，考虑缓存，假设 10% 缓存命中率）
   */
  private calculateCost(promptTokens: number, completionTokens: number): number {
    const cacheHitRate = 0.1
    const pricing = MODEL_PRICING[this.model]
    
    const inputCostCached = (promptTokens * cacheHitRate / 1_000_000) * pricing.inputCached
    const inputCostUncached = (promptTokens * (1 - cacheHitRate) / 1_000_000) * pricing.input
    const outputCost = (completionTokens / 1_000_000) * pricing.output
    
    // USD → CNY（汇率 7.2）
    const usdCost = inputCostCached + inputCostUncached + outputCost
    return usdCost * 7.2
  }
}
