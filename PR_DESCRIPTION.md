# 修复 AI 配置连接问题并完成架构迁移

## 问题描述

用户反馈在 0.3.2 版本中遇到两个关键 bug：

1. **Onboarding 步骤 2/4 AI 配置**：点击"下一步"后报错 "连接失败：未配置 AI 提供商"
2. **设置页 AI 配置测试**：DeepSeek 连接测试报错 `Failed to execute 'fetch' on 'Window': Invalid name`

## 根本原因

OnboardingView 组件仍在使用旧的 AI 配置架构 `{apiKeys, enabled, provider}`，而系统已迁移到新的 `{providers}` 结构，导致配置保存后无法正确读取。

## 解决方案

### 1. AI 配置架构迁移完成
- ✅ **OnboardingView**: 使用新的 `providers` 结构保存配置
- ✅ **AIConfigPanel**: 添加 API key 清理（trim）防止隐藏字符
- ✅ **useAIProviderStatus**: 添加 API key 清理

### 2. 测试策略升级
- ✅ **真实 API 测试**: 使用真实 DeepSeek API 替代 mock
- ✅ **环境变量支持**: vitest.config.ts 配置 dotenv
- ✅ **修复 Provider 选择**: getProviderFromModel mock 正确识别 deepseek-chat
- ✅ **超时配置**: 30 秒（testConnection 10s + 网络延迟）

### 3. RSS 标题格式化
- ✅ **HTML 实体解码**: 处理 `&#8211;` (–), `&#8220;` (") 等
- ✅ **智能截断**: 80 字符限制，单词边界优先
- ✅ **formatFeedTitle()**: 新增工具函数

### 4. 测试文件 Mock 数据迁移
- ✅ **CollectionStats.test.tsx** (1处)
- ✅ **AIConfig.test.tsx** (2处)
- ✅ **BudgetChecker.test.ts** (2处)
- ✅ **RecommendationService.test.ts** (6处)

## 测试结果

✅ **全部测试通过**: 1661/1662 (1 skipped)  
✅ **测试文件**: 100 passed  
✅ **覆盖率**: 行 74.9%, 函数 76.22%, 分支 63.71%  
✅ **生产构建**: 成功  

## 代码审查

经过全面代码审查，确认：
- ✅ **生产代码**: 100% 正确使用新 `providers` 结构
- ✅ **测试代码**: 所有 mock 数据已更新为新结构
- ✅ **无旧架构残留**: 无 `{apiKeys, enabled, provider}` 模式

## 修改文件

**生产代码** (8 个文件):
- src/components/OnboardingView.tsx
- src/components/OnboardingView.test.tsx
- src/components/AIConfigPanel.tsx
- src/hooks/useAIProviderStatus.ts
- src/utils/html.ts
- src/utils/html.test.ts
- src/components/settings/RSSSettings.tsx
- vitest.config.ts

**测试代码** (4 个文件):
- src/components/settings/CollectionStats.test.tsx
- src/components/settings/AIConfig.test.tsx
- src/core/ai/BudgetChecker.test.ts
- src/core/recommender/RecommendationService.test.ts

## 提交历史

1. **2d2f690** - fix: 修复 AI 配置连接问题并完成架构迁移
2. **77783d0** - test: 更新所有测试文件的 mock 数据为新 AI 配置结构

## 如何测试

1. **AI 配置测试**:
   - Onboarding 流程步骤 2/4：输入 DeepSeek API Key 并测试连接
   - 设置页：添加/测试 DeepSeek 配置
   
2. **RSS 标题测试**:
   - 订阅包含长标题或 HTML 实体的 RSS 源
   - 验证标题正确显示（截断 + 实体解码）

## 相关 Issue

修复用户在 0.3.2 版本报告的 AI 配置连接失败问题

## 检查清单

- [x] 所有测试通过
- [x] 测试覆盖率达标
- [x] 生产构建成功
- [x] 代码审查完成
- [x] 提交信息清晰
- [x] 无破坏性变更
