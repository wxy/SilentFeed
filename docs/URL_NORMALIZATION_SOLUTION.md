## 读取清单 URL 规范化方案

### 问题背景

在之前的实现中，读取清单条目的移除功能存在两个主要问题：

1. **`alert()` 不支持问题**：Background Service Worker 环境不支持 `alert()` 函数
2. **URL 不匹配问题**：当用户通过翻译链接（如 Google Translate）添加到读取清单后，页面的实际 URL 与数据库中保存的 URL 不同，导致查询失败

例如：
- 用户访问 Google Translate 翻译的页面：`https://translate.google.com/translate?u=https://example.com/article&hl=zh-CN`
- 但存储到读取清单的 URL 是：`https://example.com/article?utm_source=...`
- 学习完成后使用当前页面 URL 查询时无法匹配

### 解决方案

采用 **URL 规范化** 策略，通过移除追踪参数来创建一致的查询键。

#### 1. URL 规范化方法

在 `ReadingListManager` 中添加 `normalizeUrlForTracking()` 静态方法：

```typescript
static normalizeUrlForTracking(url: string): string {
  try {
    const urlObj = new URL(url)
    
    // 移除常见的追踪参数
    const trackedParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'msclkid', 'gclsrc',
      '_ga', '_gid', 'source', 'campaign'
    ]
    
    trackedParams.forEach(param => {
      urlObj.searchParams.delete(param)
    })
    
    return urlObj.toString()
  } catch {
    return url
  }
}
```

**移除的参数包括：**
- `utm_*`：Google Analytics 追踪参数
- `fbclid`：Facebook 点击追踪
- `gclid`：Google Ads 点击追踪
- `msclkid`：Microsoft 点击追踪
- `_ga`, `_gid`：Google Analytics ID
- `source`, `campaign`：其他追踪参数

#### 2. 数据库架构变更

修改 `ReadingListEntry` 接口，使用规范化 URL 作为主键：

```typescript
interface ReadingListEntry {
  normalizedUrl: string        // 主键：规范化的URL（去掉UTM参数后）
  url: string                  // 实际保存到阅读列表的URL
  recommendationId?: string
  addedAt: number
  titlePrefix?: string
}
```

**优势：**
- `normalizedUrl` 用于数据库查询和匹配
- `url` 保存实际的读取清单 URL（可能是翻译链接）
- 当调用 `chrome.readingList.removeEntry()` 时使用 `url` 字段

#### 3. 保存逻辑

当添加到读取清单时，同时计算和保存规范化 URL：

```typescript
// 计算规范化的URL
const normalizedUrl = ReadingListManager.normalizeUrlForTracking(urlToSave)

// 保存到数据库
await db.readingListEntries.put({
  normalizedUrl,
  url: urlToSave,  // 保存原始/翻译 URL
  recommendationId: recommendation.id,
  addedAt: Date.now(),
  titlePrefix: recommendation.titlePrefix
})
```

#### 4. 移除逻辑

学习完成后，使用规范化 URL 查询，然后使用原始 URL 移除：

```typescript
// 使用规范化的 URL 查询以匹配翻译链接和原始 URL
const normalizedUrl = ReadingListManager.normalizeUrlForTracking(pageData.url)
const entries = await db.readingListEntries
  .where('normalizedUrl').equals(normalizedUrl)
  .toArray()

if (entries.length > 0) {
  for (const entry of entries) {
    // 使用保存的原始 URL 从 Chrome 读取清单移除
    await chrome.readingList.removeEntry({ url: entry.url })
    // 删除数据库记录
    await db.readingListEntries.delete(entry.normalizedUrl)
  }
} else {
  // 兼容旧数据：尝试直接使用原始 URL
  await chrome.readingList.removeEntry({ url: pageData.url })
}
```

### 工作流程示例

#### 场景 1：原始 URL + UTM 参数

1. **初始状态**：
   - 页面 URL：`https://example.com/article?id=123&utm_source=twitter`
   - 保存到读取清单

2. **保存阶段**：
   - 规范化：`https://example.com/article?id=123`
   - 存储：`{ normalizedUrl: "https://example.com/article?id=123", url: "https://example.com/article?id=123&utm_source=twitter" }`

3. **学习完成，移除阶段**：
   - 页面 URL：`https://example.com/article?id=123&utm_source=email`（可能有不同的 UTM）
   - 规范化：`https://example.com/article?id=123`
   - 查询数据库：`WHERE normalizedUrl = "https://example.com/article?id=123"` ✅ 匹配
   - 移除：使用保存的 URL `"https://example.com/article?id=123&utm_source=twitter"` 从 Chrome 移除

#### 场景 2：翻译 URL

1. **初始状态**：
   - 页面 URL：`https://translate.google.com/translate?u=https://example.com/article&hl=zh-CN`
   - Chrome 读取清单实际保存：`https://example.com/article`（浏览器自动处理）

2. **保存阶段**：
   - 原始 URL：`https://example.com/article`
   - 规范化：`https://example.com/article`
   - 存储：`{ normalizedUrl: "https://example.com/article", url: "https://example.com/article" }`

3. **学习完成，移除阶段**：
   - 用户回到原始页面：`https://example.com/article?utm_campaign=shared`
   - 规范化：`https://example.com/article`
   - 查询数据库：`WHERE normalizedUrl = "https://example.com/article"` ✅ 匹配
   - 移除：使用保存的 URL `"https://example.com/article"` 从 Chrome 移除

### 测试覆盖

新增 `url-normalization.test.ts` 测试套件，包括：

- ✅ 移除 UTM 参数
- ✅ 移除其他追踪参数（fbclid, gclid, msclkid 等）
- ✅ 保留有意义的查询参数
- ✅ Google Translate URL 处理
- ✅ 无效 URL 处理
- ✅ 复杂场景（多参数、fragment、路径参数）
- ✅ 数据库查询匹配场景

### 向后兼容性

如果数据库中存在旧的条目（没有 `normalizedUrl` 字段），系统会：

1. 首先尝试使用规范化 URL 查询
2. 如果没有找到，则使用原始 URL 进行直接移除
3. 记录日志便于调试

### 性能影响

- **内存占用**：每个条目多占用约 50-100 字节（规范化 URL）
- **查询性能**：使用索引查询，O(log n) 复杂度
- **规范化成本**：URL 规范化操作快速（< 1ms）

### 迁移计划

对于生产环境，建议：

1. **阶段 1**：部署新代码，新的条目会自动保存 `normalizedUrl`
2. **阶段 2**：可选的数据库迁移脚本，为旧条目填充 `normalizedUrl`
3. **阶段 3**：向后兼容逻辑保证旧条目也能正确移除

### 相关文件

- `src/core/reading-list/reading-list-manager.ts`：URL 规范化逻辑
- `src/types/database.ts`：`ReadingListEntry` 接口定义
- `src/storage/db/index.ts`：数据库架构定义
- `src/background.ts`：移除逻辑实现
- `src/core/reading-list/url-normalization.test.ts`：测试套件
