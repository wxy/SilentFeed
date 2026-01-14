# Google Translate URL 去重问题调查报告

## 问题陈述

用户报告称在翻译版的页面中发现翻译链接化的订阅源，而这个和非翻译版的订阅源其实是一样的。这导致了同一个 RSS 源被订阅两次：
- 一次是原始 URL（如 `https://example.com/feed.xml`）
- 一次是翻译 URL（如 `https://example-com.translate.goog/feed.xml`）

## 时间线分析

### 2025-12-10 | 提交 2db43a5
**feat: 增强订阅源去重逻辑**
- 实现 `normalizeUrlForDedup()` 方法
- 支持规范化 URL：移除尾部 `/`、移除索引文件
- 在 `addCandidate()` 中使用规范化 URL 进行去重

**问题**：此时 `normalizeUrlForDedup()` 不支持 Google Translate URL 转换

### 2025-12-16 | 提交 6cb7e3a
**feat(rss-detector): 将谷歌翻译 URL 转换为原始 URL**
- 在 `src/contents/SilentFeed.ts` 中实现 `convertGoogleTranslateUrl()` 函数
- 支持转换格式：`example-com.translate.goog/feed` → `example.com/feed`
- 支持双连字符处理：`my--site` → `my-site`
- 支持多级 TLD：`example-co-uk` → `example.co.uk`
- 移除翻译相关查询参数

**问题**：此函数仅在 content script 中使用，**未被应用到 FeedManager 的去重逻辑中**

### 2025-12-17 至 2026-01-10
多次提交优化 RSS 可视化和 UI，但都没有解决 FeedManager 中的去重问题

### 2026-01-14 | 提交 ecf7395
**fix: handle Google Translate URLs in RSS feed deduplication**
- 将 `convertGoogleTranslateUrl()` 逻辑复制到 `FeedManager` 中
- 在 `normalizeUrlForDedup()` 中添加调用
- 修改 `getFeedByUrl()` 使用规范化 URL 比较

**这是第一次真正修复问题**

## 根本原因

两个独立的功能（content script 中的 translate URL 检测 和 FeedManager 中的 URL 去重）没有被整合：

```
┌─ 2db43a5: normalizeUrlForDedup() ─┐
│  - 规范化 URL                       │
│  - 移除尾部 /                       │
│  - 移除索引文件                     │
│  ❌ 不处理 translate.goog URLs      │
└─────────────────────────────────────┘

                ❌ GAP
        (未被整合的 4 周)

┌─ 6cb7e3a: convertGoogleTranslateUrl() ──┐
│  在 SilentFeed.ts 中实现                 │
│  - 检测 translate.goog 域名             │
│  - 转换为原始 URL                        │
│  - 仅用于 RSS 检测，未在 FeedManager 中 │
└────────────────────────────────────────┘
```

## 修复方案（已实现）

### 1. 在 FeedManager 中添加 convertTranslateUrl()
将 SilentFeed.ts 中的转换逻辑复制到 FeedManager：

```typescript
private convertTranslateUrl(translateUrl: URL): string | null {
  // 相同的实现逻辑
  // example-com.translate.goog → example.com
}
```

### 2. 增强 normalizeUrlForDedup()
在 URL 规范化前先执行 translate URL 转换：

```typescript
private normalizeUrlForDedup(url: string): string {
  // 1. 先转换 translate.goog URL
  // 2. 再做标准规范化
}
```

### 3. 修改 getFeedByUrl()
从直接 Dexie 查询改为规范化比较：

```typescript
async getFeedByUrl(url: string): Promise<DiscoveredFeed | undefined> {
  const normalizedInputUrl = this.normalizeUrlForDedup(url)
  const allFeeds = await db.discoveredFeeds.toArray()
  return allFeeds.find(feed => 
    this.normalizeUrlForDedup(feed.url) === normalizedInputUrl
  )
}
```

## 后续改进建议

### 1. 代码复用
- [ ] 将转换逻辑提取到共享 utility 模块
- [ ] 在 `src/utils/url-normalization.ts` 中统一管理
- 这样 SilentFeed.ts 和 FeedManager.ts 都可以使用同一个函数

### 2. 单元测试增强
- [x] 添加 Google Translate URL 去重测试
- [ ] 添加更多边界情况测试（如多级 TLD、特殊字符等）

### 3. 文档改进
- [ ] 在 FeedManager 注释中说明 translate URL 支持
- [ ] 在 README 中记录此特性

### 4. 集成测试
- [ ] 端到端测试：从翻译页面发现 RSS → 订阅 → 验证去重

## 验证清单

- [x] 所有 2156 个单元测试通过
- [x] FeedManager.test.ts 所有 34 个测试通过
  - 包括新增的 Google Translate URL 测试
- [x] 代码测试覆盖率达到 68% 阈值
- [x] 修复已提交到 master（ecf7395）

## 总结

这个问题的出现是由于：
1. **功能分离**：translate URL 转换在 content script 中，去重逻辑在 FeedManager 中
2. **沟通缺失**：两个功能在 4 周内独立发展，没有被整合
3. **测试覆盖不足**：FeedManager 的去重逻辑没有针对 translate URL 的测试

修复方案已在提交 ecf7395 中完全实现。未来应该考虑将 URL 转换逻辑提取到共享的 utility 模块，以提高代码复用性和可维护性。
