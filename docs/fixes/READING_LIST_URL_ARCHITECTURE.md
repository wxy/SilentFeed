# 阅读清单 URL 管理架构分析

## 文档目标

本文档旨在全面分析推荐系统中 URL 的生命周期和决策机制，识别当前架构中的问题点，并提出统一的解决方案。

## 问题描述

### 用户报告的问题

1. **模式切换时 URL 类型混乱**
   - 从弹窗模式切换到阅读清单模式时
   - 应使用翻译链接的推荐反而使用了原文链接
   - 不应使用翻译链接的推荐反而使用了翻译链接

2. **推荐条目消失**
   - 再次从阅读清单模式切换回弹窗模式时
   - 之前转移的推荐条目消失

3. **问题反复出现**
   - 该问题已多次修复但仍然复现
   - 说明解决方案不够系统化，存在架构层面的缺陷

---

## 第一部分：系统架构概览

### 1.1 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                      推荐系统架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐     ┌──────────────────┐              │
│  │ RecommendationService │  │  ReadingListManager │          │
│  └──────────────────┘     └──────────────────┘              │
│         │                          │                          │
│         │ 生成推荐                  │ 管理阅读清单             │
│         ▼                          ▼                          │
│  ┌─────────────────────────────────────────┐                │
│  │          推荐数据库 (Recommendation)      │                │
│  │  - url: string                           │                │
│  │  - translation?: TranslationData         │                │
│  │  - sourceUrl?: string                    │                │
│  │  - savedToReadingList: boolean          │                │
│  └─────────────────────────────────────────┘                │
│                      │                                        │
│                      │ 模式切换                               │
│                      ▼                                        │
│  ┌─────────────────────────────────────────┐                │
│  │         background.ts                    │                │
│  │   DELIVERY_MODE_CHANGED 处理器            │                │
│  └─────────────────────────────────────────┘                │
│         │                          │                          │
│         ▼                          ▼                          │
│  [弹窗模式]                  [阅读清单模式]                    │
│  Popup 展示                Chrome Reading List               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 两种投递模式

#### 弹窗模式 (popup)
- 推荐存储在 `recommendations` 表
- 用户通过扩展弹窗查看
- 支持快速操作（已读、稍后读、不感兴趣）

#### 阅读清单模式 (readingList)  
- 推荐自动保存到 Chrome 原生阅读清单
- 用户通过浏览器阅读清单查看
- 扩展记录关联关系到 `readingListEntries` 表

---

## 第二部分：URL 的生命周期

### 2.1 推荐生成阶段

**入口**: `RecommendationService.generateRecommendations()`

```typescript
// 1. 收集文章（从 feedArticles 表）
const articles = await this.collectArticles(sources, batchSize)

// 2. 推荐管道处理
const result = await this.pipeline.process(inputs, profile, config)

// 3. 保存推荐到数据库
const recommendations = await this.saveRecommendations(highQualityArticles, config)
```

**关键点**:
- 此时推荐的 `url` 字段存储的是**文章的原始 URL**（来自 RSS feed）
- 使用 `normalizeUrlForTracking()` 进行去重

```typescript
// src/core/recommender/RecommendationService.ts:830
const recommendation: Recommendation = {
  id: `rec-${now}-${index}`,
  url: normalizedArticleUrl,  // ← 规范化后的原始URL
  title: article.title,
  summary: article.aiAnalysis?.summary || ...,
  sourceUrl: feedUrl,  // RSS 源 URL
  translation: article.aiAnalysis?.translatedTitle ? {
    sourceLanguage: ...,
    targetLanguage: ...,
    translatedTitle: article.aiAnalysis.translatedTitle,
    ...
  } : undefined
}
```

**存储状态**:
- `recommendations.url`: 原始文章 URL（规范化后）
- `recommendations.translation`: 如果 AI 提供了翻译，包含翻译数据
- `recommendations.sourceUrl`: 所属 RSS 源

### 2.2 自动翻译阶段

**入口**: `translateRecommendations()` （如果 `autoTranslate` 启用）

```typescript
// src/core/recommender/RecommendationService.ts:518
if (uiConfig.autoTranslate && recommendations.length > 0) {
  const translatedRecs = await translateRecommendations(recommendations)
  recommendations.splice(0, recommendations.length, ...translatedRecs)
}
```

**关键点**:
- 为没有 `translation` 字段的推荐补充翻译
- **不修改** `url` 字段（仍然是原始 URL）
- 只更新 `translation` 字段

**存储状态**:
- `recommendations.url`: **仍然是原始 URL**
- `recommendations.translation`: 补充完整的翻译数据

### 2.3 投递阶段

#### 2.3.1 阅读清单模式投递

**入口**: `RecommendationService.generateRecommendations()` → 阅读清单分支

```typescript
// src/core/recommender/RecommendationService.ts:534
if (deliveryMode === 'readingList' && ReadingListManager.isAvailable()) {
  for (const rec of recommendations) {
    await ReadingListManager.saveRecommendation(
      rec,
      uiConfig.autoTranslate,     // ← 自动翻译开关
      interfaceLanguage,          // ← 界面语言
      titlePrefix                 // ← 标题前缀
    )
  }
}
```

**`ReadingListManager.saveRecommendation()` 处理流程**:

```typescript
// src/core/reading-list/reading-list-manager.ts:203
// 1. 查询订阅源的翻译设置
let feedUseGoogleTranslate = true
if (recommendation.sourceUrl) {
  const feed = await feedManager.getFeedByUrl(recommendation.sourceUrl)
  if (feed) {
    feedUseGoogleTranslate = feed.useGoogleTranslate !== false
  }
}

// 2. 调用 URL 决策函数
const { url, title } = await ReadingListManager.decideRecommendationUrl(
  recommendation,
  autoTranslateEnabled,      // ← 全局自动翻译开关
  interfaceLanguage,
  feedUseGoogleTranslate,    // ← 订阅源翻译设置
  true                       // ← 附加推荐ID
)

// 3. 保存到 Chrome 阅读清单
await chrome.readingList.addEntry({
  title: finalTitle,
  url: urlToSave  // ← 可能是原文链接或翻译链接
})
```

**URL 决策逻辑** (`decideRecommendationUrl`):

```typescript
// src/core/reading-list/reading-list-manager.ts:129-170
// 兜底：先还原为原始链接
const baseOriginalUrl = normalizeUrlForTracking(recommendation.url)

// 决策1：订阅源禁用翻译 → 原文链接
if (!feedUseGoogleTranslate) {
  return { url: appendRecommendationId(baseOriginalUrl, ...), title: ... }
}

// 决策2：启用自动翻译 + 推荐已翻译 → 生成翻译链接
if (autoTranslateEnabled && recommendation.translation) {
  const originalWithRec = appendRecommendationId(baseOriginalUrl, ...)
  const encodedUrl = encodeURIComponent(originalWithRec)
  const finalUrl = `https://translate.google.com/translate?sl=auto&tl=${interfaceLanguage}&u=${encodedUrl}`
  return { url: finalUrl, title: recommendation.translation.translatedTitle }
}

// 决策3：其他情况 → 原文链接
return { url: appendRecommendationId(baseOriginalUrl, ...), title: ... }
```

**关键依赖**:
- ✅ `autoTranslateEnabled`: 用户的全局翻译开关
- ✅ `recommendation.translation`: 推荐是否已翻译
- ⚠️ `feedUseGoogleTranslate`: **运行时查询**订阅源设置

#### 2.3.2 弹窗模式投递

**入口**: `RecommendationService.generateRecommendations()` → 弹窗分支

```typescript
// src/core/recommender/RecommendationService.ts:544
if (deliveryMode === 'popup') {
  await sendRecommendationNotification(recommendations.length, {
    title: topRecommendation.title,
    source: topRecommendation.source,
    url: topRecommendation.url  // ← 使用原始 URL
  })
}
```

**关键点**:
- 推荐直接存储在数据库
- 弹窗展示时 URL 由前端决策（通过 `RecommendationView` 组件）

---

## 第三部分：模式切换流程

### 3.1 切换到阅读清单模式

**入口**: `background.ts` → `DELIVERY_MODE_CHANGED` 消息处理

```typescript
// src/background.ts:1252
case 'DELIVERY_MODE_CHANGED':
  (async () => {
    const { deliveryMode } = message
    
    // 1. 保存新模式配置
    await saveRecommendationConfig({ ...prevConfig, deliveryMode })
    
    // 2. 如果切换到阅读清单模式
    if (deliveryMode === 'readingList' && ReadingListManager.isAvailable()) {
      // 2.1 查询活跃推荐
      const activeRecs = await db.recommendations
        .filter(rec => {
          const isActive = !rec.status || rec.status === 'active'
          const isUnreadAndNotDismissed = !rec.isRead && rec.feedback !== 'dismissed'
          const isNotLater = rec.feedback !== 'later'
          return isActive && isUnreadAndNotDismissed && isNotLater
        })
        .toArray()
      
      // 2.2 获取配置
      const uiConfigResult = await chrome.storage.sync.get('ui_config')
      const autoTranslate = !!(uiConfigResult?.ui_config?.autoTranslate)
      const interfaceLanguage = navigator.language || 'zh-CN'
      
      // 2.3 逐个转移到阅读清单
      for (const rec of activeRecs) {
        await ReadingListManager.saveRecommendation(
          rec, 
          autoTranslate,           // ← 当前的全局翻译开关
          interfaceLanguage, 
          autoAddedPrefix
        )
      }
    }
  })()
```

**问题点 1**: **订阅源设置的运行时查询**

每次调用 `saveRecommendation` 时：
```typescript
// 内部会重新查询订阅源设置
const feed = await feedManager.getFeedByUrl(recommendation.sourceUrl)
feedUseGoogleTranslate = feed.useGoogleTranslate !== false
```

**可能导致的问题**:
1. **订阅源设置变更**: 如果用户在推荐生成后修改了订阅源的翻译设置
   - 推荐生成时：订阅源允许翻译 → `recommendation.translation` 有数据
   - 模式切换时：订阅源禁用翻译 → 查询得到 `feedUseGoogleTranslate = false`
   - 结果：有翻译数据但被决策为使用原文链接 ❌

2. **数据库查询失败**: 如果 `recommendation.sourceUrl` 不准确或订阅源已删除
   - 查询失败 → 默认 `feedUseGoogleTranslate = true`
   - 结果：决策可能与预期不符

3. **性能问题**: 每个推荐都要查询一次数据库
   - 如果有 10 条推荐，就要查询 10 次
   - 部分推荐可能来自同一个订阅源，造成重复查询

### 3.2 切换回弹窗模式

**入口**: `background.ts` → `DELIVERY_MODE_CHANGED` 消息处理

```typescript
// src/background.ts:1294
if (deliveryMode === 'popup') {
  // 1. 查询阅读清单条目
  const entries = await chrome.readingList.query({})
  
  // 2. 仅移除自动添加的条目（🤫 前缀）
  const autoAddedEntries = entries.filter(e => e.title?.startsWith(autoAddedPrefix))
  
  // 3. 逐个移除并恢复推荐
  for (const entry of autoAddedEntries) {
    await chrome.readingList.removeEntry({ url: entry.url })
    
    // 4. 恢复推荐到活跃状态
    const normalizedUrl = ReadingListManager.normalizeUrlForTracking(entry.url)
    const rlEntry = await db.readingListEntries.get(normalizedUrl)
    
    if (rlEntry?.recommendationId) {
      await db.recommendations.update(rlEntry.recommendationId, {
        savedToReadingList: false,
        status: 'active'
      })
    }
    
    await db.readingListEntries.delete(normalizedUrl)
  }
}
```

**问题点 2**: **URL 匹配失败**

阅读清单条目的 `entry.url` 可能是：
- **原文链接**: `https://example.com/article?sf_rec=rec-123`
- **翻译链接**: `https://translate.google.com/translate?u=https%3A%2F%2Fexample.com%2Farticle%3Fsf_rec%3Drec-123&...`

数据库查询时：
```typescript
const normalizedUrl = ReadingListManager.normalizeUrlForTracking(entry.url)
const rlEntry = await db.readingListEntries.get(normalizedUrl)
```

`readingListEntries` 表的数据是在 `saveRecommendation` 时写入的：
```typescript
// src/core/reading-list/reading-list-manager.ts:285
const normalizedUrl = ReadingListManager.normalizeUrlForTracking(urlToSave)
await db.readingListEntries.put({
  normalizedUrl,  // ← 主键
  url: urlToSave, // ← 可能是原文或翻译链接
  ...
})
```

**关键问题**:
- 如果保存时用的是**翻译链接**，`urlToSave` 就是翻译链接
- 移除时查询 `normalizeUrlForTracking(entry.url)` 得到**原始 URL**
- 但数据库中存的 `normalizedUrl` 可能基于**翻译链接**规范化
- **结果**: 查询不到 `rlEntry`，推荐无法恢复 ❌

---

## 第四部分：问题根源分析

### 4.1 核心矛盾

**推荐生成时的状态**:
```typescript
{
  url: "https://example.com/article",        // 原始 URL
  translation: {
    translatedTitle: "...",
    ...
  },
  sourceUrl: "https://example.com/feed.xml"  // RSS 源
}
```

**决策时需要的信息**:
1. ✅ `autoTranslateEnabled`: 全局翻译开关（来自 UI 配置）
2. ✅ `recommendation.translation`: 推荐是否已翻译（已存储）
3. ⚠️ `feedUseGoogleTranslate`: **订阅源翻译设置**（需要运行时查询）

### 4.2 为什么需要查询订阅源设置？

**设计意图**: 尊重用户对特定订阅源的翻译偏好

场景示例：
- 用户订阅了英文技术博客，**想要**看翻译版
- 用户订阅了中文新闻网站，**不想要**看翻译版（会翻译成英文）

订阅源级别的 `useGoogleTranslate` 设置允许用户精细控制。

### 4.3 问题的本质

**时间差导致的不一致**:

```
时间线:
T1: 推荐生成
    - 订阅源 A: useGoogleTranslate = true
    - 生成翻译链接并保存到阅读清单
    - 数据库记录: normalizedUrl 基于翻译链接

T2: 用户修改订阅源设置
    - 订阅源 A: useGoogleTranslate = false

T3: 模式切换（阅读清单 → 弹窗）
    - 查询订阅源设置: useGoogleTranslate = false
    - 决策: 应使用原文链接
    - 尝试查询数据库: normalizeUrlForTracking(原文链接)
    - 结果: 查询不到 rlEntry（因为存的是翻译链接的规范化URL）
    - 推荐无法恢复 ❌
```

### 4.4 数据不一致的累积

**多次修复未能解决的原因**:
1. **缺少状态快照**: 推荐生成时的决策依据未被保存
2. **运行时重新决策**: 模式切换时重新查询，可能得到不同结果
3. **URL 变换的不对称**: 原文 → 翻译容易，翻译 → 原文存在歧义
4. **缺少兜底机制**: URL 匹配失败时没有备用查询策略

---

## 第五部分：解决方案设计

### 5.1 设计原则

1. **一致性优先**: 推荐的 URL 类型在整个生命周期保持一致
2. **快照决策**: 关键决策依据在推荐生成时保存，后续不重新查询
3. **明确的真相源**: URL 存储遵循单一规范
4. **完善的兜底**: 多层查询策略确保数据恢复

### 5.2 核心策略：决策状态快照

**在推荐生成时保存决策依据**，避免后续重新查询。

#### 方案 A：扩展 Recommendation 类型（推荐 ✅）

```typescript
interface Recommendation {
  // ... 现有字段
  
  // 新增：URL 决策快照
  urlDecision?: {
    // 订阅源是否允许翻译（快照）
    feedAllowsTranslation: boolean
    
    // 决策时使用的最终 URL 类型
    urlType: 'original' | 'translated'
    
    // 如果是翻译链接，记录原始 URL（便于反向查询）
    originalUrl?: string
    
    // 决策时间戳
    decidedAt: number
  }
}
```

**优势**:
- ✅ 完整记录决策上下文
- ✅ 支持审计和调试
- ✅ 未来可扩展（如记录决策算法版本）

**实施复杂度**: 中等（需要修改类型定义和数据迁移）

#### 方案 B：简化方案 - 仅保存订阅源设置（可行 ⭐）

```typescript
interface Recommendation {
  // ... 现有字段
  
  // 新增：订阅源翻译设置（快照）
  feedUseGoogleTranslate?: boolean
}
```

**优势**:
- ✅ 修改最小，向后兼容
- ✅ 满足当前需求
- ✅ 可选字段，不影响现有数据

**劣势**:
- ⚠️ 信息不完整，调试困难
- ⚠️ 未来扩展性弱

### 5.3 推荐方案：方案 A + URL 规范化策略

**完整流程**:

#### 5.3.1 推荐生成阶段

```typescript
// src/core/recommender/RecommendationService.ts
private async saveRecommendations(...) {
  for (const article of recommendedArticles) {
    // 1. 查询订阅源设置（仅在生成时查询一次）
    let feedUseGoogleTranslate = true
    if (article.feedId) {
      const feed = await db.discoveredFeeds.get(article.feedId)
      if (feed) {
        feedUseGoogleTranslate = feed.useGoogleTranslate !== false
      }
    }
    
    // 2. 创建推荐对象
    const recommendation: Recommendation = {
      id: `rec-${now}-${index}`,
      url: normalizedArticleUrl,  // 始终存储原始 URL
      title: article.title,
      sourceUrl: feedUrl,
      translation: article.aiAnalysis?.translatedTitle ? {...} : undefined,
      
      // 新增：保存 URL 决策快照
      urlDecision: {
        feedAllowsTranslation: feedUseGoogleTranslate,
        urlType: 'original',  // 数据库中始终存储原始类型
        decidedAt: now
      }
    }
    
    // 3. 保存到数据库
    await db.recommendations.add(recommendation)
  }
}
```

#### 5.3.2 阅读清单投递阶段

```typescript
// src/core/recommender/RecommendationService.ts
if (deliveryMode === 'readingList' && ReadingListManager.isAvailable()) {
  for (const rec of recommendations) {
    // 直接使用快照的订阅源设置，不再查询
    const feedUseGoogleTranslate = rec.urlDecision?.feedAllowsTranslation ?? true
    
    await ReadingListManager.saveRecommendation(
      rec,
      uiConfig.autoTranslate,
      interfaceLanguage,
      titlePrefix,
      feedUseGoogleTranslate  // 传入快照值
    )
  }
}
```

#### 5.3.3 模式切换阶段

```typescript
// src/background.ts - DELIVERY_MODE_CHANGED
if (deliveryMode === 'readingList') {
  // 批量获取订阅源设置（优化性能）
  const feedManager = new FeedManager()
  const feedSettingsMap = new Map<string, boolean>()
  
  const uniqueSourceUrls = [...new Set(activeRecs.map(r => r.sourceUrl).filter(Boolean))]
  
  for (const sourceUrl of uniqueSourceUrls) {
    try {
      const feed = await feedManager.getFeedByUrl(sourceUrl)
      if (feed) {
        feedSettingsMap.set(sourceUrl, feed.useGoogleTranslate !== false)
      }
    } catch {
      feedSettingsMap.set(sourceUrl, true)
    }
  }
  
  for (const rec of activeRecs) {
    // 优先使用快照，如果没有快照则使用批量查询结果
    const feedUseGoogleTranslate = 
      rec.urlDecision?.feedAllowsTranslation ?? 
      (rec.sourceUrl ? feedSettingsMap.get(rec.sourceUrl) : true) ??
      true
    
    await ReadingListManager.saveRecommendation(
      rec,
      autoTranslate,
      interfaceLanguage,
      autoAddedPrefix,
      feedUseGoogleTranslate
    )
  }
}
```

#### 5.3.4 恢复推荐时的兜底策略

```typescript
// src/background.ts - 切换回弹窗模式
if (deliveryMode === 'popup') {
  const entries = await chrome.readingList.query({})
  const autoAddedEntries = entries.filter(e => e.title?.startsWith(autoAddedPrefix))
  
  for (const entry of autoAddedEntries) {
    await chrome.readingList.removeEntry({ url: entry.url })
    
    // 多层查询策略
    const normalizedUrl = ReadingListManager.normalizeUrlForTracking(entry.url)
    
    // 尝试1: 使用规范化 URL 查询
    let rlEntry = await db.readingListEntries.get(normalizedUrl)
    
    // 尝试2: 如果是翻译链接，提取原始 URL 再查询
    if (!rlEntry && entry.url.includes('translate.google.com')) {
      try {
        const urlObj = new URL(entry.url)
        const originalUrl = urlObj.searchParams.get('u')
        if (originalUrl) {
          const decodedOriginal = decodeURIComponent(originalUrl)
          const normalizedOriginal = ReadingListManager.normalizeUrlForTracking(decodedOriginal)
          rlEntry = await db.readingListEntries.get(normalizedOriginal)
        }
      } catch (err) {
        bgLogger.warn('提取翻译链接原始 URL 失败', err)
      }
    }
    
    // 尝试3: 遍历所有条目查找（最后兜底）
    if (!rlEntry) {
      const allEntries = await db.readingListEntries.toArray()
      rlEntry = allEntries.find(e => 
        ReadingListManager.normalizeUrlForTracking(e.url) === normalizedUrl
      )
    }
    
    // 恢复推荐
    if (rlEntry?.recommendationId) {
      await db.recommendations.update(rlEntry.recommendationId, {
        savedToReadingList: false,
        status: 'active'
      })
      bgLogger.info('已恢复推荐到弹窗模式', { recommendationId: rlEntry.recommendationId })
    } else {
      bgLogger.warn('无法找到对应的推荐条目', { url: entry.url, normalizedUrl })
    }
    
    await db.readingListEntries.delete(normalizedUrl)
  }
}
```

### 5.4 数据库架构调整

#### 5.4.1 Recommendation 表扩展

```typescript
// src/types/database.ts
export interface Recommendation {
  // ... 现有字段
  
  /** URL 决策快照（Phase 15: 解决模式切换 URL 混乱问题） */
  urlDecision?: {
    /** 订阅源是否允许翻译（生成时的快照） */
    feedAllowsTranslation: boolean
    
    /** URL 类型 */
    urlType: 'original' | 'translated'
    
    /** 如果存储的是翻译链接，记录原始 URL */
    originalUrl?: string
    
    /** 决策时间戳 */
    decidedAt: number
  }
}
```

#### 5.4.2 数据迁移策略

```typescript
// 为现有推荐补充默认值
async function migrateRecommendations() {
  const recommendations = await db.recommendations.toArray()
  
  for (const rec of recommendations) {
    if (!rec.urlDecision) {
      // 为旧数据补充默认快照
      await db.recommendations.update(rec.id, {
        urlDecision: {
          feedAllowsTranslation: true,  // 默认允许
          urlType: 'original',
          decidedAt: rec.recommendedAt || Date.now()
        }
      })
    }
  }
}
```

### 5.5 关键修改点汇总

| 文件 | 修改内容 | 优先级 |
|------|----------|--------|
| `src/types/database.ts` | 扩展 Recommendation 接口，添加 urlDecision 字段 | P0 |
| `src/core/recommender/RecommendationService.ts` | 生成推荐时保存 urlDecision 快照 | P0 |
| `src/core/recommender/RecommendationService.ts` | 阅读清单投递使用快照值 | P0 |
| `src/core/reading-list/reading-list-manager.ts` | saveRecommendation 优先使用传入的设置 | P0 |
| `src/background.ts` | 模式切换时批量查询+使用快照 | P0 |
| `src/background.ts` | 恢复推荐时的多层查询兜底 | P1 |
| 数据迁移脚本 | 为现有数据补充默认 urlDecision | P1 |

---

## 第六部分：测试场景设计

### 6.1 核心测试场景

#### 场景 1: 基本模式切换（允许翻译）

**前置条件**:
- 订阅源 A: `useGoogleTranslate = true`
- 全局自动翻译: 启用
- 推荐 R1 来自订阅源 A，已翻译

**操作步骤**:
1. 生成推荐 R1
2. 切换到阅读清单模式
3. 验证阅读清单中的条目是翻译链接
4. 切换回弹窗模式
5. 验证推荐 R1 恢复到活跃状态

**预期结果**:
- ✅ 阅读清单条目: 翻译链接 + 翻译标题
- ✅ 推荐恢复成功

#### 场景 2: 基本模式切换（禁用翻译）

**前置条件**:
- 订阅源 B: `useGoogleTranslate = false`
- 全局自动翻译: 启用
- 推荐 R2 来自订阅源 B

**操作步骤**:
1. 生成推荐 R2
2. 切换到阅读清单模式
3. 验证阅读清单中的条目是原文链接
4. 切换回弹窗模式
5. 验证推荐 R2 恢复到活跃状态

**预期结果**:
- ✅ 阅读清单条目: 原文链接 + 原文标题
- ✅ 推荐恢复成功

#### 场景 3: 订阅源设置变更（关键场景）

**前置条件**:
- 订阅源 A: `useGoogleTranslate = true`
- 全局自动翻译: 启用
- 推荐 R1 已生成并保存到阅读清单（翻译链接）

**操作步骤**:
1. 用户修改订阅源 A: `useGoogleTranslate = false`
2. 切换回弹窗模式
3. 验证推荐 R1 恢复状态

**预期结果**:
- ✅ 推荐 R1 成功恢复（使用快照，忽略新设置）
- ✅ `urlDecision.feedAllowsTranslation = true` （快照）

#### 场景 4: 批量推荐，混合订阅源

**前置条件**:
- 订阅源 A: `useGoogleTranslate = true`
- 订阅源 B: `useGoogleTranslate = false`
- 推荐 R1, R2, R3 来自 A（翻译）
- 推荐 R4, R5 来自 B（原文）

**操作步骤**:
1. 切换到阅读清单模式
2. 验证阅读清单中的 5 个条目
3. 切换回弹窗模式
4. 验证所有 5 个推荐恢复

**预期结果**:
- ✅ R1-R3: 翻译链接
- ✅ R4-R5: 原文链接
- ✅ 所有推荐成功恢复

#### 场景 5: 订阅源删除后的模式切换

**前置条件**:
- 推荐 R1 来自订阅源 A
- 用户删除订阅源 A

**操作步骤**:
1. 切换到阅读清单模式
2. 验证 R1 被正确保存（使用快照或默认值）
3. 切换回弹窗模式
4. 验证 R1 恢复

**预期结果**:
- ✅ 使用快照值或默认值（允许翻译）
- ✅ 推荐成功恢复

#### 场景 6: 全局翻译开关变更

**前置条件**:
- 全局自动翻译: 启用
- 推荐 R1 已翻译并保存到阅读清单

**操作步骤**:
1. 用户关闭全局自动翻译
2. 切换回弹窗模式
3. 验证 R1 恢复

**预期结果**:
- ✅ 推荐成功恢复
- ⚠️ 新生成的推荐不再使用翻译链接

### 6.2 边界测试场景

#### 场景 7: 无快照数据的旧推荐

**前置条件**:
- 推荐 R1 是数据迁移前生成的（无 urlDecision 字段）

**操作步骤**:
1. 切换到阅读清单模式
2. 验证使用默认策略

**预期结果**:
- ✅ 使用默认值（`feedAllowsTranslation = true`）
- ✅ 正常保存到阅读清单

#### 场景 8: 阅读清单条目手动修改

**前置条件**:
- 推荐 R1 已保存到阅读清单
- 用户在浏览器中手动标记为已读

**操作步骤**:
1. 切换回弹窗模式
2. 验证推荐状态

**预期结果**:
- ✅ 推荐 R1 标记为已读
- ✅ 从活跃推荐池移除

#### 场景 9: 网络错误时的兜底

**前置条件**:
- 推荐 R1 已保存到阅读清单
- 数据库查询异常

**操作步骤**:
1. 模拟数据库错误
2. 切换回弹窗模式
3. 验证错误处理

**预期结果**:
- ✅ 不抛出未捕获异常
- ✅ 记录警告日志
- ⚠️ 部分推荐可能无法恢复（记录失败原因）

### 6.3 性能测试

#### 场景 10: 大批量推荐（50条）

**前置条件**:
- 50 条推荐来自 10 个不同订阅源

**操作步骤**:
1. 切换到阅读清单模式
2. 测量转移耗时
3. 验证数据库查询次数

**预期结果**:
- ✅ 订阅源设置仅查询 10 次（批量优化）
- ✅ 总耗时 < 5 秒
- ✅ 所有推荐成功转移

---

## 第七部分：实施计划与风险评估

### 7.1 分阶段实施

#### Phase 1: 数据模型扩展（2-3小时）
- [ ] 扩展 `Recommendation` 接口，添加 `urlDecision` 字段
- [ ] 编写数据迁移脚本
- [ ] 单元测试：类型定义和迁移逻辑

#### Phase 2: 推荐生成改造（3-4小时）
- [ ] 修改 `RecommendationService.saveRecommendations()`
- [ ] 生成时保存 `urlDecision` 快照
- [ ] 单元测试：快照保存逻辑

#### Phase 3: 阅读清单管理改造（2-3小时）
- [ ] 修改 `ReadingListManager.saveRecommendation()`
- [ ] 优先使用传入的 `feedUseGoogleTranslate` 参数
- [ ] 单元测试：URL 决策逻辑

#### Phase 4: 模式切换改造（4-5小时）
- [ ] 修改 `background.ts` 的 `DELIVERY_MODE_CHANGED` 处理器
- [ ] 实现批量查询优化
- [ ] 实现多层查询兜底策略
- [ ] 单元测试：模式切换逻辑

#### Phase 5: 集成测试（3-4小时）
- [ ] 实现场景 1-6 的集成测试
- [ ] 实现边界测试场景 7-9
- [ ] 性能测试场景 10

#### Phase 6: 数据迁移与发布（1-2小时）
- [ ] 在开发环境运行迁移脚本
- [ ] 验证迁移结果
- [ ] 准备发布文档

**总计**: 15-21 小时

### 7.2 风险评估

#### 高风险项

**R1: 数据迁移失败**
- **概率**: 低
- **影响**: 高（用户数据损坏）
- **缓解**: 
  - 迁移前备份数据库
  - 在测试环境完整验证
  - 提供回滚机制

**R2: 性能退化**
- **概率**: 中
- **影响**: 中（用户体验下降）
- **缓解**:
  - 批量查询优化
  - 性能基准测试
  - 添加性能监控日志

#### 中风险项

**R3: 向后兼容性问题**
- **概率**: 中
- **影响**: 中（部分功能异常）
- **缓解**:
  - `urlDecision` 设为可选字段
  - 提供默认值兜底
  - 完善的单元测试覆盖

**R4: 边界情况遗漏**
- **概率**: 中
- **影响**: 低（特定场景失败）
- **缓解**:
  - 详细的测试场景设计
  - 多层兜底策略
  - 完善的错误日志

#### 低风险项

**R5: 用户体验变化**
- **概率**: 低
- **影响**: 低
- **缓解**:
  - 核心交互不变
  - 仅内部逻辑优化

### 7.3 成功标准

#### 功能标准
- ✅ 所有测试场景通过
- ✅ 现有单元测试不受影响
- ✅ 性能无明显退化（< 10%）

#### 质量标准
- ✅ 代码覆盖率 ≥ 70%
- ✅ 无 TypeScript 类型错误
- ✅ 所有修改点有完整注释

#### 用户体验标准
- ✅ 模式切换流畅（< 3 秒）
- ✅ 推荐恢复率 = 100%
- ✅ 无数据丢失

### 7.4 回滚方案

如果发现重大问题，可按以下步骤回滚：

1. **紧急回滚**（< 10分钟）:
   - 切换到上一个稳定版本
   - 用户数据不受影响（新字段可选）

2. **数据修复**（如需要）:
   - 运行数据清理脚本
   - 移除 `urlDecision` 字段（可选）

3. **问题诊断**:
   - 收集错误日志
   - 重现问题场景
   - 修复后重新发布

---

## 第八部分：总结与建议

### 8.1 核心洞察

1. **状态快照是关键**: 推荐的 URL 决策依赖于多个动态因素，必须在生成时快照保存
2. **数据一致性优于实时性**: 宁可使用过时但一致的快照，也不要实时查询导致不一致
3. **完善的兜底机制**: URL 匹配失败时必须有多层备用策略
4. **性能与正确性的平衡**: 批量查询减少数据库压力，快照避免重复查询

### 8.2 长期优化建议

1. **引入决策版本号**: 未来如果 URL 决策逻辑变更，可基于版本号迁移数据
2. **监控与告警**: 添加推荐恢复失败的监控指标
3. **用户设置审计**: 记录订阅源设置变更历史，便于调试
4. **URL 规范化测试**: 扩展测试覆盖更多边界情况（特殊字符、编码问题等）

### 8.3 下一步行动

**用户审核点**:
1. ✅ 架构设计是否合理？
2. ✅ 解决方案是否全面？
3. ✅ 测试场景是否充分？
4. ✅ 实施计划是否可行？

**待用户确认后**:
- 开始 Phase 1 实施
- 定期同步进展
- 每个 Phase 完成后请用户验证

---

## 附录

### A. 关键代码位置索引

| 功能 | 文件路径 | 行号范围 |
|------|----------|---------|
| 推荐生成 | `src/core/recommender/RecommendationService.ts` | 87-575 |
| 推荐保存 | `src/core/recommender/RecommendationService.ts` | 655-870 |
| URL 决策 | `src/core/reading-list/reading-list-manager.ts` | 129-170 |
| 阅读清单保存 | `src/core/reading-list/reading-list-manager.ts` | 180-350 |
| 模式切换处理 | `src/background.ts` | 1252-1350 |

### B. 数据库表结构

```typescript
// recommendations 表
{
  id: string                    // 主键
  url: string                   // 原始 URL（规范化）
  title: string
  sourceUrl?: string            // RSS 源 URL
  translation?: {               // 翻译数据
    translatedTitle: string
    targetLanguage: string
    ...
  }
  urlDecision?: {               // Phase 15: 新增
    feedAllowsTranslation: boolean
    urlType: 'original' | 'translated'
    originalUrl?: string
    decidedAt: number
  }
  savedToReadingList: boolean
  status: 'active' | 'replaced' | ...
  ...
}

// readingListEntries 表
{
  normalizedUrl: string         // 主键（规范化后的 URL）
  url: string                   // 实际保存到阅读清单的 URL
  recommendationId: string      // 关联的推荐 ID
  ...
}
```

### C. 术语表

- **原始 URL**: 文章的实际链接，来自 RSS feed
- **翻译链接**: 通过 Google Translate 包装的 URL
- **规范化 URL**: 移除追踪参数和翻译包装后的 URL
- **URL 决策**: 确定使用原始 URL 还是翻译链接的过程
- **快照**: 在特定时间点保存的状态副本
- **兜底机制**: 主要方案失败时的备用方案

---

**文档版本**: v1.0  
**创建时间**: 2026-01-15  
**作者**: AI Assistant  
**审核状态**: 待用户审核






