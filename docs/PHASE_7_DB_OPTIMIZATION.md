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
- 可能影响的测试文件

**验收标准**:
- [ ] statistics 表已删除
- [ ] 所有测试通过
- [ ] 统计功能正常工作

---

### Task 2: 优化 Feed 统计函数

**问题**:
- `updateFeedStats()` 目前从 `latestArticles` 数组聚合
- 应该改用 `feedArticles` 表查询

**解决方案**:
```typescript
// 优化前
const articles = feed.latestArticles || []
const totalCount = articles.length

// 优化后
const articles = await db.feedArticles
  .where('feedId').equals(feed.id)
  .toArray()
const totalCount = articles.length
```

**验收标准**:
- [ ] 使用 feedArticles 表查询
- [ ] 性能测试通过
- [ ] 测试覆盖

---

### Task 3: 强化单例表约束

**问题**:
- `userProfile` 和 `settings` 是单例，但缺少约束
- 直接访问 `db.userProfile.get()` 容易出错

**解决方案**:
创建 `src/storage/singletons.ts`:
```typescript
export async function getUserProfile(): Promise<UserProfile> {
  let profile = await db.userProfile.get('default')
  if (!profile) {
    profile = createDefaultProfile()
    await db.userProfile.put(profile)
  }
  return profile
}

export async function updateUserProfile(
  updates: Partial<UserProfile>
): Promise<void> {
  await db.userProfile.update('default', updates)
}
```

**验收标准**:
- [ ] singletons.ts 创建
- [ ] 所有直接访问改为辅助函数
- [ ] 测试覆盖

---

### Task 4: 添加事务支持

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

**验收标准**:
- [ ] transactions.ts 创建
- [ ] 关键操作使用事务
- [ ] 测试覆盖

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

- [x] 创建优化分支
- [ ] Task 1: 清理统计数据冗余
- [ ] Task 2: 优化 Feed 统计函数
- [ ] Task 3: 强化单例表约束
- [ ] Task 4: 添加事务支持
- [ ] 所有测试通过
- [ ] 性能基准测试
- [ ] 浏览器验证
- [ ] 创建 PR

---

**文档版本**: v1.0  
**最后更新**: 2025-11-18
