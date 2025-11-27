# Ollama Provider 集成方案

> 目标：在 Phase 10 中让 Silent Feed 正式支持本地 Ollama 推理，并与现有 AI 抽象层兼容。

## 1. 设计目标

1. **隐私优先**：在不上传内容至云端的前提下完成主题分析、推荐理由、画像生成。  
2. **零配置成本**：默认连接 `http://localhost:11434`，仅需选择模型名称；支持自定义端口/令牌。  
3. **热切换**：根据 `RecommendationConfig.analysisEngine` 在远程/本地/关键词之间切换，无需重启扩展。  
4. **可观测**：统计本地调用次数、平均耗时，与远程成本指标并存。  
5. **易扩展**：未来复用相同接口接入 Chrome AI、本地 Llama.cpp 等实现。

## 2. Ollama API 概览

- **健康检查**：`GET /api/tags` 可列出本地已下载模型，用于 `isAvailable()`。  
- **聊天接口**：`POST /api/chat`，请求体示例：

```jsonc
{
  "model": "qwen2.5:7b",
  "messages": [
    {"role": "system", "content": "你是 Silent Feed 的分析助手"},
    {"role": "user", "content": "请用 JSON 格式返回文章主题与概率..."}
  ],
  "format": {
    "type": "json_schema",
    "json_schema": {
      "name": "analysis_result",
      "schema": {"type": "object", "properties": {"topics": {"type": "object"}}}
    }
  },
  "stream": false,
  "options": {
    "temperature": 0.2,
    "num_ctx": 4096,
    "top_p": 0.9
  }
}
```

- **响应结构**：

```jsonc
{
  "model": "qwen2.5:7b",
  "message": {
    "role": "assistant",
    "content": "{\"topics\":{\"技术\":0.72}}"
  },
  "total_duration": 212345678,
  "eval_count": 512
}
```

> 说明：`/api/generate` 也可用，但 `/api/chat` 与现有 Chat-completion 抽象更匹配，且支持 JSON Schema。

## 3. 架构改造

### 3.1 配置层（`src/storage/ai-config.ts`）
- 新增 `AIProviderType = "openai" | "deepseek" | "ollama"`。  
- 扩展 `AIConfig`：
  - `local?: { provider: "ollama"; endpoint?: string; model: string; temperature?: number; maxTokens?: number }`.  
  - `apiKeys.ollama` 可选（预留未来本地鉴权），`validateApiKey` 对 `ollama` 仅做非空校验。  
- `saveAIConfig/getAIConfig` 序列化 `local` 字段，默认 `endpoint = http://localhost:11434`、`model = "qwen2.5:7b"`。  
- i18n：新增「本地 AI」说明、模型输入框、连接测试按钮。

### 3.2 Provider 实现（`src/core/ai/providers/OllamaProvider.ts`）
- 继承 `AIProvider` 接口，但 **不** 复用 `BaseAIService`，而是抽象 `BaseLocalAIService`：
  - 去除 `apiKey` 假设，允许空 Authorization。  
  - 默认超时 30s，可自定义。  
  - 统一的提示词模板仍可复用（导入 `createDefaultPromptTemplates`），保持分析/画像文案一致。  
- `analyzeContent`：
  - 构建 system/user 消息，将 `AnalyzeOptions.userProfile` 注入提示词。  
  - 解析 `response.message.content`，容错多余文本。  
  - `metadata` 中记录 `provider: "ollama"`, `model`, `tokensUsed` (可由 `eval_count` 推算)、`latency`.  
- `generateUserProfile` / `generateRecommendationReason` 复用相同接口。  
- `isAvailable`：缓存上次健康检查 30s，失败时返回 false 并带上 error message（供 UI 提示）。

### 3.3 能力管理器（`src/core/ai/AICapabilityManager.ts`）
- `initialize()`：
  - 根据 `AIConfig.provider` 或新的 `preferredProvider` 字段加载 provider；
  - 若 `analysisEngine === 'localAI'`，优先实例化 `OllamaProvider`，远程 Provider 作为二级回退。  
- `analyzeContent()` / `generateUserProfile()` 接受可选参数 `{ engine?: 'remote' | 'local' }`，以便推荐管道显式指定。  
- `testConnection()` 根据当前 engine 触发对应健康检查。  
- `recordUsage()` 在本地模式下记录 `latency` 而非成本。

### 3.4 推荐管道（`src/core/recommender/pipeline.ts` & `RecommendationService.ts`）
- 将 `RecommendationConfig` 扩展为：
  ```ts
  interface RecommendationConfig {
    analysisEngine?: RecommendationAnalysisEngine
    useReasoning?: boolean
    useLocalAI?: boolean // 向后兼容
  }
  ```
- `RecommendationService`：
  - 依据 `analysisEngine` 计算 `analysisMode`，传入管道；  
  - 当 `localAI` 被选择但 `checkLocalAIStatus` 返回不可用时，写入错误并提示 UI。  
- `RecommendationPipelineImpl.analyzeSingleArticle`：
  - 通过 `aiManager.analyzeContent(content, { ...options, mode })` 调用相应 Provider。  
  - 本地模式下调整 `batchSize`（默认 3）与 `qualityThreshold`（可更高）。

### 3.5 UI & 用户流程
- **AIConfig 面板**（`src/components/settings/AIConfig.tsx`）：
  - 新增「本地 AI」卡片：选择 `Ollama`、输入模型名称、点击「拉取模型列表」。  
  - `handleTest` 支持测试本地连接，展示模型列表。  
- **AnalysisSettings**：
  - 当用户选择 `localAI` 时，如果 `AIConfig.local` 未配置，提示「请先在上方配置本地 AI」。  
  - 显示当前激活的本地模型名称。

### 3.6 数据与权限
- `manifest.json` 需加入 `host_permissions: ["http://localhost:11434/*"]`。  
- Dexie 统计表新增 `localAIUsage`（调用次数、平均耗时），供统计卡片展示。

### 3.7 测试策略
- Provider 层：使用 `msw` 或 `whatwg-fetch` mock `http://localhost:11434/api/chat`，验证请求体与 JSON 解析。  
- AICapabilityManager：模拟 `AIConfig.provider = 'ollama'`，确保降级/回退逻辑正确。  
- UI：RTL 测试中 mock `checkLocalAI()` 返回成功，验证「保存后触发测试」流程。

## 4. 实施步骤

1. **配置扩展**：更新 `AIProviderType`、`AIConfig`、i18n 文案，确保 UI 能保存本地字段。  
2. **Provider/基类**：引入 `BaseLocalAIService`（或在 `BaseAIService` 中拆分 HTTP 层），实现 `OllamaProvider`。  
3. **调度改造**：
   - `aiManager` 支持本地 provider；
   - 推荐管道传递 `analysisEngine`。  
4. **UI 联动**：AIConfig + AnalysisSettings + Onboarding 引导更新。  
5. **Manifest & 权限**：新增 localhost 权限，更新 `docs/HOW_TO_LOAD_EXTENSION.md`。  
6. **测试与验证**：运行 `npm run test:coverage`、手动在本地 Ollama 上 smoke test。  
7. **文档同步**：在 `PHASE_10_LOCAL_AI_ASSESSMENT.md` 中勾选完成项，并更新 `PHASE_10_AI_FIRST_OPTIMIZATION.md` 的 AI First 章节。

## 5. 风险缓解

| 风险 | 对策 |
| --- | --- |
| Ollama 未运行 | `isAvailable` + 设置页实时检测，推荐页弹出 toast 提示。 |
| 模型体积大/响应慢 | 默认把 `maxTokens` 控制在 512，允许用户自定义；必要时并发=1。 |
| 端口冲突或权限不足 | 允许自定义 endpoint，错误信息透传到 UI。 |
| JSON 解析失败 | 包装解析逻辑，失败时回退到关键字 Provider，并在日志中打印原始内容。 |
| Chrome 审核 | Manifest 说明访问 localhost 的用途，并可通过权限提示提醒用户。 |

---

此方案完成后，Silent Feed 将具备「远程 AI / 本地 Ollama / 关键词」三层能力，可实现在离线环境下的推荐与画像构建。