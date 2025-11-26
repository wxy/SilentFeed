# Phase 3: 用户画像构建 - 详细设计

**预计时间**: 3-4 小时  
**状态**: 设计中  
**依赖**: Phase 2 (页面访问监听) ✅

---

## 目录

1. [概述](#1-概述)
2. [功能分解](#2-功能分解)
3. [技术设计](#3-技术设计)
4. [数据模型](#4-数据模型)
5. [核心算法](#5-核心算法)
6. [开发计划](#6-开发计划)
7. [测试策略](#7-测试策略)
8. [验收标准](#8-验收标准)

---

## 1. 概述

### 1.1 目标

**核心目标**: 从用户浏览历史中自动构建兴趣画像，为推荐引擎提供数据基础

**用户价值**: 
- 零配置：无需手动设置兴趣标签
- 动态适应：兴趣变化自动反映
- 可视化：直观展示用户兴趣分布

### 1.2 输入与输出

```
输入: confirmedVisits (页面访问记录)
  ↓
处理: 文本分析 → 主题分类 → 加权聚合
  ↓
输出: UserProfile (用户画像)
  ↓
展示: Popup 界面 (Top 3 主题 + 占比)
```

### 1.3 设计原则

1. **渐进构建**: 每次新增页面时增量更新画像
2. **时间衰减**: 近期浏览权重更高
3. **行为加权**: 停留时间越长权重越高
4. **主题聚焦**: 只展示 Top 3 主题，避免信息过载

---

## 2. 功能分解

### 2.1 功能树

```
Phase 3: 用户画像构建
├─ 3.1 文本分析引擎 (1h)
│   ├─ 中英文分词
│   ├─ TF-IDF 关键词提取
│   └─ 停用词过滤
│
├─ 3.2 内容提取器 (0.5h)
│   ├─ 元数据提取 (title, description)
│   ├─ 正文提取 (article/main)
│   └─ 语言检测
│
├─ 3.3 用户画像构建器 (1h)
│   ├─ 主题分类（规则引擎）
│   ├─ 时间衰减加权
│   ├─ 行为加权（停留时间）
│   └─ 画像聚合和存储
│
└─ 3.4 画像可视化 (0.5h)
    ├─ 更新 Popup 界面
    ├─ Top 3 主题展示
    └─ 主题占比进度条
```

### 2.2 优先级

| 功能 | 优先级 | 理由 |
|------|-------|------|
| 文本分析引擎 | P0 | 核心能力，其他功能依赖 |
| 内容提取器 | P0 | 数据源，必须先有 |
| 画像构建器 | P0 | 核心逻辑 |
| 画像可视化 | P1 | 用户体验，可以后做 |

---

## 3. 技术设计

### 3.1 架构图

```
┌─────────────────────────────────────────────────────┐
│                   Content Script                     │
│  ┌────────────────────────────────────────────┐    │
│  │ PageTracker                                 │    │
│  │  ├─ DwellTimeCalculator                    │    │
│  │  └─ ContentExtractor (新增)                │    │
│  │       ├─ 元数据提取                         │    │
│  │       ├─ 正文提取                           │    │
│  │       └─ 保存到 confirmedVisits            │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                 Background Service Worker            │
│  ┌────────────────────────────────────────────┐    │
│  │ ProfileUpdateService (新增)                │    │
│  │  └─ 定时触发画像重建（每 10 页）           │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                    Core Modules                      │
│  ┌────────────────────────────────────────────┐    │
│  │ TextAnalyzer                                │    │
│  │  ├─ tokenize(text): string[]               │    │
│  │  ├─ extractKeywords(text): Keyword[]       │    │
│  │  └─ removeStopwords(tokens): string[]      │    │
│  └────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────┐    │
│  │ ProfileBuilder                              │    │
│  │  ├─ buildFromVisits(visits): UserProfile   │    │
│  │  ├─ classifyTopic(keywords): Topic[]       │    │
│  │  ├─ applyTimeDecay(visits): Visit[]        │    │
│  │  └─ aggregateProfile(): UserProfile        │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                      Storage                         │
│  ┌────────────────────────────────────────────┐    │
│  │ userProfile 表 (新增)                       │    │
│  │  ├─ id: 'singleton'                        │    │
│  │  ├─ topics: Record<string, number>         │    │
│  │  ├─ keywords: string[]                     │    │
│  │  ├─ lastUpdated: number                    │    │
│  │  └─ pageCount: number                      │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                       Popup                          │
│  ┌────────────────────────────────────────────┐    │
│  │ ProfileDisplay (新增)                       │    │
│  │  ├─ 读取 userProfile                       │    │
│  │  ├─ 展示 Top 3 主题                        │    │
│  │  └─ 进度条可视化                           │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
1. 页面访问 (用户浏览)
   ↓
2. ContentExtractor 提取内容
   ├─ title: "深入理解 React Hooks"
   ├─ content: "React Hooks 是 React 16.8 引入的..."
   └─ dwellTime: 320s
   ↓
3. 保存到 confirmedVisits
   ↓
4. Background: ProfileUpdateService 监听
   ├─ 每 10 页触发一次重建
   └─ 或用户主动请求刷新
   ↓
5. ProfileBuilder.buildFromVisits()
   ├─ 读取所有 confirmedVisits
   ├─ TextAnalyzer 提取关键词
   ├─ 主题分类（规则引擎）
   ├─ 时间衰减加权
   └─ 聚合成 UserProfile
   ↓
6. 保存到 userProfile 表
   ↓
7. Popup 读取并展示
   ├─ Top 3 主题
   ├─ 占比（进度条）
   └─ 分析进度
```

---

## 4. 数据模型

### 4.1 扩展 ConfirmedVisit（修改现有表）

```typescript
// src/storage/types.ts

interface ConfirmedVisit {
  // 现有字段
  id: string
  url: string
  title: string
  visitedAt: number
  dwellTime: number
  
  // 新增字段（Phase 3）
  content?: string          // 正文内容（前 2000 字）
  description?: string      // 页面描述
  keywords?: string[]       // 提取的关键词
  language?: 'zh' | 'en' | 'other'  // 语言
  topics?: string[]         // 识别的主题
}
```

### 4.2 新增 UserProfile 表

```typescript
// src/storage/types.ts

interface UserProfile {
  id: 'singleton'           // 单例模式
  
  // 主题分布（核心数据）
  topics: Record<Topic, number>  // { 'technology': 0.35, ... }
  
  // 关键词（Top 50）
  keywords: Array<{
    word: string
    weight: number
  }>
  
  // 常访问域名（Top 20）
  domains: Array<{
    domain: string
    count: number
    avgDwellTime: number
  }>
  
  // 元数据
  totalPages: number        // 分析的页面总数
  lastUpdated: number       // 最后更新时间
  version: number           // 画像版本（用于迁移）
}
```

### 4.3 主题定义

```typescript
// src/core/profile/topics.ts

enum Topic {
  TECHNOLOGY = 'technology',        // 技术
  SCIENCE = 'science',              // 科学
  BUSINESS = 'business',            // 商业
  DESIGN = 'design',                // 设计
  ARTS = 'arts',                    // 艺术
  HEALTH = 'health',                // 健康
  SPORTS = 'sports',                // 体育
  ENTERTAINMENT = 'entertainment',   // 娱乐
  NEWS = 'news',                    // 新闻
  EDUCATION = 'education',          // 教育
  OTHER = 'other'                   // 其他
}

// 主题关键词映射（规则引擎）
const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  [Topic.TECHNOLOGY]: [
    'programming', 'code', 'software', 'developer', 'algorithm',
    '编程', '代码', '软件', '开发', '算法', 'JavaScript', 'Python', 'AI'
  ],
  [Topic.SCIENCE]: [
    'research', 'study', 'experiment', 'scientific', 'theory',
    '研究', '实验', '科学', '理论', '数据'
  ],
  [Topic.DESIGN]: [
    'design', 'ui', 'ux', 'interface', 'typography',
    '设计', '界面', '视觉', '交互', '排版'
  ],
  // ... 其他主题
}
```

---

## 5. 核心算法

### 5.1 TF-IDF 关键词提取

```typescript
// src/core/analyzer/TextAnalyzer.ts

/**
 * TF-IDF 关键词提取
 * 
 * TF (Term Frequency): 词在文档中出现的频率
 * IDF (Inverse Document Frequency): 词的稀有程度
 * 
 * TF-IDF = TF × IDF
 */
class TextAnalyzer {
  /**
   * 提取关键词
   * @param text 输入文本
   * @param topK 返回前 K 个关键词
   * @returns 关键词及权重
   */
  extractKeywords(text: string, topK: number = 20): Keyword[] {
    // 1. 分词
    const tokens = this.tokenize(text)
    
    // 2. 移除停用词
    const filtered = this.removeStopwords(tokens)
    
    // 3. 计算 TF
    const tf = this.calculateTF(filtered)
    
    // 4. 计算 TF-IDF（需要语料库 IDF）
    const tfidf = this.calculateTFIDF(tf)
    
    // 5. 排序并返回 Top K
    return tfidf
      .sort((a, b) => b.weight - a.weight)
      .slice(0, topK)
  }
  
  /**
   * 中英文分词
   */
  private tokenize(text: string): string[] {
    // 检测语言
    const lang = this.detectLanguage(text)
    
    if (lang === 'zh') {
      // 中文分词（使用 natural 的 Tokenizer）
      return new natural.WordTokenizer().tokenize(text)
    } else {
      // 英文分词（简单空格分割 + 词形还原）
      const tokens = text.toLowerCase()
        .split(/\s+/)
        .filter(t => t.length > 2)
      
      // 词形还原（running → run）
      return tokens.map(t => natural.PorterStemmer.stem(t))
    }
  }
  
  /**
   * 移除停用词
   */
  private removeStopwords(tokens: string[]): string[] {
    const stopwords = require('stopword')
    return stopwords.removeStopwords(tokens, stopwords.zh)
      .filter(t => !stopwords.en.includes(t))
  }
  
  /**
   * 计算 TF (Term Frequency)
   */
  private calculateTF(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>()
    const total = tokens.length
    
    tokens.forEach(token => {
      tf.set(token, (tf.get(token) || 0) + 1)
    })
    
    // 归一化（除以总词数）
    tf.forEach((count, word) => {
      tf.set(word, count / total)
    })
    
    return tf
  }
}
```

### 5.2 主题分类（规则引擎）

```typescript
// src/core/profile/TopicClassifier.ts

/**
 * 主题分类器（基于关键词匹配）
 */
class TopicClassifier {
  /**
   * 分类文本主题
   * @param keywords 关键词列表
   * @returns 主题分布
   */
  classify(keywords: Keyword[]): Record<Topic, number> {
    const scores: Record<Topic, number> = {}
    
    // 初始化所有主题分数为 0
    Object.values(Topic).forEach(topic => {
      scores[topic] = 0
    })
    
    // 遍历关键词，匹配主题
    keywords.forEach(kw => {
      Object.entries(TOPIC_KEYWORDS).forEach(([topic, words]) => {
        if (words.some(w => kw.word.includes(w) || w.includes(kw.word))) {
          scores[topic as Topic] += kw.weight
        }
      })
    })
    
    // 归一化（总和为 1）
    const total = Object.values(scores).reduce((sum, s) => sum + s, 0)
    if (total > 0) {
      Object.keys(scores).forEach(topic => {
        scores[topic as Topic] /= total
      })
    } else {
      // 如果没有匹配，归为 OTHER
      scores[Topic.OTHER] = 1.0
    }
    
    return scores
  }
}
```

### 5.3 时间衰减加权

```typescript
// src/core/profile/ProfileBuilder.ts

/**
 * 时间衰减权重计算
 * 
 * 近期浏览权重更高
 * 公式: weight = e^(-λ * days)
 * λ = 0.02 (衰减系数，可调)
 */
private applyTimeDecay(visits: ConfirmedVisit[]): ConfirmedVisit[] {
  const now = Date.now()
  const DECAY_LAMBDA = 0.02  // 衰减系数（越大衰减越快）
  
  return visits.map(visit => {
    const daysAgo = (now - visit.visitedAt) / (1000 * 60 * 60 * 24)
    const decayFactor = Math.exp(-DECAY_LAMBDA * daysAgo)
    
    return {
      ...visit,
      weight: decayFactor
    }
  })
}
```

### 5.4 行为加权

```typescript
/**
 * 行为加权（停留时间）
 * 
 * 停留越久权重越高
 * 分段函数:
 * - 0-30s: 0 (无效)
 * - 30-60s: 0.5
 * - 60-300s: 线性增长 0.5 → 1.0
 * - 300s+: 1.0 (饱和)
 */
private calculateBehaviorWeight(dwellTime: number): number {
  if (dwellTime < 30) return 0
  if (dwellTime < 60) return 0.5
  if (dwellTime < 300) {
    // 线性插值 [60, 300] → [0.5, 1.0]
    return 0.5 + (dwellTime - 60) / (300 - 60) * 0.5
  }
  return 1.0
}
```

### 5.5 画像聚合

```typescript
/**
 * 从访问记录构建用户画像
 */
async buildFromVisits(visits: ConfirmedVisit[]): Promise<UserProfile> {
  // 1. 时间衰减
  const weighted = this.applyTimeDecay(visits)
  
  // 2. 提取所有关键词
  const allKeywords: Map<string, number> = new Map()
  const topicScores: Map<Topic, number> = new Map()
  
  for (const visit of weighted) {
    // 行为权重
    const behaviorWeight = this.calculateBehaviorWeight(visit.dwellTime)
    const totalWeight = visit.weight * behaviorWeight
    
    // 聚合关键词
    visit.keywords?.forEach(kw => {
      const current = allKeywords.get(kw.word) || 0
      allKeywords.set(kw.word, current + kw.weight * totalWeight)
    })
    
    // 聚合主题
    visit.topics?.forEach(topic => {
      const current = topicScores.get(topic as Topic) || 0
      topicScores.set(topic as Topic, current + totalWeight)
    })
  }
  
  // 3. Top 50 关键词
  const topKeywords = Array.from(allKeywords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, weight]) => ({ word, weight }))
  
  // 4. 归一化主题分数
  const total = Array.from(topicScores.values()).reduce((sum, s) => sum + s, 0)
  const topics: Record<Topic, number> = {}
  topicScores.forEach((score, topic) => {
    topics[topic] = score / total
  })
  
  // 5. 统计域名
  const domainStats = this.aggregateDomains(visits)
  
  return {
    id: 'singleton',
    topics,
    keywords: topKeywords,
    domains: domainStats.slice(0, 20),
    totalPages: visits.length,
    lastUpdated: Date.now(),
    version: 1
  }
}
```

---

## 6. 开发计划

### 6.1 Phase 3.1: 文本分析引擎 (1h)

**目标**: 实现 TF-IDF 关键词提取

**文件**:
- `src/core/analyzer/TextAnalyzer.ts`
- `src/core/analyzer/TextAnalyzer.test.ts`

**任务清单**:
- [ ] 安装依赖: `npm install natural stopword`
- [ ] 实现 `tokenize()` - 中英文分词
- [ ] 实现 `removeStopwords()` - 停用词过滤
- [ ] 实现 `extractKeywords()` - TF-IDF 提取
- [ ] 单元测试（测试数据：技术文章、科学文章）
- [ ] 性能测试（2000 字文本 < 100ms）

**验收标准**:
```typescript
const text = "深入理解 React Hooks 的工作原理..."
const keywords = analyzer.extractKeywords(text, 20)

// 应该提取出: React, Hooks, 原理, 工作, useState, useEffect...
expect(keywords).toHaveLength(20)
expect(keywords[0].word).toBe('react')
expect(keywords[0].weight).toBeGreaterThan(0.1)
```

### 6.2 Phase 3.2: 内容提取器 (0.5h)

**目标**: 从网页中提取结构化内容

**文件**:
- `src/core/extractor/ContentExtractor.ts`
- `src/core/extractor/ContentExtractor.test.ts`
- 修改 `src/contents/page-tracker.ts` (集成提取器)

**任务清单**:
- [ ] 实现 `extractMetadata()` - 提取 title, description, keywords
- [ ] 实现 `extractContent()` - 提取正文（article/main 优先）
- [ ] 实现 `detectLanguage()` - 语言检测
- [ ] 集成到 PageTracker.saveVisit()
- [ ] 单元测试（Mock DOM）

**验收标准**:
```typescript
// 测试页面: 技术博客文章
const extracted = extractor.extract(document)

expect(extracted.title).toBe('深入理解 React Hooks')
expect(extracted.content).toHaveLength.greaterThan(500)
expect(extracted.language).toBe('zh')
expect(extracted.keywords).toContain('React')
```

### 6.3 Phase 3.3: 用户画像构建器 (1h)

**目标**: 从访问记录构建用户画像

**文件**:
- `src/core/profile/ProfileBuilder.ts`
- `src/core/profile/TopicClassifier.ts`
- `src/core/profile/topics.ts`
- `src/core/profile/ProfileBuilder.test.ts`
- `src/storage/types.ts` (新增 UserProfile)
- `src/storage/db.ts` (新增 userProfile 表)

**任务清单**:
- [ ] 定义主题枚举和关键词映射
- [ ] 实现 TopicClassifier.classify()
- [ ] 实现 ProfileBuilder.buildFromVisits()
- [ ] 实现时间衰减权重
- [ ] 实现行为加权
- [ ] 实现画像聚合
- [ ] 新增 userProfile 表
- [ ] 单元测试（Mock confirmedVisits）
- [ ] 集成测试（端到端流程）

**验收标准**:
```typescript
// 测试数据: 10 条技术文章访问 + 5 条设计文章访问
const visits = [
  { title: 'React Hooks', keywords: ['react', 'hooks'], dwellTime: 180, ... },
  { title: 'Vue 3 Composition API', keywords: ['vue', 'composition'], dwellTime: 240, ... },
  // ...
]

const profile = await builder.buildFromVisits(visits)

expect(profile.topics.technology).toBeGreaterThan(0.5)  // 技术主题占比 > 50%
expect(profile.topics.design).toBeGreaterThan(0.2)      // 设计主题占比 > 20%
expect(profile.keywords).toHaveLength(50)
expect(profile.keywords[0].word).toBe('react')          // React 是最高频词
```

### 6.4 Phase 3.4: 画像可视化 (0.5h)

**目标**: 在 Popup 中展示用户画像

**文件**:
- `src/components/ProfileDisplay.tsx` (新增)
- `src/components/ProfileDisplay.test.tsx`
- 修改 `src/popup.tsx` (集成组件)

**任务清单**:
- [ ] 创建 ProfileDisplay 组件
- [ ] 读取 userProfile 数据
- [ ] 展示 Top 3 主题
- [ ] 主题占比进度条
- [ ] 分析进度提示
- [ ] 组件测试

**UI 设计**:
```
┌──────────────────────────────────────┐
│  🌱 正在学习你的兴趣... 127/1000      │
├──────────────────────────────────────┤
│  📊 已分析主题：                       │
│                                       │
│  💻 技术                               │
│  ████████████░░░░░░░ 62%              │
│                                       │
│  🎨 设计                               │
│  ████████░░░░░░░░░░░ 23%              │
│                                       │
│  🔬 科学                               │
│  ████░░░░░░░░░░░░░░░ 15%              │
│                                       │
│  💡 继续浏览，我会更了解你...          │
└──────────────────────────────────────┘
```

**验收标准**:
```tsx
// Mock userProfile
const mockProfile: UserProfile = {
  topics: {
    technology: 0.62,
    design: 0.23,
    science: 0.15
  },
  keywords: [{ word: 'react', weight: 0.8 }, ...],
  // ...
}

render(<ProfileDisplay profile={mockProfile} pageCount={127} />)

// 检查显示
expect(screen.getByText('💻 技术')).toBeInTheDocument()
expect(screen.getByText('62%')).toBeInTheDocument()
```

---

## 7. 测试策略

### 7.1 单元测试

**TextAnalyzer**:
```typescript
describe('TextAnalyzer', () => {
  it('应该正确分词中文', () => {
    const text = "深入理解 React Hooks"
    const tokens = analyzer.tokenize(text)
    expect(tokens).toContain('react')
    expect(tokens).toContain('hooks')
  })
  
  it('应该移除停用词', () => {
    const tokens = ['the', 'react', 'is', 'good']
    const filtered = analyzer.removeStopwords(tokens)
    expect(filtered).not.toContain('the')
    expect(filtered).not.toContain('is')
    expect(filtered).toContain('react')
  })
  
  it('应该提取 Top K 关键词', () => {
    const text = "React is a JavaScript library for building user interfaces..."
    const keywords = analyzer.extractKeywords(text, 5)
    expect(keywords).toHaveLength(5)
    expect(keywords[0].word).toBe('react')
  })
})
```

**ProfileBuilder**:
```typescript
describe('ProfileBuilder', () => {
  it('应该正确应用时间衰减', () => {
    const now = Date.now()
    const visits = [
      { visitedAt: now - 7 * 24 * 60 * 60 * 1000, ... },  // 7 天前
      { visitedAt: now - 1 * 24 * 60 * 60 * 1000, ... },  // 1 天前
    ]
    
    const weighted = builder.applyTimeDecay(visits)
    expect(weighted[1].weight).toBeGreaterThan(weighted[0].weight)
  })
  
  it('应该聚合主题分布', async () => {
    const visits = [
      { keywords: [{ word: 'react', weight: 0.8 }], topics: ['technology'], ... },
      { keywords: [{ word: 'design', weight: 0.7 }], topics: ['design'], ... },
    ]
    
    const profile = await builder.buildFromVisits(visits)
    expect(profile.topics.technology).toBeDefined()
    expect(profile.topics.design).toBeDefined()
  })
})
```

### 7.2 集成测试

```typescript
describe('Profile Integration', () => {
  it('端到端: 从访问到画像', async () => {
    // 1. 模拟页面访问
    const visits: ConfirmedVisit[] = [
      {
        id: '1',
        url: 'https://blog.example.com/react-hooks',
        title: 'React Hooks 深入解析',
        content: '...',
        dwellTime: 180,
        visitedAt: Date.now(),
      },
      // ... 更多访问
    ]
    
    // 2. 保存到数据库
    await db.confirmedVisits.bulkAdd(visits)
    
    // 3. 构建画像
    const profile = await profileBuilder.build()
    
    // 4. 验证
    expect(profile.topics.technology).toBeGreaterThan(0)
    expect(profile.keywords.length).toBeGreaterThan(0)
    
    // 5. 读取并展示
    const saved = await db.userProfile.get('singleton')
    expect(saved).toEqual(profile)
  })
})
```

### 7.3 性能测试

```typescript
describe('Performance', () => {
  it('分析 2000 字文本应该 < 100ms', () => {
    const text = '...' // 2000 字
    const start = performance.now()
    analyzer.extractKeywords(text, 20)
    const end = performance.now()
    expect(end - start).toBeLessThan(100)
  })
  
  it('构建 1000 页访问画像应该 < 3s', async () => {
    const visits = generateMockVisits(1000)
    const start = performance.now()
    await builder.buildFromVisits(visits)
    const end = performance.now()
    expect(end - start).toBeLessThan(3000)
  })
})
```

---

## 8. 验收标准

### 8.1 功能验收

- [ ] **文本分析**
  - [ ] 中文分词准确率 > 85%
  - [ ] 英文分词准确率 > 90%
  - [ ] TF-IDF 提取的 Top 20 关键词有意义
  - [ ] 停用词过滤有效

- [ ] **内容提取**
  - [ ] 能正确提取 title, description
  - [ ] 能提取正文内容（article/main 优先）
  - [ ] 语言检测准确率 > 95%

- [ ] **画像构建**
  - [ ] 从 100 条访问构建画像成功
  - [ ] 主题分类覆盖 11 个预定义主题
  - [ ] Top 3 主题占比总和 > 70%
  - [ ] 时间衰减生效（近期权重更高）
  - [ ] 行为加权生效（停留久权重高）

- [ ] **UI 展示**
  - [ ] Popup 显示 Top 3 主题
  - [ ] 主题占比进度条正确
  - [ ] 分析进度正确（X/1000）
  - [ ] 适配明暗主题

### 8.2 性能验收

- [ ] 文本分析（2000 字）< 100ms
- [ ] 画像构建（1000 页）< 3s
- [ ] Popup 加载时间 < 500ms
- [ ] 内存占用 < 50MB

### 8.3 测试覆盖率

- [ ] 行覆盖率 ≥ 70%
- [ ] 函数覆盖率 ≥ 70%
- [ ] 分支覆盖率 ≥ 60%

### 8.4 用户体验验收

- [ ] 冷启动阶段显示画像进度
- [ ] 主题图标清晰易懂
- [ ] 占比数字准确
- [ ] 没有卡顿或延迟
- [ ] 国际化支持（中英文）

---

## 9. 风险与缓解

### 9.1 技术风险

**风险 1: 中文分词准确率不足**
- 缓解: 使用 natural.js + 手动调优
- 备选: 集成 jieba 分词（体积稍大）

**风险 2: TF-IDF 提取关键词不准确**
- 缓解: 使用预训练 IDF 语料库
- 备选: 引入 TextRank 算法

**风险 3: 主题分类规则引擎太简单**
- 缓解: MVP 使用规则，V2 引入 AI 分类
- 备选: 使用预训练主题模型

### 9.2 性能风险

**风险 4: 1000 页画像构建太慢**
- 缓解: 增量更新（每 10 页更新一次）
- 备选: 使用 Web Worker 后台计算

**风险 5: 文本分析阻塞 UI**
- 缓解: 在 Background Service Worker 中进行
- 备选: 使用 requestIdleCallback

---

## 10. 未来优化方向

### 10.1 V2 增强

- **AI 主题分类**: 使用 LLM 或预训练模型替代规则引擎
- **协同过滤**: 结合其他用户数据（隐私云）
- **兴趣变化检测**: 自动识别兴趣转变
- **可视化仪表板**: 更丰富的数据展示

### 10.2 V3 高级功能

- **多维度画像**: 时间、地点、设备等
- **画像导出**: 供用户查看和分享
- **画像调整**: 用户手动调整权重

---

## 附录

### A. 依赖库文档

- **natural.js**: https://github.com/NaturalNode/natural
- **stopword.js**: https://github.com/fergiemcdowall/stopword

### B. 参考资料

- TF-IDF 算法: https://en.wikipedia.org/wiki/Tf%E2%80%93idf
- 主题建模: https://en.wikipedia.org/wiki/Topic_model
- 协同过滤: https://en.wikipedia.org/wiki/Collaborative_filtering

---

**文档版本**: v1.0  
**最后更新**: 2025-11-05  
**下次审查**: Phase 3 完成后
