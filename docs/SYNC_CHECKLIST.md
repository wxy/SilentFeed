# 弹窗和阅读清单同步检查清单

## 核心原则

**数据层**：推荐池（`feedArticles` 表）是单一真相来源
- `poolStatus='recommended'` - 文章在推荐池中
- `addedToReadingListAt` - 记录是否已添加到阅读清单
- `isRead`, `feedback`, `poolExitReason` - 用户操作状态

**显示层**：弹窗和阅读清单只是不同的展示方式
- `deliveryMode='popup'` - 仅弹窗显示
- `deliveryMode='readingList'` - 仅阅读清单显示（弹窗显示摘要）
- `deliveryMode='both'` - 两者同时显示

**同步策略**：
- 弹窗操作 → 更新数据库 → both 模式需同步清理阅读清单
- 阅读清单操作 → 更新数据库 → 弹窗自动反映（因为从数据库读取）

---

## ✅ 已修复的同步场景

### 1. 标记"不想读"（dismissRecommendations）

**弹窗操作**：
- ✅ 更新数据库：`poolStatus='exited'`, `feedback='dismissed'`
- ✅ 检查 `addedToReadingListAt` 字段
- ✅ 如果在清单中，调用 `ReadingListManager.removeFromReadingList(url, true)`
- ✅ 删除 `readingListEntries` 映射记录

**阅读清单操作**：
- ✅ Chrome 监听器：`onEntryRemoved` (hasBeenRead=false)
- ✅ 调用 `handleReadingListRemoved`
- ✅ 更新数据库：`poolStatus='exited'`, `feedback='dismissed'`

**结果**：✅ 两边同步删除

---

### 2. 标记"已读"（markAsRead）

**弹窗操作**：
- ✅ 更新数据库：`isRead=true`, `poolStatus='exited'`
- ✅ 检查 `addedToReadingListAt` 字段
- ✅ 如果在清单中，调用 `ReadingListManager.removeFromReadingList(url, true)`
- ✅ 删除 `readingListEntries` 映射记录

**阅读清单操作**：
- ✅ Chrome 监听器：`onEntryUpdated` (hasBeenRead=true)
- ✅ 更新数据库：`isRead=true`, `poolStatus='exited'`
- ✅ 触发徽章更新和 UI 刷新

**结果**：✅ 两边同步标记已读

---

### 3. "稍后读"（saveToReadingList）

**弹窗操作**：
- ✅ 添加到阅读清单：`ReadingListManager.saveRecommendation()`
- ✅ 更新数据库：
  - `poolStatus='exited'`
  - `poolExitReason='saved'`
  - `feedback='later'`
  - `addedToReadingListAt=now` ✅ 已修复
- ✅ 从弹窗列表移除：`removeFromList([rec.id])`
- ✅ 创建 `readingListEntries` 映射

**阅读清单操作**：
- ✅ Chrome 监听器：`onEntryAdded`
- ✅ 记录调试日志

**结果**：✅ 移出推荐池，添加到清单

---

### 4. Both 模式自动添加（refill-scheduler.writeToReadingList）

**推荐生成后**：
- ✅ 检查 `deliveryMode='both'` 或 `'readingList'`
- ✅ 调用 `ReadingListManager.addToReadingList()`
- ✅ 创建 `readingListEntries` 映射
- ✅ 更新 `addedToReadingListAt=now` ✅ 已修复

**结果**：✅ 推荐自动添加到清单并记录

---

### 5. 模式切换（DELIVERY_MODE_CHANGED）

**切换到 readingList/both**：
- ✅ 查询当前推荐池：`poolStatus='recommended'`
- ✅ 批量添加到阅读清单
- ✅ 创建映射记录
- ✅ 更新 `addedToReadingListAt=now` ✅ 已修复

**切换到 popup**：
- ✅ 查询 `readingListEntries`
- ✅ 批量删除（`removeFromReadingList(url, true)`）
- ✅ 清理映射记录
- ✅ 不修改推荐池状态（推荐保留在弹窗）

**结果**：✅ 模式切换正确同步清单

---

## 🔍 数据流验证

### 推荐生成 → 显示
```
1. RecommendationEngine.generateRecommendations()
   ↓
2. feedArticles 表：poolStatus='recommended'
   ↓
3. deliveryMode='both' ?
   ├─ Yes → writeToReadingList()
   │         ├─ addToReadingList()
   │         ├─ readingListEntries.put()
   │         └─ feedArticles.update({ addedToReadingListAt })
   │
   └─ No → 仅存储在推荐池
   
4. 弹窗：getUnreadRecommendations()
   └─ 从 feedArticles 查询：poolStatus='recommended'
```

### 弹窗操作 → 清单同步
```
1. 弹窗点击"不想读" / "已读"
   ↓
2. dismissRecommendations() / markAsRead()
   ├─ feedArticles.update({ poolStatus='exited' })
   ├─ 检查 addedToReadingListAt
   └─ 如果在清单 → removeFromReadingList(url, true)
                    └─ readingListEntries.delete()
   
3. 阅读清单自动移除
```

### 清单操作 → 弹窗同步
```
1. 阅读清单标记"已读" / 删除
   ↓
2. Chrome 监听器触发
   ├─ onEntryUpdated (hasBeenRead=true)
   └─ onEntryRemoved (hasBeenRead=false/true)
   
3. handleReadingListRemoved()
   └─ feedArticles.update({ poolStatus='exited' })
   
4. 弹窗下次查询时自动过滤
   └─ getUnreadRecommendations() 只返回 poolStatus='recommended'
```

---

## 🎯 关键字段

### feedArticles 表
- `poolStatus` - 推荐池状态（'recommended' | 'exited'）
- `addedToReadingListAt` - 是否在阅读清单（用于删除时检查）
- `isRead` - 是否已读
- `feedback` - 用户反馈（'dismissed' | 'later' | null）
- `poolExitReason` - 退出原因（'read' | 'disliked' | 'saved'）

### readingListEntries 表
- `normalizedUrl` - 主键（规范化的 URL）
- `recommendationId` - 关联的文章 ID
- `originalUrl` - 原始 URL
- `addedAt` - 添加时间

---

## 🚨 注意事项

1. **skipListener=true**
   - 程序删除（模式切换、弹窗操作）必须设置
   - 避免触发 `onEntryRemoved` 监听器造成重复处理

2. **addedToReadingListAt 字段**
   - 所有添加到清单的地方必须设置此字段
   - 删除前必须检查此字段（判断是否在清单）

3. **推荐池状态**
   - `poolStatus='recommended'` - 活跃推荐
   - `poolStatus='exited'` - 已处理（已读/不想读/稍后读）
   - 弹窗只显示 `poolStatus='recommended'`

4. **both 模式特殊性**
   - 推荐自动添加到清单（生成时）
   - 弹窗操作需同步清理清单
   - 清单操作自动反映到弹窗（通过推荐池状态）

---

## ✅ 测试验证

### 测试场景 1：Both 模式 - 弹窗标记"不想读"
1. 打开弹窗，点击"👎 不想读"
2. 预期：
   - 推荐从弹窗消失
   - 阅读清单中对应条目被删除
   - 数据库：`poolStatus='exited'`, `feedback='dismissed'`

### 测试场景 2：Both 模式 - 阅读清单删除未读条目
1. 打开阅读清单，删除未读推荐
2. 预期：
   - 阅读清单条目消失
   - 弹窗中对应推荐消失
   - 数据库：`poolStatus='exited'`, `feedback='dismissed'`

### 测试场景 3：Both 模式 - 阅读清单标记已读
1. 打开阅读清单，标记推荐为已读
2. 预期：
   - 阅读清单移到"已读"tab
   - 弹窗中对应推荐消失
   - 数据库：`isRead=true`, `poolStatus='exited'`

### 测试场景 4：Both 模式 - 弹窗点击打开文章
1. 打开弹窗，点击推荐标题
2. 浏览文章超过 30 秒
3. 预期：
   - 推荐从弹窗消失
   - 阅读清单中对应条目被删除（通过 onEntryUpdated）
   - 数据库：`isRead=true`, `poolStatus='exited'`

### 测试场景 5：Popup 模式 - "稍后读"
1. 设置 `deliveryMode='popup'`
2. 打开弹窗，点击"🔖 稍后读"
3. 预期：
   - 推荐从弹窗消失
   - 添加到阅读清单
   - 数据库：`poolStatus='exited'`, `feedback='later'`

### 测试场景 6：模式切换 - Popup → Both
1. 当前有 5 条推荐在弹窗
2. 切换到 Both 模式
3. 预期：
   - 5 条推荐全部添加到阅读清单
   - 弹窗仍显示这 5 条推荐
   - 数据库：所有推荐都有 `addedToReadingListAt`

---

## 📝 代码审查要点

### ✅ 已检查
1. `dismissRecommendations()` - ✅ 删除清单条目
2. `markAsRead()` - ✅ 删除清单条目
3. `saveRecommendation()` - ✅ 更新 addedToReadingListAt
4. `writeToReadingList()` - ✅ 更新 addedToReadingListAt
5. `DELIVERY_MODE_CHANGED` - ✅ 更新 addedToReadingListAt
6. `onEntryUpdated` - ✅ 更新推荐池状态
7. `onEntryRemoved` - ✅ 更新推荐池状态
8. `handleReadingListRemoved` - ✅ 区分已读删除和未读删除

### 关键文件
- `src/storage/db/db-recommendations.ts` - 推荐操作函数
- `src/core/reading-list/reading-list-manager.ts` - 阅读清单管理
- `src/background/refill-scheduler.ts` - 推荐生成和自动添加
- `src/background.ts` - 消息处理和模式切换
- `src/components/RecommendationView.tsx` - 弹窗 UI 操作

---

## 🎉 总结

所有弹窗和阅读清单的操作现在都已正确同步：

1. **弹窗操作** → 更新数据库 + both 模式同步清理清单 ✅
2. **阅读清单操作** → 更新数据库 → 弹窗自动反映 ✅
3. **推荐生成** → 更新数据库 + both 模式自动添加清单 ✅
4. **模式切换** → 正确同步清单状态 ✅

关键修复：
- ✅ `markAsRead` 添加清单删除逻辑
- ✅ 所有添加清单的地方更新 `addedToReadingListAt`
- ✅ `dismissRecommendations` 已在前面修复

数据一致性保证：
- ✅ 推荐池（feedArticles）是单一真相来源
- ✅ addedToReadingListAt 字段标记是否在清单
- ✅ 所有操作都同步更新推荐池状态
