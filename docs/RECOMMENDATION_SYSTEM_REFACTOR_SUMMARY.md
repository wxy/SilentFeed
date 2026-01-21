# 推荐系统架构优化总结

## 📋 提交历史

### Commit 1: b854504
**refactor: 删除 recommendations 表并实现推荐池容量控制**

#### 核心变更
1. **数据库架构简化（v21 升级）**
   - 删除独立的 `recommendations` 表
   - 推荐数据统一在 `feedArticles` 表管理
   - 使用 `poolStatus` 字段标识文章状态

2. **旧状态数据迁移**
   - 添加自动迁移旧的 `'recommended'` 状态
   - 按评分和目标池大小智能分类

3. **推荐池容量控制**
   - `cleanupExcessRecommendations()`: 定期清理超限推荐
   - `createRecommendations()`: 添加时检查容量限制
   - 策略：保留高分，退回低分到候选池

4. **字段映射与类型兼容**
   - `getUnreadRecommendations()` 返回 `Recommendation[]` 类型
   - 自动转换 `FeedArticle → Recommendation`

5. **代码全面迁移（50+ 处）**

---

### Commit 2: 9cc2827
**refactor: separate recommendation pool from display mode (popup→recommended)**

#### 核心变更
1. **poolStatus 重命名**：`'popup'` → `'recommended'`

2. **概念分离**
   - 推荐池 (`poolStatus='recommended'`) = 数据状态
   - 显示方式 (`deliveryMode`) = UI 状态

3. **v22 数据库迁移**：自动转换所有 `popup` 状态

4. **批量代码修改**（11个文件）
   - 类型定义、数据库层、业务逻辑、UI 组件全部更新
   - 使用脚本 `scripts/replace-popup-status.sh` 批量替换

5. **删除冗余逻辑**

#### 设计理念
```typescript
// 推荐池：数据状态
poolStatus: 'candidate' | 'recommended' | 'exited'

// 显示方式：配置决定
deliveryMode: 'popup' | 'readingList'

// 优势：切换显示方式不修改推荐池状态，避免数据丢失
```

---

### Commit 3: cb706e5
**feat: limit popup display to top 3 recommendations**

#### 核心变更
1. **弹窗显示限制**
   - 修改 `RecommendationView` 限制 `displayedRecommendations` 为前3条
   - 推荐池中可能有5-6条，但弹窗只显示前3条

2. **自动补充机制**
   - 用户处理某条后，下一条自动补充到前3位置
   - `recommendationStore` 加载推荐池所有文章
   - UI 层过滤显示前3条

#### 设计理念
- **UI 空间优化**：弹窗固定显示3条，避免滚动
- **自动补充**：处理推荐后自动显示下一条
- **推荐池与显示分离**：池中5-6条，UI显示3条

---

## 🎯 整体架构

### 数据流示意图

```
候选池 (candidate)
    ↓ (RefillScheduler 补充)
推荐池 (recommended, 5-6条) ← 统一数据源
    ↓
    ├─ deliveryMode='popup' → 弹窗显示前3条
    │                          用户处理后显示下一条
    │
    └─ deliveryMode='readingList' → 同步到阅读清单
                                     弹窗显示汇总信息
```

### 状态管理

#### feedArticles.poolStatus
- `'raw'`: 未分析
- `'prescreened-out'`: 初筛淘汰
- `'analyzed-not-qualified'`: 已分析但未达标
- `'candidate'`: 候选池（等待补充）
- **`'recommended'`**: 推荐池（待用户处理）
- `'exited'`: 已退出（已读/已拒绝/过期）
- `'stale'`: 已过时

#### 推荐池字段
- `poolStatus='recommended'`: 在推荐池中
- `popupAddedAt`: 加入推荐池时间
- `analysisScore`: AI 评分（0-10）
- `isRead`: 是否已读
- `feedback`: 用户反馈（'dismissed'等）

### 显示模式

#### 弹窗模式（deliveryMode='popup'）
```typescript
// 1. 加载推荐池所有文章
const recommendations = await getUnreadRecommendations()

// 2. 按评分降序排序
const sorted = recommendations.sort((a, b) => b.score - a.score)

// 3. 弹窗只显示前3条
const displayedRecommendations = sorted.slice(0, 3)

// 4. 用户处理某条（已读/拒绝）
// → poolStatus 改为 'exited'
// → recommendationStore 重新加载
// → 弹窗自动显示下一条（第4条补充到第3位）
```

#### 清单模式（deliveryMode='readingList'）
```typescript
// 1. 获取推荐池所有推荐
const recommendations = await db.feedArticles
  .filter(a => a.poolStatus === 'recommended')
  .toArray()

// 2. 同步到阅读清单
for (const rec of recommendations) {
  await ReadingListManager.addToReadingList(rec)
}

// 3. 弹窗显示汇总信息
// - 总条目数
// - 未读数
// - 扩展添加的数量
```

### 模式切换逻辑

#### 从弹窗切换到清单
```typescript
async function switchToReadingList() {
  // 1. 获取推荐池中的所有推荐
  const recommendations = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended')
    .toArray()
  
  // 2. 添加到阅读清单
  for (const rec of recommendations) {
    await ReadingListManager.addToReadingList(rec)
    // 记录映射关系
    await db.readingListEntries.put({ url: rec.link, ... })
  }
  
  // 3. 更新配置
  await updateRecommendationConfig({ deliveryMode: 'readingList' })
  
  // 注意：不修改 poolStatus
}
```

#### 从清单切换到弹窗
```typescript
async function switchToPopup() {
  // 1. 获取阅读清单中由扩展添加的条目
  const entries = await chrome.readingList.query({})
  const ourEntries = entries.filter(e => e.title.startsWith('🤫 '))
  
  // 2. 从阅读清单中移除
  for (const entry of ourEntries) {
    await ReadingListManager.removeFromReadingList(entry.url)
    // 清理映射记录
    await db.readingListEntries.delete(normalizedUrl)
  }
  
  // 3. 更新配置
  await updateRecommendationConfig({ deliveryMode: 'popup' })
  
  // 注意：不修改 poolStatus
}
```

**关键优势**：
- ✅ 推荐池数据保持不变
- ✅ 阅读清单只是推荐的一个"视图"
- ✅ 来回切换不会丢失推荐

---

## 📊 容量管理

### 推荐池容量
- 目标大小：由 AI 策略决定（通常 5-6 条）
- 实际大小：可能略多于目标（补充时机）
- 弹窗显示：固定前3条
- 清理时机：每次 `runRefill()` 开始前

### 容量控制策略
```typescript
// 1. 清理超限推荐
async function cleanupExcessRecommendations(targetPoolSize: number) {
  const allPopupArticles = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended')
    .toArray()
  
  // 按评分降序排序
  const sorted = allPopupArticles.sort((a, b) => 
    (b.analysisScore || 0) - (a.analysisScore || 0)
  )
  
  // 保留高分，退回低分
  const toKeep = sorted.slice(0, targetPoolSize)
  const toMoveBack = sorted.slice(targetPoolSize)
  
  for (const article of toMoveBack) {
    await db.feedArticles.update(article.id, {
      poolStatus: 'candidate',
      poolExitReason: 'capacity_cleanup'
    })
  }
}

// 2. 添加时检查容量
async function createRecommendations(articles: FeedArticle[]) {
  const currentPoolSize = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended' && !a.isRead)
    .count()
  
  const remainingCapacity = Math.max(0, targetPoolSize - currentPoolSize)
  const articlesToAdd = articles.slice(0, remainingCapacity)
  
  // 只添加不超出容量的文章
  for (const article of articlesToAdd) {
    await db.feedArticles.update(article.id, {
      poolStatus: 'recommended',
      popupAddedAt: Date.now()
    })
  }
}
```

---

## 🔄 用户交互流程

### 弹窗模式下处理推荐

```
1. 用户打开弹窗
   ↓
2. RecommendationView 加载推荐池所有文章
   ↓
3. 按评分排序，显示前3条
   ↓
4. 用户点击某条阅读
   ↓
5. markAsRead() → poolStatus='exited'
   ↓
6. recommendationStore 重新加载
   ↓
7. 弹窗自动显示下一条（第4条→第3位）
   ↓
8. RefillScheduler 定期检查容量
   ↓
9. 如果推荐池 < 目标大小，从候选池补充
```

### 清单模式下的同步

```
1. RefillScheduler 补充新推荐到推荐池
   ↓
2. Background 检测到新推荐
   ↓
3. 自动添加到阅读清单
   ↓
4. 用户在侧边栏阅读清单中查看
   ↓
5. 用户在清单中标记已读
   ↓
6. 定期清理：已读推荐 → poolStatus='exited'
```

---

## ✅ 验证要点

### 数据库迁移
- [ ] v21 迁移：recommendations 表已删除
- [ ] v22 迁移：popup 状态已改为 recommended
- [ ] 历史数据正确转换

### 功能验证
- [ ] 弹窗只显示前3条推荐
- [ ] 处理推荐后自动显示下一条
- [ ] 推荐池容量正确控制（不超过目标大小）
- [ ] 切换到清单模式：推荐同步到阅读清单
- [ ] 切换到弹窗模式：清单中扩展条目被删除
- [ ] 来回切换：推荐不丢失

### 性能验证
- [ ] 推荐池查询效率
- [ ] 容量清理不影响用户体验
- [ ] 阅读清单同步性能

---

## 📝 代码修改清单

### 数据库层（src/storage/db/）
- ✅ `index.ts`: v21/v22 迁移
- ✅ `db-recommendations.ts`: 查询改为 recommended
- ✅ `db-stats.ts`: 统计改为 recommended
- ✅ `db-feeds.ts`: Feed 统计改为 recommended

### 业务逻辑层
- ✅ `background.ts`: 消息处理和模式切换
- ✅ `refill-scheduler.ts`: 容量控制和补充
- ✅ `system-stats.ts`: 统计改为 recommended

### UI 层
- ✅ `RecommendationView.tsx`: 限制显示前3条
- ✅ `ReadingListSummaryView.tsx`: 汇总显示
- ✅ `CollectionStats.tsx`: 统计改为 recommended
- ✅ `popup.tsx`: 根据 deliveryMode 切换视图

### 类型定义
- ✅ `rss.ts`: poolStatus 类型定义

### 工具脚本
- ✅ `scripts/replace-popup-status.sh`: 批量替换脚本

---

## 🎉 总结

本次架构优化实现了三大核心改进：

1. **推荐池与显示方式分离**
   - 数据状态（recommended）与 UI 状态（deliveryMode）解耦
   - 切换显示方式不修改数据，避免数据丢失

2. **弹窗显示优化**
   - 固定显示前3条，UI 空间优化
   - 自动补充机制，用户体验流畅

3. **容量管理完善**
   - 自动清理超限推荐
   - 添加时检查容量
   - 保留高分，退回低分

**架构更清晰、逻辑更简单、用户体验更好！** 🚀
