# Phase 12.4: Provider 级别预算控制（最终版）

## 概述

为每个 AI Provider 设置独立的月度预算限制，避免某个 provider 过度消耗成本。

**设计方案**：多货币独立预算
- 每个 provider 使用各自的原生货币设置预算
- OpenAI: 美元 (USD)
- DeepSeek: 人民币 (CNY)
- 不需要货币转换，简单直接可靠

**为什么选择这个方案**：
1. **简单**：不需要维护汇率、不需要货币转换逻辑
2. **可靠**：避免汇率波动带来的误差
3. **符合直觉**：用户本来就是分别为每个 provider 充值和管理预算
4. **易于维护**：代码更简洁，测试更容易

## 1. 配置结构

### AIConfig 接口

```typescript
export interface AIConfig {
  providers: {
    openai?: RemoteProviderConfig
    deepseek?: RemoteProviderConfig
  }
  
  /**
   * Phase 12.4: 每个 provider 的独立月度预算
   * ⚠️ 使用各 provider 的原生货币单位：
   * - openai: 美元（USD）
   * - deepseek: 人民币（CNY）
   * 
   * 可选配置，未设置则不限制该 provider 预算
   * 
   * 示例：
   * {
   *   openai: 10,    // OpenAI 月度预算 $10 USD
   *   deepseek: 50   // DeepSeek 月度预算 ¥50 CNY
   * }
   */
  providerBudgets?: {
    openai?: number
    deepseek?: number
  }
  
  // ... 其他配置
}
```

### 默认配置

```typescript
const DEFAULT_CONFIG: AIConfig = {
  providers: {},
  providerBudgets: {}, // 默认不限制（未配置 = 不限制）
  local: { /* ... */ },
  engineAssignment: getDefaultEngineAssignment(),
  preferredRemoteProvider: "deepseek",
  preferredLocalProvider: "ollama"
}
```

## 2. 预算检查工具

### 核心类型

```typescript
// Provider 货币映射
const PROVIDER_CURRENCY: Record<AIProviderType, 'USD' | 'CNY'> = {
  openai: 'USD',
  deepseek: 'CNY'
}

// 预算状态（使用 provider 原生货币）
interface BudgetStatus {
  limit: number       // 预算限制
  used: number        // 已使用金额
  remaining: number   // 剩余金额
  usageRate: number   // 使用率（0-1）
  isExceeded: boolean // 是否超限
  currency: 'USD' | 'CNY' // 货币单位
}

// 预算检查结果
interface BudgetCheckResult {
  allowed: boolean
  reason?: 'budget-exceeded' | 'no-budget-configured'
  budget: BudgetStatus
}
```

### 预算检查流程

1. **获取配置**
   - Provider 预算限制（原生货币）
   - 如果未配置预算 → 返回 allowed: true

2. **查询使用情况**
   - 查询本月该 provider 的使用金额（原生货币）

3. **判断是否超限**
   - `(已用 + 预估成本) >= 预算限制` → 拒绝调用
   - 否则 → 允许调用

4. **返回详细状态**
   - 预算限制、已使用、剩余、使用率、是否超限、货币单位

## 3. API 使用示例

### 配置预算

```typescript
// 设置 OpenAI 预算为 $10/月
await saveAIConfig({
  ...config,
  providerBudgets: {
    openai: 10,     // $10 USD
    deepseek: 50    // ¥50 CNY
  }
})
```

### 检查预算

```typescript
// 调用前检查预算
const result = await canMakeAICall('openai', 0.5) // 预估成本 $0.5

if (!result.allowed) {
  console.log(`预算不足: ${result.reason}`)
  console.log(`预算状态: $${result.budget.used}/$${result.budget.limit} USD`)
  // 降级到关键词分析
}
```

### 获取预算状态

```typescript
// 获取当前预算状态（不考虑预估成本）
const status = await getProviderBudgetStatus('openai')
console.log(`OpenAI 预算使用率: ${(status.budget.usageRate * 100).toFixed(1)}%`)

// 获取所有 provider 的预算状态
const allStatus = await getAllProvidersBudgetStatus()
```

### 降级判断

```typescript
// 当预算 >= 80% 时建议降级到关键词分析
const shouldDowngrade = await shouldDowngradeToKeyword('openai')
if (shouldDowngrade) {
  // 使用关键词分析代替 AI
}
```

## 4. 集成到 AICapabilityManager

```typescript
class AICapabilityManager {
  async executeAnalysis(provider: AIProviderType, task: string, input: string) {
    // 1. 预估成本
    const estimatedCost = this.estimateCost(provider, input)
    
    // 2. 检查预算
    const budgetCheck = await canMakeAICall(provider, estimatedCost)
    if (!budgetCheck.allowed) {
      logger.warn(`预算不足，降级到关键词分析`, {
        provider,
        reason: budgetCheck.reason,
        budget: budgetCheck.budget
      })
      // 降级到关键词分析
      return await this.keywordAnalysis(input)
    }
    
    // 3. 执行 AI 调用
    const result = await this.callAI(provider, input)
    
    // 4. 记录使用情况
    await AIUsageTracker.track({
      provider,
      cost: actualCost,
      // ...
    })
    
    return result
  }
}
```

## 5. UI 组件设计（待实现）

### 预算配置卡片

```typescript
<BudgetConfigCard>
  <ProviderBudgetInput 
    provider="openai"
    currency="USD"
    value={config.providerBudgets?.openai || 0}
    onChange={(value) => updateProviderBudget('openai', value)}
  />
  
  <ProviderBudgetInput 
    provider="deepseek"
    currency="CNY"
    value={config.providerBudgets?.deepseek || 0}
    onChange={(value) => updateProviderBudget('deepseek', value)}
  />
</BudgetConfigCard>
```

### 预算使用情况显示

```typescript
<BudgetStatusDisplay provider="openai">
  <ProgressBar 
    value={status.budget.usageRate}
    label={`$${status.budget.used.toFixed(2)} / $${status.budget.limit}`}
    color={status.budget.usageRate >= 0.8 ? 'warning' : 'success'}
  />
</BudgetStatusDisplay>
```

## 6. 测试覆盖

### 单元测试

- ✅ 预算充足时允许调用
- ✅ 预算超限时拒绝调用
- ✅ 未配置预算时允许调用
- ✅ 正确计算使用率
- ✅ 错误时保守处理（允许调用）
- ✅ 支持 DeepSeek CNY 预算
- ✅ 多 provider 预算状态查询
- ✅ 降级判断（>= 80%）

### 集成测试（待实现）

- [ ] AICapabilityManager 集成
- [ ] 跨月重置测试
- [ ] 并发调用测试
- [ ] UI 组件测试

## 7. 优势与限制

### 优势

1. **简单可靠**：不依赖外部汇率 API，无转换误差
2. **性能优秀**：减少计算开销
3. **易于理解**：用户清楚每个 provider 的预算
4. **易于维护**：代码简洁，测试容易

### 限制

1. **无总体预算视图**：用户需要分别查看各 provider 的使用情况
2. **无跨货币比较**：无法直观比较 $10 USD 和 ¥50 CNY

### 未来改进

如果需要总体预算视图，可以在 UI 层提供：
- 使用固定汇率（如 1 USD = 7.2 CNY）仅用于显示
- 明确标注"仅供参考"
- 实际预算控制仍然使用各自货币

## 8. 实施状态

- ✅ 配置结构设计
- ✅ 预算检查逻辑
- ✅ 测试用例（34/34 通过）
- ✅ 文档更新
- ⏳ UI 组件开发
- ⏳ AICapabilityManager 集成
- ⏳ 用户测试

## 9. 下一步

1. 开发 UI 组件（PreferredProvider.tsx）
2. 集成到 AICapabilityManager
3. 浏览器测试
4. 用户反馈收集
