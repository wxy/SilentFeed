# Silent Feed 技术设计文档 (TDD)

**版本**: 1.1  
**日期**: 2025-11-02  
**状态**: Living Document  
**作者**: Silent Feed Team

> 本文档会随着开发进展持续更新

---

## 目录

1. [系统架构](#1-系统架构)
2. [技术栈选择与理由](#2-技术栈选择与理由)
3. [核心模块设计](#3-核心模块设计)
4. [数据模型](#4-数据模型)
5. [AI 集成方案](#5-ai-集成方案)
6. [隐私架构设计](#6-隐私架构设计)
7. [性能优化](#7-性能优化)
8. [安全与加密](#8-安全与加密)
9. [开发规范](#9-开发规范)
10. [部署和发布](#10-部署和发布)

---

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器层 (Chrome)                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Content      │  │ Popup        │  │ Background   │  │
│  │ Script       │  │ (React UI)   │  │ Service      │  │
│  │              │  │              │  │ Worker       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│         └─────────────────┴──────────────────┘           │
│                           ↓                               │
│         ┌─────────────────────────────────────┐          │
│         │      Core Business Logic             │          │
│         ├─────────────────────────────────────┤          │
│         │ ProfileBuilder │ Recommender │ RSS  │          │
│         │ AIAdapter      │ Storage     │ etc. │          │
│         └─────────────────────────────────────┘          │
│                           ↓                               │
│         ┌─────────────────────────────────────┐          │
│         │      Storage Layer (IndexedDB)       │          │
│         └─────────────────────────────────────┘          │
│                                                           │
└─────────────────────────────────────────────────────────┘
                           ↕
                    External APIs
          (OpenAI / Anthropic / DeepSeek)
```

### 1.2 模块职责

| 模块 | 职责 | 运行环境 |
|------|------|---------|
| **Content Script** | 监听页面、提取内容 | 页面上下文 |
| **Popup** | 用户界面、推荐展示 | 扩展弹窗 |
| **Background Service Worker** | 定时任务、RSS 抓取 | 独立上下文 |
| **Core Modules** | 业务逻辑 | 共享 |
| **Storage** | 数据持久化 | IndexedDB |

---

## 2. 技术栈

### 2.1 核心技术

```typescript
{
  "framework": "Plasmo 0.90.5",           // Chrome Extension 框架
## 2. 技术栈选择与理由

### 2.1 核心技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| **扩展框架** | Plasmo 0.90.5 | • 专为 MV3 设计<br>• Hot Reload 开发体验好<br>• 自动处理复杂配置<br>• 未来支持多浏览器 |
| **语言** | TypeScript 5.3 | • 类型安全，减少运行时错误<br>• 更好的 IDE 支持<br>• 强制接口规范 |
| **UI** | React 18 | • 团队熟悉<br>• 组件化易维护<br>• 生态丰富 |
| **样式** | Tailwind CSS 3.4 | • 快速开发<br>• 自适应明暗主题简单<br>• 文件体积小 |
| **状态管理** | Zustand 5.0 | • 极简 API<br>• 无样板代码<br>• 性能好 |
| **存储** | Dexie.js 4.2 | • IndexedDB 最佳封装<br>• Promise-based API<br>• 支持复杂查询 |

### 2.2 浏览器兼容性策略

**MVP 阶段**：
- 只支持 Chrome 120+ / Edge 120+
- 使用 Manifest V3
- 聚焦单一平台，快速迭代

**V2 阶段**：
- 添加 Firefox 支持
- 架构已预留跨浏览器能力
- 使用 webextension-polyfill 抹平差异
- 预计适配成本：1-2 周

**架构设计（天然支持多浏览器）**：
```typescript
// src/browser/adapter.ts
const browser = typeof chrome !== 'undefined' ? chrome : browser

// 核心业务逻辑完全独立，不依赖浏览器 API
// 只在 adapter 层处理差异
```

### 2.3 依赖库详解

```json
{
  "核心依赖": {
    "plasmo": "0.90.5",              // 扩展框架
    "react": "18.2.0",               // UI
    "zustand": "^5.0.8",             // 状态
    "dexie": "^4.2.1"                // 存储
  },
  "RSS 处理": {
    "rss-parser": "^3.13.0"          // RSS/Atom 解析
  },
  "文本分析": {
    "natural": "^8.1.0",             // NLP（TF-IDF, 分词）
    "stopword": "^3.1.4"             // 停用词过滤
  },
  "开发工具": {
    "@types/chrome": "^0.0.258",     // Chrome API 类型
    "tailwindcss": "^3.4",           // 样式
    "typescript": "5.3",             // 类型检查
    "prettier": "3.2.4",             // 代码格式化
    "@ianvs/prettier-plugin-sort-imports": "4.1.1"  // 导入排序
  }
}
```

### 2.3 开发工具

- ESLint + Prettier（代码规范）
- TypeScript strict mode（类型检查）
- Hot Reload（开发体验）

---

## 3. 核心模块设计

### 3.1 ProfileBuilder（用户画像构建器）

**职责**: 分析浏览历史，构建用户兴趣画像

```typescript
// src/core/profile/ProfileBuilder.ts

interface UserProfile {
  topics: Record<string, number>        // 主题概率分布
  keywords: string[]                    // 高频关键词
  domains: string[]                     // 常访问域名
  behaviorScore: number                 // 行为评分
  lastUpdated: number                   // 更新时间
}

class ProfileBuilder {
  async processPage(page: PageData): Promise<void>
  async getProfile(): Promise<UserProfile>
  async updateProfile(feedback: Feedback): Promise<void>
}
```

**核心算法**:
- TF-IDF 文本分析
- 时间衰减权重
- 行为特征提取

### 3.2 Recommender（推荐引擎）

**职责**: 基于用户画像推荐 RSS 内容

```typescript
// src/core/recommender/Recommender.ts

interface RecommendationScore {
  itemId: string
  score: number                // 0-1
  reason: string               // 推荐理由
}

class Recommender {
  async recommend(
    items: RSSItem[], 
    profile: UserProfile
  ): Promise<RecommendationScore[]>
  
  private preFilter(items: RSSItem[]): RSSItem[]
  private calculateScore(item: RSSItem, profile: UserProfile): number
}
```

**推荐流程**:
```
200 条新内容
  ↓ preFilter (TF-IDF 匹配)
30 条候选
  ↓ AI 评分（可选）
5 条推荐
```

### 3.3 AIAdapter（AI 适配器）

**职责**: 统一不同 AI 提供商的接口

```typescript
// src/core/ai/AIAdapter.ts

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'chrome'
  apiKey?: string
  baseURL?: string
  model?: string
}

class AIAdapter {
  async evaluate(
    items: RSSItem[], 
    profile: UserProfile
  ): Promise<number[]>
  
  private callOpenAI(): Promise<string>
  private callAnthropic(): Promise<string>
  private callChromeAI(): Promise<string>
}
```

---

## 4. 数据模型

### 4.1 数据库设计（IndexedDB）

```typescript
// src/storage/schema.ts

// 表 1: 浏览历史
interface PageVisit {
  id: string              // UUID
  url: string             // 完整 URL
  domain: string          // 域名
  title: string           // 页面标题
  content: string         // 提取的文本内容（摘要）
  keywords: string[]      // 关键词
  duration: number        // 停留时长（秒）
  interactions: {         // 交互行为
    copied: boolean
    bookmarked: boolean
    shared: boolean
  }
  timestamp: number       // 访问时间戳
}

// 表 2: RSS 源
interface RSSSource {
  id: string              // UUID
  url: string             // Feed URL
  title: string           // 源标题
  type: 'user' | 'auto'   // 用户添加 vs 自动发现
  addedAt: number         // 添加时间
  lastFetch: number       // 最后抓取时间
  itemCount: number       // 总条目数
  recommendedCount: number // 被推荐次数
  engagementRate: number  // 互动率
  isActive: boolean       // 是否激活
}

// 表 3: RSS 条目
interface RSSItem {
  id: string              // UUID
  sourceId: string        // 所属源 ID
  title: string           // 标题
  link: string            // 链接
  summary: string         // 摘要
  content?: string        // 完整内容
  pubDate: number         // 发布时间
  isRead: boolean         // 是否已读
  isRecommended: boolean  // 是否被推荐
  score?: number          // 推荐分数
  feedback?: 'like' | 'dislike' | 'later' // 用户反馈
}

// 表 4: 用户配置
interface UserSettings {
  id: 'singleton'         // 单例
  aiConfig: AIConfig      // AI 配置
  excludedDomains: string[] // 域名黑名单
  initPhase: {            // 初始化阶段
    completed: boolean
    pageCount: number     // 已收集页面数
  }
  notifications: {        // 通知设置
    enabled: boolean
    dailyLimit: number    // 每日推荐上限
  }
}
```

### 4.2 Dexie.js 实现

```typescript
// src/storage/db.ts

import Dexie, { Table } from 'dexie'

class SilentFeedDB extends Dexie {
  pageVisits!: Table<PageVisit>
  rssSources!: Table<RSSSource>
  rssItems!: Table<RSSItem>
  settings!: Table<UserSettings>

  constructor() {
    super('SilentFeedDB')
    this.version(1).stores({
      pageVisits: 'id, domain, timestamp',
      rssSources: 'id, type, addedAt',
      rssItems: 'id, sourceId, pubDate, isRecommended',
      settings: 'id'
    })
  }
}

export const db = new SilentFeedDB()
```

---

## 5. API 设计

### 5.1 内部消息传递（Chrome Extension Messaging）

```typescript
// src/utils/messaging.ts

// Content Script → Background
type MessageToBackground = 
  | { type: 'PAGE_VISIT', data: PageData }
  | { type: 'RSS_DISCOVERED', data: { url: string } }

// Background → Popup
type MessageToPopup =
  | { type: 'RECOMMENDATIONS', data: RSSItem[] }
  | { type: 'PROFILE_UPDATED', data: UserProfile }

// Popup → Background
type MessageFromPopup =
  | { type: 'FEEDBACK', data: { itemId: string, feedback: string } }
  | { type: 'MARK_READ', data: { itemId: string } }
```

### 5.2 Storage API

```typescript
// src/storage/StorageAdapter.ts

class StorageAdapter {
  // 页面访问
  async savePageVisit(visit: PageVisit): Promise<void>
  async getRecentVisits(limit: number): Promise<PageVisit[]>
  
  // RSS 源
  async addRSSSource(source: RSSSource): Promise<void>
  async getRSSSources(): Promise<RSSSource[]>
  
  // RSS 条目
  async saveRSSItems(items: RSSItem[]): Promise<void>
  async getUnreadItems(): Promise<RSSItem[]>
  
  // 用户配置
  async getSettings(): Promise<UserSettings>
  async updateSettings(partial: Partial<UserSettings>): Promise<void>
}
```

---

## 5. AI 集成方案

### 5.1 三层渐进式架构

**设计理念**：所有用户都有基础功能，AI 是可选增强

```
┌─────────────────────────────────────────────────────────┐
│              AI 能力分层（用户可选）                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Layer 1: 轻量级规则引擎（始终可用）                      │
│  ├─ TF-IDF 文本相似度                                    │
│  ├─ 关键词匹配                                            │
│  ├─ 域名权重                                              │
│  └─ 时效性评分                                            │
│  优点: 零延迟、完全隐私、任何设备                          │
│  准确率: ~50%                                             │
│                                                           │
│  Layer 2: 用户 API（推荐）                                │
│  ├─ OpenAI (gpt-4o-mini): $0.15/1M tokens               │
│  ├─ Anthropic (claude-3-haiku): $0.25/1M tokens         │
│  └─ DeepSeek: $0.14/1M tokens（国内可用）                │
│  优点: 准确度高、成本用户承担、隐私可控                    │
│  准确率: ~85%                                             │
│                                                           │
│  Layer 3: Chrome AI（可选增强）                           │
│  ├─ Gemini Nano（本地模型）                              │
│  └─ 自动检测可用性                                         │
│  优点: 完全免费、完全隐私                                  │
│  准确率: ~70%                                             │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 5.2 用户 API 集成（重点）

**为什么优先用户 API？**
1. ✅ 开发最简单（直接调用 REST API）
2. ✅ 效果最好（GPT-4/Claude 准确度高）
3. ✅ 成本转嫁给用户
4. ✅ 隐私友好（数据不经过我们的服务器）
5. ✅ 灵活性高（用户选择供应商）

**成本分析**：
```
场景: 订阅 50 个源，每天 200 条新内容

本地预筛选: 200 → 30 条（减少 85% AI 调用）

AI 评估:
- Input: ~800 tokens（用户画像 + 30 条摘要）
- Output: ~200 tokens（评分结果）
- Total: ~1000 tokens/天

成本:
- GPT-4o-mini: $0.0003/天 → $0.01/月
- DeepSeek: $0.00014/天 → $0.004/月

结论: 成本极低，用户完全可接受！
```

**实现代码**：

```typescript
// src/core/ai/AIAdapter.ts

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'chrome' | 'none'
  apiKey?: string
  baseURL?: string        // 支持自定义 endpoint
  model?: string          // 支持自定义模型
}

class AIAdapter {
  private config: AIConfig
  
  async recommend(
    items: RSSItem[], 
    profile: UserProfile
  ): Promise<RecommendationScore[]> {
    // 1. 构建 prompt
    const prompt = this.buildPrompt(items, profile)
    
    // 2. 调用 AI
    const response = await this.callAI(prompt)
    
    // 3. 解析结果
    return this.parseScores(response)
  }
  
  private buildPrompt(items: RSSItem[], profile: UserProfile): string {
    return `你是一个 RSS 推荐助手。

用户兴趣画像：
${JSON.stringify(profile.topics, null, 2)}

用户最常访问的网站：${profile.favoriteDomains.join(', ')}

待评估的 RSS 条目：
${items.map((item, i) => `${i + 1}. ${item.title}\n   摘要：${item.summary}`).join('\n\n')}

请为每条内容评分（0-1），表示与用户兴趣的匹配度。
只返回 JSON 格式：
[
  {"id": 1, "score": 0.95, "reason": "直接匹配用户的核心兴趣"},
  {"id": 2, "score": 0.3, "reason": "相关但不是重点"}
]`
  }
  
  private async callAI(prompt: string): Promise<string> {
    const { provider, apiKey, baseURL, model } = this.config
    
    switch (provider) {
      case 'openai':
      case 'deepseek':
        return this.callOpenAICompatible(prompt, apiKey, baseURL, model)
      case 'anthropic':
        return this.callAnthropic(prompt, apiKey, model)
      case 'chrome':
        return this.callChromeAI(prompt)
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
  
  private async callOpenAICompatible(
    prompt: string,
    apiKey: string,
    baseURL: string = 'https://api.openai.com/v1',
    model: string = 'gpt-4o-mini'
  ): Promise<string> {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是一个 RSS 推荐助手。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,   // 低温度，更确定性
        max_tokens: 1000
      })
    })
    
    const data = await response.json()
    return data.choices[0].message.content
  }
}
```

### 5.3 Chrome AI 支持（可选）

```typescript
// src/core/ai/ChromeAIAdapter.ts

class ChromeAIAdapter {
  async isAvailable(): Promise<boolean> {
    return 'ai' in window && 'languageModel' in (window as any).ai
  }
  
  async recommend(
    items: RSSItem[], 
    profile: UserProfile
  ): Promise<number[]> {
    if (!await this.isAvailable()) {
      return []
    }
    
    const session = await (window as any).ai.languageModel.create({
      systemPrompt: `你是一个内容评估助手。用户兴趣：${profile.topicsString}`,
    })
    
    const prompt = `这些文章是否匹配用户兴趣？
${items.map(i => `- ${i.title}`).join('\n')}

回答格式：1,3,5（只返回编号）`
    
    const result = await session.prompt(prompt)
    return this.parseIndices(result)
  }
}
```

### 5.4 混合推荐策略

```typescript
// src/core/recommender/HybridRecommender.ts

class HybridRecommender {
  private lightweightEngine: LightweightRecommender
  private aiAdapter: AIAdapter
  
  async recommendItems(
    rssItems: RSSItem[], 
    userProfile: UserProfile
  ): Promise<RSSItem[]> {
    // 1. 本地预筛选（必须）
    const candidates = await this.lightweightEngine.filter(
      rssItems, 
      userProfile
    ) // 200 → 30 条
    
    // 2. 如果配置了用户 API，使用 AI 精排
    if (userProfile.aiConfig && userProfile.aiConfig.provider !== 'none') {
      const scores = await this.aiAdapter.recommend(candidates, userProfile)
      candidates.forEach((item, i) => item.score = scores[i].score)
      candidates.sort((a, b) => b.score - a.score)
    }
    
    // 3. Chrome AI 增强（如果可用）
    if (await this.chromeAI.isAvailable()) {
      const boost = await this.chromeAI.recommend(
        candidates.slice(0, 10), 
        userProfile
      )
      // 对 Chrome AI 推荐的内容加权
      boost.forEach(idx => candidates[idx].score *= 1.2)
    }
    
    // 4. 返回 Top 5
    return candidates.slice(0, 5)
  }
}
```

---

## 6. 隐私架构设计

### 6.1 三层数据架构

**核心原则**：用户数据分层存储，默认不上传原始数据

```
┌─────────────────────────────────────────────────────────┐
│                用户本地（浏览器）                          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Layer 1: 原始数据（永不上传）                            │
│  ├─ 完整浏览历史：URL, 标题, 内容, 停留时间              │
│  ├─ RSS 源列表和阅读记录                                  │
│  └─ 用户交互反馈（点击/忽略/稍后）                        │
│                                                           │
│  Layer 2: 本地特征（本地处理）                            │
│  ├─ TF-IDF 向量                                          │
│  ├─ 主题分类概率分布                                      │
│  ├─ 时间偏好模式                                          │
│  └─ 行为特征（停留时长分布、互动类型权重）                 │
│                                                           │
│  Layer 3: 概率云数据（可选上传）                          │
│  └─ 只有使用平台 AI 时才上传                              │
│     {                                                     │
│       "topic_probs": {"tech": 0.35, "science": 0.28},   │
│       "reading_patterns": {"morning": 0.6},              │
│       "engagement_signals": {"depth_score": 0.72}        │
│     }                                                     │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 6.2 隐私保护机制

```typescript
// src/core/privacy/PrivacyGuard.ts

class PrivacyGuard {
  // 1. 域名过滤
  private readonly EXCLUDED_DOMAINS = [
    'mail.google.com',           // 邮件
    '*.bank*.com',               // 银行（模式匹配）
    'localhost',                 // 本地开发
    '*.internal.*',              // 企业内网
    '192.168.*',                 // 内网 IP
    '10.*',                      // 内网 IP
  ]
  
  isExcluded(url: string): boolean {
    const domain = extractDomain(url)
    return this.EXCLUDED_DOMAINS.some(pattern => 
      this.matchPattern(domain, pattern)
    )
  }
  
  // 2. 数据脱敏
  async generatePrivacyCloud(profile: UserProfile): Promise<PrivacyCloud> {
    return {
      // 只上传聚合的统计数据
      topics: profile.topics,                 // 主题概率
      behavioral_patterns: {                  // 行为模式
        avg_reading_time: profile.avgReadingTime,
        engagement_score: profile.engagementScore,
      },
      // 不上传: URL、标题、完整内容、域名列表
    }
  }
  
  // 3. 本地 AI 预处理（减少上传数据）
  async preprocessForAI(items: RSSItem[]): Promise<PreprocessedData> {
    return {
      item_summaries: items.map(item => ({
        id: item.id,
        summary: this.extractiveSummary(item.content, 3),  // 只取 3 句
        keywords: this.extractKeywords(item.content, 10),  // 只取 top 10
        topic: this.classifyTopic(item.content),          // 简单分类
      })),
      // 大幅减少 token 消耗：从几千 token → 几百 token
    }
  }
}
```

### 6.3 用户控制

**用户拥有完全控制权**：

1. **查看数据**：
   ```
   设置 → 隐私 → 查看我的数据
   - 浏览历史（最近 100 条）
   - 用户画像（可视化）
   - RSS 订阅列表
   ```

2. **排除域名**：
   ```
   设置 → 隐私 → 排除规则
   - 添加域名黑名单
   - 支持通配符（*.company.com）
   - 预设模板（银行、邮件、社交等）
   ```

3. **删除数据**：
   ```
   设置 → 隐私 → 删除数据
   - 删除所有浏览历史
   - 删除用户画像
   - 重置扩展（清空所有数据）
   ```

4. **AI 选择**：
   ```
   设置 → AI 配置
   - 选项 1: 完全本地（最隐私）
   - 选项 2: 用户 API（数据直达 AI 服务商）
   - 选项 3: 平台 AI（只上传概率云数据）
   ```

---

**TDD 文档摘要**

本文档详细定义了 SilentFeed 的技术架构，包括：

1. ✅ **系统架构**：MV3 扩展 + 核心业务逻辑分离
2. ✅ **技术选型**：Plasmo + React + TypeScript + Dexie.js
3. ✅ **核心模块**：ProfileBuilder、Recommender、AIAdapter 详细设计
4. ✅ **数据模型**：IndexedDB Schema 定义
5. ✅ **AI 集成**：三层渐进式架构（规则引擎 + 用户 API + Chrome AI）
6. ✅ **隐私保护**：三层数据架构，默认本地处理
7. ✅ **性能优化**：增量处理、批量操作、定期清理
8. ✅ **安全加密**：API Key 加密存储、XSS 防护

**文档状态**：Living Document，随开发持续更新

**下次审查**：2025-11-16（MVP 完成后）

---

**版本历史**：
- v1.0 (2025-11-02): 初始版本
- v1.1 (2025-11-02): 补充详细的 AI 集成和隐私架构设计

**维护说明**：
- 每个 Sprint 结束后更新实际实现与设计的差异
- 重大架构变更需要版本号升级
- 保持与 PRD 的同步

```typescript
const RECOMMENDATION_PROMPT = `
你是一个 RSS 内容推荐助手。

用户兴趣画像:
- 主题偏好: {topics}
- 常访问域名: {domains}
- 关键词: {keywords}

待评估的内容:
{items}

任务: 为每条内容评分 (0-1)，只返回 JSON:
[
  {"id": "1", "score": 0.92, "reason": "直接匹配核心兴趣"},
  {"id": "2", "score": 0.15, "reason": "相关性低"}
]
`
```

### 6.2 AI 调用流程

```typescript
async function getRecommendations(
  items: RSSItem[],
  profile: UserProfile,
  aiConfig: AIConfig
): Promise<RecommendationScore[]> {
  // 1. 预筛选（本地）
  const candidates = preFilter(items, profile) // 200 → 30
  
  // 2. AI 评分（如果配置了）
  if (aiConfig.provider) {
    const scores = await aiAdapter.evaluate(candidates, profile)
    return scores
  }
  
  // 3. 降级方案（规则引擎）
  return fallbackRecommender(candidates, profile)
}
```

---

## 7. 性能优化

### 7.1 页面分析优化

```typescript
// 问题: 每次页面访问都进行全文分析会影响性能

// 解决方案: 增量处理 + 延迟计算
class OptimizedProfileBuilder {
  private queue: PageData[] = []
  
  // 实时: 只提取关键信息
  async onPageVisit(page: PageData) {
    const lightweight = {
      domain: extractDomain(page.url),
      keywords: extractTopKeywords(page.content, 10), // 只取 top 10
      duration: page.duration
    }
    this.queue.push(lightweight)
  }
  
  // 空闲时: 批量处理
  async onIdle() {
    if (this.queue.length < 50) return
    
    const batch = this.queue.splice(0, 50)
    await this.batchProcess(batch)
  }
}
```

### 7.2 RSS 抓取优化

```typescript
// 问题: 同时抓取多个 RSS 源会阻塞

// 解决方案: 限流 + 优先级队列
class RSSFetcher {
  private concurrency = 3 // 最多同时 3 个请求
  
  async fetchAll(sources: RSSSource[]) {
    // 按优先级排序
    const sorted = sources.sort((a, b) => 
      b.engagementRate - a.engagementRate
    )
    
    // 并发控制
    for (let i = 0; i < sorted.length; i += this.concurrency) {
      const batch = sorted.slice(i, i + this.concurrency)
      await Promise.all(batch.map(s => this.fetch(s)))
    }
  }
}
```

### 7.3 存储优化

```typescript
// 问题: IndexedDB 数据膨胀

// 解决方案: 定期清理 + 压缩
class StorageMaintenance {
  async cleanup() {
    // 删除 90 天前的浏览历史
    await db.pageVisits
      .where('timestamp')
      .below(Date.now() - 90 * 86400 * 1000)
      .delete()
    
    // 删除已读的旧 RSS 条目
    await db.rssItems
      .where('isRead').equals(true)
      .and(item => item.pubDate < Date.now() - 30 * 86400 * 1000)
      .delete()
  }
}
```

---

## 8. 安全与隐私

### 8.1 数据隐私保护

```typescript
// 原则: 默认不上传原始数据

class PrivacyGuard {
  // 1. 域名过滤
  private isExcluded(url: string): boolean {
    const domain = extractDomain(url)
    const blacklist = [
      'mail.google.com',    // 邮件
      'bankofamerica.com',  // 银行
      'localhost',          // 本地
      '*.internal.company.com' // 企业内网
    ]
    return blacklist.some(pattern => matches(domain, pattern))
  }
  
  // 2. 数据脱敏
  async generatePrivacyCloud(profile: UserProfile): Promise<PrivacyCloud> {
    return {
      topics: profile.topics,        // 只上传概率分布
      // 不上传: URL、标题、完整内容
    }
  }
}
```

### 8.2 API Key 安全

```typescript
// 问题: API Key 存储在 chrome.storage 可能被窃取

// 解决方案: 加密存储
import { encrypt, decrypt } from './crypto'

class SecureStorage {
  async saveAPIKey(key: string) {
    const encrypted = await encrypt(key, await getDeviceKey())
    await chrome.storage.local.set({ apiKey: encrypted })
  }
  
  async getAPIKey(): Promise<string> {
    const { apiKey } = await chrome.storage.local.get('apiKey')
    return await decrypt(apiKey, await getDeviceKey())
  }
}
```

### 8.3 XSS 防护

```typescript
// 问题: RSS 内容可能包含恶意脚本

// 解决方案: 内容清洗
import DOMPurify from 'dompurify'

function sanitizeRSSContent(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a'],
    ALLOWED_ATTR: ['href']
  })
}
```

---

## 9. 部署和发布

### 9.1 构建流程

```bash
# 开发构建
npm run dev

# 生产构建
npm run build

# 打包扩展
npm run package
# → silentfeed-1.0.0.zip
```

### 9.2 Chrome Web Store 发布

1. 准备资料
   - 图标（128x128, 48x48, 16x16）
   - 截图（1280x800）
   - 隐私政策
   - 描述文本

2. 提交审核
   - 上传 ZIP
   - 填写表单
   - 等待审核（1-3 天）

### 9.3 版本管理

```
v0.1.0 - MVP（基础功能）
v0.2.0 - Chrome AI 支持
v0.3.0 - 高级推荐
v1.0.0 - 稳定版发布
```

---

## 10. 开发规范

### 10.1 代码风格

```typescript
// ✅ Good
async function fetchRSS(url: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(url)
    return await parseRSS(response)
  } catch (error) {
    logger.error('Failed to fetch RSS', { url, error })
    return []
  }
}

// ❌ Bad
function fetchRSS(url) {
  return fetch(url).then(parseRSS)
}
```

### 10.2 错误处理

```typescript
// 所有异步操作必须有错误处理
try {
  await riskyOperation()
} catch (error) {
  // 记录错误
  logger.error(error)
  
  // 降级方案
  await fallbackOperation()
  
  // 用户提示（如果必要）
  showNotification('操作失败，已使用备用方案')
}
```

### 10.3 测试策略

```typescript
// 单元测试
describe('ProfileBuilder', () => {
  it('should extract keywords correctly', () => {
    const text = 'React is a JavaScript library'
    const keywords = extractKeywords(text)
    expect(keywords).toContain('react')
    expect(keywords).toContain('javascript')
  })
})

// 集成测试
describe('Recommender', () => {
  it('should recommend relevant items', async () => {
    const profile = { topics: { tech: 0.9 } }
    const items = [techItem, sportItem]
    const results = await recommender.recommend(items, profile)
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })
})
```

---

## 11. 监控和调试

### 11.1 日志系统

```typescript
// src/utils/logger.ts

class Logger {
  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${message}`, data)
    }
  }
  
  error(message: string, error?: Error) {
    console.error(`[ERROR] ${message}`, error)
    // 可选: 上报到错误追踪服务
  }
}

export const logger = new Logger()
```

### 11.2 性能监控

```typescript
// 测量关键操作耗时
async function timedOperation<T>(
  name: string, 
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now()
  const result = await fn()
  const duration = performance.now() - start
  logger.debug(`${name} took ${duration.toFixed(2)}ms`)
  return result
}

// 使用
const profile = await timedOperation(
  'buildProfile',
  () => profileBuilder.getProfile()
)
```

---

## 12. 附录

### 12.1 关键算法伪代码

#### TF-IDF 实现

```typescript
function calculateTFIDF(
  document: string, 
  corpus: string[]
): Record<string, number> {
  const words = tokenize(document)
  const tfidf: Record<string, number> = {}
  
  for (const word of words) {
    const tf = countOccurrences(word, document) / words.length
    const df = corpus.filter(doc => doc.includes(word)).length
    const idf = Math.log(corpus.length / (df + 1))
    tfidf[word] = tf * idf
  }
  
  return tfidf
}
```

### 12.2 参考资料

- [Chrome Extension MV3 文档](https://developer.chrome.com/docs/extensions/mv3/)
- [Plasmo 框架文档](https://docs.plasmo.com/)
- [Dexie.js 文档](https://dexie.org/)
- [RSS 规范](https://www.rssboard.org/rss-specification)

---

**文档结束**

*最后更新: 2025-11-02*

