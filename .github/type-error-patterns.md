# TypeScript 错误模式库

记录项目中遇到的所有 TypeScript 类型错误，供后续参考和改进。

---

## 会话 1: 2026-02-06 - 测试覆盖率补充

### 错误模式 #1: FeedArticle 缺少必需字段

**错误信息**:
```
缺少类型'FeedArticle'中的以下属性: read, starred
```

**首次发生**:
- 文件: `src/core/rss/SourceAnalysisService.test.ts` (Line 43)
- 文件: `src/core/recommender/RecommendationService.enhanced.test.ts` (Line 71)

**根本原因**:
- Mock 工厂函数没有包含 FeedArticle 接口中所有必需的布尔字段
- 开发者假设了字段的可选性，但实际上它们是必需的

**修复方法**:
```typescript
// ❌ 错误的 mock
function createMockArticle(overrides = {}): FeedArticle {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Test Article',
    link: 'https://example.com',
    published: Date.now(),
    fetched: Date.now(),
    // ❌ 缺少 read 和 starred
    ...overrides
  }
}

// ✅ 正确的 mock
function createMockArticle(overrides = {}): FeedArticle {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Test Article',
    link: 'https://example.com',
    published: Date.now(),
    fetched: Date.now(),
    read: false,      // ✅ 添加必需的布尔字段
    starred: false,   // ✅ 添加必需的布尔字段
    ...overrides
  }
}
```

**学习记录**:
- 📌 **预防方式**: 在创建任何 mock 函数前，必须先 `read_file` 查看完整的接口定义
- 📌 **修复时间**: 应该在一次修复中彻底处理，而不是多次迭代

**相关文件**:
- 类型定义: `src/types/rss.ts` (FeedArticle interface)
- Mock 文件: `src/core/rss/SourceAnalysisService.test.ts`
- Mock 文件: `src/core/recommender/RecommendationService.enhanced.test.ts`

**关键数字**:
- 首次修复中遗漏: ❌
- 第二轮修复中修复: ✅
- 影响的测试: 2 个测试文件

---

### 错误模式 #2: DiscoveredFeed status 使用无效 enum 值

**错误信息**:
```
不能将类型"'pending'"分配给类型"FeedStatus"
```

**首次发生**:
- 文件: `src/core/rss/SourceAnalysisService.test.ts` (Line 64)
- 值: `status: 'pending' as const`

**根本原因**:
- 开发者用了一个在 FeedStatus enum 中不存在的值
- FeedStatus enum 定义: `candidate | recommended | subscribed | ignored`
- `'pending'` 不在此列表中

**修复方法**:
```typescript
// ❌ 错误的 enum 值
function createMockFeed(overrides = {}): DiscoveredFeed {
  return {
    status: 'pending' as const,  // ❌ 无效值
    // ...
  }
}

// ✅ 使用有效的 enum 值
function createMockFeed(overrides = {}): DiscoveredFeed {
  return {
    status: 'candidate' as const,  // ✅ 从 FeedStatus enum 中选择
    // ...
  }
}
```

**enum 值验证检查清单**:
```typescript
// 在 src/types/rss.ts 中查看 FeedStatus enum 定义：
export enum FeedStatus {
  CANDIDATE = 'candidate',      // ✅ 有效
  RECOMMENDED = 'recommended',  // ✅ 有效
  SUBSCRIBED = 'subscribed',    // ✅ 有效
  IGNORED = 'ignored'           // ✅ 有效
  // ❌ 没有 'pending'
}
```

**学习记录**:
- 📌 **预防方式**: 在 mock 中使用 enum 值前，始终查看 enum 定义的完整列表
- 📌 **验证工具**: 使用 `grep_search` 快速找到 enum 定义

**相关文件**:
- 类型定义: `src/types/rss.ts` (FeedStatus enum)
- Mock 文件: `src/core/rss/SourceAnalysisService.test.ts`

**关键数字**:
- 无效值错误: 1
- 修复轮数: 2 轮（第一轮遗漏，第二轮修复）

---

### 错误模式 #3: DiscoveredFeed 字段同步问题

**错误信息**:
```
对象字面量只能指定已知属性，并且"icon"不在类型"DiscoveredFeed"中。
```

**首次发生**:
- 文件: `src/core/rss/SourceAnalysisService.test.ts` (Line 67)
- 字段: `icon: ''`

**根本原因**:
- Mock 数据包含了在 DiscoveredFeed 接口中不存在的字段
- 同时缺少了新增的必需字段：`discoveredFrom`, `discoveredAt`, `isActive`, `recommendedCount`
- 这表明 mock 函数与类型定义脱离同步

**修复方法**:
```typescript
// ❌ 错误的字段组合
function createMockFeed(overrides = {}): DiscoveredFeed {
  return {
    id: 'feed-1',
    url: 'https://example.com/feed.xml',
    title: 'Example Feed',
    description: 'Example RSS Feed',
    language: 'en',
    status: 'candidate' as const,
    icon: '',  // ❌ 不存在的字段
    lastFetchedAt: Date.now(),
    articleCount: 10,
    unreadCount: 5,
    // ❌ 缺少：discoveredFrom, discoveredAt, isActive, recommendedCount
  }
}

// ✅ 正确的字段组合
function createMockFeed(overrides = {}): DiscoveredFeed {
  return {
    id: 'feed-1',
    url: 'https://example.com/feed.xml',
    title: 'Example Feed',
    description: 'Example RSS Feed',
    language: 'en',
    status: 'candidate' as const,
    discoveredFrom: 'test-source',      // ✅ 必需字段
    discoveredAt: Date.now(),           // ✅ 必需字段
    isActive: true,                     // ✅ 必需字段
    lastFetchedAt: Date.now(),
    articleCount: 10,
    recommendedCount: 0,                // ✅ 必需字段
    unreadCount: 5,
  }
}
```

**字段检查清单生成流程**:
1. 打开 `src/types/rss.ts`
2. 找到 `interface DiscoveredFeed` 定义
3. 列出所有没有 `?` 的字段（必需字段）
4. 列出有 `?` 的字段（可选字段）
5. 删除 mock 中所有不在接口中的字段
6. 添加所有必需字段的默认值

**学习记录**:
- 📌 **关键教训**: 类型定义变更时，必须同步更新所有 mock 工厂函数
- 📌 **预防策略**: 建立定期的 mock 函数同步检查
- 📌 **工具支持**: 使用 TypeScript 严格模式自动检测这类问题

**相关文件**:
- 类型定义: `src/types/rss.ts` (DiscoveredFeed interface)
- Mock 文件: `src/core/rss/SourceAnalysisService.test.ts`

**关键数字**:
- 多余字段: 1 (icon)
- 缺失字段: 4 (discoveredFrom, discoveredAt, isActive, recommendedCount)
- 修复轮数: 2 轮

---

### 错误模式 #4: TopicDistribution 嵌套类型初始化不完整

**错误信息**:
```
缺少类型'TopicDistribution'中的以下属性: technology, science, business, design, ...
```

**首次发生**:
- 文件: `src/core/recommender/RecommendationService.enhanced.test.ts` (Line 193, 222)
- 原因: 用空对象 `{}` 或字符串键而不是 enum 键初始化

**根本原因**:
- TopicDistribution 是一个由 11 个特定 Topic enum 键组成的接口
- 不能用 `Partial<TopicDistribution>` 或 `{}` 来初始化
- 每个 enum 键都必须显式赋值

**修复方法**:

```typescript
// ❌ 错误做法 1: 空对象
const mockProfile: Partial<UserProfile> = {
  id: 'singleton' as const,
  topics: {},  // ❌ 缺少所有 11 个 Topic 键
  keywords: []
}

// ❌ 错误做法 2: 字符串键而不是 enum 键
const mockProfile: Partial<UserProfile> = {
  id: 'singleton' as const,
  topics: { tech: 0.5, science: 0.3 },  // ❌ 字符串 'tech' 不等于 Topic.TECHNOLOGY
  keywords: []
}

// ✅ 正确做法：创建工厂函数处理完整初始化
function createMockTopicDistribution(
  overrides: Partial<TopicDistribution> = {}
): TopicDistribution {
  return {
    [Topic.TECHNOLOGY]: overrides[Topic.TECHNOLOGY] ?? 0,
    [Topic.SCIENCE]: overrides[Topic.SCIENCE] ?? 0,
    [Topic.BUSINESS]: overrides[Topic.BUSINESS] ?? 0,
    [Topic.DESIGN]: overrides[Topic.DESIGN] ?? 0,
    [Topic.ARTS]: overrides[Topic.ARTS] ?? 0,
    [Topic.HEALTH]: overrides[Topic.HEALTH] ?? 0,
    [Topic.SPORTS]: overrides[Topic.SPORTS] ?? 0,
    [Topic.ENTERTAINMENT]: overrides[Topic.ENTERTAINMENT] ?? 0,
    [Topic.NEWS]: overrides[Topic.NEWS] ?? 0,
    [Topic.EDUCATION]: overrides[Topic.EDUCATION] ?? 0,
    [Topic.OTHER]: overrides[Topic.OTHER] ?? 0
  }
}

// ✅ 然后在 mock 中使用工厂函数
const mockProfile: Partial<UserProfile> = {
  id: 'singleton' as const,
  topics: createMockTopicDistribution({
    [Topic.TECHNOLOGY]: 0.5,
    [Topic.SCIENCE]: 0.3
  }),
  keywords: []
}
```

**TopicDistribution 的关键理解**:
```typescript
// ✅ 正确：TopicDistribution 由这 11 个 enum 键组成
export enum Topic {
  TECHNOLOGY = 'technology',
  SCIENCE = 'science',
  BUSINESS = 'business',
  DESIGN = 'design',
  ARTS = 'arts',
  HEALTH = 'health',
  SPORTS = 'sports',
  ENTERTAINMENT = 'entertainment',
  NEWS = 'news',
  EDUCATION = 'education',
  OTHER = 'other'
}

// TopicDistribution 接口中，每个键都必需：
export interface TopicDistribution {
  [Topic.TECHNOLOGY]: number,      // ✅ 必需
  [Topic.SCIENCE]: number,         // ✅ 必需
  // ... 所有 11 个 enum 值都是必需的
}
```

**学习记录**:
- 📌 **关键洞察**: TypeScript 的 `interface` 定义固定的必需键集合，不能用 `{}` 或 `Partial` 来代替
- 📌 **工厂函数模式**: 对于有多个必需枚举键的类型，必须创建工厂函数来处理
- 📌 **参数类型**: 工厂函数参数应该使用 `Partial<Type>` 允许覆盖，但函数返回值必须是完整的 `Type`

**相关文件**:
- 类型定义: `src/core/profile/TopicClassifier.ts` (TopicDistribution interface)
- 枚举定义: `src/core/profile/topics.ts` (Topic enum)
- Mock 文件: `src/core/recommender/RecommendationService.enhanced.test.ts`

**关键数字**:
- TopicDistribution 中的 enum 键数: 11
- 错误位置数: 2 处
- 修复轮数: 2 轮
- 工厂函数代码行数: ~15 行

---

## 错误统计与趋势

### 按类型统计
| 错误类型 | 数量 | 严重级别 | 可预防性 |
|---------|------|--------|--------|
| 字段缺失 | 3 | 高 | 100% |
| 字段名错误 | 1 | 高 | 100% |
| Enum 值无效 | 1 | 高 | 100% |
| 类型结构误解 | 2 | 中 | 90% |

### 修复效率
| 指标 | 值 |
|------|-----|
| 总错误数 | 5 |
| 修复轮数 | 2 |
| 平均每轮修复错误数 | 2.5 |
| 可优化为 1 轮的比例 | 100% |

---

## 预防建议与改进措施

### 短期改进（立即实施）
1. ✅ 在 Copilot 指令中添加 TypeScript Mock 创建规范
2. ✅ 创建 `typescript-type-safety` AI 技能
3. ✅ 建立此错误模式库供参考

### 中期改进（本周实施）
- [ ] 创建 `src/test/mock-factories.ts` 集中管理所有 mock 工厂函数
- [ ] 为每个主要类型创建预定义的工厂函数
- [ ] 在项目 README 中加入 mock 创建指南链接

### 长期改进（本月实施）
- [ ] 建立 mock 函数同步检查清单
- [ ] 定期审查和更新 mock 函数库
- [ ] 记录所有新的类型错误模式到此文件
- [ ] 每个季度总结错误趋势和改进成果

---

## 如何使用此文件

### 🔍 查询某个错误
```bash
# 搜索特定错误
grep -n "缺少类型" .github/type-error-patterns.md

# 搜索特定文件
grep -n "SourceAnalysisService" .github/type-error-patterns.md
```

### 📝 记录新错误
当遇到新的 TypeScript 错误时：
1. 分析根本原因
2. 记录完整的错误信息和发生位置
3. 提供正确的修复示例
4. 添加学习记录和预防方式

### 🔄 更新频率
- 每次 TypeScript 错误修复后立即更新
- 每周检查一次是否有新的错误模式
- 每月生成错误趋势报告

---

**最后更新**: 2026-02-06
**维护者**: GitHub Copilot (自动记录系统)
**相关文档**: 
- `.github/copilot-instructions.md` - 项目指导规范
- `.claude/skills/typescript-type-safety/SKILL.md` - TypeScript 类型安全技能
- `.github/ERROR_ANALYSIS_SESSION.md` - 会话级别的详细分析
