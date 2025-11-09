# Phase 5: RSS 自动发现与智能订阅 - 详细设计文档

**状态**: 🚧 进行中  
**版本**: v0.5.0  
**预计时间**: 6-8 天  
**开始日期**: 2025-01-09  

---

## 目录
- [产品定位](#产品定位)
- [技术方案](#技术方案)
- [数据模型](#数据模型)
- [实现计划](#实现计划)
- [测试策略](#测试策略)

---

## 产品定位

### 核心理念：克制的智能助手

FeedAIMuter 是一个**静音器（Muter）**，不是主动信息推送工具。RSS 功能应该遵循这一理念：

- **不主动打扰**：自动发现在后台进行，不弹窗不通知
- **用户掌控**：订阅决策完全由用户做出
- **质量优先**：只推荐高质量、高相关性的源
- **隐私保护**：所有分析在本地进行

### 三层架构

```
┌────────────────────────────────────────────────┐
│ 第一层：自动发现（静默）                       │
├────────────────────────────────────────────────┤
│ 用户浏览网页 → 检测 RSS 链接                   │
│             → 添加到候选池                     │
│             → 后台试探性抓取                   │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 第二层：智能筛选                               │
├────────────────────────────────────────────────┤
│ 候选源 → 质量检查（更新频率、格式规范）       │
│        → 相关性分析（AI 匹配用户画像）        │
│        → 晋升为推荐源                          │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│ 第三层：用户决策                               │
├────────────────────────────────────────────────┤
│ 推荐源 → 非侵入式提示（Popup 卡片）           │
│        → 用户查看预览                          │
│        → 用户选择：订阅/忽略/稍后              │
└────────────────────────────────────────────────┘
```

### RSS 来源策略

#### 优先级排序

| 优先级 | 来源 | 特点 | 实现阶段 |
|--------|------|------|----------|
| 1️⃣ 最高 | 手动添加 | 用户明确意图，100% 信任 | Sprint 3 |
| 2️⃣ 高 | OPML 导入 | 批量导入已有订阅 | Sprint 3 |
| 3️⃣ 中 | 浏览页面发现 | 被动发现，隐私安全 | Sprint 1 |
| 4️⃣ 低（可选）| AI 主动推荐 | 需要用户明确授权 | Phase 6 |

#### 为什么选择被动发现？

**优势**：
- ✅ **隐私友好**：不需要主动搜索，不暴露用户兴趣
- ✅ **自然流畅**：用户已经在看这个网站，说明有兴趣
- ✅ **质量可控**：只从用户浏览的网站发现，不会推荐垃圾源
- ✅ **技术简单**：不需要复杂的爬虫和搜索引擎

**限制**：
- ⚠️ 发现速度慢：取决于用户浏览行为
- ⚠️ 覆盖面窄：只能发现用户已访问的网站
- ⚠️ 冷启动问题：新用户需要时间积累

**解决方案**：
- 提供手动添加和 OPML 导入功能
- 后续可以提供 "发现类似源" 功能（需要用户授权）

---

## 技术方案

### 数据模型

#### DiscoveredFeed（发现的源）

```typescript
interface DiscoveredFeed {
  // 基本信息
  id: string                    // UUID
  url: string                   // RSS 源 URL
  title: string                 // 源标题
  description?: string          // 源描述
  link?: string                 // 源网站 URL
  
  // 发现信息
  discoveredFrom: string        // 发现来源页面 URL
  discoveredAt: number          // 发现时间戳
  
  // 状态管理
  status: FeedStatus            // 源状态
  
  // 质量评估（后台填充）
  quality?: FeedQuality
  
  // 相关性分析（后台填充）
  relevance?: FeedRelevance
  
  // 订阅信息
  subscribedAt?: number         // 订阅时间
  enabled: boolean              // 是否启用（可以暂停订阅源）
  
  // 更新信息
  lastFetched?: number          // 最后抓取时间
  lastError?: string            // 最后错误信息
}

type FeedStatus = 
  | 'candidate'     // 候选源（刚发现，等待评估）
  | 'recommended'   // 推荐源（评估通过，等待用户决策）
  | 'subscribed'    // 已订阅
  | 'ignored'       // 已忽略

interface FeedQuality {
  updateFrequency: number       // 更新频率（篇/周）
  formatValid: boolean          // 格式是否规范
  reachable: boolean            // 是否可达
  score: number                 // 质量评分 (0-100)
  lastChecked: number           // 最后检查时间
}

interface FeedRelevance {
  matchScore: number            // 匹配分数 (0-100)
  matchedTopics: Topic[]        // 匹配的主题
  sampleArticles: {             // 样本文章
    title: string
    matchScore: number
  }[]
  analyzedAt: number            // 分析时间
}
```

#### FeedArticle（文章）

```typescript
interface FeedArticle {
  id: string                    // UUID
  feedId: string                // 所属 RSS 源 ID
  
  // 文章信息
  title: string
  link: string
  description?: string
  content?: string
  author?: string
  
  // 时间信息
  published: number             // 发布时间
  fetched: number               // 抓取时间
  
  // AI 分析结果
  analysis?: UnifiedAnalysisResult
  
  // 用户行为
  read: boolean                 // 是否已读
  starred: boolean              // 是否收藏
}
```

### 架构设计

#### 模块划分

```
src/core/rss/
├── detectors/
│   ├── RSSDetector.ts          # RSS 链接检测器
│   └── RSSValidator.ts         # RSS 格式验证器
├── fetchers/
│   ├── RSSFetcher.ts           # RSS 内容抓取器
│   └── RSSParser.ts            # RSS 解析器
├── analyzers/
│   ├── FeedQualityAnalyzer.ts  # 质量分析器
│   └── FeedRelevanceAnalyzer.ts # 相关性分析器
├── managers/
│   ├── FeedManager.ts          # RSS 源管理器
│   └── ArticleManager.ts       # 文章管理器
└── types.ts                    # 类型定义

src/background/
└── feed-scheduler.ts           # 后台调度器

src/contents/
└── rss-detector.ts             # Content Script（页面检测）

src/components/settings/
└── RSSManager.tsx              # RSS 管理 UI

src/storage/
├── db.ts                       # 新增 discoveredFeeds, feedArticles 表
└── types.ts                    # 新增类型
```

---

## 实现计划

### Sprint 1: RSS 检测基础（2天）📡

#### 目标
建立 RSS 检测和验证的基础设施。

#### 任务清单

##### 1.1 RSS 检测器（0.5天）
**文件**: `src/contents/rss-detector.ts`

**功能**:
```typescript
// Content Script，在用户浏览页面时运行
class RSSDetector {
  // 检测 <link> 标签
  detectFromLinkTags(): RSSLink[]
  
  // 检测常见 URL 模式
  detectFromCommonPaths(): string[]
  
  // 发送到 background
  sendToBackground(links: RSSLink[]): void
}
```

**检测策略**:
1. 优先检测 `<link rel="alternate">` 标签：
   ```html
   <link rel="alternate" type="application/rss+xml" href="/feed" title="RSS Feed">
   <link rel="alternate" type="application/atom+xml" href="/atom" title="Atom Feed">
   ```

2. 尝试常见路径：
   - `/feed`, `/feed.xml`
   - `/rss`, `/rss.xml`
   - `/atom.xml`
   - `/index.xml`
   - 域名根目录: `feed.xml`, `rss.xml`

3. 发送到 background 进行验证：
   ```typescript
   chrome.runtime.sendMessage({
     type: 'RSS_DETECTED',
     payload: {
       url: feedUrl,
       discoveredFrom: window.location.href,
       title: feedTitle
     }
   })
   ```

**验收标准**:
- [ ] 能检测到标准 `<link>` 标签
- [ ] 能尝试常见 URL 模式
- [ ] 发送消息到 background
- [ ] 不影响页面性能
- [ ] 有完整测试覆盖

---

##### 1.2 RSS 验证器（0.5天）
**文件**: `src/core/rss/detectors/RSSValidator.ts`

**功能**:
```typescript
class RSSValidator {
  // 验证 URL 是否返回有效的 RSS
  async validate(url: string): Promise<ValidationResult>
  
  // 检查 XML 格式
  isValidRSS(xml: string): boolean
  isValidAtom(xml: string): boolean
  
  // 提取基本信息
  extractMetadata(xml: string): FeedMetadata
}

interface ValidationResult {
  valid: boolean
  type: 'rss' | 'atom' | null
  metadata?: FeedMetadata
  error?: string
}

interface FeedMetadata {
  title: string
  description: string
  link: string
}
```

**实现细节**:
1. 使用 `fetch()` 抓取 URL
2. 检查 Content-Type（application/rss+xml, application/atom+xml, text/xml）
3. 解析 XML（使用 `DOMParser`）
4. 验证必需字段：
   - RSS: `<channel><title>`, `<item>`
   - Atom: `<feed><title>`, `<entry>`

**验收标准**:
- [ ] 验证 RSS 2.0 格式
- [ ] 验证 Atom 1.0 格式
- [ ] 提取标题、描述、链接
- [ ] 处理网络错误
- [ ] 处理格式错误
- [ ] 有测试覆盖（mock fetch）

---

##### 1.3 数据库表设计（0.5天）
**文件**: `src/storage/db.ts`, `src/storage/types.ts`

**功能**:
```typescript
// types.ts
export interface DiscoveredFeed {
  // ... (见数据模型部分)
}

// db.ts
class FeedAIMuterDB extends Dexie {
  discoveredFeeds!: Table<DiscoveredFeed>
  feedArticles!: Table<FeedArticle>
  
  constructor() {
    // ...
    this.version(4).stores({
      // ... existing tables
      discoveredFeeds: 'id, url, status, discoveredAt, subscribedAt',
      feedArticles: 'id, feedId, published, read, starred'
    })
  }
}
```

**索引策略**:
- `discoveredFeeds`: 按状态、发现时间、订阅时间查询
- `feedArticles`: 按源 ID、发布时间、阅读状态查询

**验收标准**:
- [ ] 数据表创建成功
- [ ] 类型定义完整
- [ ] 索引设置合理
- [ ] CRUD 操作正常

---

##### 1.4 FeedManager（0.5天）
**文件**: `src/core/rss/managers/FeedManager.ts`

**功能**:
```typescript
class FeedManager {
  // 添加候选源
  async addCandidate(feed: DiscoveredFeed): Promise<void>
  
  // 获取源列表
  async getFeeds(status?: FeedStatus): Promise<DiscoveredFeed[]>
  
  // 更新源状态
  async updateStatus(id: string, status: FeedStatus): Promise<void>
  
  // 订阅源
  async subscribe(id: string): Promise<void>
  
  // 取消订阅
  async unsubscribe(id: string): Promise<void>
  
  // 忽略源
  async ignore(id: string): Promise<void>
}
```

**验收标准**:
- [ ] 所有方法正常工作
- [ ] 数据持久化正确
- [ ] 状态转换合法
- [ ] 有测试覆盖

---

### Sprint 2: 内容抓取与分析（2天）📥

#### 目标
抓取 RSS 内容，进行质量和相关性分析。

#### 任务清单

##### 2.1 RSS 抓取器（0.5天）
**文件**: `src/core/rss/fetchers/RSSFetcher.ts`

**功能**:
```typescript
class RSSFetcher {
  // 抓取 RSS 内容
  async fetch(url: string): Promise<RSSContent>
  
  // 自动重试
  private async fetchWithRetry(url: string, retries: number): Promise<Response>
}

interface RSSContent {
  raw: string           // 原始 XML
  metadata: FeedMetadata
  articles: RSSArticle[]
}
```

**实现细节**:
- 使用 `fetch()` API
- 设置超时（10 秒）
- 自动重试（最多 3 次）
- 处理 HTTP 错误

**验收标准**:
- [ ] 成功抓取 RSS 内容
- [ ] 超时处理正常
- [ ] 重试机制工作
- [ ] 错误处理完善
- [ ] 有测试覆盖（mock fetch）

---

##### 2.2 RSS 解析器（0.5天）
**文件**: `src/core/rss/fetchers/RSSParser.ts`

**功能**:
```typescript
class RSSParser {
  // 解析 RSS 2.0
  parseRSS(xml: string): RSSContent
  
  // 解析 Atom 1.0
  parseAtom(xml: string): RSSContent
  
  // 提取文章列表
  private extractArticles(doc: Document): RSSArticle[]
}

interface RSSArticle {
  title: string
  link: string
  description?: string
  content?: string
  author?: string
  published: number
}
```

**实现细节**:
- 使用 `DOMParser` 解析 XML
- 处理 RSS 和 Atom 两种格式
- 提取最新 10 篇文章
- 处理不规范的 XML

**验收标准**:
- [ ] 正确解析 RSS 2.0
- [ ] 正确解析 Atom 1.0
- [ ] 提取文章列表
- [ ] 处理不规范格式
- [ ] 有测试覆盖

---

##### 2.3 质量分析器（0.5天）
**文件**: `src/core/rss/analyzers/FeedQualityAnalyzer.ts`

**功能**:
```typescript
class FeedQualityAnalyzer {
  // 分析源质量
  async analyze(feed: DiscoveredFeed, articles: RSSArticle[]): Promise<FeedQuality>
  
  // 计算更新频率
  private calculateUpdateFrequency(articles: RSSArticle[]): number
  
  // 检查格式规范
  private checkFormat(articles: RSSArticle[]): boolean
  
  // 计算质量分数
  private calculateScore(quality: FeedQuality): number
}
```

**评估指标**:
1. **更新频率**（40%权重）：
   - 计算最近 10 篇文章的发布时间间隔
   - 换算为 篇/周
   - 评分：≥7篇/周 = 100分，≥3篇/周 = 60分，<1篇/周 = 20分

2. **格式规范**（30%权重）：
   - 必需字段完整（title, link）
   - 发布时间有效
   - 描述或内容存在
   - 评分：全部满足 = 100分，缺失字段 -20分/项

3. **可达性**（30%权重）：
   - HTTP 状态码 200
   - 响应时间 < 10秒
   - 评分：正常 = 100分，慢 = 60分，不可达 = 0分

**综合评分**:
```typescript
score = updateFrequency * 0.4 + format * 0.3 + reachability * 0.3
```

**验收标准**:
- [ ] 正确计算更新频率
- [ ] 正确检查格式规范
- [ ] 正确评估可达性
- [ ] 综合评分合理
- [ ] 有测试覆盖

---

##### 2.4 相关性分析器（0.5天）
**文件**: `src/core/rss/analyzers/FeedRelevanceAnalyzer.ts`

**功能**:
```typescript
class FeedRelevanceAnalyzer {
  constructor(
    private aiCapability: AICapabilityManager,
    private profileBuilder: ProfileBuilder
  ) {}
  
  // 分析源相关性
  async analyze(articles: RSSArticle[]): Promise<FeedRelevance>
  
  // 分析单篇文章
  private async analyzeArticle(article: RSSArticle): Promise<UnifiedAnalysisResult>
  
  // 计算与用户画像的匹配度
  private calculateMatch(
    articleAnalysis: UnifiedAnalysisResult[],
    userProfile: UserProfile
  ): number
}
```

**算法流程**:
1. 选择最新 3-5 篇文章
2. 使用 AI 分析每篇文章的主题概率
3. 计算每篇文章与用户画像的余弦相似度
4. 平均相似度 × 质量分数 = 最终匹配分数

**匹配公式**:
```typescript
// 余弦相似度
function cosineSimilarity(a: TopicProbabilities, b: TopicProbabilities): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (const topic of ALL_TOPICS) {
    dotProduct += (a[topic] || 0) * (b[topic] || 0)
    normA += (a[topic] || 0) ** 2
    normB += (b[topic] || 0) ** 2
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// 综合分数
matchScore = averageCosineSimilarity * qualityScore
```

**推荐阈值**:
- `matchScore ≥ 60`: 推荐订阅
- `matchScore < 60`: 保留为候选源，不推荐

**验收标准**:
- [ ] AI 分析文章内容
- [ ] 正确计算余弦相似度
- [ ] 综合评分合理
- [ ] 推荐阈值有效
- [ ] 有测试覆盖

---

### Sprint 3: 订阅管理 UI（2天）🎨

#### 目标
完成 RSS 管理界面，支持手动添加、OPML 导入/导出、订阅管理。

#### 任务清单

##### 3.1 RSS 管理页面（1天）
**文件**: `src/components/settings/RSSManager.tsx`

**功能**:
- 设置页新增 "RSS 源" 标签
- 三个列表：已订阅、推荐订阅、候选源
- 订阅操作：订阅、取消订阅、忽略、稍后
- 源管理：启用/暂停、删除

**UI 设计**:
```tsx
<div className="rss-manager">
  {/* 已订阅源 */}
  <section className="subscribed-feeds">
    <h2>已订阅源 ({subscribedCount})</h2>
    <FeedList
      feeds={subscribedFeeds}
      actions={['pause', 'resume', 'unsubscribe', 'delete']}
    />
  </section>
  
  {/* 推荐订阅 */}
  <section className="recommended-feeds">
    <h2>发现的源 ({recommendedCount}) - 推荐订阅</h2>
    <FeedList
      feeds={recommendedFeeds}
      showMatchScore
      showPreview
      actions={['subscribe', 'ignore', 'later']}
    />
  </section>
  
  {/* 候选源 */}
  <section className="candidate-feeds">
    <h2>候选源 ({candidateCount}) - 正在评估</h2>
    <FeedList
      feeds={candidateFeeds}
      showStatus
    />
  </section>
</div>
```

**FeedList 组件**:
```tsx
<div className="feed-item">
  <div className="feed-info">
    <h3>{feed.title}</h3>
    <p>{feed.description}</p>
    <div className="feed-meta">
      <span>{feed.quality?.updateFrequency} 篇/周</span>
      {showMatchScore && (
        <span className="match-score">{feed.relevance?.matchScore}% 匹配</span>
      )}
    </div>
  </div>
  
  <div className="feed-actions">
    {actions.map(action => (
      <button onClick={() => handleAction(feed.id, action)}>
        {actionLabels[action]}
      </button>
    ))}
  </div>
  
  {showPreview && (
    <FeedPreview feedId={feed.id} />
  )}
</div>
```

**验收标准**:
- [ ] 三个列表正常显示
- [ ] 订阅/取消订阅操作正常
- [ ] 源状态切换（启用/暂停）
- [ ] 删除源操作正常
- [ ] 响应式设计
- [ ] 有测试覆盖

---

##### 3.2 手动添加与 OPML（0.5天）
**文件**: `src/components/settings/RSSManager.tsx`

**功能**:
```tsx
// 手动添加
<div className="manual-add">
  <input
    type="url"
    placeholder="输入 RSS URL"
    value={inputUrl}
    onChange={(e) => setInputUrl(e.target.value)}
  />
  <button onClick={handleManualAdd}>添加</button>
</div>

// OPML 导入/导出
<div className="opml-tools">
  <button onClick={handleImportOPML}>导入 OPML</button>
  <button onClick={handleExportOPML}>导出 OPML</button>
</div>
```

**OPML 格式**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>FeedAIMuter Subscriptions</title>
  </head>
  <body>
    <outline
      type="rss"
      text="TechCrunch"
      title="TechCrunch"
      xmlUrl="https://techcrunch.com/feed/"
      htmlUrl="https://techcrunch.com/"
    />
  </body>
</opml>
```

**验收标准**:
- [ ] 手动添加 URL 功能正常
- [ ] URL 格式验证
- [ ] OPML 导入成功
- [ ] OPML 导出成功
- [ ] 错误处理完善
- [ ] 有测试覆盖

---

##### 3.3 Popup 推荐提示（0.5天）
**文件**: `src/popup.tsx`

**功能**:
```tsx
{recommendedFeeds.length > 0 && (
  <div className="feed-recommendations">
    <h3>📰 发现 {recommendedFeeds.length} 个相关 RSS 源</h3>
    <ul>
      {recommendedFeeds.slice(0, 3).map(feed => (
        <li key={feed.id}>
          {feed.title}
          <span className="match-score">
            {feed.relevance?.matchScore}%
          </span>
        </li>
      ))}
    </ul>
    <div className="actions">
      <button onClick={handleGoToSettings}>查看详情</button>
      <button onClick={handleDismiss}>稍后</button>
    </div>
  </div>
)}
```

**非侵入式设计**:
- 不弹窗通知
- 只在 Popup 中显示
- 用户主动点击查看
- "稍后" 按钮不会永久忽略

**验收标准**:
- [ ] 显示推荐源数量
- [ ] 显示前 3 个推荐源
- [ ] 点击跳转到设置页
- [ ] 稍后功能正常
- [ ] 有测试覆盖

---

### Sprint 4: 自动化流程（可选，1-2天）🤖

#### 目标
建立后台调度器，自动检查候选源、抓取订阅源。

#### 任务清单

##### 4.1 后台调度器（1天）
**文件**: `src/background/feed-scheduler.ts`

**功能**:
```typescript
class FeedScheduler {
  // 启动调度器
  start(): void
  
  // 停止调度器
  stop(): void
  
  // 检查候选源
  private async checkCandidates(): Promise<void>
  
  // 抓取订阅源
  private async fetchSubscribed(): Promise<void>
  
  // 计算下次抓取时间
  private calculateNextFetch(updateFrequency: number): number
}
```

**调度策略**:
1. **候选源检查**（每 24 小时）：
   - 抓取所有 status = 'candidate' 的源
   - 进行质量和相关性分析
   - 符合条件的晋升为 'recommended'

2. **订阅源抓取**（动态间隔）：
   - 根据 updateFrequency 计算抓取间隔
   - ≥7篇/周 → 每 1 小时
   - 3-7篇/周 → 每 6 小时
   - <3篇/周 → 每 24 小时

3. **错误处理**：
   - 抓取失败 → 指数退避重试（1h, 2h, 4h, 8h）
   - 连续失败 3 次 → 标记为不可达
   - 连续失败 7 天 → 提示用户

**验收标准**:
- [ ] 定时任务正常运行
- [ ] 候选源检查正常
- [ ] 订阅源抓取正常
- [ ] 动态间隔计算正确
- [ ] 错误处理完善
- [ ] 有测试覆盖

---

##### 4.2 Badge 通知（0.5天）
**文件**: `src/background/badge-manager.ts`

**功能**:
```typescript
class BadgeManager {
  // 更新 Badge 数字
  updateBadge(count: number): void
  
  // 清除 Badge
  clearBadge(): void
}
```

**显示策略**:
- 显示推荐源数量（status = 'recommended'）
- 用户订阅后自动减少
- 用户忽略后自动减少
- 颜色：蓝色（非侵入性）

**验收标准**:
- [ ] Badge 正确显示数字
- [ ] 数字实时更新
- [ ] 颜色设置正确
- [ ] 有测试覆盖

---

## 测试策略

### 单元测试

#### 核心逻辑测试
```typescript
// RSSDetector.test.ts
describe('RSSDetector', () => {
  it('should detect RSS links from <link> tags')
  it('should try common URL paths')
  it('should send detected links to background')
})

// RSSValidator.test.ts
describe('RSSValidator', () => {
  it('should validate RSS 2.0 format')
  it('should validate Atom 1.0 format')
  it('should extract metadata')
  it('should handle invalid XML')
})

// FeedQualityAnalyzer.test.ts
describe('FeedQualityAnalyzer', () => {
  it('should calculate update frequency')
  it('should check format validity')
  it('should calculate quality score')
})

// FeedRelevanceAnalyzer.test.ts
describe('FeedRelevanceAnalyzer', () => {
  it('should analyze article content with AI')
  it('should calculate cosine similarity')
  it('should compute match score')
})
```

### 集成测试

#### 端到端流程测试
```typescript
describe('RSS Discovery Flow', () => {
  it('should discover RSS from page → validate → add to candidates', async () => {
    // 1. 模拟页面检测
    const detector = new RSSDetector()
    const links = detector.detectFromLinkTags(mockHTML)
    
    // 2. 验证 RSS
    const validator = new RSSValidator()
    const result = await validator.validate(links[0].url)
    expect(result.valid).toBe(true)
    
    // 3. 添加到数据库
    const feedManager = new FeedManager()
    await feedManager.addCandidate({
      url: links[0].url,
      title: result.metadata.title,
      status: 'candidate'
    })
    
    // 4. 验证数据库
    const feeds = await feedManager.getFeeds('candidate')
    expect(feeds).toHaveLength(1)
  })
  
  it('should fetch → analyze quality → analyze relevance → recommend', async () => {
    // 1. 抓取内容
    const fetcher = new RSSFetcher()
    const content = await fetcher.fetch(mockFeedURL)
    
    // 2. 质量分析
    const qualityAnalyzer = new FeedQualityAnalyzer()
    const quality = await qualityAnalyzer.analyze(mockFeed, content.articles)
    expect(quality.score).toBeGreaterThan(60)
    
    // 3. 相关性分析
    const relevanceAnalyzer = new FeedRelevanceAnalyzer(mockAI, mockProfile)
    const relevance = await relevanceAnalyzer.analyze(content.articles)
    expect(relevance.matchScore).toBeGreaterThan(60)
    
    // 4. 晋升为推荐
    const feedManager = new FeedManager()
    await feedManager.updateStatus(mockFeed.id, 'recommended')
  })
})
```

### UI 测试

#### 组件测试
```typescript
describe('RSSManager', () => {
  it('should render subscribed feeds list')
  it('should render recommended feeds list')
  it('should handle subscribe action')
  it('should handle unsubscribe action')
  it('should handle ignore action')
  it('should import OPML file')
  it('should export OPML file')
})

describe('Popup', () => {
  it('should show feed recommendations')
  it('should navigate to settings on click')
  it('should dismiss recommendations')
})
```

### 覆盖率目标

- **行覆盖率**: ≥ 70%
- **函数覆盖率**: ≥ 70%
- **分支覆盖率**: ≥ 60%

---

## 完成标准

### 功能完整性
- [ ] RSS 检测器工作正常
- [ ] RSS 抓取和解析成功
- [ ] 质量分析准确
- [ ] 相关性分析准确
- [ ] 手动添加功能正常
- [ ] OPML 导入/导出正常
- [ ] 订阅管理 UI 完整
- [ ] Popup 推荐提示正常
- [ ] 后台调度器工作正常（可选）
- [ ] Badge 通知正常（可选）

### 质量标准
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 测试覆盖率达标
- [ ] 浏览器实测通过
- [ ] 无明显性能问题
- [ ] 无内存泄漏

### 文档完整性
- [ ] 本文档已更新
- [ ] `DEVELOPMENT_PLAN.md` 已更新
- [ ] `TDD.md` 已更新
- [ ] 代码注释完整

---

## 风险与缓解

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| RSS 格式不规范 | 解析失败 | 使用宽松的解析器，处理常见错误 |
| AI 分析成本高 | 用户费用增加 | 只分析推荐源，设置每日上限 |
| 抓取频率过高 | 性能问题 | 智能调度，根据更新频率动态调整 |
| CORS 问题 | 无法抓取 | 使用 background fetch，设置合理的 CORS 策略 |

### 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 发现源速度慢 | 用户不满意 | 提供手动添加和 OPML 导入 |
| 推荐不准确 | 用户信任度下降 | 设置高阈值（≥60%），允许用户反馈 |
| 侵入性太强 | 违背产品理念 | 只在 Popup 中显示，不主动通知 |

---

## 未来扩展（Phase 6+）

### AI 主动推荐
- 基于用户画像搜索推荐源
- 使用 RSS 聚合服务 API（Feedly, Inoreader）
- 需要用户明确授权

### 智能阅读列表
- 根据用户画像排序文章
- 高亮推荐阅读
- 静音低相关性文章

### 社交功能
- 分享 OPML
- 发现好友订阅的源
- 协同过滤推荐

---

**最后更新**: 2025-01-09  
**文档版本**: v1.0  
**作者**: GitHub Copilot
