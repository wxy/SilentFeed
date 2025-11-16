# 推荐点击问题诊断指南

**问题**: 部分推荐点击后不消失  
**版本**: 包含增强日志的构建

## 🧪 测试步骤

### 1. 重新加载扩展
- 打开 `chrome://extensions/`
- 点击刷新按钮重新加载 FeedAIMuter

### 2. 打开开发者工具
- 右键点击扩展图标 → 检查弹出内容
- 切换到 Console 标签
- 勾选 "Preserve log"（保留日志）

### 3. 触发问题
- 点击扩展图标打开弹窗
- 依次点击每个推荐条目
- 特别关注那篇 NordVPN Review 文章

### 4. 收集日志

每次点击后，应该看到以下日志序列：

```
[RecommendationView] 点击推荐条目: rec-xxx Marshall Heston...
[RecommendationView] 开始标记为已读: rec-xxx
[RecommendationStore] 开始标记已读: rec-xxx
[DB] markAsRead 开始: { id: 'rec-xxx', ... }
[DB] 找到推荐记录: { id: 'rec-xxx', title: '...', isRead: false, sourceUrl: 'https://www.wired.com' }
[DB] ✅ markAsRead 完成: { id: 'rec-xxx', updateCount: 1, ... }
[DB] 验证更新结果: { id: 'rec-xxx', isRead: true, clickedAt: 1731... }
[RecommendationStore] 数据库标记已读成功: rec-xxx
[RecommendationStore] 数据库验证: { id: 'rec-xxx', exists: true, isRead: true }
[RecommendationStore] UI状态更新完成: { id: 'rec-xxx', beforeCount: 3, afterCount: 2, removed: 1 }
[DB] 更新 RSS 源统计: { feedUrl: 'https://www.wired.com/feed/rss', ... }
[RecommendationStore] RSS 源统计已更新: https://www.wired.com/feed/rss
[RecommendationView] ✅ 标记已读完成，条目已从列表移除: rec-xxx
```

## 🔍 关键检查点

### A. 数据库更新是否成功
查找日志：
```
[DB] ✅ markAsRead 完成: { id: 'rec-xxx', updateCount: ? }
```

- **updateCount = 1**: ✅ 更新成功
- **updateCount = 0**: ❌ 更新失败（ID 不存在？）

### B. UI 状态是否更新
查找日志：
```
[RecommendationStore] UI状态更新完成: { ..., removed: ? }
```

- **removed = 1**: ✅ 条目被移除
- **removed = 0**: ❌ 条目未被移除（filter 失败？）

### C. RSS 源统计是否更新
查找日志：
```
[DB] 更新 RSS 源统计: { feedUrl: '...', recommendedCount: X, readCount: Y }
```

对比 RSS Manager 页面显示的数字是否一致。

## 🐛 可能的错误模式

### 错误 1: 找不到推荐记录
```
[DB] ❌ 推荐记录不存在: rec-xxx
```
**原因**: ID 不匹配或数据库中没有这条记录  
**解决**: 检查推荐生成时的 ID 生成逻辑

### 错误 2: 更新数量为 0
```
[DB] ✅ markAsRead 完成: { updateCount: 0 }
```
**原因**: Dexie update 返回 0 表示没有记录被更新  
**解决**: 检查 ID 是否正确，数据库是否损坏

### 错误 3: UI 未移除条目
```
[RecommendationStore] UI状态更新完成: { removed: 0 }
```
**原因**: `filter(r => r.id !== id)` 没有匹配到任何记录  
**解决**: 检查 Store 中的 recommendations 数组和传入的 id 是否一致

### 错误 4: sourceUrl 不匹配
```
[DB] 未找到 RSS 源: https://www.wired.com/feed/rss
```
**原因**: 推荐表中的 sourceUrl 与 feed.url 格式不一致  
**解决**: 统一 URL 格式，或使用模糊匹配

## 📊 数据库检查

如果日志显示正常但问题仍存在，检查数据库实际状态：

```javascript
// 在控制台执行
const { db } = await import('./src/storage/db.js')

// 检查推荐表
const recs = await db.recommendations.toArray()
console.table(recs.map(r => ({
  id: r.id,
  title: r.title.substring(0, 30),
  isRead: r.isRead,
  sourceUrl: r.sourceUrl
})))

// 检查是否有重复 ID
const ids = recs.map(r => r.id)
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
console.log('重复 ID:', duplicates)

// 检查 RSS 源
const feeds = await db.discoveredFeeds.where('status').equals('subscribed').toArray()
console.table(feeds.map(f => ({
  title: f.title.substring(0, 30),
  url: f.url,
  recommendedCount: f.recommendedCount,
  recommendedReadCount: f.recommendedReadCount
})))
```

## 📝 报告问题时请提供

1. 完整的控制台日志（从点击到结束）
2. 数据库检查的输出
3. 哪些推荐可以消失，哪些不能消失
4. 推荐池统计数字的变化
5. RSS Manager 中的统计数字
