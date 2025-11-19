# 阶段 4: AI 能力集成 - 详细设计文档

## 目标

在 RSS 发现之前引入 AI 分析能力，提升内容理解的准确性和深度。

**核心理念**：
- 🎯 **AI 优先于关键词** - 更精准的语义理解
- 🔄 **渐进式开发** - 每一步都有可见变化
- 💰 **成本可控** - 免费方案 + 可选付费
- 🔒 **隐私优先** - 用户完全控制

## 战略价值

### 为什么在 RSS 之前做 AI？

1. **质量优先** - RSS 订阅的价值在于推荐质量，而 AI 比关键词更准确
2. **基础设施** - AI 能力是推荐引擎的核心，越早建立越好
3. **用户体验** - 冷启动阶段就能提供高质量分析
4. **技术债务** - 避免后期重构数据格式和分析逻辑

## 技术架构

### 数据格式：统一分析结果

```typescript
/**
 * 统一的内容分析结果格式
 * 
 * 设计原则:
 * 1. topicProbabilities 为主要数据格式
 * 2. 向后兼容现有关键词分析
 * 3. 支持 AI 特有的高级特性（可选）
 */
export interface UnifiedAnalysisResult {
  // === 核心数据 ===
  topicProbabilities: Record<Topic, number>  // 0-1 概率分布，总和为 1
  confidence: number                         // 0-1 置信度
  provider: string                           // 'openai' | 'anthropic' | 'keyword'
  
  // === AI 特有（可选）===
  entities?: Entity[]                        // 实体识别
  sentiment?: Sentiment                      // 情感分析
  embedding?: number[]                       // 向量嵌入（未来用于语义搜索）
  
  // === 兼容字段 ===
  keywords: string[]                         // 关键词（从概率云推导）
  topics: string[]                           // 主题标签
  language: string                           // 语言
  
  // === 元数据 ===
  timestamp: number
  processingTime: number                     // 分析耗时
}

/**
 * 实体类型
 */
export interface Entity {
  text: string                               // 实体文本
  type: 'person' | 'organization' | 'location' | 'product' | 'technology'
  confidence: number
}

/**
 * 情感分析
 */
export interface Sentiment {
  score: number                              // -1 到 1（负面到正面）
  label: 'positive' | 'neutral' | 'negative'
}
```

### AI Provider 接口

```typescript
/**
 * AI 提供商接口
 * 
 * 所有 AI 提供商（远程 API、本地模型、降级方案）都实现此接口
 */
export interface AIProvider {
  name: string                               // 提供商名称
  type: 'remote' | 'local' | 'fallback'      // 提供商类型
  
  /**
   * 检查提供商是否可用
   */
  isAvailable(): Promise<boolean>
  
  /**
   * 分析内容
   * @param text 要分析的文本（已清洗）
   * @returns 统一格式的分析结果
   */
  analyzeContent(text: string): Promise<UnifiedAnalysisResult>
  
  /**
   * 获取成本信息（可选）
   */
  getCostInfo?(): CostInfo
}

/**
 * 成本信息
 */
export interface CostInfo {
  tokensUsed: number                         // 使用的 token 数
  estimatedCost: number                      // 预估成本（美元）
  currency: string                           // 货币单位
}
```

### AICapabilityManager：Provider 管理器

```typescript
/**
 * AI 能力管理器
 * 
 * 职责:
 * 1. 管理多个 AI Provider
 * 2. 根据优先级和可用性选择 Provider
 * 3. 实现降级策略
 */
export class AICapabilityManager {
  private providers: AIProvider[] = []
  
  /**
   * 注册 Provider（按优先级顺序）
   */
  registerProvider(provider: AIProvider): void
  
  /**
   * 获取当前可用的 Provider
   */
  async getAvailableProvider(): Promise<AIProvider>
  
  /**
   * 分析内容（自动选择最佳 Provider）
   */
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult>
  
  /**
   * 获取所有 Provider 的状态
   */
  getProvidersStatus(): ProviderStatus[]
}

/**
 * Provider 状态
 */
export interface ProviderStatus {
  name: string
  available: boolean
  priority: number
  lastUsed: number | null
}
```

### 优先级策略

```typescript
/**
 * Provider 选择逻辑
 * 
 * 1. 优先级排序（高 → 低）：
 *    - 用户配置的远程 API（OpenAI/Anthropic/DeepSeek）
 *    - 降级到关键词分析（始终可用）
 * 
 * 2. 可用性检查：
 *    - 远程 API: 检查 API Key 是否配置、网络是否可达
 *    - 关键词: 始终返回 true
 * 
 * 3. 降级流程：
 *    - 尝试最高优先级的 Provider
 *    - 如果失败或不可用，降级到下一个
 *    - 最终降级到关键词分析
 */
async function selectProvider(
  providers: AIProvider[]
): Promise<AIProvider> {
  for (const provider of providers) {
    const available = await provider.isAvailable()
    if (available) {
      return provider
    }
  }
  
  // 最终降级到关键词
  return fallbackProvider
}
```

## Sprint 详细设计

### Sprint 1: UI 基础（2-3天）✨

#### 目标
建立可见的 AI 配置和状态展示界面，让用户能够：
1. 看到 AI 配置选项
2. 配置远程 API
3. 查看 AI 使用状态

#### 4.1 AI 配置界面

**文件**: `src/components/settings/AIConfig.tsx`

**UI 设计**:

```
┌──────────────────────────────────────────────────────┐
│ ⚙️ 设置 / AI 配置                                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 远程 AI 服务（可选）                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                      │
│ AI 提供商                                            │
│ ┌──────────────────────────────────────────────┐   │
│ │ [未配置 ▼]                                    │   │
│ └──────────────────────────────────────────────┘   │
│                                                      │
│ 📋 可选提供商:                                       │
│    • OpenAI (GPT-4o-mini)    - 快速、准确           │
│    • Anthropic (Claude-Haiku) - 便宜、高质量        │
│    • DeepSeek               - 国内友好              │
│                                                      │
│ API Key                                              │
│ ┌──────────────────────────────────────────────┐   │
│ │ sk-proj-...                                   │   │
│ └──────────────────────────────────────────────┘   │
│                                                      │
│ [测试连接]  [保存配置]                               │
│                                                      │
│ ℹ️ 配置后将优先使用 AI 分析（更准确，需付费）         │
│ 💡 不配置时使用免费的关键词分析                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**功能清单**:
- [ ] Provider 选择下拉框
  - 选项: 未配置、OpenAI、Anthropic、DeepSeek
  - 每个选项显示简短说明
- [ ] API Key 输入框
  - 类型: password（隐藏字符）
  - 验证: 非空、格式检查
- [ ] 测试连接按钮
  - 点击后调用 provider.isAvailable()
  - 显示测试结果（成功/失败/错误信息）
- [ ] 保存配置按钮
  - 加密存储到 chrome.storage.sync
  - 显示保存成功提示
- [ ] 提示信息
  - 说明 AI vs 关键词的区别
  - 成本提示

**数据存储**:

```typescript
// chrome.storage.sync
interface AIConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | null
  apiKey: string                               // 加密存储
  enabled: boolean
}
```

**组件代码结构**:

```typescript
export function AIConfig() {
  const [provider, setProvider] = useState<string>('none')
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  
  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const available = await testProvider(provider, apiKey)
      setTestResult(available ? '连接成功 ✅' : '连接失败 ❌')
    } catch (error) {
      setTestResult(`错误: ${error.message}`)
    } finally {
      setTesting(false)
    }
  }
  
  const handleSave = async () => {
    // 加密并保存配置
    await saveAIConfig({ provider, apiKey, enabled: true })
  }
  
  return (
    <div className="ai-config">
      {/* UI 组件 */}
    </div>
  )
}
```

**测试要点**:
- [ ] UI 渲染正确
- [ ] Provider 切换正常
- [ ] API Key 输入和保存
- [ ] 测试连接功能
- [ ] 数据加密存储

---

#### 4.2 AI 状态卡片

**文件**: `src/components/settings/CollectionStats.tsx`（扩展现有组件）

**UI 设计**:

```
┌──────────────────────────────────────────────────────┐
│ 📊 数据管理 / AI 状态                                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│ AI 分析状态                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                      │
│ 当前提供商: OpenAI (GPT-4o-mini)     🟢 已连接       │
│                                                      │
│ 本月使用:                                            │
│   • 分析次数: 1,234                                  │
│   • Tokens 使用: 456,789                            │
│   • 预估成本: $0.23                                  │
│                                                      │
│ 平均置信度: 0.87                                     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**功能清单**:
- [ ] 显示当前配置的 Provider
- [ ] 显示连接状态（已连接/未连接/降级）
- [ ] 显示本月统计
  - 分析次数
  - Tokens 使用
  - 预估成本
- [ ] 显示平均置信度

**数据来源**:

```typescript
interface AIUsageStats {
  provider: string
  connected: boolean
  monthlyStats: {
    analysisCount: number
    tokensUsed: number
    estimatedCost: number
  }
  avgConfidence: number
}

// 从 IndexedDB 聚合
async function getAIUsageStats(): Promise<AIUsageStats> {
  const results = await db.unifiedAnalysisResults
    .where('timestamp')
    .above(getMonthStart())
    .toArray()
  
  return {
    provider: getCurrentProvider(),
    connected: await isProviderConnected(),
    monthlyStats: {
      analysisCount: results.length,
      tokensUsed: sum(results, r => r.tokensUsed),
      estimatedCost: sum(results, r => r.cost)
    },
    avgConfidence: avg(results, r => r.confidence)
  }
}
```

---

#### 4.3 分析结果展示优化

**文件**: `src/components/settings/UserProfileDisplay.tsx`（扩展现有组件）

**UI 设计**:

在用户画像页面的顶部添加"分析质量"卡片：

```
┌──────────────────────────────────────────────────────┐
│ 👤 用户画像 / 分析质量                                │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 分析质量                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                      │
│ ┌──────────────┐  ┌──────────────┐                  │
│ │ AI 分析      │  │ 关键词分析    │                  │
│ │ 89%          │  │ 11%          │                  │
│ └──────────────┘  └──────────────┘                  │
│                                                      │
│ 平均置信度: 0.87  (较高)                             │
│                                                      │
│ 💡 AI 分析越多，推荐越准确                           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**功能清单**:
- [ ] 饼图或进度条展示 AI vs 关键词占比
- [ ] 显示平均置信度和评级（低/中/高）
- [ ] 提示信息

**数据聚合**:

```typescript
interface AnalysisQualityStats {
  aiPercentage: number                         // AI 分析占比
  keywordPercentage: number                    // 关键词分析占比
  avgConfidence: number                        // 平均置信度
  rating: 'low' | 'medium' | 'high'           // 评级
}

async function getAnalysisQualityStats(): Promise<AnalysisQualityStats> {
  const results = await db.unifiedAnalysisResults.toArray()
  
  const aiCount = results.filter(r => r.provider !== 'keyword').length
  const total = results.length
  
  const avgConf = avg(results, r => r.confidence)
  
  return {
    aiPercentage: (aiCount / total) * 100,
    keywordPercentage: ((total - aiCount) / total) * 100,
    avgConfidence: avgConf,
    rating: avgConf > 0.8 ? 'high' : avgConf > 0.5 ? 'medium' : 'low'
  }
}
```

---

### Sprint 2: AI 抽象层（1-2天）🏗

#### 目标
建立 AI 提供商的抽象层，实现第一个真实的 AI Provider（OpenAI）。

#### 4.4 数据类型定义

**文件**: `src/core/ai/types.ts`

```typescript
/**
 * AI 能力集成 - 类型定义
 */

import type { Topic } from '../profile/types'

/**
 * 统一的内容分析结果
 */
export interface UnifiedAnalysisResult {
  // 核心数据
  topicProbabilities: Record<Topic, number>
  confidence: number
  provider: string
  
  // AI 特有（可选）
  entities?: Entity[]
  sentiment?: Sentiment
  embedding?: number[]
  
  // 兼容字段
  keywords: string[]
  topics: string[]
  language: string
  
  // 元数据
  timestamp: number
  processingTime: number
  tokensUsed?: number
  cost?: number
}

export interface Entity {
  text: string
  type: 'person' | 'organization' | 'location' | 'product' | 'technology'
  confidence: number
}

export interface Sentiment {
  score: number  // -1 到 1
  label: 'positive' | 'neutral' | 'negative'
}

/**
 * AI 提供商接口
 */
export interface AIProvider {
  name: string
  type: 'remote' | 'local' | 'fallback'
  
  isAvailable(): Promise<boolean>
  analyzeContent(text: string): Promise<UnifiedAnalysisResult>
  getCostInfo?(): CostInfo
}

export interface CostInfo {
  tokensUsed: number
  estimatedCost: number
  currency: string
}

/**
 * Provider 状态
 */
export interface ProviderStatus {
  name: string
  type: 'remote' | 'local' | 'fallback'
  available: boolean
  priority: number
  lastUsed: number | null
}

/**
 * AI 配置
 */
export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | null
  apiKey: string
  enabled: boolean
  
  // 成本控制
  monthlyBudget?: number  // 美元
  maxTokensPerRequest?: number
}
```

**测试**:

```typescript
// types.test.ts
describe('UnifiedAnalysisResult', () => {
  it('should have required fields', () => {
    const result: UnifiedAnalysisResult = {
      topicProbabilities: { technology: 0.8, science: 0.2 },
      confidence: 0.9,
      provider: 'openai',
      keywords: ['react', 'hooks'],
      topics: ['technology'],
      language: 'zh-CN',
      timestamp: Date.now(),
      processingTime: 1200
    }
    
    expect(result).toBeDefined()
  })
})
```

---

#### 4.5 OpenAI Provider

**文件**: `src/core/ai/providers/OpenAIProvider.ts`

**实现**:

```typescript
import type { AIProvider, UnifiedAnalysisResult } from '../types'
import { Topic } from '../../profile/types'

/**
 * OpenAI Provider (GPT-4o-mini)
 */
export class OpenAIProvider implements AIProvider {
  name = 'OpenAI (GPT-4o-mini)'
  type = 'remote' as const
  
  private apiKey: string
  private model = 'gpt-4o-mini'
  private apiUrl = 'https://api.openai.com/v1/chat/completions'
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }
  
  /**
   * 检查 API Key 是否有效
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || this.apiKey === '') {
      return false
    }
    
    try {
      // 简单测试请求
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10
        })
      })
      
      return response.ok
    } catch (error) {
      console.error('OpenAI availability check failed:', error)
      return false
    }
  }
  
  /**
   * 分析内容
   */
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult> {
    const startTime = Date.now()
    
    const prompt = this.buildPrompt(text)
    
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: '你是一个内容分析助手，专门分析网页文本的主题和实体。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,  // 低温度，更确定的输出
        max_tokens: 500
      })
    })
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    const content = data.choices[0].message.content
    const usage = data.usage
    
    // 解析 JSON 响应
    const parsed = JSON.parse(content)
    
    const processingTime = Date.now() - startTime
    
    return {
      topicProbabilities: this.normalizeTopics(parsed.topics),
      confidence: parsed.confidence || 0.8,
      provider: 'openai',
      
      entities: parsed.entities || [],
      sentiment: parsed.sentiment,
      
      keywords: parsed.keywords || [],
      topics: Object.keys(parsed.topics),
      language: parsed.language || 'zh-CN',
      
      timestamp: Date.now(),
      processingTime,
      tokensUsed: usage.total_tokens,
      cost: this.calculateCost(usage.total_tokens)
    }
  }
  
  /**
   * 构建 Prompt
   */
  private buildPrompt(text: string): string {
    return `
请分析以下文本，输出 JSON 格式的结果：

文本：
"""
${text.slice(0, 4000)}  // 限制长度
"""

输出格式（严格按此 JSON 格式）：
{
  "topics": {
    "technology": 0.6,
    "science": 0.3,
    "business": 0.1
  },
  "confidence": 0.85,
  "entities": [
    { "text": "React", "type": "technology", "confidence": 0.9 },
    { "text": "Meta", "type": "organization", "confidence": 0.85 }
  ],
  "sentiment": {
    "score": 0.3,
    "label": "positive"
  },
  "keywords": ["React", "Hooks", "前端"],
  "language": "zh-CN"
}

主题类别必须从以下列表选择：
technology, science, business, entertainment, sports, health, politics, culture, education, lifestyle, other

实体类型必须从以下列表选择：
person, organization, location, product, technology

只返回 JSON，不要其他说明。
`.trim()
  }
  
  /**
   * 归一化主题概率（确保总和为 1）
   */
  private normalizeTopics(topics: Record<string, number>): Record<Topic, number> {
    const total = Object.values(topics).reduce((sum, v) => sum + v, 0)
    
    const normalized: any = {}
    for (const [key, value] of Object.entries(topics)) {
      normalized[key as Topic] = value / total
    }
    
    return normalized
  }
  
  /**
   * 计算成本（GPT-4o-mini: $0.15 / 1M input tokens, $0.60 / 1M output tokens）
   */
  private calculateCost(tokens: number): number {
    // 简化计算，假设 input:output = 3:1
    const inputTokens = tokens * 0.75
    const outputTokens = tokens * 0.25
    
    const inputCost = (inputTokens / 1_000_000) * 0.15
    const outputCost = (outputTokens / 1_000_000) * 0.60
    
    return inputCost + outputCost
  }
  
  getCostInfo(): { tokensUsed: number; estimatedCost: number; currency: string } {
    // 实现成本统计
    return { tokensUsed: 0, estimatedCost: 0, currency: 'USD' }
  }
}
```

**测试**:

```typescript
// OpenAIProvider.test.ts
describe('OpenAIProvider', () => {
  const mockApiKey = 'sk-test-...'
  
  it('should analyze content successfully', async () => {
    const provider = new OpenAIProvider(mockApiKey)
    
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              topics: { technology: 0.8, science: 0.2 },
              confidence: 0.9,
              entities: [{ text: 'React', type: 'technology', confidence: 0.95 }],
              sentiment: { score: 0.3, label: 'positive' },
              keywords: ['React', 'Hooks'],
              language: 'zh-CN'
            })
          }
        }],
        usage: { total_tokens: 250 }
      })
    })
    
    const result = await provider.analyzeContent('React 是一个...')
    
    expect(result.provider).toBe('openai')
    expect(result.topicProbabilities.technology).toBeCloseTo(0.8)
    expect(result.confidence).toBe(0.9)
    expect(result.entities).toHaveLength(1)
    expect(result.tokensUsed).toBe(250)
  })
  
  it('should check availability', async () => {
    const provider = new OpenAIProvider(mockApiKey)
    
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    
    const available = await provider.isAvailable()
    expect(available).toBe(true)
  })
})
```

---

#### 4.6 降级方案：Fallback Provider

**文件**: `src/core/ai/providers/FallbackKeywordProvider.ts`

```typescript
import type { AIProvider, UnifiedAnalysisResult } from '../types'
import { TextAnalyzer } from '../../profile/TextAnalyzer'
import { TopicClassifier } from '../../profile/TopicClassifier'
import type { Topic } from '../../profile/types'

/**
 * 降级方案：基于关键词的分析
 * 
 * 包装现有的 TextAnalyzer，转换为 AIProvider 接口
 */
export class FallbackKeywordProvider implements AIProvider {
  name = 'Fallback (Keyword)'
  type = 'fallback' as const
  
  private analyzer = new TextAnalyzer()
  private classifier = new TopicClassifier()
  
  /**
   * 关键词分析始终可用
   */
  async isAvailable(): Promise<boolean> {
    return true
  }
  
  /**
   * 使用关键词分析
   */
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult> {
    const startTime = Date.now()
    
    // 使用现有的 TextAnalyzer
    const keywords = this.analyzer.extractKeywords(text, { maxKeywords: 10 })
    const topics = this.classifier.classifyTopics(keywords)
    const language = this.analyzer.detectLanguage(text)
    
    // 转换为概率分布
    const topicProbabilities = this.convertToProbabilities(topics)
    
    return {
      topicProbabilities,
      confidence: 0.6,  // 关键词分析置信度固定为 0.6
      provider: 'keyword',
      
      // 关键词分析没有实体和情感
      entities: undefined,
      sentiment: undefined,
      
      keywords: keywords.map(k => k.word),
      topics: topics.map(t => t.topic),
      language,
      
      timestamp: Date.now(),
      processingTime: Date.now() - startTime
    }
  }
  
  /**
   * 将主题标签转换为概率分布
   */
  private convertToProbabilities(topics: { topic: string; weight: number }[]): Record<Topic, number> {
    const result: any = {}
    
    // 归一化权重
    const totalWeight = topics.reduce((sum, t) => sum + t.weight, 0)
    
    for (const { topic, weight } of topics) {
      result[topic as Topic] = weight / totalWeight
    }
    
    return result
  }
}
```

---

### Sprint 3: 集成到页面分析（1天）🔗

#### 目标
打通端到端流程：页面浏览 → AI 分析 → 存储到数据库

#### 4.7 AICapabilityManager

**文件**: `src/core/ai/AICapabilityManager.ts`

```typescript
import type { AIProvider, ProviderStatus, UnifiedAnalysisResult } from './types'
import { OpenAIProvider } from './providers/OpenAIProvider'
import { FallbackKeywordProvider } from './providers/FallbackKeywordProvider'
import { getAIConfig } from '@/storage/ai-config'

/**
 * AI 能力管理器
 * 
 * 职责:
 * 1. 管理多个 AI Provider
 * 2. 根据优先级和可用性选择 Provider
 * 3. 实现降级策略
 */
export class AICapabilityManager {
  private providers: AIProvider[] = []
  private fallback: AIProvider = new FallbackKeywordProvider()
  
  /**
   * 初始化（从配置加载 Provider）
   */
  async initialize(): Promise<void> {
    const config = await getAIConfig()
    
    // 清空现有 Provider
    this.providers = []
    
    // 添加用户配置的远程 API
    if (config.enabled && config.provider && config.apiKey) {
      switch (config.provider) {
        case 'openai':
          this.providers.push(new OpenAIProvider(config.apiKey))
          break
        // 未来添加其他 Provider
      }
    }
    
    // 降级方案始终存在
    this.providers.push(this.fallback)
  }
  
  /**
   * 获取当前可用的 Provider
   */
  async getAvailableProvider(): Promise<AIProvider> {
    for (const provider of this.providers) {
      const available = await provider.isAvailable()
      if (available) {
        return provider
      }
    }
    
    // 最终降级到关键词
    return this.fallback
  }
  
  /**
   * 分析内容（自动选择最佳 Provider）
   */
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult> {
    const provider = await this.getAvailableProvider()
    
    console.log(`[AI] Using provider: ${provider.name}`)
    
    try {
      const result = await provider.analyzeContent(text)
      return result
    } catch (error) {
      console.error(`[AI] Provider ${provider.name} failed:`, error)
      
      // 如果失败，降级到关键词
      if (provider !== this.fallback) {
        console.log('[AI] Falling back to keyword analysis')
        return this.fallback.analyzeContent(text)
      }
      
      throw error
    }
  }
  
  /**
   * 获取所有 Provider 的状态
   */
  async getProvidersStatus(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = []
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i]
      const available = await provider.isAvailable()
      
      statuses.push({
        name: provider.name,
        type: provider.type,
        available,
        priority: i + 1,
        lastUsed: null  // TODO: 从数据库查询
      })
    }
    
    return statuses
  }
}

// 单例
export const aiManager = new AICapabilityManager()
```

**测试**:

```typescript
// AICapabilityManager.test.ts
describe('AICapabilityManager', () => {
  it('should select first available provider', async () => {
    const manager = new AICapabilityManager()
    await manager.initialize()
    
    const provider = await manager.getAvailableProvider()
    expect(provider).toBeDefined()
  })
  
  it('should fallback to keyword when remote fails', async () => {
    // Mock 远程 Provider 失败
    const manager = new AICapabilityManager()
    await manager.initialize()
    
    const result = await manager.analyzeContent('测试文本')
    expect(result.provider).toBe('keyword')  // 应该降级
  })
})
```

---

#### 4.8 集成到 page-tracker

**文件**: `src/contents/page-tracker.ts`

**修改**:

```typescript
// 原来：
import { TextAnalyzer } from '@/core/profile/TextAnalyzer'
const analyzer = new TextAnalyzer()

async function analyzePage(text: string) {
  const keywords = analyzer.extractKeywords(text)
  // ...
}

// 现在：
import { aiManager } from '@/core/ai/AICapabilityManager'

async function analyzePage(text: string) {
  // 使用 AI 分析
  const result = await aiManager.analyzeContent(text)
  
  // 保存到数据库
  await db.unifiedAnalysisResults.add({
    ...result,
    url: window.location.href,
    title: document.title
  })
}

// 初始化
async function init() {
  await aiManager.initialize()
  // ...
}
```

**测试流程**:

1. **配置 OpenAI API Key**
   - 打开扩展设置
   - 进入 AI 配置
   - 选择 OpenAI
   - 输入有效的 API Key
   - 测试连接成功

2. **浏览新页面**
   - 访问技术博客或新闻网站
   - 停留 30 秒以上
   - 检查控制台日志，应该看到：
     ```
     [AI] Using provider: OpenAI (GPT-4o-mini)
     [AI] Analysis result: {...}
     ```

3. **检查数据库**
   - 打开 Chrome DevTools → Application → IndexedDB
   - 查看 `unifiedAnalysisResults` 表
   - 应该看到 provider: 'openai' 的记录

4. **测试降级**
   - 移除 API Key 或设置无效 Key
   - 浏览新页面
   - 应该看到：
     ```
     [AI] Using provider: Fallback (Keyword)
     ```
   - 数据库应该有 provider: 'keyword' 的记录

---

### Sprint 4: 更多远程 API（2天）🚀

#### 4.9 Anthropic Provider

**文件**: `src/core/ai/providers/AnthropicProvider.ts`

```typescript
import type { AIProvider, UnifiedAnalysisResult } from '../types'

/**
 * Anthropic Provider (Claude-3-Haiku)
 */
export class AnthropicProvider implements AIProvider {
  name = 'Anthropic (Claude-3-Haiku)'
  type = 'remote' as const
  
  private apiKey: string
  private model = 'claude-3-haiku-20240307'
  private apiUrl = 'https://api.anthropic.com/v1/messages'
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }
  
  async isAvailable(): Promise<boolean> {
    // 类似 OpenAI
  }
  
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult> {
    // 使用 Claude API
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: this.buildPrompt(text)
          }
        ]
      })
    })
    
    // 解析响应...
  }
  
  // ... 其他方法类似 OpenAI
}
```

**成本**:
- Claude-3-Haiku: $0.25 / 1M input tokens, $1.25 / 1M output tokens
- 比 GPT-4o-mini 稍贵，但质量更高

---

#### 4.10 DeepSeek Provider

**文件**: `src/core/ai/providers/DeepSeekProvider.ts`

```typescript
/**
 * DeepSeek Provider
 * 
 * 优势:
 * - 国内访问友好
 * - 成本更低
 * - 支持中文
 */
export class DeepSeekProvider implements AIProvider {
  name = 'DeepSeek'
  type = 'remote' as const
  
  private apiKey: string
  private model = 'deepseek-chat'
  private apiUrl = 'https://api.deepseek.com/v1/chat/completions'
  
  // 实现类似...
}
```

**成本**:
- DeepSeek: $0.14 / 1M tokens（input + output）
- 最便宜的选项

---

### Sprint 5: 用户画像升级（2天）📊

#### 4.11 ProfileBuilder 升级

**文件**: `src/core/profile/ProfileBuilder.ts`

**修改**:

```typescript
// 原来：基于关键词
async buildProfile(visits: Visit[]): Promise<UserProfile> {
  const allKeywords = visits.flatMap(v => v.analysis.keywords)
  const topicDistribution = this.aggregateTopics(allKeywords)
  // ...
}

// 现在：基于概率云
async buildProfile(visits: Visit[]): Promise<UserProfile> {
  // 获取 AI 分析结果
  const results = await db.unifiedAnalysisResults
    .where('url')
    .anyOf(visits.map(v => v.url))
    .toArray()
  
  // 加权聚合概率云
  const topicDistribution = this.aggregateProbabilities(results)
  
  // ...
}

/**
 * 聚合概率云（加权平均）
 */
private aggregateProbabilities(
  results: UnifiedAnalysisResult[]
): Record<Topic, number> {
  const aggregated: Record<Topic, number> = {}
  
  // 按置信度加权
  const totalWeight = results.reduce((sum, r) => sum + r.confidence, 0)
  
  for (const result of results) {
    const weight = result.confidence / totalWeight
    
    for (const [topic, prob] of Object.entries(result.topicProbabilities)) {
      aggregated[topic] = (aggregated[topic] || 0) + prob * weight
    }
  }
  
  // 归一化
  const total = Object.values(aggregated).reduce((sum, v) => sum + v, 0)
  for (const topic in aggregated) {
    aggregated[topic] /= total
  }
  
  return aggregated
}
```

**测试**:

```typescript
describe('ProfileBuilder with AI', () => {
  it('should aggregate probabilities correctly', async () => {
    const results = [
      { topicProbabilities: { tech: 0.8, sci: 0.2 }, confidence: 0.9 },
      { topicProbabilities: { tech: 0.6, sci: 0.4 }, confidence: 0.7 }
    ]
    
    const aggregated = builder.aggregateProbabilities(results)
    
    expect(aggregated.tech).toBeGreaterThan(aggregated.sci)
  })
})
```

---

#### 4.12 UI 展示优化

**文件**: `src/components/settings/UserProfileDisplay.tsx`

**新增功能**:

1. **实体展示**

```tsx
function EntityDisplay({ entities }: { entities: Entity[] }) {
  return (
    <div className="entities">
      <h4>识别的实体</h4>
      {entities.map(e => (
        <span key={e.text} className={`entity entity-${e.type}`}>
          {e.text} ({e.type})
        </span>
      ))}
    </div>
  )
}
```

2. **情感倾向**

```tsx
function SentimentDisplay({ sentiment }: { sentiment: Sentiment }) {
  const emoji = sentiment.label === 'positive' ? '😊' : 
                sentiment.label === 'negative' ? '😞' : '😐'
  
  return (
    <div className="sentiment">
      <h4>内容情感倾向</h4>
      <div>
        {emoji} {sentiment.label} (分数: {sentiment.score.toFixed(2)})
      </div>
    </div>
  )
}
```

---

### Sprint 6: 成本控制（1天）💰

#### 4.13 成本追踪

**文件**: `src/core/ai/CostTracker.ts`

```typescript
export class CostTracker {
  /**
   * 记录 API 使用
   */
  async recordUsage(result: UnifiedAnalysisResult): Promise<void> {
    await db.aiUsageRecords.add({
      provider: result.provider,
      tokensUsed: result.tokensUsed || 0,
      cost: result.cost || 0,
      timestamp: result.timestamp
    })
  }
  
  /**
   * 获取本月统计
   */
  async getMonthlyStats(): Promise<{
    totalTokens: number
    totalCost: number
    requestCount: number
  }> {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    
    const records = await db.aiUsageRecords
      .where('timestamp')
      .above(startOfMonth.getTime())
      .toArray()
    
    return {
      totalTokens: sum(records, r => r.tokensUsed),
      totalCost: sum(records, r => r.cost),
      requestCount: records.length
    }
  }
  
  /**
   * 检查是否超出预算
   */
  async isOverBudget(): Promise<boolean> {
    const config = await getAIConfig()
    if (!config.monthlyBudget) return false
    
    const stats = await this.getMonthlyStats()
    return stats.totalCost >= config.monthlyBudget
  }
}
```

---

#### 4.14 成本统计 UI

**文件**: `src/components/settings/AIConfig.tsx`（扩展）

**新增**:

```tsx
function CostStats() {
  const [stats, setStats] = useState(null)
  
  useEffect(() => {
    loadStats()
  }, [])
  
  async function loadStats() {
    const s = await costTracker.getMonthlyStats()
    setStats(s)
  }
  
  return (
    <div className="cost-stats">
      <h4>本月使用统计</h4>
      
      <div className="stat">
        <span>请求次数</span>
        <strong>{stats.requestCount}</strong>
      </div>
      
      <div className="stat">
        <span>Tokens 使用</span>
        <strong>{stats.totalTokens.toLocaleString()}</strong>
      </div>
      
      <div className="stat">
        <span>预估成本</span>
        <strong>${stats.totalCost.toFixed(2)}</strong>
      </div>
      
      {config.monthlyBudget && (
        <div className="budget-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(stats.totalCost / config.monthlyBudget) * 100}%` }}
            />
          </div>
          <span>
            预算: ${config.monthlyBudget} / 月
          </span>
        </div>
      )}
    </div>
  )
}
```

---

## 数据库 Schema 更新

**新增表**:

```typescript
// src/storage/db.ts

import Dexie from 'dexie'

export class SilentFeedDB extends Dexie {
  // ... 现有表 ...
  
  // 新增：统一分析结果表
  unifiedAnalysisResults!: Dexie.Table<UnifiedAnalysisResult, number>
  
  // 新增：AI 使用记录表
  aiUsageRecords!: Dexie.Table<AIUsageRecord, number>
  
  constructor() {
    super('SilentFeedDB')
    
    this.version(4).stores({
      // ... 现有表 ...
      
      // 新表
      unifiedAnalysisResults: '++id, url, provider, timestamp',
      aiUsageRecords: '++id, provider, timestamp'
    })
  }
}

interface AIUsageRecord {
  id?: number
  provider: string
  tokensUsed: number
  cost: number
  timestamp: number
}
```

---

## 测试策略

### 单元测试

- [ ] `types.ts` - 类型定义
- [ ] `OpenAIProvider.ts` - OpenAI 集成（Mock fetch）
- [ ] `AnthropicProvider.ts` - Anthropic 集成（Mock fetch）
- [ ] `DeepSeekProvider.ts` - DeepSeek 集成（Mock fetch）
- [ ] `FallbackKeywordProvider.ts` - 降级方案
- [ ] `AICapabilityManager.ts` - Provider 管理
- [ ] `CostTracker.ts` - 成本追踪

### 集成测试

- [ ] `page-tracker.ts` 集成 AICapabilityManager
- [ ] `ProfileBuilder.ts` 使用概率云
- [ ] 数据库存储和查询

### 浏览器测试

1. **配置测试**
   - [ ] 能配置 OpenAI API Key
   - [ ] 能配置 Anthropic API Key
   - [ ] 能配置 DeepSeek API Key
   - [ ] 测试连接功能正常

2. **分析测试**
   - [ ] 浏览页面，看到 AI 分析结果
   - [ ] 查看数据库，确认数据正确
   - [ ] 查看用户画像，看到 AI 分析占比

3. **降级测试**
   - [ ] 移除 API Key，降级到关键词分析
   - [ ] API 调用失败时自动降级

4. **成本测试**
   - [ ] 能看到本月使用统计
   - [ ] 预算进度条显示正确

---

## 完成标准

### 功能完成

- [ ] 所有 6 个 Sprint 完成
- [ ] UI 组件全部实现
- [ ] 3 个远程 API Provider 实现
- [ ] 降级方案正常工作
- [ ] 成本追踪功能完成

### 质量标准

- [ ] 测试覆盖率 ≥ 80%
- [ ] 所有测试通过（单元 + 集成）
- [ ] 浏览器实测通过
- [ ] 无 TypeScript/ESLint 错误

### 文档完成

- [ ] 更新 `docs/TDD.md`（AI 架构设计）
- [ ] 更新 `docs/TESTING.md`（新增测试用例）
- [ ] 更新 `README.md`（AI 功能说明）

---

## 风险与缓解

### 风险 1: API 成本超支

**风险**: 用户配置 API Key 后大量浏览，成本失控

**缓解**:
- 实现月度预算控制
- 超出预算后自动降级到关键词
- UI 显著提示成本信息

### 风险 2: API 可用性

**风险**: OpenAI/Anthropic 服务不稳定或被墙

**缓解**:
- 实现降级策略（自动切换到关键词）
- 缓存 API 响应（避免重复分析）
- 提供多个 API 选项（DeepSeek 国内友好）

### 风险 3: 数据格式不兼容

**风险**: AI 分析结果与现有代码不兼容

**缓解**:
- UnifiedAnalysisResult 保留兼容字段（keywords, topics）
- 现有代码可以继续使用 keywords
- 渐进式迁移到 topicProbabilities

---

## 下一步计划

完成阶段 4 后：

1. **阶段 5: RSS 自动发现**（原阶段 4）
   - 使用 AI 分析结果发现高质量 RSS 源

2. **阶段 6: 智能推荐**（原阶段 5）
   - 使用 topicProbabilities 计算相似度
   - 更准确的个性化推荐

---

## 参考资料

### AI API 文档

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [DeepSeek API](https://platform.deepseek.com/api-docs/)

### 成本计算器

- [OpenAI Pricing](https://openai.com/pricing)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [DeepSeek Pricing](https://platform.deepseek.com/api-docs/pricing/)

---

_最后更新: 2024-01-XX_
