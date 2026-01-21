# 推荐池与弹窗/清单显示的架构简化

## 当前问题

当前设计中，推荐池（poolStatus）和显示位置（弹窗/清单）的概念混淆：
- `poolStatus='popup'` 既表示"在推荐池中"，又暗示"显示在弹窗"
- 实际上推荐池是数据状态，弹窗/清单是显示方式
- 切换显示模式时需要修改文章字段，可能导致数据丢失

## 新架构设计

### 核心理念

**推荐池 = 待推荐的文章集合**（数据状态）  
**弹窗/清单 = 显示方式**（UI 状态）

### 1. 推荐池统一管理

```typescript
// feedArticles 表字段
interface FeedArticle {
  poolStatus: 'candidate' | 'recommended' | 'exited'
  // 'recommended': 在推荐池中（待用户处理）
  // 'candidate': 在候选池中（等待补充）
  // 'exited': 已退出（已读/已拒绝/过期等）
}
```

**关键点**：
- 推荐池中的文章 `poolStatus='recommended'`
- 无需 `'popup'` 状态，因为推荐池本身就是"待显示"的概念
- 显示位置不影响 poolStatus

### 2. 弹窗显示策略

#### 模式 1: 弹窗显示推荐（deliveryMode='popup'）

```typescript
// 获取弹窗显示的推荐（前3条）
const popupRecommendations = await db.feedArticles
  .filter(a => 
    a.poolStatus === 'recommended' && 
    !a.isRead && 
    a.feedback !== 'dismissed'
  )
  .sortBy('analysisScore')  // 降序
  .slice(0, 3)  // 只显示前3条
```

**处理流程**：
1. 用户处理某条推荐（已读/拒绝）
2. 更新该文章：`poolStatus='exited'`
3. 弹窗自动显示下一条（推荐池中的第4、5、6...条）
4. RefillScheduler 定期补充推荐池到目标大小

#### 模式 2: 清单显示推荐（deliveryMode='readingList'）

```typescript
// 1. 获取推荐池中的所有推荐
const allRecommendations = await db.feedArticles
  .filter(a => a.poolStatus === 'recommended')
  .toArray()

// 2. 同步到阅读清单
for (const rec of allRecommendations) {
  await ReadingListManager.addToReadingList(rec)
}

// 3. 弹窗显示汇总信息
const summary = {
  count: allRecommendations.length,
  unread: allRecommendations.filter(a => !a.isRead).length
}
```

**处理流程**：
1. 推荐池有新文章 → 自动添加到阅读清单
2. 用户在清单中阅读 → 更新 `isRead=true`，但 `poolStatus` 保持 `'recommended'`
3. 定期清理：将已读/已拒绝的标记为 `poolStatus='exited'`

### 3. 切换显示模式的处理

#### 从弹窗切换到清单

```typescript
async function switchToReadingList() {
  // 1. 获取当前推荐池中的所有推荐
  const recommendations = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended')
    .toArray()
  
  // 2. 添加到阅读清单
  for (const rec of recommendations) {
    await ReadingListManager.addToReadingList(rec)
  }
  
  // 3. 更新配置
  await updateRecommendationConfig({ deliveryMode: 'readingList' })
  
  // 4. 更新弹窗显示（显示汇总）
  await updatePopupView('summary')
  
  // 注意：不修改推荐池中文章的 poolStatus
}
```

#### 从清单切换到弹窗

```typescript
async function switchToPopup() {
  // 1. 获取推荐池中的文章
  const recommendations = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended')
    .toArray()
  
  // 2. 从阅读清单中移除对应条目
  for (const rec of recommendations) {
    await ReadingListManager.removeFromReadingList(rec.link)
  }
  
  // 3. 更新配置
  await updateRecommendationConfig({ deliveryMode: 'popup' })
  
  // 4. 更新弹窗显示（显示前3条推荐）
  await updatePopupView('recommendations')
  
  // 注意：不修改推荐池中文章的 poolStatus
}
```

**关键优势**：
- ✅ 推荐池数据保持不变，切换无数据丢失
- ✅ 阅读清单只是推荐的一个"视图"
- ✅ 来回切换不会影响推荐池状态

### 4. 数据流示意

```
候选池 (candidate)
    ↓ (RefillScheduler 补充)
推荐池 (recommended) ← 统一数据源
    ↓
    ├─ deliveryMode='popup' → 弹窗显示前3条
    │                          用户处理后显示下一条
    │
    └─ deliveryMode='readingList' → 同步到阅读清单
                                     弹窗显示汇总信息
```

## 实施步骤

### 阶段 1: 修改 poolStatus 枚举

```typescript
// src/types/rss.ts
export type PoolStatus = 
  | 'candidate'      // 候选池：等待补充
  | 'recommended'    // 推荐池：待用户处理
  | 'exited'         // 已退出：已读/已拒绝/过期
```

### 阶段 2: 数据库迁移（v22）

```typescript
// 将所有 poolStatus='popup' 改为 'recommended'
this.version(22).upgrade(async tx => {
  const articles = await tx.table('feedArticles')
    .filter(a => a.poolStatus === 'popup')
    .toArray()
  
  for (const article of articles) {
    await tx.table('feedArticles').update(article.id, {
      poolStatus: 'recommended'
    })
  }
})
```

### 阶段 3: 修改弹窗显示逻辑

- `popup.tsx`: 根据 deliveryMode 显示不同内容
- 弹窗模式：显示前3条推荐
- 清单模式：显示汇总信息

### 阶段 4: 修改 RefillScheduler

- 补充目标：`poolStatus='recommended'` 的文章
- 容量控制：保持推荐池在目标大小
- 移除对 `'popup'` 状态的引用

### 阶段 5: 修改显示模式切换逻辑

- `RecommendationSettings.tsx`: 切换时同步阅读清单
- 不修改推荐池文章的 poolStatus

### 阶段 6: 清理旧代码

- 移除所有 `poolStatus='popup'` 的引用
- 更新测试用例
- 更新文档

## 预期效果

### 用户体验改进

1. **切换无损失**：在弹窗和清单间切换不会丢失推荐
2. **显示一致**：推荐池大小与实际推荐数量一致
3. **逻辑清晰**：推荐池 = 数据，弹窗/清单 = 视图

### 代码质量改进

1. **概念清晰**：推荐池状态与显示方式分离
2. **易于维护**：显示逻辑集中在 UI 层
3. **扩展性强**：未来可添加其他显示方式（如邮件、通知等）

### 性能优化

1. **减少写操作**：切换显示模式不修改数据库
2. **简化查询**：推荐池查询条件统一
3. **降低复杂度**：状态转换逻辑简化

## 风险评估

### 低风险

- **数据迁移简单**：只需重命名状态值
- **向后兼容**：旧数据自动迁移
- **回滚容易**：可保留旧代码作为备份

### 需要注意

- **阅读清单同步**：确保推荐池与清单一致性
- **并发处理**：切换显示模式时的竞态条件
- **性能测试**：大量推荐时的显示性能

## 时间估算

- 阶段 1-2（类型和迁移）: 1小时
- 阶段 3-4（显示和调度）: 2小时
- 阶段 5-6（切换和清理）: 1.5小时
- 测试和验证: 1小时

**总计**: ~5.5 小时
