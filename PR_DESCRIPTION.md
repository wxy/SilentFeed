# SilentFeed 0.3.1 发布准备 / 测试与类型修复

## 变更摘要
- 修复多处测试类型错误，稳定测试套件
- Dexie 事务模拟兼容 PromiseExtended 的 `timeout` 要求
- recommendation-config 测试迁移到新的 `AIConfig.providers` 结构并补齐 `local`/`engineAssignment`
- 提升与验证覆盖率（函数覆盖率 ≥ 70%）
- 版本号升级到 `0.3.1`

## 详细修改
- `src/core/recommender/RecommendationService.test.ts`
  - 补齐 `UserProfile` 必需字段：`totalPages`、`lastUpdated`、`version`
  - 替换不合法的 `topicDistribution` 为完整 `topics`（包含所有枚举键）
  - 事务模拟返回对象包含 `timeout` 方法
- `src/storage/recommendation-config.test.ts`
  - `getAIConfig` 的 mock 均补齐 `local` 与 `engineAssignment`
- `src/core/ai/providers/OllamaProvider.ts`
  - OpenAI 兼容响应路径安全访问 `finish_reason`
- 新增：`src/storage/db/db-unrecommended-count.test.ts`
  - 覆盖订阅源与所有源的统计逻辑、异常分支、池内/分析排除规则

## 质量检查
- `npm run pre-push` 全部通过：
  - 测试套件：92 文件，1487 通过 | 1 跳过
  - 覆盖率：函数覆盖率 ≥ 70%，行覆盖率 ~73%
  - 生产构建：Plasmo 构建成功，DNR 配置注入完成

## 发布说明
- 版本号：`0.3.1`
- 重点：测试稳定性与类型一致性修复；AI 配置测试与 Provider 行为兼容性增强；小幅提升覆盖率
- 风险：低（主要为测试与类型修复；功能行为保持一致）

## 请求合并
请审阅并合并至 `master`，合并后将打标签 `v0.3.1` 并发布。
# feat: AI 摘要最小集成（基于现有分析链路）

## 背景与目标
- 目标：在推荐流程中生成高质量短摘要，覆盖/替换 RSS 自带摘要，提升信息密度与可读性。
- 原则：最小侵入、不改架构、可快速上线、可回退。

## 变更范围
- 提示模板：在 `analyzeContent` 中新增 `summary` 输出（<=80 字/words，客观中性）
  - `src/core/ai/prompts/templates/zh-CN.json`
  - `src/core/ai/prompts/templates/en.json`
- 解析链路：
  - `BaseAIService.analyzeContent` 解析可选 `summary`
  - `pipeline` 将 `analysis.summary` 写入 `aiAnalysis.summary`
  - `RecommendationService` 优先使用 AI 摘要写入 `Recommendation.summary`
- 截断调整：
  - `BaseAIService.preprocessContent` 默认上限 3000 → 2950，避免提示超长
- 测试补充：
  - `OpenAIProvider.test.ts`：校验 `summary` 解析
  - `pipeline.test.ts`：校验 `aiAnalysis.summary` 透传
- 文档：`docs/PHASE_8_AI_SUMMARY.md`

## 风险与回滚
- 内容格式：模型偶发返回带 Markdown 包裹或无效 JSON，基类已做剥离与异常捕获。
- 回滚方案：删除模板中的 `summary` 字段要求即可停用该能力，其他链路均为可选字段不影响旧路径。

## 验证步骤
1. `npm run test:run` 应全部通过
2. `npm run pre-push` 应全部通过（含覆盖率与构建）
3. 真实环境中运行推荐流程，观察推荐卡片摘要：应为更短更客观的 AI 摘要

## 备注
- 本次未新增独立 `SummaryService`，以降低改动面与上线风险；后续若需要独立缓存与多语言分发，可在此基础上演进。