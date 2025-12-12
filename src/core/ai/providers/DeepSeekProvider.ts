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
      
      // 使用足够大的 maxTokens 避免触发截断警告
      // "测试连接"这种简单提示通常只需要几十个 token，但设置 200 确保不会截断
      await this.callChatAPI("测试连接", {
        maxTokens: 200,
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
