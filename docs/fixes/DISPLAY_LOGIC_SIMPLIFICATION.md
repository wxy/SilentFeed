# 推荐显示逻辑简化

## 问题背景

原有实现在数据库中记录 `displayLocation` 字段来标记推荐条目的显示位置（'popup' | 'readingList'），导致逻辑复杂且冗余：

1. 创建推荐时需要决定并记录 `displayLocation`
2. 切换显示模式时需要更新数据库中所有推荐的 `displayLocation`
3. Popup 和阅读清单都需要查询特定 `displayLocation` 的推荐

这违反了"单一数据源"原则，因为显示位置应该由系统配置决定，而不是由数据库记录决定。

## 解决方案

### 核心原则

**显示位置完全由配置驱动，不在数据库中记录**

### 实现细节

#### 1. 移除 `displayLocation` 字段

```diff
// src/types/database.ts
export interface Recommendation {
  id: string
  feedId: string
  // ... 其他字段
- displayLocation?: 'popup' | 'readingList' | 'both'
}
```

#### 2. RefillScheduler：根据配置立即处理

```typescript
// src/background/refill-scheduler.ts
private async createRecommendations(...): Promise<void> {
  // ... 创建推荐
  
  // 根据当前配置决定是否写入阅读清单
  const config = await getRecommendationConfig()
  if (config.deliveryMode === 'readingList') {
    await this.writeToReadingList(recommendations)
  }
}

private async writeToReadingList(recommendations: Recommendation[]): Promise<void> {
  for (const rec of recommendations) {
    await ReadingListManager.addToReadingList(rec.title, rec.url, rec.isRead)
  }
}
```

#### 3. Background：模式切换只操作 Chrome API

```typescript
// src/background.ts
case 'DELIVERY_MODE_CHANGED':
  if (deliveryMode === 'readingList') {
    // 切换到阅读清单：将当前推荐写入清单
    const activeRecs = await db.recommendations
      .filter(rec => isActive && !isRead && !dismissed)
      .toArray()
    
    for (const rec of activeRecs) {
      await ReadingListManager.addToReadingList(rec.title, rec.url, rec.isRead)
      // ❌ 不再更新 displayLocation
    }
  } else if (deliveryMode === 'popup') {
    // 切换到弹窗：从清单删除由扩展管理的条目
    const entries = await chrome.readingList.query({})
    const ourEntries = entries.filter(e => e.title?.startsWith('🤫 '))
    
    for (const entry of ourEntries) {
      await ReadingListManager.removeFromReadingList(entry.url)
      // ❌ 不再更新 displayLocation
    }
  }
```

#### 4. Popup：根据配置显示内容

```tsx
// src/popup.tsx
{deliveryMode === 'readingList' ? (
  <ReadingListSummaryView />  // 阅读清单模式：显示汇总
) : (
  <RecommendationView />       // 弹窗模式：显示推荐条目
)}
```

## 数据流

### 创建推荐

```
RefillScheduler
  ↓
创建推荐记录（不包含 displayLocation）
  ↓
查询配置：deliveryMode === 'readingList'?
  ↓ Yes
写入 Chrome Reading List
  ↓ No
完成（不操作阅读清单）
```

### 切换模式

```
用户切换模式
  ↓
保存配置：deliveryMode
  ↓
切换到阅读清单？
  ↓ Yes
查询活跃推荐 → 写入 Chrome Reading List
  ↓ No
查询阅读清单 → 删除扩展管理的条目
  ↓
完成（数据库状态不变）
```

### 显示推荐

```
Popup 加载
  ↓
读取配置：deliveryMode
  ↓
deliveryMode === 'readingList'?
  ↓ Yes
显示 ReadingListSummaryView
  ↓ No
显示 RecommendationView
```

## 优势

1. **单一数据源**：显示位置只由配置决定，没有冗余状态
2. **逻辑简化**：
   - 创建推荐时不需要决定显示位置
   - 切换模式时不需要更新数据库
   - 查询推荐时不需要过滤 displayLocation
3. **易于维护**：配置和状态分离，职责清晰
4. **性能提升**：减少数据库更新操作

## 相关文件

- [src/types/database.ts](../../src/types/database.ts) - 移除字段定义
- [src/background/refill-scheduler.ts](../../src/background/refill-scheduler.ts) - 简化创建逻辑
- [src/background.ts](../../src/background.ts) - 简化模式切换
- [src/popup.tsx](../../src/popup.tsx) - 根据配置显示

## 测试验证

- ✅ 所有测试通过（2165 passed, 10 skipped）
- ✅ 编译成功（无 TypeScript 错误）
- ✅ Popup 根据配置正确切换视图
- ✅ 模式切换不修改数据库状态

## Commit

```
commit c60f87c
refactor: 简化推荐显示逻辑,移除 displayLocation 字段

- 移除 Recommendation 类型中的 displayLocation 字段
- 简化 RefillScheduler，根据配置立即处理阅读清单
- 简化 background.ts 模式切换逻辑，不修改数据库状态
- 切换模式时只操作 Chrome Reading List API
- Popup 根据 deliveryMode 配置决定显示内容

显示位置完全由配置驱动，不在数据库中记录
```
