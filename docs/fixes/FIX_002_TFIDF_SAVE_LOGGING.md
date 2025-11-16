# 修复 002: TF-IDF 分数保存缺少确认日志

**日期**: 2025-11-16  
**优先级**: 🟡 中等  
**状态**: ✅ 已修复

## 问题描述

`saveTFIDFScore` 方法在成功保存 TF-IDF 分数后没有输出确认日志，导致无法追踪保存是否成功。

## 修复方案

添加成功保存的确认日志：

```typescript
await db.discoveredFeeds.update(feedId, {
  latestArticles: feed.latestArticles
})

console.log(`[Pipeline] 💾 已保存 TF-IDF 分数: ${articleId}, score: ${tfidfScore.toFixed(4)}`)
```

## 影响范围

- **文件**: `src/core/recommender/pipeline.ts`
- **方法**: `saveTFIDFScore`
- **影响**: 提升可调试性，不影响功能

## 验证方法

运行推荐生成，观察控制台输出，应该看到：
```
[Pipeline] 💾 已保存 TF-IDF 分数: article-id-xxx, score: 0.4552
```
