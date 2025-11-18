# Phase 7: 数据库规范化重构进度

**分支**: `feature/phase-7-db-refactor`  
**开始日期**: 2025-11-18  
**状态**: 进行中 🚧

## 📋 目标

将嵌入式文章数据（`DiscoveredFeed.latestArticles[]`）提取为独立的 `feedArticles` 表，符合数据库范式，提升查询和更新性能。

## ✅ 已完成

### 1. 数据库 Schema 更新 (version 11)

**文件**: `src/storage/db.ts`  
**提交**: d00fb92

- ✅ 添加 `feedArticles` 表定义
- ✅ 设计完整索引：
  - 单字段索引: `id`, `feedId`, `link`, `published`, `recommended`, `read`
  - 复合索引: `[feedId+published]`, `[recommended+published]`, `[read+published]`
- ✅ 实现数据迁移逻辑（v11 upgrade）:
  - 从 `discoveredFeeds.latestArticles` 迁移到 `feedArticles` 表
  - 使用 `bulkAdd` 批量插入，处理重复 URL
  - 保留 `latestArticles` 字段以保证向后兼容
  - 添加详细的迁移日志

**数据库版本**: 9 → 11

### 2. RSS 抓取逻辑更新

**文件**: `src/background/feed-scheduler.ts`  
**提交**: efe6b18

- ✅ 修改 `fetchFeed()` 函数使用 `feedArticles` 表
- ✅ 使用事务保证数据一致性：
  ```typescript
  await db.transaction('rw', [db.discoveredFeeds, db.feedArticles], async () => {
    // 更新 Feed 基本信息
    // 完全替换文章（删除旧 + 插入新）
  })
  ```
- ✅ 采用完全替换策略（简化逻辑，避免增量更新复杂性）
- ✅ 保留 `latestArticles` 字段兼容旧代码

## 🚧 进行中

### 3. 推荐服务更新

**文件**: `src/core/recommender/RecommendationService.ts`  
**当前状态**: 未开始

**需要修改的地方** (38 处 `latestArticles` 引用):
1. **生成推荐时查询文章** (第 216-224 行):
   ```typescript
   // 当前：从 feed.latestArticles 筛选未分析文章
   const unanalyzedArticles = feed.latestArticles.filter(...)
   
   // 改为：从 feedArticles 表查询
   const unanalyzedArticles = await db.feedArticles
     .where('feedId').equals(feed.id)
     .and(article => !article.analysis)
     .toArray()
   ```

2. **保存推荐时更新文章状态** (第 366-385 行):
   ```typescript
   // 当前：更新 latestArticles 数组中的文章
   const feedUpdates = new Map<string, { latestArticles: any[] }>()
   
   // 改为：直接更新 feedArticles 表
   await db.feedArticles.update(articleId, { recommended: true })
   ```

**预计工作量**: 2-3 小时

### 4. Pipeline 更新

**文件**: `src/core/recommender/pipeline.ts`  
**当前状态**: 未开始

**需要修改的地方** (19 处 `latestArticles` 引用):
1. **markArticleAsAnalyzed()** (第 915-937 行):
   ```typescript
   // 当前：更新 latestArticles 数组
   const article = feed.latestArticles.find(a => a.id === articleId)
   article.analysis = analysisResult
   await db.discoveredFeeds.update(feedId, { latestArticles })
   
   // 改为：直接更新 feedArticles 表
   await db.feedArticles.update(articleId, { analysis: analysisResult })
   ```

2. **markArticleAsRecommended()** (第 961-977 行):
   - 类似修改

**预计工作量**: 1-2 小时

### 5. 数据库统计函数更新

**文件**: `src/storage/db.ts`  
**当前状态**: 未开始

**需要修改的地方**:
1. **getFeedStatistics()** (第 949-1000 行):
   ```typescript
   // 当前：从 latestArticles 数组统计
   const articles = feed.latestArticles || []
   const analyzedCount = articles.filter(a => a.analysis).length
   
   // 改为：从 feedArticles 表聚合统计
   const analyzedCount = await db.feedArticles
     .where('feedId').equals(feedId)
     .and(a => !!a.analysis)
     .count()
   ```

2. **markAsDisliked()** (第 608-627 行):
   ```typescript
   // 当前：查找并更新 latestArticles 中的文章
   const article = feed.latestArticles.find(a => a.link === recommendation.url)
   article.disliked = true
   
   // 改为：直接更新 feedArticles 表
   const article = await db.feedArticles.where('link').equals(url).first()
   await db.feedArticles.update(article.id, { disliked: true })
   ```

3. **getStorageStats()** - 清理逻辑 (第 1058-1100 行):
   - 从 `feedArticles` 表统计和清理

**预计工作量**: 2-3 小时

## ⏳ 待完成

### 6. 测试更新

**文件**: 
- `src/storage/db.test.ts` (10+ 处引用)
- `src/storage/rss-data-model.test.ts` (1 处引用)

**需要修改**:
1. Mock 数据从 `latestArticles` 改为 `feedArticles` 表操作
2. 断言从检查数组改为查询表
3. 新增数据库迁移测试

**预计工作量**: 3-4 小时

### 7. 数据库迁移测试

**新建文件**: `src/storage/db-migration.test.ts`

**测试场景**:
- ✅ 空数据库迁移
- ✅ 单个 Feed 多篇文章迁移
- ✅ 多个 Feed 并发迁移
- ✅ 重复 URL 处理
- ✅ analysis 字段保留
- ✅ read/recommended/disliked 状态保留
- ✅ latestArticles 字段保留（兼容性）

**预计工作量**: 2 小时

### 8. 浏览器环境测试

**测试项**:
- ✅ 数据库自动迁移（版本 9 → 11）
- ✅ RSS 抓取和存储
- ✅ 推荐生成
- ✅ 文章状态更新（已读、不想读）
- ✅ 统计数据准确性
- ✅ 性能提升验证

**预计工作量**: 1-2 小时

## 📊 工作量估算

| 任务 | 状态 | 预计时间 | 实际时间 |
|------|------|---------|---------|
| 1. Schema 更新 | ✅ 完成 | 2h | 1.5h |
| 2. Feed Scheduler | ✅ 完成 | 1h | 0.5h |
| 3. RecommendationService | 🚧 进行中 | 2-3h | - |
| 4. Pipeline | ⏳ 待开始 | 1-2h | - |
| 5. DB 统计函数 | ⏳ 待开始 | 2-3h | - |
| 6. 测试更新 | ⏳ 待开始 | 3-4h | - |
| 7. 迁移测试 | ⏳ 待开始 | 2h | - |
| 8. 浏览器测试 | ⏳ 待开始 | 1-2h | - |
| **总计** | | **14-19h** | **2h** |

**完成进度**: 2/19h (约 10.5%)

## 🎯 下一步行动

**优先级 1 (立即执行)**:
1. 更新 `RecommendationService.ts` 查询和更新逻辑
2. 更新 `pipeline.ts` 文章标记逻辑
3. 更新 `db.ts` 统计函数

**优先级 2 (核心功能完成后)**:
4. 更新所有测试用例
5. 编写数据库迁移测试

**优先级 3 (发布前)**:
6. 浏览器环境完整测试
7. 性能基准测试
8. 文档更新

## ⚠️ 注意事项

### 向后兼容策略

1. **保留 `latestArticles` 字段**: 短期内继续同步更新，避免破坏旧代码
2. **双写策略**: 新数据同时写入 `latestArticles` 和 `feedArticles`
3. **渐进式迁移**: 逐步将读取逻辑从数组改为表查询

### 数据一致性

1. **使用事务**: 所有多表操作都要用事务包装
2. **完全替换策略**: Feed 更新时完全替换文章，避免增量更新的复杂性
3. **验证机制**: 关键操作后验证数据一致性

### 性能优化

1. **批量操作**: 优先使用 `bulkAdd`、`bulkUpdate`
2. **索引优化**: 确保常用查询都有对应索引
3. **分页查询**: 大数据量时使用 `limit()` 和 `offset()`

## 📝 技术决策记录

### 决策 1: 完全替换 vs 增量更新

**选择**: 完全替换（删除旧文章 + 插入新文章）

**理由**:
- ✅ 逻辑简单，易于维护
- ✅ 避免复杂的 merge 逻辑
- ✅ 自动清理过期文章
- ✅ 数据一致性更好
- ❌ 性能稍低（但可接受，文章数量有限）

### 决策 2: 保留 latestArticles 字段

**选择**: 短期保留，长期移除

**理由**:
- ✅ 确保向后兼容
- ✅ 降低迁移风险
- ✅ 便于回滚
- ❌ 数据冗余（可接受，过渡期）

### 决策 3: 索引设计

**选择**: 9 个索引（6 单字段 + 3 复合）

**理由**:
- ✅ 覆盖所有常用查询场景
- ✅ 复合索引优化排序查询
- ❌ 增加写入开销（可接受，读多写少）

## 🔗 相关文档

- [Phase 7 优化计划](./PHASE_7_OPTIMIZATION_PLAN.md)
- [数据库设计文档](./TDD.md#数据库设计)
- [测试指南](./TESTING.md)

## 📈 预期收益

**性能提升**:
- 文章查询速度: 提升 **5-10x** (使用索引 vs 数组遍历)
- 文章更新速度: 提升 **3-5x** (直接更新 vs 数组替换)
- 内存占用: 减少 **20-30%** (按需加载 vs 全量加载)

**代码质量**:
- 符合数据库范式 ✅
- 代码逻辑简化 ✅
- 可维护性提升 ✅
- 易于扩展（如全文搜索）✅

**用户体验**:
- 推荐生成更快 ⚡
- 大量文章时不卡顿 ⚡
- 统计数据更准确 📊

---

**最后更新**: 2025-11-18  
**负责人**: AI Assistant  
**审核状态**: 待审核
