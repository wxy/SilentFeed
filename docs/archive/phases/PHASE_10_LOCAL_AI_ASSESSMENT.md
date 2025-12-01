# Phase 10 - 本地 AI 架构评估

> 日期：2025-11-27  
> 任务：梳理现有 AI 抽象层，识别引入 Ollama Provider 的阻碍点

## 1. 当前架构全景

- **配置来源（`src/storage/ai-config.ts`）**  
  - 通过 `chrome.storage.sync` 读取配置，仅支持 `openai | deepseek` 两种 `AIProviderType`。  
  - `AIConfig` 记录 `model`, `apiKeys`, `monthlyBudget`, `enableReasoning` 等远程服务参数，本地 AI 未被建模。  
  - `validateApiKey` / `getProviderDisplayName` 仍残留 `anthropic` 分支，类型定义与实现不一致。

- **能力调度层（`src/core/ai/AICapabilityManager.ts`）**  
  - `initialize` 根据 `AIProviderType` 仅创建 `DeepSeekProvider` 或 `OpenAIProvider`，失败时降级为 `FallbackKeywordProvider`。  
  - `generateUserProfile`、`generateRecommendationReason` 等方法都直接依赖主 Provider，没有入口注入本地实现。  
  - `recordUsage` 只理解远程 Provider 的 token / cost 数据结构。

- **Provider 抽象（`src/core/ai/BaseAIService.ts` 与 `providers/*`）**  
  - 继承体系默认执行 Chat Completion API：必需 `apiKey`、远程 `fetch`、JSON Mode。  
  - `callChatAPI` 的调用语义假设服务暴露 OpenAI 兼容接口，本地推理（Ollama、Chrome AI）无法复用该抽象。  
  - 成本计算、速率控制、错误文案全部围绕云端计费模型。

- **推荐流水线（`src/core/recommender/RecommendationService.ts` + `pipeline.ts`）**  
  - `RecommendationConfig.analysisEngine` 支持 `remoteAI|remoteAIWithReasoning|localAI|keyword`，但仅在 `RecommendationService` 中将 `analysisEngine === 'localAI'` 映射为 `useLocalAI` 布尔值。  
  - `RecommendationPipelineImpl`、`AIStrategyExecutorImpl` 从未读取 `useLocalAI`，最终依旧通过 `aiManager` 调用远程 Provider，导致「本地 AI 模式」在 UI 里是摆设。  
  - `config.useLocalAI` 也没有被持久化到 DB，推荐流程无法根据用户选择切换策略。

- **能力检测与 UI（`src/utils/analysis-engine-capability.ts`, `src/components/settings/AIConfig.tsx`, `src/components/settings/AnalysisSettings.tsx`）**  
  - `checkLocalAI` 通过 `window.ai` 与 `http://localhost:11434/api/tags` 粗略探测 Chrome AI / Ollama，但探测结果只在设置界面展示，没有进入配置存储。  
  - `AIConfig` 组件的 `localAIChoice` 状态不会写回 `AIConfig`，也无法驱动 `aiManager`。  
  - `AnalysisSettings` 允许用户选中「本地 AI」，然而不存在实际生效路径，体验与预期严重偏差。

## 2. 关键缺口（阻碍本地 Provider 落地）

1. **Provider 类型缺失**  
   - `AIProviderType` 只包含远程枚举，`aiManager.createProvider` 没有本地分支；即使新增 Provider 文件，也无法被实例化。  
   - 配置层没有 `local` 的 API（例如自定义端口、默认模型、timeout），导致无法保存用户选择。

2. **`useLocalAI` 信号未被消费**  
   - `RecommendationService`、`pipeline.ts`、`AIStrategyExecutor` 均忽略 `config.useLocalAI`。  
   - 即便后续加入 Provider，如果调度层不按引擎类型切换，实际请求仍会命中远程服务。

3. **抽象层假设远程能力**  
   - `BaseAIService` 强制 `apiKey`、`Authorization` header，Ollama/Chrome AI 无此需求。  
   - `isAvailable()` 默认依赖 `navigator.onLine` 与 API Key 校验，本地守护进程（localhost:11434）需要新的健康检查逻辑。  
   - 成本统计、token 记录、推理模式参数等都与本地引擎不匹配，需要独立的数据结构或跳过。

4. **配置与 UI 不一致**  
   - `AIConfig` UI 的 `localAIChoice` 当前只是前端状态，没有序列化字段，刷新页面即丢失。  
   - `checkLocalAIStatus()` 只返回探测结果，无法告诉推荐流程「应该优先用哪种本地服务」。

5. **降级策略缺席**  
   - `AICapabilityManager` 目前只有「远程 → 关键字」两级降级路径；当用户指明「只用本地 AI」时，如果本地服务不可用，应能回退到关键字或提示用户修复。  
   - 需要明确「本地模式」的首选顺序（例如 Ollama → Chrome AI → Keyword）。

6. **测试覆盖空白**  
   - `providers/*.test.ts` 均针对远程服务；本地 Provider 需要模拟本地 HTTP/Chrome API。  
   - `AnalysisSettings.test.tsx` 虽包含 “Local AI” 文案，但缺乏「选择后触发配置更新」的集成测试。

## 3. 引入 Ollama Provider 的必要工作

| 维度 | 说明 | 受影响文件 |
| --- | --- | --- |
| Provider 类型 & 配置 | 将 `AIProviderType` 拓展为 `"openai" | "deepseek" | "ollama"`，新增 `localAI` 配置块（模型、endpoint、超时、并发）。 | `src/storage/ai-config.ts`, `public/locales/*`, 设置 UI |
| Provider 实现 | 新建 `src/core/ai/providers/OllamaProvider.ts`，绕过 `BaseAIService` 或提炼 `LocalAIService` 以支持 `POST http://localhost:11434/api/chat` / `/api/generate`，并处理流式响应。 | `src/core/ai/providers/*`, `src/core/ai/AICapabilityManager.ts` |
| 调度策略 | `aiManager.initialize()` 根据 `analysisEngine` 与 `AIConfig.local` 选择主 Provider；若本地不可用需回退远程或关键词。 | `src/core/ai/AICapabilityManager.ts`, `src/core/recommender/RecommendationService.ts` |
| 推荐管道 | 在 `RecommendationPipelineImpl` / `AIStrategyExecutorImpl` 中消费 `config.useLocalAI`，调用本地 Provider 时跳过远程预算/推理逻辑，并收敛日志格式。 | `src/core/recommender/pipeline.ts`, `src/core/recommender/ai-strategy-executor.ts`, `src/types/recommendation.ts` |
| 健康检查 | 复用 `checkLocalAIStatus()` 的 Ollama 探测逻辑到 Provider `isAvailable()`，并加入缓存，避免每次分析都触发网络请求。 | `src/storage/recommendation-config.ts`, `src/utils/analysis-engine-capability.ts` |
| UI/存储联动 | `AIConfig` 中新增「本地 AI」设置（模型、并发、是否替代远程），保存后触发 `aiManager` 重新初始化。Options 页面需解释如何安装/选择默认模型。 | `src/components/settings/AIConfig.tsx`, `src/components/settings/AnalysisSettings.tsx` |
| 测试 | 为 Provider/调度/UI 补充 Vitest/RTL 测试，模拟 `fetch('http://localhost:11434/...')` 返回。 | `src/core/ai/providers/OllamaProvider.test.ts`, 相关组件测试 |

## 4. 风险与建议

1. **服务可用性**：Ollama 运行状态不可控，需设计快速超时（3s）与友好提示，避免推荐流程长时间阻塞。
2. **内容大小**：Ollama 默认模型上下文较小，需在 `BaseAIService` 同级的本地实现里增加内容裁剪与分片策略。
3. **安全限制**：Chrome 扩展访问 `http://localhost:11434` 需要在 `manifest` 权限中加入 `http://localhost:11434/*`，需确认 MV3 CSP。 
4. **多引擎优先级**：当用户同时配置远程与本地 AI 时，需要一个清晰的策略（如设置页“首选远程/本地”单选），否则难以解释实际行为。
5. **监控指标**：`getAIAnalysisStats()` 目前关注 USD/CNY 成本，本地模式应记录调用次数、平均延迟等，提升可观测性。

## 5. 下一步

1. **完成配置层扩展**：定义 `LocalAIConfig`（模型、endpoint、可选 API Key）并更新 `saveAIConfig / getAIConfig`、i18n 文案。  
2. **实现 `OllamaProvider`**：独立的 provider（可参考 `FallbackKeywordProvider` 的轻量实现），负责：  
   - `POST /api/chat`（或 `/api/generate`）调用、错误解析、流式结果拼接；  
   - `isAvailable` 内置健康检查（`GET /api/tags`）。  
3. **接入调度链路**：  
   - `RecommendationService` 根据 `analysisEngine` 或新配置显式选择 `ollama`;  
   - `RecommendationPipelineImpl.analyzeSingleArticle` 根据 `useLocalAI` 路由到本地 provider。  
4. **UI/UX 调整**：在 `AIConfig` 中允许选择默认本地模型、端口，并保存 `localAIChoice`；在 `AnalysisSettings` 中提示「当前使用的本地模型」。  
5. **测试矩阵**：编写 Provider 单测（Mock Ollama HTTP）、调度层集成测试（选择 localAI 后不触发远程 fetch）、设置界面交互测试。  
6. **文档同步**：在 `docs/PHASE_10_AI_FIRST_OPTIMIZATION.md` 中同步「关键字模式改为内部降级 + 本地 Provider 接入」的实施进度。
