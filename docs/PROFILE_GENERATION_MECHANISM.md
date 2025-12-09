# 用户画像生成机制说明

> 本文档描述 Silent Feed 用户画像的生成触发机制，供开发和维护参考。

## 1. 概述

用户画像（User Profile）是 Silent Feed 推荐系统的核心，包含：
- **基础画像**：关键词、主题分布、域名偏好
- **AI 语义画像**：兴趣描述、内容偏好、避免主题

画像生成分为**手动触发**和**自动触发**两种方式。

---

## 2. 触发方式

### 2.1 手动触发

| 入口 | 位置 | 限制 |
|------|------|------|
| 「重建用户画像」按钮 | 设置页 → 用户画像卡片 | UI 防抖 10 分钟 |
| 「重建用户画像」按钮 | 设置页 → 数据统计 | 无 |

**特点**：
- ✅ 不受时间间隔限制
- ✅ 不受计数阈值限制
- ✅ 强制重新生成 AI 画像

### 2.2 自动触发

自动触发需同时满足**时间条件**和**行为条件**：

```
触发条件 = (距上次自动更新 ≥ 3 小时) AND (满足任一行为阈值)
```

#### 行为阈值

| 行为类型 | 阈值 | 说明 |
|----------|------|------|
| **浏览** | ≥ 50 页 | 用户主动浏览的网页（content script 收集） |
| **阅读** | ≥ 弹窗容量 | 点击推荐弹窗阅读文章（通常 3-5 篇） |
| **拒绝** | ≥ 弹窗容量 | 拒绝推荐弹窗中的文章（通常 3-5 篇） |

#### 时间间隔

- **全局间隔**：3 小时（所有行为共享）
- **防抖机制**：拒绝操作有 5 分钟防抖，停止操作后才触发检查

### 2.3 首次生成（特殊情况）

| 条件 | 行为 |
|------|------|
| 浏览 ≥ 10 页 且 无 AI 画像 | 立即生成，不受 3 小时间隔限制 |

---

## 3. 计数器与重置

### 3.1 计数器类型

```typescript
interface ProfileUpdateCounters {
  browseCount: number    // 浏览页面计数
  readCount: number      // 阅读推荐计数
  dismissCount: number   // 拒绝推荐计数
}
```

### 3.2 重置规则

| 事件 | 重置行为 |
|------|----------|
| 自动更新触发 | **全部重置**（浏览、阅读、拒绝归零） |
| 手动更新触发 | **全部重置** |
| 扩展重启 | 计数器归零（内存中，不持久化） |

### 3.3 计数独立性

- 浏览计数：仅统计 content script 收集的用户主动浏览页面
- 阅读计数：仅统计点击推荐弹窗阅读的文章
- 拒绝计数：仅统计拒绝推荐弹窗的文章
- **三者独立，互不影响**

---

## 4. 频率控制

### 4.1 设计目标

| 指标 | 目标值 |
|------|--------|
| 工作日自动更新次数 | ≤ 3 次（8h ÷ 3h） |
| 最小更新间隔 | 3 小时 |
| AI 调用成本 | 可预测、可控制 |

### 4.2 保护机制

| 机制 | 说明 |
|------|------|
| **任务锁** | 防止并发执行，生成中的请求被跳过 |
| **全局时间间隔** | 3 小时内最多一次自动更新 |
| **UI 防抖** | 手动触发 10 分钟冷却 |
| **预算检查** | AI 调用前检查月度预算，超限降级 |

---

## 5. 调用链路

### 5.1 手动触发

```
用户点击「重建画像」
  → ProfileSettings.handleRebuildProfile()
  → profileManager.rebuildProfile()
  → semanticProfileBuilder.forceGenerateAIProfile('rebuild')
  → aiManager.generateUserProfile()
```

### 5.2 自动触发 - 浏览

```
用户浏览网页
  → content script 收集
  → background.ts 保存到数据库
  → ProfileUpdateScheduler.checkAndScheduleUpdate(visit)
  → semanticProfileBuilder.onBrowse(visit)
  → [检查条件] → triggerFullUpdate('browse')
```

### 5.3 自动触发 - 阅读/拒绝

```
用户点击/拒绝推荐
  → db-recommendations.markAsRead() / markAsDismissed()
  → semanticProfileBuilder.onRead() / onDismiss()
  → [检查条件] → triggerFullUpdate('read' / 'dismiss')
```

---

## 6. 配置常量

```typescript
// SemanticProfileBuilder.ts
const BROWSE_THRESHOLD = 50                    // 浏览触发阈值
const GLOBAL_UPDATE_INTERVAL_MS = 10800000     // 3 小时（全局间隔）
const DISMISS_DEBOUNCE_MS = 300000             // 5 分钟（拒绝防抖）

// 动态阈值（从推荐配置获取）
const READ_THRESHOLD = config.maxRecommendations   // 弹窗容量
const DISMISS_THRESHOLD = config.maxRecommendations

// ProfileSettings.tsx
const UI_DEBOUNCE_MS = 600000                  // 10 分钟（UI 防抖）

// ProfileManager.ts（首次生成条件）
const FIRST_GENERATION_PAGES = 10             // 首次生成最低页数
const FIRST_GENERATION_READS = 3              // 首次生成最低阅读数
const FIRST_GENERATION_DISMISSES = 3          // 首次生成最低拒绝数
```

---

## 7. 降级策略

当 AI 生成失败或预算超限时：

| 情况 | 处理方式 |
|------|----------|
| AI Provider 不可用 | 回退到关键词分析（provider: "keyword"） |
| 月度预算超限 | 跳过 AI 生成，保留基础画像 |
| 网络错误 | 重试 3 次后放弃，记录警告日志 |

---

## 8. 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2025-12-09 | 初始版本，统一触发机制 |

---

## 附录：触发条件速查表

| 触发方式 | 条件 | 时间限制 | 强制执行 |
|----------|------|----------|----------|
| 手动 - 画像卡片 | 无 | UI 防抖 10 分钟 | ✅ |
| 手动 - 数据统计 | 无 | 无 | ✅ |
| 自动 - 首次 | ≥10 页 且 无画像 | 无 | ✅ |
| 自动 - 浏览 | ≥50 页 | 3 小时 | ❌ |
| 自动 - 阅读 | ≥弹窗容量 | 3 小时 | ❌ |
| 自动 - 拒绝 | ≥弹窗容量 | 3 小时 + 5 分钟防抖 | ❌ |
