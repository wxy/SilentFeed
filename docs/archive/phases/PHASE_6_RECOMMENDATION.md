# Phase 6: AI 推荐引擎

**开发分支**: `feature/phase-6-ai-recommendation`  
**开始日期**: 2025年11月12日  
**预计时间**: 4-6 天  
**开发者**: Copilot + User

## 🎯 功能目标

基于用户画像和RSS订阅内容，构建智能推荐系统，为用户推送最相关的内容。

## 🏗️ 系统架构

```
用户画像 ──┐
          ├─→ 推荐算法引擎 ──→ AI 理由生成 ──→ 推荐展示
RSS内容 ──┘
```

### 数据流
1. **输入**: 用户兴趣画像 + RSS文章列表
2. **处理**: TF-IDF相似度计算 + 时效性评分 + AI增强
3. **输出**: 排序推荐列表 + 个性化推荐理由

## 📋 Sprint 计划

### Sprint 1: 推荐算法引擎 (2 天)
- 文件: `src/core/recommender/RuleBasedRecommender.ts`
- 实现TF-IDF相似度匹配
- 时效性评分算法
- 文章预筛选逻辑

### Sprint 2: AI增强推荐 (1.5 天)  
- 扩展: `src/core/ai/AIAdapter.ts`
- 推荐理由生成提示词
- AI质量评估

### Sprint 3: 推荐UI (1.5 天)
- 更新: `src/popup.tsx`
- 推荐列表组件
- 用户反馈按钮

## 🔧 技术实现

### 1. 推荐算法引擎

**核心算法**: TF-IDF + 时效性加权

```typescript
interface RecommendationScore {
  articleId: string
  relevanceScore: number    // TF-IDF相似度 (0-1)
  freshnessScore: number   // 时效性评分 (0-1)
  finalScore: number       // 综合评分 (0-1)
}
```

**评分公式**:
```
finalScore = relevanceScore * 0.7 + freshnessScore * 0.3
```

### 2. 文章预筛选规则

- **时间限制**: 仅考虑最近7天的文章
- **质量过滤**: 文章内容长度 > 100 字符
- **去重机制**: 相似度 > 0.9 的文章去重
- **用户反馈**: 已标记"忽略"的文章排除

## 📊 验收标准

### 功能验收
- [ ] 能生成个性化推荐列表
- [ ] 推荐理由生成准确
- [ ] 用户反馈机制正常
- [ ] 推荐算法性能合理 (< 100ms)

### 质量验收  
- [ ] 单元测试覆盖率 ≥ 70%
- [ ] 集成测试通过
- [ ] TypeScript编译无错误
- [ ] 浏览器扩展功能正常

---

*本文档将随开发进展持续更新*