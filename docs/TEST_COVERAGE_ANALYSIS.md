# 测试覆盖率分析与补充测试计划

**生成日期**: 2026-02-06  
**总体覆盖率**: 66.08% (语句) | 55.7% (分支) | 67.42% (行)  
**目标**: 关键业务逻辑覆盖率达到 80% 以上

## 一、覆盖率现状分析

### 1.1 关键模块覆盖率排序

| 排名 | 模块 | 覆盖率 | 优先级 | 现状 |
|------|------|--------|--------|------|
| 1 | 推荐服务 (RecommendationService) | 10.62% | 🔴 严重 | 极低 |
| 2 | 源分析服务 (SourceAnalysisService) | 45.78% | 🔴 严重 | 低 |
| 3 | 阅读清单管理器 (ReadingListManager) | 57.05% | 🟠 重要 | 中等 |
| 4 | 推荐系统 (core/recommender) | 56.13% | 🟠 重要 | 中等 |
| 5 | 建议面板组件 (ConfigPanel.tsx) | 22.78% | 🟠 重要 | 极低 |
| 6 | 阅读视图组件 (RecommendationView.tsx) | 25.42% | 🟠 重要 | 极低 |
| 7 | 数据库推荐模块 (db-recommendations.ts) | 50% | 🟡 中等 | 低 |
| 8 | 阅读清单追踪器 (score-tracker.ts) | 3.7% | 🟡 中等 | 极低 |

### 1.2 按模块分类的缺陷

#### 推荐系统核心 (56.13%)
**问题**:
- RecommendationService: 仅 10.62% 覆盖
- 缺少关键路径测试（生成、保存、冷启动逻辑）
- 缺少错误处理和降级测试

**影响范围**: 核心业务逻辑

#### 源分析 (45.78%)
**问题**:
- SourceAnalysisService 覆盖不足
- 缺少 AI 分析失败场景
- 缺少样本文章选择逻辑

**影响范围**: RSS 源质量评估

#### UI 组件 (22-43%)
**问题**:
- ConfigPanel: 22.78% - 设置面板交互测试缺失
- RecommendationView: 25.42% - 推荐列表展示逻辑缺失
- AssignmentPanel: 44.14% - 引擎分配界面测试缺失

**影响范围**: 用户交互体验

#### 数据库层 (52.75%)
**问题**:
- db-recommendations: 50% - 推荐数据持久化测试缺失
- db-feeds-stats: 51.37% - 统计数据操作测试缺失
- 缺少复杂查询的测试

**影响范围**: 数据一致性和持久化

---

## 二、急需补充的测试

### 优先级 1: 推荐服务 (🔴 严重)

**文件**: `src/core/recommender/RecommendationService.ts`  
**当前覆盖率**: 10.62%  
**目标**: 85%

**关键测试用例**:

```typescript
describe('RecommendationService', () => {
  // 1. 生成推荐流程
  it('应该生成推荐文章列表', async () => {
    // 测试完整的推荐生成流程
    // 验证文章评分、排序、去重
  })

  it('应该在冷启动阶段使用冷启动策略', async () => {
    // 测试冷启动判定条件
    // 验证使用 ColdStartScorer 而不是 AI
  })

  it('应该在学习阶段跳过推荐生成', async () => {
    // 测试学习阶段判定
    // 验证不生成推荐
  })

  it('应该正确处理 AI 分析失败情况', async () => {
    // 测试降级逻辑
    // 验证使用备选评分方法
  })

  it('应该正确保存推荐到数据库', async () => {
    // 测试持久化逻辑
    // 验证数据一致性
  })

  it('应该收集符合条件的文章', async () => {
    // 测试文章收集逻辑
    // 验证 poolStatus、inFeed 过滤
  })

  it('应该处理 sources 参数', async () => {
    // 测试 'subscribed' vs 'all' 模式
    // 验证不同数据源的文章选择
  })

  it('应该尊重用户画像', async () => {
    // 测试与用户兴趣的匹配
    // 验证相关度计算
  })
})
```

**需要 Mock 的依赖**:
- `aiManager.analyzeContent()`
- `db.feedArticles` 查询
- `getUserProfile()` 和 `getCurrentStrategy()`
- `RecommendationPipelineImpl`

---

### 优先级 2: 源分析服务 (🔴 严重)

**文件**: `src/core/rss/SourceAnalysisService.ts`  
**当前覆盖率**: 45.78%  
**目标**: 80%

**关键测试用例**:

```typescript
describe('SourceAnalysisService', () => {
  // 1. 源分析流程
  it('应该分析订阅源的质量', async () => {
    // 测试完整分析流程
    // 验证评分逻辑
  })

  it('应该缓存分析结果', async () => {
    // 测试缓存机制
    // 验证不重复分析
  })

  it('应该在缓存过期时重新分析', async () => {
    // 测试缓存过期判定
    // 验证触发新分析
  })

  it('应该处理 AI 调用失败', async () => {
    // 测试 AI 分析失败
    // 验证错误记录
  })

  it('应该正确选择样本文章', async () => {
    // 测试样本选择策略
    // 验证选择的文章数量和质量
  })

  it('应该格式化样本文章为提示词', async () => {
    // 测试文本格式化
    // 验证字符限制
  })

  it('应该在首次抓取时触发分析', async () => {
    // 测试 triggerOnFirstFetch
    // 验证异步执行
  })

  it('应该处理缺少文章的源', async () => {
    // 测试空源场景
    // 验证处理逻辑
  })
})
```

---

### 优先级 2: 阅读清单管理器 (🟠 重要)

**文件**: `src/core/reading-list/reading-list-manager.ts`  
**当前覆盖率**: 57.05%  
**目标**: 85%

**关键测试用例**:

```typescript
describe('ReadingListManager', () => {
  // 1. 文章添加
  it('应该将推荐文章添加到阅读清单', async () => {
    // 测试完整添加流程
    // 验证返回清单 ID
  })

  it('应该处理重复添加', async () => {
    // 测试去重逻辑
    // 验证不添加重复项
  })

  it('应该正确决定使用翻译标题', async () => {
    // 测试翻译决策逻辑
    // 验证源设置和翻译可用性
  })

  // 2. 模式切换
  it('应该在阅读清单模式下添加推荐', async () => {
    // 测试模式切换后的行为
    // 验证使用 ReadingListManager API
  })

  it('应该在弹窗模式下保存推荐', async () => {
    // 测试弹窗模式的推荐保存
    // 验证保存到 DB
  })

  // 3. URL 处理
  it('应该处理不同的 URL 格式', async () => {
    // 测试 URL 规范化
    // 验证规范化结果一致
  })

  it('应该处理缺失的 URL 参数', async () => {
    // 测试 URL 参数提取
    // 验证降级处理
  })

  // 4. 错误处理
  it('应该处理阅读清单 API 失败', async () => {
    // 测试 API 错误
    // 验证错误记录和恢复
  })

  it('应该处理网络错误', async () => {
    // 测试网络故障
    // 验证重试逻辑
  })
})
```

---

### 优先级 3: 数据库推荐模块 (🟡 中等)

**文件**: `src/storage/db/db-recommendations.ts`  
**当前覆盖率**: 50%  
**目标**: 85%

**关键测试用例**:

```typescript
describe('db-recommendations', () => {
  // 1. 推荐保存
  it('应该保存新推荐', async () => {
    // 测试插入逻辑
    // 验证字段完整性
  })

  it('应该更新已有推荐', async () => {
    // 测试更新逻辑
    // 验证不覆盖关键字段
  })

  // 2. 推荐查询
  it('应该查询活跃推荐', async () => {
    // 测试状态过滤
    // 验证排序和分页
  })

  it('应该查询用户反馈的推荐', async () => {
    // 测试反馈过滤
    // 验证统计结果
  })

  // 3. 批量操作
  it('应该批量标记为已读', async () => {
    // 测试批量更新
    // 验证影响行数
  })

  it('应该清理过期推荐', async () => {
    // 测试数据清理
    // 验证保留合理的记录数
  })

  // 4. 事务处理
  it('应该在事务中处理推荐保存', async () => {
    // 测试事务一致性
    // 验证失败时的回滚
  })
})
```

---

### 优先级 3: UI 组件测试 (🟡 中等)

**文件**: 
- `src/components/settings/ConfigPanel.tsx` (22.78%)
- `src/components/RecommendationView.tsx` (25.42%)
- `src/components/settings/AIAssignment.tsx` (44.14%)

**关键测试用例示例**:

```typescript
// ConfigPanel.tsx - 配置面板
describe('ConfigPanel', () => {
  it('应该正确显示当前配置', () => {
    // 测试渲染逻辑
  })

  it('应该处理配置变更', () => {
    // 测试用户交互
  })

  it('应该验证输入值', () => {
    // 测试表单验证
  })
})

// RecommendationView.tsx - 推荐视图
describe('RecommendationView', () => {
  it('应该显示推荐文章列表', () => {
    // 测试列表渲染
  })

  it('应该处理用户反馈', () => {
    // 测试反馈交互（收藏、不想看等）
  })

  it('应该支持文章标记为已读', () => {
    // 测试已读状态
  })

  it('应该处理列表为空的情况', () => {
    // 测试空状态 UI
  })
})
```

---

### 优先级 4: 阅读清单追踪器 (🟡 极低)

**文件**: `src/core/reading-list/score-tracker.ts`  
**当前覆盖率**: 3.7%  
**目标**: 70%

**关键测试用例**:

```typescript
describe('score-tracker', () => {
  it('应该追踪用户阅读行为', () => {
    // 测试行为记录
  })

  it('应该计算用户兴趣评分', () => {
    // 测试评分算法
  })

  it('应该处理多个阅读清单项', () => {
    // 测试批量处理
  })

  it('应该更新用户画像', () => {
    // 测试反馈机制
  })
})
```

---

## 三、补充测试的实施步骤

### 阶段 1: 基础设施准备 (第 1 天)

1. 创建 `src/core/recommender/RecommendationService.test.ts`
2. 创建通用 Mock 工厂函数 (Mock aiManager, db, 等)
3. 建立测试数据生成器

### 阶段 2: 核心业务逻辑测试 (第 2-3 天)

1. RecommendationService 测试 (目标: 85%)
2. SourceAnalysisService 测试 (目标: 80%)
3. ReadingListManager 测试 (目标: 85%)

### 阶段 3: 数据层和 UI 测试 (第 4-5 天)

1. db-recommendations 测试 (目标: 85%)
2. db-feeds-stats 测试 (目标: 80%)
3. 组件测试补充

### 阶段 4: 集成测试 (第 6 天)

1. 推荐系统端到端测试
2. 多模式（弹窗/清单）切换测试
3. 数据一致性测试

---

## 四、测试覆盖率目标

| 模块 | 当前 | 目标 | 难度 | 优先级 |
|------|------|------|------|--------|
| RecommendationService | 10.62% | 85% | 中 | 🔴 P1 |
| SourceAnalysisService | 45.78% | 80% | 中 | 🔴 P1 |
| ReadingListManager | 57.05% | 85% | 中 | 🟠 P2 |
| 推荐系统总体 | 56.13% | 80% | 高 | 🟠 P2 |
| 数据库层 | 52.75% | 80% | 中 | 🟡 P3 |
| UI 组件 | 30-40% | 70% | 低 | 🟡 P3 |

**预期结果**: 总体覆盖率从 66.08% 提升到 75-80%

---

## 五、测试质量检查清单

- [ ] 每个测试有清晰的 AAA 结构（Arrange-Act-Assert）
- [ ] 使用 Mock 隔离外部依赖
- [ ] 覆盖正常路径和错误路径
- [ ] 包含边界值测试
- [ ] 添加集成测试验证端到端流程
- [ ] 所有新测试通过 CI/CD 检查
- [ ] 测试执行时间不超过 60 秒

---

## 六、参考资源

- 当前覆盖率报告：`coverage/lcov-report/index.html`
- 推荐系统设计文档：`docs/RECOMMENDATION_SYSTEM_REDESIGN.md`
- 既有测试示例：`src/core/recommender/pipeline.test.ts`
- 测试工具配置：`vitest.config.ts`
