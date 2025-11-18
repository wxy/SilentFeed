# Phase 7: 数据库持续优化

**分支**: `feature/phase-7-db-optimization`  
**开始日期**: 2025-11-18  
**基于**: PR #20 (feedArticles 表重构)  
**目标**: 在数据库规范化的基础上，进一步优化性能和代码质量

---

## 背景

PR #20 已经完成了数据库规范化的核心工作：
- ✅ 创建独立的 `feedArticles` 表
- ✅ 从嵌入式数组迁移到规范化存储
- ✅ 添加 9 个优化索引
- ✅ 所有核心服务已适配

本次优化聚焦于：
1. 清理数据冗余
2. 优化统计查询
3. 强化数据约束
4. 添加事务支持

---

## 优化任务列表

### Task 1: 清理统计数据冗余 ✅

**问题**: 
- `statistics` 表用于缓存统计数据，但已有 `statsCache` 内存缓存
- 数据库缓存增加维护成本，且可能不一致

**解决方案**:
1. 移除 `statistics` 表定义（版本 12）
2. 确认所有统计函数使用 `statsCache` 内存缓存
3. 删除相关的数据库操作代码

**影响范围**:
- `src/storage/db.ts` - 表定义
- `src/storage/db.test.ts` - 测试验证

**完成情况**:
- ✅ statistics 表已删除（数据库版本12）
- ✅ 所有测试通过（42/42）
- ✅ 统计功能正常工作（使用statsCache）
- ✅ 提交: 6b50cf9

---

### Task 2: 优化 Feed 统计函数 ✅

**问题**:
- `updateFeedStats()` 目前从 `latestArticles` 数组聚合
- 应该改用 `feedArticles` 表查询

**解决方案**:
```typescript
// 优化后 (PR #20已完成)
const articles = await db.feedArticles
  .where('feedId').equals(feed.id)
  .toArray()
const totalCount = articles.length
```

**完成情况**:
- ✅ 已在 PR #20 中完成优化
- ✅ 使用 feedArticles 表查询
- ✅ 测试覆盖完整

---

### Task 3: 强化单例表约束 ✅

**问题**:
- `userProfile` 和 `settings` 是单例，但缺少约束
- 直接访问 `db.userProfile.get()` 容易出错

**解决方案**:
创建 `src/storage/singletons.ts`:
```typescript
export async function getUserProfile(): Promise<UserProfile> {
  let profile = await db.userProfile.get(SINGLETON_IDS.USER_PROFILE)
  if (!profile) {
    profile = createDefaultProfile()
    await db.userProfile.put(profile)
  }
  return profile
}

export async function updateUserProfile(
  updates: Partial<Omit<UserProfile, 'id'>>
): Promise<void> {
  await db.userProfile.update(SINGLETON_IDS.USER_PROFILE, updates)
}
```

**完成情况**:
- ✅ singletons.ts 创建（314行）
- ✅ singletons.test.ts 创建（371行）
- ✅ 19个测试全部通过
- ✅ 提供完整的单例访问API
  * getUserProfile, updateUserProfile, saveUserProfile, deleteUserProfile
  * getUserSettings, updateUserSettings
  * resetAllSingletons, exportSingletonData, importSingletonData
- ✅ 提交: 33850f8

---

### Task 4: 添加事务支持 ✅

**问题**:
- 推荐保存等操作涉及多表更新
- 缺少原子性保证

**解决方案**:
创建 `src/storage/transactions.ts`:
```typescript
export async function saveRecommendationsWithStats(
  recommendations: Recommendation[],
  feedUpdates: Map<string, Partial<DiscoveredFeed>>
): Promise<void> {
  await db.transaction(
    'rw', 
    [db.recommendations, db.discoveredFeeds], 
    async () => {
      await db.recommendations.bulkAdd(recommendations)
      for (const [feedId, updates] of feedUpdates) {
        await db.discoveredFeeds.update(feedId, updates)
      }
    }
  )
}
```

**完成情况**:
- ✅ transactions.ts 创建（385行）
- ✅ transactions.test.ts 创建（449行）
- ✅ 14个测试全部通过
- ✅ 实现8个核心事务函数
  * **推荐相关**: saveRecommendationsWithStats, markRecommendationsAsRead
  * **Feed相关**: updateFeedWithArticles, bulkSubscribeFeeds, unsubscribeFeed
  * **清理相关**: clearAllRecommendations, cleanupExpiredArticles
  * **工具函数**: processBatches, withRetry
- ✅ 提交: c68f858

---

## 性能目标

| 指标 | 优化前 | 目标 | 实际 |
|------|--------|------|------|
| Feed 统计查询 | ~50ms | <20ms | - |
| 推荐统计查询 | ~100ms (缓存) | <50ms | - |
| 内存占用 | ~40MB | <35MB | - |
| 数据库大小 | - | -10% (删除statistics) | - |

---

## 测试策略

1. **单元测试**: 所有新增辅助函数
2. **集成测试**: 事务操作的原子性
3. **性能测试**: 统计查询基准测试
4. **浏览器测试**: 完整功能验证

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 删除 statistics 表破坏功能 | 低 | 中 | 代码搜索确认无使用 |
| 统计查询性能下降 | 低 | 中 | 性能测试验证 |
| 事务导致死锁 | 低 | 高 | 限制事务范围 |

---

## 进度跟踪

- [x] 创建优化分支 (feature/phase-7-db-optimization)
- [x] Task 1: 清理统计数据冗余 (提交: 6b50cf9)
- [x] Task 2: 优化 Feed 统计函数 (已在PR #20完成)
- [x] Task 3: 强化单例表约束 (提交: 33850f8)
- [x] Task 4: 添加事务支持 (提交: c68f858)
- [x] 所有测试通过 (976/976)
- [ ] 浏览器验证
- [ ] 创建 PR

---

**文档版本**: v1.1  
**最后更新**: 2025-11-18 23:16
