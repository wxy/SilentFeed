# SilentFeed v0.3.1 发布说明

本版本包含重要的 AI 配置迁移修复、测试稳定性改进与类型一致性优化。

## 🎯 核心修复

### AI 配置结构完全迁移 (PR #63)
- **问题**：部分代码仍使用旧配置字段（`aiConfig.model`、`aiConfig.provider`），导致推荐服务出现"未选择模型"误报
- **解决**：
  - 推荐服务从 `engineAssignment.feedAnalysis` 读取任务级配置
  - 支持任务级模型优先，回退到 provider 级配置
  - AI 状态检查使用新结构（`providers` + `engineAssignment`）
  - 清理 1285 行过时备份代码

### 配置结构变更
```typescript
// ❌ 旧结构（已清除）
aiConfig.model, aiConfig.provider, aiConfig.apiKeys

// ✅ 新结构
aiConfig.providers.deepseek?.model
aiConfig.engineAssignment.feedAnalysis.provider
aiConfig.local.enabled
```

## ✨ 功能改进

### 测试稳定性
- 全量测试稳定通过（92 文件，1487 通过 | 1 跳过）
- 函数覆盖率 ≥ 70%，行覆盖率 ~73%
- 修复 `UserProfile` 测试构造缺失字段
- 完善 Dexie 事务模拟（添加 `timeout`）

### AI 提供者兼容性
- Ollama OpenAI 兼容路径安全读取 `finish_reason`（可选字段）
- 更稳健的推理模式判断逻辑
- 新增推理截断和空响应边缘测试

### 新增测试覆盖
- `db-unrecommended-count.test.ts`：订阅源、异常分支与排除规则
- `OllamaProvider.test.ts`：推理截断和空 choices 边缘情况

## 🐛 Bug 修复
- 修复推荐服务"未选择模型"误报（尽管实际已配置）
- 修复 AI 配置状态检查的 provider 派生逻辑
- 修复测试 mock 与新配置结构不一致

## 📦 代码质量
- 删除 2 个过时备份文件（1285 行代码）
- 所有 AI 配置引用迁移到新结构
- 测试 mock 更新为完整配置结构

## 🔄 兼容性
- 无破坏性改动
- 向后兼容现有配置（自动迁移）

## 📥 构建与安装
- 构建：`npm run build`
- 打包：`npm run package`
- 开发加载：参考 `docs/HOW_TO_LOAD_EXTENSION.md`

## 🔗 相关 PR
- #61: 初始类型修复与测试改进
- #62: 文档与版本同步
- #63: AI 配置结构完全迁移

---
**包大小**: 929 KB  
**测试状态**: ✅ 1487 通过 | 1 跳过  
**覆盖率**: 函数 74.54% | 行 73.19%
