# 架构修复：Content Script 数据库访问问题

**日期**: 2025-11-04  
**问题严重程度**: 🔴 Critical  
**影响**: 所有页面访问数据写入了错误的存储位置

---

## 🐛 问题描述

### 症状

1. **数据库隔离问题**:
   - Service Worker 中看到数据库版本 20，但计数为 0
   - 网页控制台中看到版本 20 的数据库，有数据
   - Popup 和徽章显示 0

2. **数据写入错误位置**:
   ```
   ❌ 错误：数据写入了 https://github.com 的存储空间
   ✅ 正确：应该写入扩展的存储空间 (chrome-extension://...)
   ```

3. **DevTools 显示**:
   ```
   源：https://github.com    ← 错误！应该是 chrome-extension://
   存储桶：default
   版本：20
   对象存储区：5
   ```

---

## 🔍 根本原因

### Chrome 扩展的存储模型

Chrome 扩展有**多个独立的执行上下文**：

```
┌─────────────────────────────────────────┐
│  扩展存储空间 (chrome-extension://)      │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Background   │  │ Popup        │    │
│  │ Service      │  │              │    │
│  │ Worker       │  │              │    │
│  └──────────────┘  └──────────────┘    │
│         ↑                  ↑            │
│         └──────┬───────────┘            │
│                │                        │
│       共享同一个 IndexedDB              │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  网页存储空间 (https://github.com)       │
│  ┌──────────────┐                       │
│  │ Content      │  ← 运行在网页上下文    │
│  │ Script       │                       │
│  │              │  ❌ 如果直接访问       │
│  └──────────────┘     IndexedDB          │
│         │         会创建网页的数据库！    │
│         ↓                                │
│  ❌ 独立的 IndexedDB                     │
│     (与扩展隔离)                         │
└─────────────────────────────────────────┘
```

### 代码问题

**旧代码（错误）**:
```typescript
// src/contents/page-tracker.ts
import { db } from "~storage/db"  // ❌ 在网页上下文中导入

async function recordPageVisit() {
  // ❌ 在网页上下文中访问 IndexedDB
  // 会在 https://github.com 的存储空间创建数据库！
  await db.confirmedVisits.add(visitData)
}
```

**为什么会这样？**

1. Content Script 运行在**网页的 JavaScript 上下文**中
2. 虽然有扩展的权限，但 `window.indexedDB` 是网页的 IndexedDB
3. Dexie.js 使用 `window.indexedDB.open()`
4. 结果：数据库创建在网页的存储空间

### 正确的架构

**Content Script 不应该直接访问数据库**

Chrome 扩展的标准模式：

```typescript
// Content Script (网页上下文)
async function recordPageVisit() {
  // ✅ 通过消息传递发送数据
  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_PAGE_VISIT',
    data: visitData
  })
}

// Background Service Worker (扩展上下文)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_PAGE_VISIT') {
    // ✅ 在扩展上下文中访问数据库
    await db.confirmedVisits.add(message.data)
    sendResponse({ success: true })
  }
})
```

---

## ✅ 修复方案

### 1. Content Script 不再导入数据库

**修改前**:
```typescript
import { db } from "~storage/db"
```

**修改后**:
```typescript
// ❌ 删除数据库导入
// ✅ 只导入工具函数
import { logger } from "~utils/logger"
```

### 2. 通过消息传递数据

**修改前**:
```typescript
// ❌ 直接写入数据库
await db.confirmedVisits.add(visitData)
```

**修改后**:
```typescript
// ✅ 发送消息到 Background
const response = await chrome.runtime.sendMessage({
  type: 'SAVE_PAGE_VISIT',
  data: visitData
})

if (response?.success) {
  logger.info('✅ 页面访问已记录（通过 Background）')
}
```

### 3. Background 处理数据保存

**新增消息处理**:
```typescript
case 'SAVE_PAGE_VISIT':
  // 接收来自 Content Script 的数据
  const visitData = message.data
  
  // 在扩展上下文中保存
  await db.confirmedVisits.add(visitData)
  
  // 更新徽章
  await updateBadgeWithRecommendations()
  
  sendResponse({ success: true })
  break
```

---

## 📊 影响分析

### 已收集的数据

- ❌ **26 条记录**: 写入了错误位置（网页存储空间）
- ❌ **不可恢复**: 数据在多个网站的存储中，无法批量迁移
- ✅ **需要重新收集**: 从 0/1000 开始

### 未来数据

- ✅ **正确位置**: chrome-extension:// 的存储空间
- ✅ **全局可见**: Background、Popup、Options 都能访问
- ✅ **持久化**: 扩展卸载前不会丢失

---

## 🔬 验证方法

### 1. 检查数据库位置

```javascript
// 在 Service Worker DevTools 中运行
const dbs = await indexedDB.databases()
console.log('数据库列表:', dbs)
// 应该看到 FeedAIMuterDB
```

### 2. 验证数据写入

```javascript
// 访问网页 30 秒后，在 Service Worker 中运行
const count = await db.confirmedVisits.count()
console.log('记录数:', count)
// 应该 > 0
```

### 3. 检查 Application 面板

```
chrome://extensions/ 
→ FeedAIMuter 
→ "检查视图" → "service worker"
→ DevTools → Application → IndexedDB
→ 应该看到 FeedAIMuterDB（版本 2）
```

---

## 📚 技术背景

### Chrome 扩展的执行上下文

| 上下文 | 运行环境 | IndexedDB 位置 | 适用场景 |
|--------|---------|---------------|---------|
| Background Service Worker | 扩展 | chrome-extension:// | 数据存储、后台任务 |
| Popup | 扩展 | chrome-extension:// | UI 显示、用户交互 |
| Options Page | 扩展 | chrome-extension:// | 设置页面 |
| **Content Script** | **网页** | **https://example.com** | DOM 操作、页面监听 |

### 为什么 Content Script 特殊？

1. **注入到网页**: 为了访问页面的 DOM
2. **共享 window 对象**: 与网页共享 JavaScript 上下文
3. **隔离的存储**: IndexedDB/localStorage 是网页的
4. **需要消息传递**: 与扩展通信需要 `chrome.runtime.sendMessage`

### 参考文档

- [Chrome 扩展架构概览](https://developer.chrome.com/docs/extensions/mv3/architecture-overview/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)

---

## ✅ 已修复的文件

1. **`src/contents/page-tracker.ts`**
   - 移除数据库导入
   - 改为消息传递
   - 添加架构说明注释

2. **`src/background.ts`**
   - 新增 `SAVE_PAGE_VISIT` 消息处理
   - 负责数据库写入
   - 保持单一数据访问点

---

## 🎯 测试清单

- [ ] 重新加载扩展
- [ ] 访问网页 30 秒
- [ ] 检查 Service Worker 日志：
  - ✅ 应该看到 "[Background] 保存页面访问数据..."
  - ✅ 应该看到 "[Background] ✅ 页面访问已保存"
- [ ] 检查 Application → IndexedDB
  - ✅ 位置：chrome-extension://
  - ✅ 版本：2
  - ✅ confirmedVisits 表有数据
- [ ] 检查徽章
  - ✅ 显示 1, 2, 3...
- [ ] 检查 Popup
  - ✅ 显示正确的页面计数

---

## 📝 经验教训

### 1. Content Script 的限制

- ❌ 不要在 Content Script 中直接访问 IndexedDB
- ❌ 不要在 Content Script 中直接访问 chrome.storage（虽然可以，但不推荐大量数据）
- ✅ 使用消息传递与 Background 通信
- ✅ Background 作为数据层的单一入口

### 2. 扩展架构模式

```
Content Script → 消息 → Background → 数据库
                ↑                    ↓
                └────── 响应 ─────────┘
```

### 3. 调试技巧

- 不同上下文有不同的 DevTools
- Service Worker DevTools 看扩展的数据
- 网页 DevTools 看网页的数据
- 不要混淆两者！

---

## 🔄 数据迁移（不适用）

由于旧数据分散在多个网站的存储中，且结构可能不一致，**不提供自动迁移**。

用户需要：
1. 重新开始收集（0/1000）
2. 数据会正确地保存在扩展存储中
3. 未来不会再出现此问题

---

**结论**: 这是一个典型的 Chrome 扩展架构错误。通过消息传递模式修复后，数据将正确保存在扩展的存储空间中。

**最后更新**: 2025-11-04  
**文档版本**: 1.0
