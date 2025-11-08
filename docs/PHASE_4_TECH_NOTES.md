# 阶段 4 - AI 集成技术说明

## 1. DeepSeek vs OpenAI API 兼容性 ✅

### 结论：基本完全兼容

DeepSeek 使用 **OpenAI 兼容的 API 接口**，这意味着我们可以用几乎相同的代码调用两者。

### 相同点

| 特性 | OpenAI | DeepSeek |
|------|--------|----------|
| 端点 | `/v1/chat/completions` | `/v1/chat/completions` |
| 请求格式 | `{ model, messages, temperature, max_tokens }` | 完全相同 |
| 响应格式 | `{ choices, usage }` | 完全相同 |
| Stream 支持 | ✅ | ✅ |

### 不同点

| 特性 | OpenAI | DeepSeek |
|------|--------|----------|
| API URL | `https://api.openai.com` | `https://api.deepseek.com` |
| API Key 格式 | `sk-proj-xxx` 或 `sk-xxx` | 无固定前缀，约30-40字符 |
| 模型名称 | `gpt-4o-mini` | `deepseek-chat` |
| 价格 | $0.15/$0.60 per 1M tokens | $0.14 per 1M tokens |

### 代码实现策略

**方案 1：统一的 Provider 基类**（推荐）

```typescript
abstract class BaseAIProvider implements AIProvider {
  protected abstract apiUrl: string
  protected abstract model: string
  protected apiKey: string
  
  // 共享的 analyzeContent 方法
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(this.buildRequest(text))
    })
    
    return this.parseResponse(response)
  }
  
  // 子类只需覆盖这些
  protected abstract getHeaders(): Record<string, string>
  protected buildRequest(text: string): any { /* 通用实现 */ }
  protected parseResponse(response: Response): any { /* 通用实现 */ }
}

class OpenAIProvider extends BaseAIProvider {
  protected apiUrl = 'https://api.openai.com/v1/chat/completions'
  protected model = 'gpt-4o-mini'
  
  protected getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    }
  }
}

class DeepSeekProvider extends BaseAIProvider {
  protected apiUrl = 'https://api.deepseek.com/v1/chat/completions'
  protected model = 'deepseek-chat'
  
  protected getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    }
  }
}
```

**方案 2：配置驱动**（更简单）

```typescript
const PROVIDER_CONFIGS = {
  openai: {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    headerFormat: (key) => ({ Authorization: `Bearer ${key}` })
  },
  deepseek: {
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    headerFormat: (key) => ({ Authorization: `Bearer ${key}` })
  }
}

class UnifiedAIProvider implements AIProvider {
  constructor(
    private providerType: 'openai' | 'deepseek',
    private apiKey: string
  ) {}
  
  async analyzeContent(text: string) {
    const config = PROVIDER_CONFIGS[this.providerType]
    // 使用统一的逻辑...
  }
}
```

**我们采用方案 2**，因为：
- ✅ 更简单、代码更少
- ✅ 易于添加新的兼容 Provider
- ✅ 配置集中管理

---

## 2. 月度预算策略 💰

### 当前实现

```typescript
monthlyBudget: number | null
```

- `null` = 不限制预算
- `number` = 具体金额（美元）

### 风险分析

| 策略 | 风险 | 缓解措施 |
|------|------|----------|
| **不限制预算** | 🔴 高 - 可能意外产生大量费用 | ⚠️ 明确警告提示 |
| **设置预算** | 🟢 低 - 可控成本 | ✅ 超出后自动降级 |

### UI 实现

```typescript
{monthlyBudget === null ? (
  <p className="text-xs text-orange-600 dark:text-orange-400">
    ⚠️ 不限制预算可能产生意外费用，请谨慎使用
  </p>
) : (
  <p className="text-xs text-gray-500 dark:text-gray-400">
    超出预算后将自动降级到免费的关键词分析
  </p>
)}
```

### 建议

1. **默认设置预算**：新用户默认 $5/月（安全）
2. **高级用户选项**：可以勾选"不限制"（需要明确确认）
3. **成本追踪**：实时显示本月使用情况（Sprint 6）

---

## 3. 多供应商配置策略 🔄

### 当前设计：单一供应商配置

**数据结构**：

```typescript
interface AIConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | null
  apiKey: string
  enabled: boolean
  monthlyBudget?: number
}
```

**行为**：
- 每次只保存一个供应商的配置
- 切换供应商会**覆盖** API Key
- 用户需要重新输入 API Key

**优点**：
- ✅ 简单直观
- ✅ 代码少、易维护
- ✅ 符合 MVP 原则

**缺点**：
- ❌ 切换供应商会丢失之前的配置
- ❌ 不支持多供应商同时使用

---

### 未来扩展：多供应商配置

**数据结构**：

```typescript
interface MultiProviderConfig {
  providers: {
    openai?: {
      apiKey: string
      monthlyBudget?: number
    }
    anthropic?: {
      apiKey: string
      monthlyBudget?: number
    }
    deepseek?: {
      apiKey: string
      monthlyBudget?: number
    }
  }
  activeProvider: 'openai' | 'anthropic' | 'deepseek' | null
  enabled: boolean
}
```

**行为**：
- 保存所有供应商的配置
- 切换时不丢失其他配置
- 可以设置优先级（主要/备用）

**优点**：
- ✅ 切换方便
- ✅ 支持降级策略（主要 API 失败时切换到备用）
- ✅ 用户体验更好

**缺点**：
- ❌ 代码复杂度增加
- ❌ UI 需要重新设计
- ❌ 安全性考虑（存储多个 API Key）

---

### 建议的迁移路径

**Phase 4.1 (当前)**：
- 单一供应商配置
- 快速上线，验证核心功能

**Phase 4.x (未来)**：
如果用户反馈需要多供应商，再扩展：

```typescript
// 向后兼容的迁移代码
async function migrateToMultiProvider(oldConfig: AIConfig): Promise<MultiProviderConfig> {
  if (!oldConfig.provider) {
    return { providers: {}, activeProvider: null, enabled: false }
  }
  
  return {
    providers: {
      [oldConfig.provider]: {
        apiKey: oldConfig.apiKey,
        monthlyBudget: oldConfig.monthlyBudget
      }
    },
    activeProvider: oldConfig.provider,
    enabled: oldConfig.enabled
  }
}
```

---

## 4. 实际使用建议

### 对于开发测试（你的情况）

**推荐配置**：
- Provider: DeepSeek（最便宜 $0.14/1M tokens）
- API Key: `sk-02b27ba7831f479f94b721639901e661`（你的 .env 中的）
- 月度预算: $5（足够测试）

**预计成本**：
假设每天测试 50 个页面，每个页面 1000 tokens：
- 每天：50 × 1000 = 50,000 tokens
- 每月：50,000 × 30 = 1,500,000 tokens = 1.5M tokens
- 成本：1.5 × $0.14 = **$0.21/月**

非常便宜！

### 对于生产环境（用户）

**推荐策略**：
1. **默认使用关键词分析**（免费）
2. **可选配置 AI**：
   - DeepSeek：最便宜，适合预算有限的用户
   - OpenAI：中等价格，质量好
   - Anthropic：稍贵，质量最好
3. **设置合理预算**：$5-10/月（大部分用户够用）
4. **自动降级**：超预算后降级到关键词分析

---

## 5. 下一步开发计划

### Sprint 2: AI 抽象层（1-2天）

**优先实现 DeepSeek Provider**：

```typescript
// src/core/ai/providers/DeepSeekProvider.ts
export class DeepSeekProvider implements AIProvider {
  name = 'DeepSeek'
  type = 'remote' as const
  
  private apiKey: string
  private model = 'deepseek-chat'
  private apiUrl = 'https://api.deepseek.com/v1/chat/completions'
  
  async analyzeContent(text: string): Promise<UnifiedAnalysisResult> {
    // 使用你的 API Key 实际调用
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
            content: '你是一个内容分析助手...'
          },
          {
            role: 'user',
            content: this.buildPrompt(text)
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })
    
    // 解析响应...
  }
}
```

---

## 总结

1. **DeepSeek 兼容性**：✅ 完全兼容，只需切换 URL 和模型名
2. **月度预算**：✅ 已添加"不限制"选项，带警告提示
3. **配置策略**：✅ 当前单一配置，未来可扩展多配置
4. **成本**：✅ DeepSeek 最便宜，测试阶段约 $0.21/月

**可以开始浏览器测试了！** 🎉

重新加载扩展后，你应该能看到：
- ✅ AI 配置界面（Provider 选择、API Key 输入）
- ✅ 预算控制（可选"不限制"）
- ✅ 保存和测试连接功能

测试完成后，我会继续实现 Sprint 2（DeepSeek Provider 实际调用）。
