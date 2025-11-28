# db.ts 重构进度报告

## 📊 总体目标

将 1497 行的 db.ts 拆分为多个模块，每个模块 100-400 行，提升可维护性。

## ✅ 已完成模块

### 1. db-settings.ts (47行) - ✅ 完成
- **提交**: `51cc8c7` 
- **状态**: 已测试通过 (7/7 tests)
- **减少**: 38 行 (1497 → 1459)
- **函数**:
  - `getSettings()` - 获取用户设置
  - `updateSettings()` - 更新用户设置
  - `getPageCount()` - 获取页面计数

## 🚧 进行中模块

### 2. db-recommendations.ts (260行预估) - ⏳ 待完成
- **依赖**: 需要 db-feeds.ts 中的 `updateFeedStats()`
- **函数**:
  - `markAsRead()` - 标记已读 (85行)
  - `dismissRecommendations()` - 忽略推荐 (62行)
  - `getUnreadRecommendations()` - 获取未读 (18行)
  - `getUnrecommendedArticleCount()` - 待推荐数量 (31行)
  - `resetRecommendationData()` - 重置数据 (41行)

### 3. db-feeds.ts (110行预估) - ⏳ 待完成
- **依赖**: 无
- **函数**:
  - `updateFeedStats()` - 更新源统计 (86行)
  - `updateAllFeedStats()` - 批量更新 (21行)

## 📋 待拆分模块

### 4. db-stats.ts (400行预估)
- **函数**:
  - `getRecommendationStats()` - 推荐统计
  - `getStorageStats()` - 存储统计
  - `getAnalysisStats()` - 分析统计
  - `getAIAnalysisStats()` - AI分析统计
  - `getRecommendationFunnel()` - 推荐漏斗
  - `getRSSArticleCount()` - RSS文章数

### 5. db-profile.ts (200行预估)
- **函数**:
  - `saveUserProfile()` - 保存画像
  - `getUserProfile()` - 获取画像
  - `deleteUserProfile()` - 删除画像

### 6. db-snapshots.ts (250行预估)
- **函数**:
  - `saveInterestSnapshot()` - 保存快照
  - `getInterestHistory()` - 获取历史
  - `getPrimaryTopicChanges()` - 主题变化
  - `getTopicHistory()` - 主题历史
  - `cleanOldSnapshots()` - 清理旧数据

## 🔧 技术挑战

### 已解决
- ✅ 保持向后兼容（通过 db.ts 重新导出）
- ✅ 测试文件同步创建
- ✅ TypeScript类型正确引用

### 待解决
- ⚠️ 循环依赖问题（db-recommendations 依赖 db-feeds）
- ⚠️ 大量代码删除的安全性（需要精确定位函数边界）
- ⚠️ 确保所有导入路径正确更新

## 📝 实施策略

### 方案 A：逐个函数拆分（当前）
1. 创建新模块文件
2. 复制函数到新文件
3. 在 db.ts 中删除原函数
4. 在 db.ts 中添加重新导出
5. 运行测试验证
6. 提交

**问题**: 删除大量代码容易出错

### 方案 B：使用自动化脚本（推荐）
1. 编写 Python/Node脚本解析 AST
2. 自动提取函数到新文件
3. 自动更新 db.ts
4. 自动验证导入导出
5. 批量测试和提交

**优势**: 精确、安全、可重复

## 🎯 下一步计划

1. **优先**: 完成 db-feeds.ts（无依赖，最简单）
2. **然后**: 完成 db-recommendations.ts（依赖 db-feeds）
3. **继续**: 拆分统计模块 db-stats.ts
4. **最后**: 拆分画像和快照模块

## 📊 预期成果

- **db.ts**: 1497 → ~100 行（仅核心定义 + 重新导出）
- **新模块**: 6个文件，每个 100-400 行
- **测试覆盖**: 每个模块独立测试
- **向后兼容**: 100%（所有现有导入路径继续工作）

## ⏱️ 预估时间

- db-feeds.ts: 30分钟
- db-recommendations.ts: 45分钟
- db-stats.ts: 60分钟
- db-profile.ts: 30分钟
- db-snapshots.ts: 45分钟
- **总计**: 约 3.5 小时

## 📝 注意事项

1. 每完成一个模块立即提交
2. 确保测试 100% 通过
3. 文档同步更新
4. 保持代码风格一致
