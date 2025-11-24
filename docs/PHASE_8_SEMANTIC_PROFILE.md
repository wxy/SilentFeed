# Phase 8: AI 驱动的语义化用户画像

## 🎯 目标

将用户画像从"关键词 + 主题分类"升级为"AI 语义理解"，实现真正的 AI 时代推荐系统。

## 🔑 核心理念

### 从粗糙分类到深度理解

**现状问题：**
- ❌ 10个主题分区 → 太粗糙，前 AI 时代思维
- ❌ 3-5个关键词 → 无法捕捉用户真实兴趣
- ❌ TF-IDF 误用 → 初筛工具被当作评分依据
- ❌ 用户行为信号未充分利用

**升级方案：**
- ✅ **AI 语义摘要** → 深度理解用户兴趣
- ✅ **丰富画像数据** → 不惜 token，追求精准
- ✅ **行为强化** → 阅读/dismiss 触发实时更新
- ✅ **增量更新** → 智能触发，避免频繁重建

---

## 📊 数据结构设计

### 增强的用户画像

```typescript
interface SemanticUserProfile extends UserProfile {
  // === 核心：AI 语义理解 ===
  aiSummary?: {
    // 用户兴趣总结（AI 生成，100-200字）
    interests: string
    // 示例："用户对人工智能、前端开发、创业有浓厚兴趣。
    //       喜欢深度技术文章和实战教程，关注行业动态和最佳实践。
    //       对机器学习、React 生态、产品设计有持续学习意愿。"
    
    // 偏好特征（5-10条）
    preferences: string[]
    // 示例：["深度技术解析", "代码实践教程", "开源项目分析", 
    //        "行业趋势报告", "架构设计经验"]
    
    // 避免主题（3-5条）
    avoidTopics: string[]
    // 示例：["体育赛事", "娱乐八卦", "游戏攻略"]
    
    // 生成时间和依据
    generatedAt: number
    basedOnPages: number      // 基于多少页面生成
    basedOnReads: number      // 基于多少阅读
    basedOnDismisses: number  // 基于多少拒绝
  }
  
  // === 行为记录（强信号）===
  behaviors?: {
    // 阅读记录（保留最近 50 条）
    reads: Array<{
      articleId: string
      title: string
      summary: string           // 文章摘要（用于画像生成）
      feedUrl?: string
      readDuration: number      // 阅读时长（秒）
      scrollDepth: number       // 滚动深度 0-1
      timestamp: number
      weight: number            // 综合权重（基于时长+深度）
    }>
    
    // 拒绝记录（保留最近 30 条）
    dismisses: Array<{
      articleId: string
      title: string
      summary: string           // 用于识别不喜欢的内容
      feedUrl?: string
      timestamp: number
      weight: number            // 负权重（固定 -1）
    }>
    
    // 统计信息
    totalReads: number
    totalDismisses: number
    lastReadAt?: number
    lastDismissAt?: number
  }
  
  // === 辅助：展示关键词（UI 用）===
  displayKeywords: Array<{
    word: string
    weight: number
    source: 'browse' | 'read' | 'dismiss'
  }>  // 限制 20-30 个
  
  // === 保留：主题分布（兼容性）===
  topics: TopicDistribution
  
  // === 元信息 ===
  version: 2  // 标记为升级版
}
```

---

## 🔄 画像更新策略

### 智能触发机制

```typescript
/**
 * 画像更新触发器
 * 
 * 根据用户行为智能决定更新时机和方式
 */
class ProfileUpdateTrigger {
  // 计数器
  private browseCount = 0      // 浏览页面数
  private readCount = 0        // 阅读推荐数
  private dismissCount = 0     // 拒绝推荐数
  
  // 阈值配置
  private readonly BROWSE_THRESHOLD = 20   // 浏览 20 页触发
  private readonly READ_THRESHOLD = 3      // 阅读 3 篇触发
  private readonly DISMISS_THRESHOLD = 1   // 拒绝 1 篇立即触发
  
  /**
   * 用户浏览页面
   */
  async onBrowse(page: ConfirmedVisit) {
    this.browseCount++
    
    if (this.browseCount >= this.BROWSE_THRESHOLD) {
      // 达到阈值 → 全量更新（包含 AI 摘要）
      await this.triggerFullUpdate('browse')
      this.browseCount = 0
    } else {
      // 未达阈值 → 轻量更新（只更新关键词和主题）
      await this.triggerLightweightUpdate(page)
    }
  }
  
  /**
   * 用户阅读推荐
   */
  async onRead(article: RecommendedArticle, readDuration: number, scrollDepth: number) {
    // 1. 记录行为（高权重）
    const weight = this.calculateReadWeight(readDuration, scrollDepth)
    await this.recordReadBehavior(article, weight)
    
    this.readCount++
    
    if (this.readCount >= this.READ_THRESHOLD) {
      // 多次阅读 → 全量更新（学习新兴趣）
      await this.triggerFullUpdate('read')
      this.readCount = 0
    }
  }
  
  /**
   * 用户拒绝推荐
   */
  async onDismiss(article: RecommendedArticle) {
    // 1. 记录行为（负权重）
    await this.recordDismissBehavior(article)
    
    this.dismissCount++
    
    // 拒绝 → 立即全量更新（避免继续推荐类似内容）
    await this.triggerFullUpdate('dismiss')
    this.dismissCount = 0
  }
  
  /**
   * 全量更新：重新生成 AI 摘要
   */
  private async triggerFullUpdate(trigger: 'browse' | 'read' | 'dismiss') {
    console.log(`[ProfileUpdate] 触发全量更新: ${trigger}`)
    
    // 1. 获取所有数据
    const visits = await db.confirmedVisits.toArray()
    const behaviors = await this.getBehaviors()
    
    // 2. 生成新的 AI 摘要
    const aiSummary = await this.generateAISummary(visits, behaviors, trigger)
    
    // 3. 更新关键词和主题
    const keywords = this.extractKeywords(visits, behaviors)
    const topics = this.calculateTopics(visits)
    
    // 4. 保存画像
    await db.userProfiles.update('singleton', {
      aiSummary,
      behaviors,
      displayKeywords: keywords,
      topics,
      lastUpdated: Date.now(),
      version: 2
    })
    
    console.log(`[ProfileUpdate] ✅ 全量更新完成`, {
      兴趣: aiSummary.interests,
      偏好数: aiSummary.preferences.length,
      避免数: aiSummary.avoidTopics.length,
      阅读记录: behaviors.reads.length,
      拒绝记录: behaviors.dismisses.length
    })
  }
  
  /**
   * 轻量更新：只更新关键词和主题（不调用 AI）
   */
  private async triggerLightweightUpdate(page: ConfirmedVisit) {
    // 增量更新关键词权重
    const profile = await db.userProfiles.get('singleton')
    if (!profile) return
    
    const keywords = this.updateKeywordsIncremental(
      profile.displayKeywords || [],
      page.keywords
    )
    
    await db.userProfiles.update('singleton', {
      displayKeywords: keywords,
      lastUpdated: Date.now()
    })
  }
  
  /**
   * 计算阅读权重
   */
  private calculateReadWeight(readDuration: number, scrollDepth: number): number {
    // 基础分：0.3
    // 时长分：最多 0.5（阅读 5 分钟 = 满分）
    // 深度分：最多 0.2（滚动 100% = 满分）
    
    const baseScore = 0.3
    const durationScore = Math.min(0.5, (readDuration / 300) * 0.5)
    const depthScore = scrollDepth * 0.2
    
    return baseScore + durationScore + depthScore
  }
}
```

### 更新时机总结

| 行为 | 触发条件 | 更新类型 | AI 调用 | 理由 |
|------|---------|---------|---------|------|
| **浏览页面** | 累计 20 页 | 全量更新 | ✅ 是 | 积累足够数据，值得重新理解 |
| **阅读推荐** | 累计 3 篇 | 全量更新 | ✅ 是 | 强信号，需要加强相关兴趣 |
| **拒绝推荐** | 每次 | 全量更新 | ✅ 是 | 强负信号，立即避免类似推荐 |
| **单次浏览** | 每次 | 轻量更新 | ❌ 否 | 增量更新关键词即可 |

---

## 🤖 AI 画像生成

### Prompt 设计（不惜 Token）

```typescript
/**
 * 生成 AI 语义摘要
 * 
 * 策略：传递尽可能多的上下文，追求精准度
 */
async function generateAISummary(
  visits: ConfirmedVisit[],
  behaviors: Behaviors,
  trigger: string
): Promise<AISummary> {
  
  // === 1. 准备上下文数据（丰富且结构化）===
  
  // 最近阅读（按权重排序，取前 10 篇）
  const topReads = behaviors.reads
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(r => ({
      title: r.title,
      summary: r.summary,
      duration: `${r.readDuration}秒`,
      depth: `${(r.scrollDepth * 100).toFixed(0)}%`,
      weight: r.weight.toFixed(2)
    }))
  
  // 最近拒绝（取前 5 篇）
  const topDismisses = behaviors.dismisses
    .slice(0, 5)
    .map(d => ({
      title: d.title,
      summary: d.summary
    }))
  
  // 高频浏览页面（停留时间 > 60秒，取前 20 个）
  const topVisits = visits
    .filter(v => v.dwellTime > 60)
    .sort((a, b) => b.dwellTime - a.dwellTime)
    .slice(0, 20)
    .map(v => ({
      title: v.title,
      domain: v.domain,
      keywords: v.keywords.slice(0, 5),
      dwellTime: `${v.dwellTime}秒`
    }))
  
  // === 2. 构建详细的 Prompt ===
  
  const prompt = `
你是用户画像分析专家。请深入分析用户的阅读偏好，生成精准的兴趣画像。

=== 📖 用户阅读过的推荐（强烈信号）===
${topReads.map((r, i) => `
${i + 1}. **${r.title}**
   摘要：${r.summary}
   阅读时长：${r.duration}，滚动深度：${r.depth}
   权重评分：${r.weight}
`).join('\n')}

${topReads.length === 0 ? '（暂无阅读记录）' : ''}

=== ❌ 用户拒绝的推荐（负向信号）===
${topDismisses.map((d, i) => `
${i + 1}. **${d.title}**
   摘要：${d.summary}
`).join('\n')}

${topDismisses.length === 0 ? '（暂无拒绝记录）' : ''}

=== 🌐 用户浏览过的网页（一般信号）===
${topVisits.map((v, i) => `
${i + 1}. **${v.title}** (${v.domain})
   关键词：${v.keywords.join('、')}
   停留时长：${v.dwellTime}
`).join('\n')}

=== 📊 统计信息 ===
- 总浏览页面：${visits.length} 页
- 总阅读推荐：${behaviors.totalReads} 篇
- 总拒绝推荐：${behaviors.totalDismisses} 篇
- 本次更新触发原因：${trigger === 'browse' ? '累计浏览' : trigger === 'read' ? '阅读推荐' : '拒绝推荐'}

=== 🎯 分析任务 ===
请综合以上信息，生成用户画像。注意：
1. **优先考虑阅读记录**（权重最高，代表用户真实偏好）
2. **重视拒绝记录**（避免推荐类似内容）
3. **参考浏览记录**（辅助理解兴趣广度）
4. **识别细分兴趣**（不要只归纳到"技术"、"设计"等粗分类，要具体到"React Hooks"、"微服务架构"等）
5. **捕捉偏好风格**（如"深度解析" vs "快速入门"，"理论研究" vs "实战教程"）

返回 JSON 格式（严格按此结构）：
\`\`\`json
{
  "interests": "用户兴趣总结（100-200字，要详细具体）",
  "preferences": [
    "偏好特征1（如：深度技术解析）",
    "偏好特征2（如：开源项目源码分析）",
    "偏好特征3",
    "..."
  ],
  "avoidTopics": [
    "避免主题1（基于拒绝记录）",
    "避免主题2",
    "..."
  ]
}
\`\`\`

只返回 JSON，不要其他解释。
`
  
  // === 3. 调用 AI ===
  console.log(`[AISummary] 生成画像摘要...`, {
    prompt长度: prompt.length,
    预估tokens: Math.ceil(prompt.length / 2.5),
    阅读记录数: topReads.length,
    拒绝记录数: topDismisses.length,
    浏览记录数: topVisits.length
  })
  
  const result = await aiManager.chat({
    messages: [{
      role: 'user',
      content: prompt
    }],
    temperature: 0.3,  // 降低随机性，保证一致性
    maxTokens: 1000    // 允许较长的输出
  })
  
  // === 4. 解析结果 ===
  const summary = JSON.parse(result.content)
  
  return {
    interests: summary.interests,
    preferences: summary.preferences,
    avoidTopics: summary.avoidTopics || [],
    generatedAt: Date.now(),
    basedOnPages: visits.length,
    basedOnReads: behaviors.totalReads,
    basedOnDismisses: behaviors.totalDismisses
  }
}
```

### Token 消耗估算

**单次画像生成：**
- Prompt: ~2000-3000 tokens（丰富上下文）
- Response: ~500 tokens
- **总计：~3000 tokens ≈ $0.0006**

**月度成本估算：**
- 浏览触发：1次/周 × 4周 = 4次
- 阅读触发：10次阅读 / 3 = 3次
- 拒绝触发：5次
- **总计：12次/月 × $0.0006 = $0.007/月**

**结论：即使不惜 token，月成本仍 < $0.01**

---

## 🎯 推荐匹配

### AI 评分 Prompt（包含画像）

```typescript
/**
 * 使用 AI 评估文章匹配度
 */
async function scoreArticleByAI(
  article: Article,
  profile: SemanticUserProfile
): Promise<{ score: number, reason: string }> {
  
  const aiSummary = profile.aiSummary
  if (!aiSummary) {
    // 降级到 TF-IDF
    return scoreByTFIDF(article, profile)
  }
  
  // === 构建评分 Prompt ===
  
  const prompt = `
你是内容推荐专家。请评估这篇文章对用户的吸引力。

=== 👤 用户画像 ===
**兴趣领域：**
${aiSummary.interests}

**偏好特征：**
${aiSummary.preferences.map((p, i) => `${i + 1}. ${p}`).join('\n')}

**避免主题：**
${aiSummary.avoidTopics.length > 0 
  ? aiSummary.avoidTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')
  : '（无）'
}

=== 📚 用户最近行为 ===
**阅读过的文章：**
${profile.behaviors?.reads.slice(0, 5).map((r, i) => 
  `${i + 1}. ${r.title}`
).join('\n') || '（暂无）'}

**拒绝过的文章：**
${profile.behaviors?.dismisses.slice(0, 3).map((d, i) => 
  `${i + 1}. ${d.title}`
).join('\n') || '（暂无）'}

=== 📄 待评估文章 ===
**标题：** ${article.title}

**摘要：** ${article.description || article.content?.slice(0, 300) || '（无摘要）'}

**来源：** ${article.feedUrl || '未知'}

=== 🎯 评估任务 ===
请综合考虑：
1. 文章内容与用户兴趣的匹配度
2. 是否符合用户的偏好风格
3. 是否触及用户避免的主题
4. 与用户阅读历史的相关性
5. 是否与拒绝记录相似（如相似则减分）

返回 JSON 格式：
\`\`\`json
{
  "score": 0.85,  // 匹配度 0-1，保留两位小数
  "reason": "推荐理由（一句话，不超过50字）"
}
\`\`\`

只返回 JSON，不要其他内容。
`
  
  // 调用 AI
  const result = await aiManager.chat({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,  // 低温度，保证稳定性
    maxTokens: 200
  })
  
  return JSON.parse(result.content)
}
```

---

## 🗄️ 数据库 Schema 更新

```typescript
// src/storage/db.ts

interface UserProfile {
  // ... 现有字段
  
  // 新增：AI 语义摘要
  aiSummary?: {
    interests: string
    preferences: string[]
    avoidTopics: string[]
    generatedAt: number
    basedOnPages: number
    basedOnReads: number
    basedOnDismisses: number
  }
  
  // 新增：行为记录
  behaviors?: {
    reads: Array<{
      articleId: string
      title: string
      summary: string
      feedUrl?: string
      readDuration: number
      scrollDepth: number
      timestamp: number
      weight: number
    }>
    dismisses: Array<{
      articleId: string
      title: string
      summary: string
      feedUrl?: string
      timestamp: number
      weight: number
    }>
    totalReads: number
    totalDismisses: number
    lastReadAt?: number
    lastDismissAt?: number
  }
  
  // 新增：展示关键词
  displayKeywords?: Array<{
    word: string
    weight: number
    source: 'browse' | 'read' | 'dismiss'
  }>
  
  // 版本号
  version: number  // 1 → 2
}

// 数据迁移
async function migrateToV2() {
  const profile = await db.userProfiles.get('singleton')
  if (!profile || profile.version === 2) return
  
  await db.userProfiles.update('singleton', {
    behaviors: {
      reads: [],
      dismisses: [],
      totalReads: 0,
      totalDismisses: 0
    },
    displayKeywords: profile.keywords?.map(k => ({
      word: k.word,
      weight: k.weight,
      source: 'browse' as const
    })),
    version: 2
  })
}
```

---

## 🧪 测试策略

### 1. 画像生成测试

```typescript
describe('SemanticProfileBuilder', () => {
  it('应该在累计 20 次浏览后触发全量更新', async () => {
    const builder = new SemanticProfileBuilder()
    
    // 模拟 20 次浏览
    for (let i = 0; i < 20; i++) {
      await builder.onBrowse(mockVisit())
    }
    
    const profile = await db.userProfiles.get('singleton')
    expect(profile?.aiSummary).toBeDefined()
    expect(profile?.aiSummary?.interests).toBeTruthy()
  })
  
  it('应该在阅读 3 篇后触发全量更新', async () => {
    const builder = new SemanticProfileBuilder()
    
    for (let i = 0; i < 3; i++) {
      await builder.onRead(mockArticle(), 120, 0.8)
    }
    
    const profile = await db.userProfiles.get('singleton')
    expect(profile?.aiSummary).toBeDefined()
    expect(profile?.behaviors?.reads.length).toBe(3)
  })
  
  it('应该在拒绝后立即触发全量更新', async () => {
    const builder = new SemanticProfileBuilder()
    
    await builder.onDismiss(mockArticle())
    
    const profile = await db.userProfiles.get('singleton')
    expect(profile?.aiSummary).toBeDefined()
    expect(profile?.aiSummary?.avoidTopics.length).toBeGreaterThan(0)
  })
})
```

### 2. 推荐匹配测试

```typescript
describe('SemanticRecommender', () => {
  it('应该对符合用户兴趣的文章给出高分', async () => {
    const profile = mockProfileWithInterests(['人工智能', '机器学习'])
    const article = mockArticle({ title: '深度学习入门教程' })
    
    const { score } = await scoreArticleByAI(article, profile)
    
    expect(score).toBeGreaterThan(0.7)
  })
  
  it('应该对用户避免的主题给出低分', async () => {
    const profile = mockProfileWithAvoidTopics(['体育'])
    const article = mockArticle({ title: 'NBA总决赛精彩回顾' })
    
    const { score } = await scoreArticleByAI(article, profile)
    
    expect(score).toBeLessThan(0.3)
  })
  
  it('应该对与已读文章相似的内容给出高分', async () => {
    const profile = mockProfileWithReads([
      { title: 'React Hooks 深入解析' }
    ])
    const article = mockArticle({ title: 'React Hooks 最佳实践' })
    
    const { score } = await scoreArticleByAI(article, profile)
    
    expect(score).toBeGreaterThan(0.7)
  })
})
```

---

## 📈 性能优化

### 1. 行为记录限制

```typescript
// 只保留最近的记录，避免无限增长
const MAX_READS = 50
const MAX_DISMISSES = 30

async function recordReadBehavior(article: Article, weight: number) {
  const profile = await db.userProfiles.get('singleton')
  const reads = profile?.behaviors?.reads || []
  
  // 添加新记录
  reads.unshift({
    articleId: article.id,
    title: article.title,
    summary: article.description || article.content?.slice(0, 200) || '',
    feedUrl: article.feedUrl,
    readDuration: article.readDuration || 0,
    scrollDepth: article.scrollDepth || 0,
    timestamp: Date.now(),
    weight
  })
  
  // 限制数量
  const trimmedReads = reads.slice(0, MAX_READS)
  
  await db.userProfiles.update('singleton', {
    'behaviors.reads': trimmedReads,
    'behaviors.totalReads': (profile?.behaviors?.totalReads || 0) + 1,
    'behaviors.lastReadAt': Date.now()
  })
}
```

### 2. AI 调用节流

```typescript
// 防止频繁调用 AI（例如用户快速连续拒绝多篇）
class AICallThrottler {
  private lastCall = 0
  private readonly MIN_INTERVAL = 10000  // 10秒
  
  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const elapsed = now - this.lastCall
    
    if (elapsed < this.MIN_INTERVAL) {
      // 等待剩余时间
      await new Promise(resolve => 
        setTimeout(resolve, this.MIN_INTERVAL - elapsed)
      )
    }
    
    this.lastCall = Date.now()
    return await fn()
  }
}
```

---

## 🎯 成功指标

1. **推荐精度**：点击率提升 30%+
2. **用户满意度**："不想读"率下降 50%+
3. **成本控制**：月均成本 < $0.30
4. **更新及时性**：拒绝后 < 10秒更新画像
5. **性能**：画像生成 < 5秒

---

## 🚀 实施计划

### Sprint 1: 基础架构（2天）
- [x] 创建设计文档
- [ ] 扩展 UserProfile 类型
- [ ] 数据库 schema 更新
- [ ] 数据迁移脚本

### Sprint 2: 画像生成（3天）
- [ ] 实现 SemanticProfileBuilder
- [ ] 实现更新触发器
- [ ] AI prompt 工程
- [ ] 单元测试

### Sprint 3: 推荐匹配（2天）
- [ ] 改造 pipeline.ts
- [ ] 优化评分 prompt
- [ ] 集成测试

### Sprint 4: 测试和优化（2天）
- [ ] 浏览器端到端测试
- [ ] 性能优化
- [ ] 成本分析
- [ ] 文档完善

---

## 📊 成本分析

### 详细估算

**画像生成：**
- 浏览触发（20页/次）：1次/周 × 4周 = 4次
- 阅读触发（3篇/次）：~10次阅读/月 ÷ 3 = 3次
- 拒绝触发（1篇/次）：~5次拒绝/月 = 5次
- **小计：12次 × $0.0006 = $0.0072**

**推荐评分：**
- 每天 3 次推荐 × 5 篇/次 = 15篇
- 每篇 ~1500 tokens × $0.0000015 = $0.00225
- **小计：15篇 × 30天 × $0.00225 = $0.10**

**总成本：$0.11/月**

**对比现状（无语义画像）：**
- 现状：推荐时只传递关键词，~$0.05/月
- 升级后：+$0.06/月（+120%）
- **但推荐精度提升 2-3 倍，非常值得！**

---

## 🔗 相关文档

- [Phase 6: 推荐系统](./PHASE_6_RECOMMENDATION.md)
- [Phase 7: 性能优化](./PHASE_7_OPTIMIZATION_PLAN.md)
- [AI 配置文档](./PHASE_4_AI_INTEGRATION.md)
