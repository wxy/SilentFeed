# Phase 12.7: AI 画像生成触发优化

## 1. 问题分析

### 1.1 当前逻辑混乱点

| 触发源 | 文件位置 | 阈值 | 计时器 | 问题 |
|--------|----------|------|--------|------|
| ProfileUpdateScheduler | `ProfileUpdateScheduler.ts` | 5 新页面 | 无 | 每浏览 5 页就重建？过于频繁 |
| SemanticProfileBuilder.onBrowse | `SemanticProfileBuilder.ts` | 100 页 | 1 小时 | 与上面重复且阈值不一致 |
| SemanticProfileBuilder.onRead | `SemanticProfileBuilder.ts` | 20 篇 | 1 小时 | 阈值过高，与拒绝不对称 |
| SemanticProfileBuilder.onDismiss | `SemanticProfileBuilder.ts` | 弹窗容量 (3-5) | 1 小时 + 5 分钟防抖 | 相对合理 |

### 1.2 核心问题

1. **两套调度系统并存**：`ProfileUpdateScheduler` 和 `SemanticProfileBuilder` 各自有计数器和触发逻辑
2. **阈值不一致**：浏览触发有 5 页、100 页两个版本
3. **阅读/拒绝不对称**：阅读 20 篇 vs 拒绝 3-5 篇，差距过大
4. **计数器独立**：三个行为计数器独立，缺乏统一的节流机制

---

## 2. 优化方案

### 2.1 设计原则

1. **统一调度**：合并两套系统，使用单一调度入口
2. **全局节流**：统一时间间隔限制，防止过度消耗 AI 资源
3. **行为对称**：阅读和拒绝使用相同的触发阈值
4. **合理频率**：工作日最多触发 3 次自动更新（每 3 小时 × 8 工作小时）

### 2.2 触发条件（新）

#### 自动触发（需满足条件）

| 触发行为 | 计数阈值 | 全局时间间隔 | 说明 |
|----------|----------|--------------|------|
| **浏览** | ≥ 50 页 | 3 小时 | 降低阈值（原 100 页），但增加时间间隔 |
| **阅读** | ≥ 弹窗容量 | 3 小时 | 与拒绝对称，通常 3-5 篇 |
| **拒绝** | ≥ 弹窗容量 | 3 小时 | 保持原设计 |

**触发逻辑**：
```
IF (距上次更新 ≥ 3 小时) AND (浏览 ≥ 50 OR 阅读 ≥ 弹窗容量 OR 拒绝 ≥ 弹窗容量)
  → 执行画像更新
  → 重置所有计数器
```

#### 手动触发（无限制）

- 点击「重建用户画像」按钮
- **不受时间间隔限制**
- **不受计数阈值限制**
- 仅受 UI 防抖限制（10 分钟冷却，防止误操作）

#### 首次生成（特殊情况）

- 条件：浏览 ≥ 10 页 且 无 AI 画像
- **不受 3 小时间隔限制**
- 确保新用户快速获得 AI 画像

### 2.3 数据结构变更

```typescript
// 旧：三个独立计时器
private browseCount = 0
private readCount = 0
private dismissCount = 0
private lastUpdateTime = 0  // 各行为独立检查

// 新：统一计数器 + 全局计时器
interface ProfileUpdateState {
  // 行为计数器（独立计数，触发后全部重置）
  browseCount: number
  readCount: number
  dismissCount: number
  
  // 全局时间控制（所有行为共享）
  lastAutoUpdateTime: number  // 上次自动更新时间
  
  // 配置
  globalIntervalMs: number    // 3 小时 = 10800000ms
  browseThreshold: number     // 50 页
  // readThreshold / dismissThreshold 动态获取 = maxRecommendations
}
```

### 2.4 调度系统合并

**移除 `ProfileUpdateScheduler` 的以下策略**：
- ❌ 策略2: 新增 ≥ 5 页（过于频繁）
- ❌ 策略3: 6 小时定期更新（与新的 3 小时间隔冲突）
- ❌ 策略4: 24 小时强制更新（不必要）

**保留**：
- ✅ 策略1: 首次构建（≥ 10 页且无画像）
- ✅ 手动强制更新

**合并到 `SemanticProfileBuilder`**：
- 所有自动触发逻辑统一在 `SemanticProfileBuilder` 处理
- `ProfileUpdateScheduler` 简化为仅处理首次构建和手动触发

---

## 3. 实现计划

### 3.1 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `SemanticProfileBuilder.ts` | 统一全局时间间隔，调整阈值 |
| `ProfileUpdateScheduler.ts` | 移除策略2/3/4，简化职责 |
| `ProfileManager.ts` | 调整 `tryGenerateAIProfile` 条件（可选） |

### 3.2 阈值常量调整

```typescript
// SemanticProfileBuilder.ts

// 旧配置
const BROWSE_THRESHOLD = 100
const READ_THRESHOLD = 20
const MIN_UPDATE_INTERVAL_MS = 3600000  // 1 小时

// 新配置
const BROWSE_THRESHOLD = 50              // 降低，但时间间隔更长
const READ_THRESHOLD = 'dynamic'         // 等于 maxRecommendations（3-5）
const DISMISS_THRESHOLD = 'dynamic'      // 等于 maxRecommendations（3-5）
const GLOBAL_UPDATE_INTERVAL_MS = 10800000  // 3 小时（所有行为共享）
```

---

## 4. 待讨论问题

### 4.1 计数器重置策略

**当前设计**：触发更新后重置所有计数器

**待确认**：
- Q1: 如果用户浏览了 49 页，然后阅读了 3 篇触发更新，浏览计数器是否也重置为 0？
- **建议**：是的，全部重置。因为画像已更新，之前的行为已被学习。

### 4.2 首次生成的时间间隔

**当前设计**：首次生成不受 3 小时间隔限制

**待确认**：
- Q2: 首次生成后，是否立即开始 3 小时倒计时？
- **建议**：是的。首次生成后设置 `lastAutoUpdateTime = Date.now()`。

### 4.3 弹窗容量的获取时机

**当前设计**：`onDismiss` 时动态获取 `maxRecommendations`

**待确认**：
- Q3: 阅读触发也需要动态获取吗？
- **建议**：是的，`onRead` 和 `onDismiss` 都使用相同的动态阈值。

### 4.4 浏览计数与阅读/拒绝的关系

**当前设计**：三个计数器独立

**待确认**：
- Q4: 阅读一篇推荐文章后，是否也增加浏览计数？
- **建议**：不增加。浏览计数仅针对用户主动浏览的页面（content script 收集的），阅读推荐是独立行为。

### 4.5 手动触发的 UI 冷却时间

**当前设计**：10 分钟冷却

**待确认**：
- Q5: 10 分钟是否合适？会不会影响用户体验？
- **建议**：保持 10 分钟。主要防止误操作和 AI 资源滥用。用户如果真的需要频繁重建，说明画像质量有问题，应优化算法而非允许频繁重建。

---

## 5. 预期效果

### 5.1 资源消耗对比

| 场景 | 旧方案（最坏情况） | 新方案（最坏情况） |
|------|-------------------|-------------------|
| 工作日 8 小时 | 可能触发 10+ 次 | 最多 3 次（8h ÷ 3h） |
| AI 调用成本 | 不可控 | 可预测 |
| 用户体验 | 频繁更新，可能卡顿 | 平滑，无感知 |

### 5.2 行为响应性

| 行为 | 旧响应时间 | 新响应时间 |
|------|-----------|-----------|
| 阅读 3-5 篇 | 需 20 篇才触发 | 3-5 篇即可触发（满足时间条件） |
| 拒绝一屏 | 立即触发（满足条件） | 立即触发（满足条件） |
| 浏览 50 页 | 可能 5 页就触发 | 50 页 + 3 小时间隔 |

---

## 6. 决策确认

- [x] 统一使用 3 小时全局时间间隔
- [x] 阅读和拒绝使用相同阈值（弹窗容量）
- [x] 浏览阈值调整为 50 页
- [x] 触发后重置所有计数器
- [x] 首次生成不受时间限制
- [x] 手动触发保持 10 分钟 UI 冷却
- [ ] 待实现：代码修改

---

## 7. 变更日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2025-12-09 | v1.0 | 初始方案设计 |
