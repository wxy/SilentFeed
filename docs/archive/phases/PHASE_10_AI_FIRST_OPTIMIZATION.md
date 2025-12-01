# Phase 10: AI First 优化方案

> 创建日期: 2025-11-26  
> 状态: 讨论中 → 待实施  
> 分支: feat/ai-first-optimization

## 背景与目标

当前系统存在"程序员思维"的问题：展示**有的数据**而非**用户需要的数据**。本次优化聚焦**AI First**理念，提升产品的现代感和用户价值。

---

## 问题分析

### 1. 文案嵌套错误 ❌

**问题**: 设置页底部显示 "静阅 (静阅（Silent Feed）)"

**位置**: `src/options.tsx:344`
```tsx
{_("app.shortName")} ({_("app.name")})
// 渲染结果: 静阅 (静阅（Silent Feed）)
```

**原因**: 
- `app.shortName` = "静阅"
- `app.name` = "静阅（Silent Feed）"
- 嵌套使用导致重复

**修复方案**:
```tsx
// 选项 A: 只显示全名（推荐）
{_("app.name")}  // → 静阅（Silent Feed）

// 选项 B: 显示版本号
{_("app.name")} v{chrome.runtime.getManifest().version}
```

---

### 2. "纯关键字"模式存废讨论 🤔

**现状**:
- 推荐系统: `remoteAI | remoteAIWithReasoning | localAI | keyword` (4选1)
- 订阅源分析: `remoteAI | localAI | keyword` (3选1)
- 关键字模式基于 TF-IDF 算法

**问题分析**:

| 维度 | 关键字模式 | AI 模式 |
|------|-----------|---------|
| **效果** | ⚠️ 简单匹配，准确率低 | ✅ 语义理解，准确率高 |
| **成本** | ✅ 零成本 | ⚠️ 需要 API 费用或本地 AI |
| **速度** | ✅ 毫秒级 | ⚠️ 秒级（远程）/ 毫秒级（本地） |
| **用户感知** | ❌ "落伍"、不性感 | ✅ 现代、智能 |
| **适用场景** | 冷启动？降级？ | 正常运行 |

**深入思考**:

1. **冷启动场景** (页面数 < 100)
   - 当前逻辑: 关键字模式可用于冷启动
   - **问题**: 冷启动时用户画像不完善，关键字匹配更不准确
   - **结论**: 冷启动时更应该用 AI 理解用户意图，而非关键字

2. **降级场景** (AI 不可用)
   - 当前逻辑: AI 失败时降级到关键字
   - **问题**: 
     - 用户配置了 AI 但失败 → 应该提示用户修复配置
     - 完全不配置 AI → 应该引导用户配置
   - **结论**: 降级应该是**暂时的异常处理**，而非**功能选项**

3. **零成本场景** (用户不想花钱)
   - 本地 AI (Ollama/Chrome AI) 已经是零成本方案
   - 如果用户连本地 AI 都不配置，是否真的需要智能推荐？
   - **产品定位**: Silent Feed 是 AI 驱动的阅读器，而非传统 RSS 阅读器

**建议方案**: 

**方案 A: 完全移除关键字模式（激进）**
- ✅ 产品定位清晰: AI First
- ✅ 简化用户选择，减少决策负担
- ✅ 代码简化，维护成本降低
- ❌ 风险: 用户可能完全无法使用（如果不配置 AI）
- ❌ 需要强制用户配置 AI（可能造成流失）

**方案 B: 保留关键字但降级为内部降级逻辑（温和，推荐）**
- ✅ 保留降级能力，提高系统健壮性
- ✅ 用户界面不再显示关键字选项
- ✅ 产品定位: AI First，关键字仅作为兜底
- ✅ 首次启动引导用户配置 AI（本地或远程）
- ⚠️ 保留代码，但不暴露给用户

**方案 C: 重命名为"智能降级"（折中）**
- 将 "纯关键字" 改为 "智能降级"
- 说明: "AI 不可用时自动使用 TF-IDF 算法"
- ⚠️ 仍然占据用户选择空间
- ⚠️ 用户可能主动选择降级模式

**推荐**: **方案 B**
- UI 移除关键字选项
- 引擎配置简化为: `remoteAI | remoteAIWithReasoning | localAI`
- 代码保留 TF-IDF 作为降级逻辑
- 新用户引导配置 AI（Onboarding 流程）

---

### 3. 用户画像的 AI 化改造 🧠

**现状分析**:

当前画像数据来源:
1. **关键字画像** (基于 TF-IDF)
   - 主题分类 (Topic) → 11个预定义主题
   - 关键词云 (Keywords) → Top 10 关键词
   - 语言分布
   - 域名统计

2. **AI 画像** (可选)
   - 兴趣总结 (summary)
   - 内容偏好 (contentPreferences)
   - 阅读习惯 (readingPatterns)
   - 主题演变 (topicEvolution)

**问题**:

1. **主题分类的局限性**
   - 11个预定义主题无法覆盖所有兴趣
   - 例如: 用户喜欢 "Web3"、"量子计算"、"播客" 等细分领域
   - 关键字匹配可能将 "AI Art" 归为 Technology 或 Arts，不够精准

2. **关键词云的价值**
   - 对开发者: 可以调试、理解模型
   - **对用户**: 意义不大，甚至困惑（"为什么这些词代表我？"）
   - 用户需要: "你喜欢前端技术和设计趋势" 而非 "react 0.23, vue 0.18, css 0.12"

3. **数据展示的"程序员思维"**
   - 展示内部数据结构（关键词权重、主题分数）
   - 用户需要的是**可操作的洞察**，而非原始数据

**改造方案**:

**方案 A: AI 主导 + 关键字辅助（渐进）**
- 主画像由 AI 生成（自然语言描述）
- 关键字仅用于内部计算，不展示
- 主题由 AI 动态提取，而非预定义
- 用户看到: 
  ```
  📊 您的兴趣画像
  
  🎯 主要兴趣
  - 前端技术栈（React、Vue、现代CSS）
  - 用户体验设计（交互动画、可访问性）
  - AI 应用开发（RAG、提示工程）
  
  📖 阅读习惯
  - 偏好深度技术文章（5-10分钟阅读）
  - 关注技术趋势和最佳实践
  - 对实战案例有强烈兴趣
  ```

**方案 B: 完全 AI 驱动（激进）**
- 移除预定义主题分类
- 移除关键词云展示
- 所有画像由 AI 分析生成
- 内部仍保留 TF-IDF 用于 AI 输入

**推荐**: **方案 A**
- 用户体验友好（自然语言 vs 技术数据）
- 保留技术能力（关键字算法作为基础）
- AI 可用性更好（有基础数据兜底）

**UI 改造**:

```tsx
// 当前 UI (关键字主导)
<div>
  <h3>主题分布</h3>
  <ul>
    <li>Technology: 45%</li>
    <li>Design: 30%</li>
    <li>Business: 15%</li>
  </ul>
  
  <h3>关键词云</h3>
  <div>react, vue, css, animation...</div>
</div>

// 改造后 UI (AI 主导)
<div>
  {aiSummary ? (
    // AI 画像（主要）
    <div>
      <h3>🎯 您的兴趣画像</h3>
      <p>{aiSummary.summary}</p>
      
      <h4>📚 主要关注领域</h4>
      <ul>
        {aiSummary.topicEvolution.map(...)}
      </ul>
      
      <h4>📖 阅读偏好</h4>
      <p>{aiSummary.readingPatterns}</p>
    </div>
  ) : (
    // 降级展示（简化）
    <div>
      <p>正在构建您的兴趣画像...</p>
      <p>建议配置 AI 以获得更精准的分析</p>
      
      {/* 仅显示基础统计 */}
      <div>
        <p>已采集 {totalPages} 个页面</p>
        <p>最常访问: {topDomains[0]}</p>
      </div>
    </div>
  )}
</div>
```

---

### 4. 系统数据精简与价值化 📊

**现状**: `CollectionStats.tsx` 显示大量技术数据

**问题分析**:

| 数据项 | 当前状态 | 用户价值 | 建议 |
|--------|---------|---------|------|
| **累计采集页面数** | ✅ 显示 | ⭐⭐⭐ 高 | 保留 |
| **存储占用** | ✅ 显示 | ⭐⭐ 中 | 保留（可优化展示） |
| **AI 分析占比** | ✅ 显示 | ⭐ 低 | **移除** |
| **AI 费用/用量** | ❌ 缺失 | ⭐⭐⭐ 高 | **新增** |
| **文本分析统计** | ✅ 显示（关键字） | ⭐ 低 | **移除** |
| **推荐总数** | ✅ 显示 | ⭐⭐ 中 | 保留 |
| **RSS 读取总数** | ❌ 缺失 | ⭐⭐⭐ 高 | **新增** |
| **推荐筛选率** | ❌ 缺失 | ⭐⭐⭐ 高 | **新增** |

**详细说明**:

1. **移除: AI 分析占比**
   - 当前: "AI 分析: 67%, 关键字: 33%"
   - 问题: 用户不关心内部技术实现
   - 如果 AI First，应该接近 100%

2. **新增: AI 费用/用量统计**
   ```tsx
   <div className="stats-card">
     <h3>💰 本月 AI 使用</h3>
     <div className="usage-bar">
       <div className="used" style={{width: `${usage/budget*100}%`}}>
         ${usage.toFixed(2)}
       </div>
       <div className="budget">/ ${budget}</div>
     </div>
     
     <div className="breakdown">
       <div>推荐分析: {recommendCount} 次</div>
       <div>画像更新: {profileCount} 次</div>
       <div>订阅源分析: {feedCount} 次</div>
     </div>
     
     <div className="projection">
       <span>⚠️ 预计月底: ${projected.toFixed(2)}</span>
       {projected > budget && (
         <span className="warning">超出预算</span>
       )}
     </div>
   </div>
   ```

   **实现挑战**:
   - 当前可能没有精确的用量追踪
   - 需要实现**计费器** (Token Counter)
   - 记录每次 API 调用的 token 消耗
   - 根据 provider 的定价计算费用

3. **移除: 文本分析统计**
   - 当前: "已分析 1234 篇，中文 67%, 英文 33%"
   - 问题: 这是关键字分析的副产品，AI 时代意义不大
   - 用户关心的是**推荐质量**而非**分析数量**

4. **新增: RSS 读取总数与筛选率**
   ```tsx
   <div className="stats-card">
     <h3>📰 信息筛选</h3>
     <div className="funnel">
       <div className="level">
         <span>RSS 订阅源</span>
         <span className="count">{totalFeeds} 个</span>
       </div>
       <div className="arrow">↓</div>
       <div className="level">
         <span>总文章数</span>
         <span className="count">{totalArticles} 篇</span>
       </div>
       <div className="arrow">↓ TF-IDF 预筛选</div>
       <div className="level">
         <span>候选池</span>
         <span className="count">{candidatePool} 篇</span>
       </div>
       <div className="arrow">↓ AI 精选</div>
       <div className="level highlight">
         <span>推荐给您</span>
         <span className="count">{recommended} 篇</span>
       </div>
     </div>
     
     <div className="insight">
       💡 从 {totalArticles} 篇文章中精选 {recommended} 篇
       （筛选率: {(recommended/totalArticles*100).toFixed(1)}%）
     </div>
   </div>
   ```

   **体现价值**:
   - 清晰展示扩展的价值: 信息过滤能力
   - 用户理解: "我关注了很多源，但只看最相关的"
   - 数据来源:
     - `totalFeeds`: 订阅源数量
     - `totalArticles`: RSS 抓取的总文章数
     - `candidatePool`: TF-IDF 筛选后的候选数
     - `recommended`: 最终推荐数

---

### 5. 推荐标准与克制性 🎯

**问题**: 推荐池 32 条，弹窗 3-5 条，是否过于宽松？

**现状分析**:

```typescript
// 当前推荐流程
RSS文章 (数百篇)
  → TF-IDF预筛选 (候选池, 可能上百篇)
  → AI评分 (Top 32, score > 0.6)
  → 推荐池 (32篇)
  → 弹窗展示 (3-5篇)
  → 用户阅读/不想读
  → 从池中补充新推荐
```

**问题**:

1. **推荐池过大**
   - 32 条意味着接受了 score > 0.6 的所有文章
   - 可能导致质量参差不齐
   - **克制原则**: 宁缺毋滥

2. **阈值设置**
   ```typescript
   qualityThreshold: 0.6  // 当前阈值
   ```
   - 0.6 意味着 60% 相关度就推荐
   - 建议提高到 0.75 或 0.8？

3. **推荐频率**
   - 当前: 每次弹窗 3-5 条
   - 用户操作后从池中补充
   - **问题**: 用户可能一天看到 10+ 条推荐
   - **产品理念**: 静阅 = 克制、精选

**优化方案**:

**方案 A: 提高质量阈值**
```typescript
qualityThreshold: 0.75  // 从 0.6 提升到 0.75
maxRecommendations: 5   // 从 3-5 改为固定 5 条
poolSize: 10            // 推荐池从 32 降低到 10
```

**方案 B: 动态阈值（自适应）**
```typescript
// 根据推荐效果动态调整
if (readRate > 0.6) {
  // 阅读率高，说明推荐准确，可以稍微降低阈值
  threshold = 0.7
  poolSize = 15
} else if (readRate < 0.3) {
  // 阅读率低，提高质量要求
  threshold = 0.8
  poolSize = 5
}
```

**方案 C: 每日推荐限额**
```typescript
// 克制原则: 每天最多推荐 X 条
dailyLimit: 10  // 每天最多 10 条新推荐

// 推荐池动态生成
- 早上生成: 5 条高质量
- 用户阅读后: 从 RSS 新文章中补充
- 达到限额: 不再推荐，第二天重置
```

**推荐**: **方案 A + 方案 C 结合**
1. 提高质量阈值到 0.75
2. 推荐池减少到 10-15 条
3. 每日推荐限额 10 条
4. 弹窗固定显示 3 条（最精选）
5. 用户操作后谨慎补充（不是无限补充）

**UI 展示**:
```tsx
// 弹窗底部提示
<div className="recommendation-footer">
  <span>今日已推荐 {todayCount}/10</span>
  {todayCount >= 10 && (
    <span>✨ 今日推荐已达上限，明天再来</span>
  )}
</div>
```

---

## 依赖关系与数据流

### AI 配置与分析配置的关系

**当前问题**: 分析配置中可以选择"本地 AI"，但 AI 引擎配置中可能禁用了本地 AI

**逻辑矛盾**:
```
AI 引擎配置: 本地 AI ❌ 不可用
分析配置: 推荐引擎 = 本地 AI ✅
→ 运行时失败，降级到关键字
```

**解决方案**:

```tsx
// AnalysisSettings.tsx
useEffect(() => {
  const checkEngineAvailability = async () => {
    const capabilities = await checkAllEngineCapabilities()
    
    setEngineAvailability({
      remoteAI: capabilities.remoteAI.available,
      remoteAIWithReasoning: capabilities.remoteAIWithReasoning.available,
      localAI: capabilities.localAI.available,
      keyword: true  // 总是可用（内部降级）
    })
  }
  
  checkEngineAvailability()
}, [])

// 渲染引擎选项
<select value={engine} onChange={...}>
  {engineAvailability.remoteAI && (
    <option value="remoteAI">远程 AI</option>
  )}
  {engineAvailability.remoteAIWithReasoning && (
    <option value="remoteAIWithReasoning">推理 AI</option>
  )}
  {engineAvailability.localAI && (
    <option value="localAI">本地 AI</option>
  )}
  {/* 不显示 keyword 选项 */}
</select>

{!engineAvailability.remoteAI && !engineAvailability.localAI && (
  <div className="warning">
    ⚠️ 未检测到可用的 AI 引擎，请先在"AI 引擎"页面配置
  </div>
)}
```

---

## 实施计划

### Phase 10.1: 基础清理（低风险）

**任务**:
1. ✅ 修复页脚文案嵌套
2. ✅ UI 移除"纯关键字"选项
3. ✅ 分析配置添加引擎可用性检查
4. ✅ 文档更新（PRD、TDD）

**预计工作量**: 2-3 小时

---

### Phase 10.2: 数据展示优化（中风险）

**任务**:
1. ✅ 移除 AI 分析占比展示
2. ✅ 移除文本分析统计
3. ✅ 新增 RSS 文章总数统计
4. ✅ 新增推荐筛选漏斗图
5. ✅ 用户画像 UI 改造（AI 优先）

**预计工作量**: 4-6 小时

---

### Phase 10.3: AI 计费器（高风险）

**任务**:
1. ⚠️ 设计 Token 计数接口
2. ⚠️ 实现费用追踪 (UsageTracker)
3. ⚠️ 按 provider 定价计算费用
4. ⚠️ UI 展示费用和预算
5. ⚠️ 预算预警机制

**预计工作量**: 8-10 小时

**技术挑战**:
- 不同 provider 的 token 计数方式不同
- OpenAI: 直接返回 `usage.total_tokens`
- Anthropic: 可能需要自己估算
- DeepSeek: Reasoner 模式的计费复杂

---

### Phase 10.4: 推荐克制性（中风险）

**任务**:
1. ✅ 提高质量阈值到 0.75
2. ✅ 减少推荐池大小到 10
3. ✅ 实现每日推荐限额
4. ✅ 调整自适应推荐逻辑
5. ✅ UI 展示推荐限额提示

**预计工作量**: 4-5 小时

---

## 总预计工作量

- Phase 10.1: 2-3h
- Phase 10.2: 4-6h
- Phase 10.3: 8-10h (可选)
- Phase 10.4: 4-5h

**总计**: 18-24 小时

**建议分阶段实施**:
1. 先做 10.1 + 10.2 (快速见效)
2. 再做 10.4 (提升推荐质量)
3. 最后做 10.3 (完善体验)

---

## 决策确认 ✅

### Q1: 是否完全移除关键字模式？

**决策**: ✅ **B. 降级为内部逻辑**
- UI 移除"纯关键字"选项
- 代码保留 TF-IDF 作为异常降级
- 产品定位: AI First

---

### Q2: AI 画像是否完全替代关键字画像？

**决策**: ✅ **A. 完全替代（激进）**
- 用户界面只展示 AI 生成的画像
- 移除关键词云、预定义主题分类
- TF-IDF 仅作为 AI 的输入数据，不展示

---

### Q3: 推荐质量阈值设定？

**决策**: ✅ **C. 动态自适应**
- 根据用户行为动态调整阈值
- 阅读率高 → 适当降低阈值
- 不想读率高 → 提高阈值
- 初始值: 0.75

---

### Q4: AI 计费器是否必要？

**决策**: ✅ **必须实现**
- 严格的费用追踪机制
- 虽然可能与供应商对账有偏差，但给用户透明度
- Phase 10.3 必做项

---

### Q5: 每日推荐限额设定？

**决策**: ✅ **动态限额机制**

**核心逻辑**:
```typescript
// 基础限额
baseDailyLimit = 10

// 根据用户行为调整
if (用户点击阅读少) {
  // 可能是：1) 用户没精力 2) 推荐不合心意
  → 减少推荐数量 (limit -= 2)
  → 提高质量阈值
}

if (用户点击"不想读"多) {
  // 当前池中的推荐可能都不合适
  → 重新评估推荐池
  → 提高质量阈值
  → 清空部分低分推荐
}

if (用户阅读率高) {
  // 推荐准确，可以适当增加
  → 增加推荐数量 (limit += 2, max 15)
}
```

**推荐评分展示**: ⭐️星级制
- ❌ 不显示精确分数 (0.87, 0.76)
- ✅ 使用 1-3 星表示质量
  - ⭐️⭐️⭐️ (≥ 0.85): 强烈推荐
  - ⭐️⭐️ (0.75-0.84): 推荐
  - ⭐️ (0.65-0.74): 可能感兴趣
- 理论上只推荐三星内容，但允许二星作为补充

---

## 下一步行动

1. **讨论确认**上述方案
2. **优先级排序** (哪些必做、哪些可选)
3. **开始实施** Phase 10.1
4. **逐步迭代**其他阶段

---

## 附录: 代码位置索引

### 需要修改的文件

```
文案修复:
- src/options.tsx:344

移除关键字选项:
- src/components/settings/AnalysisSettings.tsx
- src/types/analysis-engine.ts
- public/locales/zh-CN/translation.json

画像优化:
- src/components/settings/ProfileSettings.tsx
- src/core/profile/UserProfile.ts

数据统计:
- src/components/settings/CollectionStats.tsx
- src/components/settings/RecommendationStats.tsx
- src/storage/db.ts (新增 RSS 统计查询)

推荐优化:
- src/storage/recommendation-config.ts
- src/core/recommender/RecommendationService.ts
- src/core/recommender/adaptive-count.ts

AI 计费器 (新增):
- src/core/ai/UsageTracker.ts
- src/storage/ai-usage.ts
```

