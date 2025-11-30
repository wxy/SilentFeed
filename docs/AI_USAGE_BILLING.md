# AI 用量计费系统

## 概述

AI 用量计费系统自动追踪和统计所有 AI 调用的用量和费用，帮助用户了解 AI 使用成本。

## 功能特性

### 1. 自动记录

- ✅ 自动记录每次 AI 调用的详细信息
- ✅ 包含 provider、model、tokens、cost、latency 等
- ✅ 区分成功/失败调用
- ✅ 记录调用用途（内容分析、用户画像生成、翻译等）

### 2. 用量校正

- ✅ 支持从 API 响应中获取准确的 token 用量
- ✅ 自动更新预估值为实际值
- ✅ 标记数据来源（estimated vs actual）

### 3. 多维度统计

- ✅ 按时间范围统计（默认 30 天）
- ✅ 按 Provider 分组（OpenAI、DeepSeek、Ollama 等）
- ✅ 按用途分组（analyze-content、generate-profile 等）
- ✅ 计算总调用次数、成功率、tokens 用量、费用
- ✅ 计算平均延迟

### 4. 数据管理

- ✅ 自动清理过期数据（默认保留 90 天）
- ✅ 导出为 CSV 格式
- ✅ 查看最近的调用记录

## 技术实现

### 数据库结构

```typescript
interface AIUsageRecord {
  id: string                    // 记录 ID
  provider: string              // AI Provider
  model: string                 // 使用的模型
  purpose: AIUsagePurpose       // 调用用途
  tokens: {
    input: number
    output: number
    total: number
    estimated: boolean          // 是否为预估值
  }
  cost: {
    input: number
    output: number
    total: number
    estimated: boolean
  }
  timestamp: number             // 调用时间
  latency: number               // 延迟（毫秒）
  success: boolean              // 是否成功
  error?: string                // 错误信息
  metadata?: Record<string, any> // 额外数据
}
```

### 集成方式

AI 用量追踪已自动集成到 `BaseAIService`，所有继承此类的 Provider 都会自动记录用量：

1. **analyzeContent** - 内容分析
2. **generateUserProfile** - 用户画像生成
3. **testConnection** - 连接测试

## API 使用示例

### 1. 查询用量统计

```typescript
import { AIUsageTracker } from '@/core/ai/AIUsageTracker'

// 查询默认 30 天内的统计
const stats = await AIUsageTracker.getStats()

console.log(`总调用次数: ${stats.totalCalls}`)
console.log(`成功次数: ${stats.successfulCalls}`)
console.log(`总费用: ¥${stats.cost.total.toFixed(4)}`)

// 按 Provider 分组
Object.entries(stats.byProvider).forEach(([provider, data]) => {
  console.log(`${provider}: ${data.calls} 次调用, ¥${data.cost.total.toFixed(4)}`)
})

// 按用途分组
Object.entries(stats.byPurpose).forEach(([purpose, data]) => {
  console.log(`${purpose}: ${data.calls} 次调用`)
})
```

### 2. 按条件筛选统计

```typescript
// 查询 DeepSeek 的用量
const deepseekStats = await AIUsageTracker.getStats({
  provider: 'deepseek'
})

// 查询内容分析的用量
const analyzeStats = await AIUsageTracker.getStats({
  purpose: 'analyze-content'
})

// 查询最近 7 天的用量
const weekStats = await AIUsageTracker.getStats({
  startTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
  endTime: Date.now()
})

// 只统计成功的调用
const successStats = await AIUsageTracker.getStats({
  onlySuccess: true
})
```

### 3. 查看最近的调用记录

```typescript
// 获取最近 50 条记录
const recentRecords = await AIUsageTracker.getRecentRecords(50)

recentRecords.forEach(record => {
  console.log(`${record.provider} - ${record.purpose}`)
  console.log(`Tokens: ${record.tokens.total}, Cost: ¥${record.cost.total.toFixed(6)}`)
  console.log(`Latency: ${record.latency}ms, Success: ${record.success}`)
})
```

### 4. 获取总费用

```typescript
// 获取默认 30 天内的总费用
const totalCost = await AIUsageTracker.getTotalCost()
console.log(`总费用: ¥${totalCost.toFixed(4)}`)

// 获取本月费用
const thisMonthCost = await AIUsageTracker.getTotalCost({
  startTime: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
  endTime: Date.now()
})
```

### 5. 清理过期数据

```typescript
// 清理 90 天前的数据
const deletedCount = await AIUsageTracker.cleanOldRecords(90)
console.log(`已清理 ${deletedCount} 条过期记录`)
```

### 6. 导出数据

```typescript
// 导出为 CSV
const csv = await AIUsageTracker.exportToCSV()

// 保存到文件或下载
const blob = new Blob([csv], { type: 'text/csv' })
const url = URL.createObjectURL(blob)
// ... 下载逻辑
```

## 成本计算

### DeepSeek 定价（已内置）

- **输入（缓存命中）**: ¥0.2/M tokens
- **输入（缓存未命中）**: ¥2.0/M tokens
- **输出**: ¥3.0/M tokens

假设 10% 缓存命中率：

```typescript
const inputCost = (tokens.input * 0.1 / 1000000) * 0.2  // 缓存命中
                + (tokens.input * 0.9 / 1000000) * 2.0  // 缓存未命中
const outputCost = (tokens.output / 1000000) * 3.0
```

### OpenAI 定价

需要在 `OpenAIProvider.calculateCost()` 方法中实现具体模型的定价。

### 本地 AI (Ollama)

本地运行的 AI 不产生费用，`calculateCost()` 返回 0。

## 数据隐私

- ✅ 所有用量数据存储在本地 IndexedDB
- ✅ 不包含任何敏感的用户内容
- ✅ 只记录元数据（tokens、cost、latency 等）
- ✅ 用户可以随时清理历史数据

## 性能优化

- ✅ 异步记录，不阻塞 AI 调用
- ✅ 自动清理过期数据（默认保留 90 天）
- ✅ 索引优化，支持快速查询
- ✅ 统计结果可缓存

## 未来扩展

### UI 展示（Phase 10）

- [ ] 在设置页面添加用量统计面板
- [ ] 可视化图表（折线图、饼图）
- [ ] 费用预算和提醒
- [ ] 详细的调用日志查看器

### 高级功能

- [ ] 用量配额管理
- [ ] 成本优化建议
- [ ] 多账号/多 API Key 统计
- [ ] 导出为多种格式（JSON、Excel）

## 测试

完整的测试套件：

```bash
npm test -- AIUsageTracker.test.ts
```

测试覆盖：
- ✅ 记录用量（成功/失败）
- ✅ 用量校正
- ✅ 多维度统计
- ✅ 按条件筛选
- ✅ 查询最近记录
- ✅ 清理过期数据
- ✅ CSV 导出

## 示例输出

### 统计结果示例

```json
{
  "period": {
    "start": 1701388800000,
    "end": 1704067200000
  },
  "totalCalls": 150,
  "successfulCalls": 145,
  "failedCalls": 5,
  "tokens": {
    "input": 45000,
    "output": 22000,
    "total": 67000
  },
  "cost": {
    "input": 0.0234,
    "output": 0.0330,
    "total": 0.0564
  },
  "byProvider": {
    "deepseek": {
      "calls": 100,
      "tokens": { "input": 30000, "output": 15000, "total": 45000 },
      "cost": { "input": 0.0156, "output": 0.0225, "total": 0.0381 }
    },
    "openai": {
      "calls": 50,
      "tokens": { "input": 15000, "output": 7000, "total": 22000 },
      "cost": { "input": 0.0078, "output": 0.0105, "total": 0.0183 }
    }
  },
  "byPurpose": {
    "analyze-content": {
      "calls": 120,
      "tokens": { "input": 36000, "output": 18000, "total": 54000 },
      "cost": { "input": 0.0187, "output": 0.0270, "total": 0.0457 }
    },
    "generate-profile": {
      "calls": 30,
      "tokens": { "input": 9000, "output": 4000, "total": 13000 },
      "cost": { "input": 0.0047, "output": 0.0060, "total": 0.0107 }
    }
  },
  "avgLatency": 1850
}
```

### CSV 导出示例

```csv
Timestamp,Date,Provider,Model,Purpose,Input Tokens,Output Tokens,Total Tokens,Input Cost (¥),Output Cost (¥),Total Cost (¥),Latency (ms),Success,Error
1704067200000,2024/1/1 00:00:00,deepseek,deepseek-chat,analyze-content,100,50,150,0.000200,0.000150,0.000350,1500,Yes,
1704067215000,2024/1/1 00:00:15,deepseek,deepseek-chat,generate-profile,500,200,700,0.001000,0.000600,0.001600,3000,Yes,
1704067230000,2024/1/1 00:00:30,openai,gpt-4,analyze-content,0,0,0,0.000000,0.000000,0.000000,500,No,API rate limit exceeded
```

## 相关文件

- `src/types/ai-usage.ts` - 类型定义
- `src/core/ai/AIUsageTracker.ts` - 核心服务
- `src/core/ai/AIUsageTracker.test.ts` - 测试套件
- `src/core/ai/BaseAIService.ts` - 自动集成
- `src/storage/db/index.ts` - 数据库定义（版本 15）
