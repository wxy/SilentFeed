# 推荐评分机制详解

## 问题：75% 的推荐文章质量不符合喜好

### 当前评分体系

Silent Feed 使用了**三层评分机制**：

#### 1. TF-IDF 预筛选（粗筛）
- **阈值**：0.01（`tfidfThreshold`）
- **作用**：快速过滤明显不相关的文章
- **结果**：只有 TF-IDF 分数 ≥ 0.01 的文章才会送去 AI 分析

#### 2. AI 质量评分（细筛）
- **阈值**：0.7（`qualityThreshold`）
- **作用**：只有 AI 评分 ≥ 0.7 的文章才能进入推荐池
- **评分含义**：
  ```
  0.9-1.0: 极度相关（几乎完美匹配）
  0.8-0.9: 非常相关（强烈推荐）
  0.7-0.8: 良好相关（推荐）      ← 当前门槛
  0.6-0.7: 中等相关（可选）
  0.5-0.6: 一般相关（不推荐）
  0.0-0.5: 低相关（过滤）
  ```

#### 3. 历史基准过滤（竞争筛选）
- **范围**：0.55 ~ 0.75（`minimumBaseline` ~ `maximumBaseline`）
- **作用**：防止低分推荐持续进入池
- **工作方式**：
  - 计算最近推荐的平均分（例如 0.72）
  - 新推荐必须 ≥ 平均分才能进入池
  - 最大不超过 0.75（防止门槛过高）

---

## 问题分析

### 为什么 75% 的推荐不符合喜好？

可能的原因：

#### 1. **qualityThreshold = 0.7 仍然偏低**
当前设置允许 0.7-1.0 的文章进入推荐池，但：
- 0.7-0.75 的文章可能只是"勉强相关"
- 真正高质量的应该是 0.8+ 的文章

#### 2. **AI 评分可能存在偏差**
- AI 可能给了一些实际不相关的文章较高评分
- 用户画像可能不够准确

#### 3. **历史基准上限 0.75 限制了高分推荐**
- 即使有 0.9 分的文章，如果历史平均分是 0.72
- 系统会认为基准是 0.72，而不是更高

---

## 解决方案

### 方案A：提高 qualityThreshold（推荐）

**调整**：0.7 → 0.75 或 0.8

```typescript
// src/storage/recommendation-config.ts
const DEFAULT_CONFIG: RecommendationConfig = {
  qualityThreshold: 0.75, // 从 0.7 提高到 0.75
  // 或者更激进：
  qualityThreshold: 0.8,  // 只推荐高质量文章
}
```

**效果**：
- ✅ 直接拒绝评分 < 0.75/0.8 的文章
- ✅ 推荐池只包含高质量文章
- ⚠️ 可能导致推荐池经常为空（如果高分文章太少）

**建议值**：
- **0.75**（平衡）：既提高质量，又保证有足够推荐
- **0.8**（严格）：只推荐优质内容，但可能经常没推荐

---

### 方案B：提高 maximumBaseline（配合使用）

**调整**：0.75 → 0.85

```typescript
// src/core/recommender/historical-score-tracker.ts
const DEFAULT_CONFIG: HistoricalScoreConfig = {
  minimumBaseline: 0.55,
  maximumBaseline: 0.85, // 从 0.75 提高到 0.85
}
```

**效果**：
- ✅ 允许历史基准上升到 0.85
- ✅ 鼓励系统逐步提高推荐质量
- ⚠️ 如果推荐池一直是高分文章，新文章很难进入

**建议值**：
- **0.80**（适中）：给予一定上升空间
- **0.85**（激进）：追求更高质量

---

### 方案C：调整历史基准策略（高级）

**当前策略**：平均分作为基准

**改进策略**：使用**中位数**或**75分位数**

```typescript
// 当前：平均分
const averageScore = totalScore / count

// 改进：75分位数（只让高于75%的文章进入）
const sortedScores = scores.sort((a, b) => b - a)
const p75Index = Math.floor(count * 0.25)
const baseline = sortedScores[p75Index]
```

**效果**：
- ✅ 更严格的筛选（只有前 25% 的推荐能进入池）
- ✅ 自动适应推荐质量

---

## 推荐配置

### 保守方案（提高门槛但保证有推荐）

```typescript
// 1. 提高质量阈值
qualityThreshold: 0.75  // 从 0.7 → 0.75

// 2. 保持历史基准
minimumBaseline: 0.55
maximumBaseline: 0.75
```

### 激进方案（追求高质量）

```typescript
// 1. 大幅提高质量阈值
qualityThreshold: 0.8   // 只要优质文章

// 2. 提高历史基准上限
minimumBaseline: 0.55
maximumBaseline: 0.85
```

### 实验方案（使用百分位数）

```typescript
// 1. 适中的质量阈值
qualityThreshold: 0.75

// 2. 使用 75 分位数作为基准
strategy: 'percentile'
percentile: 0.75  // 前 25% 的推荐才能进入池
```

---

## 监控建议

### 1. 查看实际评分分布

在推荐生成后，查看日志：

```
📊 推荐池状态：
  - 文章总数：50 篇
  - 通过 TF-IDF：30 篇
  - AI 评分 ≥0.7：15 篇
  - 评分分布：
    * 0.9-1.0: 0 篇
    * 0.8-0.9: 2 篇
    * 0.7-0.8: 13 篇
    * 0.6-0.7: 15 篇（已过滤）
```

### 2. 观察历史基准

```
📊 历史评分基准: 0.720 (平均分: 0.720, 样本: 12 条, 范围: 0.55-0.75)
```

如果平均分总是接近 0.75（上限），说明：
- 系统推荐的都是相对高分文章
- 但被限制在 0.75 上限

---

## 实施步骤

### 第一步：提高 qualityThreshold

```diff
// src/storage/recommendation-config.ts
const DEFAULT_CONFIG: RecommendationConfig = {
- qualityThreshold: 0.7,
+ qualityThreshold: 0.75,  // 或 0.8
}
```

### 第二步：观察效果

运行扩展 3-7 天，观察：
1. 推荐池是否经常为空？
2. 推荐的文章质量是否提升？
3. 历史基准是否上升？

### 第三步：微调

根据观察结果：
- 如果推荐太少 → 降低到 0.73
- 如果质量仍不满意 → 提高到 0.8
- 如果历史基准总是 0.75 → 提高 maximumBaseline 到 0.8

---

## 代码位置

### 质量阈值配置
- **文件**：`src/storage/recommendation-config.ts`
- **行数**：162
- **变量**：`qualityThreshold`

### 历史基准配置
- **文件**：`src/core/recommender/historical-score-tracker.ts`
- **行数**：37-42
- **变量**：`minimumBaseline`, `maximumBaseline`

### 推荐过滤逻辑
- **文件**：`src/core/recommender/RecommendationService.ts`
- **行数**：282-293
- **函数**：`saveRecommendations`

---

## 常见问题

### Q1: 为什么注释说 0.6，实际默认值是 0.7？

代码中的注释是历史遗留，实际在 Phase 8 时已经提高到 0.7。

### Q2: 0.75 的 maximumBaseline 是否限制了高分推荐？

**不会**。`maximumBaseline` 只是**历史基准的上限**，不是推荐评分的上限：
- 推荐评分可以是 0.9、0.95 甚至 1.0
- 历史基准最高只能到 0.75（防止门槛过高）
- 新推荐只要 ≥ 历史基准就能进入池

例如：
- 当前推荐池有 10 条，平均分 0.72
- 历史基准 = 0.72（< 0.75 上限）
- 新推荐评分 0.85 → 通过（≥ 0.72）
- 新推荐评分 0.68 → 拒绝（< 0.72）

### Q3: 如何查看实际推荐的评分分布？

打开扩展的开发者工具（background.html），查看推荐生成日志。

---

## 建议

基于你的反馈（75% 不符合喜好），建议：

1. **立即实施**：提高 `qualityThreshold` 从 0.7 → **0.75**
2. **观察 3 天**：看推荐质量是否改善
3. **如果仍不满意**：进一步提高到 **0.8**
4. **长期优化**：考虑实施百分位数策略

需要我帮你实施这些改进吗？
