/**
 * DeepSeek Provider (Unified)
 * 
 * 统一的 DeepSeek Provider，使用 deepseek-chat 模型：
 * - useReasoning=true: 启用推理模式（输出推理链，slower but more accurate）
 * - useReasoning=false: 标准模式（速度快、成本低）
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
  AIAnalysisOutput,
  UserProfileGenerationRequest,
  UserProfileGenerationResult
} from "@/types/ai"
import { logger } from "../../../utils/logger"

const deepseekLogger = logger.withTag("DeepSeekProvider")

export class DeepSeekProvider implements AIProvider {
  readonly name = "DeepSeek"
  
  private config: AIProviderConfig
  private endpoint = "https://api.deepseek.com/v1/chat/completions"
  private model = "deepseek-chat"
  
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
      // 检查 API Key（只检查是否存在，不限制长度）
      if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
        deepseekLogger.warn("API Key is empty")
        return false
      }
      
      // 检查网络（简单验证）
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        deepseekLogger.warn("No network connection")
        return false
      }
      
      deepseekLogger.debug(`✅ DeepSeek Provider is available (API Key: ${this.config.apiKey.substring(0, 10)}..., length: ${this.config.apiKey.length})`)
      return true
    } catch (error) {
      deepseekLogger.error("isAvailable check failed:", error)
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
      deepseekLogger.error("analyzeContent failed:", error)
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
    // JSON Mode 要求提示词中包含 "JSON" 和格式示例
    
    // Phase 8: 如果有用户画像，使用个性化 prompt
    if (userProfile && userProfile.interests) {
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
    
    // 默认 prompt（无用户画像）
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
    // 统一使用 deepseek-chat 模型
    const selectedModel = "deepseek-chat"
    
    deepseekLogger.debug(`Using model: ${selectedModel}, useReasoning: ${options?.useReasoning}`)
    
    const request: DeepSeekRequest = {
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      
      // 启用 JSON Mode，强制模型输出 JSON
      response_format: {
        type: "json_object"
      },
      
      // max_tokens 包含思维链 + 最终答案
      // 推理模式下可能需要更多 tokens（推理链约 2000 tokens）
      max_tokens: 4000,
      stream: false
    }
    
    // 如果启用推理模式，添加 reasoning_effort 参数
    if (options?.useReasoning) {
      // @ts-ignore - reasoning_effort 是 DeepSeek 特有参数
      request.reasoning_effort = "high"
      deepseekLogger.debug(`Reasoning mode enabled with high effort`)
    }
    
    // 根据推理模式设置不同超时
    // - 推理模式较慢：120 秒（推理链可能很长）
    // - 标准模式：60 秒（给予充足时间处理复杂内容）
    const defaultTimeout = options?.useReasoning ? 120000 : 60000
    const timeout = options?.timeout || defaultTimeout
    
    deepseekLogger.debug(`Timeout: ${timeout}ms for model ${selectedModel}`)
    
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
      
      deepseekLogger.debug("Response structure:", {
        hasReasoningContent: !!reasoningContent,
        hasFinalContent: !!finalContent,
        reasoningLength: reasoningContent?.length || 0,
        finalLength: finalContent?.length || 0,
        finishReason
      })
      
      // 推理内容仅记录长度，不输出完整内容
      if (reasoningContent) {
        deepseekLogger.debug(`Reasoning content length: ${reasoningContent.length} chars`)
      }
      
      // 如果 finish_reason 是 'length'，说明达到 max_tokens 限制
      if (finishReason === 'length') {
        deepseekLogger.warn("Response truncated due to max_tokens limit")
        deepseekLogger.warn("Consider increasing max_tokens")
      }
      
      // 优先使用最终回答（content）
      let content = finalContent
      
      // 如果最终回答为空，说明 max_tokens 不够，模型只输出了推理过程
      if (!content || content.trim().length === 0) {
        deepseekLogger.warn("Final content is empty, model may have run out of tokens")
        
        // 尝试从推理内容中提取 JSON（作为降级方案）
        if (reasoningContent && typeof reasoningContent === 'string') {
          deepseekLogger.debug("Attempting to extract JSON from reasoning_content")
          // 只显示最后 500 字符的长度，不输出内容
          deepseekLogger.debug(`Analyzing last portion (${Math.min(500, reasoningContent.length)} chars)`)
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
      deepseekLogger.error("Failed to parse response:", error)
      deepseekLogger.error("Response:", response)
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

  /**
   * Phase 8: 生成用户画像
   * 
   * 基于用户行为数据生成语义化的用户兴趣画像
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest
  ): Promise<UserProfileGenerationResult> {
    try {
      // 1. 构建用户行为摘要
      const behaviorSummary = this.buildBehaviorSummary(request)
      
      // 2. 构建 Prompt
      const prompt = this.buildProfilePrompt(behaviorSummary, request.currentProfile)
      
      // 3. 调用 API
      const apiRequest: DeepSeekRequest = {
        model: "deepseek-chat", // 使用标准模型（不需要推理）
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: {
          type: "json_object"
        },
        max_tokens: 1000, // 画像不需要太多 tokens
        stream: false
      }
      
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(apiRequest),
        signal: AbortSignal.timeout(30000) // 30秒超时
      })
      
      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json() as DeepSeekResponse
      
      // 4. 解析响应
      const content = data.choices[0]?.message?.content
      if (!content) {
        throw new Error("Empty response from DeepSeek")
      }
      
      const profileData = JSON.parse(content) as {
        interests: string
        preferences: string[]
        avoidTopics: string[]
      }
      
      // 5. 计算成本
      const cost = this.calculateCost(
        data.usage.prompt_tokens,
        data.usage.completion_tokens
      )
      
      deepseekLogger.debug(' User profile generated:', {
        interests: profileData.interests.substring(0, 50) + '...',
        preferences: profileData.preferences,
        avoidTopics: profileData.avoidTopics,
        cost: `¥${cost.toFixed(4)}`
      })
      
      return {
        interests: profileData.interests,
        preferences: profileData.preferences,
        avoidTopics: profileData.avoidTopics,
        metadata: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          timestamp: Date.now(),
          tokensUsed: {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens
          },
          basedOn: {
            browses: request.behaviors.browses?.length || 0,
            reads: request.behaviors.reads?.length || 0,
            dismisses: request.behaviors.dismisses?.length || 0
          }
        }
      }
    } catch (error) {
      deepseekLogger.error("Failed to generate user profile:", error)
      throw error
    }
  }

  /**
   * 构建用户行为摘要
   */
  private buildBehaviorSummary(request: UserProfileGenerationRequest): string {
    const parts: string[] = []
    
    // 1. 关键词分析
    const topKeywords = request.topKeywords.slice(0, 15)
    if (topKeywords.length > 0) {
      parts.push(`**高频关键词**（权重降序）：\n${topKeywords.map(k => 
        `- ${k.word} (权重: ${k.weight.toFixed(2)})`
      ).join('\n')}`)
    }
    
    // 2. 主题分布
    const topTopics = Object.entries(request.topicDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
    if (topTopics.length > 0) {
      parts.push(`\n**主题分布**：\n${topTopics.map(([topic, score]) => 
        `- ${topic}: ${(score * 100).toFixed(1)}%`
      ).join('\n')}`)
    }
    
    // 3. 阅读行为（最近的高质量阅读）
    if (request.behaviors.reads && request.behaviors.reads.length > 0) {
      const topReads = request.behaviors.reads
        .filter(r => r.weight > 0.6) // 只看深度阅读
        .slice(0, 5)
      
      if (topReads.length > 0) {
        parts.push(`\n**深度阅读的文章**（最近 ${topReads.length} 篇）：\n${topReads.map(r => 
          `- "${r.title}" (阅读深度: ${(r.scrollDepth * 100).toFixed(0)}%, 时长: ${Math.round(r.readDuration)}s)`
        ).join('\n')}`)
      }
    }
    
    // 4. 拒绝行为（用户不感兴趣的内容）
    if (request.behaviors.dismisses && request.behaviors.dismisses.length > 0) {
      const recentDismisses = request.behaviors.dismisses.slice(0, 5)
      parts.push(`\n**拒绝的文章**（用户不感兴趣，最近 ${recentDismisses.length} 篇）：\n${recentDismisses.map(d => 
        `- "${d.title}"`
      ).join('\n')}`)
    }
    
    return parts.join('\n')
  }

  /**
   * 构建画像生成 Prompt
   */
  private buildProfilePrompt(behaviorSummary: string, currentProfile?: {
    interests: string
    preferences: string[]
    avoidTopics: string[]
  }): string {
    if (currentProfile) {
      // 增量更新
      return `你是一个用户兴趣分析专家。基于用户的最新行为数据，更新用户的兴趣画像。

# 当前画像
- **兴趣领域**: ${currentProfile.interests}
- **内容偏好**: ${currentProfile.preferences.join('、')}
- **避免主题**: ${currentProfile.avoidTopics.join('、')}

# 最新用户行为数据
${behaviorSummary}

# 任务要求
1. 分析新行为数据与当前画像的一致性
2. 如果发现新的兴趣点，适当扩展兴趣领域描述
3. 根据深度阅读的内容，更新或补充内容偏好
4. 根据拒绝的文章，更新避免主题列表
5. 保持画像的连贯性和准确性

# 输出格式（JSON）
{
  "interests": "简洁的兴趣领域描述（50-200字，自然语言）",
  "preferences": ["偏好1", "偏好2", "偏好3"], // 3-5条
  "avoidTopics": ["避免1", "避免2"] // 0-5条
}

只输出 JSON，不要其他内容。`
    } else {
      // 全量生成
      return `你是一个用户兴趣分析专家。基于用户的浏览和阅读行为，生成用户的兴趣画像。

# 用户行为数据
${behaviorSummary}

# 任务要求
1. 分析高频关键词和主题分布，识别用户的核心兴趣领域
2. 结合深度阅读的文章，理解用户的内容偏好（如：深度分析、实践案例、新闻资讯等）
3. 根据拒绝的文章，识别用户避免的主题
4. 用自然、简洁的语言描述用户兴趣，避免生硬的关键词堆砌

# 输出格式（JSON）
{
  "interests": "简洁的兴趣领域描述（50-200字，自然语言，例如：'对前端技术、React框架、性能优化感兴趣，关注Web标准和开发工具'）",
  "preferences": ["偏好1", "偏好2", "偏好3"], // 3-5条，例如：["深度技术文章", "实践案例分享", "新技术趋势"]
  "avoidTopics": ["避免1", "避免2"] // 0-5条，例如：["娱乐八卦", "体育新闻"]
}

只输出 JSON，不要其他内容。`
    }
  }
}
