# AI 任务分类架构建议

## 背景

当前 Silent Feed 的 AI 架构将任务分为以下几类：
- `pageAnalysis`：页面浏览学习（高频）
- `articleAnalysis`：文章内容分析（高频）
- `profileGeneration`：用户画像生成（低频）
- `sourceAnalysis`：订阅源质量分析（低频，可选）

随着功能扩展，出现了新的低频 AI 任务：
- 推荐池策略决策（每天1次）
- 未来可能的其他优化任务

## 问题

当前架构中，每个任务都需要单独配置 AI 引擎，这导致：
1. 配置复杂度增加
2. 用户需要为每个新任务单独配置
3. 低频任务的配置会越来越多

## 建议方案

### 方案 A：统一低频任务配置（推荐）

将所有低频任务统一使用一个配置：

```typescript
export interface AIEngineAssignment {
  /** 高频任务：页面浏览学习 */
  pageAnalysis: AIEngineConfig
  
  /** 高频任务：文章内容分析（推荐文章打分） */
  articleAnalysis: AIEngineConfig
  
  /** 低频任务：包括画像生成、订阅源分析、策略决策等 */
  lowFrequencyTasks: AIEngineConfig
}
```

**优点**：
- ✅ 配置简化，用户只需关心高频/低频两大类
- ✅ 新增低频任务无需修改配置结构
- ✅ 符合成本控制逻辑（低频任务可以用更强大的模型）

**缺点**：
- ⚠️ 灵活性降低，无法单独控制某个低频任务
- ⚠️ 需要迁移现有配置

**实施步骤**：
1. 修改 `AIEngineAssignment` 类型定义
2. 更新预设方案
3. 提供配置迁移逻辑：
   ```typescript
   profileGeneration → lowFrequencyTasks
   sourceAnalysis → lowFrequencyTasks
   ```
4. 更新所有引用位置

### 方案 B：复用现有配置（当前实施）

新的低频任务复用 `profileGeneration` 的配置：

```typescript
// 推荐池策略决策使用画像生成的配置
const lowFreqConfig = aiConfig.engineAssignment.profileGeneration
```

**优点**：
- ✅ 无需修改现有架构
- ✅ 零迁移成本
- ✅ 快速实施

**缺点**：
- ⚠️ 语义不清晰（策略决策使用"画像生成"配置）
- ⚠️ 未来维护困惑

### 方案 C：保持细分配置

继续为每个任务单独配置：

```typescript
export interface AIEngineAssignment {
  pageAnalysis: AIEngineConfig
  articleAnalysis: AIEngineConfig
  profileGeneration: AIEngineConfig
  sourceAnalysis?: AIEngineConfig
  strategyDecision?: AIEngineConfig  // 新增
  // ... 未来可能更多
}
```

**优点**：
- ✅ 最大灵活性
- ✅ 语义清晰

**缺点**：
- ❌ 配置复杂度持续增长
- ❌ 用户体验变差
- ❌ 维护成本高

## 决策建议

### 短期（0.3.x）

采用**方案 B**：复用 `profileGeneration` 配置
- 快速实施，零风险
- 代码中添加注释说明

### 中期（0.4.0）

采用**方案 A**：统一低频任务配置
- 用户体验优化的重点版本
- 提供平滑迁移工具

## 实施细节（方案 A）

### 1. 类型定义更新

```typescript
// src/types/ai-engine-assignment.ts

export interface AIEngineAssignment {
  /** 高频任务：页面浏览学习 */
  pageAnalysis: AIEngineConfig
  
  /** 高频任务：文章内容分析（推荐文章打分） */
  articleAnalysis: AIEngineConfig
  
  /** 
   * 低频任务：统一配置
   * 
   * 包括：
   * - 用户画像生成（每周1-2次）
   * - 订阅源质量分析（添加订阅源时）
   * - 推荐池策略决策（每天1次）
   * - 未来的其他优化任务
   * 
   * 低频任务可以使用更强大的模型（如推理模式），
   * 因为调用频率低，成本影响小。
   */
  lowFrequencyTasks: AIEngineConfig
}
```

### 2. 配置迁移

```typescript
// src/storage/ai-config.ts

async function migrateAIConfig(oldConfig: any): Promise<AIConfig> {
  if (oldConfig.engineAssignment.profileGeneration && 
      !oldConfig.engineAssignment.lowFrequencyTasks) {
    // 迁移：将 profileGeneration 和 sourceAnalysis 合并为 lowFrequencyTasks
    oldConfig.engineAssignment.lowFrequencyTasks = 
      oldConfig.engineAssignment.profileGeneration
    
    // 保留旧字段以兼容（标记为 deprecated）
    delete oldConfig.engineAssignment.profileGeneration
    delete oldConfig.engineAssignment.sourceAnalysis
  }
  
  return oldConfig
}
```

### 3. 预设方案更新

```typescript
intelligence: {
  config: {
    pageAnalysis: {
      provider: "remote",
      useReasoning: false
    },
    articleAnalysis: {
      provider: "remote",
      useReasoning: false
    },
    lowFrequencyTasks: {
      provider: "remote",
      useReasoning: true  // 低频任务可以用推理模式
    }
  }
}
```

### 4. 使用位置更新

```typescript
// 画像生成
const config = aiConfig.engineAssignment.lowFrequencyTasks

// 订阅源分析
const config = aiConfig.engineAssignment.lowFrequencyTasks

// 推荐池策略决策
const config = aiConfig.engineAssignment.lowFrequencyTasks
```

## 成本分析

### 当前成本（分散配置）

```
高频任务（每天调用）：
- 页面浏览学习：~100 次/天
- 文章内容分析：~50 次/天

低频任务（偶尔调用）：
- 画像生成：~1 次/周
- 订阅源分析：~5 次/月
- 策略决策：~1 次/天
```

### 统一低频配置后

```
高频任务配置：
- provider: remote (标准模式)
- 成本：¥0.5-1/月

低频任务配置：
- provider: remote (推理模式)
- 成本：¥0.1-0.2/月 (频率低，推理模式影响小)

总成本：¥0.6-1.2/月（与当前相当，但配置更简单）
```

## 用户体验对比

### 当前（分散配置）

```
AI 引擎配置
├─ 页面浏览学习：DeepSeek (标准)
├─ 文章内容分析：DeepSeek (标准)
├─ 用户画像生成：DeepSeek (推理)
├─ 订阅源分析：DeepSeek (标准)
└─ 策略决策：DeepSeek (标准)  ← 新增，用户需要配置
```

### 统一后（方案 A）

```
AI 引擎配置
├─ 高频任务：DeepSeek (标准)
│  ├─ 页面浏览学习
│  └─ 文章内容分析
│
└─ 低频任务：DeepSeek (推理)
   ├─ 用户画像生成
   ├─ 订阅源分析
   └─ 策略决策  ← 自动使用低频任务配置，无需额外配置
```

## 总结

**立即行动**（0.3.x）：
- 采用方案 B，复用 `profileGeneration` 配置
- 添加代码注释说明复用关系

**计划迁移**（0.4.0）：
- 实施方案 A，统一低频任务配置
- 提供配置迁移工具
- 更新文档和预设方案

**预期效果**：
- 用户配置简化
- 新增功能无需额外配置
- 成本控制更清晰
