# 画像生成触发机制优化

**日期**: 2025-12-06  
**问题**: 画像生成触发过于频繁，导致 AI 用量过高

---

## 📊 当前状态

### 触发阈值（`SemanticProfileBuilder.ts`）

```typescript
const BROWSE_THRESHOLD = 20    // 浏览 20 页触发全量更新
const READ_THRESHOLD = 3       // 阅读 3 篇触发全量更新
const DISMISS_DEBOUNCE_MS = 5000  // 拒绝操作防抖时间（5秒）
```

### 用量数据分析

根据最近的统计：
- **画像生成**: 411 次
- **内容推荐**: 706 次
- **比例**: 画像/推荐 = 58%

**问题**:
- 正常情况下，画像生成应该远少于内容推荐（建议 < 10%）
- 当前比例过高，说明触发过于频繁

---

## 🔍 问题分析

### 问题 1: 拒绝防抖时间过短 ⚠️ 严重

**当前**: 5 秒防抖

**场景**:
```
用户快速拒绝 3 条推荐 → 停顿 6 秒 → 触发画像更新
用户继续拒绝 2 条 → 停顿 6 秒 → 又触发画像更新
```

**结果**: 用户在一次会话中可能触发 5-10 次画像更新

**原因**: 5 秒太短，用户稍微停顿就会触发

---

### 问题 2: 浏览阈值偏低

**当前**: 浏览 20 页触发

**分析**:
- 一天浏览 100 页 → 触发 5 次画像生成
- 一周 → 35 次
- 一个月 → 150 次

**建议**: 提高到 50-100 页

---

### 问题 3: 阅读阈值偏低

**当前**: 阅读 3 篇触发

**分析**:
- 一天阅读 10 篇 → 触发 3 次
- 一周 → 21 次
- 一个月 → 90 次

**建议**: 提高到 10-15 篇

---

### 问题 4: 推理模式默认启用

**当前**: intelligence 方案默认启用画像推理

**影响**:
- 推理模式成本是标准模式的 2 倍
- 输入 token 量是标准模式的 5-10 倍（因为推理过程）
- 一次画像生成可能消耗 3000-5000 tokens

**建议**: 考虑禁用画像推理或降低频率

---

## 💡 优化方案

### 方案 A: 提高触发阈值（推荐）⭐⭐⭐⭐⭐

**优点**: 简单直接，立即生效  
**缺点**: 画像更新不够及时

**建议阈值**:
```typescript
const BROWSE_THRESHOLD = 50      // 50 页 (原 20)
const READ_THRESHOLD = 10        // 10 篇 (原 3)
const DISMISS_DEBOUNCE_MS = 30000  // 30 秒 (原 5 秒)
```

**预期效果**:
- 浏览触发: 5 次/天 → 2 次/天 (-60%)
- 阅读触发: 3 次/天 → 1 次/天 (-66%)
- 拒绝触发: 5-10 次/会话 → 1-2 次/会话 (-80%)
- **总触发次数减少 70%**

---

### 方案 B: 改为时间间隔触发

**优点**: 更可控，避免突发  
**缺点**: 实现复杂，需要持久化时间戳

**建议间隔**:
```typescript
const MIN_UPDATE_INTERVAL = 3600000  // 1 小时
const LAST_UPDATE_KEY = 'lastProfileUpdate'
```

**逻辑**:
```typescript
async triggerFullUpdate(trigger: string) {
  const now = Date.now()
  const lastUpdate = await getLastUpdateTime()
  
  if (now - lastUpdate < MIN_UPDATE_INTERVAL) {
    profileLogger.info('⏱️ 距离上次更新不足 1 小时，跳过')
    return
  }
  
  await generateAIProfile()
  await saveLastUpdateTime(now)
}
```

**预期效果**:
- 最多每小时触发 1 次
- 一天最多 24 次（实际可能 5-10 次）
- **总触发次数减少 90%**

---

### 方案 C: 智能累积触发

**优点**: 平衡及时性和成本  
**缺点**: 逻辑复杂

**建议规则**:
```typescript
// 累积分数制
let updateScore = 0

onBrowse() {
  updateScore += 1  // 浏览 +1
  if (updateScore >= 100) triggerUpdate()
}

onRead() {
  updateScore += 10  // 阅读 +10
  if (updateScore >= 100) triggerUpdate()
}

onDismiss() {
  updateScore += 5  // 拒绝 +5
  if (updateScore >= 100) triggerUpdate()
}
```

**预期效果**:
- 自动平衡不同行为的权重
- 触发更平滑
- **总触发次数减少 50-70%**

---

### 方案 D: 禁用画像推理（短期）

**优点**: 成本立即减半  
**缺点**: 画像质量可能下降

**修改**:
```typescript
// src/types/ai-engine-assignment.ts
export const PRESET_CONFIGS: Record<PresetName, PresetDefinition> = {
  intelligence: {
    // ...
    config: {
      profileGeneration: {
        provider: "deepseek",
        useReasoning: false  // ✅ 改为 false
      }
    }
  }
}
```

**预期效果**:
- 画像生成成本减半
- 输入 token 量减少 80%
- **总成本减少 40-50%**

---

## 🎯 推荐实施方案

### 阶段 1: 立即执行（今天）

1. **提高触发阈值**（方案 A）
   ```typescript
   const BROWSE_THRESHOLD = 50
   const READ_THRESHOLD = 10
   const DISMISS_DEBOUNCE_MS = 30000  // 30 秒
   ```

2. **禁用画像推理**（方案 D）
   ```typescript
   profileGeneration: {
     provider: "deepseek",
     useReasoning: false
   }
   ```

**预期效果**:
- 触发次数减少 70%
- 单次成本减少 50%
- **总成本减少 85%**

---

### 阶段 2: 长期优化（下周）

3. **实施时间间隔控制**（方案 B）
   - 添加最小更新间隔（1 小时）
   - 持久化最后更新时间

4. **优化拒绝逻辑**
   - 拒绝不立即触发更新
   - 累积到一定数量（10 条）或时间间隔（1 天）后批量处理

---

## 📋 实施清单

### 第 1 步: 调整触发阈值

- [x] 修改 `BROWSE_THRESHOLD`: 20 → 50
- [x] 修改 `READ_THRESHOLD`: 3 → 10
- [x] 修改 `DISMISS_DEBOUNCE_MS`: 5000 → 30000

### 第 2 步: 禁用画像推理

- [x] 修改 `intelligence` 方案配置
- [x] 修改 `economic` 方案配置（确保也是 false）

### 第 3 步: 测试验证

- [ ] 浏览器测试：快速拒绝多条推荐，确认只触发 1 次
- [ ] 浏览器测试：浏览 50 页后触发
- [ ] 检查数据库：确认新的画像记录 reasoning = false

### 第 4 步: 监控效果

- [ ] 运行按天统计脚本
- [ ] 对比优化前后的用量
- [ ] 验证成本减少 > 80%

---

## 📊 预期数据对比

### 优化前（当前）

| 指标 | 数值 |
|------|------|
| 画像生成次数 | 411 次/2天 ≈ 200 次/天 |
| 单次成本 | ¥0.006 (推理模式) |
| 日成本 | ¥1.2 |
| 月成本 | ¥36 |

### 优化后（预期）

| 指标 | 数值 |
|------|------|
| 画像生成次数 | 60 次/2天 ≈ 30 次/天 (-85%) |
| 单次成本 | ¥0.003 (非推理) |
| 日成本 | ¥0.09 (-92%) |
| 月成本 | ¥2.7 (-92%) |

---

## ⚠️ 风险评估

### 风险 1: 画像更新不及时

**影响**: 用户新兴趣可能延迟反映在推荐中

**缓解**:
- 保留手动强制更新功能
- 关键行为（如阅读）仍然及时更新

### 风险 2: 画像质量下降

**影响**: 非推理模式的画像可能不如推理模式准确

**缓解**:
- 监控推荐点击率
- 如果质量明显下降，考虑在低频场景启用推理

---

## 🔄 回滚计划

如果优化效果不佳，可以快速回滚：

```typescript
// 恢复原阈值
const BROWSE_THRESHOLD = 20
const READ_THRESHOLD = 3
const DISMISS_DEBOUNCE_MS = 5000

// 恢复推理模式
profileGeneration: {
  provider: "deepseek",
  useReasoning: true
}
```

---

**创建时间**: 2025-12-06  
**状态**: 待实施
