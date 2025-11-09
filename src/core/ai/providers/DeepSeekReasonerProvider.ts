/**
 * DeepSeek Reasoner Provider
 * 
 * 使用 DeepSeek 推理模型进行内容分析
 * 
 * 特点：
 * - 推理能力更强
 * - 适合复杂内容分析
 * - OpenAI 兼容接口
 * - 价格与 deepseek-chat 相同（¥1/M input, ¥2/M output）
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
  readonly name = "DeepSeek Reasoner"
  
  private config: AIProviderConfig
  private endpoint = "https://api.deepseek.com/v1/chat/completions"
  private model = "deepseek-reasoner"
  
  // 定价（每 1M tokens）- 与 deepseek-chat 相同
  private readonly PRICE_INPUT_PER_MILLION = 1.0  // ¥1/M input
  private readonly PRICE_OUTPUT_PER_MILLION = 2.0 // ¥2/M output
  
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
          provider: "deepseek-reasoner",
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
    return `你是一个内容分析专家。请深入分析以下文本的主题分布。

文本内容：
${content}

请仔细思考文本的核心主题，然后以 JSON 格式返回分析结果，包含主题及其概率（0-1之间的数字，总和为1）。
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
  }
  
  /**
   * 调用 DeepSeek API
   */
  private async callAPI(
    prompt: string,
    options?: AnalyzeOptions
  ): Promise<DeepSeekResponse> {
    const request: DeepSeekRequest = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3, // 降低随机性，更稳定
      max_tokens: 500,  // 主题分析不需要太多 tokens
      stream: false
    }
    
    const timeout = options?.timeout || 30000 // 默认 30 秒
    
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
      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error("No content in response")
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
   * 计算成本
   */
  private calculateCost(promptTokens: number, completionTokens: number): number {
    const inputCost = (promptTokens / 1_000_000) * this.PRICE_INPUT_PER_MILLION
    const outputCost = (completionTokens / 1_000_000) * this.PRICE_OUTPUT_PER_MILLION
    return inputCost + outputCost
  }
}
