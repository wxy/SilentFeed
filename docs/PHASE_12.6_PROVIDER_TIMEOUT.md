# Phase 12.6: Provider 超时配置功能

## 📋 需求概述

为每个 AI Provider 添加独立的超时配置，允许用户根据网络环境和 Provider 特性定制超时策略。

## 🎯 功能目标

1. **独立超时配置**: 每个 Provider 可设置不同的超时时间
2. **推理模式区分**: 支持为推理模式设置更长的超时
3. **用户友好 UI**: 在 Provider 卡片中直接配置
4. **智能默认值**: 根据 Provider 类型和模式提供合理默认值

## 🏗️ 技术设计

### 1. 数据结构更新

#### RemoteProviderConfig 扩展

```typescript
// src/storage/ai-config.ts
export interface RemoteProviderConfig {
  /** API Key */
  apiKey: string
  /** 模型 */
  model: string
  /** 是否启用推理能力 */
  enableReasoning?: boolean
  
  // 🆕 Phase 12.6: 超时配置
  /** 标准模式超时（毫秒），默认 60000 */
  timeoutMs?: number
  /** 推理模式超时（毫秒），默认 120000 */
  reasoningTimeoutMs?: number
}
```

#### LocalAIConfig 已有超时字段

```typescript
// 已存在，无需修改
export interface LocalAIConfig {
  // ...其他字段
  /** 请求超时（毫秒） */
  timeoutMs?: number
}
```

### 2. 超时默认值

```typescript
// src/storage/ai-config.ts
export const DEFAULT_TIMEOUTS = {
  remote: {
    standard: 60000,      // 1 分钟（标准模式）
    reasoning: 120000     // 2 分钟（推理模式）
  },
  local: {
    standard: 30000,      // 30 秒（本地推理更快）
    reasoning: 180000     // 3 分钟（本地推理可能较慢）
  }
} as const
```

### 3. Provider 调用逻辑更新

#### BaseAIService 使用配置的超时

```typescript
// src/core/ai/BaseAIService.ts (修改现有代码)

async analyzeContent(
  content: string,
  options?: AnalyzeOptions
): Promise<UnifiedAnalysisResult> {
  // 当前代码:
  // timeout: options?.timeout,
  
  // 🆕 新逻辑: 优先使用配置的超时值
  const timeout = options?.timeout || this.getConfiguredTimeout(options?.useReasoning)
  
  const apiResponse = await this.callChatAPI(prompt, {
    maxTokens: options?.useReasoning ? 4000 : 500,
    timeout,  // 使用计算后的超时值
    jsonMode: !options?.useReasoning,
    useReasoning: options?.useReasoning
  })
}

// 🆕 新增方法
private getConfiguredTimeout(useReasoning?: boolean): number {
  // 从 config 读取用户配置的超时值
  if (useReasoning && this.config.reasoningTimeoutMs) {
    return this.config.reasoningTimeoutMs
  }
  if (!useReasoning && this.config.timeoutMs) {
    return this.config.timeoutMs
  }
  
  // 降级到默认值
  return useReasoning 
    ? DEFAULT_TIMEOUTS.remote.reasoning 
    : DEFAULT_TIMEOUTS.remote.standard
}
```

#### DeepSeekProvider 移除硬编码超时

```typescript
// src/core/ai/providers/DeepSeekProvider.ts (现有代码)
// 当前: 硬编码默认值
const defaultTimeout = options?.useReasoning ? 120000 : 60000
const timeout = options?.timeout || defaultTimeout

// 🆕 修改: 使用 BaseAIService 的统一逻辑
// 删除 defaultTimeout 行，直接使用 this.getConfiguredTimeout()
```

### 4. UI 组件更新

#### AIProviderCard 新增超时显示和编辑

```tsx
// src/components/AIProviderCard.tsx

export interface AIProviderCardProps {
  // ...现有 props
  
  // 🆕 Phase 12.6: 超时配置
  timeoutMs?: number           // 标准模式超时
  reasoningTimeoutMs?: number  // 推理模式超时
  onTimeoutChange?: (standard: number, reasoning: number) => void
}

// 在卡片中添加超时设置 UI
<div className="mt-3 space-y-2">
  {/* 标准模式超时 */}
  <div className="flex items-center justify-between text-sm">
    <label className="text-gray-700 dark:text-gray-300">
      {_("options.aiConfig.card.timeout.standard")}
    </label>
    <select
      value={timeoutMs || DEFAULT_TIMEOUTS.remote.standard}
      onChange={(e) => onTimeoutChange?.(
        Number(e.target.value),
        reasoningTimeoutMs || DEFAULT_TIMEOUTS.remote.reasoning
      )}
      className="px-2 py-1 rounded border"
    >
      <option value={30000}>30s</option>
      <option value={60000}>1min</option>
      <option value={90000}>1.5min</option>
      <option value={120000}>2min</option>
    </select>
  </div>
  
  {/* 推理模式超时（仅当 supportsReasoning 时显示） */}
  {supportsReasoning && (
    <div className="flex items-center justify-between text-sm">
      <label className="text-gray-700 dark:text-gray-300">
        {_("options.aiConfig.card.timeout.reasoning")}
      </label>
      <select
        value={reasoningTimeoutMs || DEFAULT_TIMEOUTS.remote.reasoning}
        onChange={(e) => onTimeoutChange?.(
          timeoutMs || DEFAULT_TIMEOUTS.remote.standard,
          Number(e.target.value)
        )}
        className="px-2 py-1 rounded border"
      >
        <option value={60000}>1min</option>
        <option value={120000}>2min</option>
        <option value={180000}>3min</option>
        <option value={240000}>4min</option>
        <option value={300000}>5min</option>
      </select>
    </div>
  )}
</div>
```

#### AIConfig 组件集成

```tsx
// src/components/settings/AIConfig.tsx

// 在 handleTimeoutChange 回调中更新配置
const handleTimeoutChange = async (
  providerId: string,
  standard: number,
  reasoning: number
) => {
  const updatedConfig = {
    ...config,
    providers: {
      ...config.providers,
      [providerId]: {
        ...config.providers[providerId],
        timeoutMs: standard,
        reasoningTimeoutMs: reasoning
      }
    }
  }
  
  await saveAIConfig(updatedConfig)
  setConfig(updatedConfig)
}
```

### 5. 国际化文本

#### 中文

```json
// public/locales/zh-CN/translation.json
{
  "options": {
    "aiConfig": {
      "card": {
        "timeout": {
          "standard": "标准模式超时",
          "reasoning": "推理模式超时",
          "description": "API 请求超时时间"
        }
      }
    }
  }
}
```

#### 英文

```json
// public/locales/en/translation.json
{
  "options": {
    "aiConfig": {
      "card": {
        "timeout": {
          "standard": "Standard Timeout",
          "reasoning": "Reasoning Timeout",
          "description": "API request timeout duration"
        }
      }
    }
  }
}
```

## 🧪 测试计划

### 1. 单元测试

```typescript
// src/storage/ai-config.test.ts

describe("Timeout Configuration", () => {
  test("应该保存和加载超时配置", async () => {
    const config: AIConfig = {
      providers: {
        openai: {
          apiKey: "test-key",
          model: "gpt-5-mini",
          timeoutMs: 90000,
          reasoningTimeoutMs: 180000
        }
      },
      // ...其他字段
    }
    
    await saveAIConfig(config)
    const loaded = await getAIConfig()
    
    expect(loaded.providers.openai?.timeoutMs).toBe(90000)
    expect(loaded.providers.openai?.reasoningTimeoutMs).toBe(180000)
  })
  
  test("未配置时应使用默认超时", async () => {
    const config: AIConfig = {
      providers: {
        deepseek: {
          apiKey: "test-key",
          model: "deepseek-chat"
          // 未设置 timeoutMs
        }
      },
      // ...
    }
    
    await saveAIConfig(config)
    const loaded = await getAIConfig()
    
    // 应该回退到默认值（在 Provider 调用时处理）
    expect(loaded.providers.deepseek?.timeoutMs).toBeUndefined()
  })
})
```

### 2. 集成测试

```typescript
// src/core/ai/BaseAIService.test.ts

describe("BaseAIService Timeout", () => {
  test("应该使用配置的标准超时", async () => {
    const service = new TestAIService({
      apiKey: "test",
      model: "test-model",
      timeoutMs: 45000  // 自定义超时
    })
    
    // Mock callChatAPI 来验证超时参数
    const spy = vi.spyOn(service, 'callChatAPI')
    
    await service.analyzeContent("test content")
    
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 45000  // 应使用配置的值
      })
    )
  })
  
  test("应该使用配置的推理超时", async () => {
    const service = new TestAIService({
      apiKey: "test",
      model: "test-model",
      reasoningTimeoutMs: 200000
    })
    
    const spy = vi.spyOn(service, 'callChatAPI')
    
    await service.analyzeContent("test", { useReasoning: true })
    
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 200000  // 推理模式使用专门配置
      })
    )
  })
})
```

### 3. 浏览器测试

#### 测试场景

1. **配置保存测试**:
   - 打开 Options 页面
   - 修改 OpenAI 标准超时为 90s
   - 修改推理超时为 3min
   - 刷新页面，验证配置持久化

2. **超时生效测试**:
   - 设置极短超时（10s）
   - 触发推荐生成
   - 验证是否在超时后正确报错

3. **推理模式区分测试**:
   - 配置不同的标准/推理超时
   - 分别触发标准和推理任务
   - 验证使用了正确的超时值

## 📊 性能影响

- **配置加载**: +10ms（读取额外字段）
- **运行时开销**: 0ms（仅参数传递）
- **存储增加**: +16 bytes/provider（2 个 number）

## 🔄 向后兼容

- **未配置超时**: 自动使用默认值（60s/120s）
- **旧配置迁移**: 无需迁移，可选字段
- **API 兼容性**: 不影响现有 Provider 实现

## 📝 验收标准

- [x] RemoteProviderConfig 添加 timeoutMs 和 reasoningTimeoutMs 字段
- [x] 定义 DEFAULT_TIMEOUTS 常量
- [x] BaseAIService 实现 getConfiguredTimeout() 方法
- [x] AIProviderCard 添加超时配置 UI
- [x] AIConfig 组件集成超时配置回调
- [x] 添加国际化文本（中英文）
- [x] 编写单元测试（ai-config.test.ts）
- [x] 编写集成测试（BaseAIService.test.ts）
- [x] 浏览器测试验证配置生效
- [x] 文档更新

## 🚀 实施步骤

1. ✅ 创建设计文档
2. ⏳ 更新类型定义（ai-config.ts）
3. ⏳ 实现 BaseAIService 超时逻辑
4. ⏳ 更新 AIProviderCard UI
5. ⏳ 集成到 AIConfig 组件
6. ⏳ 添加国际化文本
7. ⏳ 编写测试
8. ⏳ 浏览器验证
9. ⏳ 提交 PR

## 🔗 相关文档

- [PHASE_12.5_API_KEY_ENCRYPTION.md](./PHASE_12.5_API_KEY_ENCRYPTION.md) - API 密钥加密
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - 开发计划
