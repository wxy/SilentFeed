/**
 * DeepSeek Provider (Unified)
 * 
 * 统一的 DeepSeek Provider，支持根据 useReasoning 参数动态选择模型：
 * - useReasoning=true: 使用 deepseek-reasoner（推理模型，输出推理链）
 * - useReasoning=false: 使用 deepseek-chat（普通模型，速度快、成本低）
 * 
 * 特点：
 * - 国内访问友好
 * - 价格：¥2/M 输入（缓存未命中）、¥0.2/M 输入（缓存命中）、¥3/M 输出
 * - OpenAI 兼容接口
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
} from "../types"

export class DeepSeekReasonerProvider implements AIProvider {
  readonly name = "DeepSeek"
  
  private config: AIProviderConfig
  private endpoint = "https://api.deepseek.com/v1/chat/completions"
  private model = "deepseek-reasoner"
  
  // 定价（每 1M tokens，人民币）
  private readonly PRICE_INPUT_CACHED = 0.2 // ¥0.2/M (缓存命中)
  private readonly PRICE_INPUT_UNCACHED = 2.0 // ¥2/M (缓存未命中)
  private readonly PRICE_OUTPUT = 3.0 // ¥3/M
  
  constructor(config: AIProviderConfig) {
    this.config = config
    if (config.endpoint) {
      this.endpoint = config.endpoint
    }
    if (config.model) {
      this.model = config.model
    }
  }
  
  /**
   * 检查是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 检查 API Key
      if (!this.config.apiKey || this.config.apiKey.length < 20) {
        console.warn("[DeepSeekReasonerProvider] Invalid API Key")
        return false
      }
      
      // 检查网络（简单验证）
      if (!navigator.onLine) {
        console.warn("[DeepSeekReasonerProvider] No network connection")
        return false
      }
      
      return true
    } catch (error) {
      console.error("[DeepSeekReasonerProvider] isAvailable check failed:", error)
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
      
      // 3. 调用 DeepSeek API
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
          provider: "deepseek",
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
      console.error("[DeepSeekReasonerProvider] analyzeContent failed:", error)
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
        signal: AbortSignal.timeout(20000) // 20秒超时（简单测试）
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
        message: "连接成功！DeepSeek Reasoner API 正常工作",
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
    // JSON Mode 要求提示词中包含 "JSON" 和格式示例
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
  
  /**
   * 调用 DeepSeek API
   */
  private async callAPI(
    prompt: string,
    options?: AnalyzeOptions
  ): Promise<DeepSeekResponse> {
    // Phase 6: 根据 useReasoning 参数动态选择模型
    // - useReasoning=true: 使用 deepseek-reasoner（推理模型，慢但更准确）
    // - useReasoning=false: 使用 deepseek-chat（普通模型，快速且便宜）
    const selectedModel = options?.useReasoning ? "deepseek-reasoner" : "deepseek-chat"
    
    console.log(`[DeepSeekReasonerProvider] Using model: ${selectedModel}, useReasoning: ${options?.useReasoning}`)
    
    const request: DeepSeekRequest = {
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      // DeepSeek Reasoner 不支持 temperature，设置了也不生效
      // temperature: 0.3,
      
      // 启用 JSON Mode，强制模型输出 JSON
      // 这会大幅减少推理过程，直接输出结构化结果
      response_format: {
        type: "json_object"
      },
      
      // max_tokens 包含思维链 + 最终答案
      // 根据文档：模型单次回答的最大长度（含思维链输出），默认为 32K，最大为 64K
      // 实测推理链约 2000 tokens，设置 4000 给予充足空间，避免截断
      max_tokens: 4000,
      stream: false
    }
    
    // Phase 6: 根据模型类型设置不同超时
    // - Reasoner 推理模型较慢：120 秒（推理链可能很长）
    // - Chat 普通模型：60 秒（给予充足时间处理复杂内容）
    const defaultTimeout = selectedModel === "deepseek-reasoner" ? 120000 : 60000
    const timeout = options?.timeout || defaultTimeout
    
    console.log(`[DeepSeekReasonerProvider] Timeout: ${timeout}ms for model ${selectedModel}`)
    
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
      throw new Error(`DeepSeek Reasoner API error: ${response.status} ${errorText}`)
    }
    
    return await response.json()
  }
  
  /**
   * 解析响应
   */
  private parseResponse(response: DeepSeekResponse): AIAnalysisOutput {
    try {
      const message = response.choices[0]?.message
      
      // 根据 DeepSeek Reasoner 文档：
      // - reasoning_content: 思维链内容（推理过程）
      // - content: 最终回答内容（这才是我们需要的 JSON）
      
      const reasoningContent = (message as any)?.reasoning_content
      const finalContent = message?.content
      const finishReason = response.choices[0]?.finish_reason
      
      console.log("[DeepSeekReasonerProvider] Response structure:", {
        hasReasoningContent: !!reasoningContent,
        hasFinalContent: !!finalContent,
        reasoningLength: reasoningContent?.length || 0,
        finalLength: finalContent?.length || 0,
        finishReason
      })
      
      // 输出完整的 reasoning_content，便于调试
      if (reasoningContent) {
        console.log("[DeepSeekReasonerProvider] Full reasoning_content:")
        console.log(reasoningContent)
      }
      
      // 如果 finish_reason 是 'length'，说明达到 max_tokens 限制
      if (finishReason === 'length') {
        console.warn("[DeepSeekReasonerProvider] Response truncated due to max_tokens limit")
        console.warn("[DeepSeekReasonerProvider] Consider increasing max_tokens")
      }
      
      // 优先使用最终回答（content）
      let content = finalContent
      
      // 如果最终回答为空，说明 max_tokens 不够，模型只输出了推理过程
      if (!content || content.trim().length === 0) {
        console.warn("[DeepSeekReasonerProvider] Final content is empty, model may have run out of tokens")
        
        // 尝试从推理内容中提取 JSON（作为降级方案）
        if (reasoningContent && typeof reasoningContent === 'string') {
          console.log("[DeepSeekReasonerProvider] Attempting to extract JSON from reasoning_content")
          console.log("[DeepSeekReasonerProvider] Last 500 chars:", reasoningContent.slice(-500))
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
      
      // 归一化概率（确保总和为 1）
      const topics = this.normalizeProbabilities(analysis.topics)
      
      return { topics }
    } catch (error) {
      console.error("[DeepSeekReasonerProvider] Failed to parse response:", error)
      console.error("Response:", response)
      throw new Error(`解析 AI 响应失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * 归一化概率分布
   */
  private normalizeProbabilities(topics: Record<string, number>): Record<string, number> {
    const total = Object.values(topics).reduce((sum, prob) => sum + prob, 0)
    
    if (total === 0) {
      // 如果所有概率为 0，平均分配
      const count = Object.keys(topics).length
      return Object.fromEntries(
        Object.keys(topics).map(key => [key, 1 / count])
      )
    }
    
    // 归一化到 [0, 1]
    return Object.fromEntries(
      Object.entries(topics).map(([key, prob]) => [key, prob / total])
    )
  }
  
  /**
   * 计算成本（考虑缓存，假设 10% 缓存命中率）
   */
  private calculateCost(promptTokens: number, completionTokens: number): number {
    const cacheHitRate = 0.1 // 假设 10% 缓存命中率
    
    const inputCostCached = (promptTokens * cacheHitRate / 1_000_000) * this.PRICE_INPUT_CACHED
    const inputCostUncached = (promptTokens * (1 - cacheHitRate) / 1_000_000) * this.PRICE_INPUT_UNCACHED
    const outputCost = (completionTokens / 1_000_000) * this.PRICE_OUTPUT
    
    return inputCostCached + inputCostUncached + outputCost
  }
}
