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

  constructor(config: OllamaProviderConfig) {
    super({ ...config, apiKey: config.apiKey || "local" })
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
   * Phase 11: 使用真实的 chat completion 请求测试（而不是 GET /models）
   * 这样可以确保测试和实际使用一致，避免测试通过但实际调用失败的情况
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    try {
      const startTime = Date.now()
      
      // 使用真实的 chat completion 请求测试
      // 本地 AI 需要更长的超时时间
      const result = await this.callChatAPI("Hello", {
        maxTokens: 10,
        timeout: 30000,  // 30s 超时
        jsonMode: false
      })
      
      const latency = Date.now() - startTime
      
      if (result.content) {
        return {
          success: true,
          message: `连接成功！Ollama 服务正常运行（模型: ${result.model || this.config.model}）`,
          latency
        }
      }
      
      return {
        success: false,
        message: `连接失败: 响应为空`
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

    // DeepSeek-R1 等推理模型不支持 response_format，会导致返回空内容
    // 只在明确要求 JSON 模式且不是推理模型时才添加
    const isReasoningModel = this.config.model.toLowerCase().includes('r1')
    if (options?.jsonMode !== false && !isReasoningModel) {
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
      firstChoice: data.choices?.[0]  // 输出完整的第一个 choice
    })

    // DeepSeek-R1 推理模型会把内容放在 reasoning 字段
    const message = data.choices?.[0]?.message
    const rawContent = (message?.content || message?.reasoning || '').trim()
    
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
