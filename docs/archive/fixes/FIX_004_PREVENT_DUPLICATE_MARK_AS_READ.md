# 修复 004: 防止重复标记已读

**日期**: 2025-11-16  
**优先级**: 🔴 严重  
**状态**: ✅ 已修复

## 问题描述

用户报告统计数据异常：
- 推荐统计显示"推荐 3，已读 4"（已读数超过推荐数）
- RSS 源显示"推荐 3，已读 1"（与推荐统计不一致）
- 点击推荐后行为不稳定（有时消失，有时不消失）

## 根本原因

### 问题 1: 重复标记已读
`markAsRead` 函数**没有检查** `isRead` 状态，允许重复标记：

```typescript
// 修复前
export async function markAsRead(id: string) {
  const recommendation = await db.recommendations.get(id)
  if (!recommendation) throw new Error('不存在')
  
  // ❌ 直接更新，不检查是否已读
  await db.recommendations.update(id, {
    isRead: true,
    clickedAt: Date.now()
  })
}
```

**影响**：
- 每次点击都会更新 `isRead: true`（即使已经是 true）
- 触发统计更新，导致已读数不断增加
- UI 状态不稳定（因为数据库状态和 UI 状态不一致）

### 问题 2: 统计数据语义混乱
`getRecommendationStats` 统计的是**最近 7 天的所有推荐**，而不是"当前推荐池"：

```typescript
const total = recentRecommendations.length  // 包括已读、未读、已忽略
const read = recentRecommendations.filter(r => r.isRead).length
```

这导致：
- "推荐数"是历史累计（包括已读、已忽略的）
- "已读数"也是历史累计
- 两者可能不一致（如果有推荐被忽略）

## 修复方案

### 修复 1: 添加防重复逻辑

```typescript
// 修复后
export async function markAsRead(id: string) {
  const recommendation = await db.recommendations.get(id)
  if (!recommendation) throw new Error('不存在')
  
  // ✅ 检查是否已读，避免重复标记
  if (recommendation.isRead) {
    console.log('[DB] ⚠️ 推荐已经是已读状态，跳过重复标记:', id)
    return  // 直接返回，不更新
  }
  
  await db.recommendations.update(id, {
    isRead: true,
    clickedAt: Date.now()
  })
}
```

### 修复 2: 增强调试日志

在 `recommendationStore.ts` 的 `markAsRead` 中添加：

```typescript
// 打印当前列表中的所有 ID
console.log('[RecommendationStore] 当前列表中的 ID:', recommendations.map(r => r.id))
console.log('[RecommendationStore] 要移除的 ID:', id)

// 在 filter 中打印匹配情况
const filtered = recommendations.filter(r => {
  const shouldKeep = r.id !== id
  if (!shouldKeep) {
    console.log('[RecommendationStore] 🎯 找到匹配的推荐，将被移除:', r.id, r.title)
  }
  return shouldKeep
})
```

## 影响范围

- **文件**: `src/storage/db.ts` (markAsRead)
- **文件**: `src/stores/recommendationStore.ts` (调试日志)
- **影响**: 防止重复标记，修复统计数据异常

## 验证方法

1. 重新加载扩展
2. 生成推荐
3. 点击第一个推荐 → 观察日志
4. 再次点击同一位置（如果推荐没消失）→ 应该看到"跳过重复标记"
5. 检查推荐统计：已读数不应该超过推荐数

## 预期日志输出

**第一次点击**：
```
[DB] markAsRead 开始: { id: 'rec-xxx' }
[DB] 找到推荐记录: { id: 'rec-xxx', isRead: false }
[DB] ✅ markAsRead 完成: { updateCount: 1 }
[RecommendationStore] 当前列表中的 ID: ['rec-xxx', 'rec-yyy', 'rec-zzz']
[RecommendationStore] 要移除的 ID: rec-xxx
[RecommendationStore] 🎯 找到匹配的推荐，将被移除: rec-xxx
[RecommendationStore] UI状态更新完成: { removed: 1 }
```

**第二次点击同一推荐（如果没消失）**：
```
[DB] markAsRead 开始: { id: 'rec-xxx' }
[DB] 找到推荐记录: { id: 'rec-xxx', isRead: true }
[DB] ⚠️ 推荐已经是已读状态，跳过重复标记: rec-xxx
```

## 后续优化

1. 统一统计数据的语义（当前池 vs 历史累计）
2. 考虑在 UI 层面防止重复点击（disabled 状态）
3. 添加数据完整性校验（定期检查统计数据是否一致）
