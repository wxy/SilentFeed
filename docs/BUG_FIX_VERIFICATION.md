# 阅读列表 Bug 修复验证报告

## Bug #1: 阅读列表保存时的翻译链接问题

### 问题描述
当订阅源标记为"不需要翻译"（`useGoogleTranslate === false`）时，保存到阅读列表的链接仍然使用了翻译链接，而不是原文链接。

### 修复历史
1. **第一次修复 (提交 1f6d306, 2026-01-13)**
   - 在 else if 条件中添加 `feedUseGoogleTranslate` 检查
   - 新增测试用例验证订阅源禁用翻译时使用原文链接
   - 当时未进行完整的场景验证

2. **本次验证和完整修复 (提交 c83f72b, 2026-01-14)**
   - 验证了两种应该使用原文链接的场景
   - 补充了明确的测试用例验证每种场景

### 修复的两个场景

#### 场景 A：语言一致时无需翻译
```
条件：
- sourceLanguage === targetLanguage
- 结果：translateRecommendation() 不添加 translation 字段

执行流程：
1. recommendation.translation 不存在
2. 第一个 if (!feedUseGoogleTranslate) 条件检查
   - 可能为 true 或 false（取决于源设置）
3. 进入 else if 分支检查：autoTranslateEnabled && feedUseGoogleTranslate && recommendation.translation
   - recommendation.translation 为空 → 条件为 false
4. 进入 else 分支 → 使用原文链接 ✅

结果：使用原文链接（正确）
```

#### 场景 B：语言不一致但源禁用翻译
```
条件：
- sourceLanguage !== targetLanguage
- 有 translation 数据（因为语言不同）
- useGoogleTranslate === false

执行流程：
1. recommendation.translation 存在
2. 第一个 if (!feedUseGoogleTranslate) 条件检查
   - 条件为 true → 直接使用原文链接 ✅
3. 不进入后续条件

结果：使用原文链接（正确）
```

### 关键修复代码

```typescript
// src/core/reading-list/reading-list-manager.ts, 行 156-176

// Bug #1 修复：当订阅源禁用了谷歌翻译时，无论自动翻译开关如何，都必须使用原文链接
if (!feedUseGoogleTranslate) {
  rlLogger.info('订阅源禁用谷歌翻译，使用原文链接', {
    url: recommendation.url,
    source: recommendation.source,
    autoTranslateEnabled,  // 记录自动翻译设置，即使被忽略
  })
  // 在原文链接上附加推荐ID
  urlToSave = ReadingListManager.appendRecommendationId(urlToSave, recommendation.id!)
} else if (autoTranslateEnabled && feedUseGoogleTranslate && recommendation.translation) {
  // ↑ 关键：添加 feedUseGoogleTranslate 检查，确保即使有翻译数据也遵守源设置
  // 如果启用自动翻译、订阅源允许翻译且存在翻译数据（说明文章语言和界面语言不同）
  // 生成谷歌翻译链接
  const originalWithRec = ReadingListManager.appendRecommendationId(recommendation.url, recommendation.id!)
  const encodedUrl = encodeURIComponent(originalWithRec)
  urlToSave = `https://translate.google.com/translate?sl=auto&tl=${interfaceLanguage}&u=${encodedUrl}`
  // 使用翻译后的标题
  titleToSave = recommendation.translation.translatedTitle
} else {
  // 使用原文且允许翻译开关但无需翻译时，也附加推荐ID
  urlToSave = ReadingListManager.appendRecommendationId(urlToSave, recommendation.id!)
}
```

### 验证测试用例

#### 测试用例 1：场景 A - 语言一致
```typescript
it('Bug #1 场景A：语言一致时始终使用原文链接', async () => {
  // 文章中文，界面中文，无需翻译
  // 无 translation 字段
  // 即使 useGoogleTranslate === true，也使用原文链接
})
```

#### 测试用例 2：场景 B - 语言不一致但禁用翻译
```typescript
it('Bug #1 场景B：语言不一致但源禁用翻译时始终使用原文链接', async () => {
  // 文章英文，界面中文，有翻译数据
  // useGoogleTranslate === false
  // 即使 autoTranslateEnabled === true，也使用原文链接
})
```

---

## Bug #2: 阅读列表模式切换时的数据丢失问题

### 问题描述
当从阅读列表模式切换回弹窗模式时，推荐条目应该被恢复到活跃状态，但实际上条目消失，无法再次显示。

### 根本原因
在模式切换逻辑中，查询 `readingListEntries` 表时使用了错误的键：
- 代码使用的键：`entry.url`（Chrome 阅读列表中保存的 URL，可能是翻译链接）
- 数据库实际的键：`normalizedUrl`（规范化后的 URL）

当 URL 包含翻译链接或 UTM 参数时，两个键不匹配，导致查询失败，推荐无法恢复。

### 修复方案

#### 修复前的代码问题
```typescript
// 错误的方式：使用 entry.url 直接查询
const rlEntry = await db.readingListEntries.get(entry.url)
// 如果 entry.url 是翻译链接或带 UTM 参数，则无法找到数据
```

#### 修复后的正确方式
```typescript
// src/background.ts, 行 1310-1325

// Bug #2 修复：使用 normalizedUrl 而不是 url 查询数据库
// readingListEntries 表的主键是 normalizedUrl，不是 url
try {
  // 计算该条目的规范化 URL，用于数据库查询
  const normalizedUrl = ReadingListManager.normalizeUrlForTracking(entry.url)
  const rlEntry = await db.readingListEntries.get(normalizedUrl)
  if (rlEntry?.recommendationId) {
    // 恢复推荐到活跃状态
    await db.recommendations.update(rlEntry.recommendationId, {
      savedToReadingList: false,
      status: 'active'
    })
    bgLogger.info('已恢复推荐到弹窗模式', {
      recommendationId: rlEntry.recommendationId,
      normalizedUrl
    })
  }
  await db.readingListEntries.delete(normalizedUrl)
} catch (err) {
  bgLogger.warn('恢复推荐状态失败（忽略）', { url: entry.url, err })
}
```

### URL 规范化的重要性

`normalizeUrlForTracking()` 方法处理以下 URL 变化：
1. Google Translate 链接：`https://translate.google.com/translate?u=...` → 原始 URL
2. translate.goog 域名：`https://example-com.translate.goog/...` → `https://example.com/...`
3. UTM 参数：移除 `utm_*` 参数
4. 其他追踪参数：移除 `fbclid`, `gclid`, `sf_rec` 等

### 模式切换流程示例

#### 场景：用户从弹窗保存文章到阅读列表，然后切换回弹窗
```
1. 弹窗模式 → 用户点击"保存到阅读列表"
   - 文章 URL：https://example.com/article
   - 如果自动翻译启用：保存为翻译链接
     Chrome 阅读列表存储：https://translate.google.com/translate?u=...&hl=zh-CN

2. 推荐被转移到阅读列表：
   - readingListEntries 记录：
     normalizedUrl: "https://example.com/article"  (规范化后)
     url: "https://translate.google.com/translate?u=...&hl=zh-CN"  (实际保存的)
     recommendationId: "rec-123"

3. 用户切换到阅读列表模式显示阅读列表汇总

4. 用户切换回弹窗模式：
   a. Chrome API 返回阅读列表中的条目：
      entry = { url: "https://translate.google.com/translate?u=...&hl=zh-CN", ... }
   
   b. 修复前（错误）：
      rlEntry = db.readingListEntries.get("https://translate.google.com/translate?u=...&hl=zh-CN")
      // 无法找到！因为键是 normalizedUrl
   
   c. 修复后（正确）：
      normalizedUrl = normalizeUrlForTracking("https://translate.google.com/translate?u=...&hl=zh-CN")
      // 返回：https://example.com/article
      rlEntry = db.readingListEntries.get("https://example.com/article")
      // 找到！恢复推荐
```

### 验证测试

创建了 `reading-list-mode-switch.test.ts` 验证：
- `normalizeUrlForTracking()` 处理多种 URL 格式
- 规范化后的 URL 始终相同（即使来自不同来源）

---

## 测试覆盖率

| Bug | 修复提交 | 测试文件 | 测试数量 | 覆盖情况 |
|-----|---------|---------|--------|---------|
| Bug #1 | 1f6d306 | reading-list-manager.test.ts | 1 | 源禁用翻译 + 翻译数据 |
| Bug #1 | c83f72b | reading-list-manager.test.ts | +2 | 场景A + 场景B |
| Bug #2 | e59c504 | reading-list-mode-switch.test.ts | 4 | URL 规范化 + 模式切换 |

---

## 验证清单

- [x] Bug #1 修复代码添加了 `feedUseGoogleTranslate` 检查
- [x] Bug #1 场景 A 测试：语言一致无需翻译
- [x] Bug #1 场景 B 测试：语言不一致但禁用翻译
- [x] Bug #2 修复使用 `normalizeUrlForTracking()` 计算正确的数据库键
- [x] Bug #2 测试覆盖 URL 规范化的多种情况
- [x] 所有修复都有清晰的日志记录便于调试

---

## 结论

两个 bug 的修复现已完成并经过验证：

1. **Bug #1**：通过添加 `feedUseGoogleTranslate` 检查确保禁用翻译的源始终使用原文链接
2. **Bug #2**：通过使用 `normalizeUrlForTracking()` 计算正确的数据库键确保模式切换时数据被正确恢复

两项修复都包含相应的测试用例，确保修复的有效性。
