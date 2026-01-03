# 推荐系统架构重新设计

> **从固定策略到 AI 驱动的动态推荐系统**
> 
> 版本: v2.0  
> 创建时间: 2026年1月2日

---

## 📋 目录

1. [问题诊断](#问题诊断)
2. [架构重设计](#架构重设计)
3. [多池架构](#多池架构)
4. [AI 策略决策](#ai-策略决策)
5. [实施方案](#实施方案)

---

## 问题诊断

### 当前架构的核心矛盾

```
供给侧（不可控）：订阅源以自己的节奏生产文章
   ↕️  不匹配
调度侧（僵化）：固定策略（refill cooldown、固定阈值）
   ↕️  不匹配
需求侧（不可控）：用户以自己的节奏消费推荐
```

### 具体问题

1. **推荐过载**：高产源 + 慢消费用户 = 推荐堆积，低分文章充数
2. **推荐不足**：低产源 + 快消费用户 = 无内容可推荐
3. **策略僵化**：基于规则的策略要么太复杂，要么太机械
4. **冷冻机制不匹配**：固定的 refill cooldown 无法适应动态场景

### 根本原因

**试图用固定策略匹配两个动态的、不可控的变量**

---

## 架构重设计

### 设计理念

**从"基于规则"到"AI 驱动"**：
- 不再预设固定规则
- 将所有考虑因素清晰地告知 AI
- 让 AI 基于实时数据给出参数化策略
- 程序根据策略动态调整行为

### 核心原则

1. **透明的数据流**：文章在各个池子间的流转清晰可追溯
2. **动态的策略**：根据实时供需情况调整推荐行为
3. **智能的门控**：AI 决定何时分析、何时推荐、何时冷冻
4. **用户为中心**：以用户消费速度为锚点，反向调整供给

---

## 多池架构

### 文章生命周期：4 个池子

```
┌─────────────────────────────────────────────────────────────┐
│                     订阅源自动更新（独立机制）                    │
│                             ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Pool 1: 原始池 (Raw Pool)                              │   │
│  │ - 状态: analysis=null（未分析）                         │   │
│  │ - 范围: 所有未分析的文章（包括 inFeed=false）             │   │
│  │ - 目的: 避免因分析不及时而丢失被源剔除的文章              │   │
│  │ - 容量: 无上限（自动维护删除久远文章）                     │   │
│  │ - 流出: AI 分析后流向 Pool 2 或 Pool 3                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                             ↓                                 │
│                      AI 文章分析任务                           │
│                    （动态调度频率）                             │
│                             ↓                                 │
│              ┌──────────────┴──────────────┐                 │
│              ↓                             ↓                 │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │ Pool 3: 候选池        │      │ Pool 2: 已分析未入候选  │       │
│  │ (Candidates)        │      │ (Analyzed-NotQualified)│      │
│  │ - 已分析，高分       │      │ - 已分析，不合格      │       │
│  │ - 待推荐             │      │ - score < 门槛或其他   │       │
│  │ - score ≥ 门槛      │      │ - 避免重复分析        │       │
│  │ - 核心缓冲区         │      │ - 不需要解冻机制      │       │
│  └─────────────────────┘      └─────────────────────┘       │
│              ↓                                                │
│      推荐任务（动态调度）                                       │
│      从候选池挑选最优文章                                       │
│              ↓                                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Pool 4: 推荐池 (Recommendations)                        │   │
│  │ - 状态: active, 待用户消费                              │   │
│  │ - 容量: maxRecommendations × 2（弹窗容量的 2 倍）        │   │
│  │ - 流出: 用户消费（已读/拒绝）或过期                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                             ↓                                 │
│                      用户消费（不可控）                         │
└─────────────────────────────────────────────────────────────┘
```

### 池子详细定义

#### Pool 1: 原始池 (Raw Pool)

**作用**：存储所有未分析的文章（包括已被源剔除的）

**关键设计**：范围是"未分析"而非"在源中"，避免分析不及时导致文章丢失

**字段**：
```typescript
{
  inFeed: true/false,     // 是否在源中（可能已被剔除）
  analysis: null,         // 未分析
  // ... 其他字段
}
```

**流入**：订阅源自动更新机制（独立运行）

**流出**：
- AI 分析后 → Pool 3 (高分，入候选) 或 Pool 2 (不合格)
- 自动维护删除久远文章（如 30 天前）

**容量**：无上限（自动维护）

**查询**：
```typescript
db.feedArticles.where('analysis').equals(null).toArray()
```

---

#### Pool 2: 已分析未入候选 (Analyzed-NotQualified)

**作用**：记录已分析但不符合推荐条件的文章，避免重复分析

**字段**：
```typescript
{
  inFeed: true/false,
  analysis: {
    score: number,        // < 推荐门槛 或其他原因
    topics: {...},
    reason: string,       // "score_too_low" | "duplicate" | "low_quality"
    ...
  },
  isRecommended: false,
  poolStatus: 'analyzed-not-qualified',
}
```

**流入**：
- AI 分析后，score < 门槛
- AI 分析后，判断为重复/低质量

**流出**：
- 自动删除久远文章（如 7 天前）
- **不需要解冻/重新分析机制**

**容量**：有上限（如 5000 篇，超过删除最旧的）

**查询**：
```typescript
db.feedArticles
  .where('poolStatus').equals('analyzed-not-qualified')
  .toArray()
```

---

#### Pool 3: 候选池 (Candidates)

**作用**：核心缓冲区，存储高分文章，等待推荐

**这是解决之前问题的关键**：避免文章分析后立即推荐导致推荐池堆积

**字段**：
```typescript
{
  inFeed: true/false,
  analysis: {
    score: number,        // ≥ 推荐门槛
    topics: {...},
    ...
  },
  isRecommended: false,
  poolStatus: 'candidate',
  candidateAt: timestamp, // 进入候选池时间
}
```

**流入**：AI 分析后，score ≥ 门槛的文章

**流出**：
- 推荐任务选中 → Pool 4 (推荐池)
- 过期或文章被删除 → 清理

**容量**：动态（AI 决定保持多少候选，如 20-100 篇）

**排序**：
- 主排序：score 降序
- 次排序：时效性（新鲜度）
- 可选：多样性（避免同一主题过多）

**查询**：
```typescript
db.feedArticles
  .where('poolStatus').equals('candidate')
  .sortBy('analysis.score')
  .then(articles => articles.reverse())
```

---

#### Pool 4: 推荐池 (Recommendations)

**作用**：存储待展示给用户的推荐

**表**：`Recommendations` 表（已有）

**字段**：
```typescript
{
  articleId: string,
  score: number,
  reason: string,
  status: 'active' | 'read' | 'dismissed',
  isRead: boolean,
  feedback: null | 'liked' | 'dismissed',
  recommendedAt: timestamp,
}
```

**流入**：推荐任务从 Pool 3 (候选池) 选出高分文章

**流出**：
- 用户消费（已读/拒绝）
- 过期自动清理

**容量**：maxRecommendations × 2（例如 3 × 2 = 6）

---

## AI 策略决策

### 策略参数化

AI 不再给出"固定规则"，而是给出**参数化的动态策略**（带合理范围约束）：

```typescript
interface RecommendationStrategy {
  // 1. 分析策略
  analysis: {
    batchSize: number,                     // 每次分析几篇 [范围: 1-20]
    scoreThreshold: number,                // 推荐门槛（动态）[范围: 6.0-8.5]
    prioritySource: string[],              // 优先分析的订阅源（可选）
  },
  
  // 2. 推荐策略
  recommendation: {
    targetPoolSize: number,                // 目标推荐池容量 [范围: 3-10]
    refillThreshold: number,               // 补充阈值（池子降到多少时触发）[范围: 1-5]
    dailyLimit: number,                    // 每日推荐上限 [范围: 5-30]
    cooldownMinutes: number,               // 补充冷却时间 [范围: 30-180]
  },
  
  // 3. 调度策略
  scheduling: {
    analysisIntervalMinutes: number,       // 分析任务间隔 [范围: 1-60]
    recommendIntervalMinutes: number,      // 推荐任务间隔 [范围: 1-60]
    loopIterations: number,                // 每次任务循环次数 [范围: 1-10]
  },
  
  // 4. 候选池管理
  candidatePool: {
    targetSize: number,                    // 目标容量 [范围: 10-100]
    maxSize: number,                       // 最大容量 [范围: 20-200]
    expiryHours: number,                   // 过期时间 [范围: 24-168 (1-7天)]
  },
  
  // 5. 策略元信息
  meta: {
    reason: string,                        // 策略原因（简洁，1-2句话）
    confidence: number,                    // 置信度 (0-1)
    validHours: number,                    // 有效期（小时）[范围: 12-48]
  }
}
```

**参数约束后处理**：程序收到 AI 输出后，会自动修正超出范围的值
```

### AI 决策输入

AI 基于以下实时数据做决策：

```typescript
interface StrategyDecisionContext {
  // 1. 供给侧数据
  supply: {
    totalFeeds: number,                    // 订阅源总数
    activeFeeds: number,                   // 活跃订阅源数
    avgUpdateFrequency: number,            // 平均更新频率（小时）
    dailyNewArticles: number,              // 每日新文章数
    rawPoolSize: number,                   // Pool 1 容量
    candidatePoolSize: number,             // Pool 2 容量
    frozenPoolSize: number,                // Pool 3 容量
  },
  
  // 2. 需求侧数据
  demand: {
    dailyReadCount: number,                // 用户每日阅读数
    avgReadSpeed: number,                  // 平均阅读速度（篇/天）
    dismissRate: number,                   // 拒绝率
    likeRate: number,                      // 喜欢率
    recommendationPoolSize: number,        // Pool 4 当前容量
    recommendationPoolCapacity: number,    // Pool 4 最大容量
  },
  
  // 3. 系统状态
  system: {
    aiTokensUsedToday: number,             // 今日 token 消耗
    aiTokensBudget: number,                // 每日 token 预算
    aiCostToday: number,                   // 今日成本
    analyzedArticlesToday: number,         // 今日分析数
    recommendedArticlesToday: number,      // 今日推荐数
  },
  
  // 4. 历史数据
  history: {
    last7DaysReadCount: number,            // 过去 7 天阅读数
    last7DaysRecommendedCount: number,     // 过去 7 天推荐数
    last7DaysAnalyzedCount: number,        // 过去 7 天分析数
    avgScoreDistribution: {...},          // 分数分布
  },
  
  // 5. 用户画像
  userProfile: {
    pageVisitCount: number,                // 浏览页面数
    onboardingComplete: boolean,           // 是否完成引导
    topTopics: string[],                   // 主要兴趣
    profileConfidence: number,             // 画像置信度
  }
}
```

### AI 决策 Prompt

```markdown
你是 Silent Feed 推荐系统的策略决策引擎。

## 你的任务

根据当前系统状态，给出一个参数化的推荐策略，以达到以下目标：

1. **平衡供需**：让推荐池保持在合理容量，避免过载或不足
2. **优化成本**：在 AI 成本预算内，最大化推荐质量
3. **提升体验**：让用户始终有高质量内容可读，不堆积不枯竭

## 当前状态

### 供给侧
- 订阅源: {{totalFeeds}} 个（活跃 {{activeFeeds}} 个）
- 平均更新频率: 每 {{avgUpdateFrequency}} 小时
- 每日新文章: {{dailyNewArticles}} 篇
- 原始文章池: {{rawPoolSize}} 篇（未分析）
- 候选池: {{candidatePoolSize}} 篇（高分待推荐）
- 冷冻池: {{frozenPoolSize}} 篇（低分已冷冻）

### 需求侧
- 用户阅读速度: 每天 {{avgReadSpeed}} 篇
- 拒绝率: {{dismissRate}}%
- 喜欢率: {{likeRate}}%
- 推荐池: {{recommendationPoolSize}}/{{recommendationPoolCapacity}} 篇

### 系统状态
- 今日 AI 成本: ${{aiCostToday}} / ${{aiTokensBudget}} (预算)
- 今日已分析: {{analyzedArticlesToday}} 篇
- 今日已推荐: {{recommendedArticlesToday}} 篇

### 历史趋势
- 过去 7 天阅读: {{last7DaysReadCount}} 篇
- 过去 7 天推荐: {{last7DaysRecommendedCount}} 篇
- 过去 7 天分析: {{last7DaysAnalyzedCount}} 篇

## 决策维度

### 1. 分析策略
- **频率**: 多久分析一次原始文章？（考虑：原始池大小、AI 预算、候选池库存）
- **批次**: 每次分析几篇？（考虑：效率、超时风险、成本）
- **门槛**: score 多少以上才推荐？（考虑：候选池质量、用户反馈）

### 2. 推荐策略
- **目标容量**: 推荐池应该保持多少篇？（考虑：用户消费速度、质量保证）
- **补充阈值**: 降到多少时触发补充？（考虑：避免空池、避免频繁补充）
- **冷却时间**: 两次补充间隔多久？（考虑：用户消费速度、避免堆积）

### 3. 调度策略
- **分析间隔**: 分析任务多久触发一次？（考虑：原始池增长速度、AI 成本）
- **推荐间隔**: 推荐任务多久触发一次？（考虑：候选池库存、用户消费速度）
- **循环次数**: 每次任务执行几轮？（考虑：效率、超时风险）

### 4. 池子管理
- **候选池容量**: 保持多少高分文章？（考虑：保证供应、避免过期）
- **冷冻池容量**: 保留多少低分文章？（考虑：避免重复分析、存储成本）

## 输出格式

请以 JSON 格式输出策略，包含所有参数和决策理由：

```json
{
  "analysis": {
    "frequency": "medium",
    "batchSize": 10,
    "scoreThreshold": 7.0,
    "prioritySource": []
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
    "maxSize": 50,
    "expiryHours": 48,
    "reEvaluate": false
  },
  "frozenPool": {
    "maxSize": 1000,
    "ttlDays": 7,
    "reAnalyze": false
  },
  "meta": {
    "reason": "当前原始池有 50 篇未分析文章，但推荐池充足（4/6），用户消费速度中等（2篇/天），因此采用中等分析频率，每 5 分钟分析 10 篇，门槛保持 7.0 以确保质量。推荐池目标 6 篇，降到 2 篇时补充，冷却 60 分钟避免过度推荐。",
    "confidence": 0.85,
    "validUntil": {{timestamp + 24h}},
    "nextReview": {{timestamp + 12h}}
  }
}
```

## 决策原则

1. **供需平衡**: 如果原始池增长快、用户消费慢 → 降低分析频率、提高门槛
2. **成本优化**: 如果接近预算 → 降低分析频率、减少批次
3. **质量优先**: 宁可推荐少，不可推荐差
4. **动态调整**: 策略应该随着数据变化而变化，每 12-24 小时审查一次
```

---

## 实施方案

### Phase 1: 数据模型扩展

**目标**：支持多池架构

#### 1.1 扩展 FeedArticle 表

```typescript
// src/types/feed.ts
export interface FeedArticle {
  // ... 现有字段
  
  // 新增字段
  poolStatus: 'raw' | 'candidate' | 'frozen' | 'recommended',  // 池子状态
  frozenAt?: number,                                            // 冷冻时间
  frozenReason?: string,                                        // 冷冻原因
  isRecommended?: boolean,                                      // 是否已被推荐
}
```

#### 1.2 创建 StrategyDecision 表

```typescript
// src/types/strategy.ts
export interface StrategyDecision {
  id: string,
  createdAt: number,
  validUntil: number,
  nextReview: number,
  
  // 决策上下文（快照）
  context: StrategyDecisionContext,
  
  // AI 输出的策略
  strategy: RecommendationStrategy,
  
  // 执行结果（用于学习）
  execution?: {
    appliedAt: number,
    analyzedCount: number,
    recommendedCount: number,
    effectiveness: number,  // 0-1，基于用户反馈
  }
}
```

---

### Phase 2: 策略决策服务

**目标**：AI 驱动的策略决策

#### 2.1 StrategyDecisionService

```typescript
// src/core/strategy/StrategyDecisionService.ts
export class StrategyDecisionService {
  /**
   * 请求新策略（每 12-24 小时调用一次）
   */
  async requestNewStrategy(): Promise<RecommendationStrategy> {
    // 1. 收集决策上下文
    const context = await this.collectContext()
    
    // 2. 调用 AI 决策
    const strategy = await this.callAIDecision(context)
    
    // 3. 验证策略合理性
    const validated = this.validateStrategy(strategy)
    
    // 4. 保存决策记录
    await this.saveDecision(context, validated)
    
    // 5. 返回策略
    return validated
  }
  
  /**
   * 获取当前有效策略
   */
  async getCurrentStrategy(): Promise<RecommendationStrategy | null> {
    const decision = await db.strategyDecisions
      .orderBy('createdAt')
      .reverse()
      .first()
    
    if (!decision) return null
    if (Date.now() > decision.validUntil) return null
    
    return decision.strategy
  }
  
  /**
   * 收集决策上下文
   */
  private async collectContext(): Promise<StrategyDecisionContext> {
    // 从 SystemStats、DB 等收集数据
    // ...
  }
  
  /**
   * 调用 AI 决策
   */
  private async callAIDecision(
    context: StrategyDecisionContext
  ): Promise<RecommendationStrategy> {
    const capability = AICapabilityManager.getInstance()
    
    const prompt = this.buildDecisionPrompt(context)
    
    const response = await capability.callAI('strategyDecision', {
      prompt,
      temperature: 0.3,  // 较低温度，保证稳定性
    })
    
    return JSON.parse(response)
  }
}
```

---

### Phase 3: 调度器重构

**目标**：根据策略动态调整调度行为

#### 3.1 AnalysisScheduler（分析调度器）

```typescript
// src/background/analysis-scheduler.ts
export class AnalysisScheduler {
  private strategy: RecommendationStrategy | null = null
  
  async start() {
    // 1. 获取当前策略
    this.strategy = await strategyService.getCurrentStrategy()
    
    if (!this.strategy) {
      // 2. 请求新策略
      this.strategy = await strategyService.requestNewStrategy()
    }
    
    // 3. 根据策略设置 Alarm
    const interval = this.strategy.scheduling.analysisIntervalMinutes
    await chrome.alarms.create('analysis', { periodInMinutes: interval })
  }
  
  async handleAlarm() {
    const strategy = await this.ensureValidStrategy()
    
    // 根据策略循环执行
    const iterations = strategy.scheduling.loopIterations
    const batchSize = strategy.analysis.batchSize
    
    for (let i = 0; i < iterations; i++) {
      // 从 Pool 1 获取文章
      const articles = await this.getRawArticles(batchSize)
      if (articles.length === 0) break
      
      // 分析文章
      const results = await this.analyzeArticles(articles, strategy)
      
      // 根据 score 分流到 Pool 2 或 Pool 3
      await this.distributeArticles(results, strategy.analysis.scoreThreshold)
      
      // 检查是否继续
      if (await this.shouldStopAnalysis(strategy)) break
      
      // 间隔
      await sleep(5000)
    }
  }
  
  private async distributeArticles(
    results: AnalysisResult[],
    threshold: number
  ) {
    for (const result of results) {
      if (result.score >= threshold) {
        // → Pool 2: 候选池
        await db.feedArticles.update(result.articleId, {
          poolStatus: 'candidate',
          analysis: result.analysis,
        })
      } else {
        // → Pool 3: 冷冻池
        await db.feedArticles.update(result.articleId, {
          poolStatus: 'frozen',
          analysis: result.analysis,
          frozenAt: Date.now(),
          frozenReason: `score ${result.score} < threshold ${threshold}`,
        })
      }
    }
  }
}
```

#### 3.2 RecommendationScheduler（推荐调度器）

```typescript
// src/background/recommendation-scheduler.ts
export class RecommendationScheduler {
  private strategy: RecommendationStrategy | null = null
  
  async start() {
    this.strategy = await this.ensureValidStrategy()
    
    const interval = this.strategy.scheduling.recommendIntervalMinutes
    await chrome.alarms.create('recommendation', { periodInMinutes: interval })
  }
  
  async handleAlarm() {
    const strategy = await this.ensureValidStrategy()
    
    // 1. 检查推荐池容量
    const currentSize = await this.getRecommendationPoolSize()
    const targetSize = strategy.recommendation.targetPoolSize
    const threshold = strategy.recommendation.refillThreshold
    
    if (currentSize >= threshold) {
      // 推荐池充足，跳过
      return
    }
    
    // 2. 检查冷却时间
    const lastRefill = await this.getLastRefillTime()
    const cooldown = strategy.recommendation.cooldownMinutes * 60 * 1000
    if (Date.now() - lastRefill < cooldown) {
      // 冷却中，跳过
      return
    }
    
    // 3. 从 Pool 2 选择文章
    const needed = targetSize - currentSize
    const candidates = await this.getCandidates(needed)
    
    // 4. 创建推荐
    for (const article of candidates) {
      await this.createRecommendation(article)
      
      // 标记文章状态
      await db.feedArticles.update(article.id, {
        poolStatus: 'recommended',
        isRecommended: true,
      })
    }
    
    // 5. 记录补充时间
    await this.recordRefill()
  }
  
  private async getCandidates(count: number): Promise<FeedArticle[]> {
    return await db.feedArticles
      .where('poolStatus').equals('candidate')
      .sortBy('analysis.score')
      .then(articles => articles.reverse().slice(0, count))
  }
}
```

---

### Phase 4: 策略审查机制

**目标**：定期审查策略有效性，触发重新决策

#### 4.1 StrategyReviewScheduler

```typescript
// src/background/strategy-review-scheduler.ts
export class StrategyReviewScheduler {
  async start() {
    // 每 12 小时检查一次
    await chrome.alarms.create('strategy-review', { periodInMinutes: 12 * 60 })
  }
  
  async handleAlarm() {
    const strategy = await strategyService.getCurrentStrategy()
    
    if (!strategy) {
      // 无策略，立即请求
      await strategyService.requestNewStrategy()
      return
    }
    
    // 检查是否到达审查时间
    if (Date.now() >= strategy.meta.nextReview) {
      await strategyService.requestNewStrategy()
    }
  }
}
```

---

## 总结

### 架构优势

1. **动态适应**：根据实时供需情况自动调整策略
2. **AI 驱动**：让 AI 处理复杂决策，人类只需定义目标
3. **透明可追溯**：文章在各池子间流转清晰，策略决策有记录
4. **成本可控**：AI 在预算内优化推荐质量
5. **用户为中心**：以用户消费速度为锚点反向调整

### 实施路径

**Phase 1** (数据模型): 2-3 天
**Phase 2** (策略决策): 3-4 天
**Phase 3** (调度器重构): 4-5 天
**Phase 4** (策略审查): 1-2 天

**总计**: 约 2 周

### 后续优化

- Pool 2 候选池的优先级排序（不只是 score，还有时效性、多样性）
- Pool 3 冷冻池的重新评估机制（用户兴趣变化后重新分析）
- 策略的 A/B 测试（对比不同策略的效果）
- 用户反馈的闭环学习（将 dismissed/liked 反馈给 AI）
