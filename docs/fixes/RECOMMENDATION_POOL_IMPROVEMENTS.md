# 推荐系统优化改进

## 改进日期
2025-12-18

## 改进内容

### 1. 修复画像触发条件 ✅

**问题**：用户清空一次弹窗（3-5条）就会触发画像更新，过于频繁。

**解决方案**：将触发阈值从"弹窗容量"改为"推荐池容量"（弹窗容量 × 2）

**代码修改**：
```typescript
// SemanticProfileBuilder.ts

// 修改前
const readThreshold = config.maxRecommendations      // 3-5 条
const dismissThreshold = config.maxRecommendations   // 3-5 条

// 修改后
const readThreshold = (config.maxRecommendations || 3) * POOL_SIZE_MULTIPLIER    // 6-10 条
const dismissThreshold = (config.maxRecommendations || 3) * POOL_SIZE_MULTIPLIER // 6-10 条
```

**效果**：
- ✅ 用户需要清空整个推荐池（6-10条）才会触发画像更新
- ✅ 减少不必要的画像重建频率
- ✅ 节省 API 成本

---

### 2. 弹窗大小调整指标存储验证 ✅

**问题**：担心画像重建可能导致弹窗大小调整指标归零。

**验证结果**：
- ✅ 自适应指标存储在 `chrome.storage.local` 的 `adaptive-metrics` 键
- ✅ 画像重建（`rebuildProfile`）不会影响这些指标
- ⚠️ 只有在"重置推荐数据"（`resetRecommendations`）时才会清空

**代码位置**：
- 指标存储：`src/core/recommender/adaptive-count.ts`
- 清空位置：`src/storage/db/db-recommendations.ts` (只在 `resetRecommendations` 中)

**结论**：无需修改，当前机制安全。

---

### 3. 实现基于历史评分的推荐池准入机制 ✅

**问题**：推荐池"清不完"，新推荐会持续填充，甚至低分推荐也能进入。

**解决方案**：新推荐必须达到历史评分基准才能进入推荐池。

#### 3.1 新增模块

**文件**：`src/core/recommender/historical-score-tracker.ts`

**功能**：
- 计算历史推荐评分基准（平均分）
- 支持两种策略：
  - **策略A**：基于当天推荐的平均分
  - **策略B**：基于最近 N 条推荐的平均分（默认，N=20）
- 设置最低基准（0.55），防止基准过低

**API**：
```typescript
// 获取历史评分基准
const baseline = await getHistoricalScoreBaseline({
  strategy: 'recent',  // 'daily' 或 'recent'
  recentCount: 20,     // 最近 N 条
  enabled: true,       // 是否启用
  minimumBaseline: 0.55 // 最低基准分
})

// 检查单个推荐
const passes = await passesHistoricalBaseline(0.7)

// 批量过滤
const passedIndices = await filterByHistoricalBaseline([0.6, 0.7, 0.8])
```

#### 3.2 集成到推荐服务

**文件**：`src/core/recommender/RecommendationService.ts`

**逻辑**：
```typescript
// 在推荐池竞争逻辑中新增历史基准检查
if (poolSize >= minPoolSizeForBaseline) {
  const passesBaseline = await passesHistoricalBaseline(article.score, {
    strategy: 'recent',
    recentCount: 20,
    enabled: true
  })
  
  if (!passesBaseline) {
    // 不符合历史基准，跳过
    continue
  }
}
```

**触发条件**：
- 推荐池中已有 >= `minPoolSizeForBaseline`（弹窗容量）条推荐
- 新推荐的评分必须 >= 历史平均分（最低 0.55）

#### 3.3 测试覆盖

**文件**：`src/core/recommender/historical-score-tracker.test.ts`

**测试场景**（12个测试）：
- ✅ 无历史数据时返回 null
- ✅ 策略A（当天）正确计算
- ✅ 策略B（最近N条）正确计算
- ✅ 应用最低基准
- ✅ 禁用时返回 null
- ✅ 高于/等于/低于基准的处理
- ✅ 批量过滤功能

---

## 效果总结

### 用户体验改进
1. ✅ **画像更新更合理**：不会因为清空一次弹窗就触发更新
2. ✅ **推荐池更稳定**：用户清空后不会被低分推荐持续填充
3. ✅ **推荐质量保证**：新推荐必须达到历史水平才能进入

### 成本优化
1. ✅ **减少 API 调用**：画像更新频率降低 50%（6-10条 vs 3-5条）
2. ✅ **节省计算资源**：避免无意义的低分推荐分析

### 系统稳定性
1. ✅ **自适应指标安全**：画像重建不会影响弹窗大小调整
2. ✅ **测试覆盖完整**：新增 12 个测试，总测试数 1780 个，全部通过

---

## 配置建议

### 历史评分基准配置

**默认配置**（推荐）：
```typescript
{
  strategy: 'recent',        // 使用最近 N 条
  recentCount: 20,           // 最近 20 条推荐
  enabled: true,             // 启用
  minimumBaseline: 0.55      // 最低基准 0.55
}
```

**激进配置**（严格质量控制）：
```typescript
{
  strategy: 'recent',
  recentCount: 10,           // 最近 10 条（更敏感）
  enabled: true,
  minimumBaseline: 0.60      // 更高的最低基准
}
```

**宽松配置**（多样性优先）：
```typescript
{
  strategy: 'daily',         // 只看当天
  enabled: true,
  minimumBaseline: 0.50      // 更低的最低基准
}
```

---

## 后续优化建议

1. **动态调整最低基准**：根据推荐池填充速度自适应调整 `minimumBaseline`
2. **用户个性化**：允许用户在设置中调整历史基准策略
3. **监控面板**：在统计页面显示历史评分趋势图
4. **A/B 测试**：对比启用/禁用历史基准的推荐质量

---

## 相关文件

### 核心模块
- `src/core/profile/SemanticProfileBuilder.ts` - 画像触发条件修复
- `src/core/recommender/historical-score-tracker.ts` - 历史评分追踪器（新增）
- `src/core/recommender/RecommendationService.ts` - 推荐池准入机制集成

### 测试文件
- `src/core/recommender/historical-score-tracker.test.ts` - 历史评分追踪器测试（新增）

### 配置文件
- `src/core/recommender/adaptive-count.ts` - 自适应指标存储

---

## 版本信息
- Silent Feed: 0.3.6
- 改进分支: `feature/profile-and-recommendation-rules`
