# SilentFeed v0.3.1 发布说明

本版本聚焦于测试稳定性与类型一致性修复，并保持现有功能行为不变。

## 亮点
- 全量测试稳定通过（92 文件，1487 通过 | 1 跳过）
- 函数覆盖率 ≥ 70%，行覆盖率 ~73%
- 更稳健的 AI 配置与提供者兼容（Ollama OpenAI 兼容路径安全读取 `finish_reason`）

## 变更细节
- 测试与类型修复：
  - `RecommendationService.test.ts`：`UserProfile` 构造补齐必需字段；事务模拟添加 `timeout`
  - `recommendation-config.test.ts`：`AIConfig.providers` 结构生效，补齐 `local` 与 `engineAssignment`
- AI 提供者：
  - `OllamaProvider.ts`：OpenAI 兼容响应路径更安全（`finish_reason` 可选）
- 新增测试：
  - `db-unrecommended-count.test.ts`：覆盖订阅源、异常分支与排除规则

## 兼容性
- 无破坏性改动；主要针对测试与类型。

## 构建与安装
- 构建：`npm run build`
- 开发加载：参考 `docs/HOW_TO_LOAD_EXTENSION.md`

## 后续计划
- 合并后打标签：`v0.3.1` 并发布商店版本。
