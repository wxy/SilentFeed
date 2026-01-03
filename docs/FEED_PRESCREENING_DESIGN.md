# Feed XML 初筛设计方案

## 背景

当前系统对每篇RSS文章都进行完整的AI分析，这会导致：
- AI调用次数过多，成本高
- 处理时间长
- 大量无关文章也被分析

## 优化思路

在Feed抓取后，先用AI对整个XML进行批量初筛，挑选出值得详细分析的文章，再对这些文章进行逐篇AI分析。

## 设计方案

### 1. 初筛流程

```
RSS抓取 → XML初筛（AI批量评估） → 筛选通过的文章 → 逐篇详细分析
```

### 2. XML预处理

**问题**：
- 有些XML只包含标题+摘要（小）
- 有些XML包含全文（大，可能超过API限制）

**解决方案**：
- 检测XML大小，如果超过阈值则截断content字段
- 保留标题、摘要、链接等关键元数据
- 定义最大输入大小（考虑API限制和超时）

### 3. 提示词设计

**新增提示词类型**：`feedPreScreening`

**任务类型**：低频任务（与用户画像生成、订阅源分析同级）

**输入**：
- Feed基本信息（标题、描述）
- 文章列表（标题、摘要、发布时间等）
- 用户画像（如果存在）

**输出**：
```json
{
  "selectedArticleLinks": ["link1", "link2", ...],
  "reason": "简短说明筛选逻辑"
}
```

### 4. 核心服务

**FeedPreScreeningService**：
- 接收FetchResult和用户画像
- 预处理XML内容（截断、压缩）
- 调用AI进行批量初筛
- 返回值得详细分析的文章链接列表

### 5. 集成点

修改 `fetchFeed()` 流程：

```typescript
// 1. 抓取RSS
const result = await fetcher.fetch(feed.url)

// 2. AI初筛（新增）
const preScreening = await preScreeningService.screen(result, userProfile)

// 3. 只对初筛通过的文章进行详细分析
const articlesToAnalyze = newArticles.filter(a => 
  preScreening.selectedArticleLinks.includes(a.link)
)
```

### 6. 内容截断策略

```typescript
// 最大输入大小配置
const MAX_INPUT_SIZE = {
  tokens: 32000,          // API token限制（预留空间）
  bytes: 100 * 1024,      // 100KB（字节）
  articlesCount: 50       // 单次最多处理50篇文章
}

// 截断逻辑
function truncateArticleContent(item: FeedItem): PreScreeningItem {
  return {
    title: item.title,
    link: item.link,
    description: item.description?.substring(0, 500), // 摘要最多500字符
    // content字段不包含在初筛中（太大）
    pubDate: item.pubDate
  }
}
```

### 7. 大小检查

```typescript
// 检查总大小
function checkTotalSize(items: PreScreeningItem[]): {
  ok: boolean
  estimatedTokens: number
  estimatedBytes: number
} {
  const json = JSON.stringify(items)
  const bytes = new TextEncoder().encode(json).length
  const estimatedTokens = Math.ceil(bytes / 4) // 粗略估算：1 token ≈ 4 bytes
  
  return {
    ok: estimatedTokens < MAX_INPUT_SIZE.tokens && bytes < MAX_INPUT_SIZE.bytes,
    estimatedTokens,
    estimatedBytes: bytes
  }
}
```

### 8. 超时处理

```typescript
// 初筛超时配置（低频任务可以较长）
const PRESCREENING_TIMEOUT = 30000 // 30秒

// 使用AbortController
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), PRESCREENING_TIMEOUT)

try {
  const result = await aiManager.call(prompt, { signal: controller.signal })
} finally {
  clearTimeout(timeoutId)
}
```

### 9. 回退策略

如果初筛失败（超时、错误、API不可用）：
- 回退到全部文章都进行详细分析（保证功能完整性）
- 记录错误日志
- 不影响用户体验

### 10. 性能预期

**假设场景**：
- 单个Feed平均20篇文章
- 每次抓取10个Feed = 200篇文章

**优化前**：
- 200次AI调用（逐篇分析）
- 成本：200 × 单价
- 时间：200 × 平均延迟

**优化后**：
- 10次初筛调用（每Feed 1次）
- 假设筛选出40篇文章（20%通过率）
- 40次详细分析调用
- 总计：10 + 40 = 50次AI调用
- **成本降低75%**
- **时间大幅缩短**

## 实现步骤

1. ✅ 扩展提示词类型（feedPreScreening）
2. ✅ 实现预处理工具（截断、大小检查）
3. ✅ 创建FeedPreScreeningService
4. ✅ 集成到fetchFeed流程
5. ✅ 添加测试用例
6. ✅ 更新文档

## 注意事项

- 初筛应该**宽松**，宁可多选不要漏选（假阳性>假阴性）
- 用户画像缺失时也能工作（通用筛选规则）
- 支持配置开关（允许用户禁用初筛）
- 记录初筛统计（通过率、耗时等）

---

## 实施状态

**✅ 已完成** (2026-01-10)

### 实现文件
- `src/core/rss/FeedPreScreeningService.ts` - 初筛服务主类 (273行)
- `src/core/rss/FeedPreScreeningService.test.ts` - 单元测试 (22个测试用例, 93.33%覆盖率)
- `src/core/ai/prompts/types.ts` - 扩展类型定义
- `src/core/ai/prompts/templates/zh-CN.json` - 中文提示词模板
- `src/core/ai/prompts/templates/en.json` - 英文提示词模板
- `src/core/ai/prompts/index.ts` - 提示词管理器扩展
- `src/background/feed-scheduler.ts` - 集成到Feed抓取流程

### 关键特性
- ✅ 输入大小检测 (32K tokens, 100KB bytes)
- ✅ 文章预处理 (截断描述, 限制数量)
- ✅ AI调用配置 (使用lowFrequencyTasks引擎分配)
- ✅ 超时处理 (使用AI Provider配置的超时, 推理模式2-3x标准超时)
- ✅ 响应解析 (支持markdown代码块, JSON格式)
- ✅ 结果验证 (筛选率10%-90%检查)
- ✅ 错误恢复 (失败时回退到全量分析)
- ✅ 用户画像支持 (个性化初筛)

### 测试覆盖
- **单元测试**: 22个测试用例全部通过
- **代码覆盖率**: 93.33% (lines), 78.04% (branches), 100% (functions)
- **集成测试**: 通过全局1920个测试, 无回归问题
- **测试场景**:
  - 小于5篇文章跳过初筛 ✓
  - 10篇文章成功初筛 ✓
  - 用户画像支持 ✓
  - Markdown代码块解析 ✓
  - AI调用失败处理 ✓
  - 无效JSON处理 ✓
  - 筛选率验证 ✓

### 性能指标 (预期)
- **API调用减少**: ~75% (200次 → 50次)
- **成本节省**: ~75% ($0.02 → $0.005 per feed)
- **筛选率**: 30-80% (根据feed大小动态调整)
- **失败回退**: 0% 用户影响 (透明降级)

### 部署说明
1. 功能已集成到`feed-scheduler.ts`的fetchFeed流程
2. 在步骤1.5 (RSS抓取后, 文章转换前) 执行初筛
3. 初筛失败时自动回退到全量分析
4. 开发模式下打印初筛统计日志
5. 无需配置开关, 自动对≥5篇文章的Feed启用

### 下一步计划
- [ ] 收集生产环境筛选率数据
- [ ] 监控假阴性率 (漏选相关文章的比例)
- [ ] 根据反馈调整筛选提示词
- [ ] 考虑添加手动配置开关
- [ ] A/B测试不同筛选策略
