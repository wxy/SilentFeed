# 架构方案深度审查

## 1. 核心设计审查

### 1.1 数据模型问题

#### 🔴 问题：recommendations 表和 feedArticles 表的关系不清晰

**当前设计**：
- `recommendations` 表：存储推荐记录（包括 URL、分数、理由等）
- `feedArticles` 表：存储文章（添加 `inPool` 字段）

**问题**：
1. **数据冗余**：两个表都存储推荐状态
   - `recommendations.status='active'` ↔ `feedArticles.inPool=true`
   - `recommendations.isRead` ↔ `feedArticles.read=true`
   - `recommendations.feedback='dismissed'` ↔ `feedArticles.disliked=true`

2. **同步复杂**：每次状态变更需要更新两个表

3. **一致性风险**：两个表可能不同步

**改进方案 A - 合并到一个表**：
```typescript
// 只保留 feedArticles，废弃 recommendations
interface FeedArticle {
  // ... 现有字段 ...
  
  // 推荐相关（原 recommendations 的字段）
  recommendationScore?: number      // 推荐分数
  recommendationReason?: string     // 推荐理由
  recommendedAt?: number           // 推荐时间
  clickedAt?: number               // 点击时间
  readDuration?: number            // 阅读时长
  scrollDepth?: number             // 滚动深度
  effectiveness?: 'effective' | 'neutral' | 'ineffective'
}
```

**优点**：
- 数据一致性强
- 无需同步
- 查询简单

**缺点**：
- 失去推荐历史（一篇文章被多次推荐的记录）
- 推荐池查询需要扫描整个 feedArticles 表

**改进方案 B - 保持两表但明确关系**：
```typescript
// recommendations 表只是"视图"，真实状态在 feedArticles
// 推荐池 = feedArticles 中 inPool=true 的记录

// 查询推荐池
const pool = await db.feedArticles
  .where('inPool')
  .equals(true)
  .toArray()

// recommendations 表用于：
// 1. 记录推荐历史（一篇文章可能多次被推荐）
// 2. 存储推荐特有的元数据（分数、理由）
// 3. 弹窗显示时的数据源
```

**优点**：
- 保留推荐历史
- 状态管理清晰（feedArticles 为准）

**缺点**：
- 仍需要同步
- 复杂度较高

#### 🟡 问题：inPool 字段的语义不清晰

**当前定义**：`inPool: boolean` - 是否在推荐池中

**问题**：
1. "推荐池"有两种含义：
   - **候选池**：AI 分析后认为值得推荐的文章（可能有几百条）
   - **活跃池**：实际展示给用户的推荐（10 条）

2. 用户处理后应该如何标记？
   - 已读：`inPool=false, read=true` ✅
   - 不想读：`inPool=false, disliked=true` ✅
   - 被替换：`inPool=false, poolRemovedReason='replaced'` ❓

**改进方案 - 更精确的状态字段**：
```typescript
interface FeedArticle {
  // 推荐状态（更精确）
  recommendationStatus: 'none' | 'candidate' | 'active' | 'read' | 'dismissed' | 'replaced'
  
  // 或者分开管理
  everRecommended: boolean      // 是否曾被推荐过（不可逆）
  currentlyInPool: boolean      // 是否当前在推荐池中
  userAction?: 'read' | 'dismissed' | null  // 用户操作
}
```

### 1.2 RSS 更新策略问题

#### 🟢 优点：增量追加策略是正确的

```typescript
// ✅ 只追加新文章
const newArticles = latestArticles.filter(article => {
  const id = getArticleId(article)
  return !existingIds.has(id)
})
```

#### 🔴 问题：如何处理 RSS 源中已删除的文章？

**场景**：
1. RSS 源 A 有 100 篇文章
2. 我们抓取并保存了这 100 篇
3. 下次抓取时，RSS 源只返回最新 50 篇
4. 那么旧的 50 篇文章在 RSS 源中已"消失"

**当前方案**：保留所有文章（不删除）

**问题**：
- 用户在 RSS 管理页面看到文章数量与 RSS 源实际数量不一致
- 例如：RSS 源显示 50 篇，但我们数据库有 100 篇

**改进方案 - 添加"可见性"标记**：
```typescript
interface FeedArticle {
  // ... 现有字段 ...
  
  inFeed: boolean              // 是否仍在 RSS 源中
  lastSeenInFeed?: number      // 最后一次在 RSS 源中出现的时间
}

// RSS 更新时
1. 新文章 → 添加，设置 inFeed=true
2. 已存在且在最新列表中 → 更新 lastSeenInFeed
3. 已存在但不在最新列表中 → 设置 inFeed=false

// UI 显示时
- 订阅源统计：只计算 inFeed=true 的文章
- 历史统计：计算所有文章
```

#### 🟡 问题：文章元数据更新策略

**当前方案**：
```typescript
// 只更新元数据，不改变状态字段
await db.feedArticles.update(article.id, {
  title: article.title,
  description: article.description,
  content: article.content
})
```

**潜在问题**：
1. 如果文章标题被修正怎么办？（如错别字修复）
2. 如果文章内容被更新怎么办？（如添加更新说明）
3. 是否需要记录更新历史？

**改进方案 - 记录更新历史**：
```typescript
interface FeedArticle {
  // ... 现有字段 ...
  
  metadataUpdatedAt?: number   // 元数据最后更新时间
  updateCount?: number         // 更新次数
}

// 更新时
if (existing) {
  const hasChanges = 
    existing.title !== article.title ||
    existing.description !== article.description ||
    existing.content !== article.content
  
  if (hasChanges) {
    await db.feedArticles.update(article.id, {
      title: article.title,
      description: article.description,
      content: article.content,
      metadataUpdatedAt: Date.now(),
      updateCount: (existing.updateCount || 0) + 1
    })
  }
}
```

### 1.3 推荐池管理问题

#### 🔴 问题：推荐池容量限制的实现不明确

**当前描述**：
> 如果推荐池最多 10 条，新推荐会踢出旧推荐

**问题**：
1. 踢出策略是什么？（最低分？最早推荐？）
2. 被踢出的文章应该如何处理？
3. 用户可能正在查看被踢出的文章怎么办？

**改进方案 - 明确踢出策略**：
```typescript
// 推荐池容量管理
async function enforcePoolCapacity(maxSize: number = 10) {
  const pool = await db.feedArticles
    .where('inPool')
    .equals(true)
    .sortBy('recommendationScore')  // 按分数排序
  
  if (pool.length <= maxSize) return
  
  // 踢出策略：保留分数最高的 maxSize 条
  const toKeep = pool.slice(-maxSize)
  const toRemove = pool.slice(0, pool.length - maxSize)
  
  for (const article of toRemove) {
    await db.feedArticles.update(article.id, {
      inPool: false,
      poolRemovedAt: Date.now(),
      poolRemovedReason: 'replaced',
      // ⚠️ 关键：被踢出的文章仍然 recommended=true
      // 以后可能重新进入推荐池（如果分数提高）
    })
  }
}
```

#### 🟡 问题：推荐池与弹窗的关系

**问题**：
1. 推荐池 = 弹窗显示的内容吗？
2. 如果用户关闭弹窗但没有处理，这些推荐应该如何处理？
3. 下次打开弹窗是显示相同的推荐还是新的？

**改进方案 - 分离"池"和"弹窗"**：
```typescript
interface FeedArticle {
  // 推荐池状态
  inPool: boolean              // 是否在推荐池（候选）
  
  // 弹窗显示状态
  inPopup: boolean             // 是否当前在弹窗中显示
  shownInPopupAt?: number      // 最后一次在弹窗中显示的时间
  popupDismissedCount?: number // 用户关闭弹窗但未处理的次数
}

// 逻辑
1. 推荐池 (inPool=true)：AI 筛选的候选文章（10-20 条）
2. 弹窗显示 (inPopup=true)：实际展示给用户的（3-5 条）
3. 用户关闭弹窗但未处理 → popupDismissedCount++
4. 如果 popupDismissedCount > 3 → 自动移出推荐池（用户不感兴趣）
```

### 1.4 UI 统计显示问题

#### 🟡 问题：大数据量下的性能

**当前方案**：
> 显示策略：只显示最近 N 条的状态方块，但统计数字显示全部

**潜在问题**：
1. 如果一个 RSS 源有 10000 篇文章，显示 100 个方块仍然很多
2. 查询所有文章来计算统计数字可能很慢
3. 方块的排序逻辑是什么？（按发布时间？推荐时间？）

**改进方案 - 采样 + 缓存**：
```typescript
// 方案 1: 采样显示（每 N 篇取 1 个）
const totalArticles = await db.feedArticles
  .where('feedId')
  .equals(feedId)
  .count()

const sampleRate = Math.ceil(totalArticles / 100)  // 最多显示 100 个方块

const sampled = await db.feedArticles
  .where('feedId')
  .equals(feedId)
  .reverse()  // 最新的在前
  .toArray()
  .then(articles => articles.filter((_, i) => i % sampleRate === 0))

// 方案 2: 缓存统计数据
// 在 DiscoveredFeed 表中缓存统计结果
interface DiscoveredFeed {
  // ... 现有字段 ...
  
  // 缓存的统计数据
  statsCache: {
    total: number
    recommended: number
    read: number
    disliked: number
    inFeed: number           // 当前仍在 RSS 源中的文章数
    updatedAt: number
  }
}
```

### 1.5 数据清理策略问题

#### 🔴 问题：清理规则可能导致数据丢失

**当前方案**：
> - 所有 `recommended=true` 的文章（永久保留）
> - 最近 3 个月的文章（无论是否推荐）
> - 超过 3 个月且未推荐的文章 → 删除

**潜在问题**：
1. 如果用户订阅了低频 RSS 源（每月更新 1 次），3 个月只有 3 篇文章
2. 如果用户想查看历史文章怎么办？
3. 删除文章会影响统计数据吗？

**改进方案 - 更智能的清理策略**：
```typescript
// 清理规则
async function cleanupOldArticles() {
  const now = Date.now()
  const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000
  
  // 查找可删除的文章
  const candidates = await db.feedArticles
    .where('fetched')
    .below(threeMonthsAgo)
    .filter(article => {
      // 保留规则（任何一条满足就保留）
      return !(
        article.recommended ||      // 曾被推荐
        article.read ||              // 已读
        article.disliked ||          // 不想读
        article.starred ||           // 收藏
        article.inFeed               // 仍在 RSS 源中
      )
    })
    .toArray()
  
  // 分批删除（避免阻塞）
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100)
    await db.feedArticles.bulkDelete(batch.map(a => a.id))
  }
  
  // 更新统计缓存
  await updateAllFeedStats()
}
```

## 2. 架构改进建议

### 2.1 采用"软删除"而非"永久保留"

**问题**：永久保留所有文章会导致数据库无限增长

**改进**：
```typescript
interface FeedArticle {
  // ... 现有字段 ...
  
  deleted: boolean             // 软删除标记
  deletedAt?: number           // 删除时间
  deleteReason?: 'cleanup' | 'user' | 'feed_removed'
}

// RSS 更新时
- 不在最新列表中的文章 → deleted=true, inFeed=false
- 查询时默认过滤 deleted=true 的文章
- 真正删除：只在清理任务中删除 deleted=true 且超过 6 个月的文章
```

### 2.2 引入"文章重要性"评分

**目的**：决定哪些文章值得长期保留

```typescript
interface FeedArticle {
  // ... 现有字段 ...
  
  importance: number           // 重要性评分 0-100
}

// 重要性评分逻辑
function calculateImportance(article: FeedArticle): number {
  let score = 0
  
  if (article.recommended) score += 30      // 被推荐过
  if (article.read) score += 20             // 被阅读过
  if (article.starred) score += 50          // 被收藏
  if (article.readDuration > 180) score += 20  // 深度阅读
  if (article.effectiveness === 'effective') score += 10
  
  return Math.min(100, score)
}

// 清理时保留 importance > 50 的文章
```

### 2.3 数据库分表策略

**目的**：提高大数据量下的查询性能

```typescript
// 方案：按时间分表
- feedArticles_recent (最近 3 个月)
- feedArticles_archive (3-12 个月)
- feedArticles_historical (>12 个月)

// 查询时
- 日常操作只查 feedArticles_recent
- 历史统计查询所有表
- 定期将旧数据移到 archive/historical
```

## 3. 实施优先级调整

### 高优先级（必须实现）
1. ✅ 增量追加策略（不删除文章）
2. ✅ inFeed 标记（区分在源中和已移除）
3. ✅ 推荐池容量管理（明确踢出策略）
4. ✅ 统计缓存（性能优化）

### 中优先级（应该实现）
1. 🟡 软删除机制
2. 🟡 文章重要性评分
3. 🟡 采样显示（UI 性能）
4. 🟡 元数据更新记录

### 低优先级（可选）
1. ⚪ 数据库分表
2. ⚪ 推荐历史记录
3. ⚪ 弹窗显示状态管理

## 4. 风险评估

### 高风险
1. **数据迁移失败** → 备份策略 + 回滚机制
2. **性能严重下降** → 索引优化 + 分页查询 + 缓存
3. **统计数据不一致** → 统一数据源 + 定期校验

### 中风险
1. **UI 显示混乱** → 渐进式发布 + A/B 测试
2. **清理策略失误** → 软删除 + 恢复机制
3. **推荐池逻辑复杂** → 充分测试 + 文档说明

### 低风险
1. 用户习惯改变 → 保持向后兼容
2. 代码复杂度提高 → 代码审查 + 重构

## 5. 最终推荐方案

### 核心改进
1. **保留 recommendations 表**，但作为"视图"使用
   - 真实状态在 feedArticles
   - recommendations 用于记录推荐历史和元数据

2. **添加 inFeed 字段**，区分文章状态
   - inFeed=true: 仍在 RSS 源中
   - inFeed=false: 已从 RSS 源移除但保留在数据库

3. **采用软删除 + 定期清理**
   - deleted=true: 标记为删除
   - 真正删除：6 个月后 + 低重要性

4. **统计缓存 + 采样显示**
   - 在 DiscoveredFeed 中缓存统计数据
   - UI 显示时采样（最多 100 个方块）

5. **明确推荐池管理**
   - 分离候选池（inPool）和显示池（inPopup）
   - 明确踢出策略（按分数）
   - 记录用户忽略次数

### 实施调整
1. Sprint 1: Schema 升级 + 核心字段（inFeed, deleted）
2. Sprint 2: RSS 更新逻辑（增量追加 + inFeed 管理）
3. Sprint 3: 推荐池逻辑（容量管理 + 踢出策略）
4. Sprint 4: UI 优化（缓存 + 采样）
5. Sprint 5: 清理策略 + 测试

**总估时**：13 小时（比原计划多 2 小时）
