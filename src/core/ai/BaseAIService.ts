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
  UserProfileGenerationResult,
  SourceAnalysisRequest,
  SourceAnalysisResponse
} from "@/types/ai"
import { AIUsageTracker } from "./AIUsageTracker"
import type { AIUsagePurpose } from "@/types/ai-usage"
import type { Currency } from "./CostCalculator"
import { promptManager } from "./prompts"
import type { SupportedLanguage } from "./prompts"
import ChromeStorageBackend from "@/i18n/chrome-storage-backend"
import {
  CircuitBreaker,
  withExponentialBackoff,
  type CircuitBreakerConfig
} from "@/utils/resilience"
import { DEFAULT_TIMEOUTS } from "@/storage/ai-config"
import { isNetworkError } from "@/utils/logger"

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
   * 如果未设置（跟随浏览器），则检测浏览器语言
   * 
   * 默认语言：英文（国际化标准）
   */
  private async initializeLanguage(): Promise<void> {
    try {
      const lng = await ChromeStorageBackend.loadLanguage()
      
      if (lng) {
        // 用户明确设置了语言偏好
        if (lng === 'zh-CN' || lng === 'zh') {
          this.language = 'zh-CN'
        } else {
          this.language = 'en'
        }
      } else {
        // 未设置语言偏好（跟随浏览器），检测浏览器语言
        // 优先使用 Chrome Extension API（在 Service Worker 中更可靠）
        // 回退到 navigator.language
        const browserLang = chrome?.i18n?.getUILanguage?.() 
          || navigator?.language 
          || 'en'
        if (browserLang.startsWith('zh')) {
          this.language = 'zh-CN'
        } else {
          this.language = 'en'
        }
      }
    } catch (error) {
      // 如果读取失败，使用默认语言（英文）
      console.warn('[AI] Failed to load language config, using en:', error)
      this.language = 'en'
    }
  }
  
  /**
   * 🔒 内部方法：调用 Chat-GPT 兼容的 API
   * 
   * ⚠️ **访问限制**: protected abstract - 仅子类可实现，仅内部方法可调用
   * 
   * 此方法是所有 AI 调用的最底层入口。外部代码**禁止**直接调用此方法！
   * 应该通过本类的专用方法（如 analyzeContent、screenFeedArticles 等）间接使用。
   * 
   * 调用链示例：
   *   外部代码 → AICapabilityManager.screenFeedArticles()
   *            → BaseAIService.screenFeedArticles()
   *            → this.callChatAPI()  ← 只有这里可以调用
   * 
   * @param prompt - 用户提示词
   * @param options - 调用选项
   * @returns API 响应（JSON 格式的字符串）
   * @internal 仅供 BaseAIService 内部的公开方法调用
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
   * 子类必须实现：获取货币类型
   * 
   * @returns 货币类型（CNY=人民币, USD=美元, FREE=免费/本地模型）
   */
  protected abstract getCurrency(): Currency
  
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
   * 子类可选实现：计算成本明细（输入和输出分开）
   * 
   * @param inputTokens - 输入 tokens 数量
   * @param outputTokens - 输出 tokens 数量
   * @returns 成本明细 { input: number, output: number }
   */
  protected calculateCostBreakdown(inputTokens: number, outputTokens: number): { input: number; output: number } {
    // 默认返回 0（如果 Provider 不支持成本计算）
    // 子类应该覆盖此方法提供准确的成本分解
    const totalCost = this.calculateCost(inputTokens, outputTokens)
    // 默认按 token 比例分配（粗略估计）
    const totalTokens = inputTokens + outputTokens
    if (totalTokens === 0) {
      return { input: 0, output: 0 }
    }
    return {
      input: totalCost * (inputTokens / totalTokens),
      output: totalCost * (outputTokens / totalTokens)
    }
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
          options?.useReasoning,
          options?.originalTitle  // Phase 9: 传递原标题用于翻译
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
      
      const analysis = JSON.parse(jsonContent) as { 
        topics: Record<string, number>
        summary?: string | object
        translatedTitle?: string
      }
      
      const normalizedTopics = this.normalizeTopicProbabilities(analysis.topics)
      
      // ⚠️ 修复：AI 可能把 summary 返回为对象而不是 JSON 字符串，需要规范化
      let normalizedSummary: string | undefined
      if (analysis.summary !== undefined) {
        if (typeof analysis.summary === 'string') {
          normalizedSummary = analysis.summary
        } else if (typeof analysis.summary === 'object') {
          // AI 返回了对象，转换为 JSON 字符串
          normalizedSummary = JSON.stringify(analysis.summary)
        }
      }
      
      // 5. 计算成本（分别计算输入和输出）
      const costBreakdown = this.calculateCostBreakdown(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      
      cost = {
        input: costBreakdown.input,
        output: costBreakdown.output,
        total: costBreakdown.input + costBreakdown.output
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
          currency: this.getCurrency(),
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
        // ⚠️ 使用规范化后的 summary（确保是字符串）
        ...(normalizedSummary ? { summary: normalizedSummary } : {}),
        // Phase 9: 可选：AI 翻译的标题
        ...(analysis.translatedTitle ? { translatedTitle: analysis.translatedTitle } : {}),
        // Phase 9: 记录提示词使用的语言（即翻译的目标语言）
        ...(analysis.translatedTitle ? { targetLanguage: this.language } : {}),
        metadata: {
          provider: this.name.toLowerCase() as any,
          model: this.resolveModelName(response.model),
          timestamp: Date.now(),
          tokensUsed: {
            prompt: response.tokensUsed.input,
            completion: response.tokensUsed.output,
            total: response.tokensUsed.input + response.tokensUsed.output
          },
          cost: cost.total
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
          currency: this.getCurrency(),
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
        
        // Phase 11: 推理模式需要更多 token
        // 不同 Provider 有不同的默认值，通过 callChatAPI 的默认参数处理
        // - DeepSeek 推理模式：64K（官方最大值）
        // - Ollama 推理模式：16K（本地模型）
        // - 标准模式：8K
        let maxTokens: number | undefined = undefined
        
        // 只为 Ollama 指定值，其他 Provider 使用各自默认值
        if (this.name === 'Ollama' && (this as any).isReasoningModel) {
          maxTokens = 16000  // 本地推理模式：16K
        } else if (this.name === 'Ollama') {
          maxTokens = 8000   // 本地标准模式：8K
        }
        // DeepSeek/OpenAI/Anthropic 使用各自 Provider 的默认值（不传 maxTokens）
        
        const apiResponse = await this.callChatAPI(prompt, {
          ...(maxTokens !== undefined && { maxTokens }),  // 只在有值时传递
          timeout,
          jsonMode: !responseFormat,
          responseFormat: responseFormat || undefined,
          temperature: 0.3,
          useReasoning: options?.useReasoning  // 传递推理模式参数
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
      
      // 5. 计算成本（分别计算输入和输出）
      const costBreakdown = this.calculateCostBreakdown(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      
      cost = {
        input: costBreakdown.input,
        output: costBreakdown.output,
        total: costBreakdown.input + costBreakdown.output
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
          currency: this.getCurrency(),
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
          cost: cost.total
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
          currency: this.getCurrency(),
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
   * 订阅源质量分析
   * 
   * 分析 RSS 订阅源的质量、分类和语言
   */
  async analyzeSource(
    request: SourceAnalysisRequest
  ): Promise<SourceAnalysisResponse> {
    const startTime = Date.now()
    let tokensUsed = { input: 0, output: 0, total: 0 }
    let cost = { input: 0, output: 0, total: 0 }
    
    try {
      const response = await this.callWithResilience(async () => {
        // 使用 promptManager 构建订阅源分析提示词
        const prompt = promptManager.getSourceAnalysisPrompt(
          this.language,
          request.feedTitle,
          request.feedDescription || '',
          request.feedLink || '',
          request.sampleArticles
        )
        
        // 调用 API
        const timeout = this.getConfiguredTimeout(request.useReasoning)
        const apiResponse = await this.callChatAPI(prompt, {
          maxTokens: 1000,
          timeout,
          jsonMode: true,
          temperature: 0.3,
          useReasoning: request.useReasoning
        })
        
        if (!apiResponse.content || apiResponse.content.trim().length === 0) {
          throw new Error("Empty response")
        }
        
        return apiResponse
      }, "analyzeSource")
      
      // 记录 token 用量
      tokensUsed = {
        input: response.tokensUsed.input,
        output: response.tokensUsed.output,
        total: response.tokensUsed.input + response.tokensUsed.output
      }
      
      // 解析响应
      let jsonContent = response.content.trim()
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\s*\n/, '')
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.replace(/\n```\s*$/, '')
      }
      
      const analysis = JSON.parse(jsonContent) as {
        topics: Record<string, number>
        category?: string
        language?: string
        originality?: number
        informationDensity?: number
        clickbaitScore?: number
        spamScore?: number
        reasoning?: string
      }
      
      // 计算成本
      const costBreakdown = this.calculateCostBreakdown(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      cost = {
        input: costBreakdown.input,
        output: costBreakdown.output,
        total: costBreakdown.input + costBreakdown.output
      }
      
      // 记录用量
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.resolveModelName(response.model),
        purpose: 'analyze-source',
        tokens: { ...tokensUsed, estimated: false },
        cost: { currency: this.getCurrency(), ...cost, estimated: false },
        reasoning: request.useReasoning ?? false,
        latency: Date.now() - startTime,
        success: true,
        metadata: { feedTitle: request.feedTitle }
      })
      
      // 返回结果
      return {
        topics: analysis.topics || {},
        category: analysis.category || 'other',
        language: analysis.language,
        originality: analysis.originality,
        informationDensity: analysis.informationDensity,
        clickbaitScore: analysis.clickbaitScore,
        spamScore: analysis.spamScore,
        reasoning: analysis.reasoning,
        metadata: {
          provider: this.name.toLowerCase() as any,
          model: this.resolveModelName(response.model),
          timestamp: Date.now(),
          tokensUsed: {
            input: response.tokensUsed.input,
            output: response.tokensUsed.output
          },
          cost: cost.total
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      
      // 记录失败
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || 'unknown',
        purpose: 'analyze-source',
        tokens: { ...tokensUsed, estimated: true },
        cost: { currency: this.getCurrency(), ...cost, estimated: true },
        reasoning: request.useReasoning ?? false,
        latency: Date.now() - startTime,
        success: false,
        error,
        metadata: { feedTitle: request.feedTitle }
      })
      
      throw new Error(`${this.name} analyzeSource failed: ${error}`)
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
          currency: this.getCurrency(),
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
          currency: this.getCurrency(),
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
   * AI 推荐池策略决策（默认实现）
   * 
   * 根据用户的 RSS 阅读数据和行为，使用 AI 决策最优的推荐池策略参数。
   * 返回 JSON 格式的策略决策（包含 poolSize、refillInterval 等参数）。
   * 
   * @param prompt - 已构建好的决策提示词
   * @param options - 请求选项
   * @returns AI 的原始响应文本（JSON 格式）
   */
  async decidePoolStrategy(
    prompt: string,
    options?: {
      maxTokens?: number
    }
  ): Promise<string> {
    const startTime = Date.now()
    
    try {
      // 直接调用底层 callChatAPI
      const apiResponse = await this.callChatAPI(prompt, {
        maxTokens: options?.maxTokens || 500,
        jsonMode: true  // 要求返回 JSON 格式
        // 不传 timeout，使用 provider 配置的超时
      })
      
      const duration = Date.now() - startTime
      const modelName = this.resolveModelName(apiResponse.model)
      
      // 计算成本
      const cost = this.calculateCost(
        apiResponse.tokensUsed.input,
        apiResponse.tokensUsed.output,
        modelName
      )
      
      // 记录使用情况
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: modelName,
        purpose: 'pool-strategy-decision',
        tokens: {
          input: apiResponse.tokensUsed.input,
          output: apiResponse.tokensUsed.output,
          total: apiResponse.tokensUsed.input + apiResponse.tokensUsed.output,
          estimated: false
        },
        cost: cost,
        latency: duration,
        success: true
      })
      
      return apiResponse.content
    } catch (error) {
      const duration = Date.now() - startTime
      
      // 记录失败
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || this.getDefaultModelName(),
        purpose: 'pool-strategy-decision',
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        cost: {
          currency: this.getCurrency(),
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        latency: duration,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
      
      throw error
    }
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

  /**
   * Feed 文章初筛（默认实现）
   * 
   * 批量筛选 Feed 中值得详细分析的文章，减少后续 AI 调用次数和成本。
   * 返回 JSON 格式的筛选结果（包含 selectedArticleLinks、stats 等）。
   * 
   * @param prompt - 已构建好的初筛提示词（由 PromptManager 生成）
   * @param options - 请求选项
   * @returns AI 的原始响应文本（JSON 格式）
   */
  async screenFeedArticles(
    prompt: string,
    options?: {
      maxTokens?: number
      useReasoning?: boolean
    }
  ): Promise<string> {
    const startTime = Date.now()
    const useReasoning = options?.useReasoning || false
    
    try {
      // 使用配置的超时时间（推理模式需要更长时间处理批量文章）
      const timeout = this.getConfiguredTimeout(useReasoning)
      
      // 调用 API
      const apiResponse = await this.callChatAPI(prompt, {
        maxTokens: options?.maxTokens || (useReasoning ? 8000 : 4000),
        jsonMode: true,  // 要求返回 JSON 格式
        useReasoning,
        timeout
      })
      
      const duration = Date.now() - startTime
      const modelName = this.resolveModelName(apiResponse.model)
      
      // 计算成本
      const cost = this.calculateCost(
        apiResponse.tokensUsed.input,
        apiResponse.tokensUsed.output,
        modelName
      )
      
      // 记录使用情况
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: modelName,
        purpose: 'feed-prescreening',
        tokens: {
          input: apiResponse.tokensUsed.input,
          output: apiResponse.tokensUsed.output,
          total: apiResponse.tokensUsed.input + apiResponse.tokensUsed.output,
          estimated: false
        },
        cost: cost,
        latency: duration,
        success: true,
        reasoning: useReasoning
      })
      
      return apiResponse.content
    } catch (error) {
      const duration = Date.now() - startTime
      
      // 记录失败
      await AIUsageTracker.recordUsage({
        provider: this.name.toLowerCase() as any,
        model: this.config.model || this.getDefaultModelName(),
        purpose: 'feed-prescreening',
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        cost: {
          currency: this.getCurrency(),
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        latency: duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        reasoning: useReasoning
      })
      
      throw error
    }
  }
}
