# RSS 订阅源文章持久化架构重构

## 问题分析

### 当前架构的问题

1. **文章被删除导致统计错误**
   - RSS 源更新时，旧文章会被删除（保留 20-50 条最新）
   - 推荐池中的文章可能已不在 `feedArticles` 表中
   - 用户阅读推荐后，无法在 RSS 源统计中反映（蓝色方块不显示）

2. **重复数据困扰**
   - 同一篇文章可能被多次抓取
   - 没有有效的去重机制
   - 历史统计不准确

3. **推荐文章丢失**
   - 推荐后的文章可能在下次 RSS 更新时被删除
   - 用户还没来得及阅读就消失了

4. **统计逻辑混乱**
   - 显示"未分析"和"已分析"状态意义不大
   - 真正有意义的是：推荐、已读、不想读

## 新架构设计

### 核心原则

1. **文章永久保留**：所有文章只更新状态，不删除
2. **增量更新**：RSS 更新只追加新文章
3. **状态驱动**：通过状态字段管理文章生命周期
4. **推荐保护**：已推荐的文章不会被删除

### 数据模型

#### FeedArticle 状态字段

```typescript
interface FeedArticle {
  id: string                // 文章唯一 ID（基于 link）
  feedId: string            // 所属 RSS 源
  title: string
  link: string              // 文章链接
  published: number         // 发布时间
  fetched: number           // 首次抓取时间
  
  // 状态字段（核心）
  recommended: boolean      // 是否曾被推荐
  read: boolean             // 是否已读
  disliked: boolean         // 是否不想读
  starred: boolean          // 是否收藏
  
  // 推荐相关
  inPool: boolean           // 是否在推荐池中（未处理）
  poolAddedAt?: number      // 加入推荐池时间
  poolRemovedAt?: number    // 移出推荐池时间（被踢出或已处理）
  poolRemovedReason?: 'read' | 'disliked' | 'replaced' | 'expired'
  
  // 分析数据
  analysis?: AnalysisResult
  
  // 元数据
  description?: string
  content?: string
  author?: string
}
```

### 文章生命周期

```
1. 抓取 → fetched=true, inPool=false
2. 分析 → analysis 有值
3. 推荐 → recommended=true, inPool=true, poolAddedAt 设置
4. 用户处理：
   - 阅读 → read=true, inPool=false, poolRemovedAt 设置, reason='read'
   - 不想读 → disliked=true, inPool=false, poolRemovedAt 设置, reason='disliked'
   - 被踢出 → inPool=false, poolRemovedAt 设置, reason='replaced'
```

### RSS 更新策略

#### 旧策略（需要废弃）
```typescript
// ❌ 删除旧文章
const articlesToDelete = currentArticles
  .filter(a => !latestIds.has(a.id))
await db.feedArticles.bulkDelete(articlesToDelete)
```

#### 新策略（增量追加）
```typescript
// ✅ 只追加新文章
const newArticles = latestArticles.filter(article => {
  const id = getArticleId(article)
  return !existingIds.has(id)
})

await db.feedArticles.bulkAdd(newArticles)

// ✅ 更新已存在文章的元数据（标题可能变化）
const articlesToUpdate = latestArticles.filter(article => {
  const id = getArticleId(article)
  return existingIds.has(id)
})

for (const article of articlesToUpdate) {
  const existing = await db.feedArticles.get(article.id)
  if (existing) {
    // 只更新元数据，不改变状态字段
    await db.feedArticles.update(article.id, {
      title: article.title,
      description: article.description,
      content: article.content
    })
  }
}
```

### 推荐池管理

#### 加入推荐池
```typescript
async function addToRecommendationPool(articleId: string) {
  await db.feedArticles.update(articleId, {
    recommended: true,
    inPool: true,
    poolAddedAt: Date.now()
  })
}
```

#### 移出推荐池
```typescript
async function removeFromPool(
  articleId: string, 
  reason: 'read' | 'disliked' | 'replaced' | 'expired'
) {
  const updates: Partial<FeedArticle> = {
    inPool: false,
    poolRemovedAt: Date.now(),
    poolRemovedReason: reason
  }
  
  // 设置对应的状态
  if (reason === 'read') updates.read = true
  if (reason === 'disliked') updates.disliked = true
  
  await db.feedArticles.update(articleId, updates)
}
```

### UI 统计显示

#### 旧显示逻辑（需要废弃）
- 绿色：推荐待处理
- 蓝色：已读
- 红色：不想读
- 灰色：已分析但未推荐
- 白色：未分析

#### 新显示逻辑（简化）
- 绿色：推荐待处理 (`recommended=true && inPool=true`)
- 蓝色：已读 (`read=true`)
- 红色：不想读 (`disliked=true`)

**注意**：
- 不再显示"已分析"和"未分析"（意义不大）
- 进度条只显示有意义的状态
- 总数 = 所有历史文章数（可能很大）
- 显示策略：只显示最近 N 条的状态方块，但统计数字显示全部

### 数据库索引优化

```typescript
feedArticles: 'id, feedId, link, published, inPool, [feedId+published], [inPool+poolAddedAt], [read+published], [disliked+published]'
```

新增索引：
- `inPool`: 快速查询推荐池文章
- `[inPool+poolAddedAt]`: 推荐池排序

## 实施步骤

### Phase 1: 数据库 Schema 升级

1. 添加新字段：`inPool`, `poolAddedAt`, `poolRemovedAt`, `poolRemovedReason`
2. 数据迁移：
   - 根据 `recommendations` 表回填 `recommended=true`
   - 根据 `recommendations.isRead` 回填 `read=true`
   - 根据 `recommendations.feedback='dismissed'` 回填 `disliked=true`
   - 根据 `recommendations.status='active'` 回填 `inPool=true`

### Phase 2: RSS 更新逻辑重构

1. 移除文章删除逻辑
2. 实现增量追加策略
3. 保护已推荐文章

### Phase 3: 推荐池逻辑重构

1. 推荐生成时：设置 `inPool=true`
2. 用户阅读时：设置 `read=true, inPool=false`
3. 用户不想读时：设置 `disliked=true, inPool=false`
4. 推荐替换时：设置 `inPool=false, reason='replaced'`

### Phase 4: UI 统计重构

1. 简化方块显示逻辑（只显示 3 种颜色）
2. 支持大数据量显示（虚拟滚动或采样显示）
3. 添加历史统计（总文章数、总推荐数、总阅读数）

### Phase 5: 性能优化

1. 定期清理超过 6 个月的未推荐文章
2. 压缩旧文章内容（只保留 title + link）
3. 分页查询大数据量

## 回归测试

需要验证的功能点：

1. ✅ RSS 更新不删除旧文章
2. ✅ 推荐文章永久保留
3. ✅ 用户阅读后蓝色方块正确显示
4. ✅ 用户不想读后红色方块正确显示
5. ✅ 推荐池大小限制仍然生效
6. ✅ 统计数字准确（推荐数、已读数、不想读数）
7. ✅ 性能不受影响（大数据量下）

## 预期效果

### 问题解决

1. ✅ 推荐文章不会丢失
2. ✅ 统计永远准确
3. ✅ 历史数据完整
4. ✅ 去重简单可靠

### 副作用

1. ⚠️ 数据库会持续增长
   - 缓解：定期清理旧文章（6 个月后）
   
2. ⚠️ 进度条可能很长
   - 缓解：采样显示（最近 100 条）+ 总数统计

3. ⚠️ 查询性能可能下降
   - 缓解：优化索引 + 分页查询

## 与旧架构的对比

| 特性 | 旧架构 | 新架构 |
|------|--------|--------|
| 文章保留 | 20-50 条 | 全部保留 |
| RSS 更新 | 全量替换 | 增量追加 |
| 推荐保护 | 无 | 有（inPool 标记） |
| 统计准确性 | 不准确 | 准确 |
| 去重 | 复杂 | 简单（ID 唯一） |
| 数据库大小 | 小 | 大（需定期清理） |
| 查询性能 | 快 | 可能慢（需优化） |

## 待解决的设计问题

### 1. 推荐池容量限制

**问题**：如果推荐池最多 10 条，新推荐会踢出旧推荐。被踢出的文章应该如何标记？

**方案**：
- 设置 `inPool=false, poolRemovedReason='replaced'`
- `recommended=true` 保持不变（曾被推荐过）
- UI 中不显示为"已推荐"（因为已被踢出）

### 2. DiscoveredFeed.latestArticles 字段

**问题**：这个字段存储最近文章列表，是否还需要？

**方案**：
- 废弃此字段（改为动态查询）
- 或改为存储"最近显示的文章 ID 列表"（仅用于 UI 显示顺序）

### 3. 文章清理策略

**问题**：数据库会无限增长，何时清理？

**方案**：
- 保留规则：
  - 所有 `recommended=true` 的文章（永久保留）
  - 最近 3 个月的文章（无论是否推荐）
  - 超过 3 个月且未推荐的文章 → 删除
  
- 清理时机：
  - 每周执行一次
  - 在 RSS 更新后触发

## 开发计划

### Sprint 1: Schema 升级和数据迁移（2小时）
- [ ] 升级数据库 Schema
- [ ] 编写数据迁移脚本
- [ ] 验证迁移结果

### Sprint 2: RSS 更新逻辑重构（3小时）
- [ ] 重写 `fetchFeed` 函数
- [ ] 移除删除逻辑
- [ ] 添加增量追加逻辑
- [ ] 单元测试

### Sprint 3: 推荐池逻辑重构（2小时）
- [ ] 重写 `addToRecommendationPool`
- [ ] 重写 `markAsRead` 和 `dismissRecommendations`
- [ ] 验证推荐池容量限制

### Sprint 4: UI 统计重构（2小时）
- [ ] 简化方块显示逻辑
- [ ] 优化大数据量显示
- [ ] 添加历史统计面板

### Sprint 5: 测试和优化（2小时）
- [ ] 回归测试
- [ ] 性能测试
- [ ] 文档更新

**总估时**：11 小时
