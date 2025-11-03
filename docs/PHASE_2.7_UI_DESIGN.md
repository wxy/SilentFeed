# Phase 2.7 实时反馈界面设计文档

## 📋 文档信息

**版本**: 1.0  
**日期**: 2025-11-03  
**状态**: Design  
**负责人**: FeedAIMuter Team

---

## 🎯 设计理念

**核心思想**: 推荐才是产品价值，数据收集只是手段

### 产品定位
- ✅ **主角**: RSS 推荐列表（用户真正关心的）
- ⚪ **配角**: 数据收集进度（只在必要时显示）
- ❌ **不展示**: 技术细节（主题分析、关键词等）

### 用户体验原则
1. **克制设计**: 不追求"上瘾"，只在有价值时出现
2. **聚焦推荐**: 推荐阶段完全隐藏数据收集信息
3. **渐进引导**: 冷启动阶段通过成长树可视化进度

---

## 📊 功能概述

### 两个阶段

| 阶段 | 页面范围 | 主要目标 | 界面重点 |
|------|---------|---------|---------|
| **冷启动** | 0-1000 页 | 收集数据 | 进度可视化 + 鼓励继续浏览 |
| **推荐** | 1000+ 页 | 推荐内容 | 推荐列表 + 阅读统计 |

### 界面分布

- **Popup**: 
  - 冷启动：进度展示
  - 推荐：推荐列表
- **徽章**: 
  - 冷启动：🌱🌿🌳🌲（进度）
  - 推荐：`3/10`（已读/推荐数）
- **设置页**: 
  - 推荐效果统计（主要）
  - 数据收集统计（次要）

---

## 🗄️ 数据模型

### 新增表：recommendations

```typescript
interface Recommendation {
  id: string                    // UUID
  url: string                   // 推荐内容 URL
  title: string                 // 标题
  source: string                // 来源（RSS 源名称或域名）
  
  // 推荐信息
  recommendedAt: number         // 推荐时间戳
  score: number                 // 推荐分数（0-1）
  reason?: string               // 推荐理由（可选）
  
  // 用户交互
  isRead: boolean               // 是否已读
  clickedAt?: number            // 点击时间（未点击为 null）
  
  // 元数据
  summary?: string              // 内容摘要
  imageUrl?: string             // 封面图
  pubDate?: number              // 发布时间
}
```

### 扩展表：statistics

在现有 `statistics` 表中新增字段：

```typescript
interface Statistics {
  // ...现有字段...
  
  // 推荐统计
  recommendations: {
    total: number               // 总推荐数
    read: number                // 已读数
    unread: number              // 未读数
    readRate: number            // 阅读率（0-1）
    
    // 时间段统计
    thisWeek: {
      total: number
      read: number
    }
    thisMonth: {
      total: number
      read: number
    }
  }
  
  // 数据规模
  storage: {
    totalRecords: number        // 总记录数
    sizeInBytes: number         // 存储占用（字节）
    avgDwellTime: number        // 平均停留时间（秒）
  }
}
```

### 辅助函数

```typescript
// src/storage/db.ts

/**
 * 获取推荐统计
 */
async function getRecommendationStats(): Promise<Statistics['recommendations']> {
  const all = await db.recommendations.toArray()
  const read = all.filter(r => r.isRead).length
  
  const now = Date.now()
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  const oneMonth = 30 * 24 * 60 * 60 * 1000
  
  const thisWeek = all.filter(r => r.recommendedAt > now - oneWeek)
  const thisMonth = all.filter(r => r.recommendedAt > now - oneMonth)
  
  return {
    total: all.length,
    read,
    unread: all.length - read,
    readRate: all.length > 0 ? read / all.length : 0,
    thisWeek: {
      total: thisWeek.length,
      read: thisWeek.filter(r => r.isRead).length
    },
    thisMonth: {
      total: thisMonth.length,
      read: thisMonth.filter(r => r.isRead).length
    }
  }
}

/**
 * 获取存储统计
 */
async function getStorageStats(): Promise<Statistics['storage']> {
  const visits = await db.confirmedVisits.toArray()
  
  // 计算存储大小（粗略估计）
  const jsonString = JSON.stringify(visits)
  const sizeInBytes = new Blob([jsonString]).size
  
  // 计算平均停留时间
  const totalDuration = visits.reduce((sum, v) => sum + v.duration, 0)
  const avgDwellTime = visits.length > 0 ? totalDuration / visits.length : 0
  
  return {
    totalRecords: visits.length,
    sizeInBytes,
    avgDwellTime
  }
}

/**
 * 标记推荐为已读
 */
async function markRecommendationAsRead(id: string): Promise<void> {
  await db.recommendations.update(id, {
    isRead: true,
    clickedAt: Date.now()
  })
}

/**
 * 批量标记已读
 */
async function markAllRecommendationsAsRead(): Promise<void> {
  const unread = await db.recommendations
    .filter(r => !r.isRead)
    .toArray()
  
  await Promise.all(
    unread.map(r => markRecommendationAsRead(r.id))
  )
}
```

---

## 🎨 UI 设计

### Popup 界面

#### 冷启动阶段（0-1000 页）

```
┌─────────────────────────────┐
│  🌱 RSS 静音器               │
├─────────────────────────────┤
│                              │
│        🌳                    │
│     （大号图标）              │
│                              │
│  正在学习你的兴趣...          │
│                              │
│  ╔═══════════════════════╗   │
│  ║ ████████░░░░░░░░░░░░░ ║   │
│  ╚═══════════════════════╝   │
│       637 / 1000 页          │
│                              │
│  💡 继续正常浏览，我会自动    │
│     学习你感兴趣的内容        │
│                              │
│  [设置]                       │
└─────────────────────────────┘
```

**组件结构**:
```tsx
<PopupColdStart>
  <StageIcon stage={getStage(pageCount)} />
  <ProgressBar current={637} total={1000} />
  <HintText />
  <SettingsButton />
</PopupColdStart>
```

#### 推荐阶段（1000+ 页）

```
┌─────────────────────────────┐
│  📚 RSS 静音器               │
├─────────────────────────────┤
│  本周推荐 5 条，已读 3 条    │
│  （60% 阅读率）              │
│                              │
│  ┌─────────────────────────┐│
│  │ 📌 深入理解 React 18...  ││
│  │ 来源：React 官方博客     ││
│  │ 推荐于 2 小时前          ││
│  └─────────────────────────┘│
│                              │
│  ┌─────────────────────────┐│
│  │ ✅ TypeScript 5.0 新特性 ││
│  │ 来源：TypeScript Weekly  ││
│  │ 推荐于 5 小时前          ││
│  └─────────────────────────┘│
│                              │
│  ┌─────────────────────────┐│
│  │ 📌 Chrome 扩展开发指南   ││
│  │ 来源：Google Developers  ││
│  │ 推荐于 1 天前            ││
│  └─────────────────────────┘│
│                              │
│  [标记全部已读]  [设置]      │
└─────────────────────────────┘
```

**组件结构**:
```tsx
<PopupRecommendations>
  <StatsHeader stats={weeklyStats} />
  <RecommendationList 
    items={recommendations}
    onItemClick={handleClick}
  />
  <ActionBar>
    <MarkAllReadButton />
    <SettingsButton />
  </ActionBar>
</PopupRecommendations>
```

---

**⏭️ 待续**: Part 2 将包含徽章系统、设置页设计和状态管理方案
