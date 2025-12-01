# Phase 8 Step 4: 业务逻辑集成

## 目标

让 AI 引擎分配配置实际影响业务逻辑，根据任务类型选择对应的 AI 引擎。

## 任务类型映射

| 任务类型 | 业务场景 | 当前实现 |
|---------|---------|---------|
| `pageAnalysis` | 页面浏览学习 | `analyzeContent()` |
| `feedAnalysis` | 推荐订阅文章 | `analyzeContent()` (RSS) |
| `profileGeneration` | 用户画像生成 | `generateUserProfile()` |

## 实现方案

### 1. 新增任务类型枚举

```typescript
export type AITaskType = "pageAnalysis" | "feedAnalysis" | "profileGeneration"
```

### 2. 修改 AICapabilityManager

#### 2.1 添加引擎分配配置加载

```typescript
private engineAssignment: AIEngineAssignment | null = null

async initialize() {
  // ... 现有代码
  this.engineAssignment = await getEngineAssignment()
}
```

#### 2.2 新增任务路由方法

```typescript
private async getProviderForTask(taskType: AITaskType): Promise<{
  provider: AIProvider | null
  useReasoning: boolean
}> {
  if (!this.engineAssignment) {
    // 降级到旧逻辑
    return { provider: this.remoteProvider || this.localProvider, useReasoning: false }
  }
  
  const config = this.engineAssignment[taskType]
  const useReasoning = config.useReasoning || false
  
  switch (config.provider) {
    case "deepseek":
      return { provider: this.remoteProvider, useReasoning }
    case "openai":
      return { provider: this.remoteProvider, useReasoning }
    case "ollama":
      return { provider: this.localProvider, useReasoning }
    default:
      return { provider: null, useReasoning: false }
  }
}
```

#### 2.3 修改现有方法

```typescript
async analyzeContent(
  content: string,
  options?: AnalyzeOptions,
  taskType: AITaskType = "pageAnalysis"  // 新增参数
): Promise<UnifiedAnalysisResult> {
  const { provider, useReasoning } = await this.getProviderForTask(taskType)
  
  if (provider) {
    try {
      const result = await provider.analyzeContent(content, {
        ...options,
        useReasoning  // 应用推理配置
      })
      this.recordUsage(result)
      return result
    } catch (error) {
      aiLogger.error(` Provider failed, using fallback`)
    }
  }
  
  return await this.fallbackProvider.analyzeContent(content, options)
}
```

### 3. 更新调用方

#### 3.1 页面分析 (content-script)

```typescript
// src/contents/page-tracker.ts
const analysis = await aiManager.analyzeContent(
  pageContent,
  { url: location.href },
  "pageAnalysis"  // 指定任务类型
)
```

#### 3.2 Feed 分析 (background)

```typescript
// src/core/rss/FeedManager.ts
const analysis = await aiManager.analyzeContent(
  article.content,
  { url: article.link },
  "feedAnalysis"  // 指定任务类型
)
```

#### 3.3 用户画像生成

```typescript
// src/core/profile/SemanticProfileBuilder.ts
// generateUserProfile() 已经是独立方法，只需确保使用 profileGeneration 配置
```

## 测试计划

### 单元测试

- [ ] `getProviderForTask()` 正确路由到配置的引擎
- [ ] `useReasoning` 参数正确传递
- [ ] 降级逻辑正常工作

### 集成测试

- [ ] 页面浏览使用 pageAnalysis 配置
- [ ] RSS 分析使用 feedAnalysis 配置
- [ ] 用户画像使用 profileGeneration 配置

### 浏览器测试

- [ ] 修改引擎分配配置后，实际使用的引擎发生变化
- [ ] 推理开关实际影响 API 调用
- [ ] 日志显示正确的引擎和推理状态

## 注意事项

1. **向后兼容**：如果 engineAssignment 为空，降级到旧的 provider 选择逻辑
2. **错误处理**：引擎失败时自动降级到 fallback
3. **性能影响**：高频任务启用推理会显著增加延迟，需要在 UI 中警告
4. **成本追踪**：记录每个任务类型的 token 使用和成本

## 完成标准

- [ ] 所有单元测试通过
- [ ] 集成测试覆盖三种任务类型
- [ ] 浏览器测试验证配置生效
- [ ] 文档更新（API 文档、用户指南）
