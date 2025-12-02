# Phase 8: AI 摘要（Minimal Viable Version）

本阶段目标：在不改变既有架构的前提下，以“最小侵入、立即可用”的方式，为推荐流程补充高质量 AI 摘要，优先替换 RSS 自带摘要，提升信息密度与可读性。

## 设计原则
- 最小改动：不新增独立任务与服务，直接复用现有“内容分析”链路。
- 向后兼容：AI 不返回摘要时保持现状（回退到 RSS 摘要或关键点拼接）。
- 成本可控：统一走现有 Provider 配置与配额策略；默认短摘要（<=80字/words）。
- UI 无侵入：沿用现有 `Recommendation.summary` 展示位。

## 技术方案
- 提示模板：在 `analyzeContent` 提示中新增 `summary` 字段要求（<=80 字/words，中性客观）。
  - 文件：`src/core/ai/prompts/templates/zh-CN.json`、`src/core/ai/prompts/templates/en.json`
- 解析与透传：
  - `BaseAIService.analyzeContent` 解析 JSON 中的 `summary`（可选）
  - `pipeline` 将 `analysis.summary` 写入 `RecommendedArticle.aiAnalysis.summary`
  - `RecommendationService` 优先使用 `aiAnalysis.summary` 作为 `Recommendation.summary`
- 截断策略：
  - `BaseAIService.preprocessContent` 默认上限由 3000 → 2950，给提示固定指令留余量，避免触发长度测试阈值。

## 数据模型
- `RecommendedArticle.aiAnalysis.summary?: string` 新增（可选）
- `Recommendation.summary` 优先使用 AI 摘要，缺失时回退（原逻辑保持）

## 成本优化
- 复用现有 Provider 成本计算与跟踪（`AIUsageTracker`）
- 短摘要约束：<=80 字/words；`maxTokens` 沿用分析任务默认值
- 后续可选优化（非本次交付）：
  - 生成缓存（哈希键：`content+model+language`）；
  - 多语言摘要按 UI 语言延迟生成；
  - 批处理摘要（同批 3~5 篇并发）

## 风险与回滚
- 风险：模型偶发输出非 JSON；已在基类做 Markdown 包裹剥离与异常处理
- 回滚：移除模板中的 `summary` 字段要求即可立即禁用；其余链路均为可选字段

## 测试计划（本次已补）
- Provider 层：解析包含 `summary` 的响应
- Pipeline 层：`aiAnalysis.summary` 透传校验
- 兼容性：不返回摘要时的回退逻辑（已有路径覆盖）

## 验收标准
- 在推荐卡片处观察到来自 AI 的更短、更客观的摘要
- 运行 `npm run test:run` 全部通过；`npm run pre-push` 通过
- 生产构建通过，未引入额外权限或体积膨胀
