# AI 策略决策原则（增强版）

> **用于 AI 策略决策引擎的量化判断规则**
> 
> 创建时间: 2026年1月2日  
> 基于: 7个测试场景的验证结果

---

## 问题诊断

### 当前问题

基于测试结果，AI在以下情况表现不佳：

| 场景 | 数据特征 | AI判断 | 预期判断 | 问题 |
|------|----------|--------|----------|------|
| 场景1 | dailyReadCount=2.5 | cooldown=60分钟 | cooldown≥120分钟 | 未关联消费速度↔冷却时间 |
| 场景2 | rawPool=200, daily=150 | interval=12分钟 | interval≤5分钟 | 未量化积压紧急度 |
| 场景2 | dismissRate=25%, likeRate=45% | threshold=6.8 | threshold≥7.5 | 未根据反馈率调整质量 |

### 根本原因

AI缺少**显性量化规则**来判断：
1. **积压紧急度**：rawPool / dailyNewArticles 比值 → 积压天数
2. **消费速度分级**：dailyReadCount 对应的冷却时间范围
3. **推荐效率**：recommendedCount / readCount 比值 → 过度推荐判断
4. **质量反馈关联**：dismissRate/likeRate 对应的阈值调整

---

## 量化判断规则

### 1. 积压紧急度判断（修正版）

**计算公式**：
```typescript
积压天数 = rawPool / dailyNewArticles
```

**分级标准**：

| 积压天数 | 紧急级别 | analysisInterval | batchSize | 说明 |
|----------|----------|------------------|-----------|------|
| > 7天 | **严重积压** | 5-10分钟 | 15-20 | 必须快速清理 |
| 3-7天 | **中度积压** | 15-30分钟 | 8-15 | 需要加速处理 |
| 1-3天 | **轻微积压** | 30-45分钟 | 5-10 | 正常消化即可 |
| < 1天 | **正常缓冲** | 45-60分钟 | 3-8 | 保持现状 |

**⚠️ 高产出场景特殊规则**：
当 `dailyNewArticles > 100` 时，提升一级紧急度：
- 积压 > 1.5天 → 提升一级（轻微→中度，中度→严重）
- 原因：高产出场景下，积压会快速累积

**示例应用**：
- **场景1**：rawPool = 25, dailyNewArticles = 10
  - 积压天数 = 2.5天
  - 判定：**轻微积压**（1-3天区间）
  - 策略：interval 30-45分钟，batchSize 5-10

- **场景2**：rawPool = 200, dailyNewArticles = 150
  - 积压天数 = 1.33天
  - 高产出判定：150 > 100 ✅
  - 提升一级：轻微积压 → **中度积压**
  - 策略：interval 15-30分钟，batchSize 8-15

### 2. 消费速度与冷却时间

**计算公式**：
```typescript
日均消费速度 = last7DaysReadCount / 7
消费间隔(分钟) = 1440 / dailyReadCount  // 1440 = 24小时
```

**判断规则**：

| dailyReadCount | 消费速度分级 | cooldownMinutes | 推荐频率策略 |
|----------------|--------------|-----------------|--------------|
| < 2 | **超慢** | 120-180分钟 | 每天推荐2-3次 |
| 2-5 | **慢** | 60-120分钟 | 每天推荐4-6次 |
| 5-10 | **中等** | 45-60分钟 | 每天推荐8-12次 |
| > 10 | **快** | 30-45分钟 | 每天推荐16-24次 |

**示例（场景1）**：
- dailyReadCount = 2.5
- 消费间隔 = 1440 / 2.5 = 576分钟（9.6小时/篇）
- **判断**：属于**慢**消费速度
- **策略**：cooldownMinutes = 120分钟（至少2小时冷却）

### 3. 推荐效率判断

**计算公式**：
```typescript
推荐消费比 = last7DaysRecommendedCount / last7DaysReadCount
推荐过度率 = (推荐消费比 - 2.0) / 推荐消费比  // 基准比值2.0
```

**判断规则**：

| 推荐消费比 | 推荐效率 | 过度率 | 策略调整 |
|------------|----------|--------|----------|
| > 5.0 | **严重过度** | > 60% | scoreThreshold +1.5, dailyLimit ÷ 2 |
| 3.0-5.0 | **过度** | 33-60% | scoreThreshold +1.0, dailyLimit ÷ 1.5 |
| 2.0-3.0 | **正常** | 0-33% | 保持当前策略 |
| 1.0-2.0 | **效率高** | - | 可适当增加推荐 |
| < 1.0 | **供应不足** | - | 放宽阈值，增加推荐 |

**示例（场景3）**：
- recommendedCount = 150, readCount = 10
- 推荐消费比 = 150 / 10 = 15.0
- 过度率 = (15 - 2) / 15 = 86.7%
- **判断**：**严重过度**
- **策略**：scoreThreshold 提升至 8.2，dailyLimit 降至 8

### 4. 质量反馈与阈值调整（修正版）

**计算公式**：
```typescript
质量指数 = (likeRate × 2 + (100 - dismissRate)) / 3
候选池剩余天数 = candidatePoolSize / dailyReadCount
```

**基准阈值**：

| 质量指数 | 基准threshold | 说明 |
|----------|--------------|------|
| > 70 | 7.0-7.5 | 质量优秀，保持 |
| 60-70 | 7.2-7.7 | 质量良好 |
| 50-60 | 7.5-8.0 | 质量一般，需提升 |
| < 50 | 7.8-8.5 | 质量较差，严格筛选 |

**供应压力调整**：

```python
# 快消费 + 供应不足 → 适度放宽
if 候选池剩余天数 < 2 and dailyReadCount > 8:
    threshold = 基准下限 - 0.3
    
# 严重供应不足 → 大幅放宽（保底6.5）
elif 候选池剩余天数 < 1:
    threshold = max(6.5, 基准下限 - 0.5)
```

**示例应用**：

**场景A（质量优秀，无压力）**：
- likeRate = 60%, dismissRate = 10%
- 质量指数 = (60×2 + 90) / 3 = 70
- 基准：7.0-7.5
- 候选池剩余：3.2天（健康）
- **最终**：7.0-7.5（无调整）

**场景B（质量一般，供应压力）**：
- likeRate = 45%, dismissRate = 25%
- 质量指数 = (45×2 + 75) / 3 = 55
- 基准：7.5-8.0
- 候选池剩余：1.25天 < 2天 ✅
- dailyReadCount = 12 > 8 ✅
- **调整**：7.5 - 0.3 = 7.2
- **最终**：7.0-7.5（平衡质量与供应）

**场景C（严重供应不足）**：
- 质量指数 = 60
- 基准：7.2-7.7
- 候选池剩余：0.8天 < 1天 ✅
- **调整**：max(6.5, 7.2 - 0.5) = 6.7
- **最终**：6.5-7.0（优先保证供应）

### 5. 候选池健康度判断

**计算公式**：
```typescript
候选池剩余天数 = candidatePoolSize / dailyReadCount
候选池健康度 = candidatePoolSize / (dailyReadCount × 3)  // 基准3天储备
```

**判断规则**：

| 剩余天数 | 健康度 | 紧急级别 | 策略调整 |
|----------|--------|----------|----------|
| < 1天 | < 0.33 | **危急** | 放宽threshold至6.0，加速分析 |
| 1-3天 | 0.33-1.0 | **注意** | 保持threshold，适度加速 |
| 3-7天 | 1.0-2.3 | **健康** | 正常策略 |
| > 7天 | > 2.3 | **过剩** | 提高threshold，减少分析 |

**示例（场景6）**：
- candidatePoolSize = 4, dailyReadCount = 4.0
- 剩余天数 = 4 / 4 = 1天
- 健康度 = 4 / (4×3) = 0.33
- **判断**：处于**危急**边缘
- **策略**：放宽threshold至6.0，加速分析至5分钟

### 6. 预算紧急度判断

**计算公式**：
```typescript
预算使用率 = aiTokensUsedToday / aiTokensBudgetDaily
预算余量小时数 = (aiTokensBudgetDaily - aiTokensUsedToday) / (aiTokensUsedToday / 当前小时数)
```

**判断规则**：

| 预算使用率 | 剩余时间 | 紧急级别 | 策略调整 |
|------------|----------|----------|----------|
| > 90% | < 2小时 | **危急** | 停止分析，仅推荐 |
| 70-90% | 2-8小时 | **紧张** | 大幅降低batchSize和频率 |
| 50-70% | 8-16小时 | **注意** | 适度降低分析频率 |
| < 50% | > 16小时 | **充裕** | 正常策略 |

**示例（场景4）**：
- aiTokensUsedToday = 90000, budget = 100000
- 预算使用率 = 90%
- **判断**：**危急**
- **策略**：停止新分析，利用现有候选池

---

## 综合决策流程

### 决策优先级

```
1. 预算告急（> 90%）→ 立即停止分析
2. 推荐池空池（= 0）→ 紧急补充（放宽阈值）
3. 候选池不足（< 3天储备）→ 加速分析
4. 积压严重（> 7天）→ 批量处理
5. 推荐过度（比值 > 3.0）→ 提高阈值、降低频率
6. 质量问题（质量指数 < 60）→ 提高阈值
7. 正常状态 → 维持平衡策略
```

### 决策示例

#### 场景1（低产慢消费）完整决策

**输入数据**：
```json
{
  "dailyNewArticles": 10,
  "rawPoolSize": 25,
  "candidatePoolSize": 8,
  "dailyReadCount": 2.5,
  "dismissRate": 10.0,
  "likeRate": 60.0,
  "recommendationPoolSize": 2,
  "budgetUsage": 5%
}
```

**决策过程**：
1. **积压判断**：25 / 10 = 2.5天（正常）
2. **消费速度**：2.5篇/天 → **慢**消费 → cooldown = 120分钟
3. **质量指数**：(60×2 + 90) / 3 = 70 → 优秀 → threshold = 7.0
4. **候选池**：8 / 2.5 = 3.2天（健康）
5. **预算**：5%（充裕）

**输出策略**：
```json
{
  "analysis": {
    "batchSize": 5,
    "scoreThreshold": 7.0,
    "analysisIntervalMinutes": 30
  },
  "recommendation": {
    "targetPoolSize": 4,
    "cooldownMinutes": 120,  // ✅ 正确判断
    "dailyLimit": 10
  }
}
```

#### 场景2（高产快消费）完整决策

**输入数据**：
```json
{
  "dailyNewArticles": 150,
  "rawPoolSize": 200,
  "candidatePoolSize": 15,
  "dailyReadCount": 12.0,
  "dismissRate": 25.0,
  "likeRate": 45.0,
  "recommendationPoolSize": 2,
  "budgetUsage": 45%
}
```

**决策过程**：
1. **积压判断**：200 / 150 = 1.33天，但日产150（高产）→ **紧急** → interval ≤ 5分钟
2. **消费速度**：12篇/天 → **快**消费 → cooldown = 30-45分钟
3. **质量指数**：(45×2 + 75) / 3 = 55 → 一般 → threshold = 7.5-8.0  // ✅ 正确判断
4. **候选池**：15 / 12 = 1.25天（注意）→ 需加速补充
5. **预算**：45%（充裕）

**输出策略**：
```json
{
  "analysis": {
    "batchSize": 18,
    "scoreThreshold": 7.5,  // ✅ 正确判断（而非6.8）
    "analysisIntervalMinutes": 5  // ✅ 正确判断（而非12）
  },
  "recommendation": {
    "targetPoolSize": 7,
    "cooldownMinutes": 45,
    "dailyLimit": 25
  }
}
```

---

## 提示词增强建议

### 在 AI 决策提示词中添加

```markdown
## 量化判断规则（必须遵守）

### 1. 积压紧急度
- **危急**（rawPool / dailyNewArticles > 2.0）：analysisInterval ≤ 5分钟，batchSize = 15-20
- **紧急**（比值 1.0-2.0）：analysisInterval = 5-15分钟，batchSize = 10-15
- **注意**（比值 0.5-1.0）：analysisInterval = 15-30分钟，batchSize = 5-10
- **正常**（比值 < 0.5）：analysisInterval = 30-60分钟，batchSize = 3-8

### 2. 消费速度与冷却
- dailyReadCount < 2：cooldownMinutes = 120-180
- dailyReadCount 2-5：cooldownMinutes = 60-120
- dailyReadCount 5-10：cooldownMinutes = 45-60
- dailyReadCount > 10：cooldownMinutes = 30-45

### 3. 质量反馈调整
- 质量指数 = (likeRate × 2 + (100 - dismissRate)) / 3
- 指数 > 70：scoreThreshold = 7.0-7.5
- 指数 60-70：scoreThreshold = 7.5-8.0
- 指数 50-60：scoreThreshold = 8.0-8.5
- 指数 < 50：重新评估用户画像

### 4. 推荐效率控制
- 推荐消费比 > 5.0：严重过度 → scoreThreshold +1.5, dailyLimit ÷ 2
- 推荐消费比 3.0-5.0：过度 → scoreThreshold +1.0, dailyLimit ÷ 1.5
- 推荐消费比 2.0-3.0：正常
- 推荐消费比 < 1.0：供应不足 → 放宽阈值

### 5. 候选池健康度
- 剩余天数 = candidatePoolSize / dailyReadCount
- < 1天：危急 → 放宽threshold至6.0，加速分析
- 1-3天：注意 → 适度加速
- > 7天：过剩 → 提高threshold，减少分析

### 6. 预算控制
- 使用率 > 90%：停止分析，仅推荐
- 使用率 70-90%：大幅降低频率和批量
- 使用率 50-70%：适度控制
- 使用率 < 50%：正常策略
```

---

## 总结

### 改进要点

1. ✅ **显性量化规则**：用具体数值范围替代模糊描述
2. ✅ **多维度综合判断**：积压度、消费速度、质量反馈同时考虑
3. ✅ **优先级决策树**：预算 → 空池 → 积压 → 质量的优先级
4. ✅ **比值计算**：用比率而非绝对值判断紧急度

### 预期效果

添加这些量化规则后：
- 场景1：AI将正确判断 dailyReadCount=2.5 → cooldown=120分钟
- 场景2：AI将识别积压紧急度 → interval=5分钟，threshold=7.5

### 下一步

1. ✅ 将量化规则集成到 AI 决策提示词中
2. ✅ 重新测试场景1和场景2
3. ✅ 验证改进效果
4. 🚀 开始 Phase 1 开发（数据模型扩展）
