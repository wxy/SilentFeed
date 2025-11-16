# 修复 003: 标记已读后推荐不消失的问题

**日期**: 2025-11-16  
**优先级**: 🔴 严重  
**状态**: 🔍 调查中

## 问题描述

用户报告部分推荐条目点击后不会从弹窗中消失，但已读数会增加。

**症状**:
- 部分推荐点击后正常消失（如：Marshall Heston 120, Google Gemini文章）
- 部分推荐点击后不消失（如：NordVPN Review）
- 所有推荐的已读数都正常增加
- RSS源的已读数统计延迟或不准确

**复现步骤**:
1. 生成 3 条推荐
2. 点击第 1 条 → 正常消失 ✅
3. 点击第 2 条 → 正常消失 ✅
4. 点击第 3 条 → 不消失 ❌（但已读数 +1）
5. 再次点击第 3 条 → 仍不消失，已读数继续 +1

## 调查发现

### 1. 数据库更新逻辑正常
`markAsRead` 函数的数据库更新逻辑是正确的：
```typescript
await db.recommendations.update(id, {
  isRead: true,
  clickedAt: Date.now()
})
```

### 2. UI 状态更新依赖 Store
`RecommendationView` 调用 `markAsRead(rec.id)` → Store 更新状态 → UI 重新渲染

```typescript
// Store 中的逻辑
const filtered = recommendations.filter(r => r.id !== id)
set({ recommendations: filtered })
```

### 3. 可能的问题点

#### A. 重复 ID
如果同一篇文章被多次添加到推荐池，会有多个相同的 ID？
- **验证方法**: 检查数据库中是否有重复的推荐 ID

#### B. 异步时序问题
```typescript
await markAsRead(rec.id)  // 数据库更新
// UI 状态更新可能延迟
```

#### C. URL 匹配问题导致统计不准
`updateFeedStats` 使用 `sourceUrl` 匹配，但保存时可能用了不同的 URL 格式：
```typescript
// 保存时
sourceUrl: this.extractBaseUrl(article.url)  // https://www.wired.com

// 查询时
db.recommendations.where('sourceUrl').equals(feedUrl)  // feed.url
```

## 增强诊断

已添加详细日志到 `markAsRead`：
```typescript
console.log('[DB] markAsRead 开始:', { id, ... })
console.log('[DB] 找到推荐记录:', { id, title, isRead, sourceUrl })
console.log('[DB] ✅ markAsRead 完成:', { id, updateCount })
console.log('[DB] 验证更新结果:', { id, isRead, clickedAt })
```

## 待验证假设

1. **假设 1**: 推荐池中有重复 ID
   - 验证：查询 `db.recommendations` 表，检查是否有重复 ID
   
2. **假设 2**: Store 的 filter 逻辑有问题
   - 验证：检查 Store 更新前后的 recommendations 数组

3. **假设 3**: sourceUrl 格式不一致导致统计失败
   - 验证：对比推荐表中的 sourceUrl 和 feed.url

## 下一步操作

1. 重新加载扩展，应用增强的日志
2. 重现问题，收集完整的控制台日志
3. 特别关注：
   - `[DB] markAsRead` 系列日志
   - `[RecommendationStore]` 系列日志
   - `[DB] 更新 RSS 源统计` 日志
4. 检查数据库中的实际数据状态
