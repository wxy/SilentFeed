# Phase 5 Sprint 2: RSS 内容抓取与质量分析

## 📋 概述

**目标**: 实现 RSS 内容抓取、质量评估和相关性分析系统  
**预计时间**: 2-3 天  
**分支**: `feature/phase-5-sprint-2-fetcher`  
**前置条件**: Phase 5 Sprint 1 已完成并合并到 master

---

## 🎯 核心功能

### 1. RSS 抓取器 (RSSFetcher)
从网络获取 RSS/Atom 内容并解析成结构化数据

### 2. 质量分析器 (FeedQualityAnalyzer)
评估 RSS 源的质量（更新频率、内容完整度、格式规范性）

### 3. 相关性分析器 (FeedRelevanceAnalyzer)
使用 AI 分析文章内容与用户画像的匹配度

### 4. 后台任务调度 (可选)
定时检查候选源并执行分析

---

## 📁 文件结构

```
src/core/rss/
├── RSSFetcher.ts              # RSS 抓取器（新建）
├── RSSFetcher.test.ts         # 抓取器测试（新建）
├── FeedQualityAnalyzer.ts     # 质量分析器（新建）
├── FeedQualityAnalyzer.test.ts # 质量测试（新建）
├── FeedRelevanceAnalyzer.ts   # 相关性分析器（新建）
├── FeedRelevanceAnalyzer.test.ts # 相关性测试（新建）
└── managers/
    └── FeedManager.ts         # 更新：集成分析功能

src/background/
└── feed-scheduler.ts          # 后台调度器（新建，可选）

src/storage/
├── types.ts                   # 更新：添加文章类型定义
└── db.ts                      # 更新：可选添加 feedItems 表
```

---

## 🔧 技术设计

### 数据结构

#### FeedItem（RSS 文章）
```typescript
interface FeedItem {
  title: string
  link: string
  description?: string
  content?: string              // 完整内容（如果有）
  pubDate?: Date
  author?: string
  categories?: string[]
  guid?: string                 // 全局唯一标识符
}
```

#### FetchResult（抓取结果）
```typescript
interface FetchResult {
  success: boolean
  items: FeedItem[]
  feedInfo: {
    title: string
    description?: string
    link: string
    language?: string
    lastBuildDate?: Date
    updateFrequency?: number    // 计算得出的更新频率
  }
  error?: string
}
```

#### QualityScore（质量评分）
```typescript
interface QualityScore {
  overall: number               // 0-100 综合评分
  updateFrequency: number       // 更新频率分数
  contentCompleteness: number   // 内容完整度分数
  formatValidity: number        // 格式规范性分数
  reachability: number          // 可达性分数
  details: {
    articlesPerWeek: number     // 篇/周
    hasDescription: boolean
    hasContent: boolean
    validXML: boolean
    httpStatus: number
  }
}
```

#### RelevanceScore（相关性评分）
```typescript
interface RelevanceScore {
  overall: number               // 0-100 综合评分
  topicMatch: number            // 主题匹配度
  qualityWeight: number         // 质量加权后的分数
  matchedTopics: Array<{
    topic: string
    confidence: number
  }>
  sampleAnalysis: Array<{
    title: string
    matchScore: number
    topics: string[]
  }>
  recommendation: 'strong' | 'recommended' | 'maybe' | 'not-recommended'
}
```

---

## 💻 实现细节

### 任务 1: RSS 抓取器

**文件**: `src/core/rss/RSSFetcher.ts`

**核心方法**:
```typescript
class RSSFetcher {
  /**
   * 抓取 RSS/Atom 内容
   * @param url RSS 源 URL
   * @param options 抓取选项
   * @returns 抓取结果
   */
  async fetch(url: string, options?: FetchOptions): Promise<FetchResult>

  /**
   * 解析 RSS XML
   * @param xml RSS XML 内容
   * @param feedType 'rss' | 'atom'
   * @returns 文章列表
   */
  private parseRSS(xml: string, feedType: string): FeedItem[]

  /**
   * 解析 Atom XML
   */
  private parseAtom(xml: string): FeedItem[]

  /**
   * 计算更新频率
   * @param items 文章列表
   * @returns 篇/周
   */
  private calculateUpdateFrequency(items: FeedItem[]): number
}
```

**测试用例**:
1. ✅ 成功抓取 RSS 2.0 内容
2. ✅ 成功抓取 Atom 1.0 内容
3. ✅ 处理网络错误（超时、404、500）
4. ✅ 处理 XML 解析错误
5. ✅ 处理空内容
6. ✅ 提取完整的文章信息
7. ✅ 正确计算更新频率
8. ✅ 处理非标准日期格式
9. ✅ 处理 CDATA 内容
10. ✅ 处理特殊字符

**预计**: 15 个测试用例

---

### 任务 2: 质量分析器

**文件**: `src/core/rss/FeedQualityAnalyzer.ts`

**核心方法**:
```typescript
class FeedQualityAnalyzer {
  /**
   * 分析 RSS 源质量
   * @param fetchResult 抓取结果
   * @returns 质量评分
   */
  async analyze(fetchResult: FetchResult): Promise<QualityScore>

  /**
   * 评估更新频率（40%）
   */
  private evaluateUpdateFrequency(articlesPerWeek: number): number

  /**
   * 评估内容完整度（30%）
   */
  private evaluateContentCompleteness(items: FeedItem[]): number

  /**
   * 评估格式规范性（20%）
   */
  private evaluateFormatValidity(fetchResult: FetchResult): number

  /**
   * 评估可达性（10%）
   */
  private evaluateReachability(httpStatus: number): number
}
```

**评分算法**:
```
综合评分 = (
  更新频率得分 × 0.4 +
  内容完整度得分 × 0.3 +
  格式规范性得分 × 0.2 +
  可达性得分 × 0.1
)

更新频率得分:
- 每天更新（≥7 篇/周）: 100 分
- 频繁更新（3-6 篇/周）: 80 分
- 定期更新（1-2 篇/周）: 60 分
- 偶尔更新（<1 篇/周）: 40 分
- 长期未更新: 20 分

内容完整度得分:
- 有标题+描述+完整内容: 100 分
- 有标题+描述+链接: 80 分
- 有标题+链接: 60 分
- 仅有标题: 40 分

格式规范性得分:
- XML 格式完全正确: 100 分
- 有小错误但可解析: 80 分
- 有警告: 60 分
- 有严重问题: 40 分

可达性得分:
- HTTP 200: 100 分
- HTTP 301/302: 80 分
- HTTP 403/429: 60 分
- HTTP 404/500: 20 分
```

**测试用例**:
1. ✅ 高质量源评分（≥80 分）
2. ✅ 中等质量源评分（60-79 分）
3. ✅ 低质量源评分（<60 分）
4. ✅ 正确计算更新频率得分
5. ✅ 正确评估内容完整度
6. ✅ 正确评估格式规范性
7. ✅ 正确评估可达性
8. ✅ 边界条件（空内容、单篇文章）
9. ✅ 错误处理

**预计**: 12 个测试用例

---

### 任务 3: 相关性分析器

**文件**: `src/core/rss/FeedRelevanceAnalyzer.ts`

**核心方法**:
```typescript
class FeedRelevanceAnalyzer {
  constructor(private aiManager: AICapabilityManager)

  /**
   * 分析 RSS 源与用户画像的相关性
   * @param feedItems 文章列表（最新 3-5 篇）
   * @param userProfile 用户画像
   * @param qualityScore 质量评分
   * @returns 相关性评分
   */
  async analyze(
    feedItems: FeedItem[],
    userProfile: UserProfile,
    qualityScore: QualityScore
  ): Promise<RelevanceScore>

  /**
   * 使用 AI 分析单篇文章主题
   */
  private async analyzeArticleTopics(item: FeedItem): Promise<TopicDistribution>

  /**
   * 计算主题匹配度（余弦相似度）
   */
  private calculateTopicMatch(
    articleTopics: TopicDistribution,
    userTopics: TopicDistribution
  ): number

  /**
   * 计算加权评分
   */
  private calculateWeightedScore(
    topicMatch: number,
    qualityScore: number
  ): number

  /**
   * 生成推荐等级
   */
  private generateRecommendation(score: number): RelevanceScore['recommendation']
}
```

**分析流程**:
```
1. 获取最新 3-5 篇文章
2. 对每篇文章:
   a. 拼接标题 + 描述作为分析内容
   b. 调用 AI 分析主题概率分布
   c. 记录主题和置信度
3. 计算平均主题分布
4. 与用户画像主题分布计算余弦相似度
5. 加权计算: 最终得分 = 主题匹配度 × 质量评分 / 100
6. 生成推荐等级:
   - ≥ 70 分: strong（强烈推荐）
   - 60-69 分: recommended（推荐）
   - 50-59 分: maybe（可能感兴趣）
   - < 50 分: not-recommended（不推荐）
```

**测试用例**:
1. ✅ 高相关性源分析（≥70 分）
2. ✅ 中等相关性源分析（60-69 分）
3. ✅ 低相关性源分析（<60 分）
4. ✅ AI 分析主题成功
5. ✅ AI 分析失败降级（使用关键词）
6. ✅ 余弦相似度计算正确
7. ✅ 质量加权计算正确
8. ✅ 推荐等级正确
9. ✅ 边界条件（无用户画像、空文章）
10. ✅ Mock AI 响应

**预计**: 10 个测试用例

---

### 任务 4: 集成到 FeedManager

**文件**: `src/core/rss/managers/FeedManager.ts`

**新增方法**:
```typescript
class FeedManager {
  /**
   * 分析候选源质量和相关性
   * @param feedId 源 ID
   * @returns 分析结果
   */
  async analyzeFeed(feedId: string): Promise<{
    quality: QualityScore
    relevance: RelevanceScore
  }>

  /**
   * 批量分析候选源
   */
  async analyzeCandidates(limit: number = 5): Promise<void>

  /**
   * 更新源的质量和相关性数据
   */
  async updateAnalysis(
    feedId: string,
    quality: QualityScore,
    relevance: RelevanceScore
  ): Promise<void>
}
```

**流程**:
```
1. 从数据库获取 status = 'candidate' 的源
2. 对每个候选源:
   a. 使用 RSSFetcher 抓取内容
   b. 使用 FeedQualityAnalyzer 评估质量
   c. 如果质量 ≥ 60 分:
      - 使用 FeedRelevanceAnalyzer 分析相关性
      - 如果相关性 ≥ 60 分:
        * 更新 status = 'recommended'
        * 保存 quality 和 relevance 数据
      - 否则:
        * 保持 status = 'candidate'
   d. 如果质量 < 60 分:
      - 更新 status = 'ignored'（质量太低）
3. 批量更新数据库
```

---

### 任务 5: Background 集成（可选）

**文件**: `src/background/feed-scheduler.ts`

**功能**:
- 定时检查候选源（每 24 小时）
- 智能调度（避免同时分析太多源）
- 错误重试机制

**核心方法**:
```typescript
class FeedScheduler {
  /**
   * 启动定时任务
   */
  start(): void

  /**
   * 检查并分析候选源
   */
  private async checkCandidates(): Promise<void>

  /**
   * 智能调度（限流）
   */
  private async scheduleAnalysis(feeds: DiscoveredFeed[]): Promise<void>
}
```

---

## ✅ 验收标准

### 功能完整性
- [ ] RSSFetcher 可以抓取 RSS 和 Atom 内容
- [ ] FeedQualityAnalyzer 正确评估质量
- [ ] FeedRelevanceAnalyzer 正确分析相关性
- [ ] FeedManager 集成分析功能
- [ ] 候选源自动升级为推荐源

### 测试覆盖
- [ ] 新增测试 ≥ 35 个
- [ ] 所有测试通过（565 → 600+）
- [ ] 覆盖率 ≥ 70%

### 代码质量
- [ ] TypeScript 严格模式通过
- [ ] 无 ESLint 错误
- [ ] 代码注释完整
- [ ] 遵循项目规范

### 浏览器测试
- [ ] 可以成功抓取真实 RSS 源
- [ ] 质量评分合理
- [ ] 相关性评分准确
- [ ] 性能可接受（单个源分析 < 5 秒）

---

## 📅 开发计划

### Day 1: RSS 抓取器
**时间**: 4-5 小时

**上午**（2-3 小时）:
1. 创建 `RSSFetcher.ts` 基础结构
2. 实现 `fetch()` 方法
3. 实现 RSS 2.0 解析
4. 实现 Atom 1.0 解析

**下午**（2 小时）:
1. 编写测试用例（15 个）
2. 修复 bug
3. 浏览器实测
4. 提交代码

**交付物**:
- ✅ `RSSFetcher.ts` 和测试
- ✅ 15 个测试通过
- ✅ 可以抓取真实 RSS 源

---

### Day 2: 质量分析器
**时间**: 3-4 小时

**上午**（2 小时）:
1. 创建 `FeedQualityAnalyzer.ts`
2. 实现评分算法
3. 实现各项指标计算

**下午**（1-2 小时）:
1. 编写测试用例（12 个）
2. 调优评分算法
3. 提交代码

**交付物**:
- ✅ `FeedQualityAnalyzer.ts` 和测试
- ✅ 12 个测试通过
- ✅ 评分算法合理

---

### Day 3: 相关性分析器 + 集成
**时间**: 4-5 小时

**上午**（2-3 小时）:
1. 创建 `FeedRelevanceAnalyzer.ts`
2. 集成 AI 分析能力
3. 实现匹配度计算
4. 编写测试用例（10 个）

**下午**（2 小时）:
1. 更新 `FeedManager.ts`
2. 实现批量分析功能
3. Background 集成测试
4. 浏览器完整测试
5. 提交代码

**交付物**:
- ✅ `FeedRelevanceAnalyzer.ts` 和测试
- ✅ FeedManager 集成完成
- ✅ 所有测试通过
- ✅ 浏览器实测通过

---

## 🧪 测试策略

### 单元测试
- RSSFetcher: 15 个测试
- FeedQualityAnalyzer: 12 个测试
- FeedRelevanceAnalyzer: 10 个测试
- 总计: 37 个新测试

### 集成测试
- FeedManager 与分析器集成
- Background 调度测试

### 浏览器测试
1. 选择 5 个真实 RSS 源（不同质量）
2. 手动添加到扩展
3. 观察分析结果
4. 验证评分合理性

**测试源示例**:
- 高质量: TechCrunch, Hacker News
- 中等质量: 个人博客
- 低质量: 长期未更新的源

---

## 📝 开发备注

### 技术难点
1. **RSS 格式多样性**: 需要兼容各种非标准 RSS
2. **网络错误处理**: 超时、重试、限流
3. **AI 调用成本**: 每个源分析需要 3-5 次 AI 调用
4. **性能优化**: 批量处理、缓存机制

### 优化建议
1. 缓存 AI 分析结果（避免重复分析）
2. 限制并发分析数量（避免 API 限流）
3. 增量分析（只分析新文章）
4. 后台任务调度（避免阻塞用户）

### 降级策略
1. AI 不可用时使用关键词分析
2. 网络错误时标记为待重试
3. 质量太低直接忽略（不分析相关性）

---

## 🎯 完成后效果

### 用户体验
- 候选源自动评估质量
- 高质量且相关的源自动推荐
- 低质量源自动过滤
- 减少用户手动筛选工作

### 数据流转
```
用户浏览页面
  ↓
RSS 检测器发现源
  ↓
添加到候选列表
  ↓
后台定时分析
  ↓
质量评估 ≥ 60 分
  ↓
相关性分析 ≥ 60 分
  ↓
升级为推荐源
  ↓
在 UI 中显示推荐
```

### 下一步
完成 Sprint 2 后，进入 **Sprint 3: UI 增强与自动化**，在界面中显示质量评分和相关性信息，完善用户体验。
