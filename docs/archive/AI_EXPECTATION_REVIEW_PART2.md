# AI 策略预期合理性审查（续）

> **Part 2: 场景3-7的预期审查**

---

## Part 3: 场景3（推荐过载）预期审查

### 原始预期
```
- scoreThreshold >= 8.0
- cooldownMinutes >= 150
- dailyLimit <= 10
- analysisIntervalMinutes >= 30
- batchSize <= 5
```

### 数据回顾
```json
{
  "dailyNewArticles": 60,
  "rawPoolSize": 120,
  "candidatePoolSize": 35,
  "dailyReadCount": 1.5,
  "recommendationPoolSize": 6,
  "last7DaysRecommendedCount": 150,
  "last7DaysReadCount": 10,
  "dismissRate": 40.0,
  "likeRate": 30.0
}
```

### 关键指标
- 推荐消费比 = 150 / 10 = **15:1**（严重过度）
- 推荐池已满（6/6）
- 质量指数 = (30×2 + 60) / 3 = 40（差）

### 合理性分析

#### ✅ scoreThreshold >= 8.0 完全合理

**论证**：
- likeRate = 30%，dismissRate = 40%
- 推荐质量明显有问题
- 必须大幅提高阈值

**AI表现**：threshold = 8.2 ✅ 完美

---

#### ✅ cooldownMinutes >= 150 合理

**论证**：
- 用户日均消费1.5篇
- 消费间隔 = 1440 / 1.5 = 960分钟（16小时/篇）
- cooldown = 150分钟（2.5小时）仍然偏快
- 但考虑到推荐池会自然消耗，150分钟是合理的触发阈值

**AI表现**：cooldown = 120分钟 ⚠️ 略短，但可接受

---

#### ✅ dailyLimit <= 10 非常合理

**论证**：
- 用户日均消费1.5篇
- 推荐15篇（比值10:1）已经严重过度
- dailyLimit = 8-10 合理

**AI表现**：dailyLimit = 8 ✅ 完美

---

#### ✅ 分析策略合理

**论证**：
- 候选池35篇充足
- 应降低分析频率和批量
- 避免继续生产低质内容

**AI表现**：interval = 30+, batchSize = 1-5 ✅ 符合预期

---

### 结论

✅ **场景3的预期非常合理**，AI也完美通过（6/6）

---

## Part 4: 场景4（预算告急）预期审查

### 原始预期
```
- 停止或极少分析
- batchSize = 1（最小）
- analysisInterval 最大化
- 利用现有候选池25篇
```

### 数据回顾
```json
{
  "aiTokensUsedToday": 90000,
  "aiTokensBudgetDaily": 100000,
  "candidatePoolSize": 25,
  "dailyReadCount": 5.0
}
```

### 关键指标
- 预算使用率 = 90%
- 剩余预算 = 10000 tokens
- 候选池剩余 = 25 / 5 = 5天（充足）

### 合理性分析

#### ✅ 停止分析完全合理

**论证**：
- 预算仅剩10%
- 候选池25篇足够支撑5天
- 预算会在UTC 0点重置
- 应停止分析，保留余量应对突发

**AI表现**：
- batchSize = 1
- interval = 60分钟
- 明确说明"停止常规分析"
- ✅ 完美

---

#### ✅ 利用现有候选池合理

**论证**：
- 25篇候选足够
- 无需新分析

**结论**：✅ **场景4预期完全合理**

---

## Part 5: 场景5（均衡场景）预期审查

### 原始预期
```
- 维持当前策略
- 中等参数值
- 不激进调整
```

### 数据回顾
```json
{
  "dailyNewArticles": 50,
  "rawPoolSize": 30,
  "candidatePoolSize": 35,
  "dailyReadCount": 6.0,
  "likeRate": 60.0,
  "dismissRate": 15.0,
  "budgetUsage": 35%
}
```

### 关键指标
- 积压天数 = 30 / 50 = 0.6天（正常）
- 候选池剩余 = 35 / 6 = 5.8天（健康）
- 质量指数 = (60×2 + 85) / 3 = 68（良好）
- 推荐消费比 = 120 / 42 = 2.86（正常）

### 合理性分析

#### ✅ 维持策略非常合理

**论证**：
- 所有指标都在健康范围
- 无需激进调整
- 保持稳态

**AI表现**：
- 提供稳健的中等参数
- 设置健康监测阈值
- ✅ 完美

**结论**：✅ **场景5预期合理**

---

## Part 6: 场景6（供应短缺）预期审查

### 原始预期
```
- 放宽scoreThreshold至6.0
- 加速分析至5分钟
- 优先解决空池风险
```

### 数据回顾
```json
{
  "totalFeeds": 5,
  "dailyNewArticles": 10,
  "rawPoolSize": 8,
  "candidatePoolSize": 4,
  "recommendationPoolSize": 0,
  "dailyReadCount": 4.0
}
```

### 关键指标
- 推荐池已空（危急）
- 候选池剩余 = 4 / 4 = 1天（不足）
- 原料池仅8篇

### 合理性分析

#### ✅ 放宽阈值至6.0合理

**论证**：
- 推荐池已空，用户无内容
- 体验优先于完美质量
- 6.0仍然保证基本匹配度

**AI表现**：threshold = 6.0 ✅ 完美

---

#### ✅ 加速处理合理

**论证**：
- 空池风险
- 需快速补充

**AI表现**：interval = 5分钟 ✅ 符合预期

---

#### ⚠️ 长期策略的缺失

**问题**：
- 总订阅源仅5个
- 日产10篇根本不够支撑日消费4篇
- **这是供应源不足，不是策略问题**

**应补充**：
- 建议引导用户添加更多订阅源
- 或降低推荐频率（调整用户预期）

**结论**：✅ **短期策略合理**，但需标注长期需增加订阅源

---

## Part 7: 场景7（新用户初始化）预期审查

### 原始预期
```
- 快速启动（interval <= 5）
- 短期策略（validHours = 12）
- 明确标注"初始化"
```

### 数据回顾
```json
{
  "rawPoolSize": 0,
  "candidatePoolSize": 0,
  "recommendationPoolSize": 0,
  "onboardingComplete": true
}
```

### 合理性分析

#### ✅ 所有预期都合理

**论证**：
- 空池需要快速启动
- 初始化状态需要特殊处理
- 12小时后切换稳态策略

**AI表现**：完美识别，6/6通过 ✅

**结论**：✅ **场景7预期完全合理**

---

## 总结：预期合理性评估

### 完全合理的场景（5/7）

| 场景 | 预期 | 理由 |
|------|------|------|
| 场景3 | 提高阈值8.0+，严格限流 | 推荐过度15:1，质量差 |
| 场景4 | 停止分析，利用存量 | 预算90%，候选池充足 |
| 场景5 | 维持稳态 | 所有指标健康 |
| 场景6 | 放宽阈值6.0，加速处理 | 推荐池空，供应不足 |
| 场景7 | 快速启动，短期策略 | 初始化状态 |

### 需要修正的场景（2/7）

#### 场景1（低产慢消费）

**原预期问题**：
- ❌ `analysisInterval >= 10`（过于保守）
- ❌ `cooldownMinutes >= 120`（单边约束过严）

**修正建议**：
```diff
- analysisIntervalMinutes >= 10
+ analysisIntervalMinutes in [15, 45]

- cooldownMinutes >= 120
+ cooldownMinutes in [90, 180]

+ dailyLimit in [6, 12]
```

**理由**：
- 积压2.5天不算严重，不需极度保守
- 慢消费应给宽松范围而非严格下限
- 增加dailyLimit防止过度推荐

---

#### 场景2（高产快消费）

**原预期问题**：
- ⚠️ `analysisInterval <= 5`（略激进）
- ⚠️ `scoreThreshold in [7.5, 8.0]`（可能过严）

**修正建议**：
```diff
- analysisIntervalMinutes <= 5
+ analysisIntervalMinutes in [5, 10]

- scoreThreshold in [7.5, 8.0]
+ scoreThreshold in [7.0, 7.5]
```

**理由**：
- interval <= 5可行但偏激进，<= 10更稳健
- likeRate = 45%在高消费场景可接受，7.5-8.0可能导致供应不足
- 应平衡质量与供应

---

## 核心洞察

### 1. 范围 vs 单边约束

**问题**：很多预期用单边约束（>= X 或 <= X）

**改进**：用范围约束（in [X, Y]）更灵活

**示例**：
```diff
- cooldownMinutes >= 120
+ cooldownMinutes in [90, 180]
```

### 2. 积压天数的"合理值"

**关键问题**：多少天积压算"正常"？

**我的判断**：
- < 1天：正常缓冲
- 1-3天：轻微积压（可接受）
- 3-7天：中度积压（需加速）
- > 7天：严重积压（紧急处理）

**场景1的2.5天属于"轻微积压"**，不需激进处理

### 3. 质量阈值的动态性

**关键问题**：threshold应该固定还是动态？

**我的判断**：
- 供应充足时：提高threshold（质量优先）
- 供应不足时：适度放宽（体验优先）
- 高消费场景：略微放宽（保证供应）

**场景2的 threshold 7.5-8.0可能过严**

### 4. 消费速度的权重

**关键洞察**：
- 慢消费（< 3篇/天）：推荐频率应极度保守
- 快消费（> 10篇/天）：允许更激进的补充

**cooldown应该紧密关联消费速度**

---

## 最终修正后的决策原则

### 修正版量化规则

#### 1. 积压紧急度（修正）

```typescript
积压天数 = rawPool / dailyNewArticles

// 分级标准（更宽松）
- > 7天：严重积压 → interval 5-10分钟
- 3-7天：中度积压 → interval 15-30分钟
- 1-3天：轻微积压 → interval 30-45分钟
- < 1天：正常缓冲 → interval 45-60分钟

// 高产出特殊规则（保留）
if (dailyNewArticles > 100 && 积压天数 > 1.5) {
  → 中度积压，interval 10-20分钟
}
```

#### 2. 消费速度与冷却（范围化）

```typescript
// 使用范围而非单边约束
- dailyReadCount < 2 → cooldown in [120, 180]
- dailyReadCount 2-5 → cooldown in [60, 120]
- dailyReadCount 5-10 → cooldown in [40, 60]
- dailyReadCount > 10 → cooldown in [30, 45]
```

#### 3. 质量阈值（动态化）

```typescript
质量指数 = (likeRate × 2 + (100 - dismissRate)) / 3

基准阈值：
- 指数 > 70 → base_threshold = 7.0-7.5
- 指数 60-70 → base_threshold = 7.3-7.8
- 指数 50-60 → base_threshold = 7.5-8.0
- 指数 < 50 → base_threshold = 7.8-8.5

// 供应调整
if (候选池剩余 < 2天) {
  threshold = base_threshold - 0.3  // 略微放宽
}

// 快消费调整（更保守）
if (dailyReadCount > 10 && 候选池剩余 < 2天) {
  threshold = base_threshold - 0.2  // 少量放宽
}
```

---

## 建议

### 1. 更新测试场景的验证标准

将单边约束改为范围约束，更符合真实决策逻辑。

### 2. 承认"灰色地带"的存在

不是所有参数都有唯一正确答案，某些场景下多个策略都可行。

### 3. 增加"可接受范围"概念

```
- 最优范围：[X1, X2]
- 可接受范围：[X1-δ, X2+δ]
- 不可接受：超出可接受范围
```

### 4. 添加"策略权衡"说明

某些决策需要在质量、成本、体验之间权衡，应明确权衡逻辑。

---

**审查日期**: 2026年1月2日  
**审查结论**: 5/7场景预期合理，2/7场景需适度放宽约束  
**关键发现**: 应使用范围约束替代单边约束，承认灰色地带的存在
