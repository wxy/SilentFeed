---
name: _typescript-type-safety
description: TypeScript Mock 数据创建与类型错误预防。用于修复与预防测试中的类型错误与 mock 构造缺陷。
---

# TypeScript 类型安全与 Mock 数据创建技能

## 📌 技能描述

这个技能提供了在 TypeScript 项目中创建类型安全的 mock 数据和处理类型错误的完整指南。特别针对 Vitest 测试中的 mock 对象创建。

**适用场景：**
- 创建测试 mock 数据时遇到 TypeScript 类型错误
- 处理复杂的嵌套类型初始化
- 修复 "missing properties" 类型编译错误
- 优化 mock 工厂函数的设计

**学习来源：** SilentFeed 项目，2026-02-06 会话

---

## 🔍 核心问题识别

### 问题 1: 空对象假设
```typescript
// ❌ 常见错误
const mockProfile = {} as UserProfile

// 错误原因：
// - TypeScript 严格模式下，接口的所有必需字段都必须显式赋值
// - as 类型断言会忽略类型检查，在测试中会导致运行时错误
```

### 问题 2: Enum 值混淆
```typescript
// ❌ 常见错误
status: 'pending'  // ❌ 字符串字面量

// ✅ 正确做法
status: 'candidate' as const  // ✅ 在 enum 定义中验证此值
status: FeedStatus.CANDIDATE  // ✅ 使用 enum

// 检查 enum 定义：
export enum FeedStatus {
  CANDIDATE = 'candidate',
  RECOMMENDED = 'recommended',
  SUBSCRIBED = 'subscribed',
  IGNORED = 'ignored'
  // ❌ 没有 PENDING
}
```

### 问题 3: 嵌套类型初始化
```typescript
// ❌ 错误：TopicDistribution 不能用空对象初始化
topics: {}

// ✅ 正确：需要所有 11 个 Topic enum 值
topics: {
  [Topic.TECHNOLOGY]: 0.5,
  [Topic.SCIENCE]: 0.3,
  [Topic.BUSINESS]: 0,
  [Topic.DESIGN]: 0,
  [Topic.ARTS]: 0,
  [Topic.HEALTH]: 0,
  [Topic.SPORTS]: 0,
  [Topic.ENTERTAINMENT]: 0,
  [Topic.NEWS]: 0,
  [Topic.EDUCATION]: 0,
  [Topic.OTHER]: 0
}
```

---

## 📋 解决方案：5 步 Mock 创建流程

### 步骤 1️⃣: 读取完整的类型定义

```typescript
// 在创建 mock 之前，使用 read_file 工具查看完整的 interface 定义
// 例如：read_file('/path/to/UserProfile.ts', 1, 50)

// 需要识别：
// ✓ 所有必需的字段（无 ? 和 undefined）
// ✓ enum 字段的类型
// ✓ 嵌套对象的结构
// ✓ 数组字段的元素类型
```

**示例输出：**
```typescript
export interface UserProfile {
  id: 'singleton',           // ✓ 必需，字面量类型
  topics: TopicDistribution, // ✓ 必需，复杂类型
  keywords: Keyword[],       // ✓ 必需，数组类型
  // ... 其他字段
}

export interface TopicDistribution {
  [Topic.TECHNOLOGY]: number,
  [Topic.SCIENCE]: number,
  // ... 所有 11 个 Topic enum 值
}
```

---

### 步骤 2️⃣: 创建类型检查清单

```markdown
## UserProfile Mock 检查清单

- [ ] id 字段: 'singleton' 字面量类型
- [ ] topics 字段: TopicDistribution（需要所有 11 个 Topic 键）
- [ ] keywords 字段: Keyword[] 数组
- [ ] 验证没有非定义中的字段
- [ ] 运行 get_errors 确认零错误
```

---

### 步骤 3️⃣: 为复杂类型创建工厂函数

```typescript
// ❌ 每次都内联复杂初始化 (容易出错)
const profile: UserProfile = {
  id: 'singleton' as const,
  topics: {
    [Topic.TECHNOLOGY]: 0.5,
    [Topic.SCIENCE]: 0.3,
    // ... 重复 11 个字段
  },
  keywords: []
}

// ✅ 创建工厂函数 (DRY 原则)
function createMockUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'singleton' as const,
    topics: createMockTopicDistribution(overrides.topics),
    keywords: overrides.keywords ?? [],
    ...overrides
  }
}

function createMockTopicDistribution(overrides: Partial<TopicDistribution> = {}): TopicDistribution {
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
```

**优势：**
- 代码重用
- 单一修改源
- 类型安全
- 易于维护

---

### 步骤 4️⃣: 处理 Enum 字段的正确方式

```typescript
// ❌ 错误方式 1: 使用无效的字符串
status: 'pending'  // TypeScript 不会警告，但类型不匹配

// ❌ 错误方式 2: 假设字符串键
topics: { tech: 0.5 }  // 字符串 'tech' ≠ Topic.TECHNOLOGY enum

// ✅ 正确方式 1: 使用 enum 导入
import { Topic } from '@/core/profile/topics'
topics: {
  [Topic.TECHNOLOGY]: 0.5,
  [Topic.SCIENCE]: 0.3,
  // ...
}

// ✅ 正确方式 2: 使用 enum 导入和字面量类型
import { FeedStatus } from '@/types/rss'
status: 'candidate' as const  // 在 FeedStatus 中存在

// 验证 enum 值：
// 1. 导入 enum 定义
// 2. 检查所有可能的值
// 3. 在测试中只使用这些值
```

**Enum 检查清单：**
```typescript
// 在修复前，验证 enum 定义：

// ✓ FeedStatus 定义检查
export enum FeedStatus {
  CANDIDATE = 'candidate',      // ✅ 'candidate' 是有效的
  RECOMMENDED = 'recommended',
  SUBSCRIBED = 'subscribed',
  IGNORED = 'ignored'
  // ❌ 没有 'pending'
}

// ✓ Topic enum 定义检查
export enum Topic {
  TECHNOLOGY = 'technology',
  SCIENCE = 'science',
  // ... 所有 11 个值
}
```

---

### 步骤 5️⃣: 使用 get_errors 验证

```typescript
// 创建完 mock 后，立即运行：
// get_errors 或检查 IDE 中的问题面板

// 预期结果：
// ✓ 0 个类型错误
// ✓ 所有必需字段都已赋值
// ✓ 没有"缺少属性"的错误

// 如果仍有错误，通常表示：
// 1. 字段被拼写错误
// 2. enum 值无效
// 3. 字段类型不匹配
// 4. 嵌套类型的字段不完整

// 例如：
// 错误: "缺少属性 read, starred"
// ↓
// 原因：FeedArticle 接口要求这两个布尔字段
// ↓
// 修复：在 mock 中添加 read: false, starred: false
```

---

## 🛠️ 实践指南

### 场景 A: 修复"缺少属性"错误

```typescript
// ❌ 错误消息
// 对象字面量只能指定已知属性，并且"read"不在类型"FeedArticle"中。
// 缺少类型'FeedArticle'中的以下属性: read, starred

// ✅ 解决方案
function createMockArticle(overrides = {}): FeedArticle {
  return {
    id: `article-${Math.random()}`,
    feedId: 'feed-1',
    title: 'Test Article',
    link: 'https://example.com',
    published: Date.now(),
    fetched: Date.now(),
    read: false,        // ✅ 添加
    starred: false,     // ✅ 添加
    ...overrides
  }
}
```

**修复步骤：**
1. 读取 `FeedArticle` 类型定义
2. 识别 `read` 和 `starred` 是必需的布尔字段
3. 添加到 mock 对象
4. 运行 `get_errors` 验证

---

### 场景 B: 修复 Enum 值无效错误

```typescript
// ❌ 错误消息
// 不能将类型"'pending'"分配给类型"FeedStatus"

// ✅ 解决方案
// 第一步：查看 FeedStatus enum 定义
export enum FeedStatus {
  CANDIDATE = 'candidate',     // ✅ 使用这个
  RECOMMENDED = 'recommended',
  SUBSCRIBED = 'subscribed',
  IGNORED = 'ignored'
  // ❌ 'pending' 不存在
}

// 第二步：更新 mock
function createMockFeed(overrides = {}): DiscoveredFeed {
  return {
    status: 'candidate' as const,  // ✅ 改为有效值
    // ...
  }
}
```

**修复步骤：**
1. 找到 enum 定义 (通常在 `types/` 或 `constants/` 目录)
2. 列出所有有效值
3. 将 mock 中的值改为有效值之一
4. 运行 `get_errors` 验证

---

### 场景 C: 处理复杂嵌套类型

```typescript
// ❌ 错误消息
// 缺少类型'TopicDistribution'中的以下属性...

// ✅ 解决方案
// 第一步：理解 TopicDistribution 的结构
export interface TopicDistribution {
  [Topic.TECHNOLOGY]: number,     // 需要
  [Topic.SCIENCE]: number,        // 需要
  [Topic.BUSINESS]: number,       // 需要
  // ... 所有 11 个 Topic enum 值都是必需的
}

// 第二步：创建工厂函数
function createMockTopicDistribution(
  overrides: Partial<TopicDistribution> = {}
): TopicDistribution {
  return {
    [Topic.TECHNOLOGY]: overrides[Topic.TECHNOLOGY] ?? 0,
    [Topic.SCIENCE]: overrides[Topic.SCIENCE] ?? 0,
    // ... 其他 9 个字段
  }
}

// 第三步：使用工厂函数
const profile: UserProfile = {
  topics: createMockTopicDistribution({
    [Topic.TECHNOLOGY]: 0.5,
    [Topic.SCIENCE]: 0.3
  }),
  // ...
}
```

**关键原则：**
- 对于有多个必需字段的类型，创建工厂函数
- 工厂函数应该提供所有必需字段的默认值
- 使用 `Partial<Type>` 参数允许覆盖

---

## 📚 Mock 工厂函数最佳实践

### 原则 1: 单一责任
```typescript
// ✅ 好
function createMockArticle(overrides = {}): FeedArticle
function createMockTopicDistribution(overrides = {}): TopicDistribution

// ❌ 坏
function createMockData(type: string, overrides = {}): any
```

### 原则 2: 安全的默认值
```typescript
// ✅ 好：提供合理的默认值
function createMockArticle(overrides = {}): FeedArticle {
  return {
    id: `article-${Math.random()}`,
    published: Date.now(),
    read: false,
    starred: false,
    ...overrides
  }
}

// ❌ 坏：空值或无效值
function createMockArticle(overrides = {}): FeedArticle {
  return {
    id: '',              // 空值会导致测试失败
    published: 0,        // 过时的时间戳
    read: null as any,   // null 不是布尔值
    ...overrides
  }
}
```

### 原则 3: 类型安全的覆盖
```typescript
// ✅ 好：强类型的参数
function createMockArticle(overrides: Partial<FeedArticle> = {}): FeedArticle

// ❌ 坏：任意 any 类型
function createMockArticle(overrides: any = {}): FeedArticle
```

### 原则 4: 文档清晰
```typescript
/**
 * 创建 mock FeedArticle 用于测试
 * 
 * @param overrides - 要覆盖的字段
 * @returns 完整的 FeedArticle mock 对象
 * 
 * @example
 * const article = createMockArticle({ title: 'Custom Title' })
 */
function createMockArticle(overrides: Partial<FeedArticle> = {}): FeedArticle
```

---

## 🚨 常见陷阱与预防

| 陷阱 | 症状 | 预防方法 |
|------|------|--------|
| **Partial 类型误用** | 使用 `Partial<Type>` 赋值给 `Type` | 确保所有必需字段都有默认值 |
| **Enum 字符串混淆** | 使用 `'pending'` 而不是 `FeedStatus.CANDIDATE` | 导入 enum，直接使用 enum 值 |
| **嵌套初始化不完整** | TopicDistribution 初始化为 `{}` | 创建工厂函数，初始化所有键 |
| **类型断言滥用** | 使用 `as any` 或 `as Type` 跳过检查 | 信任 TypeScript 编译器的错误提示 |
| **字段拼写错误** | `isRead` 而不是 `read` | 从类型定义复制字段名 |

---

## ✅ 最终检查清单

创建完 mock 数据后，总是确认：

```markdown
## Mock 创建检查清单

- [ ] 读取了完整的类型定义
- [ ] 所有必需字段都已赋值（无 `?` 或 `undefined` 的字段）
- [ ] 所有 enum 字段都使用有效的 enum 值
- [ ] 复杂类型使用了工厂函数
- [ ] 嵌套类型的所有级别都完全初始化
- [ ] 没有 `any` 类型的断言
- [ ] 运行 `get_errors` 返回 0 个错误
- [ ] 代码风格与项目保持一致
- [ ] 工厂函数有清晰的 JSDoc 注释
- [ ] 覆盖参数使用 `Partial<Type>` 而不是 `any`
```

---

## 📖 参考资源

- **TypeScript 手册**: https://www.typescriptlang.org/docs/handbook/
- **Vitest Mock 文档**: https://vitest.dev/api/vi.html
- **项目类型定义**: `src/types/` 目录
- **现有 Mock 工厂**: `src/test/mock-factories/`

---

## 🔄 持续改进

此技能基于 SilentFeed 项目的实际错误和解决方案。随着新的错误模式出现，应该：

1. 记录错误到 `.github/type-error-patterns.md`
2. 分析根本原因
3. 更新本技能文档
4. 更新 Copilot 指令
5. 在下次类似问题出现时应用新知识

**最后更新**: 2026-02-06
**学习来源**: SilentFeed 多轮修复会话
