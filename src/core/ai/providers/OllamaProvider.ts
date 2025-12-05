import { BaseAIService } from "../BaseAIService"
import type { AIProviderConfig } from "@/types/ai"
import { logger } from "@/utils/logger"
import {
  buildLocalAIHeaders,
  resolveLocalAIEndpoint,
  type LocalAIEndpointMode,
  type LocalAIEndpointSet
} from "@/utils/local-ai-endpoint"

interface OllamaChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OllamaChatRequest {
  model: string
  messages: OllamaChatMessage[]
  stream: boolean
  format?: "json"
  options?: {
    temperature?: number
    top_p?: number
    num_predict?: number
  }
}

interface OllamaChatResponse {
  model: string
  message?: {
    role: string
    content: string
  }
  total_duration?: number // 纳秒
  load_duration?: number
  prompt_eval_duration?: number
  eval_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaGenerateResponse {
  model?: string
  response?: string
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaProviderConfig extends AIProviderConfig {
  temperature?: number
  maxOutputTokens?: number
  timeoutMs?: number
  /** Phase 11.2: 是否为推理模型（从配置中读取，优先级高于名称检测） */
  isReasoningModel?: boolean
}

const ollamaLogger = logger.withTag("OllamaProvider")

/**
 * 本地 Ollama Provider
 */
export class OllamaProvider extends BaseAIService {
  readonly name = "Ollama"

  private readonly baseUrl: string
  private readonly endpoints: Record<LocalAIEndpointMode, LocalAIEndpointSet>
  private endpointMode: LocalAIEndpointMode
  private readonly temperature: number
  private readonly maxOutputTokens: number
  private readonly defaultTimeout: number
  private readonly isReasoningModel: boolean

  constructor(config: OllamaProviderConfig) {
    super({ ...config, apiKey: config.apiKey || "ollama" })
    const resolved = resolveLocalAIEndpoint(config.endpoint)
    this.baseUrl = resolved.baseUrl
    this.endpoints = {
      legacy: resolved.legacy,
      openai: resolved.openai
    }
    this.endpointMode = resolved.mode
    this.temperature = config.temperature ?? 0.2
    this.maxOutputTokens = config.maxOutputTokens ?? 768
    // Phase 11: 本地 AI 需要更长的超时时间（120s）
    this.defaultTimeout = config.timeoutMs ?? 120000
    // Phase 11.2: 优先使用配置中的 isReasoningModel（从 Ollama API 获取）
    // 降级到基于模型名称的检测
    this.isReasoningModel = config.isReasoningModel ?? this.detectReasoningModel(config.model)
    if (this.isReasoningModel) {
      ollamaLogger.info(`检测到推理模型: ${config.model}，将使用特殊处理`)
    }
  }

  /**
   * Ollama 为本地服务，没有 API Key，改为探测接口可用性
   */
  async isAvailable(): Promise<boolean> {
    const order = this.getModeOrder()
    for (const mode of order) {
      try {
        const resp = await fetch(this.getModelsEndpoint(mode), {
          method: "GET",
          headers: buildLocalAIHeaders(mode, this.config.apiKey),
          signal: AbortSignal.timeout(4000)
        })
        if (resp.ok) {
          this.endpointMode = mode
          return true
        }
        ollamaLogger.warn(`Ollama ${mode} 模式返回 ${resp.status}`)
      } catch (error) {
        ollamaLogger.warn(`Ollama ${mode} 模式探测失败`, error)
      }
    }
    return false
  }

  /**
   * 测试连接
   * 
   * Phase 11 优化: 使用快速的 GET /models 测试连接
   * - 不需要加载模型，速度快（< 1s）
   * - 只验证服务可达性
   * - 实际调用会在使用时进行
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    try {
      const startTime = Date.now()
      const order = this.getModeOrder()
      
      // 尝试获取模型列表（快速测试）
      for (const mode of order) {
        try {
          const resp = await fetch(this.getModelsEndpoint(mode), {
            method: "GET",
            headers: buildLocalAIHeaders(mode, this.config.apiKey),
            signal: AbortSignal.timeout(5000)  // 5s 足够
          })
          
          if (resp.ok) {
            const latency = Date.now() - startTime
            const data = await resp.json()
            const modelCount = mode === 'openai' 
              ? (data?.data?.length || 0)
              : (data?.models?.length || 0)
            
            return {
              success: true,
              message: `连接成功！检测到 ${modelCount} 个模型（${mode} 模式）`,
              latency
            }
          }
        } catch (error) {
          ollamaLogger.debug(`${mode} 模式测试失败:`, error)
        }
      }
      
      return {
        success: false,
        message: `无法连接到 Ollama 服务 (${this.baseUrl})`
      }
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  protected getDefaultModelName(): string {
    return this.config.model || "ollama-local"
  }

  /**
   * 检测是否为推理模型（基于模型名称 - 降级方案）
   * 
   * Phase 11.2: 优先使用配置中的 isReasoningModel（从 Ollama /api/show 的 capabilities 获取）
   * capabilities 包含 "thinking" 表示支持推理能力
   * 此方法仅作为降级方案，不应依赖
   * 
   * @param modelName 模型名称
   * @returns 始终返回 false（不可靠的检测方式）
   */
  private detectReasoningModel(modelName?: string): boolean {
    // Phase 11.2: 名称检测不可靠，始终返回 false
    // 应该通过配置中的 isReasoningModel 判断（来自 /api/show 的 capabilities）
    return false
  }

  /**
   * 调用 Ollama /api/chat 接口
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
    // 直接使用当前配置的模式，不再尝试 fallback
    if (this.endpointMode === "openai") {
      return await this.callOpenAICompatibleAPI(prompt, options)
    } else {
      return await this.callLegacyAPI(prompt, options)
    }
  }

  private extractJsonContent(raw: string): string {
    const firstBrace = raw.indexOf("{")
    const lastBrace = raw.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return raw.slice(firstBrace, lastBrace + 1)
    }
    return raw
  }

  private getModeOrder(): LocalAIEndpointMode[] {
    return this.endpointMode === "openai" ? ["openai", "legacy"] : ["legacy", "openai"]
  }

  private shouldSwitchToGenerate(status: number): boolean {
    return [401, 403, 404, 405, 501].includes(status)
  }

  private getChatEndpoint(mode: LocalAIEndpointMode): string {
    return mode === "openai"
      ? this.endpoints.openai.chatUrl
      : this.endpoints.legacy.chatUrl
  }

  private getModelsEndpoint(mode: LocalAIEndpointMode): string {
    return mode === "openai"
      ? this.endpoints.openai.modelsUrl
      : this.endpoints.legacy.modelsUrl
  }

  private getGenerateEndpoint(): string {
    return this.endpoints.legacy.generateUrl ?? `${this.baseUrl}/api/generate`
  }

  private async callLegacyAPI(
    prompt: string,
    options?: {
      maxTokens?: number
      timeout?: number
      jsonMode?: boolean
      temperature?: number
    }
  ): Promise<{
    content: string
    tokensUsed: { input: number; output: number }
    model?: string
  }> {
    if (!this.config.model) {
      throw new Error('Ollama 模型未配置，请在 AI 配置中设置模型')
    }
    
    const body: OllamaChatRequest = {
      model: this.config.model,
      messages: [
        {
          role: "system",
          content: "你是 Silent Feed 的本地分析助手，请严格返回 JSON 格式。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      stream: false,
      options: {
        temperature: options?.temperature ?? this.temperature,
        top_p: 0.9,
        num_predict: options?.maxTokens ?? this.maxOutputTokens
      }
    }

    if (options?.jsonMode !== false) {
      body.format = "json"
    }

    const timeout = options?.timeout || this.defaultTimeout
    const url = this.getChatEndpoint("legacy")
    const headers = buildLocalAIHeaders("legacy", this.config.apiKey)

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    })

    if (!response.ok) {
      if (this.shouldSwitchToGenerate(response.status)) {
        return this.callGenerateAPI(prompt, options)
      }
      const errorText = await response.text()
      throw new Error(
        `Ollama API error: ${response.status} ${errorText} | ${this.describeRequest(
          this.getChatEndpoint("legacy"),
          body
        )}`
      )
    }

    const data = await response.json() as OllamaChatResponse
    ollamaLogger.debug('Ollama legacy API 响应:', { 
      model: data.model, 
      hasMessage: !!data.message,
      contentLength: data.message?.content?.length 
    })
    
    const rawContent = data.message?.content?.trim()

    if (!rawContent) {
      ollamaLogger.error('Ollama 返回空响应:', data)
      throw new Error(`Empty response from Ollama (model: ${data.model || 'unknown'}, status: ${response.status})`)
    }

    const content = this.extractJsonContent(rawContent)

    return {
      content,
      tokensUsed: {
        input: data.prompt_eval_count ?? 0,
        output: data.eval_count ?? 0
      },
      model: data.model || this.getDefaultModelName()
    }
  }

  private buildGeneratePrompt(prompt: string): string {
    return `系统: 你是 Silent Feed 的本地分析助手，请严格返回 JSON 格式。\n用户: ${prompt}`
  }

  private async callGenerateAPI(
    prompt: string,
    options?: {
      maxTokens?: number
      timeout?: number
      jsonMode?: boolean
      temperature?: number
    }
  ): Promise<{
    content: string
    tokensUsed: { input: number; output: number }
    model?: string
  }> {
    if (!this.config.model) {
      throw new Error('Ollama 模型未配置，请在 AI 配置中设置模型')
    }
    
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt: this.buildGeneratePrompt(prompt),
      stream: false,
      options: {
        temperature: options?.temperature ?? this.temperature,
        num_predict: options?.maxTokens ?? this.maxOutputTokens,
        top_p: 0.9
      }
    }

    if (options?.jsonMode !== false) {
      body.format = "json"
    }

    const timeout = options?.timeout || this.defaultTimeout
    const url = this.getGenerateEndpoint()
    const headers = buildLocalAIHeaders("legacy", this.config.apiKey)

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Ollama API error: ${response.status} ${errorText} | ${this.describeRequest(
          this.getGenerateEndpoint(),
          body
        )}`
      )
    }

    const data = await response.json() as OllamaGenerateResponse
    const rawContent = data.response?.trim()

    if (!rawContent) {
      throw new Error("Empty response from Ollama generate API")
    }

    return {
      content: this.extractJsonContent(rawContent),
      tokensUsed: {
        input: data.prompt_eval_count ?? 0,
        output: data.eval_count ?? 0
      },
      model: data.model || this.getDefaultModelName()
    }
  }

  private buildOpenAIMessages(prompt: string) {
    return [
      {
        role: "system",
        content: "你是 Silent Feed 的本地分析助手，请严格返回 JSON 格式。"
      },
      {
        role: "user",
        content: prompt
      }
    ]
  }

  private async callOpenAICompatibleAPI(
    prompt: string,
    options?: {
      maxTokens?: number
      timeout?: number
      jsonMode?: boolean
      responseFormat?: Record<string, unknown>
      temperature?: number
    }
  ): Promise<{
    content: string
    tokensUsed: { input: number; output: number }
    model?: string
  }> {
    if (!this.config.model) {
      throw new Error('Ollama 模型未配置，请在 AI 配置中设置模型')
    }
    
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.buildOpenAIMessages(prompt),
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.maxTokens ?? this.maxOutputTokens,
      stream: false
    }

    // 推理模型不支持 response_format，会导致返回空内容
    // 只在明确要求 JSON 模式且不是推理模型时才添加
    if (options?.jsonMode !== false && !this.isReasoningModel) {
      body.response_format = options?.responseFormat || { type: "json_object" }
    }

    const timeout = options?.timeout || this.defaultTimeout
    const url = this.getChatEndpoint("openai")
    const headers = buildLocalAIHeaders("openai", this.config.apiKey)

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Ollama API error: ${response.status} ${errorText} | ${this.describeRequest(
          this.getChatEndpoint("openai"),
          body
        )}`
      )
    }

    const data = await response.json() as {
      id?: string
      model?: string
      choices?: Array<{ 
        message?: { 
          content?: string
          role?: string
          reasoning?: string  // DeepSeek-R1 推理模型的特殊字段
        } 
      }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    ollamaLogger.debug('Ollama OpenAI API 响应:', { 
      model: data.model,
      choicesCount: data.choices?.length,
      hasContent: !!data.choices?.[0]?.message?.content,
      hasReasoning: !!data.choices?.[0]?.message?.reasoning,
      contentLength: data.choices?.[0]?.message?.content?.length || 0,
      reasoningLength: data.choices?.[0]?.message?.reasoning?.length || 0,
      finishReason: data.choices?.[0]?.finish_reason
    })

    // DeepSeek-R1 推理模型的响应格式:
    // - content: 最终答案 (JSON 格式)
    // - reasoning: 推理过程 (自然语言，可能很长)
    // 优先使用 content，只有当 content 为空且 reasoning 存在时才回退
    const message = data.choices?.[0]?.message
    let rawContent = message?.content?.trim() || ''
    
    // 如果 content 为空但 reasoning 存在，尝试从 reasoning 中提取 JSON
    if (!rawContent && message?.reasoning) {
      ollamaLogger.warn('⚠️ content 为空，尝试从 reasoning 中提取内容')
      rawContent = message.reasoning.trim()
      
      // 检查是否被截断
      if (data.choices?.[0]?.finish_reason === 'length') {
        ollamaLogger.error('❌ 推理内容被截断，需要增加 max_tokens')
        throw new Error(`Reasoning truncated (finish_reason=length). Increase max_tokens. Model: ${data.model}`)
      }
    }
    
    if (!rawContent) {
      ollamaLogger.error('Ollama 返回空响应 - 完整数据:', JSON.stringify(data, null, 2))
      throw new Error(`Empty response from Ollama (model: ${data.model || 'unknown'}, choices: ${data.choices?.length || 0})`)
    }

    return {
      content: this.extractJsonContent(rawContent),
      tokensUsed: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0
      },
      model: data.model || this.getDefaultModelName()
    }
  }

  private describeRequest(url: string, payload: unknown): string {
    const method = "POST"
    const bodyPreview = this.stringifyPayload(payload)
    return `请求 ${method} ${url}，参数: ${bodyPreview}`
  }

  private stringifyPayload(payload: unknown): string {
    try {
      const serialized = typeof payload === "string" ? payload : JSON.stringify(payload)
      return serialized.length > 600 ? `${serialized.slice(0, 600)}…(已截断)` : serialized
    } catch (error) {
      ollamaLogger.warn("序列化请求体失败", error)
      return "[无法序列化请求体]"
    }
  }
}
