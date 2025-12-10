# 分支覆盖率提升指南

## 📊 当前状态

- **分支覆盖率**: 60.66% (2619/4317) ⚠️
- **行覆盖率**: 71.72% ✅
- **函数覆盖率**: 72.51% ✅
- **语句覆盖率**: 70.72% ✅

**问题**: 分支覆盖率是四项指标中最低的，需要重点提升。

## 🎯 目标

- **短期目标**: 分支覆盖率提升至 **65%+**
- **中期目标**: 分支覆盖率提升至 **70%+**（与行覆盖率持平）
- **长期目标**: 分支覆盖率提升至 **75%+**

## 🔍 低分支覆盖率文件分析

根据测试报告，以下文件的分支覆盖率较低（<50%）：

### 🚨 P0 - 严重不足（分支覆盖率 < 30%）

1. **`src/components/RecommendationView.tsx`** (23.45%)
   - 组件：推荐列表视图
   - 问题：大量条件渲染分支未测试
   - 优先级：⭐⭐⭐⭐⭐

2. **`src/components/settings/AIConfig.tsx`** (23.66%)
   - 组件：AI 配置面板
   - 问题：多种 AI 提供商切换、表单验证分支未覆盖
   - 优先级：⭐⭐⭐⭐⭐

3. **`src/components/settings/RecommendationStats.tsx`** (6.87%)
   - 组件：推荐统计
   - 问题：几乎完全未测试
   - 优先级：⭐⭐⭐⭐⭐

4. **`src/core/recommender/NotificationService.ts`** (27.55%)
   - 功能：推荐通知服务
   - 问题：通知权限、静默时段等分支未测试
   - 优先级：⭐⭐⭐⭐

5. **`src/storage/db/index.ts`** (0%)
   - 功能：数据库索引导出
   - 问题：完全未测试
   - 优先级：⭐⭐⭐

### ⚠️ P1 - 需要改进（分支覆盖率 30-50%）

6. **`src/components/settings/AIEngineAssignment.tsx`** (43.62%)
   - 组件：AI 引擎分配
   - 问题：不同任务类型的引擎选择分支

7. **`src/components/OnboardingView.tsx`** (39.2%)
   - 组件：引导页
   - 问题：多步骤流程的分支

8. **`src/core/ai/AICapabilityManager.ts`** (40.14%)
   - 功能：AI 能力管理
   - 问题：多提供商能力检测分支

9. **`src/core/recommender/pipeline.ts`** (49.35%)
   - 功能：推荐管道
   - 问题：多阶段筛选逻辑分支

10. **`src/storage/db/db-stats.ts`** (36.84%)
    - 功能：统计数据存储
    - 问题：聚合查询的多种条件分支

## 💡 提升策略

### 1. 组件测试策略

#### ✅ 覆盖条件渲染分支

```typescript
// ❌ 当前测试只测了一种状态
test('renders loading state', () => {
  render(<RecommendationView loading={true} />)
  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

// ✅ 应该测试所有条件分支
describe('RecommendationView', () => {
  test('renders loading state', () => {
    render(<RecommendationView loading={true} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  test('renders empty state when no recommendations', () => {
    render(<RecommendationView loading={false} recommendations={[]} />)
    expect(screen.getByText('No recommendations')).toBeInTheDocument()
  })

  test('renders recommendations list', () => {
    const mockData = [...]
    render(<RecommendationView loading={false} recommendations={mockData} />)
    expect(screen.getAllByRole('article')).toHaveLength(mockData.length)
  })

  test('renders error state', () => {
    render(<RecommendationView error="Network error" />)
    expect(screen.getByText(/Network error/i)).toBeInTheDocument()
  })
})
```

#### ✅ 覆盖用户交互分支

```typescript
// ❌ 只测了点击按钮
test('handles click', async () => {
  render(<Component />)
  await userEvent.click(screen.getByRole('button'))
})

// ✅ 测试所有交互路径
describe('User interactions', () => {
  test('handles successful submission', async () => {
    // 正常流程
  })

  test('handles validation errors', async () => {
    // 验证失败分支
  })

  test('handles network errors', async () => {
    // 网络错误分支
  })

  test('handles empty input', async () => {
    // 空输入分支
  })
})
```

### 2. 业务逻辑测试策略

#### ✅ 覆盖边界条件

```typescript
describe('NotificationService', () => {
  test('should not notify during quiet hours', async () => {
    const quietStart = 22
    const quietEnd = 8
    const currentHour = 23
    
    const service = new NotificationService({ quietStart, quietEnd })
    const result = await service.notify(mockRecommendation, currentHour)
    
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('quiet_hours')
  })

  test('should notify outside quiet hours', async () => {
    const quietStart = 22
    const quietEnd = 8
    const currentHour = 10
    
    const service = new NotificationService({ quietStart, quietEnd })
    const result = await service.notify(mockRecommendation, currentHour)
    
    expect(result.sent).toBe(true)
  })

  test('should handle permission denied', async () => {
    // Mock permission denied
    global.Notification = { permission: 'denied' } as any
    
    const service = new NotificationService()
    const result = await service.notify(mockRecommendation)
    
    expect(result.sent).toBe(false)
    expect(result.reason).toBe('permission_denied')
  })
})
```

#### ✅ 覆盖异常处理分支

```typescript
describe('Error handling branches', () => {
  test('handles database connection failure', async () => {
    const mockDB = {
      getAll: vi.fn().mockRejectedValue(new Error('DB offline'))
    }
    
    const result = await service.fetchData(mockDB)
    
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/DB offline/)
  })

  test('handles invalid data format', async () => {
    const invalidData = { malformed: 'data' }
    
    const result = await service.process(invalidData)
    
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid format/)
  })
})
```

### 3. 多路径测试策略

#### ✅ 使用测试用例表格

```typescript
describe.each([
  // [输入, 预期输出, 描述]
  [null, false, 'null input'],
  [undefined, false, 'undefined input'],
  ['', false, 'empty string'],
  ['valid', true, 'valid input'],
  ['  spaces  ', true, 'trimmed input'],
])('Validator branches: %s', (input, expected, description) => {
  test(description, () => {
    expect(validator(input)).toBe(expected)
  })
})
```

#### ✅ 参数化测试

```typescript
const testCases = [
  { provider: 'openai', hasKey: true, expected: 'available' },
  { provider: 'openai', hasKey: false, expected: 'not_configured' },
  { provider: 'ollama', hasKey: false, expected: 'checking' },
  { provider: 'chrome-ai', hasKey: false, expected: 'checking' },
]

testCases.forEach(({ provider, hasKey, expected }) => {
  test(`${provider} with ${hasKey ? '' : 'no '}key -> ${expected}`, () => {
    const result = checkProviderStatus(provider, hasKey)
    expect(result.status).toBe(expected)
  })
})
```

## 📋 优先改进清单

### Week 1: P0 文件（目标：分支覆盖率 > 50%）

- [ ] `RecommendationView.tsx` (23.45% → 60%+)
  - [ ] 添加加载、空数据、错误状态测试
  - [ ] 添加推荐卡片交互测试（不想读、稍后读）
  - [ ] 添加翻译开关测试

- [ ] `AIConfig.tsx` (23.66% → 60%+)
  - [ ] 测试所有提供商切换分支（OpenAI、DeepSeek、Ollama）
  - [ ] 测试 API Key 验证分支
  - [ ] 测试连接测试成功/失败分支
  - [ ] 测试模型选择分支

- [ ] `RecommendationStats.tsx` (6.87% → 60%+)
  - [ ] 添加数据加载测试
  - [ ] 添加图表渲染测试
  - [ ] 添加空数据展示测试

### Week 2: P1 文件（目标：分支覆盖率 > 65%）

- [ ] `NotificationService.ts` (27.55% → 70%+)
  - [ ] 添加静默时段测试
  - [ ] 添加权限检查测试
  - [ ] 添加通知频率限制测试

- [ ] `pipeline.ts` (49.35% → 70%+)
  - [ ] 测试所有筛选阶段
  - [ ] 测试错误恢复分支
  - [ ] 测试空数据流分支

### Week 3: 其他低覆盖率文件

- [ ] `db/index.ts` (0% → 80%+)
- [ ] `i18n/language-backend.ts` (43.75% → 70%+)
- [ ] `OnboardingView.tsx` (39.2% → 65%+)

## 🛠️ 实用工具

### 1. 查看分支覆盖率详情

```bash
# 生成覆盖率报告
npm run test:coverage

# 在浏览器中查看详细报告
open coverage/lcov-report/index.html

# 查看特定文件的未覆盖分支
open coverage/lcov-report/src/components/RecommendationView.tsx.html
```

### 2. 识别未覆盖的分支

在覆盖率 HTML 报告中：
- 🟢 绿色高亮：已覆盖
- 🟡 黄色高亮：部分覆盖（if/else 只测了一个分支）
- 🔴 红色高亮：完全未覆盖

### 3. 运行特定文件测试

```bash
# 只运行特定文件的测试
npm test -- RecommendationView.test.tsx

# 查看该文件的覆盖率
npm run test:coverage -- RecommendationView.test.tsx
```

## 📈 监控进度

### 设置覆盖率阈值

在 `vitest.config.ts` 中：

```typescript
export default defineConfig({
  test: {
    coverage: {
      statements: 70,
      branches: 65,  // 当前目标
      functions: 70,
      lines: 70,
      
      // 下一阶段目标
      // branches: 70,
    }
  }
})
```

### CI/CD 集成

确保 `pre-push` 检查包含分支覆盖率：

```bash
# scripts/pre-push-check.sh
npm run test:coverage
# 如果分支覆盖率 < 65%，则失败
```

## 🎓 最佳实践

1. **优先测试业务关键路径**
   - 推荐生成逻辑
   - AI 配置与调用
   - 数据持久化

2. **使用覆盖率报告定位盲点**
   - 每周查看 HTML 报告
   - 专注于黄色/红色高亮区域

3. **编写可测试的代码**
   - 减少嵌套条件
   - 提取复杂逻辑到纯函数
   - 使用依赖注入便于 mock

4. **增量改进**
   - 每次 PR 至少提升 1% 分支覆盖率
   - 新代码必须有 70%+ 分支覆盖率

## 📚 参考资源

- [Vitest Coverage 文档](https://vitest.dev/guide/coverage.html)
- [React Testing Library - 条件渲染测试](https://testing-library.com/docs/react-testing-library/example-intro)
- [Testing JavaScript - Kent C. Dodds](https://testingjavascript.com/)
