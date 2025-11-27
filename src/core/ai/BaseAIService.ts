/**
 * AI 服务基类
 * 
 * 提供统一的提示词模板和通用逻辑，各个 Provider 只需实现 API 调用
 * 
 * 设计原则：
 * 1. 提示词统一管理（避免重复）
 * 2. Provider 只负责 API 调用（Chat-GPT 兼容接口）
 * 3. 通用逻辑复用（预处理、后处理、成本计算）
 */

import type {
  AIProvider,
  AIProviderConfig,
  UnifiedAnalysisResult,
  AnalyzeOptions,
  UserProfileGenerationRequest,
  UserProfileGenerationResult
} from "@/types/ai"

/**
 * 提示词模板配置
 */
export interface PromptTemplates {
  /** 内容分析提示词（标准模式） */
  analyzeContent: (content: string, userProfile?: {
    interests: string
    preferences: string[]
    avoidTopics: string[]
  }) => string
  
  /** 内容分析提示词（推理模式，可选） */
  analyzeContentReasoning?: (content: string, userProfile?: {
    interests: string
    preferences: string[]
    avoidTopics: string[]
  }) => string
  
  /** 用户画像生成提示词（全量） */
  generateProfileFull: (behaviorSummary: string) => string
  
  /** 用户画像生成提示词（增量更新） */
  generateProfileIncremental: (behaviorSummary: string, currentProfile: {
    interests: string
    preferences: string[]
    avoidTopics: string[]
  }) => string
}

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
  protected prompts: PromptTemplates
  
  constructor(config: AIProviderConfig) {
    this.config = config
    this.prompts = this.getPromptTemplates()
  }
  
  /**
   * 获取提示词模板（子类可覆盖以自定义）
   */
  protected getPromptTemplates(): PromptTemplates {
    return createDefaultPromptTemplates()
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
      const prompt = this.buildAnalyzePrompt(processedContent, options)
      
      // 3. 调用 API
      const response = await this.callChatAPI(prompt, {
        maxTokens: options?.useReasoning ? 4000 : 500,
        timeout: options?.timeout,
        jsonMode: !options?.useReasoning,
        useReasoning: options?.useReasoning
      })
      
      if (!response.content || response.content.trim().length === 0) {
        throw new Error("Empty response")
      }
      
      // 4. 解析响应并归一化概率
      const analysis = JSON.parse(response.content) as { topics: Record<string, number> }
      const normalizedTopics = this.normalizeTopicProbabilities(analysis.topics)
      
      // 5. 计算成本
      const cost = this.calculateCost(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      
      // 6. 返回结果
      return {
        topicProbabilities: normalizedTopics,
        metadata: {
          provider: this.name.toLowerCase() as any,
          model: this.resolveModelName(response.model),
          timestamp: Date.now(),
          tokensUsed: {
            prompt: response.tokensUsed.input,
            completion: response.tokensUsed.output,
            total: response.tokensUsed.input + response.tokensUsed.output
          },
          cost
        }
      }
    } catch (error) {
      throw new Error(`${this.name} analyzeContent failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * 生成用户画像
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest
  ): Promise<UserProfileGenerationResult> {
    try {
      // 1. 构建用户行为摘要
      const behaviorSummary = this.buildBehaviorSummary(request)
      
      // 3. 构建 Prompt
      const prompt = request.currentProfile
        ? this.prompts.generateProfileIncremental(behaviorSummary, request.currentProfile)
        : this.prompts.generateProfileFull(behaviorSummary)
      
      const responseFormat = this.getProfileResponseFormat()

      // 4. 调用 API
      const response = await this.callChatAPI(prompt, {
        maxTokens: 1000,
        timeout: 30000,
        jsonMode: !responseFormat,
        responseFormat: responseFormat || undefined,
        temperature: 0.3
      })
      
      if (!response.content || response.content.trim().length === 0) {
        throw new Error("Empty response")
      }
      
      // 5. 解析响应
      const profileData = JSON.parse(response.content) as {
        interests: string
        preferences: string[]
        avoidTopics: string[]
      }
      
      // 5. 计算成本
      const cost = this.calculateCost(
        response.tokensUsed.input,
        response.tokensUsed.output
      )
      
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
            output: response.tokensUsed.output,
            total: response.tokensUsed.input + response.tokensUsed.output
          },
          basedOn: {
            browses: request.totalCounts?.browses || 0,
            reads: request.totalCounts?.reads || 0,
            dismisses: request.totalCounts?.dismisses || 0
          },
          cost
        }
      }
    } catch (error) {
      throw new Error(`${this.name} generateUserProfile failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * 预处理内容
   */
  protected preprocessContent(content: string, options?: AnalyzeOptions): string {
    const maxLength = options?.maxLength || 3000
    
    // 截取内容
    let processed = content.substring(0, maxLength)
    
    // 清理多余空白
    processed = processed.replace(/\s+/g, " ").trim()
    
    return processed
  }
  
  /**
   * 构建内容分析提示词
   */
  protected buildAnalyzePrompt(content: string, options?: AnalyzeOptions): string {
    const userProfile = options?.userProfile
    
    // 如果支持推理模式且启用了推理
    if (options?.useReasoning && this.prompts.analyzeContentReasoning) {
      return this.prompts.analyzeContentReasoning(content, userProfile)
    }
    
    // 标准模式
    return this.prompts.analyzeContent(content, userProfile)
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
  async testConnection(): Promise<{
    success: boolean
    message: string
    latency?: number
  }> {
    try {
      const startTime = Date.now()
      
      await this.callChatAPI("测试连接", {
        maxTokens: 10,
        timeout: 10000,
        jsonMode: false
      })
      
      const latency = Date.now() - startTime
      
      return {
        success: true,
        message: `连接成功！${this.name} API 正常工作`,
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

/**
 * 创建默认提示词模板
 */
export function createDefaultPromptTemplates(): PromptTemplates {
  return {
    // 标准内容分析
    analyzeContent: (content, userProfile) => {
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
      
      // 无用户画像
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
    },
    
    // 推理模式内容分析
    analyzeContentReasoning: (content, userProfile) => {
      if (userProfile && userProfile.interests) {
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
      }
      
      // 无用户画像
      return `仔细分析以下文本，识别主要主题并评估其重要性。

文本：
${content}

思考步骤：
1. 文本的核心内容是什么？
2. 涉及哪些具体主题领域？
3. 每个主题在文本中的比重如何？

返回 JSON 格式结果，包含主题及其概率（0-1之间，总和为1）。

示例格式：
{
  "topics": {
    "技术": 0.6,
    "开源": 0.3,
    "教程": 0.1
  }
}

只返回 JSON。`
    },
    
    // 全量生成用户画像
    generateProfileFull: (behaviorSummary) => {
      return `你是一个用户兴趣分析专家。基于用户的浏览和阅读行为，生成用户的兴趣画像。

# 用户行为数据
${behaviorSummary}

# 任务要求
1. 综合分析用户的兴趣领域（50-200字，详细且具体）
2. 提炼用户的内容偏好（5-10条具体特征）
3. 从拒绝的文章中识别避免的主题（3-5条关键词）
4. 确保画像准确、具体、可操作

=== ⚠️ 输出格式要求 ===
**关键规则**：
1. **interests 字段必须直接描述，不要加主语**
   - ✅ 正确示例："对技术领域有浓厚兴趣，特别关注开源软件、开发工具..."
   - ✅ 正确示例："在前端开发领域表现出强烈的学习意愿，经常阅读..."
   - ❌ 错误示例："用户对技术领域有浓厚兴趣"
   - ❌ 错误示例："该用户在前端开发..."
   - ❌ 错误示例:"你对技术领域..."
   
2. **preferences 字段**：返回 5-10 个具体的内容类型
   - 示例：["技术深度分析", "开源软件实践", "产品设计案例"]
   
3. **avoidTopics 字段**：从拒绝的文章中提取避免主题
   - 如果有拒绝记录，提取 3-5 个避免主题关键词
   - 如果没有拒绝记录，返回空数组 []
   - 示例：["娱乐八卦", "广告营销", "低质量内容"]

# 输出格式（JSON）
{
  "interests": "简洁的兴趣领域描述（50-200字，自然语言）",
  "preferences": ["偏好1", "偏好2", "偏好3"],
  "avoidTopics": ["避免1", "避免2"]
}

只输出 JSON，不要其他内容。`
    },
    
    // 增量更新用户画像
    generateProfileIncremental: (behaviorSummary, currentProfile) => {
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
4. **根据拒绝的文章，更新避免主题列表**
5. 保持画像的连贯性和准确性

=== ⚠️ 输出格式要求 ===
**关键规则**：
1. **interests 字段必须直接描述，不要加主语**
   - ✅ 正确示例："对技术领域有浓厚兴趣，特别关注开源软件、开发工具..."
   - ✅ 正确示例："在前端开发领域表现出强烈的学习意愿，经常阅读..."
   - ❌ 错误示例："用户对技术领域有浓厚兴趣"
   - ❌ 错误示例："该用户在前端开发..."
   - ❌ 错误示例："你对技术领域..."
   
2. **preferences 字段**：返回 5-10 个具体的内容类型
   - 示例：["技术深度分析", "开源软件实践", "产品设计案例"]
   
3. **avoidTopics 字段**：从拒绝的文章中提取避免主题
   - 如果有拒绝记录，提取 3-5 个避免主题关键词
   - 如果没有拒绝记录，返回空数组 []
   - 示例：["娱乐八卦", "广告营销", "低质量内容"]

# 输出格式（JSON）
{
  "interests": "简洁的兴趣领域描述（50-200字，自然语言）",
  "preferences": ["偏好1", "偏好2", "偏好3"],
  "avoidTopics": ["避免1", "避免2"]
}

只输出 JSON，不要其他内容。`
    }
  }
}
