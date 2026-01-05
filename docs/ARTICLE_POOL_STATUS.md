# 文章池状态流转

本文档描述 Silent Feed 推荐系统中文章的状态流转机制。

## 状态定义 (poolStatus)

| 状态 | 英文 | 说明 |
|------|------|------|
| 原料池 | `raw` | 新文章，通过 AI 初筛，等待 AI 深度分析 |
| 初筛淘汰 | `prescreened-out` | AI 初筛认为不值得详细分析，跳过后续流程 |
| 分析未达标 | `analyzed-not-qualified` | 已进行 AI 深度分析，但得分未达推荐阈值 |
| 候选池 | `candidate` | 高分文章，等待推荐给用户 |
| 推荐池 | `recommended` | 已推荐给用户，显示在推荐列表中 |

## 状态流转图

```
┌─────────────────────────────────────────────────────────────────┐
│                        RSS 订阅源更新                            │
│                    (feed-scheduler.ts)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    AI 初筛      │
                    │ FeedPreScreening│
                    │   Service.ts    │
                    └─────────────────┘
                      │           │
            ┌─────────┘           └─────────┐
            ▼                               ▼
   ┌─────────────────┐           ┌─────────────────┐
   │ prescreened-out │           │      raw        │
   │   (初筛淘汰)     │           │   (原料池)      │
   │                 │           │                 │
   │ 保存到DB，不再  │           │ 保存到DB，等待  │
   │ 进入后续流程    │           │ AI深度分析      │
   └─────────────────┘           └─────────────────┘
            │                               │
            │ ❌ 终止                        ▼
            │                    ┌─────────────────┐
            │                    │  全文抓取       │
            │                    │  + AI 深度分析  │
            │                    │  pipeline.ts    │
            │                    └─────────────────┘
            │                      │           │
            │            ┌─────────┘           └─────────┐
            │            ▼                               ▼
            │   ┌─────────────────┐           ┌─────────────────┐
            │   │analyzed-not-    │           │   candidate     │
            │   │qualified        │           │   (候选池)      │
            │   │(分析未达标)      │           │                 │
            │   │                 │           │ 高分文章        │
            │   │ 分数 < 阈值     │           │ 等待推荐        │
            │   └─────────────────┘           └─────────────────┘
            │            │                              │
            │            │ ❌ 终止                       ▼
            │            │                    ┌─────────────────┐
            │            │                    │  推荐调度器      │
            │            │                    │ recommend-      │
            │            │                    │ scheduler.ts    │
            │            │                    └─────────────────┘
            │            │                              │
            │            │                              ▼
            │            │                    ┌─────────────────┐
            │            │                    │   recommended   │
            │            │                    │   (推荐池)      │
            │            │                    │                 │
            │            │                    │ 显示在用户的    │
            │            │                    │ 推荐列表中      │
            │            │                    └─────────────────┘
            │            │                              │
            ▼            ▼                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                   池退出 (poolExitReason)                    │
   │                                                              │
   │  • read: 用户已阅读                                          │
   │  • saved: 用户稍后读（加入阅读列表）                          │
   │  • disliked: 用户点了"不想读"                                 │
   │  • replaced: 被更高分文章替换（池满时）                       │
   │  • expired: 过期（超过保鲜期）                                │
   │  • quality_dropped: 重新分析后质量下降                        │
   │  • feed_unsubscribed: 所属订阅源被取消订阅                    │
   │  • feed_deleted: 所属订阅源被删除                             │
   └─────────────────────────────────────────────────────────────┘
```

## 相关字段

### FeedArticle 类型中的池相关字段

```typescript
interface FeedArticle {
  // 池状态（Phase 13 主要字段）
  poolStatus?: 'raw' | 'prescreened-out' | 'analyzed-not-qualified' | 'candidate' | 'recommended' | 'exited'
  
  // AI 分析得分 (0-10)
  analysisScore?: number
  
  // 时间戳
  candidatePoolAddedAt?: number    // 进入候选池时间
  recommendedPoolAddedAt?: number  // 进入推荐池时间
  poolExitedAt?: number            // 退出池时间
  
  // 退出原因
  poolExitReason?: 'read' | 'disliked' | 'saved' | 'replaced' | 'expired' | 'quality_dropped'
}
```

## 各阶段处理逻辑

### 1. AI 初筛 (FeedPreScreeningService)

- **输入**: RSS 新抓取的文章列表
- **处理**: 调用 AI 判断文章是否值得深度分析
- **输出**: 
  - 通过 → `poolStatus: 'raw'`
  - 未通过 → `poolStatus: 'prescreened-out'`
- **特点**: 增量处理，已存在的文章跳过

### 2. AI 深度分析 (pipeline.ts)

- **输入**: 原料池 (`raw`) 中的文章
- **处理**: 
  1. 抓取文章全文
  2. AI 评分 (0-10)
  3. 与用户画像匹配度计算
- **输出**:
  - 分数 ≥ 阈值 → `poolStatus: 'candidate'`
  - 分数 < 阈值 → `poolStatus: 'analyzed-not-qualified'`

### 3. 推荐调度 (recommend-scheduler.ts)

- **输入**: 候选池 (`candidate`) 中的文章
- **处理**: 按策略从候选池选取文章推送给用户
- **输出**: `poolStatus: 'recommended'`

## 数据库查询示例

```typescript
import { db } from '@/storage/db'

// 获取各池数量
const rawCount = await db.feedArticles
  .where('poolStatus').equals('raw').count()

const candidateCount = await db.feedArticles
  .where('poolStatus').equals('candidate').count()

const recommendedCount = await db.feedArticles
  .where('poolStatus').equals('recommended').count()

// 获取候选池文章（按分数排序）
const candidates = await db.feedArticles
  .where('poolStatus').equals('candidate')
  .reverse()
  .sortBy('analysisScore')

// 获取原料池待分析文章
const rawArticles = await db.feedArticles
  .where('poolStatus').equals('raw')
  .toArray()
```

## 设计原则

1. **所有文章都入库**: 无论是否通过筛选，都保存到数据库，便于追溯和统计
2. **增量处理**: 已处理的文章不会重复分析，通过 `poolStatus` 判断
3. **状态可追溯**: 知道每篇文章在哪个阶段被淘汰及原因
4. **支持重新分析**: 可以将 `analyzed-not-qualified` 的文章重新设为 `raw` 进行分析

## 相关文件

- 类型定义: [src/types/rss.ts](../src/types/rss.ts)
- AI 初筛: [src/core/feed/FeedPreScreeningService.ts](../src/core/feed/FeedPreScreeningService.ts)
- 推荐管道: [src/core/recommender/pipeline.ts](../src/core/recommender/pipeline.ts)
- 调度器: [src/core/scheduler/feed-scheduler.ts](../src/core/scheduler/feed-scheduler.ts)
- 池操作: [src/storage/db/db-pool.ts](../src/storage/db/db-pool.ts)
