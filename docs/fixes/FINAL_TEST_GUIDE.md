# 最终测试指南 - Phase 6 修复验证

**构建版本**: 包含所有 4 个修复  
**测试目标**: 验证 TF-IDF 缓存、统计数据、UI 交互

## 🔄 准备工作

### 1. 重新加载扩展
```
chrome://extensions/ → FeedAIMuter → 刷新按钮
```

### 2. 重置数据（可选，推荐）
打开浏览器控制台：
```javascript
const { resetRecommendationData } = await import('/src/storage/db.js')
await resetRecommendationData()
```

### 3. 打开开发者工具
- 右键扩展图标 → 检查弹出内容
- Console 标签 → 勾选 "Preserve log"

## ✅ 测试 1: TF-IDF 缓存机制

**目标**: 验证 TF-IDF 分数只计算一次

**步骤**:
1. 第一次手动推荐 → 观察日志
2. 第二次手动推荐 → 观察日志
3. 第三次手动推荐 → 观察日志

**预期结果**:
```
# 第一次推荐
[Pipeline] 📊 计算并保存 TF-IDF 分数 (0.3832): Article Title
[Pipeline] 💾 已保存 TF-IDF 分数: article-id, score: 0.3832
[Pipeline] ⏭️ 跳过低分文章 (0.0234): Low Score Article
[Pipeline] 📝 保存 TF-IDF 跳过标记: low-score-id
[Pipeline] 💾 已保存文章分析结果: low-score-id, provider: tfidf-skipped

# 第二次推荐
[RecommendationService] 从 WIRED 收集文章: {总数: 50, 未分析: 10, 已分析: 40, 其中TF-IDF跳过: 35}
[Pipeline] 📊 处理完成: 评分 10 篇, 跳过 8 篇低分, AI 分析 2 篇, 推荐 1 篇
                      ↑                ↑
                   新评分的            之前跳过的不再评分

# 第三次推荐
[RecommendationService] 从 WIRED 收集文章: {总数: 50, 未分析: 5, 已分析: 45, 其中TF-IDF跳过: 40}
                                                      ↑  继续减少
```

**✅ 通过条件**:
- 第二次推荐的"未分析"文章数 < 第一次
- "其中TF-IDF跳过"数量逐次增加
- 没有重复的 `💾 已保存 TF-IDF 分数` 日志

## ✅ 测试 2: 防重复标记

**目标**: 验证不会重复标记已读

**步骤**:
1. 生成 3 条推荐
2. 点击第 1 条推荐
3. **立即再次点击同一位置**（如果推荐没消失）

**预期结果**:
```
# 第一次点击
[DB] markAsRead 开始: { id: 'rec-xxx' }
[DB] 找到推荐记录: { id: 'rec-xxx', isRead: false }
[DB] ✅ markAsRead 完成: { updateCount: 1 }

# 第二次点击（如果推荐没消失）
[DB] markAsRead 开始: { id: 'rec-xxx' }
[DB] 找到推荐记录: { id: 'rec-xxx', isRead: true }
[DB] ⚠️ 推荐已经是已读状态，跳过重复标记: rec-xxx
```

**✅ 通过条件**:
- 第二次点击看到"跳过重复标记"
- 统计数据的已读数不会增加

## ✅ 测试 3: UI 状态同步

**目标**: 验证点击后推荐正常消失

**步骤**:
1. 生成 3 条推荐
2. 依次点击每条推荐
3. 观察弹窗和日志

**预期结果**:
```
[RecommendationStore] 当前列表中的 ID: ['rec-1', 'rec-2', 'rec-3']
[RecommendationStore] 要移除的 ID: rec-1
[RecommendationStore] 🎯 找到匹配的推荐，将被移除: rec-1 Article Title
[RecommendationStore] UI状态更新完成: { beforeCount: 3, afterCount: 2, removed: 1 }
```

**✅ 通过条件**:
- 每次点击都看到"找到匹配的推荐"
- `removed: 1` 表示成功移除
- 推荐从弹窗中消失

**❌ 如果失败**:
```
[RecommendationStore] 当前列表中的 ID: ['rec-1', 'rec-2', 'rec-3']
[RecommendationStore] 要移除的 ID: rec-999  ← ID 不匹配！
[RecommendationStore] UI状态更新完成: { removed: 0 }  ← 没有移除
```

## ✅ 测试 4: 统计数据一致性

**目标**: 验证统计数据正确且一致

**步骤**:
1. 生成 3 条推荐
2. 点击 2 条推荐
3. 对比三处统计数据

**三处数据源**:
- **A. 推荐统计**（弹窗顶部）
- **B. RSS 源统计**（设置 → RSS 管理）
- **C. 数据库实际数据**

**验证脚本**:
```javascript
const { db } = await import('/src/storage/db.js')

// 推荐池统计
const allRecs = await db.recommendations.toArray()
const unread = allRecs.filter(r => !r.isRead && r.feedback !== 'dismissed')
console.log('推荐池统计:', {
  总推荐: allRecs.length,
  未读: unread.length,
  已读: allRecs.filter(r => r.isRead).length
})

// RSS 源统计
const feeds = await db.discoveredFeeds.where('status').equals('subscribed').toArray()
feeds.forEach(f => {
  console.log(`${f.title}:`, {
    推荐数: f.recommendedCount,
    已读数: f.recommendedReadCount
  })
})
```

**✅ 通过条件**:
- 推荐池的已读数 ≤ 总推荐数（不会超过）
- RSS 源的已读数 ≤ 推荐数（不会超过）
- 三处数据逻辑一致（可能数值不同，因为统计范围不同）

## 📊 测试记录表

| 测试项 | 结果 | 备注 |
|-------|------|------|
| TF-IDF 缓存生效 | ⬜ 通过 / ⬜ 失败 |  |
| 防重复标记 | ⬜ 通过 / ⬜ 失败 |  |
| UI 正常消失 | ⬜ 通过 / ⬜ 失败 |  |
| 统计数据一致 | ⬜ 通过 / ⬜ 失败 |  |

## 🐛 如果测试失败

### 场景 1: TF-IDF 缓存仍然失效
- 检查 `其中TF-IDF跳过` 是否增加
- 提供完整的 `[Pipeline]` 和 `[RecommendationService]` 日志

### 场景 2: 推荐点击后不消失
- 检查日志中的 `removed: ?`
- 对比"当前列表中的 ID"和"要移除的 ID"
- 提供 `[RecommendationStore]` 日志

### 场景 3: 统计数据异常
- 运行验证脚本
- 提供数据库实际数据
- 检查是否仍有"已读数 > 推荐数"

## 📌 重要提示

1. **每次测试前都要保留日志**（Preserve log）
2. **如果遇到问题，立即停止操作**，保存控制台日志
3. **提供完整的日志序列**，而不是片段
4. **注明具体的失败场景**（哪条推荐、第几次点击）
