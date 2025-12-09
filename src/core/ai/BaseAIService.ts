/**
 * AI 服务基类
 * 
 * 提供统一的提示词模板和通用逻辑，各个 Provider 只需实现 API 调用
 * 
 * 设计原则：
 * 1. 提示词统一管理（避免重复）
 * 2. Provider 只负责 API 调用（Chat-GPT 兼容接口）
 * 3. 通用逻辑复用（预处理、后处理、成本计算）
 * 4. 自动追踪 AI 用量和费用
 * 5. 统一容错机制（指数退避重试 + 熔断器）
 */

import type {
  AIProvider,
  AIProviderConfig,
  UnifiedAnalysisResult,
  AnalyzeOptions,
  UserProfileGenerationRequest,
  UserProfileGenerationResult
} from "@/types/ai"
import { AIUsageTracker } from "./AIUsageTracker"
import type { AIUsagePurpose } from "@/types/ai-usage"
import { promptManager } from "./prompts"
import type { SupportedLanguage } from "./prompts"
import ChromeStorageBackend from "@/i18n/chrome-storage-backend"
import {
  CircuitBreaker,
  withExponentialBackoff,
  type CircuitBreakerConfig
} from "@/utils/resilience"
import { DEFAULT_TIMEOUTS } from "@/storage/ai-config"

/**
 * AI 服务基类
 * 
 * 子类只需实现：
 * - callChatAPI: 调用 Chat-GPT 兼容的 API
 * - calculateCost: 计算 API 调用成本（可选）
 */
export abstract class BaseAIService implements AIProvider {
  abstract readonly name: string
  protected config: AIProviderConfig
  protected language: SupportedLanguage = 'zh-CN'
  
  /** 熔断器实例（统一容错机制） */
  public circuitBreaker: CircuitBreaker
  
  constructor(config: AIProviderConfig, circuitBreakerConfig?: Partial<CircuitBreakerConfig>) {
    this.config = config
    this.initializeLanguage()
    
    // 初始化熔断器（使用默认配置或自定义配置）
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: circuitBreakerConfig?.failureThreshold ?? 5, // 连续 5 次失败触发熔断
      resetTimeout: circuitBreakerConfig?.resetTimeout ?? 60000, // 60s 后尝试恢复
      halfOpenRequests: circuitBreakerConfig?.halfOpenRequests ?? 3, // 半开状态允许 3 个测试请求
      tag: circuitBreakerConfig?.tag ?? this.name
    })
  }
  
  /**
   * 初始化语言设置
   * 
   * 从 chrome.storage 读取用户的语言偏好（与 i18n 保持一致）
   * 
   * 默认语言：英文（国际化标准）
   */
  private async initializeLanguage(): Promise<void> {
    try {
      const lng = await ChromeStorageBackend.loadLanguage()
      
      // 将 i18n 语言代码映射到支持的语言
      if (lng === 'zh-CN' || lng === 'zh') {
        this.language = 'zh-CN'
      } else {
        // 默认使用英文（国际化标准）
        this.language = 'en'
      }
    } catch (error) {
      // 如果读取失败，使用默认语言（英文）
      console.warn('[AI] Failed to load language config, using en:', error)
      this.language = 'en'
    }
  }
  
  /**
   * 子类必须实现：调用 Chat-GPT 兼容的 API
   * 
   * @param prompt - 用户提示词
   * @param options - 调用选项
   * @returns API 响应（JSON 格式的字符串）
   */
  protected abstract callChatAPI(
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
  }>
  
  /**
   * 子类可选实现：计算成本
   * 
   * @param inputTokens - 输入 tokens 数量
   * @param outputTokens - 输出 tokens 数量
   * @returns 成本（人民币）
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // 默认返回 0（如果 Provider 不支持成本计算）
    return 0
  }
  
  /**
   * 包装 API 调用：添加指数退避重试和熔断器保护
   * 
   * @param operation - 要执行的操作
   * @param taskType - 任务类型（用于日志标签）
   * @returns 操作结果
   */
  protected async callWithResilience<T>(
    operation: () => Promise<T>,
    taskType: string = "API call"
  ): Promise<T> {
    // 熔断器包装
    return this.circuitBreaker.execute(async () => {
      // 指数退避重试包装
      return withExponentialBackoff(operation, {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: true,
        tag: `${this.name}.${taskType}`
      })
    })
  }
  
  /**
   * 检查是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      // 检查 API Key
      if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
        return false
      }
      
      // 检查网络
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return false
      }
      
      return true
    } catch (error) {
      return false
    }
  }
  
  /**
   * Phase 12.6: 获取配置的超时时间
   * 
   * 优先级：
   * 1. 用户配置的超时（RemoteProviderConfig.timeoutMs / reasoningTimeoutMs）
   * 2. 默认超时值（DEFAULT_TIMEOUTS）
   * 
   * @param useReasoning 是否使用推理模式
   * @returns 超时时间（毫秒）
   */
  protected getConfiguredTimeout(useReasoning?: boolean): number {
    // 从配置读取用户设置的超时
    if (useReasoning && this.config.reasoningTimeoutMs) {
      return this.config.reasoningTimeoutMs
    }
    if (!useReasoning && this.config.timeoutMs) {
      return this.config.timeoutMs
    }
    
    // 本地 AI 使用本地默认值（通过 name 判断）
    const isLocal = this.name === 'Ollama'
    const defaults = isLocal ? DEFAULT_TIMEOUTS.local : DEFAULT_TIMEOUTS.remote
    
    return useReasoning ? defaults.reasoning : defaults.standard
  }
  
  /**
   * 分析内容
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult> {
    const startTime = Date.now()
    let success = false
    let error: string | undefined
    let tokensUsed = { input: 0, output: 0, total: 0 }
    let cost = { input: 0, output: 0, total: 0 }
    
    try {
      // 使用容错包装执行 API 调用
      const response = await this.callWithResilience(async () => {
        // 1. 内容预处理
        const processedContent = this.preprocessContent(content, options)
        
        // 2. 使用 promptManager 构建提示词
        const prompt = promptManager.getAnalyzeContentPrompt(
          this.language,
          processedContent,
          options?.userProfile,
          options?.useReasoning
        )
        
        // 3. 调用 API
        const apiResponse = await this.callChatAPI(prompt, {
          maxTokens: options?.useReasoning ? 4000 : 500,
          timeout: options?.timeout || this.getConfiguredTimeout(options?.useReasoning),
          jsonMode: !options?.useReasoning,
          useReasoning: options?.useReasoning
        })
        
        if (!apiResponse.content || apiResponse.content.trim().length === 0) {
          throw new Error("Empty response")
        }
        
        return apiResponse
      }, "analyzeContent")
      
      // 记录 token 用量
      tokensUsed = {
        input: response.tokensUsed.input,
        output: response.tokensUsed.output,
        total: response.tokensUsed.input + response.tokensUsed.output
      }
      
      // 4. 解析响应并归一化概率
      // ⚠️ 修复：移除可能的 markdown 代码块标记
      let jsonContent = response.content.trim()
      
      // 移除开头的 ```json 或 ```
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\s*\n/, '')
      }
      
      // 移除结尾的 ```
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.replace(/\n```\s*$/, '')
      }
      
      const analysis = JSON.parse(jsonContent) as { topics: Record<string, number>; summary?: string }
      const normalizedTopics = this.normalizeTopicProbabilities(analysis.topics)
      
      // 5. 计算成本
      const calculatedCost = this.calculateCost(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      
      cost = {
        input: calculatedCost, // 简化：这里只有总成本
        output: 0,
        total: calculatedCost
      }
      
      success = true
      
      // 6. 记录用量
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.resolveModelName(response.model),
        purpose: options?.purpose || 'analyze-content',  // 使用调用方指定的purpose，默认为analyze-content
        tokens: {
          ...tokensUsed,
          estimated: false // API 返回的是准确值
        },
        cost: {
          ...cost,
          estimated: false
        },
        reasoning: options?.useReasoning,  // 记录是否使用推理模式
        latency: Date.now() - startTime,
        success: true,
        metadata: {
          contentLength: content.length,
          topicCount: Object.keys(normalizedTopics).length,
          useReasoning: options?.useReasoning
        }
      })
      
      // 7. 返回结果
      return {
        topicProbabilities: normalizedTopics,
        // 可选：AI 生成摘要（用于替换 RSS 摘要）
        ...(analysis.summary ? { summary: analysis.summary } as any : {}),
        metadata: {
          provider: this.name.toLowerCase() as any,
          model: this.resolveModelName(response.model),
          timestamp: Date.now(),
          tokensUsed: {
            prompt: response.tokensUsed.input,
            completion: response.tokensUsed.output,
            total: response.tokensUsed.input + response.tokensUsed.output
          },
          cost: calculatedCost
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      success = false
      
      // 记录失败的调用
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || 'unknown',
        purpose: options?.purpose || 'analyze-content',  // 使用调用方指定的purpose
        tokens: {
          ...tokensUsed,
          estimated: true
        },
        cost: {
          ...cost,
          estimated: true
        },
        reasoning: options?.useReasoning,  // 记录是否使用推理模式
        latency: Date.now() - startTime,
        success: false,
        error,
        metadata: {
          contentLength: content.length
        }
      })
      
      throw new Error(`${this.name} analyzeContent failed: ${error}`)
    }
  }
  
  /**
   * 生成用户画像
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest,
    options?: { useReasoning?: boolean }
  ): Promise<UserProfileGenerationResult> {
    const startTime = Date.now()
    let success = false
    let error: string | undefined
    let tokensUsed = { input: 0, output: 0, total: 0 }
    let cost = { input: 0, output: 0, total: 0 }
    
    try {
      // 使用容错包装执行 API 调用
      const response = await this.callWithResilience(async () => {
        // 1. 构建用户行为摘要
        const behaviorSummary = this.buildBehaviorSummary(request)
        
        // 2. 使用 promptManager 构建提示词
        const prompt = request.currentProfile
          ? promptManager.getGenerateProfileIncrementalPrompt(
              this.language,
              behaviorSummary,
              request.currentProfile
            )
          : promptManager.getGenerateProfileFullPrompt(
              this.language,
              behaviorSummary
            )
        
        const responseFormat = this.getProfileResponseFormat()

        // 4. 调用 API
        // Phase 12.6: 使用配置的超时时间（如果未指定，使用默认值）
        const timeout = this.getConfiguredTimeout(options?.useReasoning)
        
        // Phase 11: 推理模型需要更多 token（推理过程 + 最终答案）
        const maxTokens = this.name === 'Ollama' && (this as any).isReasoningModel ? 3000 : 1000
        
        const apiResponse = await this.callChatAPI(prompt, {
          maxTokens,
          timeout,
          jsonMode: !responseFormat,
          responseFormat: responseFormat || undefined,
          temperature: 0.3
        })
        
        if (!apiResponse.content || apiResponse.content.trim().length === 0) {
          throw new Error("Empty response")
        }
        
        return apiResponse
      }, "generateUserProfile")
      
      // 记录 token 用量
      tokensUsed = {
        input: response.tokensUsed.input,
        output: response.tokensUsed.output,
        total: response.tokensUsed.input + response.tokensUsed.output
      }
      
      // 5. 解析响应
      // ⚠️ 修复：移除可能的 markdown 代码块标记
      let jsonContent = response.content.trim()
      
      // 移除开头的 ```json 或 ```
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\s*\n/, '')
      }
      
      // 移除结尾的 ```
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.replace(/\n```\s*$/, '')
      }
      
      const profileData = JSON.parse(jsonContent) as {
        interests: string
        preferences: string[]
        avoidTopics: string[]
      }
      
      // 5. 计算成本
      const calculatedCost = this.calculateCost(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      
      cost = {
        input: calculatedCost,
        output: 0,
        total: calculatedCost
      }
      
      success = true
      
      // 记录用量
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.resolveModelName(response.model),
        purpose: 'generate-profile',
        tokens: {
          ...tokensUsed,
          estimated: false
        },
        cost: {
          ...cost,
          estimated: false
        },
        reasoning: options?.useReasoning ?? false,
        latency: Date.now() - startTime,
        success: true,
        metadata: {
          profileType: request.currentProfile ? 'incremental' : 'full',
          keywordsCount: request.topKeywords.length,
          browsesCount: request.totalCounts?.browses || 0,
          readsCount: request.totalCounts?.reads || 0,
          dismissesCount: request.totalCounts?.dismisses || 0
        }
      })
      
      // 6. 返回结果
      return {
        interests: profileData.interests,
        preferences: profileData.preferences,
        avoidTopics: profileData.avoidTopics,
        metadata: {
          provider: this.name.toLowerCase() as any,
          model: this.resolveModelName(response.model),
          timestamp: Date.now(),
          tokensUsed: {
            input: response.tokensUsed.input,
            output: response.tokensUsed.output
          },
          basedOn: {
            browses: request.totalCounts?.browses || 0,
            reads: request.totalCounts?.reads || 0,
            dismisses: request.totalCounts?.dismisses || 0
          },
          cost: calculatedCost
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      success = false
      
      // 记录失败的调用
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || 'unknown',
        purpose: 'generate-profile',
        tokens: {
          ...tokensUsed,
          estimated: true
        },
        cost: {
          ...cost,
          estimated: true
        },
        reasoning: options?.useReasoning ?? false,
        latency: Date.now() - startTime,
        success: false,
        error,
        metadata: {
          profileType: request.currentProfile ? 'incremental' : 'full'
        }
      })
      
      throw new Error(`${this.name} generateUserProfile failed: ${error}`)
    }
  }
  
  /**
   * 预处理内容
   */
  protected preprocessContent(content: string, options?: AnalyzeOptions): string {
    // 为了给提示词模板的固定指令留出余量，这里略微降低默认内容上限
    const maxLength = options?.maxLength || 2950
    
    // 截取内容
    let processed = content.substring(0, maxLength)
    
    // 清理多余空白
    processed = processed.replace(/\s+/g, " ").trim()
    
    return processed
  }
  
  /**
   * 构建用户行为摘要
   */
  protected buildBehaviorSummary(request: UserProfileGenerationRequest): string {
    const parts: string[] = []
    
    // 1. 关键词分析
    const topKeywords = request.topKeywords.slice(0, 20)
    if (topKeywords.length > 0) {
      parts.push(`**高频关键词**（权重降序）：\n${topKeywords.map(k => 
        `- ${k.word} (权重: ${k.weight.toFixed(2)})`
      ).join('\n')}`)
    }
    
    // 2. 主题分布
    const topTopics = Object.entries(request.topicDistribution)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 8)
    if (topTopics.length > 0) {
      parts.push(`\n**主题分布**：\n${topTopics.map(([topic, score]) => 
        `- ${topic}: ${((score as number) * 100).toFixed(1)}%`
      ).join('\n')}`)
    }
    
    // 3. 阅读行为（最近的高质量阅读）
    if (request.behaviors.reads && request.behaviors.reads.length > 0) {
      const topReads = request.behaviors.reads.slice(0, 10)
      parts.push(`\n**深度阅读的文章**（最近 ${topReads.length} 篇）：\n${topReads.map(r => 
        `- \"${r.title}\" (阅读深度: ${(r.scrollDepth * 100).toFixed(0)}%, 时长: ${Math.round(r.readDuration)}s)`
      ).join('\n')}`)
    }
    
    // 4. 拒绝行为（用户不感兴趣的内容）
    if (request.behaviors.dismisses && request.behaviors.dismisses.length > 0) {
      const recentDismisses = request.behaviors.dismisses.slice(0, 5)
      parts.push(`\n**拒绝的文章**（用户不感兴趣，最近 ${recentDismisses.length} 篇）：\n${recentDismisses.map(d => {
        const summary = (d as any).summary ? ` - ${(d as any).summary.substring(0, 100)}` : ''
        return `- \"${d.title}\"${summary}`
      }).join('\n')}`)
    }
    
    return parts.join('\n')
  }
  
  /**
   * 测试连接（默认实现，子类可覆盖）
   */
  async testConnection(useReasoning: boolean = false): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    const startTime = Date.now()
    let success = false
    let error: string | undefined
    
    try {
      await this.callChatAPI("测试连接", {
        maxTokens: 10,
        timeout: 10000,
        jsonMode: false,
        useReasoning
      })
      
      const latency = Date.now() - startTime
      success = true
      
      // 记录测试连接用量（通常很少的 tokens）
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || 'default',
        purpose: 'test-connection',
        tokens: {
          input: 5,  // 估算
          output: 5, // 估算
          total: 10,
          estimated: true // 测试连接不需要精确统计
        },
        cost: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        latency,
        success: true
      })
      
      return {
        success: true,
        message: `连接成功！${this.name} API 正常工作`,
        latency
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      success = false
      
      // 记录失败的测试
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || 'default',
        purpose: 'test-connection',
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        cost: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        latency: Date.now() - startTime,
        success: false,
        error
      })
      
      return {
        success: false,
        message: `连接失败: ${error}`
      }
    }
  }

  /**
   * 子类可覆盖：返回默认模型名称
   */
  protected getDefaultModelName(): string {
    return 'default'
  }

  /**
   * 解析实际使用的模型
   */
  protected resolveModelName(modelFromResponse?: string): string {
    if (modelFromResponse) {
      return modelFromResponse
    }
    if (this.config.model) {
      return this.config.model
    }
    return this.getDefaultModelName()
  }

  /**
   * Structured Output 配置，子类可覆盖
   */
  protected getProfileResponseFormat(): Record<string, unknown> | null {
    return null
  }

  /**
   * 归一化主题概率
   */
  protected normalizeTopicProbabilities(topics: Record<string, number>): Record<string, number> {
    const entries = Object.entries(topics || {})
    const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0)
    if (total <= 0) {
      return topics
    }
    return entries.reduce((acc, [key, value]) => {
      acc[key] = Math.max(0, value) / total
      return acc
    }, {} as Record<string, number>)
  }
}


