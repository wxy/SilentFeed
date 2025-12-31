# 推荐池容量智能化方案分析

## 📊 当前实现分析

### 1. 推荐池容量机制

**当前实现**：([RecommendationService.ts#L43](../../src/core/recommender/RecommendationService.ts#L43))

```typescript
const POOL_SIZE_MULTIPLIER = 2  // 硬编码倍数

const baseSize = config.maxRecommendations || 3  // 弹窗容量（3-5）
const maxSize = baseSize * POOL_SIZE_MULTIPLIER  // 推荐池容量（6-10）
```

**问题**：
- ❌ **硬编码的 2 倍关系**，缺乏灵活性
- ❌ **不考虑订阅源数量**（1个源 vs 50个源都是同样的池容量）
- ❌ **不考虑文章数量**（每天10篇 vs 每天1000篇）
- ❌ **不考虑用户处理速度**（快速处理 vs 缓慢处理）

### 2. 推荐池填充逻辑

**当前流程**：([RecommendationService.ts#L590-650](../../src/core/recommender/RecommendationService.ts#L590-650))

```typescript
// 规则 1: 池未满 → 直接加入
if (poolSize < maxSize) {
  // 加入推荐
}

// 规则 2: 池已满 → 高分替换低分
else if (article.score > lowestInPool.score) {
  // 替换最低分推荐
  await db.recommendations.update(lowestInPool.id, {
    status: 'replaced'
  })
}
```

**核心问题**：

#### 问题 A：持续填充循环

```
场景：用户处理推荐（阅读/不想读）
  ↓
推荐池有空位（poolSize < maxSize）
  ↓
触发补充逻辑
  ↓
分析新文章，填满推荐池
  ↓
用户再次处理
  ↓
循环...直到所有文章都分析完
```

**后果**：
- 🔴 **AI 成本失控**：不断分析文章直到全部分析完
- 🔴 **用户负担加重**：推荐永远不会"空"，总有新内容
- 🔴 **推荐质量下降**：后期分析的文章可能质量不高

#### 问题 B：容量与数据量脱节

**场景对比**：

| 用户类型 | 订阅源数 | 每日文章 | 推荐池容量 | 问题 |
|---------|---------|---------|-----------|------|
| 轻度用户 | 3 个源 | 10 篇/天 | 6 条 | ⚠️ 推荐池占 60%，过度推荐 |
| 中度用户 | 15 个源 | 100 篇/天 | 6 条 | ✓ 合理 |
| 重度用户 | 50 个源 | 500 篇/天 | 6 条 | ⚠️ 推荐池仅占 1.2%，可能错过好内容 |

**当前问题**：
- 轻度用户：推荐池相对过大，可能导致推荐不够精准
- 重度用户：推荐池相对过小，可能漏掉高质量内容
- 高频更新源：无法应对快速内容流，推荐不够及时
- 大批量更新源：突发文章潮时池容量不足，遗漏优质内容

---

## 🎯 智能化方案设计

### 方案 A：基于订阅源和文章量的动态容量

#### 核心理念

推荐池容量应该根据**数据源规模**动态调整：

```typescript
interface PoolSizeFactors {
  feedCount: number           // 订阅源数量
  dailyArticles: number       // 每日平均文章数
  avgUpdateFrequency: number  // 平均更新频率（小时/次）
  avgBatchSize: number        // 平均每次更新文章数
  userProcessSpeed: number    // 用户处理速度（条/天）
}

function calculatePoolSize(factors: PoolSizeFactors, baseSize: number): number {
  // 基础容量：弹窗大小 × 2
  const baseCapacity = baseSize * 2
  
  // 根据订阅源数量调整
  let multiplier = 1.0
  if (factors.feedCount <= 5) {
    multiplier = 0.8  // 订阅源少：减小池容量（避免过度推荐）
  } else if (factors.feedCount >= 20) {
    multiplier = 1.5  // 订阅源多：增大池容量（避免错过好内容）
  }
  
  // 根据文章量调整
  if (factors.dailyArticles > 200) {
    multiplier *= 1.2  // 文章多：适当增大
  } else if (factors.dailyArticles < 20) {
    multiplier *= 0.8  // 文章少：适当减小
  }
  
  // 🆕 根据更新频率调整
  if (factors.avgUpdateFrequency < 2) {
    // 高频更新（<2小时更新一次）：增大池容量，保持内容新鲜度
    multiplier *= 1.3
  } else if (factors.avgUpdateFrequency > 24) {
    // 低频更新（>24小时更新一次）：减小池容量，避免推荐过时
    multiplier *= 0.7
  }
  
  // 🆕 根据批量大小调整更新频率 | 批量大小 | 弹窗 | 计算过程 | 最终池容量 |
|-----|--------|---------|---------|---------|------|---------|-----------|
| 轻度用户 | 3 | 15 | 12h | 5篇 | 3 | 3×2×0.8×0.8×1.0×0.9 = 3.46 | **4 条** |
| 中度用户 | 15 | 80 | 6h | 8篇 | 3 | 3×2×1.0×1.0×1.0×1.0 = 6 | **6 条** |
| 重度用户 | 50 | 400 | 24h | 20篇 | 5 | 5×2×1.5×1.2×0.7×1.0 = 12.6 | **13 条** |
| 新闻爱好者 | 10 | 300 | 1h | 15篇 | 4 | 4×2×1.0×1.2×1.3×1.0 = 12.48 | **12 条** |
| 高频大批量 | 20 | 500 | 2h | 80篇 | 5 | 5×2×1.5×1.2×1.0×1.2 = 21.6 | **15 条** (上限) |

**调整系数说明**：
- **更新频率系数**：
  - 高频（<2h）：× 1.3（需要更大池容量应对快速内容流）
  - 中频（2-24h）：× 1.0（保持基准）
  - 低频（>24h）：× 0.7（减少池容量，避免推荐过时内容）

- **批量大小系数**：
  - 大批量（>50篇）：× 1.2（应对突发文章潮）
  - 中批量（5-50篇）：× 1.0（保持基准）
  - 小批量（<5篇）：× 0.9（减少池容量）
    // 小批量更新：保持基础容量即可
    multiplier *= 0.9
  }
  
  // 最终容量：基础容量 × 调整系数
  const finalSize = Math.round(baseCapacity * multiplier)
  
  // 限制范围：[baseSize, baseSize * 5]
  // 例如：弹窗3条 → 池容量 3-15 条
  return Math.max(baseSize, Math.min(finalSize, baseSize * 5))
}
```

**示例计算**：

| 场景 | 订阅源 | 文章/天 | 弹窗 | 计算过程 | 最终池容量 |
|-----|--------|---------|------|---------|-----------|
| 轻度 | 3 | 15 | 3 | 3×2×0.8×0.8 = 3.84 | **4 条** |
| 中度 | 15 | 80 | 3 | 3×2×1.0×1.0 = 6 | **6 条** |
| 重度 | 50 | 400 | 5 | 5×2×1.5×1.2 = 18 | **18 条** |

### 方案 B：基于用户行为的自适应容量

#### 核心理念

根据**用户实际处理速度**和**推荐质量反馈**动态调整：

```typescript
interface UserBehaviorMetrics {
  dailyClickRate: number      // 每日点击推荐的次数
  avgReadTime: number          // 平均阅读时长
  dismissRate: number          // 拒绝率
  poolEmptyFrequency: number   // 推荐池清空频率
}

function adaptivePoolSize(metrics: UserBehaviorMetrics, currentSize: number): number {
  let adjustment = 0
  
  // 如果推荐池经常被清空 → 增大容量
  if (metrics.poolEmptyFrequency > 2) {  // 每天清空超过2次
    adjustment += 2
  }
  
  // 如果拒绝率高 → 减小容量（推荐质量不好）
  if (metrics.dismissRate > 0.5) {
    adjustment -= 1
  }
  
  // 如果点击率高 → 增大容量（用户喜欢推荐）
  if (metrics.dailyClickRate > 5) {
    adjustment += 1
  }
  
  return Math.max(3, Math.min(currentSize + adjustment, 20))
}
```

### 方案 C：防止无限填充机制（推荐）

#### 问题根源

当前逻辑：`poolSize < maxSize` → 立即补充

这导致只要用户处理推荐，就会触发补充，形成无限循环。

#### 解决方案：引入"补充冷却期"

```typescript
interface PoolRefillPolicy {
  minInterval: number       // 最小补充间隔（毫秒）
  maxDailyRefills: number   // 每日最大补充次数
  triggerThreshold: number  // 触发补充的阈值（池容量百分比）
}

class RecommendationPoolManager {
  private lastRefillTime = 0
  private dailyRefillCount = 0
  
  async shouldRefill(
    currentPoolSize: number,
    maxPoolSize: number,
    policy: PoolRefillPolicy
  ): Promise<boolean> {
    const now = Date.now()
    
    // 检查 1：时间间隔
    const timeSinceLastRefill = now - this.lastRefillTime
    if (timeSinceLastRefill < policy.minInterval) {
      recLogger.debug(`⏰ 补充冷却中，已过 ${timeSinceLastRefill}ms，需要 ${policy.minInterval}ms`)
      return false
    }
    
    // 检查 2：每日次数限制
    if (this.dailyRefillCount >= policy.maxDailyRefills) {
      recLogger.debug(`🚫 今日补充次数已达上限 ${policy.maxDailyRefills}`)
      return false
    }
    
    // 检查 3：容量阈值
    const fillRate = currentPoolSize / maxPoolSize
    if (fillRate > policy.triggerThreshold) {
      recLogger.debug(`📊 池容量 ${(fillRate*100).toFixed(0)}% > ${(policy.triggerThreshold*100).toFixed(0)}%，不补充`)
      return false
    }
    
    // 所有检查通过，允许补充
    recLogger.info(`✅ 允许补充推荐池：容量 ${currentPoolSize}/${maxPoolSize}`)
    this.lastRefillTime = now
    this.dailyRefillCount++
    return true
  }
}

// 推荐的策略配置
const DEFAULT_REFILL_POLICY: PoolRefillPolicy = {
  minInterval: 30 * 60 * 1000,  // 30分钟
  maxDailyRefills: 5,            // 每天最多补充5次
  triggerThreshold: 0.3          // 池容量低于30%时才补充
}
```

**效果演示**：

```
当前状态：池容量 6 条，已有 4 条（66%）
用户处理：阅读 1 条 → 剩余 3 条（50%）

旧逻辑：poolSize(3) < maxSize(6) → 立即补充 ❌
新逻辑：fillRate(50%) > threshold(30%) → 不补充 ✅

继续处理：用户阅读 1 条 → 剩余 2 条（33%）
新逻辑：fillRate(33%) > threshold(30%) → 仍不补充 ✅

继续处理：用户阅读 1 条 → 剩余 1 条（16%）
新逻辑：fillRate(16%) < threshold(30%) → 允许补充 ✅
         + 距上次补充 > 30分钟 ✅
         + 今日补充次数 < 5 ✅
         → 触发补充
```

---

## 📈 推荐实施方案

### 阶段 1：修复无限填充问题（优先级：高）

**实施方案 C**，防止推荐池无限补充。

**代码改动**：
1. 🆕 统计订阅源的平均更新频率和批量大小
3. 实现 `calculatePoolSize()` 函数（包含更新频率和批量调整）
4. 修改 `RecommendationService.saveRecommendations()` 逻辑
3. 在补充前检查冷却期和次数限制

**预期效果**：
- ✅ 减少 AI 调用次数 60-80%
- ✅ 用户体验改善：推荐可以"消化完"
- ✅ 成本降低：不再分析所有文章

### 阶段 2：智能容量调整（优先级：中）

**实施方案 A**，根据订阅源和文章量动态调整池容量。

**代码改动**：
1. 统计订阅源数量和每日文章数
2. 实现 `calculatePoolSize()` 函数
3. 替换硬编码的 `POOL_SIZE_MULTIPLIER`

- ✅ 🆕 高频源用户：内容更及时（池容量增大以应对快速流）
- ✅ 🆕 大批量源：不遗漏优质内容（突发文章潮时扩容）
**预期效果**：
- ✅ 轻度用户：推荐更精准（池容量减小）
- ✅ 重度用户：覆盖更全面（池容量增大）

### 阶段 3：AI 智能决策器（优先级：中）🆕

**核心思路**：不写复杂规则，让 AI 每天根据实际情况决策最优策略。

**代码改动**：
1. 收集用户使用数据（订阅源、文章量、用户行为）
2. 实现 AI 决策器：每天首次使用时调用 AI
3. AI 返回推荐策略（池容量、补充间隔、次数限制）
4. 缓存决策结果，当天使用

**预期效果**：
- ✅ 自适应性强：AI 根据多维度数据综合决策
- ✅ 代码简化：不需要维护复杂规则引擎
- ✅ 持续优化：可以通过反馈改进 AI 决策质量
🤖 方案 D：AI 智能决策器（推荐）

### 核心理念

与其手写复杂规则，不如让 AI 每天根据实际情况做决策。

### 决策流程

```typescript
interface DailyUsageContext {
  // 订阅源情况
  feeds: {
    totalCount: number
    avgUpdateFrequency: number  // 小时
    avgBatchSize: number
    activeFeeds: number         // 最近7天有更新的源
  }
  
  // 文章情况
### 方案选择

**方案 C（防止无限填充）**：必须实施，优先级最高
- 立即解决 AI 成本失控问题
- 实施简单，风险低

**方案 D（AI 决策器） vs 方案 A（规则引擎）**：

| 对比维度 | 方案 D：AI 决策 | 方案 A：规则引擎 |
|---------|----------------|-----------------|
| 自适应性 | ⭐⭐⭐⭐⭐ 极强 | ⭐⭐⭐ 中等 |
| 代码复杂度 | ⭐⭐⭐⭐ 简单 | ⭐⭐ 复杂 |
| 运行成本 | ⭐⭐⭐ ~$0.007/月 | ⭐⭐⭐⭐⭐ $0 |
| 响应延迟 | ⭐⭐⭐ 1-3秒/天 | ⭐⭐⭐⭐⭐ 即时 |
| 可维护性 | ⭐⭐⭐⭐⭐ 易维护 | ⭐⭐⭐ 需调参 |
| 稳定性 | ⭐⭐⭐ 依赖AI | ⭐⭐⭐⭐⭐ 稳定 |

**推荐策略**：
1. **短期**：实施方案 C + 方案 A（规则引擎）
2. **中期**：试验方案 D（AI 决策），A/B 测试
3. **长期**：根据数据决定使用 AI 还是规则（或混合）

### 具体参数

如果采用方案 C（规则引擎），需要确定：

1. **补充冷却期时长**：建议 30 分钟
   - 过短（<15分）：仍可能频繁补充
   - 过长（>60分）：用户可能等待时间过长

2. **每日补充次数上限**：建议 5 次
   - 过少（<3次）：重度用户可能不够用
   - 过多（>8次）：轻度用户可能过度推荐

3. **容量阈值**：建议 30%
   - 过高（>50%）：补充过于频繁
   - 过低（<20%）：用户可能看到"空"状态

4. **容量动态范围**：建议 `[baseSize, baseSize * 5]`
   - 最小值 = 弹窗容量：保证基本推荐
   - 最大值 = 弹窗容量 × 5：应对高频大批量场景
  
  // 当前配置
  currentPolicy: {
    poolSize: number
    refillInterval: number      // 分钟
    maxDailyRefills: number
  }
}

interface AIDecision {
  poolSize: number              // 建议的池容量
  refillInterval: number        // 建议的补充间隔（分钟）
  maxDailyRefills: number       // 建议的每日补充次数
  triggerThreshold: number      // 建议的触发阈值
  reasoning: string             // AI 的决策理由
  confidence: number            // 决策置信度 0-1
}

class AIPoolStrategyDecider {
  private cachedDecision: AIDecision | null = null
  private lastDecisionDate: string = ''
  
  async decideDailyStrategy(context: DailyUsageContext): Promise<AIDecision> {
    const today = new Date().toISOString().split('T')[0]
    
    // 检查是否已有今日决策
    if (this.cachedDecision && this.lastDecisionDate === today) {
      recLogger.debug('使用今日缓存的 AI 决策')
      return this.cachedDecision
    }
    
    // 调用 AI 进行决策
    recLogger.info('🤖 调用 AI 决策今日推荐池策略')
    const decision = await this.callAIDecider(context)
    
    // 缓存决策结果
    this.cachedDecision = decision
    this.lastDecisionDate = today
    
    // 保存到存储
    await chrome.storage.local.set({
      'pool_strategy_decision': {
        date: today,
        decision,
        context
      }
    })
    
    recLogger.info('✅ AI 决策完成', {
      poolSize: decision.poolSize,
      refillInterval: decision.refillInterval,
      maxDailyRefills: decision.maxDailyRefills,
      reasoning: decision.reasoning
    })
    
    return decision
  }
  
  private async callAIDecider(context: DailyUsageContext): Promise<AIDecision> {
    const prompt = `你是一个推荐系统优化专家。基于以下用户的 RSS 阅读情况，决策今天的推荐池策略。

# 用户情况

## 订阅源
- 总数：${context.feeds.totalCount} 个
- 活跃源：${context.feeds.activeFeeds} 个（最近7天有更新）
- 平均更新频率：每 ${context.feeds.avgUpdateFrequency.toFixed(1)} 小时
- 平均批量大小：每次 ${context.feeds.avgBatchSize.toFixed(0)} 篇

## 文章量
- 未读文章：${context.articles.unreadCount} 篇
- 最近7天日均：${context.articles.dailyAverage.toFixed(0)} 篇
- 昨天新增：${context.articles.yesterdayCount} 篇

## 用户行为（昨天）
- 查看推荐：${context.userBehavior.recommendationsShown} 次
- 点击阅读：${context.userBehavior.clicked} 次
- 不想读：${context.userBehavior.dismissed} 次
- 稍后阅读：${context.userBehavior.saved} 次
- 平均阅读时长：${Math.round(context.userBehavior.avgReadTime)} 秒
- 活跃时段：${context.userBehavior.peakUsageHour}:00

## 当前策略
- 推荐池容量：${context.currentPolicy.poolSize} 条
- 补充间隔：${context.currentPolicy.refillInterval} 分钟
- 每日补充次数上限：${context.currentPolicy.maxDailyRefills} 次

# 决策要求

请综合考虑以上信息，为今天制定最优的推荐池策略。需要决策：

1. **poolSize**（推荐池容量）：3-20 条
   - 考虑因素：文章量、订阅源数、用户处理速度
   
2. **refillInterval**（补充间隔）：15-120 分钟
   - 考虑因素：更新频率、用户活跃时段
   
3. **maxDailyRefills**（每日补充次数）：3-10 次
   - 考虑因素：文章量、用户处理速度
   
4. **triggerThreshold**（触发阈值）：0.2-0.5
   - 池容量低于此百分比时触发补充

# 决策原则

- 轻度用户（<30篇/天）：保守策略，避免推荐过多
- 中度用户（30-200篇/天）：平衡策略
- 重度用户（>200篇/天）：积极策略，确保覆盖优质内容
- 高点击率（>30%）：用户喜欢推荐，可适当增加
- 高拒绝率（>50%）：推荐质量不佳，应减少
- 高频更新源：增加补充频率，保持内容新鲜
- 低频更新源：减少补充频率，避免重复推荐

请以 JSON 格式返回决策结果：

\`\`\`json
{
  "poolSize": 8,
  "refillInterval": 45,
  "maxDailyRefills": 6,
  "triggerThreshold": 0.3,
  "reasoning": "用户是中度用户，昨天新增100篇文章，点击率35%表明推荐质量良好。建议池容量8条，每45分钟检查一次，保持内容新鲜度。",
  "confidence": 0.85
}
\`\`\`
`
    
    try {
      const aiService = await aiCapabilityManager.getService()
      const response = await aiService.analyzeContent({
        content: prompt,
        context: {
          type: 'strategy_decision',
          metadata: context
        }
      })
      
      // 解析 AI 响应
      const decision = this.parseAIResponse(response.analysis)
      
      // 验证决策合理性
      return this.validateDecision(decision)
      
    } catch (error) {
      recLogger.error('AI 决策失败，使用降级策略', error)
      return this.getFallbackDecision(context)
    }
  }
  
  private parseAIResponse(response: string): AIDecision {
    // 提取 JSON（可能在 markdown 代码块中）
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                      response.match(/\{[\s\S]*\}/)
    
    if (!jsonMatch) {
      throw new Error('无法解析 AI 响应')
    }
    
    return JSON.parse(jsonMatch[1] || jsonMatch[0])
  }
  
  private validateDecision(decision: AIDecision): AIDecision {
    // 验证并修正边界值
    return {
      poolSize: Math.max(3, Math.min(20, decision.poolSize)),
      refillInterval: Math.max(15, Math.min(120, decision.refillInterval)),
      maxDailyRefills: Math.max(3, Math.min(10, decision.maxDailyRefills)),
      triggerThreshold: Math.max(0.2, Math.min(0.5, decision.triggerThreshold)),
      reasoning: decision.reasoning,
      confidence: decision.confidence
    }
  }
  
  private getFallbackDecision(context: DailyUsageContext): AIDecision {
    // 降级策略：基于简单规则
    const dailyArticles = context.articles.dailyAverage
    
    let poolSize = 6
    let refillInterval = 45
    let maxDailyRefills = 5
    
    if (dailyArticles < 30) {
      poolSize = 4
      refillInterval = 60
      maxDailyRefills = 3
    } else if (dailyArticles > 200) {
      poolSize = 12
      refillInterval = 30
      maxDailyRefills = 8
    }
    
    return {
      poolSize,
      refillInterval,
      maxDailyRefills,
      triggerThreshold: 0.3,
      reasoning: 'AI 服务不可用，使用基于规则的降级策略',
      confidence: 0.6
    }
  }
}
```

### 调用时机

```typescript
// ========== 选项 1：用户首次打开扩展时（推荐）==========
// 在 popup.tsx 或 background.ts 中
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POPUP_OPENED') {
    (async () => {
      const decider = getStrategyDecider()
      
      // 检查是否已有今日决策
      const cached = await decider.getCachedDecision()
      if (!cached) {
        // 收集上下文数据
        const context = await collectDailyUsageContext()
        
        // AI 决策
        const decision = await decider.decideDailyStrategy(context)
        
        // 应用决策到补充管理器
        const refillManager = getRefillManager()
        refillManager.updatePolicy({
          minInterval: decision.minInterval,
          maxDailyRefills: decision.maxDailyRefills,
          triggerThreshold: decision.triggerThreshold
        })
        
        // 注意：poolSize 需要传递给 RecommendationService
        // 可以保存到 chrome.storage.local 供 generateRecommendations 使用
      }
      
      sendResponse({ success: true })
    })()
    return true // 异步响应
  }
})

// ========== 选项 2：定时触发（每天早上） ==========
// 使用 chrome.alarms API
chrome.alarms.create('daily-strategy-decision', {
  when: Date.now() + 1000,  // 首次立即触发
  periodInMinutes: 24 * 60  // 每天执行
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-strategy-decision') {
    const decider = getStrategyDecider()
    const context = await collectDailyUsageContext()
    const decision = await decider.decideDailyStrategy(context)
    
    // 应用决策...
  }
})
```

### 优势分析

#### ✅ 优点

1. **自适应性强**：AI 可以综合考虑多维度因素，做出更智能的决策
2. **代码简化**：不需要维护复杂的规则引擎和系数调整逻辑
3. **持续优化**：可以通过用户反馈改进 AI 决策质量
4. **灵活性高**：可以轻松添加新的考虑因素（只需修改 prompt）
5. **可解释性**：AI 提供决策理由，方便调试和理解

#### ⚠️ 挑战

1. **成本**：每天调用一次 AI（但频率低，成本可控）
2. **延迟**：首次使用时需要等待 AI 响应（1-3秒）
3. **依赖性**：需要 AI 服务可用（但有降级策略）
4. **稳定性**：AI 决策可能不够稳定（通过缓存和验证减轻）

### 成本估算

```
每天 1 次 AI 调用
Prompt: ~800 tokens
Response: ~200 tokens
总计: ~1000 tokens/天

月成本（以 GPT-4o-mini 为例）:
- Input: 800 × 30 = 24,000 tokens × $0.15/1M = $0.0036
- Output: 200 × 30 = 6,000 tokens × $0.60/1M = $0.0036
- 总计: ~$0.007/月（不到 1 分钱）
```

### 混合方案（推荐）

结合规则引擎和 AI 决策：

```typescript
// 1. 基础规则快速决策（无成本，延迟低）
const baseDecision = ruleBasedDecision(context)

// 2. AI 优化决策（每天1次，缓存结果）
const aiDecision = await aiDecider.decideDailyStrategy(context)

// 3. 融合决策（AI 置信度高时使用 AI，否则使用规则）
const finalDecision = aiDecision.confidence > 0.7 
  ? aiDecision 
  : baseDecision
```

---

## 
---

## 🔍 关键指标监控

实施后需要监控的指标：

| 指标 | 当前 | 目标 | 监控方法 |
|-----|------|------|----------|
| 每日 AI 调用次数 | 100-200 次 | 30-50 次 | AIUsageTracker |
| 推荐池平均容量 | 固定 6-10 | 动态 4-18 | 统计 poolSize |
| 推荐补充次数/天 | 无限制 | ≤5 次 | 统计 refill 事件 |
| 推荐质量得分 | 0.6-0.8 | 0.7-0.9 | 统计 avg(score) |
### 立即行动（阶段 1）
- [ ] 确认采用方案 C（防止无限填充）
- [ ] 确定具体参数（冷却期、次数上限、阈值）
- [ ] 实施代码修改
- [ ] 添加监控指标和日志
- [ ] 测试验证效果

### 中期规划（阶段 2）
**二选一**：
- [ ] 选项 A：实施规则引擎（方案 A）
- [ ] 选项 B：实施 AI 决策器（方案 D）
- [ ] 或者：实施混合方案（规则基础 + AI 优化）

### 长期优化（阶段 3）
- [ ] 收集用户反馈和使用数据
- [ ] 对比不同方案效果
- [ ] 持续优化决策逻辑

1. **补充冷却期时长**：30分钟是否合适？
   - 过短：仍可能频繁补充
   - 过长：用户可能等待时间过长

2. **每日补充次数上限**：5次是否合适？
   - 过少：重度用户可能不够用
   - 过多：轻度用户可能过度推荐

3. **容量阈值**：30% 是否合适？
   - 过高：补充过于频繁
   - 过低：用户可能看到"空"状态

4. **容量动态范围**：`[baseSize, baseSize * 4]` 是否合理？
   - 最小值 = 弹窗容量：保证基本推荐
   - 最大值 = 弹窗容量 × 4：避免池容量过大

---

## 📝 下一步行动

- [ ] 讨论并确定最终方案参数
- [ ] 实施阶段 1：防止无限填充
- [ ] 添加监控指标和日志
- [ ] 测试验证效果
- [ ] （可选）实施阶段 2 和 3
