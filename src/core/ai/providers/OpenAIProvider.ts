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
  AIAnalysisOutput,
  UserProfileGenerationRequest,
  UserProfileGenerationResult
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
      // 检查 API Key（只检查是否存在，不限制长度）
      if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
        openaiLogger.warn("API Key is empty")
        return false
      }
      
      // 检查网络（简单验证）
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        openaiLogger.warn("No network connection")
        return false
      }
      
      openaiLogger.debug(`✅ OpenAI Provider is available (API Key: ${this.config.apiKey.substring(0, 10)}..., length: ${this.config.apiKey.length})`)
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
      
      // 2. 构建提示词（Phase 8: 传递用户画像）
      const prompt = this.buildPrompt(processedContent, options?.userProfile)
      
      // 3. 调用 OpenAI API
      const { response, actualModel } = await this.callAPI(prompt, options)
      
      // 4. 解析响应
      const analysis = this.parseResponse(response)
      
      // 5. 计算成本（使用实际模型）
      const cost = this.calculateCost(
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        actualModel
      )
      
      // 6. 返回统一格式
      return {
        topicProbabilities: analysis.topics,
        metadata: {
          provider: "openai",
          model: actualModel,
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
   * 
   * Phase 8: 支持传递用户画像进行个性化分析
   */
  private buildPrompt(
    content: string,
    userProfile?: {
      interests: string
      preferences: string[]
      avoidTopics: string[]
    }
  ): string {
    // 判断是否为推理模型
    const isReasoningModel = this.model.startsWith("o")
    
    // Phase 8: 如果有用户画像，使用个性化 prompt
    if (userProfile && userProfile.interests) {
      if (isReasoningModel) {
        // 推理模型：更详细的提示，引导思考过程
        return `你是一个智能内容分析助手，需要根据用户兴趣分析文章的主题和相关性。

# 用户画像
- **兴趣领域**: ${userProfile.interests}
- **内容偏好**: ${userProfile.preferences.join('、')}
- **避免主题**: ${userProfile.avoidTopics.join('、')}

# 文章内容
${content}

请仔细思考：
1. 这篇文章的主要主题是什么？
2. 哪些主题与用户的兴趣相关？
3. 是否包含用户避免的主题？
4. 每个主题的重要性如何？

以 JSON 格式返回分析结果，包含主题及其概率（0-1之间的数字，总和为1）。
避免的主题应该给予更低的概率。

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
        return `你是一个智能内容分析助手，需要根据用户兴趣分析文章的主题和相关性。

# 用户画像
- **兴趣领域**: ${userProfile.interests}
- **内容偏好**: ${userProfile.preferences.join('、')}
- **避免主题**: ${userProfile.avoidTopics.join('、')}

# 文章内容
${content}

# 分析要求
1. 识别文章的 3-5 个主要主题
2. 评估每个主题与用户兴趣的相关性
3. 给出每个主题的概率（0-1之间，总和为1）
4. 避免的主题应该给予更低的概率

# 输出格式（JSON）
{
  "topics": {
    "主题1": 0.5,
    "主题2": 0.3,
    "主题3": 0.2
  }
}

只输出 JSON，不要其他内容。`
      }
    }
    
    // 默认 prompt（无用户画像）
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
  ): Promise<{ response: DeepSeekResponse; actualModel: OpenAIModel }> {
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
    
    // 返回响应和实际使用的模型
    return { response: result, actualModel: selectedModel }
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
   * Phase 8: 生成用户画像
   * 
   * 使用 OpenAI Structured Outputs API 确保返回稳定的 JSON 格式
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest
  ): Promise<UserProfileGenerationResult> {
    const startTime = Date.now()
    
    // 1. 构建丰富的上下文
    const context = this.buildProfileContext(request)
    
    // 2. 选择模型（使用标准模型，不使用推理模型）
    // 如果当前配置是推理模型，切换到 gpt-5-mini
    const selectedModel: OpenAIModel = this.model.startsWith("o") ? "gpt-5-mini" : this.model
    
    // 3. 定义 JSON Schema（Structured Outputs）
    const responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "user_profile",
        strict: true,
        schema: {
          type: "object",
          properties: {
            interests: {
              type: "string",
              description: "用户兴趣总结，100-200字，详细具体"
            },
            preferences: {
              type: "array",
              description: "偏好特征列表，5-10条",
              items: { type: "string" }
            },
            avoidTopics: {
              type: "array",
              description: "避免主题列表，3-5条",
              items: { type: "string" }
            }
          },
          required: ["interests", "preferences", "avoidTopics"],
          additionalProperties: false
        }
      }
    }
    
    // 4. 调用 OpenAI API
    const apiRequest = {
      model: selectedModel,
      messages: [{
        role: "user" as const,
        content: context.prompt
      }],
      temperature: 0.3,  // 低温度，保证一致性
      max_tokens: 1000,
      response_format: responseFormat as any  // Structured Outputs
    }
    
    openaiLogger.debug(`Generating user profile with model: ${selectedModel}`)
    openaiLogger.debug(`Context: ${context.stats.totalBehaviors} behaviors, ${context.stats.topKeywords} top keywords`)
    
    try {
      // 5. 发送请求
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(apiRequest),
        signal: AbortSignal.timeout(60000) // 60秒超时
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
      }
      
      const result: DeepSeekResponse = await response.json()
      
      // 6. 解析结果
      const content = result.choices[0]?.message?.content
      if (!content) {
        throw new Error("Empty response from OpenAI")
      }
      
      const profile = JSON.parse(content)
      
      // 7. 计算成本
      const usage = result.usage
      const cost = this.calculateCost(
        usage.prompt_tokens,
        usage.completion_tokens,
        selectedModel as OpenAIModel
      )
      
      const elapsed = Date.now() - startTime
      
      openaiLogger.info(`User profile generated in ${elapsed}ms`, {
        interests: profile.interests.slice(0, 50) + '...',
        preferences: profile.preferences.length,
        avoidTopics: profile.avoidTopics.length,
        cost: `¥${cost.toFixed(6)}`,
        tokens: `${usage.prompt_tokens} + ${usage.completion_tokens} = ${usage.total_tokens}`
      })
      
      return {
        interests: profile.interests,
        preferences: profile.preferences,
        avoidTopics: profile.avoidTopics,
        metadata: {
          provider: 'openai',
          model: selectedModel,
          timestamp: Date.now(),
          basedOn: {
            browses: request.behaviors.browses?.length || 0,
            reads: request.behaviors.reads?.length || 0,
            dismisses: request.behaviors.dismisses?.length || 0
          },
          tokensUsed: {
            prompt: usage.prompt_tokens,
            completion: usage.completion_tokens,
            total: usage.total_tokens
          },
          cost
        }
      }
    } catch (error) {
      openaiLogger.error("Failed to generate user profile:", error)
      throw error
    }
  }
  
  /**
   * 构建用户画像生成的 Prompt
   */
  private buildProfileContext(request: UserProfileGenerationRequest): {
    prompt: string
    stats: {
      totalBehaviors: number
      topKeywords: number
    }
  } {
    const { behaviors, topKeywords } = request
    
    // 准备阅读记录（按权重排序，取前 10）
    const topReads = (behaviors.reads || [])
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)
      .map((r, i) => 
        `${i + 1}. **${r.title}**\n` +
        `   摘要：${r.summary}\n` +
        `   权重：${r.weight.toFixed(2)}`
      )
      .join('\n\n')
    
    // 准备拒绝记录（取前 5）
    const topDismisses = (behaviors.dismisses || [])
      .slice(0, 5)
      .map((d, i) =>
        `${i + 1}. **${d.title}**\n` +
        `   摘要：${d.summary}`
      )
      .join('\n\n')
    
    // 准备浏览记录（高频关键词）
    const keywordsSummary = topKeywords
      .slice(0, 20)
      .map((k, i) => `${i + 1}. ${k.word} (${k.count}次)`)
      .join('\n')
    
    // 构建 Prompt
    const prompt = `
你是用户画像分析专家。请深入分析用户的阅读偏好，生成精准的兴趣画像。

=== 📖 用户阅读过的推荐（强烈信号）===
${topReads || '（暂无阅读记录）'}

=== ❌ 用户拒绝的推荐（负向信号）===
${topDismisses || '（暂无拒绝记录）'}

=== 🔑 高频关键词（浏览记录）===
${keywordsSummary || '（暂无关键词）'}

=== 📊 统计信息 ===
- 总阅读推荐：${behaviors.reads?.length || 0} 篇
- 总拒绝推荐：${behaviors.dismisses?.length || 0} 篇
- 浏览关键词：${topKeywords.length} 个

=== 🎯 分析任务 ===
请综合以上信息，生成用户画像。注意：
1. **优先考虑阅读记录**（权重最高，代表用户真实偏好）
2. **重视拒绝记录**（避免推荐类似内容）
3. **参考关键词**（辅助理解兴趣广度）
4. **识别细分兴趣**（不要只归纳到"技术"、"设计"等粗分类）
5. **捕捉偏好风格**（如"深度解析" vs "快速入门"）

请严格按照 JSON Schema 返回结果。
`.trim()
    
    return {
      prompt,
      stats: {
        totalBehaviors: (behaviors.reads?.length || 0) + (behaviors.dismisses?.length || 0),
        topKeywords: topKeywords.length
      }
    }
  }
  
  /**
   * 计算成本（USD → CNY，考虑缓存，假设 10% 缓存命中率）
   */
  private calculateCost(promptTokens: number, completionTokens: number, model: OpenAIModel): number {
    const cacheHitRate = 0.1
    const pricing = MODEL_PRICING[model]
    
    const inputCostCached = (promptTokens * cacheHitRate / 1_000_000) * pricing.inputCached
    const inputCostUncached = (promptTokens * (1 - cacheHitRate) / 1_000_000) * pricing.input
    const outputCost = (completionTokens / 1_000_000) * pricing.output
    
    // USD → CNY（汇率 7.2）
    const usdCost = inputCostCached + inputCostUncached + outputCost
    return usdCost * 7.2
  }
}
