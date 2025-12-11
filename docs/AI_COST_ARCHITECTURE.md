# SilentFeed AI 计费与预算架构（Phase 12）

## 概览

- 目标：精确、可扩展地追踪 AI 调用的 Token 与费用，支持多 Provider、多货币（CNY/ USD/ FREE），并为预算控制与统计提供统一数据源。
- 组成：Provider 层、BaseAIService、CostCalculator 抽象层、AIUsageTracker 持久化、预算检查（全局与 Provider 级别）、UI 展示。

## 模块与数据流

1. Provider 层（`src/core/ai/providers/*`）
   - DeepSeek：从 API `usage.prompt_cache_hit_tokens / miss_tokens` 读取缓存命中，货币 CNY。
   - OpenAI：从 API `usage.prompt_tokens_details.cached_tokens` 读取缓存命中，货币 USD。
   - Ollama：本地模型，费用恒为 0，货币 FREE。
   - 每个 Provider 实现 `getCurrency()`，用于记录费用的货币类型。

2. 基类（`src/core/ai/BaseAIService.ts`）
   - 统一调用流程：预处理 → 调用 API → 解析 → 费用计算 → 记录用量。
   - 成本计算：调用 `calculateCostBreakdown(inputTokens, outputTokens)`，随后通过 `getCurrency()` 将 `currency` 一并传入 `AIUsageTracker.recordUsage`。
   - 修复要点：所有 `recordUsage` 现已包含 `currency` 字段，避免统计混淆。

3. 计费抽象层（`src/core/ai/CostCalculator.ts`）
   - 接口：`ICostCalculator`，统一 `calculateCost(TokenUsage, modelId?) => CostBreakdown`。
   - 基类：`BaseCostCalculator` 提供通用逻辑，返回 `{ input, output, total, currency }`。
   - 实现：
     - `DeepSeekCostCalculator`（CNY）：支持缓存命中/未命中定价。
     - `OpenAICostCalculator`（USD）：支持缓存命中定价。
     - `OllamaCostCalculator`（FREE）：始终为 0。
   - 工厂：`CostCalculatorFactory.getCalculator(providerName)` 统一获取计算器。

4. 用量追踪（`src/core/ai/AIUsageTracker.ts`）
   - `recordUsage`：写入 IndexedDB，记录 tokens + cost（含 `currency`）。
   - `getStats(query)`：输出聚合统计：
     - `byCurrency`: CNY/ USD/ FREE 分组费用总计。
     - `byProvider`: 每 Provider 的调用数、tokens、费用（携带 `currency` 与 `isLocal`）。
     - `cost`: 总费用（仅对非 FREE 汇总，但目前跨货币直接相加，见下文“已知问题”）。
   - `getTotalCost`：返回 `stats.cost.total`（跨货币汇总，建议仅在单一货币场景使用）。

5. 预算检查
   - 全局（旧版）：`src/core/ai/BudgetChecker.ts`
     - 使用 `getCurrentMonthCost()`（跨货币相加）并以固定汇率换算到 USD，存在混币误差。
     - 提供 `shouldDowngrade()` 作为全局快速降级依据（可能过于保守）。
   - Provider 级别（新版）：`src/utils/budget-utils.ts`
     - 按 Provider 原生货币读取 `stats.byCurrency[currency].total`，不做货币转换。
     - `canMakeAICall(provider, estimatedCost)` 返回是否允许调用与预算状态。
     - `shouldDowngradeToKeyword(provider)` 当使用率 ≥80% 时建议降级。
   - AICapabilityManager：
     - 先调用旧的 `BudgetChecker.shouldDowngrade()` 做全局拦截（保守），再按 Provider 级别执行 `checkProviderBudget()` 做精确判断。

6. UI 展示（`src/components/settings/CollectionStats.tsx`）
   - 当前使用 `aiUsageStats.cost.*` 并以 `¥` 展示，未区分货币。
   - 建议改为按 `byCurrency` 展示分块统计；或按 Provider 分组展示并带单位符号（`¥`/`$`）。

## 已修复的问题

- 记录用量缺失 `currency` 字段：
  - 修复：在 `BaseAIService` 的所有 `recordUsage` 调用中添加 `currency: this.getCurrency()`。
  - Provider 实现 `getCurrency()`：DeepSeek→CNY，OpenAI→USD，Ollama→FREE。
- 推荐理由成本硬编码为 DeepSeek：
  - 修复：`AICapabilityManager.recordRecommendationUsage` 改为使用 `CostCalculatorFactory` 按实际 Provider 计算，记录正确货币。

## 已知问题与改进建议

1. `AIUsageTracker.getTotalCost()` 与 `BudgetChecker.getBudgetStatus()` 的跨货币汇总问题：
   - 问题：`stats.cost.total` 会将 CNY 与 USD 相加；旧的 `BudgetChecker` 再用固定汇率换算，存在偏差。
   - 建议：
     - a) 标注 `getTotalCost` 为“仅单一货币场景使用”。
     - b) 将全局预算检查迁移到按 Provider 级别策略（即只使用 `budget-utils.ts`）。
     - c) 或新增 `getTotalCostByCurrency(currency)`，供 UI 精确展示。

2. UI 展示硬编码 `¥`：
   - 问题：OpenAI（USD）与 DeepSeek（CNY）混用时，UI 金额单位不正确。
   - 建议：
     - a) 使用 `aiUsageStats.byCurrency` 展示分栏卡片：USD、CNY、FREE。
     - b) 或在 `byProvider` 展示中增加货币符号标识。

3. API 缓存字段差异：
   - DeepSeek：`usage.prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。
   - OpenAI：`usage.prompt_tokens_details.cached_tokens`。
   - 已在 Provider 层分别提取并传给 CostCalculator；建议在未来统一 `TokenUsage.cachedInput` 的来源处理函数，进一步简化 Provider 代码。

## 合规性与来源

- DeepSeek 定价：`https://api-docs.deepseek.com/zh-cn/quick_start/pricing`
- OpenAI 定价：`https://openai.com/api/pricing/`
- OpenAI 用量字段：`usage.prompt_tokens_details.cached_tokens`

## 测试与验证

- 单元测试：`src/core/ai/CostCalculator.test.ts`（16 用例），覆盖 DeepSeek/ OpenAI/ Ollama 的成本计算与缓存计费。
- 集成测试：Provider 层测试与 AICapabilityManager 流程测试，当前总计 1695 tests 通过。
- 构建验证：`npm run build` 成功。

## 迁移计划（建议）

- Phase 12.5：
  - 替换全局预算检查：将 `BudgetChecker.shouldDowngrade()` 改为调用 `getAllProvidersBudgetStatus()`，按 Provider 状态综合判定（不做跨币相加）。
  - UI：更新 `CollectionStats` 使用 `byCurrency` 与 `byProvider.currency` 展示单位与金额。
- Phase 12.6：
  - 新增 `AIUsageTracker.getTotalCostByCurrency(currency)`，用于精确查询某一货币总额。
  - 提供导出接口：输出每 Provider 的月度用量（tokens、费用、调用数）。

---

如需我直接实现上述 UI 与全局预算的改动，请确认，我可以在当前分支继续补齐并提交对应测试。
