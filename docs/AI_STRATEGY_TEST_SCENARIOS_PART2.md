# AI 策略决策测试场景（续）

> **场景 4-6 以及测试 Prompt 模板**

---

## 场景 4: 接近 AI 预算上限

### 背景描述

成本敏感场景：
- 订阅了 20 个源
- 每日新文章约 80 篇
- 今日已用 90% 的 token 预算
- 推荐池 3/6 篇

### 系统状态数据

```json
{
  "supply": {
    "totalFeeds": 20,
    "activeFeeds": 18,
    "avgUpdateFrequency": 8.0,
    "dailyNewArticles": 80,
    "rawPoolSize": 150,
    "candidatePoolSize": 25,
    "analyzedNotQualifiedSize": 120
  },
  "demand": {
    "dailyReadCount": 5.0,
    "avgReadSpeed": 5.0,
    "dismissRate": 20.0,
    "likeRate": 50.0,
    "recommendationPoolSize": 3,
    "recommendationPoolCapacity": 6
  },
  "system": {
    "aiTokensUsedToday": 90000,
    "aiTokensBudgetDaily": 100000,
    "aiCostToday": 0.90,
    "analyzedArticlesToday": 90,
    "recommendedArticlesToday": 30
  },
  "history": {
    "last7DaysReadCount": 35,
    "last7DaysRecommendedCount": 200,
    "last7DaysAnalyzedCount": 600
  },
  "userProfile": {
    "pageVisitCount": 300,
    "onboardingComplete": true,
    "topTopics": ["技术", "AI", "开发"],
    "profileConfidence": 0.9
  }
}
```

### 期望策略特征

**诊断**：接近预算上限（90%），需要节省成本

**应对策略**：
1. **分析策略**：
   - 停止或极少分析（batchSize = 1-2）
   - 超长间隔（60 分钟）
   - 中等门槛（7.0-7.5）- 从候选池挑选即可

2. **推荐策略**：
   - 从现有候选池（25 篇）推荐
   - 正常冷却（60-90 分钟）
   - 低每日上限（10-15 篇）

3. **候选池**：
   - 维持当前容量（不再增加）
   - 优先消耗现有候选

### 验证标准

- ✅ `analysisIntervalMinutes >= 60`（减少分析）
- ✅ `batchSize <= 2`（小批次或停止）
- ✅ `dailyLimit <= 15`（控制成本）
- ✅ AI 应明确说明"成本控制优先"
- ✅ AI 应建议从现有候选池推荐而非大量分析新文章

---

## 场景 5: 均衡场景（最常见）

### 背景描述

健康的稳态场景：
- 订阅了 12 个源
- 每日新文章约 40 篇
- 用户每天阅读 4-5 篇
- 推荐池 4/6 篇
- 候选池 20 篇

### 系统状态数据

```json
{
  "supply": {
    "totalFeeds": 12,
    "activeFeeds": 12,
    "avgUpdateFrequency": 8.0,
    "dailyNewArticles": 40,
    "rawPoolSize": 60,
    "candidatePoolSize": 20,
    "analyzedNotQualifiedSize": 80
  },
  "demand": {
    "dailyReadCount": 4.5,
    "avgReadSpeed": 4.5,
    "dismissRate": 15.0,
    "likeRate": 55.0,
    "recommendationPoolSize": 4,
    "recommendationPoolCapacity": 6
  },
  "system": {
    "aiTokensUsedToday": 35000,
    "aiTokensBudgetDaily": 100000,
    "aiCostToday": 0.35,
    "analyzedArticlesToday": 35,
    "recommendedArticlesToday": 12
  },
  "history": {
    "last7DaysReadCount": 30,
    "last7DaysRecommendedCount": 80,
    "last7DaysAnalyzedCount": 250
  },
  "userProfile": {
    "pageVisitCount": 250,
    "onboardingComplete": true,
    "topTopics": ["技术", "产品", "设计"],
    "profileConfidence": 0.88
  }
}
```

### 期望策略特征

**诊断**：供需平衡，系统健康

**应对策略**：
1. **分析策略**：
   - 中等批次（8-12 篇）
   - 中等门槛（7.0-7.5）
   - 中等间隔（5-15 分钟）

2. **推荐策略**：
   - 标准推荐池（6 篇）
   - 中等触发阈值（2-3 篇）
   - 中等冷却（60-90 分钟）
   - 中等每日上限（15-20 篇）

3. **候选池**：
   - 中等容量（30-50 篇）
   - 中等过期时间（48-72 小时）

### 验证标准

- ✅ 所有参数应在中等范围
- ✅ `analysisIntervalMinutes` 在 5-15 分钟
- ✅ `batchSize` 在 8-12 篇
- ✅ `scoreThreshold` 在 7.0-7.5
- ✅ `cooldownMinutes` 在 60-90 分钟
- ✅ AI 应说明"维持当前健康状态"

---

## 场景 6: 候选池不足，推荐池空

### 背景描述

供给危机场景：
- 订阅了 8 个源（都是低频）
- 每日新文章约 15 篇
- 用户每天阅读 6 篇（高需求）
- 推荐池为空
- 候选池只有 3 篇

### 系统状态数据

```json
{
  "supply": {
    "totalFeeds": 8,
    "activeFeeds": 8,
    "avgUpdateFrequency": 18.0,
    "dailyNewArticles": 15,
    "rawPoolSize": 30,
    "candidatePoolSize": 3,
    "analyzedNotQualifiedSize": 50
  },
  "demand": {
    "dailyReadCount": 6.0,
    "avgReadSpeed": 6.0,
    "dismissRate": 12.0,
    "likeRate": 65.0,
    "recommendationPoolSize": 0,
    "recommendationPoolCapacity": 6
  },
  "system": {
    "aiTokensUsedToday": 20000,
    "aiTokensBudgetDaily": 100000,
    "aiCostToday": 0.20,
    "analyzedArticlesToday": 20,
    "recommendedArticlesToday": 8
  },
  "history": {
    "last7DaysReadCount": 42,
    "last7DaysRecommendedCount": 50,
    "last7DaysAnalyzedCount": 140
  },
  "userProfile": {
    "pageVisitCount": 400,
    "onboardingComplete": true,
    "topTopics": ["技术", "开发"],
    "profileConfidence": 0.92
  }
}
```

### 期望策略特征

**诊断**：供不应求（用户需求 6 篇/天，但源只产出 15 篇/天，经过筛选后候选不足）

**应对策略**：
1. **分析策略**：
   - 中等批次（8-12 篇）
   - **降低门槛**（6.5-7.0）- 放宽标准以增加候选
   - 短间隔（3-10 分钟）- 快速补充

2. **推荐策略**：
   - 标准推荐池（6 篇）
   - 低触发阈值（1-2 篇）
   - 短冷却（30-60 分钟）- 快速补充
   - 中等每日上限（15-20 篇）

3. **候选池**：
   - 目标增加到 15-30 篇
   - 长过期时间（72-120 小时）- 保留更多候选

### 验证标准

- ✅ `scoreThreshold <= 7.0`（降低门槛应对供给不足）
- ✅ `analysisIntervalMinutes <= 10`（快速分析补充候选）
- ✅ `cooldownMinutes <= 60`（快速推荐）
- ✅ `candidatePool.targetSize >= 15`（增加候选储备）
- ✅ AI 应识别"供不应求"问题并建议降低门槛

---

## 场景 7: 新用户初始化（空池启动）

### 背景描述

用户刚安装扩展，第一次运行：
- 订阅了 5 个源
- 刚抓取了 25 篇文章
- 所有池子都是空的
- 用户还没有消费记录

### 系统状态数据

```json
{
  "supply": {
    "totalFeeds": 5,
    "activeFeeds": 5,
    "avgUpdateFrequency": 12.0,
    "dailyNewArticles": 10,
    "rawPoolSize": 25,
    "candidatePoolSize": 0,
    "analyzedNotQualifiedSize": 0
  },
  "demand": {
    "dailyReadCount": 0,
    "avgReadSpeed": 0,
    "dismissRate": 0,
    "likeRate": 0,
    "recommendationPoolSize": 0,
    "recommendationPoolCapacity": 6
  },
  "system": {
    "aiTokensUsedToday": 0,
    "aiTokensBudgetDaily": 100000,
    "aiCostToday": 0,
    "analyzedArticlesToday": 0,
    "recommendedArticlesToday": 0
  },
  "history": {
    "last7DaysReadCount": 0,
    "last7DaysRecommendedCount": 0,
    "last7DaysAnalyzedCount": 0
  },
  "userProfile": {
    "pageVisitCount": 50,
    "onboardingComplete": true,
    "topTopics": ["技术", "编程", "开源"],
    "profileConfidence": 0.7
  }
}
```

### 期望策略特征

**诊断**：新用户冷启动，需要快速建立初始推荐池

**应对策略**：
1. **分析策略**：
   - 中等批次（8-12 篇）- 快速建立候选池
   - 中等门槛（7.0-7.5）- 平衡质量和数量
   - **初期短间隔**（5-10 分钟）- 快速完成初始分析

2. **推荐策略**：
   - 标准推荐池（6 篇）
   - 低触发阈值（1-2 篇）
   - 中等冷却（60-90 分钟）
   - 中等每日上限（10-15 篇）- 因为无历史数据，使用中等值

3. **候选池**：
   - 初期目标（15-25 篇）- 快速建立储备
   - 中等过期时间（48-72 小时）

**关键点**：
- ⚠️ 策略应该是"一次性激进"，而非"持续激进"
- ⚠️ AI 应建议"初始化完成后切换到保守策略"
- ⚠️ validHours 应该较短（12小时），因为用户行为数据会快速积累

### 验证标准

- ✅ `analysisIntervalMinutes` 在 5-10 分钟（初始化需快速）
- ✅ `batchSize` 在 8-12 篇（快速建立候选池）
- ✅ `scoreThreshold` 在 7.0-7.5（平衡质量和数量）
- ✅ `candidatePool.targetSize` 在 15-25 篇（初始储备）
- ✅ `validHours <= 12`（短有效期，因为情况会快速变化）
- ✅ AI 应明确说明"这是初始化策略，需要快速切换"

---

## 测试 Prompt 模板

### 完整 Prompt（用于测试）

```
你是 Silent Feed 推荐系统的策略决策引擎。

## 系统说明

Silent Feed 是一个 RSS 阅读器，使用 AI 分析文章并推荐给用户。系统包含 4 个池子：

1. **原始池 (Raw Pool)**：未分析的文章（从订阅源抓取）
2. **已分析未入候选池**：分析后不符合推荐条件的文章（score < 门槛）
3. **候选池 (Candidate Pool)**：高分文章暂存区，等待推荐
4. **推荐池 (Recommendation Pool)**：待展示给用户的推荐

## 你的任务

根据当前系统状态，输出一个参数化的推荐策略，以达到以下目标：

1. **平衡供需**：让推荐池保持在合理容量，避免过载或不足
2. **优化成本**：在 AI 成本预算内，最大化推荐质量
3. **提升体验**：让用户始终有高质量内容可读，不堆积不枯竭

## 当前状态

[在这里插入具体场景的 JSON 数据]

## 决策维度

### 0. 场景识别（重要）
首先判断当前处于哪种状态：
- **初始化状态**：所有池子接近空（候选池 < 5 篇，推荐池 < 2 篇，历史数据 < 3 天）
  - 特征：需要快速建立初始推荐池
  - 策略：短期激进（快速分析、快速推荐），**但有效期要短**（12小时内切换到稳态）
  
- **稳态运行**：有一定库存（候选池 > 5 篇 或 推荐池 > 2 篇，历史数据 > 3 天）
  - 特征：根据供需关系调整
  - 策略：基于供需比、用户消费速度、AI成本等因素动态决策

- **异常状态**：堆积、枯竭、预算告急
  - 特征：明显的不平衡（如推荐150篇只消费10篇）
  - 策略：激进调整（大幅提高门槛或降低门槛）

**⚠️ 重要**：不要把"候选池为0"一律当作紧急状态！要结合历史数据判断是"初始化"还是"供给危机"。

### 1. 分析策略
- **批次大小**：每次分析几篇文章？（考虑：效率、超时风险、成本）
- **门槛**：score 多少以上才进入候选池？（考虑：候选池质量、用户反馈）
- **间隔**：多久触发一次分析任务？（考虑：原始池大小、AI 预算、候选池库存）

### 2. 推荐策略
- **目标容量**：推荐池应该保持多少篇？（考虑：用户消费速度、质量保证）
- **补充阈值**：推荐池降到多少时触发补充？（考虑：避免空池、避免频繁补充）
- **冷却时间**：两次补充间隔多久？（考虑：用户消费速度、避免堆积）
- **每日上限**：每天最多推荐多少篇？（考虑：避免过度推荐）

### 3. 调度策略
- **分析间隔**：分析任务多久触发一次？（考虑：原始池增长速度、AI 成本）
- **推荐间隔**：推荐任务多久触发一次？（考虑：候选池库存、用户消费速度）
- **循环次数**：每次任务执行几轮？（考虑：效率、超时风险）

### 4. 候选池管理
- **目标容量**：保持多少高分文章？（考虑：保证供应、避免过期）
- **最大容量**：候选池上限？（考虑：存储成本）
- **过期时间**：文章在候选池多久后过期？（考虑：时效性）

## 参数合理范围

```json
{
  "analysis": {
    "batchSize": [1, 20],
    "scoreThreshold": [6.0, 8.5]
  },
  "recommendation": {
    "targetPoolSize": [3, 10],
    "refillThreshold": [1, 5],
    "dailyLimit": [5, 30],
    "cooldownMinutes": [30, 180]
  },
  "scheduling": {
    "analysisIntervalMinutes": [1, 60],
    "recommendIntervalMinutes": [1, 60],
    "loopIterations": [1, 10]
  },
  "candidatePool": {
    "targetSize": [10, 100],
    "maxSize": [20, 200],
    "expiryHours": [24, 168]
  },
  "meta": {
    "validHours": [12, 48]
  }
}
```

## 输出格式

请以 JSON 格式输出策略，包含所有参数和决策理由：

```json
{
  "analysis": {
    "batchSize": 10,
    "scoreThreshold": 7.0
  },
  "recommendation": {
    "targetPoolSize": 6,
    "refillThreshold": 2,
    "dailyLimit": 20,
    "cooldownMinutes": 60
  },
  "scheduling": {
    "analysisIntervalMinutes": 5,
    "recommendIntervalMinutes": 10,
    "loopIterations": 3
  },
  "candidatePool": {
    "targetSize": 30,
    "maxSize": 60,
    "expiryHours": 48
  },
  "meta": {
    "reason": "当前原始池有 50 篇未分析文章，推荐池充足（4/6），用户消费速度中等（2篇/天），因此采用中等分析频率，每 5 分钟分析 10 篇，门槛保持 7.0 以确保质量。推荐池目标 6 篇，降到 2 篇时补充，冷却 60 分钟避免过度推荐。候选池保持 30 篇作为缓冲。",
    "confidence": 0.85,
    "validHours": 24
  }
}
```

## 决策原则

1. **供需平衡原则**：
   - 如果原始池增长快、用户消费慢 → 降低分析频率、提高门槛
   - 如果候选池充足、推荐池未满 → 减少分析、从候选池推荐
   - 如果候选池不足、用户消费快 → 降低门槛、增加分析频率

2. **成本优化原则**：
   - 如果接近预算 → 降低分析频率、减少批次
   - 如果远低于预算 → 可适当增加分析以提高质量

3. **质量优先原则**：
   - 宁可推荐少，不可推荐差
   - 高拒绝率（>30%）→ 提高门槛
   - 高喜欢率（>60%）→ 维持或略降门槛

4. **动态调整原则**：
   - 策略应该随着数据变化而变化
   - 异常情况（堆积、不足、预算超限）需要激进调整
   - 稳态情况保持中等参数

现在，请基于上述信息，给出你的策略决策。
```

---

## 如何测试

1. 复制上面的 Prompt 模板
2. 将具体场景的 JSON 数据插入到"当前状态"部分
3. 提交给 AI（GPT-4、Claude、DeepSeek 等）
4. 检查返回的策略是否符合验证标准
5. 评估 AI 的理由是否合理

---

## 测试结果记录模板

```markdown
### 场景 X 测试结果

**测试 AI**: GPT-4 / Claude 3.5 / DeepSeek

**返回策略**:
```json
{策略 JSON}
```

**验证结果**:
- ✅ / ❌ 参数在合理范围内
- ✅ / ❌ 符合场景特征
- ✅ / ❌ 理由清晰合理

**问题**:
- [列出发现的问题]

**结论**: 通过 / 需要调整 Prompt / 不可行
```

---

## 预期测试结果

如果 AI 能在 **5-6 个场景中至少 4 个给出合理策略**，则认为架构可行，可以进入开发阶段。

否则，需要：
1. 调整 Prompt（更清晰的说明、更多示例）
2. 简化策略参数（减少 AI 决策的维度）
3. 考虑混合模式（部分参数固定、部分由 AI 决策）
