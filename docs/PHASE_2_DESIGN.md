# Phase 2: 页面访问监听 - 详细设计文档

**版本**: 1.0  
**日期**: 2025-11-02  
**状态**: 设计中  
**预计时间**: 3-4 小时

---

## 📋 目标

Phase 2 的核心目标是建立**页面访问数据收集系统**，为后续的用户画像构建和推荐引擎提供数据基础。

**关键成果**：
- ✅ 自动收集用户浏览行为
- ✅ 智能判断有效访问
- ✅ 提取和分析页面内容
- ✅ 实时显示收集进度
- ✅ 用户可见的反馈

---

## 🎯 功能范围

### Phase 2 完成的功能

1. **Content Script 监听系统**
   - 页面激活状态监听
   - 用户交互检测（滚动、点击、输入）
   - 智能停留时间计算
   - 两阶段记录机制

2. **动态停留阈值系统**
   - 三阶段自适应算法
   - 用户可配置范围
   - 实时阈值显示

3. **页面过滤引擎**
   - URL 模式过滤
   - 域名黑名单
   - 内容特征过滤
   - 用户自定义规则

4. **内容提取和基础分析**
   - 元数据提取
   - 正文摘要提取
   - TF-IDF 关键词提取
   - 简单主题分类（规则引擎）

5. **数据存储系统**
   - IndexedDB（Dexie.js）
   - 4 张表设计
   - 数据生命周期管理

6. **实时反馈界面**
   - Popup 统计显示
   - 设置页数据统计标签
   - 徽章实时更新

### Phase 3 将完成的功能

- ❌ 用户画像构建（主题权重、兴趣分布）
- ❌ AI 深度分析（LLM 内容理解）
- ❌ 时间衰减算法
- ❌ 协同过滤推荐

---

## 🏗️ 系统架构

### 整体流程

```
用户浏览网页
    ↓
Content Script 注入
    ↓
[过滤] URL 黑名单检查 → 排除 → 不记录
    ↓ 通过
[临时记录] 创建 PendingVisit
    ↓
监听用户交互（滚动、点击）
    ↓
计算有效停留时间
    ↓
[判断] 达到阈值？
    ↓ 是
[内容提取] 提取页面内容
    ↓
[基础分析] TF-IDF + 主题分类
    ↓
[正式记录] 升级为 ConfirmedVisit
    ↓
[更新 UI] 更新徽章和统计
    ↓
[定期清理] 删除 90 天前的原始数据
```

### 模块划分

```
src/
├── contents/
│   └── page-tracker.ts          # Content Script 主文件
├── core/
│   ├── tracker/
│   │   ├── InteractionTracker.ts    # 交互监听器
│   │   ├── DwellTimeCalculator.ts   # 停留时间计算
│   │   └── PageFilter.ts            # 页面过滤引擎
│   ├── extractor/
│   │   ├── ContentExtractor.ts      # 内容提取器
│   │   └── MetadataExtractor.ts     # 元数据提取
│   └── analyzer/
│       ├── KeywordExtractor.ts      # 关键词提取（TF-IDF）
│       └── TopicClassifier.ts       # 主题分类（规则引擎）
├── storage/
│   ├── db.ts                        # Dexie 数据库定义
│   ├── types.ts                     # 数据类型定义
│   └── repositories/
│       ├── VisitRepository.ts       # 访问记录仓库
│       └── SettingsRepository.ts    # 设置仓库
└── background/
    ├── visit-manager.ts             # 访问记录管理器
    └── cleanup-scheduler.ts         # 数据清理调度器
```

---

## 💾 数据库设计

### 表结构

#### 表 1: pendingVisits（临时访问记录）

```typescript
interface PendingVisit {
  id: string                    // UUID
  url: string                   // 完整 URL
  title: string                 // 页面标题
  domain: string                // 域名
  startTime: number             // 开始时间戳
  lastActiveTime: number        // 最后激活时间
  lastInteractionTime: number   // 最后交互时间
  activeDuration: number        // 累计激活时间（秒）
  interactionCount: number      // 交互次数
  isActive: boolean             // 当前是否激活
  expiresAt: number             // 过期时间（5 分钟后）
  status: 'pending'
}

// 索引
PRIMARY KEY: id
INDEX: url, startTime, expiresAt
```

**用途**：
- 临时存储正在浏览的页面
- 记录激活和交互状态
- 5 分钟无交互自动删除
- 达到阈值后升级为正式记录

#### 表 2: confirmedVisits（正式访问记录）

```typescript
interface ConfirmedVisit {
  id: string                    // UUID
  url: string                   // 完整 URL
  title: string                 // 页面标题
  domain: string                // 域名
  
  // 内容信息
  meta: {
    description?: string        // 页面描述
    keywords?: string[]         // 元关键词
    author?: string             // 作者
    publishedTime?: string      // 发布时间
  }
  
  contentSummary: {
    firstParagraph: string      // 首段（500 字）
    extractedText: string       // 正文摘要（2000 字）
    wordCount: number           // 字数
  }
  
  // 分析结果（永久保留）
  analysis: {
    keywords: string[]          // Top 20 关键词
    topics: string[]            // 主题标签
    language: 'zh' | 'en'       // 语言
  }
  
  // 访问信息
  duration: number              // 停留时长（秒）
  interactionCount: number      // 交互次数
  visitTime: number             // 访问时间戳
  
  status: 'qualified'
  
  // 数据生命周期
  contentRetainUntil: number    // 内容保留到期时间（90 天后）
  analysisRetainUntil: -1       // 分析结果永久保留
}

// 索引
PRIMARY KEY: id
INDEX: domain, visitTime, *keywords
COMPOUND INDEX: (visitTime, domain)
```

**用途**：
- 存储满足条件的访问记录
- 保留分析结果用于画像构建
- 原始内容 90 天后删除
- 关键词和主题永久保留

---

## 📄 第一部分文档完成

接下来我将继续添加：
- 停留时间计算算法
- 动态阈值系统
- 页面过滤规则
- 内容提取策略

请确认这部分是否符合预期？

---

## ⏱️ 停留时间计算算法

### 核心原则

**有效停留时间** = 页面激活状态 + 有用户交互（或最近有交互）

### 实现逻辑

```typescript
class DwellTimeCalculator {
  private startTime: number
  private lastActiveTime: number
  private lastInteractionTime: number
  private totalActiveTime: number = 0
  private isCurrentlyActive: boolean = true
  
  constructor() {
    this.startTime = Date.now()
    this.lastActiveTime = this.startTime
    this.lastInteractionTime = this.startTime
  }
  
  /**
   * 页面激活状态改变
   */
  onVisibilityChange(isVisible: boolean) {
    const now = Date.now()
    
    if (isVisible) {
      // 页面激活：开始计时
      this.isCurrentlyActive = true
      this.lastActiveTime = now
    } else {
      // 页面失活：累计激活时间
      if (this.isCurrentlyActive) {
        this.totalActiveTime += (now - this.lastActiveTime) / 1000
        this.isCurrentlyActive = false
      }
    }
  }
  
  /**
   * 用户交互事件
   */
  onInteraction(type: 'scroll' | 'click' | 'keypress' | 'mousemove') {
    const now = Date.now()
    this.lastInteractionTime = now
    
    // 如果页面激活，更新激活时间
    if (this.isCurrentlyActive) {
      this.lastActiveTime = now
    }
  }
  
  /**
   * 获取当前有效停留时间
   */
  getEffectiveDwellTime(): number {
    const now = Date.now()
    let effectiveTime = this.totalActiveTime
    
    // 如果当前激活，加上当前的激活时间
    if (this.isCurrentlyActive) {
      effectiveTime += (now - this.lastActiveTime) / 1000
    }
    
    // 关键判断：如果超过 30 秒没有交互，不计入后续时间
    const timeSinceLastInteraction = (now - this.lastInteractionTime) / 1000
    if (timeSinceLastInteraction > 30) {
      // 只计算到最后交互时间的停留
      const timeUntilLastInteraction = 
        (this.lastInteractionTime - this.startTime) / 1000
      return Math.min(effectiveTime, timeUntilLastInteraction)
    }
    
    return effectiveTime
  }
}
```

### 交互监听策略

```typescript
// 监听事件及频率控制

// 1. 滚动事件（节流：2 秒内最多记录 1 次）
document.addEventListener('scroll', throttle(() => {
  calculator.onInteraction('scroll')
}, 2000))

// 2. 点击事件（无节流，每次都记录）
document.addEventListener('click', () => {
  calculator.onInteraction('click')
})

// 3. 键盘输入（无节流）
document.addEventListener('keypress', () => {
  calculator.onInteraction('keypress')
})

// 4. 鼠标移动（节流：5 秒内最多记录 1 次）
document.addEventListener('mousemove', throttle(() => {
  calculator.onInteraction('mousemove')
}, 5000))

// 5. 页面可见性
document.addEventListener('visibilitychange', () => {
  calculator.onVisibilityChange(!document.hidden)
})
```

---

## 🎚️ 动态停留阈值系统

### 三阶段自适应算法

```typescript
class DwellTimeThresholdManager {
  private readonly COLD_START_THRESHOLD = 30  // 冷启动固定阈值：30 秒
  private readonly COLD_START_SAMPLES = 100   // 冷启动样本数
  
  /**
   * 获取当前阈值
   */
  async getCurrentThreshold(settings: UserSettings): Promise<number> {
    const visitCount = await db.confirmedVisits.count()
    
    // 阶段 1: 冷启动（0-100 页）
    if (visitCount < this.COLD_START_SAMPLES) {
      return this.COLD_START_THRESHOLD
    }
    
    // 阶段 2 & 3: 自适应（100+ 页）
    if (settings.dwellTime.mode === 'fixed') {
      return settings.dwellTime.fixedThreshold
    }
    
    return this.calculateAdaptiveThreshold(settings)
  }
  
  /**
   * 计算自适应阈值
   */
  private async calculateAdaptiveThreshold(
    settings: UserSettings
  ): Promise<number> {
    // 取最近 1000 页的停留时间中位数
    const recentVisits = await db.confirmedVisits
      .orderBy('visitTime')
      .reverse()
      .limit(1000)
      .toArray()
    
    const durations = recentVisits.map(v => v.duration).sort((a, b) => a - b)
    const median = durations[Math.floor(durations.length / 2)]
    
    // 阈值 = 中位数 * 0.5
    let threshold = Math.round(median * 0.5)
    
    // 限制在用户设置的范围内
    threshold = Math.max(settings.dwellTime.minThreshold, threshold)
    threshold = Math.min(settings.dwellTime.maxThreshold, threshold)
    
    return threshold
  }
  
  /**
   * 每新增 100 页重新计算一次
   */
  async updateThresholdIfNeeded(): Promise<void> {
    const visitCount = await db.confirmedVisits.count()
    
    // 每 100 页计算一次
    if (visitCount > 0 && visitCount % 100 === 0) {
      const settings = await db.settings.get('singleton')
      const newThreshold = await this.calculateAdaptiveThreshold(settings)
      
      await db.settings.update('singleton', {
        'dwellTime.calculatedThreshold': newThreshold
      })
      
      console.log(`✅ 阈值已更新: ${newThreshold} 秒（基于 ${visitCount} 页样本）`)
    }
  }
}
```

### 用户设置数据结构

```typescript
interface UserSettings {
  id: 'singleton'
  
  dwellTime: {
    mode: 'auto' | 'fixed'        // 自动 or 手动
    fixedThreshold: number         // 手动设定值
    minThreshold: number           // 最小阈值（默认 15 秒）
    maxThreshold: number           // 最大阈值（默认 120 秒）
    calculatedThreshold: number    // 当前计算值
  }
  
  // ... 其他设置
}
```

---

## 🚫 页面过滤引擎

### 多层过滤机制

```typescript
class PageFilter {
  /**
   * 第一层：URL 模式过滤
   */
  private readonly EXCLUDED_URL_PATTERNS = [
    // 内网地址
    /^https?:\/\/(localhost|127\.0\.0\.1)/,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/10\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
    
    // 浏览器内置
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^about:/,
    /^edge:\/\//,
    
    // 特殊协议
    /^data:/,
    /^blob:/,
    /^file:\/\//,
  ]
  
  /**
   * 第二层：敏感域名黑名单
   */
  private readonly SENSITIVE_DOMAINS = [
    // 邮件
    'mail.google.com',
    'outlook.live.com',
    'outlook.office.com',
    
    // 银行（模式匹配）
    /.*bank.*/i,
    /.*banking.*/i,
    
    // 医疗
    /.*hospital.*/i,
    /.*clinic.*/i,
    /.*health.*/i,
    
    // 登录页
    'accounts.google.com',
    'login.live.com',
    'login.microsoftonline.com',
    'signin.ebay.com',
  ]
  
  /**
   * 第三层：内容特征过滤
   */
  isContentPage(pageData: PageData): boolean {
    // 1. 字数检查
    if (pageData.wordCount < 300) {
      return false
    }
    
    // 2. 标题特征
    const titleLower = pageData.title.toLowerCase()
    const excludedTitles = ['404', 'not found', 'error', '登录', '注册', 'sign in', 'sign up']
    if (excludedTitles.some(word => titleLower.includes(word))) {
      return false
    }
    
    // 3. 搜索结果页
    if (this.isSearchResultPage(pageData.url)) {
      return false
    }
    
    return true
  }
  
  /**
   * 判断是否为搜索结果页
   */
  private isSearchResultPage(url: string): boolean {
    const searchEngines = [
      'google.com/search',
      'bing.com/search',
      'baidu.com/s',
      'duckduckgo.com/',
    ]
    return searchEngines.some(pattern => url.includes(pattern))
  }
  
  /**
   * 完整过滤流程
   */
  async shouldTrackPage(url: string, pageData?: PageData): Promise<{
    shouldTrack: boolean
    reason?: string
  }> {
    // 1. URL 模式检查
    for (const pattern of this.EXCLUDED_URL_PATTERNS) {
      if (pattern.test(url)) {
        return { shouldTrack: false, reason: 'URL pattern excluded' }
      }
    }
    
    // 2. 域名黑名单检查
    const domain = new URL(url).hostname
    for (const excluded of this.SENSITIVE_DOMAINS) {
      if (typeof excluded === 'string' && excluded === domain) {
        return { shouldTrack: false, reason: 'Sensitive domain' }
      }
      if (excluded instanceof RegExp && excluded.test(domain)) {
        return { shouldTrack: false, reason: 'Sensitive domain pattern' }
      }
    }
    
    // 3. 用户自定义规则
    const customRules = await this.getUserExclusionRules()
    if (customRules.some(rule => domain.includes(rule))) {
      return { shouldTrack: false, reason: 'User exclusion rule' }
    }
    
    // 4. 内容特征检查（如果提供了页面数据）
    if (pageData && !this.isContentPage(pageData)) {
      return { shouldTrack: false, reason: 'Not a content page' }
    }
    
    return { shouldTrack: true }
  }
}
```

---

## 📄 第二部分文档完成

接下来我将继续添加：
- 内容提取策略
- 文本分析算法
- 数据生命周期管理
- UI 反馈设计

请确认这部分核心算法设计是否合理？

---

## 📝 内容提取策略

### 分层提取方案

```typescript
class ContentExtractor {
  /**
   * 完整提取流程
   */
  async extractPageContent(document: Document): Promise<PageContent> {
    return {
      // 层级 1: 基础元数据（总是提取）
      meta: this.extractMetadata(document),
      
      // 层级 2: 正文内容（可选）
      contentSummary: this.extractContentSummary(document),
      
      // 层级 3: 结构化数据（可选）
      structured: this.extractStructuredData(document)
    }
  }
  
  /**
   * 提取元数据
   */
  private extractMetadata(doc: Document): PageMetadata {
    return {
      description: this.getMetaTag(doc, 'description'),
      keywords: this.getMetaTag(doc, 'keywords')?.split(',').map(k => k.trim()),
      author: this.getMetaTag(doc, 'author'),
      publishedTime: this.getMetaTag(doc, 'article:published_time') 
                  || this.getMetaTag(doc, 'datePublished'),
      ogImage: this.getMetaTag(doc, 'og:image'),
      canonical: doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
    }
  }
  
  /**
   * 提取正文摘要
   */
  private extractContentSummary(doc: Document): ContentSummary {
    // 1. 尝试提取 <article> 标签
    let mainContent = doc.querySelector('article')?.textContent
    
    // 2. 如果没有，尝试 main 标签
    if (!mainContent) {
      mainContent = doc.querySelector('main')?.textContent
    }
    
    // 3. 如果还是没有，使用启发式算法
    if (!mainContent) {
      mainContent = this.extractMainContent(doc)
    }
    
    // 清洗文本
    const cleaned = this.cleanText(mainContent || '')
    
    return {
      firstParagraph: cleaned.substring(0, 500),  // 前 500 字
      extractedText: cleaned.substring(0, 2000),  // 前 2000 字
      wordCount: cleaned.length,
      language: this.detectLanguage(cleaned)
    }
  }
  
  /**
   * 启发式正文提取
   */
  private extractMainContent(doc: Document): string {
    // 按 <p> 标签密度找正文区域
    const paragraphs = Array.from(doc.querySelectorAll('p'))
    
    // 找到 <p> 标签最密集的父容器
    const densityMap = new Map<Element, number>()
    paragraphs.forEach(p => {
      let parent = p.parentElement
      while (parent && parent !== doc.body) {
        densityMap.set(parent, (densityMap.get(parent) || 0) + 1)
        parent = parent.parentElement
      }
    })
    
    // 取密度最高的容器
    let maxDensity = 0
    let mainContainer: Element | null = null
    densityMap.forEach((density, element) => {
      if (density > maxDensity) {
        maxDensity = density
        mainContainer = element
      }
    })
    
    return mainContainer?.textContent || doc.body.textContent || ''
  }
  
  /**
   * 文本清洗
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')           // 多个空白符合并
      .replace(/\n+/g, '\n')          // 多个换行合并
      .trim()
  }
  
  /**
   * 简单语言检测
   */
  private detectLanguage(text: string): 'zh' | 'en' {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    return chineseChars > text.length * 0.3 ? 'zh' : 'en'
  }
}
```

---

## 🔍 基础文本分析

### TF-IDF 关键词提取

```typescript
import natural from 'natural'
import { removeStopwords } from 'stopword'

class KeywordExtractor {
  private tfidf: natural.TfIdf
  
  constructor() {
    this.tfidf = new natural.TfIdf()
  }
  
  /**
   * 提取关键词
   */
  async extractKeywords(text: string, language: 'zh' | 'en'): Promise<string[]> {
    // 1. 分词
    const tokens = this.tokenize(text, language)
    
    // 2. 移除停用词
    const filtered = removeStopwords(tokens, language === 'zh' ? 'zh' : undefined)
    
    // 3. 计算 TF-IDF
    this.tfidf.addDocument(filtered.join(' '))
    
    // 4. 提取 Top 20
    const keywords: string[] = []
    this.tfidf.listTerms(0).slice(0, 20).forEach(item => {
      if (item.term.length > 1) {  // 过滤单字
        keywords.push(item.term)
      }
    })
    
    return keywords
  }
  
  /**
   * 分词
   */
  private tokenize(text: string, language: 'zh' | 'en'): string[] {
    if (language === 'zh') {
      // 中文分词（使用 natural 的 WordTokenizer）
      const tokenizer = new natural.WordTokenizer()
      return tokenizer.tokenize(text)
    } else {
      // 英文分词
      const tokenizer = new natural.WordTokenizer()
      return tokenizer.tokenize(text.toLowerCase())
    }
  }
}
```

### 简单主题分类（规则引擎）

```typescript
class TopicClassifier {
  private readonly TOPIC_RULES = {
    technology: {
      keywords: ['技术', '编程', 'programming', 'code', 'javascript', 
                 'python', 'react', 'api', 'database', '开发'],
      weight: 1.0
    },
    design: {
      keywords: ['设计', 'design', 'UI', 'UX', 'figma', 'sketch', 
                 '界面', '交互', 'typography', '颜色'],
      weight: 1.0
    },
    science: {
      keywords: ['科学', 'science', '研究', 'research', '论文', 'paper',
                 '实验', '数据', 'study'],
      weight: 1.0
    },
    business: {
      keywords: ['商业', 'business', '创业', 'startup', '管理', 'management',
                 '市场', 'marketing', '战略'],
      weight: 1.0
    },
    // ... 更多主题
  }
  
  /**
   * 分类主题
   */
  classifyTopics(keywords: string[]): string[] {
    const scores: Record<string, number> = {}
    
    // 计算每个主题的匹配分数
    Object.entries(this.TOPIC_RULES).forEach(([topic, rule]) => {
      let score = 0
      keywords.forEach(keyword => {
        if (rule.keywords.includes(keyword.toLowerCase())) {
          score += rule.weight
        }
      })
      scores[topic] = score
    })
    
    // 返回分数 > 0 的主题
    return Object.entries(scores)
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
  }
}
```

---

## 🗂️ 数据生命周期管理

### 清理策略

```typescript
class DataLifecycleManager {
  /**
   * 数据保留策略
   */
  private readonly RETENTION_POLICY = {
    // 原始访问数据
    rawVisits: {
      retentionDays: 90,        // 90 天后删除
      fields: ['contentSummary'] // 删除这些字段
    },
    
    // 分析结果
    analysisResults: {
      retentionDays: -1,        // 永久保留
      fields: ['analysis']
    },
    
    // 临时记录
    pendingVisits: {
      expiresAfterMinutes: 5    // 5 分钟后过期
    }
  }
  
  /**
   * 清理过期的临时记录
   */
  async cleanupPendingVisits(): Promise<number> {
    const now = Date.now()
    const deleted = await db.pendingVisits
      .where('expiresAt')
      .below(now)
      .delete()
    
    console.log(`🗑️ 清理了 ${deleted} 条过期的临时记录`)
    return deleted
  }
  
  /**
   * 清理 90 天前的原始内容
   */
  async cleanupOldContent(): Promise<number> {
    const cutoffTime = Date.now() - (90 * 24 * 60 * 60 * 1000)
    
    // 只删除 contentSummary 字段，保留其他数据
    const oldVisits = await db.confirmedVisits
      .where('visitTime')
      .below(cutoffTime)
      .toArray()
    
    let updated = 0
    for (const visit of oldVisits) {
      if (visit.contentSummary) {
        await db.confirmedVisits.update(visit.id, {
          contentSummary: null,  // 删除原始内容
          // 保留 meta 和 analysis
        })
        updated++
      }
    }
    
    console.log(`🗑️ 清理了 ${updated} 条记录的原始内容（保留分析结果）`)
    return updated
  }
  
  /**
   * 定时任务调度
   */
  async scheduleCleanup(): Promise<void> {
    // 每 5 分钟清理过期临时记录
    setInterval(() => {
      this.cleanupPendingVisits()
    }, 5 * 60 * 1000)
    
    // 每天凌晨 3 点清理旧内容
    chrome.alarms.create('dailyCleanup', {
      when: this.getTomorrowAt3AM(),
      periodInMinutes: 24 * 60
    })
    
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'dailyCleanup') {
        this.cleanupOldContent()
      }
    })
  }
}
```

### 用户数据控制

```typescript
class DataManager {
  /**
   * 清空访问历史（保留分析结果）
   */
  async clearVisitHistory(): Promise<void> {
    const visits = await db.confirmedVisits.toArray()
    
    for (const visit of visits) {
      await db.confirmedVisits.update(visit.id, {
        url: '[已删除]',
        title: '[已删除]',
        contentSummary: null,
        meta: {}
        // 保留 analysis
      })
    }
    
    console.log('✅ 访问历史已清空（分析结果已保留）')
  }
  
  /**
   * 重置用户画像（Phase 3 实现）
   */
  async resetUserProfile(): Promise<void> {
    // Phase 3: 删除用户画像数据
    // Phase 2: 暂不实现
    console.log('⚠️ 画像重置功能将在 Phase 3 实现')
  }
  
  /**
   * 完全重置（删除所有数据）
   */
  async fullReset(): Promise<void> {
    if (!confirm('确定要删除所有数据吗？此操作不可恢复！')) {
      return
    }
    
    await db.pendingVisits.clear()
    await db.confirmedVisits.clear()
    // 保留 settings（用户配置）
    
    console.log('✅ 所有数据已删除')
  }
}
```

---

## 🎨 UI 反馈设计

### Popup 界面增强

```typescript
// src/popup.tsx 新增统计显示

interface PopupStats {
  visitCount: number
  currentStage: ProgressStage
  topTopics: Array<{ name: string; percentage: number }>
}

async function loadStats(): Promise<PopupStats> {
  const visitCount = await db.confirmedVisits.count()
  const currentStage = BadgeManager.getStage(visitCount)
  
  // 统计最近 100 页的主题分布
  const recentVisits = await db.confirmedVisits
    .orderBy('visitTime')
    .reverse()
    .limit(100)
    .toArray()
  
  const topicCounts: Record<string, number> = {}
  recentVisits.forEach(visit => {
    visit.analysis.topics.forEach(topic => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1
    })
  })
  
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({
      name,
      percentage: Math.round((count / recentVisits.length) * 100)
    }))
  
  return { visitCount, currentStage, topTopics }
}
```

### 设置页新增"数据统计"标签

```typescript
// src/options.tsx 新增 tab

type TabKey = "general" | "rss" | "ai" | "privacy" | "statistics"  // 新增 statistics

// 统计数据结构
interface Statistics {
  totalVisits: number
  qualifiedVisits: number
  excludedVisits: number
  avgDwellTime: number
  currentThreshold: number
  topDomains: Array<{ domain: string; count: number }>
}
```

---

## 📄 设计文档完成

Phase 2 详细设计文档已完成！

**包含内容**：
- ✅ 系统架构和模块划分
- ✅ 数据库表结构设计
- ✅ 停留时间计算算法
- ✅ 动态阈值自适应系统
- ✅ 多层页面过滤机制
- ✅ 内容提取策略
- ✅ TF-IDF 关键词提取
- ✅ 简单主题分类
- ✅ 数据生命周期管理
- ✅ UI 反馈设计

接下来我将：
1. 更新 `DEVELOPMENT_PLAN.md`
2. 创建功能分支
3. 开始第一个小任务开发

是否继续？


