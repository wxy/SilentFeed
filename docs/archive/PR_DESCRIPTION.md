# 引入币种感知的 AI 计费架构

## 变更概述
- 新增 `CostCalculator` 与工厂，统一计费抽象：DeepSeek(CNY)、OpenAI(USD)、Ollama(FREE)
- Provider 增加 `getCurrency` 并改造成本计算与记录链路
- `AIUsageTracker` 新增 `getTotalCostByCurrency`（保留旧接口但不再用于聚合）
- `BudgetChecker` 改为按币种合计月度成本，计算合并 USD 并提供安全回退逻辑
- 测试全面更新以匹配新架构，不兼容旧的混币聚合期望
- 新增架构文档 `docs/AI_COST_ARCHITECTURE.md`

## 风险与影响
- 移除混币聚合总计会影响旧的报表展示，需要 UI 按币种显示（后续PR）
- 预算与降级逻辑以每币种为准，合并 USD 仅用于概览，不用于决策

## 测试与构建
- 测试：102 文件通过，1694 用例通过，1 跳过
- 覆盖率：行 74.47%，函数 76.02%，分支 63.36%（达标）
- 构建：`npm run build` 成功，产物已生成

## 验收建议
- 重点验证 BudgetOverview 与 RecommendationStats 的预算显示是否符合每币种策略
- 审查 DeepSeek 与 OpenAI 的成本模型，确保与官方文档一致

## 后续工作（建议）
- UI 组件按币种显示统计与符号
- CSV 导出按币种列对齐
- 逐步废弃旧的全局预算警告入口，统一入口到每 provider 状态
