# 推荐机制优化设计

## 问题分析

### 当前架构问题

1. **职责混淆**：`RecommendationScheduler` 同时负责：
   - AI 分析原始文章（raw → candidate）
   - 从候选池挑选文章进入推荐池（candidate → recommendation）
   - 这两个职责应该分离

2. **显示逻辑混乱**：
   - 数据库记录每个推荐的显示位置（popup/readingList）
   - 模式切换时需要同步数据库状态
   - 实际上显示位置应该由系统设置决定，而非存储在数据库

3. **调度器职责不清**：
   - 现有的 `RecommendationScheduler` 做了太多事情
   - 缺少清晰的数据流管道

## 优化方案

### 新架构：双调度器 + 统一显示

```
原始文章池 (raw)
    ↓
[AnalysisScheduler] ← AI分析，独立后台服务
    ↓
候选池 (candidate)
    ↓
[RefillScheduler] ← 挑选高分文章，独立后台服务
    ↓
推荐池 (recommendations表)
    ↓
[显示层] ← 根据系统设置决定显示方式
    ├─ 弹窗模式 → 直接从 recommendations 表读取
    └─ 阅读清单模式 → 调用 ReadingListManager API 写入清单
```

### 1. AnalysisScheduler（分析调度器）

**职责**：
- 定时扫描原始文章池（poolStatus='raw'）
- 调用 AI 进行分析和评分
- 根据评分将文章标记为：
  - candidate（≥ 阈值）
  - analyzed-not-qualified（< 阈值）

**触发条件**：
- 原始文章数 ≥ 10 篇
- 距离上次分析 ≥ 5 分钟

**调度间隔**：
- 动态调整：1-10 分钟
- 根据原始文章积压量调整

### 2. RefillScheduler（补充调度器）

**职责**：
- 定时检查推荐池容量
- 从候选池挑选高分文章
- 写入 recommendations 表

**触发条件**：
- 推荐池未满（当前数 < targetPoolSize）
- 候选池有可用文章
- 通过冷却期检查（cooldownMinutes）

**调度间隔**：
- 固定：5 分钟检查一次
- 冷却期由策略控制（30-180 分钟）

### 3. 显示逻辑统一

**核心原则**：
- 数据库只存储推荐状态（active/read/dismissed/replaced）
- **不存储**显示位置（popup/readingList）
- 显示位置由系统设置实时决定

**流程**：

```typescript
// 生成推荐时（RefillScheduler）
1. 从候选池挑选文章
2. 写入 recommendations 表（status='active'）
3. 检查系统设置的显示模式：
   - 如果是 readingList 模式：调用 ReadingListManager.addToReadingList()
   - 如果是 popup 模式：不做额外操作

// 切换显示模式时（用户操作）
1. 读取系统设置的新模式
2. 如果切换到 readingList：
   - 读取所有 active 的推荐
   - 批量调用 ReadingListManager.addToReadingList()
3. 如果切换到 popup：
   - 清理阅读清单中的推荐项（可选）
   - 或保留，让用户自己管理

// 弹窗显示时
1. 检查系统设置的显示模式
2. popup 模式：显示 recommendations 表中的 active 项
3. readingList 模式：显示阅读清单摘要
```

## 数据库变更

### 移除字段

从 `recommendations` 表移除：
- `displayLocation`（'popup' | 'readingList'）- 不再需要

### 保留字段

- `status`：'active' | 'read' | 'dismissed' | 'replaced'
- `isRead`：布尔值
- `feedback`：用户反馈

## 迁移步骤

1. ✅ 创建 `AnalysisScheduler`
2. ✅ 创建 `RefillScheduler`
3. ✅ 重构 `RecommendationService`（拆分职责）
4. ✅ 更新显示逻辑（移除 displayLocation）
5. ✅ 更新模式切换逻辑
6. ✅ 测试和验证

## 优势

1. **职责清晰**：每个调度器做一件事
2. **易于维护**：分析和补充逻辑独立
3. **显示灵活**：模式切换不影响数据库
4. **性能优化**：可独立调整各调度器间隔
5. **扩展性好**：未来可以添加更多分析策略

## 向后兼容

- 保留现有的数据库结构（除了移除 displayLocation）
- 现有的推荐数据自动迁移
- API 接口保持兼容
