# 推荐系统优化方案

## 问题分析

### 问题 1: 画像重建频率过高
**现状**: 每次点击"不想读"都会立即触发 AI 画像重建，浪费 API 请求

**场景**: 用户快速连续标记 5 篇文章为"不想读"
- 当前行为: 触发 5 次 AI 请求
- 优化后: 触发 1 次 AI 请求（防抖 5 秒）

**影响**:
- ❌ API 配额浪费
- ❌ 画像更新频繁但效果有限
- ❌ 可能超出 API 速率限制

### 问题 2: 推荐池容量过大
**现状**: 推荐池容量 = `maxRecommendations`（默认 3-5 条）

**问题**: 
- 弹窗只显示 3 条
- 但预备池中可能存储了很多条（通过竞争机制不断替换）
- 用户可能永远看不到池中靠后的推荐

**期望**: 
- 推荐池容量 = `maxRecommendations * 2` 或 `maxRecommendations * 3`
- 保持适度的预备队列，避免过度存储

## 优化方案

### 方案 1: 画像重建防抖机制

**实现思路**:
```typescript
class SemanticProfileBuilder {
  private dismissDebounceTimer: NodeJS.Timeout | null = null
  private dismissQueue: Recommendation[] = []
  
  async onDismiss(article: Recommendation): Promise<void> {
    // 1. 记录负反馈（立即执行）
    await this.recordDismissBehavior(article)
    this.dismissQueue.push(article)
    
    // 2. 清除旧的定时器
    if (this.dismissDebounceTimer) {
      clearTimeout(this.dismissDebounceTimer)
    }
    
    // 3. 设置新的定时器（5秒后执行）
    this.dismissDebounceTimer = setTimeout(async () => {
      const count = this.dismissQueue.length
      profileLogger.info(`🔄 防抖触发: 批量处理 ${count} 条拒绝记录`)
      
      await this.triggerFullUpdate('dismiss')
      this.dismissQueue = []
      this.dismissDebounceTimer = null
    }, 5000) // 5秒防抖
  }
}
```

**优点**:
- ✅ 减少 API 请求次数
- ✅ 批量处理更高效
- ✅ 用户体验无影响（5秒延迟可接受）

**缺点**:
- ⚠️ 需要处理定时器清理（组件卸载时）

### 方案 2: 推荐池容量优化

**当前逻辑**:
```typescript
const maxSize = config.maxRecommendations || 3  // 3 条
```

**优化后**:
```typescript
const POOL_SIZE_MULTIPLIER = 2  // 或 3
const maxSize = (config.maxRecommendations || 3) * POOL_SIZE_MULTIPLIER  // 6 或 9 条
```

**影响分析**:
- 弹窗显示: 3 条（不变）
- 预备池: 6 条（当前 3 条）
- 数据库存储: 略有增加，但可控
- 推荐多样性: 提升（有更多备选）

**配置建议**:
- `maxRecommendations = 3` → 池容量 = 6 条
- `maxRecommendations = 5` → 池容量 = 10 条

## 实施计划

### Phase 1: 画像重建防抖 (优先级: P0)
1. 修改 `SemanticProfileBuilder.ts` 添加防抖逻辑
2. 添加定时器清理机制
3. 更新相关测试用例
4. 浏览器测试验证

### Phase 2: 推荐池容量优化 (优先级: P1)
1. 修改 `RecommendationService.ts` 调整池容量计算
2. 添加配置常量 `POOL_SIZE_MULTIPLIER`
3. 更新相关测试用例
4. 验证数据库查询性能

### Phase 3: 文档和测试 (优先级: P2)
1. 更新 TDD.md 说明优化策略
2. 添加性能测试（API 请求次数统计）
3. 浏览器测试完整流程

## 测试计划

### 测试 1: 防抖机制
- 快速连续点击 5 次"不想读"
- 预期: 5 秒后触发 1 次 AI 请求
- 验证: 检查日志和 API 调用次数

### 测试 2: 推荐池容量
- 生成 10 篇推荐
- 预期: 数据库中保留 6 条（maxRecommendations=3）
- 验证: 查询数据库确认数量

### 测试 3: 边界情况
- 快速标记后立即关闭弹窗
- 预期: 定时器被清理，不会泄漏
- 验证: 检查内存和日志

## 风险评估

### 风险 1: 定时器泄漏
**影响**: 内存泄漏，多次触发

**缓解**: 
- 在组件卸载时清理定时器
- 添加单元测试验证

### 风险 2: 推荐池过大
**影响**: 数据库查询变慢，存储增加

**缓解**:
- 使用配置控制倍数（2 或 3）
- 定期清理旧推荐（已有机制）

## 成功指标

- ✅ API 请求次数减少 80%（快速操作场景）
- ✅ 推荐多样性提升（池容量增加）
- ✅ 所有测试通过
- ✅ 用户体验无负面影响

---

## 实施结果

### 完成时间
2024-12-XX

### 代码修改
1. **SemanticProfileBuilder.ts**:
   - 添加防抖配置 `DISMISS_DEBOUNCE_MS = 5000`
   - 添加实例变量 `dismissDebounceTimer`, `dismissQueue`
   - 重写 `onDismiss()` 方法实现防抖逻辑
   - 新增 `cleanup()` 方法清理定时器

2. **RecommendationService.ts**:
   - 添加配置常量 `POOL_SIZE_MULTIPLIER = 2`
   - 修改池容量计算 `maxSize = baseSize * POOL_SIZE_MULTIPLIER`
   - 更新日志显示基础容量和实际容量

3. **SemanticProfileBuilder.test.ts**:
   - 更新 `afterEach` 钩子，添加 cleanup 调用
   - 修改 `onDismiss` 测试描述
   - 新增防抖测试（5 秒等待）
   - 新增 cleanup 测试
   - 修复降级方案测试（添加防抖等待）

### 测试结果
- ✅ 所有测试通过：**1464/1465** passed (1 skipped)
- ✅ 测试覆盖率达标：
  - 行覆盖率：72.7% (> 70%)
  - 函数覆盖率：73.06% (> 70%)
  - 分支覆盖率：62.39% (> 60%)
- ✅ 防抖测试通过（耗时 5107ms，符合预期）

### 性能优化效果
**场景: 快速连续标记 5 篇"不想读"**
- 优化前：触发 5 次 AI 请求
- 优化后：触发 1 次 AI 请求
- **节省 80% API 请求** ✅

**推荐池容量**:
- 优化前：maxRecommendations = 3 → 池容量 = 3 条
- 优化后：maxRecommendations = 3 → 池容量 = 6 条
- **预备队列增加 100%，提升推荐多样性** ✅

### 待验证
- [ ] 浏览器实际测试：快速连续"不想读"
- [ ] 浏览器实际测试：推荐池数量验证
- [ ] 长期运行稳定性观察
