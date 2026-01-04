/**
 * DeepSeek Provider V2 (重构版)
 * 
 * 继承 BaseAIService，只实现 API 调用逻辑
 * 提示词和通用逻辑由基类提供
 */

import { BaseAIService } from "../BaseAIService"
import { DeepSeekCostCalculator, type TokenUsage } from "../CostCalculator"
import type { AIProviderConfig } from "@/types/ai"
import { logger, isNetworkError } from "@/utils/logger"

const deepseekLogger = logger.withTag("DeepSeekProvider")

// 使用统一的成本计算器
const costCalculator = new DeepSeekCostCalculator()

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
    // DeepSeek 缓存统计字段（用于精确计费）
    prompt_cache_hit_tokens?: number   // 缓存命中的输入 tokens
    prompt_cache_miss_tokens?: number  // 缓存未命中的输入 tokens
  }
}

export class DeepSeekProvider extends BaseAIService {
  readonly name = "DeepSeek"
  
  private endpoint = "https://api.deepseek.com/v1/chat/completions"
  private model = "deepseek-chat"
  
  // 推理模式使用的模型
  private readonly REASONING_MODEL = "deepseek-reasoner"
  
  // 追踪最后一次请求的缓存命中情况（用于精确计费）
  private lastCacheStats: {
    hitTokens: number
    missTokens: number
  } | null = null
  
  // 追踪最后一次请求使用的模型（用于成本计算）
  private lastUsedModel = "deepseek-chat"
  
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
    // 推理模式使用 deepseek-reasoner 模型
    const useReasoning = options?.useReasoning || false
    const actualModel = useReasoning ? this.REASONING_MODEL : this.model
    
    // 记录使用的模型（用于成本计算）
    this.lastUsedModel = actualModel
    
    const request: DeepSeekRequest = {
      model: actualModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: options?.maxTokens || (useReasoning ? 64000 : 8000), // 推理模式使用最大值 64K，标准模式 8K
      stream: false
    }
    
    // 启用 JSON Mode（deepseek-reasoner 也支持 JSON 输出）
    if (options?.responseFormat) {
      request.response_format = options.responseFormat as { type: "json_object" }
    } else if (options?.jsonMode) {
      request.response_format = {
        type: "json_object"
      }
    }
    
    // Phase 12.6: 使用配置的超时（如果未指定，使用 getConfiguredTimeout）
    const timeout = options?.timeout || this.getConfiguredTimeout(useReasoning)
    
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
      
      // 提取内容
      const message = data.choices[0]?.message
      let content = message?.content
      const reasoningContent = message?.reasoning_content
      
      // 调试日志：显示原始响应
      const finishReason = data.choices[0]?.finish_reason
      deepseekLogger.debug("API 响应", {
        model: request.model,
        hasContent: !!content,
        contentLength: content?.length || 0,
        hasReasoningContent: !!reasoningContent,
        reasoningContentLength: reasoningContent?.length || 0,
        finishReason
      })
      
      // 检查是否因 token 限制被截断
      if (finishReason === 'length') {
        deepseekLogger.warn("⚠️ 响应因 max_tokens 限制被截断", {
          model: actualModel,
          maxTokens: request.max_tokens,
          tokensUsed: data.usage.total_tokens
        })
      }
      
      // 推理模式特殊处理：deepseek-reasoner 可能返回空 content
      // 根据官方文档，JSON mode 有时会返回空 content
      if (!content && useReasoning && reasoningContent) {
        deepseekLogger.warn("⚠️ 推理模式返回空 content，尝试从 reasoning_content 提取")
        
        // 尝试从 reasoning_content 中提取 JSON
        // 方法1：查找 ```json 代码块
        const jsonMatch = reasoningContent.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          content = jsonMatch[1].trim()
          deepseekLogger.info("✅ 从 reasoning_content 中提取到 JSON 代码块")
        } else {
          // 方法2：从后往前查找最后一个完整的 JSON 对象（避免提取提示词中的示例）
          // 推理内容通常是：思考过程 + 最终 JSON，我们需要最后那个 JSON
          const lastBraceIndex = reasoningContent.lastIndexOf('}')
          if (lastBraceIndex !== -1) {
            // 从最后一个 } 往前找对应的 {
            let braceCount = 0
            let startIndex = -1
            
            for (let i = lastBraceIndex; i >= 0; i--) {
              if (reasoningContent[i] === '}') braceCount++
              if (reasoningContent[i] === '{') {
                braceCount--
                if (braceCount === 0) {
                  startIndex = i
                  break
                }
              }
            }
            
            if (startIndex !== -1) {
              content = reasoningContent.substring(startIndex, lastBraceIndex + 1)
              
              // 验证提取的 JSON 是否有效
              try {
                JSON.parse(content)
                deepseekLogger.info("✅ 从 reasoning_content 中提取到 JSON 对象")
              } catch (e) {
                deepseekLogger.warn("⚠️ 提取的 JSON 无效，可能被截断", { error: e instanceof Error ? e.message : String(e) })
                content = "" // 重置，触发错误
              }
            }
          }
        }
        
        // 打印提取的内容用于调试
        if (content) {
          deepseekLogger.debug("提取的 JSON 内容预览:", content.substring(0, 500))
        }
      }
      
      if (!content) {
        const errorMsg = finishReason === 'length'
          ? "Response truncated due to max_tokens limit. Consider increasing max_tokens."
          : "Empty response from DeepSeek API"
        
        // 仅在非测试场景（maxTokens > 200）时才记录截断警告
        // 测试连接时的截断是预期行为，不应该显示警告
        if (finishReason === 'length' && (request.max_tokens || 0) > 200) {
          deepseekLogger.warn("⚠️ 响应因 max_tokens 限制被截断", {
            model: request.model,
            maxTokens: request.max_tokens,
            reasoningContentPreview: reasoningContent?.substring(0, 200)
          })
        }
        
        deepseekLogger.error("❌ API 返回空 content", {
          model: request.model,
          finishReason,
          maxTokens: request.max_tokens,
          reasoningContentPreview: reasoningContent?.substring(0, 200)
        })
        throw new Error(errorMsg)
      }
      
      // 保存缓存统计信息（用于成本计算）
      this.lastCacheStats = {
        hitTokens: data.usage.prompt_cache_hit_tokens || 0,
        missTokens: data.usage.prompt_cache_miss_tokens || data.usage.prompt_tokens // 如果没有缓存字段，全部视为未命中
      }
      
      // 日志记录缓存命中情况
      if (data.usage.prompt_cache_hit_tokens !== undefined) {
        deepseekLogger.debug("缓存统计", {
          hitTokens: this.lastCacheStats.hitTokens,
          missTokens: this.lastCacheStats.missTokens,
          hitRate: this.lastCacheStats.hitTokens / (this.lastCacheStats.hitTokens + this.lastCacheStats.missTokens) * 100
        })
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
   * 实现：流式调用 DeepSeek Chat API
   * 
   * 用于推理模式等长时间运行的任务。
   * 使用空闲超时而非总时间超时，只要持续收到数据就不会超时。
   */
  protected override async callChatAPIStreaming(
    prompt: string,
    options?: {
      maxTokens?: number
      idleTimeout?: number
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
    const useReasoning = options?.useReasoning || false
    const actualModel = useReasoning ? this.REASONING_MODEL : this.model
    const idleTimeout = options?.idleTimeout || 60000 // 默认 60 秒空闲超时
    
    this.lastUsedModel = actualModel
    
    const request: DeepSeekRequest = {
      model: actualModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: options?.maxTokens || (useReasoning ? 64000 : 8000),
      stream: true  // 启用流式输出
    }
    
    // 启用 JSON Mode
    if (options?.responseFormat) {
      request.response_format = options.responseFormat as { type: "json_object" }
    } else if (options?.jsonMode) {
      request.response_format = { type: "json_object" }
    }
    
    deepseekLogger.debug("🌊 开始流式调用", {
      model: actualModel,
      maxTokens: request.max_tokens,
      idleTimeout,
      useReasoning
    })
    
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(request)
        // 注意：流式调用不设置总超时，依赖空闲超时
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`DeepSeek API error: ${response.status} ${errorText}`)
      }
      
      if (!response.body) {
        throw new Error("Response body is null")
      }
      
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let reasoningContent = ''
      let usage = { input: 0, output: 0 }
      let buffer = ''  // 用于处理跨 chunk 的数据
      
      // 进度追踪
      let lastProgressLog = 0
      const PROGRESS_LOG_INTERVAL = 2000  // 每 2000 字符输出一次进度
      const streamStartTime = Date.now()
      let chunkCount = 0
      
      // 空闲超时控制
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      let timedOut = false
      
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          timedOut = true
          reader.cancel()
        }, idleTimeout)
      }
      
      // 启动空闲计时器
      resetIdleTimer()
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (timedOut) {
            throw new Error(`Idle timeout: no data received for ${idleTimeout}ms`)
          }
          
          if (done) break
          
          // 收到数据，重置空闲计时器
          resetIdleTimer()
          chunkCount++
          
          // 解码并处理 SSE 数据
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          
          // 保留最后一行（可能不完整）
          buffer = lines.pop() || ''
          
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta
              
              // 提取内容
              if (delta?.content) {
                fullContent += delta.content
              }
              
              // 提取推理内容（DeepSeek 特有）
              if (delta?.reasoning_content) {
                reasoningContent += delta.reasoning_content
              }
              
              // 📊 进度日志：每 PROGRESS_LOG_INTERVAL 字符输出一次
              const totalReceived = fullContent.length + reasoningContent.length
              if (totalReceived - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
                const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1)
                deepseekLogger.info(`🌊 流式接收中...`, {
                  elapsed: `${elapsed}s`,
                  contentChars: fullContent.length,
                  reasoningChars: reasoningContent.length,
                  chunks: chunkCount
                })
                lastProgressLog = totalReceived
              }
              
              // 提取 usage（最后一个 chunk）
              if (parsed.usage) {
                usage = {
                  input: parsed.usage.prompt_tokens || 0,
                  output: parsed.usage.completion_tokens || 0
                }
                
                // 保存缓存统计
                this.lastCacheStats = {
                  hitTokens: parsed.usage.prompt_cache_hit_tokens || 0,
                  missTokens: parsed.usage.prompt_cache_miss_tokens || parsed.usage.prompt_tokens || 0
                }
              }
            } catch {
              // 忽略解析错误（可能是不完整的 JSON）
            }
          }
        }
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
      }
      
      // 计算总耗时
      const totalDuration = ((Date.now() - streamStartTime) / 1000).toFixed(1)
      
      // 推理模式特殊处理：可能需要从 reasoning_content 提取 JSON
      if (!fullContent && useReasoning && reasoningContent) {
        deepseekLogger.warn("⚠️ 流式推理模式返回空 content，尝试从 reasoning_content 提取")
        fullContent = this.extractJsonFromReasoning(reasoningContent)
      }
      
      if (!fullContent) {
        throw new Error("Empty response from streaming API")
      }
      
      // 📊 完成日志：显示完整统计
      deepseekLogger.info("✅ 流式调用完成", {
        duration: `${totalDuration}s`,
        contentChars: fullContent.length,
        reasoningChars: reasoningContent.length,
        totalChunks: chunkCount,
        tokensUsed: usage
      })
      
      return {
        content: fullContent,
        tokensUsed: usage,
        model: actualModel
      }
    } catch (error) {
      if (isNetworkError(error)) {
        deepseekLogger.warn("⚠️ 流式调用失败（网络问题）", error)
      } else {
        deepseekLogger.error("❌ 流式调用失败", error)
      }
      throw error
    }
  }
  
  /**
   * 从 reasoning_content 中提取 JSON
   */
  private extractJsonFromReasoning(reasoningContent: string): string {
    // 方法1：查找 ```json 代码块
    const jsonMatch = reasoningContent.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      deepseekLogger.info("✅ 从 reasoning_content 中提取到 JSON 代码块")
      return jsonMatch[1].trim()
    }
    
    // 方法2：从后往前查找最后一个完整的 JSON 对象
    const lastBraceIndex = reasoningContent.lastIndexOf('}')
    if (lastBraceIndex !== -1) {
      let braceCount = 0
      let startIndex = -1
      
      for (let i = lastBraceIndex; i >= 0; i--) {
        if (reasoningContent[i] === '}') braceCount++
        if (reasoningContent[i] === '{') {
          braceCount--
          if (braceCount === 0) {
            startIndex = i
            break
          }
        }
      }
      
      if (startIndex !== -1) {
        const extracted = reasoningContent.substring(startIndex, lastBraceIndex + 1)
        try {
          JSON.parse(extracted)
          deepseekLogger.info("✅ 从 reasoning_content 中提取到 JSON 对象")
          return extracted
        } catch {
          deepseekLogger.warn("⚠️ 提取的 JSON 无效")
        }
      }
    }
    
    return ''
  }
  
  /**
   * 实现：获取货币类型
   */
  protected getCurrency(): 'CNY' | 'USD' | 'FREE' {
    return 'CNY'  // DeepSeek 使用人民币
  }

  /**
   * 实现：计算成本
   * 
   * 使用统一的 CostCalculator 计算成本
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const breakdown = this.calculateCostBreakdown(inputTokens, outputTokens)
    return breakdown.input + breakdown.output
  }
  
  /**
   * 实现：计算成本明细（输入和输出分开）
   * 
   * 使用 API 返回的真实缓存命中数据计算成本
   */
  protected calculateCostBreakdown(inputTokens: number, outputTokens: number): { input: number; output: number } {
    // 构建 TokenUsage 对象
    const usage: TokenUsage = {
      input: inputTokens,
      output: outputTokens,
      // 如果有缓存数据，使用真实的缓存命中数
      cachedInput: this.lastCacheStats?.hitTokens
    }
    
    // 使用统一的成本计算器
    const result = costCalculator.calculateCost(usage, this.lastUsedModel)
    return { input: result.input, output: result.output }
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
      
      // 使用简短提示词并设置足够的 maxTokens 避免截断警告
      // 中文"回复OK"通常只需要几个 token，但 API 可能返回较长的友好响应
      await this.callChatAPI("回复OK即可", {
        maxTokens: 50,
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
