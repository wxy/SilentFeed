# 推荐系统优化 - 第二轮改进

## 改进日期
2025-12-18（第二轮）

## 问题与解决方案

### 问题1：历史评分基准越来越高 ⚠️

**原因分析**：
- 如果只让高分推荐进入池，历史平均分会不断上升
- 样本数固定为 20 条，无法适应推荐池大小变化
- 缺少最大基准上限，可能导致"死循环"（门槛过高→没有新推荐能进入）

**解决方案**：

#### 1. 添加最大基准上限
```typescript
maximumBaseline: 0.75  // 防止门槛过高导致无推荐可进
```

#### 2. 动态样本数（推荐池大小 × 2）
```typescript
// 修改前：固定 20 条
const passesBaseline = await passesHistoricalBaseline(article.score, {
  recentCount: 20
})

// 修改后：动态调整（推荐池容量×2）
const historicalSampleSize = maxSize * 2  // 6×2=12 或 10×2=20
const passesBaseline = await passesHistoricalBaseline(article.score, {
  recentCount: historicalSampleSize,
  maximumBaseline: 0.75
})
```

**效果**：
- ✅ 基准不会超过 0.75，确保总有推荐能进入
- ✅ 样本数随推荐池大小调整，更稳定
- ✅ 范围：0.55（最低）~ 0.75（最高）

---

### 问题2：弹窗大小调整从未生效 ❌

**原因分析**：

通过日志发现，调整条件过于严格：

| 条件 | 原阈值 | 触发难度 |
|------|--------|----------|
| 全部不想读 | ≥3次 | 很难（需要3次点"全部不想读"）|
| 不想读率 | >70% | 很难（10条推荐中7条不想读）|
| 点击率 | >50% | 中等（10条推荐中5条点击）|
| 弹窗打开 | ≥5次/天 | 很难（每天打开5次）|

**问题**：
1. 用户很少点击"全部不想读"（更倾向于单个拒绝）
2. 阈值过高，绝大多数用户都无法触发
3. 缺少日志，无法诊断

**解决方案**：

#### 1. 降低触发条件
```typescript
// 调整前 → 调整后
dismissAllCount >= 3  → 2   // 降低 33%
dismissRate > 0.7     → 0.5 // 降低 29%
clickRate > 0.5       → 0.3 // 降低 40%
popupFrequency >= 5   → 3   // 降低 40%
```

#### 2. 增强诊断日志
```typescript
console.log('📊 [弹窗容量评估] 当前指标:', {
  当前容量: currentCount,
  总推荐数: metrics.totalRecommendations,
  点击数: metrics.clickCount,
  不想读数: metrics.dismissCount,
  全部不想读次数: metrics.dismissAllCount,
  弹窗打开次数24h: popupFrequency,
  点击率: (clickRate * 100).toFixed(1) + '%',
  不想读率: (dismissRate * 100).toFixed(1) + '%'
})

console.log('📊 [弹窗容量评估] 调整结果:', {
  原容量: currentCount,
  调整值: adjustment,
  新容量: newCount,
  是否变化: newCount !== currentCount,
  触发原因: reasons.join(', ') // 显示具体原因
})
```

**预期效果**：
- ✅ 用户更容易触发调整（阈值降低 29%-40%）
- ✅ 可以通过日志诊断为何不触发
- ✅ 更灵敏的自适应机制

---

## 技术细节

### 历史评分基准机制

```typescript
// 配置
interface HistoricalScoreConfig {
  strategy: 'daily' | 'recent'
  recentCount?: number          // 样本数（动态）
  enabled?: boolean
  minimumBaseline?: number      // 最低基准 0.55
  maximumBaseline?: number      // 最高基准 0.75（新增）
}

// 计算逻辑
let baseline = averageScore
baseline = Math.max(baseline, 0.55)  // 应用最低基准
baseline = Math.min(baseline, 0.75)  // 应用最高基准（新增）
```

### 弹窗大小调整条件对比

| 条件 | 原阈值 | 新阈值 | 降低幅度 |
|------|--------|--------|----------|
| 全部不想读（减少） | ≥3次 | ≥2次 | 33% |
| 不想读率（减少） | >70% | >50% | 29% |
| 点击率（增加） | >50% | >30% | 40% |
| 弹窗打开（增加） | ≥5次/天 | ≥3次/天 | 40% |

---

## 测试验证

### 历史评分测试
- ✅ 12/12 测试通过
- ✅ 验证最大基准上限生效
- ✅ 验证动态样本数

### 弹窗大小调整测试
- ✅ 7/7 测试通过
- ✅ 新增诊断日志
- ✅ 降低触发条件

---

## 使用建议

### 监控日志

开启扩展的控制台，查看以下日志：

1. **历史评分基准**：
```
📊 历史评分基准: 0.650 (平均分: 0.680, 样本: 12 条, 范围: 0.55-0.75)
```

2. **弹窗容量评估**（每24小时一次）：
```
📊 [弹窗容量评估] 当前指标: {
  当前容量: 3,
  总推荐数: 15,
  点击数: 5,
  不想读数: 8,
  全部不想读次数: 1,
  弹窗打开次数24h: 4,
  点击率: '33.3%',
  不想读率: '53.3%'
}
📊 [弹窗容量评估] 调整结果: {
  原容量: 3,
  调整值: -1,
  新容量: 2,
  是否变化: true,
  触发原因: '全部不想读≥1次 (-1), 不想读率>50% (-1), 点击率>30% (+1)'
}
```

### 排查问题

如果弹窗大小仍不变化：

1. 检查 `totalRecommendations` 是否为 0（没有推荐生成过）
2. 检查 `dismissAllCount` 是否为 0（从未点击"全部不想读"）
3. 检查点击率和不想读率是否都在中间范围（0.3-0.5）
4. 确认定时器是否正常运行（每24小时一次）

---

## 相关文件

### 修改文件
- `src/core/recommender/historical-score-tracker.ts` - 添加最大基准、改进日志
- `src/core/recommender/RecommendationService.ts` - 动态样本数
- `src/core/recommender/adaptive-count.ts` - 降低触发条件、增强日志
- `src/core/recommender/historical-score-tracker.test.ts` - 更新测试

### 相关文档
- `docs/fixes/RECOMMENDATION_POOL_IMPROVEMENTS.md` - 第一轮改进文档
