# 修复推荐点击可靠性 + AI 初始化优化

## 🐛 Bug 修复

### 1. 推荐点击后不总是消失

**问题**：点击推荐条目后，弹窗关闭导致后续异步操作（`markAsRead`）被中断，导致条目未被标记为已读。

**根本原因**：
- `chrome.tabs.create()` 会立即关闭弹窗
- 弹窗关闭 → JavaScript 上下文被销毁
- 正在执行的异步操作（数据库更新）被中断

**解决方案**：
调整执行顺序，先完成数据库更新再打开链接：
```typescript
// ❌ 之前：打开链接 → 弹窗关闭 → 数据库更新被中断
await chrome.tabs.create({ url })
await markAsRead(id)

// ✅ 现在：数据库更新 → 打开链接（允许弹窗关闭）
await markAsRead(id)
await chrome.tabs.create({ url })
```

**影响文件**：
- `src/components/RecommendationView.tsx`

---

### 2. AI 初始化时不必要的检查

**问题**：
1. 即使未启用 AI，也会在初始化时检查可用性
2. 即使未配置本地 AI，也会尝试连接 Ollama 并产生错误日志

**根本原因**：
- `AICapabilityManager.initialize()` 无条件调用 `initializeLocalProvider` 和 `initializeRemoteProvider`
- 每个 init 函数内部调用 `isAvailable()`，导致不必要的网络请求

**解决方案**：
1. 只在 `enabled = true` 时才初始化 provider
2. 延迟可用性检查到真正使用时（`ensureProviderAvailable`）

```typescript
// ❌ 之前：总是初始化并检查
await this.initializeRemoteProvider(config.enabled, ...)
await this.initializeLocalProvider(config.local)

// ✅ 现在：只在启用时才初始化
if (config.enabled) {
  await this.initializeRemoteProvider(...)
}
if (config.local?.enabled) {
  await this.initializeLocalProvider(...)
}
```

**影响文件**：
- `src/core/ai/AICapabilityManager.ts`

---

### 3. DeepSeek JSON 解析错误

**问题**：DeepSeek 返回的 JSON 被 markdown 代码块包裹，导致解析失败。

**根本原因**：
- DeepSeek API 有时返回 `` ```json\n{...}\n``` `` 而不是纯 JSON
- `JSON.parse()` 无法解析带代码块标记的内容

**解决方案**：
在解析前清理 markdown 标记：
```typescript
let jsonContent = response.content.trim()
if (jsonContent.startsWith('```')) {
  jsonContent = jsonContent.replace(/^```(?:json)?\s*\n/, '')
}
if (jsonContent.endsWith('```')) {
  jsonContent = jsonContent.replace(/\n```\s*$/, '')
}
const analysis = JSON.parse(jsonContent)
```

**影响文件**：
- `src/core/ai/BaseAIService.ts`

---

## 🧹 代码清理

### 移除调试日志

清理了所有为诊断问题添加的临时调试日志：
- 数据库层验证逻辑
- Store 层详细日志
- Background 消息日志

保留了关键的业务日志（如错误、警告）。

**影响文件**：
- `src/storage/db/db-recommendations.ts`
- `src/stores/recommendationStore.ts`
- `src/background.ts`

---

## 📚 文档更新

### 1. 添加分支规范

在 `.github/copilot-instructions.md` 中添加强制分支规范：
- 禁止在 master 分支直接开发
- 自动提示创建功能分支
- 规范分支命名（feature/*, fix/*, etc.）

### 2. 创建调试指南

新增 `docs/DEBUG_RECOMMENDATION_CLICK.md`：
- 问题描述和调试步骤
- 日志解释
- 测试场景
- 问题诊断方法

---

## 🆕 新功能（准备工作）

创建 AI Provider 状态管理模块（`src/storage/ai-provider-status.ts`），为后续 AI 配置界面优化做准备：
- 缓存 AI 可用性状态
- 记录连接延迟
- 推理能力检测

**注意**：此模块暂未使用，将在下一个 PR 中集成到 UI。

---

## ✅ 测试

- [x] 本地构建通过
- [x] 浏览器测试：点击推荐条目正常消失
- [x] 无 Ollama 错误日志
- [x] DeepSeek JSON 解析正常

---

## 📦 文件变更统计

**修改**：
- `.github/copilot-instructions.md` (+10 行)
- `src/components/RecommendationView.tsx` (~10 行调整)
- `src/core/ai/AICapabilityManager.ts` (+8 -14 行)
- `src/core/ai/BaseAIService.ts` (+26 行)
- `src/storage/db/db-recommendations.ts` (-35 行)
- `src/stores/recommendationStore.ts` (-15 行)
- `src/background.ts` (-15 行)

**新增**：
- `docs/DEBUG_RECOMMENDATION_CLICK.md` (新建)
- `src/storage/ai-provider-status.ts` (新建，暂未使用)

---

## 🔜 后续计划

下一个 PR 将实现 AI 配置界面优化：
1. AI 状态观察窗（卡片式布局）
2. 实时检测 AI 可用性和延迟
3. 推理能力自动检测
4. 点击卡片弹出配置浮层
