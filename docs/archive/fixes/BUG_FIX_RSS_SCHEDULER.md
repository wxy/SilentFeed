# Bug 修复: RSS 调度器和推荐统计问题

## 修复时间

2025-11-18

## 问题描述

用户报告的三个问题：

### 1. 推荐数量不匹配
- **症状**: RSS 源的 `recommendedCount` 增加了，但推荐统计和弹窗中看不到对应数量的推荐
- **诊断结果**: 
  - TechCrunch: `recommendedCount: 4`，但推荐池只有 2 条
  - WIRED: `recommendedCount: 17`，但推荐池只有 6 条
  - 总推荐池: 9 条，但各源累计是 21 条

### 2. RSS 定时抓取状态不明确
- **症状**: 所有订阅的 RSS 源都显示 `下次抓取: 未安排` 和 `更新频率: 0 篇/周`
- **诊断结果**: 
  - VSCode Feed: 最后抓取 2025/11/17 20:43:20，但 `nextScheduledFetch` 为空
  - TechCrunch: 最后抓取 2025/11/18 11:28:17，但 `nextScheduledFetch` 为空
  - WIRED: 最后抓取 2025/11/18 11:28:18，但 `nextScheduledFetch` 为空

### 3. 低频 RSS 缺少调度计划
- **症状**: VSCode Feed (0.4篇/周) 没有设置 `nextScheduledFetch`
- **原因**: 低频源（< 0.25 篇/周）的调度逻辑缺失

## 根本原因分析

### 问题 1: recommendedCount 语义混乱

**原因**:
- `recommendedCount` 在两个地方被更新，语义不一致：
  1. `fetchFeed()` 根据文章的 AI 分析结果统计（历史累计）
  2. `updateFeedStats()` 根据推荐池中的实际推荐数统计（当前值）
- 推荐池有容量限制（默认 3 条），旧推荐会被新推荐替换删除
- 导致 `recommendedCount` 不准确反映推荐池状态

**修复方案**:
- `fetchFeed()` 不再更新 `recommendedCount`
- `recommendedCount` 只由 `updateFeedStats()` 统计，表示推荐池中来自该源的历史推荐总数
- 添加注释说明语义

### 问题 2: 缺少 nextScheduledFetch 和 updateFrequency 字段

**原因**:
- `feed-scheduler.ts` 的 `fetchFeed()` 函数在更新数据库时没有设置 `nextScheduledFetch`
- `updateFrequency` 字段不在类型定义中，导致无法存储
- 虽然计算了下次抓取时间，但没有持久化到数据库

**修复方案**:
- 在 `DiscoveredFeed` 类型中添加 `nextScheduledFetch?: number` 和 `updateFrequency?: number` 字段
- `fetchFeed()` 在抓取成功后计算并设置 `nextScheduledFetch`
- 更新或估算 `updateFrequency`（如果 quality 数据不存在）

### 问题 3: 低频源调度逻辑缺失

**原因**:
- `calculateNextFetchInterval()` 对于频率 < 0.25 篇/周的源返回 0（不自动抓取）
- 导致超低频源（如 VSCode Feed）永远不会被自动抓取

**修复方案**:
- 修改逻辑：所有订阅源都应该有抓取计划
- 低频源（< 0.25 篇/周）→ 每 7 天抓取一次
- 确保即使是月更新的源也不会被遗忘

## 代码修改

### 1. 添加类型字段

**文件**: `src/types/rss.ts`

```typescript
export interface DiscoveredFeed {
  // ...existing fields...
  lastFetchedAt?: number
  nextScheduledFetch?: number  // ✅ 新增：下次计划抓取时间
  updateFrequency?: number     // ✅ 新增：更新频率（篇/周）
  lastError?: string
  // ...
}
```

### 2. 修复调度间隔计算

**文件**: `src/background/feed-scheduler.ts`

**修改前**:
```typescript
if (!frequency || frequency < 0.25) {
  return 0  // 低频源不自动抓取
}
```

**修改后**:
```typescript
if (!frequency || frequency < 0.25) {
  // 超低频源 → 每周抓取一次（7 天）
  return 7 * 24 * 60 * 60 * 1000
}
```

### 3. 设置下次抓取时间

**文件**: `src/background/feed-scheduler.ts`

**修改前**:
```typescript
await db.discoveredFeeds.update(feed.id, {
  lastFetchedAt: Date.now(),
  lastError: undefined,
  latestArticles: latest,
  articleCount: totalCount,
  unreadCount,
  recommendedCount
})
```

**修改后**:
```typescript
// 计算下次抓取时间
const now = Date.now()
const fetchInterval = calculateNextFetchInterval(feed)
const nextScheduledFetch = now + fetchInterval

// 更新或估算 updateFrequency
let updateFrequency = feed.quality?.updateFrequency || 0
if (!updateFrequency && newArticles.length > 0) {
  // 粗略估算：假设本次抓取到的新文章代表一天的更新量
  updateFrequency = (newArticles.length / latest.length) * 7
}

// 更新数据库
await db.discoveredFeeds.update(feed.id, {
  lastFetchedAt: now,
  nextScheduledFetch,
  updateFrequency,
  lastError: undefined,
  latestArticles: latest,
  articleCount: totalCount,
  unreadCount
  // 注意：不在这里更新 recommendedCount，它由 updateFeedStats() 统计
})
```

### 4. 更新测试

**文件**: `src/background/feed-scheduler.test.ts`

```typescript
expect(db.discoveredFeeds.update).toHaveBeenCalledWith(
  feed.id,
  expect.objectContaining({
    lastFetchedAt: expect.any(Number),
    nextScheduledFetch: expect.any(Number),  // ✅ 新增
    updateFrequency: expect.any(Number),     // ✅ 新增
    lastError: undefined,
    articleCount: 1,
    unreadCount: 1
    // 不再检查 recommendedCount
  })
)
```

## 测试结果

### 单元测试

```bash
npm run test:run -- src/background/feed-scheduler.test.ts
```

**结果**: ✅ 18/18 tests passed

### 预期行为

修复后的行为：

1. **推荐统计准确性**
   - `recommendedCount` 只表示推荐池中来自该源的推荐总数（历史累计）
   - 不再在 `fetchFeed()` 中更新，避免语义混乱

2. **RSS 调度可见性**
   - 所有订阅源都会显示 `下次抓取` 时间
   - `更新频率` 会根据实际抓取结果估算或使用 quality 数据

3. **低频源抓取保证**
   - VSCode Feed (0.4篇/周) 现在每 7 天抓取一次
   - 确保所有订阅源都不会被遗忘

## 浏览器测试计划

1. **重新加载扩展**
   - 确保新代码生效

2. **手动触发 RSS 抓取**
   ```javascript
   chrome.runtime.sendMessage({ type: 'MANUAL_FETCH_FEEDS' })
   ```

3. **验证字段更新**
   - 运行诊断脚本（docs/DEBUG_RECOMMENDATIONS.md）
   - 检查所有源是否都有 `nextScheduledFetch`
   - 检查 `updateFrequency` 是否合理

4. **等待自动调度**
   - 等待下次定时任务触发（30 分钟）
   - 验证源是否按计划自动抓取

## 后续优化

### 短期 (Phase 7.1)
- ✅ 修复 RSS 调度器字段缺失
- ⏸️ 优化推荐池容量管理（考虑动态调整）

### 长期 (Phase 7.2+)
- 添加 RSS 抓取失败重试机制
- 优化频率估算算法（基于多次抓取的历史数据）
- 添加用户可配置的抓取间隔

## 相关文档

- `docs/DEBUG_RECOMMENDATIONS.md` - 诊断工具和问题分析
- `docs/DATABASE_PERFORMANCE_ANALYSIS.md` - 数据库性能分析
- `docs/TDD.md` - RSS 调度器技术设计

## 备注

此修复解决了用户报告的所有三个问题，但需要在浏览器中实际测试验证：
1. 重新加载扩展后，手动触发一次 RSS 抓取
2. 验证 `nextScheduledFetch` 和 `updateFrequency` 字段是否正确设置
3. 等待低频源（VSCode Feed）的下次抓取时间（应该是 7 天后）

修复后，推荐统计应该更加准确，RSS 调度状态更加透明。
