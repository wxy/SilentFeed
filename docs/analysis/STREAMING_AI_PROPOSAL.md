# AI 流式输出（Streaming）方案分析

> 日期：2026-01-04
> 状态：提案（Proposal）

## 背景

低频任务（如 Feed 初筛、策略决策、画像生成）具有以下特点：
- 输入输出较大（可能达到数万 tokens）
- 执行时间长（可能需要 2-5 分钟）
- 对超时敏感

当前实现使用非流式 API 调用，可能遇到：
1. 客户端超时（`AbortSignal.timeout()`）
2. 服务器端超时
3. 网络层超时（代理、负载均衡器等）

## Service Worker 生命周期分析

### Chrome MV3 Service Worker 限制

| 场景 | 时间限制 | 影响 |
|------|---------|------|
| 空闲超时 | 30秒无活动 | ✅ API 调用期间保持活跃 |
| 单次执行 | 5分钟上限 | ⚠️ 超长任务可能被终止 |
| **活跃 fetch** | **无限制** | ✅ 流式连接保持活跃 |

**结论**：只要 `fetch` 请求在进行中（流式或非流式），Service Worker 会保持活跃。流式输出的主要优势是**保持连接活跃，防止各层超时**。

## 流式输出方案

### 支持情况

| Provider | 流式支持 | 文档 |
|----------|---------|------|
| DeepSeek | ✅ `stream: true` | SSE 格式 |
| OpenAI | ✅ `stream: true` | SSE 格式 |
| Ollama | ✅ `stream: true` | SSE 格式 |

### SSE 响应格式

```
data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":" World"}}]}

data: {"id":"chatcmpl-xxx","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}

data: [DONE]
```

### 实现方案

#### 方案 A：渐进式实现（推荐）

仅为**低频任务**启用流式输出，高频任务保持现有实现。

```typescript
// BaseAIService.ts 新增方法
protected async callChatAPIStreaming(
  prompt: string,
  options?: {
    maxTokens?: number
    timeout?: number
    jsonMode?: boolean
    useReasoning?: boolean
    onProgress?: (chunk: string) => void  // 可选的进度回调
  }
): Promise<{
  content: string
  tokensUsed: { input: number; output: number }
  model?: string
}>
```

**实现要点**：

```typescript
async callChatAPIStreaming(prompt, options) {
  const response = await fetch(this.endpoint, {
    method: "POST",
    headers: { ... },
    body: JSON.stringify({
      ...request,
      stream: true,
      stream_options: { include_usage: true }  // 请求返回 usage
    }),
    // 流式不需要严格超时，使用更长的超时或不设超时
    signal: options?.timeout 
      ? AbortSignal.timeout(options.timeout)
      : undefined
  })

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let usage = { input: 0, output: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6)  // 移除 "data: "
      if (data === '[DONE]') continue

      const parsed = JSON.parse(data)
      const delta = parsed.choices?.[0]?.delta?.content || ''
      fullContent += delta

      // 进度回调
      options?.onProgress?.(delta)

      // 最后一个 chunk 包含 usage
      if (parsed.usage) {
        usage = {
          input: parsed.usage.prompt_tokens,
          output: parsed.usage.completion_tokens
        }
      }
    }
  }

  return { content: fullContent, tokensUsed: usage, model: this.model }
}
```

#### 方案 B：统一流式（复杂）

所有 API 调用都使用流式，在内部处理。优点是代码统一，缺点是改动大。

### 应用场景

| 方法 | 使用流式 | 原因 |
|------|---------|------|
| `analyzeContent()` | ❌ | 高频调用，响应快 |
| `screenFeedArticles()` | ✅ | 低频，输入大，时间长 |
| `decidePoolStrategy()` | ✅ | 低频，输入大 |
| `generateUserProfile()` | ✅ | 低频，输入大 |
| `analyzeSource()` | ✅ | 低频 |

## 实现步骤

### Phase 1：基础设施（1-2小时）

1. 在 `BaseAIService` 添加 `callChatAPIStreaming()` 抽象方法
2. 在 `DeepSeekProvider` 实现流式调用
3. 添加单元测试（mock SSE 响应）

### Phase 2：低频任务迁移（2-3小时）

1. `screenFeedArticles()` 使用流式
2. `decidePoolStrategy()` 使用流式
3. `generateUserProfile()` 使用流式
4. 集成测试

### Phase 3：可选优化

1. 添加进度回调支持
2. 在 Popup 显示 AI 思考进度
3. 支持取消正在进行的请求

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| SSE 解析错误 | 健壮的解析器 + 错误恢复 |
| 部分响应（连接中断） | 检测不完整 JSON，触发重试 |
| token 用量不准确 | 使用 `stream_options: { include_usage: true }` |
| 推理模型特殊处理 | 单独处理 `reasoning_content` |

## 决策建议

**推荐方案 A（渐进式实现）**，原因：

1. 低风险：仅影响低频任务
2. 高收益：解决超时问题
3. 可测试：可以逐个方法迁移和验证
4. 可回滚：出问题可以快速切回非流式

## 下一步

- [ ] 确认是否采纳此方案
- [ ] 确定实现优先级
- [ ] 在 DeepSeekProvider 实现 POC
