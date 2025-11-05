# ProfileBuilder - 用户画像构建器

## Phase 2.7 Step 6: 选择性学习权重

### 权重策略

不同来源的页面访问会应用不同的学习权重：

```typescript
const LEARNING_WEIGHTS = {
  recommended: 1.5,  // 推荐来源：权重 × 1.5
  organic: 1.0,      // 自然浏览：权重 × 1.0（默认）
  search: 0.8        // 搜索来源：权重 × 0.8
}
```

### 实现逻辑

```typescript
async function buildProfile(visits: ConfirmedVisit[]): Promise<UserProfile> {
  const weightedVisits = visits.map(visit => {
    const weight = LEARNING_WEIGHTS[visit.source || 'organic']
    return {
      ...visit,
      weight
    }
  })
  
  // 使用加权后的数据构建画像
  // - TF-IDF 关键词提取时应用权重
  // - 主题分类时应用权重
  // - 时间衰减时应用权重
}
```

### 设计理念

1. **推荐来源（1.5x）**
   - 用户主动点击推荐，说明AI推荐准确
   - 这些页面更能反映用户真实兴趣
   - 权重加强，加速画像收敛

2. **自然浏览（1.0x）**
   - 用户自主发现的内容
   - 最原始、最真实的兴趣信号
   - 保持标准权重

3. **搜索来源（0.8x）**
   - 可能是临时需求（工作、查资料）
   - 不一定反映长期兴趣
   - 降低权重，避免噪音

### TODO

- [ ] Phase 3: 实现 ProfileBuilder 核心逻辑
- [ ] Phase 3: 集成 TF-IDF 文本分析
- [ ] Phase 3: 实现主题分类算法
- [ ] Phase 3: 应用选择性学习权重
