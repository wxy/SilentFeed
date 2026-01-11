# 候选池准入阈值策略集成 - 后续优化

## ✅ 已完成

- [x] 扩展 `RecommendationStrategy` 类型，添加 `candidatePool.entryThreshold` 字段
- [x] 更新 AI Prompt 模板（中英文），添加 entryThreshold 决策规则
- [x] 更新 `StrategyDecisionService` 验证逻辑，支持 0.5-0.9 范围
- [x] 重命名 Pipeline 变量 `qualityThreshold` → `entryThreshold`
- [x] 在 `RecommendationService` 中集成策略读取逻辑
- [x] 添加日志输出阈值来源（AI策略 vs 配置默认值）
- [x] 编写集成文档（CANDIDATE_POOL_THRESHOLD_INTEGRATION.md）
- [x] 创建手动测试脚本（test-strategy-integration.js）
- [x] 所有自动化测试通过（126/126）

## 🔄 待验证

### 1. 策略生成验证
- [ ] 检查是否已有当前策略（`getCurrentStrategy()`）
- [ ] 确认策略中包含 `entryThreshold` 字段
- [ ] 验证 AI 生成的 entryThreshold 在 0.5-0.9 范围内

### 2. 推荐服务集成验证
- [ ] 查看推荐日志，确认显示"来源: AI策略"
- [ ] 验证阈值优先级：策略 > 配置 > 0.7
- [ ] 测试回退机制（策略不存在时使用配置默认值）

### 3. 效果观察
- [ ] 监控候选池大小变化（是否在 targetSize 附近）
- [ ] 观察不同阈值对候选池补充速度的影响
- [ ] 验证推荐池是否稳定补充（不枯竭）

## 💡 未来优化

### 优先级 1：实时反馈机制
**目标**：根据推荐池实际消耗速度动态调整策略审查频率。

**当前状态**：
- 策略审查频率固定为每24小时
- 无法应对推荐池快速枯竭的紧急情况

**优化方案**：
1. 在推荐池低于警戒线时（如 < 5 篇），触发紧急策略审查
2. 降低 entryThreshold（如降到 0.6），加速候选池补充
3. 推荐池恢复后，恢复正常审查周期

**实施位置**：
- `RecommendationService.generateRecommendations()`
- `StrategyReviewScheduler.checkEmergencyReview()`

---

### 优先级 2：阈值变化历史记录
**目标**：记录 entryThreshold 的历史变化，便于分析和调优。

**数据结构**：
```typescript
interface ThresholdHistory {
  timestamp: number           // 变化时间
  oldValue: number            // 旧阈值
  newValue: number            // 新阈值
  reason: string              // 变化原因（如"候选池不足"）
  candidatePoolSize: number   // 当时候选池大小
  strategyId: string          // 关联的策略ID
}
```

**存储位置**：
- IndexedDB: 新表 `threshold_history`
- 或 Local Storage: `threshold_change_log`（滚动保留最近 30 条）

**用途**：
- 设置页面展示阈值变化趋势图
- 分析阈值调整对候选池的实际影响
- 优化 AI Prompt 的决策规则

---

### 优先级 3：分源质量阈值
**目标**：不同订阅源使用不同的准入阈值。

**当前限制**：
- 所有订阅源共享同一个 entryThreshold
- 高质量源和低质量源的文章混在一起评估

**优化方案**：
1. 扩展策略类型：
   ```typescript
   candidatePool: {
     entryThreshold: number           // 全局默认阈值
     sourceThresholds?: {             // 🆕 分源阈值（可选）
       [sourceId: string]: number     // 源ID → 阈值
     }
   }
   ```

2. AI 决策逻辑：
   - 根据源的历史质量评分（`SourceStats.qualityMetrics`）
   - 为高质量源设置较高阈值（如 0.8）
   - 为低质量源设置较低阈值（如 0.65）

3. Pipeline 使用：
   ```typescript
   const sourceThreshold = strategy.candidatePool.sourceThresholds?.[sourceId]
   const entryThreshold = sourceThreshold ?? strategy.candidatePool.entryThreshold ?? 0.7
   ```

**收益**：
- 高质量源保持高标准（避免劣质文章混入）
- 低质量源适当放宽（确保有足够候选）
- 整体候选池质量提升

---

### 优先级 4：用户手动调整接口
**目标**：允许用户在设置页面临时调整 entryThreshold。

**UI 设计**：
```
候选池准入阈值
├─ 自动模式（推荐）: ✓
│  └─ 当前阈值: 0.75 (AI策略)
│  └─ 下次审查: 2024-01-15 14:30
└─ 手动模式
   └─ 阈值: [滑块 0.5 ────●──── 0.9]
   └─ ⚠️ 手动设置会覆盖 AI 决策，直到下次策略审查
```

**实现逻辑**：
1. 新增 Local Storage 键：`manual_entry_threshold_override`
2. `RecommendationService` 优先级调整：
   ```
   手动覆盖 > AI策略 > 配置 > 0.7
   ```
3. 策略审查时清除手动覆盖（或提示用户确认）

**用途**：
- 用户可以快速测试不同阈值的效果
- 紧急情况下手动干预（如候选池过少）
- 为 AI 策略提供用户反馈数据

---

### 优先级 5：A/B 测试框架
**目标**：对比不同阈值策略的实际效果。

**实验设计**：
1. **对照组**：使用 AI 决策的 entryThreshold
2. **实验组**：
   - 固定阈值 0.7（旧系统）
   - 固定阈值 0.75（较严格）
   - 固定阈值 0.65（较宽松）

**评估指标**：
- 候选池大小稳定性（标准差）
- 推荐池补充速度（平均每日新增推荐数）
- 推荐质量（用户点击率、阅读完成率）
- 候选池过期率（多少文章过期前未被推荐）

**实施方式**：
- 开发模式：通过环境变量切换策略
- 生产模式：按用户 ID hash 分组（10% 实验组，90% 对照组）

---

## 🔧 技术债务

### 1. Pipeline TODO 注释清理
**位置**：`src/core/recommender/pipeline.ts:329`

```typescript
// TODO: 集成 AI 策略系统后，从 context.strategy?.candidatePool.entryThreshold 读取动态阈值
```

**处理**：
- 删除此 TODO（已在 RecommendationService 中集成）
- 或更新为：`// 阈值已在 RecommendationService 中从策略读取并传入`

---

### 2. 策略生成锁机制
**问题**：`generateDailyPoolStrategy()` 使用 `isPoolStrategyGenerating()` 锁，但 `StrategyReviewScheduler` 是否也需要锁？

**检查项**：
- `StrategyDecisionService.generateNewStrategy()` 是否支持并发调用
- 多个 alarm 同时触发时是否会重复生成策略

**解决方案**（如有必要）：
- 在 `StrategyDecisionService` 内部添加单例锁
- 或在 `StrategyReviewScheduler.checkAndReview()` 中检查锁状态

---

### 3. 旧策略系统清理
**问题**：
- `generateDailyPoolStrategy()` 使用旧的 `PoolStrategyDecider`
- 新系统使用 `StrategyDecisionService` 和 `StrategyReviewScheduler`
- 两套系统可能冲突

**待确认**：
- 旧系统是否仍在使用？
- 是否需要迁移或废弃？

**清理方案**（如果旧系统已废弃）：
1. 删除 `daily-pool-strategy` alarm
2. 删除 `generateDailyPoolStrategy()` 函数
3. 删除 `PoolStrategyDecider` 相关代码
4. 更新文档说明迁移路径

---

## 📊 监控指标

建议在仪表板或设置页面展示以下指标：

### 策略系统健康度
- ✅ 当前策略状态（有效/过期/缺失）
- ✅ 策略 ID 和创建时间
- ✅ 下次审查时间
- ✅ 策略审查定时器状态

### 候选池状态
- 📊 当前大小 / 目标大小 / 最大大小
- 📊 当前准入阈值（来源：AI策略/配置/默认）
- 📊 近7天候选池大小趋势图
- 📊 文章过期率（过期前未推荐的比例）

### 推荐池状态
- 📊 当前大小 / 未读数量
- 📊 平均消耗速度（篇/天）
- 📊 预计枯竭时间（如果当前趋势持续）
- 📊 近7天补充速度趋势图

---

## 🚀 快速开始验证

### 步骤1：检查当前策略
```bash
# 打开 chrome://extensions
# 点击 Silent Feed → Service Worker
# 粘贴并运行 scripts/test-strategy-integration.js
```

### 步骤2：观察推荐日志
```bash
# 等待推荐服务运行（或手动触发）
# 查找日志：🎯 候选池准入阈值: { 来源: 'AI策略', 阈值: X.X, ... }
```

### 步骤3：监控候选池
```bash
# 观察候选池大小是否趋于稳定（不再激增）
# 可使用 scripts/diagnose-candidate-pool.js
```

---

## 📚 相关资源

- [集成文档](../docs/CANDIDATE_POOL_THRESHOLD_INTEGRATION.md)
- [AI 策略架构](../docs/AI_ARCHITECTURE.md)
- [推荐系统设计](../docs/RECOMMENDATION_SYSTEM_REDESIGN.md)
- [测试脚本](../scripts/test-strategy-integration.js)
- [诊断脚本](../scripts/diagnose-candidate-pool.js)

---

_最后更新：2024-01 (Commit 0e0ce18)_
