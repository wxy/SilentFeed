# 分支覆盖率提升进展报告

## 📊 当前状态

**基准**（2025-12-02）:
- 分支覆盖率: **60.66%** (2619/4317)
- 行覆盖率: 71.72%
- 函数覆盖率: 72.51%

## ✅ 已完成的改进

### 1. `src/storage/db/index.ts` (0% → 80%+)

**问题**: 数据库索引模块完全没有测试

**解决方案**: 创建 `src/storage/db/index.test.ts`
- ✅ 测试数据库实例导出（db）
- ✅ 测试缓存实例导出（statsCache）
- ✅ 测试所有 9 个子模块的函数重导出（25 个函数）
- ✅ 验证所有导出函数的类型和可用性

**提交**: `1addb2c` - test: 添加 db/index.ts 模块导出测试

**影响**: 
- 文件覆盖率从 0% → ~80%
- 对整体分支覆盖率影响较小（该文件主要是导出，分支逻辑少）

### 2. `src/core/recommender/notification.ts` (已有完善测试)

**现状**: 分支覆盖率已达 83.33%+
- ✅ 静默时段测试完整
- ✅ 权限检查测试完整
- ✅ 最小间隔测试完整
- ✅ 通知按钮交互测试完整
- ✅ 错误处理测试完整

**无需改进**: 该文件测试已经非常完善

## 🎯 下一步优先改进

### P0 - 高优先级（分支覆盖率 < 30%）

#### 1. `src/components/settings/RecommendationStats.tsx` ⭐⭐⭐⭐⭐
- 当前: **6.87%**
- 目标: **60%+**
- 原因: 统计页面几乎完全未测试，但是重要的 UI 组件
- 建议:
  ```typescript
  // 需要测试的分支
  - 加载状态渲染
  - 空数据状态渲染
  - 有数据状态的图表渲染
  - 错误状态处理
  - 时间范围切换（30天/全部）
  - 数据刷新交互
  ```

#### 2. `src/components/RecommendationView.tsx` ⭐⭐⭐⭐⭐
- 当前: **23.45%**
- 目标: **60%+**
- 原因: 推荐列表核心组件
- 建议:
  ```typescript
  // 需要测试的分支
  - 加载、空数据、错误、成功四种状态
  - 推荐卡片的展开/折叠
  - "不想读"按钮交互
  - "稍后读"按钮交互（如已实现）
  - 翻译开关功能
  - 推荐来源显示（算法/AI/推理AI）
  - 分数显示和样式
  ```

#### 3. `src/components/settings/AIConfig.tsx` ⭐⭐⭐⭐
- 当前: **23.66%**
- 目标: **60%+**
- 原因: AI 配置核心组件
- 建议:
  ```typescript
  // 需要测试的分支
  - OpenAI/DeepSeek/Ollama/ChromeAI 提供商切换
  - API Key 输入和验证
  - 模型选择下拉框
  - 连接测试成功/失败
  - 推理模式开关
  - 表单提交和保存
  - 错误提示显示
  ```

### P1 - 中优先级（分支覆盖率 30-50%）

#### 4. `src/core/recommender/pipeline.ts` ⭐⭐⭐⭐
- 当前: **49.35%**
- 目标: **70%+**
- 原因: 推荐管道核心业务逻辑，**目前没有测试文件**
- 建议:
  ```typescript
  // 需要创建 pipeline.test.ts
  - 完整推荐流程测试（TF-IDF → AI 评分）
  - AI 分析失败回退到 TF-IDF
  - 空数据流处理
  - 并发控制测试
  - 进度回调测试
  - 错误恢复机制
  - 取消操作测试（AbortController）
  ```

#### 5. `src/core/ai/AICapabilityManager.ts` ⭐⭐⭐
- 当前: **40.14%**
- 目标: **65%+**
- 建议:
  ```typescript
  // 需要测试的分支
  - OpenAI/DeepSeek/Ollama/ChromeAI 能力检测
  - API Key 验证
  - 模型可用性检查
  - 配置更新和保存
  - 错误状态处理
  - 提供商切换逻辑
  ```

#### 6. `src/components/OnboardingView.tsx` ⭐⭐⭐
- 当前: **39.2%**
- 目标: **65%+**
- 建议:
  ```typescript
  // 需要测试的分支
  - 多步骤流程（欢迎 → AI 配置 → RSS → 完成）
  - 上一步/下一步按钮
  - 跳过按钮
  - 各步骤的表单验证
  - 完成后的跳转
  ```

### P2 - 低优先级（分支覆盖率 > 50%）

#### 7. `src/storage/db/db-stats.ts`
- 当前: **36.84%**
- 目标: **70%+**
- 建议: 补充边界条件测试（空数据、日期范围、聚合查询）

## 📈 预计提升效果

如果完成 P0 的 3 个文件：

| 文件 | 当前 | 目标 | 分支数估计 | 新增覆盖 |
|------|------|------|-----------|---------|
| RecommendationStats.tsx | 6.87% | 60% | ~150 | ~80 |
| RecommendationView.tsx | 23.45% | 60% | ~200 | ~73 |
| AIConfig.tsx | 23.66% | 60% | ~180 | ~65 |
| **总计** | - | - | ~530 | ~218 |

**预计总体分支覆盖率**: 60.66% → **65.7%** (+5%)

## 🛠️ 实施建议

### Week 1: P0 组件测试（预计 +5% 分支覆盖率）

1. **Day 1-2**: `RecommendationStats.tsx`
   - 创建 `RecommendationStats.test.tsx`
   - 使用 `@testing-library/react` 测试渲染
   - Mock 统计数据查询
   - 测试图表库集成（如使用 Chart.js/Recharts）

2. **Day 3-4**: `RecommendationView.tsx`
   - 创建 `RecommendationView.test.tsx`
   - 测试所有 UI 状态
   - 测试用户交互（按钮点击、展开折叠）
   - Mock 推荐数据

3. **Day 5**: `AIConfig.tsx`
   - 创建 `AIConfig.test.tsx`
   - 测试表单交互
   - Mock API 调用
   - 测试验证逻辑

### Week 2: P1 业务逻辑测试（预计 +3% 分支覆盖率）

1. **Day 1-3**: `pipeline.ts`
   - 创建 `pipeline.test.ts`
   - Mock AI 管理器、数据库
   - 测试推荐流程各阶段
   - 测试错误恢复

2. **Day 4-5**: `AICapabilityManager.ts`
   - 补充现有测试
   - 增加边界条件
   - 测试多提供商切换

### Week 3: P2 其他改进（预计 +1% 分支覆盖率）

1. 完善 `OnboardingView.tsx` 测试
2. 完善 `db-stats.ts` 测试
3. 其他低覆盖率文件

## 📊 监控指标

### 每日检查
```bash
npm run test:coverage
```

### 目标
- **短期（1周）**: 分支覆盖率 60.66% → 65%+
- **中期（2周）**: 分支覆盖率 65% → 68%+
- **长期（1月）**: 分支覆盖率 68% → 72%+（与行覆盖率持平）

## 🎓 测试最佳实践回顾

### 1. 组件测试模板

```typescript
describe('ComponentName', () => {
  // 状态测试
  describe('渲染状态', () => {
    test('loading state')
    test('empty state')
    test('error state')
    test('success state')
  })

  // 交互测试
  describe('用户交互', () => {
    test('button click')
    test('form submission')
    test('validation errors')
  })

  // 边界条件
  describe('边界情况', () => {
    test('null/undefined props')
    test('empty arrays')
    test('network errors')
  })
})
```

### 2. 业务逻辑测试模板

```typescript
describe('BusinessLogic', () => {
  // 正常流程
  test('happy path')
  
  // 边界条件
  test.each([
    [input1, expected1],
    [input2, expected2],
  ])('edge cases')
  
  // 错误处理
  test('error scenarios')
  test('fallback logic')
})
```

### 3. 提高分支覆盖率的技巧

- ✅ **测试所有 if/else 分支**
- ✅ **测试 switch 的所有 case**
- ✅ **测试三元表达式的两个分支**
- ✅ **测试短路运算符（&&, ||）的两种情况**
- ✅ **测试可选链（?.）的存在/不存在**
- ✅ **测试空值合并（??）的两种情况**

## 📚 相关文档

- [完整测试指南](./TESTING.md)
- [分支覆盖率详细分析](./TEST_COVERAGE_IMPROVEMENT_BRANCHES.md)
- [测试覆盖率提升计划](./TEST_COVERAGE_IMPROVEMENT.md)

---

**上次更新**: 2025-12-02  
**当前总体分支覆盖率**: 60.66%  
**目标分支覆盖率**: 72%+ (与行覆盖率持平)
