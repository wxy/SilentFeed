# 修复 001: TF-IDF 缓存失效问题

**日期**: 2025-11-16  
**优先级**: 🔴 严重  
**状态**: ✅ 已修复

## 问题描述

用户报告每次推荐都会重新评估所有文章的 TF-IDF 分数，缓存机制完全失效。

**症状**:
- 第一次推荐：处理 133 篇，跳过 6 个低分文章
- 第二次推荐：处理 126 篇，没有显示跳过消息
- 第三次推荐：显示所有文章都是"未分析"状态

## 根本原因

`saveArticleAnalysis` 保存的数据结构与 `collectArticles` 读取的路径不匹配。

**保存的结构** (pipeline.ts):
```typescript
article.analysis = {
  topicProbabilities: {...},
  confidence: 0.8,
  provider: 'tfidf-skipped'  // ✅ provider 在顶层
}
```

**读取的路径** (RecommendationService.ts):
```typescript
a.analysis?.metadata?.provider === 'tfidf-skipped'  // ❌ 错误！provider 不在 metadata 中
```

这导致过滤条件永远为 `false`，所有标记为 `tfidf-skipped` 的文章都被误判为"未分析"。

## 修复方案

修正 `collectArticles` 中的字段访问路径：

```typescript
// 修复前
const tfidfSkippedArticles = feed.latestArticles.filter(a => 
  a.analysis?.metadata?.provider === 'tfidf-skipped'  // ❌
).length

// 修复后
const tfidfSkippedArticles = feed.latestArticles.filter(a => 
  a.analysis?.provider === 'tfidf-skipped'  // ✅
).length
```

## 影响范围

- **文件**: `src/core/recommender/RecommendationService.ts` (Line 217)
- **影响**: 所有基于 `analysis.provider` 的过滤逻辑
- **向后兼容**: 是（只修复了读取路径，不影响已有数据）

## 验证方法

1. 重置推荐数据
2. 第一次手动推荐 → 应该显示"跳过 N 个低分文章"
3. 第二次手动推荐 → 应该显示"其中TF-IDF跳过: N"，且总文章数减少
4. 检查日志确认 `tfidf-skipped` 文章被正确识别

## 相关问题

- 需要同步检查所有访问 `analysis.provider` 的地方，确保路径一致
- 考虑为 `FeedArticle.analysis` 添加 TypeScript 类型定义，避免类似错误
