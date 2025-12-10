# Release 0.2.0 - 完整变更追踪

**发布日期**: 2024-12-01  
**基于版本**: v0.1.0 (2024-11-28)  
**开发周期**: 3 天  
**PR 数量**: 13 个  
**主要 Commits**: 82 个

---

## 📋 目录

1. [重大功能更新](#1-重大功能更新)
2. [架构优化](#2-架构优化)
3. [用户体验改进](#3-用户体验改进)
4. [Bug 修复](#4-bug-修复)
5. [文档更新](#5-文档更新)
6. [技术债务清理](#6-技术债务清理)

---

## 1. 重大功能更新

### 1.1 AI 引擎分配系统 (Phase 8) 🎯

**PR**: [#40](https://github.com/wxy/SilentFeed/pull/40), [#41](https://github.com/wxy/SilentFeed/pull/41)  
**完成日期**: 2024-11-28  
**影响范围**: 核心 AI 架构

#### 功能说明
允许用户为不同 AI 任务类型分配不同的引擎，实现成本与性能的平衡。

#### 实现内容
- **3 种任务类型**: 
  - 页面浏览分析 (高频)
  - 订阅源文章分析 (高频)
  - 用户画像生成 (低频)

- **3 个预设方案**:
  - 智能优先: 全部使用 DeepSeek (月成本 ~$0.15)
  - 平衡方案: 高频任务用 DeepSeek，画像用 OpenAI (月成本 ~$0.54)
  - 隐私优先: 全部使用本地 Ollama (零成本)

- **高级自定义**: 每个任务独立配置引擎和推理模式

#### 技术细节
- **新增文件**:
  - `src/types/ai-engine-assignment.ts` - 类型定义
  - `src/storage/ai-engine-assignment.ts` - 存储层
  - `src/components/settings/AIEngineAssignment.tsx` - UI 组件

- **更新模块**:
  - `src/core/ai/AICapabilityManager.ts` - 新增 `getProviderForTask()` 任务路由
  - `src/contents/page-tracker.ts` - 集成 taskType 参数
  - `src/core/recommender/pipeline.ts` - 集成 taskType 参数

- **测试覆盖**: 65 个新增测试用例

#### 用户价值
- 💰 **成本优化**: 可将月成本从 ~$3 降至 ~$0.15
- ⚡ **性能平衡**: 高频任务用快速引擎，重要任务用高精度引擎
- 🔒 **隐私选择**: 支持完全本地化部署

---

### 1.2 AI 用量追踪与统计 (Phase 9) 📊

**PR**: [#48](https://github.com/wxy/SilentFeed/pull/48)  
**完成日期**: 2024-11-30  
**影响范围**: AI 管理

#### 功能说明
追踪每个 AI 提供商的 API 调用次数、Token 使用量和预估成本，帮助用户监控和优化 AI 支出。

#### 实现内容
- **追踪指标**:
  - API 调用次数 (按提供商)
  - Token 使用量 (prompt + completion)
  - 预估成本 (基于官方定价)
  - 每日/每月统计

- **UI 展示**:
  - 设置页面实时显示用量统计
  - 支持按提供商查看详细数据
  - 成本预警提示 (计划中)

#### 技术细节
- **新增文件**:
  - `src/storage/ai-usage-stats.ts` - 用量统计存储
  - `src/components/settings/AIUsageStats.tsx` - 统计展示组件

- **更新模块**:
  - `src/core/ai/BaseAIService.ts` - 自动记录每次调用
  - `src/core/ai/providers/*` - 统一 token 计数逻辑

#### 用户价值
- 📈 **透明度**: 清晰了解 AI 使用情况
- 💡 **成本控制**: 及时发现异常高消耗
- 🎯 **优化建议**: 基于实际使用调整引擎分配

---

### 1.3 AI 配置自动保存 🔄

**PR**: [#50](https://github.com/wxy/SilentFeed/pull/50)  
**完成日期**: 2024-11-30  
**影响范围**: 用户体验

#### 功能说明
AI 引擎分配配置改为即时保存，无需手动点击保存按钮。

#### 技术细节
- 使用 `debounce` 防抖，避免频繁写入
- 保存成功后显示视觉反馈
- 保持原有测试配置的手动保存逻辑

#### 用户价值
- ⚡ **即时生效**: 修改后立即应用到新任务
- 🎨 **更流畅**: 无需额外操作步骤

---

### 1.4 本地 Ollama 完整支持 🏠

**PR**: [#43](https://github.com/wxy/SilentFeed/pull/43)  
**完成日期**: 2024-11-29  
**影响范围**: 本地 AI 集成

#### 问题背景
Ollama 默认拒绝来自 `chrome-extension://` 的 CORS 请求，返回 403 错误。

#### 解决方案
使用 Chrome declarativeNetRequest API 自动移除本地 AI 请求的 Origin 和 Referer 头。

#### 实现内容
- **新增文件**:
  - `public/dnr-rules.json` - DNR 规则配置
  - `scripts/watch-dnr.sh` - 开发模式自动配置脚本
  - `scripts/setup-dnr.sh` - 生产模式配置脚本
  - `docs/OLLAMA_SETUP_GUIDE.md` - 用户安装指南

- **manifest.json 更新**:
  - 添加 `declarativeNetRequestWithHostAccess` 权限
  - 配置 DNR 规则文件路径

#### 技术优势
- ✅ 无需修改 Ollama 服务器配置
- ✅ 无需用户手动配置环境变量
- ✅ 使用 MV3 标准 API (比 webRequest 更高效)
- ✅ 支持 legacy 和 OpenAI-compatible 两种模式

#### 用户价值
- 🆓 **零成本**: 完全免费的 AI 能力
- 🔒 **隐私**: 数据不离开本地
- ⚡ **开箱即用**: 安装 Ollama 后即可使用

---

### 1.5 AI 配置结构重构 (Phase 9.2) 🏗️

**PR**: [#51](https://github.com/wxy/SilentFeed/pull/51)  
**完成日期**: 2024-12-01  
**影响范围**: AI 配置架构

#### 问题背景
配置多个 AI 提供商时，全局 `model` 和 `enableReasoning` 字段被后配置的覆盖，导致检测失败。

**示例**:
```typescript
// 配置 DeepSeek
config.model = "deepseek-chat"  

// 配置 OpenAI
config.model = "gpt-4"  // ❌ 覆盖了 DeepSeek 的 model

// 检测 DeepSeek 时
使用 config.model → "gpt-4" → API 调用失败 ❌
```

#### 解决方案
每个 provider 独立配置 `{ apiKey, model, enableReasoning }`。

**新数据结构**:
```typescript
interface AIConfig {
  providers?: {
    deepseek?: {
      apiKey: string
      model: string
      enableReasoning?: boolean
    },
    openai?: { ... }
  },
  provider?: string  // 当前激活的提供商
  
  // @deprecated 旧字段，保留兼容
  apiKeys?: { ... },
  model?: string
}
```

#### 实现内容
- **数据迁移**: 自动将旧结构迁移到新结构
- **双写策略**: 保存时同时写入新旧结构，确保向后兼容
- **更新组件**:
  - `AIConfigPanel.tsx` - 从 `providers[providerId]` 读写配置
  - `useAIProviderStatus.ts` - 按 provider 独立检测
  - `AICapabilityManager.ts` - 从新结构初始化

- **影响范围**: 11 个文件，+999/-134 行代码

#### 用户价值
- ✅ **多提供商支持**: 可同时配置多个 AI 提供商
- ✅ **配置隔离**: 每个提供商的配置互不干扰
- ✅ **平滑升级**: 自动迁移，用户无感知

---

## 2. 架构优化

### 2.1 数据库模块重构 (Phase 7)

**PR**: [#42](https://github.com/wxy/SilentFeed/pull/42)  
**完成日期**: 2024-11-29  
**影响范围**: 数据存储层

#### 优化内容
- **模块化拆分**: 将 1800+ 行的 `db.ts` 拆分为 12 个模块
- **目录结构**:
  ```
  src/storage/
  ├── db/
  │   ├── db.ts                    # 主入口
  │   ├── schema.ts                # 数据库模式定义
  │   ├── db-pages.ts              # 页面数据操作
  │   ├── db-feeds.ts              # RSS 源操作
  │   ├── db-articles.ts           # 文章操作
  │   ├── db-recommendations.ts    # 推荐操作
  │   ├── db-profile.ts            # 用户画像操作
  │   ├── db-settings.ts           # 设置管理
  │   ├── db-stats.ts              # 统计查询
  │   └── db-init.ts               # 初始化逻辑
  ```

- **测试拆分**: 测试文件也按模块拆分，便于维护

#### 技术价值
- 📦 **可维护性**: 每个模块职责单一
- ⚡ **性能**: 按需加载，减少初始化开销
- 🧪 **可测试性**: 模块独立测试更简单

---

### 2.2 AI Provider 架构统一

**完成日期**: 2024-11-27  
**影响范围**: AI 集成层

#### 优化内容
- **统一提示词管理**: 从分散在各 provider 中集中到 `BaseAIService`
- **标准化接口**: 所有 provider 实现相同的 `analyzeContent()` / `testConnection()` 接口
- **降级策略**: 统一的错误处理和 fallback 逻辑

#### 技术价值
- 🔧 **扩展性**: 添加新 provider 更简单
- 🐛 **可靠性**: 统一的错误处理
- 📝 **可维护性**: 提示词修改只需一处

---

## 3. 用户体验改进

### 3.1 国际化优化

**PR**: [#45](https://github.com/wxy/SilentFeed/pull/45), [#47](https://github.com/wxy/SilentFeed/pull/47), [#49](https://github.com/wxy/SilentFeed/pull/49)  
**完成日期**: 2024-11-29 - 2024-11-30

#### 改进内容
- **统一日期时间格式**: 使用 `date-fns` 标准化中英文日期显示
- **修复硬编码错误消息**: AI provider 状态检查的错误信息国际化
- **补充缺失翻译**: 
  - AI 预置方案名称和描述
  - 订阅源统计方块
  - 系统数据漏斗
  - Ollama 相关提示

#### 用户价值
- 🌐 **完整双语支持**: 中英文体验一致
- 📅 **本地化格式**: 日期时间符合用户习惯

---

### 3.2 UI 一致性优化

**PR**: [#46](https://github.com/wxy/SilentFeed/pull/46), [#47](https://github.com/wxy/SilentFeed/pull/47)  
**完成日期**: 2024-11-30

#### 改进内容
- **统一推理符号**: AI 配置界面使用一致的推理图标
- **统一任务名称**: "页面浏览分析" vs "浏览历史分析" 术语统一
- **订阅源统计方块**: 修复重复计数逻辑，准确显示文章状态分布

#### 用户价值
- 🎨 **视觉一致**: 减少认知负担
- 📊 **数据准确**: 统计信息可信赖

---

### 3.3 Onboarding 体验优化

**PR**: [#43](https://github.com/wxy/SilentFeed/pull/43)  
**完成日期**: 2024-11-29

#### 改进内容
- **允许跳过 AI 配置**: 新用户可以先体验基础功能
- **Ollama 安装帮助**: 配置页面直接链接到安装指南
- **Chrome AI 标记**: 明确标注为"未来支持"，管理用户期待

#### 用户价值
- 🚀 **降低门槛**: 不强制配置 AI 也能使用
- 📚 **清晰引导**: 知道如何配置本地 AI

---

### 3.4 推荐交互优化

**PR**: [#44](https://github.com/wxy/SilentFeed/pull/44)  
**完成日期**: 2024-11-29

#### 改进内容
- **修复点击可靠性**: 推荐卡片点击事件处理优化
- **即时视觉反馈**: 点击"不想读"后立即显示新推荐
- **AI 初始化优化**: 避免重复初始化

#### 用户价值
- ⚡ **响应更快**: 交互更流畅
- 🎯 **操作准确**: 点击总是生效

---

## 4. Bug 修复

### 4.1 订阅源统计方块逻辑错误

**PR**: [#46](https://github.com/wxy/SilentFeed/pull/46)  
**问题**: 文章状态统计重复计数  
**修复**: 修正聚合查询逻辑，确保每篇文章只计数一次

---

### 4.2 推荐条目排序问题

**问题**: 点击"不想读"后填充的新条目不按推荐分数排序  
**修复**: 在 `dismissSelected()` 和 `markAsRead()` 中添加排序逻辑

---

### 4.3 用户画像 behaviors 数据丢失

**问题**: 重建画像时丢失 behaviors 数据  
**修复**: 保留原有 behaviors，只更新其他字段

---

### 4.4 扩展图标状态恢复

**问题**: 学习阶段显示其他状态后不能恢复进度覆盖  
**修复**: `stopAnimation()` 后重置状态为 'static'

---

### 4.5 Ollama 相关问题修复

- **问题 1**: DNR 配置未正确应用导致 403 错误
- **修复**: 创建 `watch-dnr.sh` 脚本监听构建目录

- **问题 2**: 跨模式重试导致延迟
- **修复**: 移除跨模式 fallback，由 `isAvailable()` 确定最佳模式

- **问题 3**: 调试日志过多
- **修复**: 删除 curl 命令等不必要的日志

---

### 4.6 AI 配置浮层定位问题

**PR**: [#43](https://github.com/wxy/SilentFeed/pull/43)  
**问题**: AI 设置浮层位置不正确  
**修复**: 调整 CSS 定位逻辑

---

### 4.7 国际化测试失败

**PR**: [#45](https://github.com/wxy/SilentFeed/pull/45)  
**问题**: 翻译键路径不匹配导致测试失败  
**修复**: 更新所有翻译键路径，保持命名规范

---

## 5. 文档更新

### 5.1 核心文档更新 (v0.1.0 发布后)

**PR**: [#39](https://github.com/wxy/SilentFeed/pull/39)  
**完成日期**: 2024-11-27

#### 更新内容
- **PRD.md**: 添加 AI 引擎分配功能说明
- **TDD.md**: 更新 AI 集成架构章节
- **USER_GUIDE.md / USER_GUIDE_ZH.md**: 添加引擎分配使用指南
- **README.md**: 更新功能列表

---

### 5.2 新增文档

- **OLLAMA_SETUP_GUIDE.md**: Ollama 安装和配置指南
- **PHASE_8_*.md**: AI 引擎分配开发记录
- **PHASE_10_*.md**: AI First 优化方案

---

### 5.3 文档清理

**PR**: [#39](https://github.com/wxy/SilentFeed/pull/39)  
**完成日期**: 2024-11-27

#### 清理内容
- 18 个开发阶段文档归档到 `docs/archive/`
- 保留 9 个核心文档在 `docs/` 根目录
- 创建文档清理总结

---

## 6. 技术债务清理

### 6.1 测试覆盖率提升

- **v0.1.0**: 74% 覆盖率
- **v0.2.0**: 71%+ 覆盖率 (新增大量未测试代码)
- **测试数量**: 1401 passed (新增 93 个测试)

### 6.2 代码质量改进

- **TypeScript strict mode**: 100% 覆盖
- **ESLint 规则**: 无警告
- **Prettier 格式化**: 全部通过

### 6.3 CI/CD 优化

- 添加 pre-push 检查脚本
- 测试 + 覆盖率 + 构建三重检查

---

## 📊 统计数据

### 代码变更
- **文件修改**: 189 个文件
- **代码行数**: +8,342 / -3,156
- **净增长**: +5,186 行

### PR 统计
- **总 PR**: 13 个
- **Feature**: 5 个
- **Fix**: 6 个
- **Refactor**: 1 个
- **Docs**: 1 个

### 开发效率
- **开发周期**: 3 天
- **平均每天**: 4.3 个 PR
- **代码速度**: ~1,700 行/天

---

## 🎯 版本对比

| 指标 | v0.1.0 | v0.2.0 | 变化 |
|------|--------|--------|------|
| **核心功能** | 5 个 | 8 个 | +60% |
| **AI 提供商支持** | 2 个 | 3 个 | +50% |
| **测试用例** | 1,308 | 1,401 | +93 |
| **代码覆盖率** | 74% | 71% | -3% |
| **文档数量** | 32 | 9 (核心) + 52 (归档) | 重组 |
| **月成本优化** | ~$3 | ~$0.15 | -95% |

---

## 🚀 下一步计划

### v0.3.0 规划
1. **Chrome AI 集成**: 完全免费的浏览器内置 AI
2. **预算提醒**: AI 用量预算设置和提醒
3. **推荐优化**: 基于用户反馈的推荐算法改进
4. **性能优化**: 数据库查询和 UI 渲染优化

### v1.0.0 规划
1. **多浏览器支持**: Firefox / Safari 扩展
2. **云同步**: 可选的配置和画像云同步
3. **社区功能**: 分享推荐、订阅源推荐
4. **高级分析**: 阅读时间分布、兴趣演变可视化

---

**文档版本**: 1.0  
**最后更新**: 2024-12-01  
**维护者**: Silent Feed Team
