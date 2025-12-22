# AI 摘要翻译优化方案

## 问题描述

### 当前实现（✅ 已实现 Phase 1）

推荐系统的翻译流程：

1. **AI 分析阶段**：
   - ✅ 已根据界面语言选择 prompt（`BaseAIService.initializeLanguage()`）
   - ✅ 界面中文 → 中文 prompt → AI 生成**中文摘要**
   - ✅ 界面英文 → 英文 prompt → AI 生成**英文摘要**

2. **推荐生成阶段**：
   - 创建推荐条目（**标题仍是原文**，如英文）
   - 摘要已是界面语言（中文）

3. **翻译阶段**（`translateRecommendation()`）：
   - ❌ **问题**：同时翻译标题和摘要
   - ❌ **浪费**：摘要已是目标语言，被重复翻译

### 核心问题

- **摘要**：已经是界面语言（AI 生成时已解决）✅
- **标题**：仍是原文，需要单独翻译 ❌
- **优化空间**：让 AI 在生成摘要时同时翻译标题，**完全避免调用翻译服务**

## 优化方案

### 方案 1: AI 分析时同步翻译（推荐）

**核心思路**：在 AI 分析内容时，如果检测到需要翻译，就让 AI 同时生成翻译后的标题和摘要。

**修改点**：

1. **Prompt 模板增强**（`analyzeContent`）：
```json
{
  "topics": {
    "主题1": 0.5,
    "主题2": 0.3
  },
  "summary": "中文摘要",
  "translatedTitle": "翻译后的标题（仅当原文非中文时）"
}
```

2. **AI 分析逻辑**（`BaseAIService.analyzeContent`）：
   - 检测文章语言（通过标题/内容）
   - 获取界面语言和自动翻译设置
   - 如果需要翻译，在 prompt 中添加翻译标题的要求
   - 返回时包含 `translatedTitle`

3. **推荐生成**（`pipeline.ts`）：
   - 如果 AI 分析结果包含 `translatedTitle`，直接使用
   - 在创建 `Recommendation` 时填充 `translation` 字段

**优势**：
- ✅ 一次 AI 调用完成摘要生成 + 标题翻译
- ✅ 节省翻译 API 成本（标题通常 <20 词）
- ✅ 减少延迟（避免额外的翻译请求）
- ✅ 摘要和标题语言一致

**劣势**：
- ❌ AI 翻译质量可能不如专业翻译服务
- ❌ Prompt 变得更复杂（可能影响主题分析准确性）

### 方案 2: 使用 Prompt 语言控制（备选）

**核心思路**：根据界面语言和自动翻译设置，动态选择 prompt 语言。

**逻辑**：
```typescript
// 决定 prompt 语言
const promptLanguage = autoTranslateEnabled && interfaceLanguage !== articleLanguage
  ? interfaceLanguage  // 如果需要翻译，用目标语言
  : articleLanguage    // 否则用原文语言

const prompt = promptManager.getAnalyzeContentPrompt(
  promptLanguage,  // 'zh-CN' 或 'en'
  content,
  userProfile,
  useReasoning
)
```

**效果**：
- 英文文章 + 中文界面 + 自动翻译 → 用中文 prompt → AI 生成中文摘要
- 中文文章 + 中文界面 → 用中文 prompt → AI 生成中文摘要
- 英文文章 + 英文界面 → 用英文 prompt → AI 生成英文摘要

**优势**：
- ✅ 简单直接，不增加 prompt 复杂度
- ✅ 摘要语言自动匹配界面语言
- ✅ 仍需翻译标题（可保持专业翻译质量）

**劣势**：
- ❌ 仍需单独翻译标题（多一次 API 调用）
- ❌ 英文 prompt 可能导致主题识别用英文词汇

### 方案 3: 混合方案（最佳平衡）

结合方案 1 和方案 2：

1. **Prompt 语言**：根据界面语言选择（保证摘要语言正确）
2. **标题翻译**：在 prompt 中添加可选的标题翻译要求
3. **回退机制**：如果 AI 未返回翻译标题，使用翻译服务补充

**实施步骤**：

#### Step 1: 增强 Prompt 模板

**zh-CN.json**（添加翻译标题提示）：
```json
{
  "analyzeContent": {
    "withoutProfile": {
      "user": "分析以下文本的主题分布并生成摘要，输出 JSON。\n\n文本：\n{{content}}\n\n{{#needsTranslation}}\n**注意**：文章原文标题是「{{originalTitle}}」，请将其翻译成中文。\n{{/needsTranslation}}\n\n请：\n1. 识别 3-5 个主要主题\n2. 生成 40-80 字中文摘要\n{{#needsTranslation}}\n3. 提供原文标题的中文翻译\n{{/needsTranslation}}\n\n输出格式（JSON）：\n{\n  \"topics\": { \"技术\": 0.6 },\n  \"summary\": \"中文摘要\",\n{{#needsTranslation}}\n  \"translatedTitle\": \"翻译后的标题\"\n{{/needsTranslation}}\n}\n\n只输出 JSON。"
    }
  }
}
```

#### Step 2: 修改 BaseAIService

```typescript
async analyzeContent(
  content: string,
  options?: AnalyzeOptions & {
    originalTitle?: string
    autoTranslateEnabled?: boolean
    interfaceLanguage?: SupportedLanguage
  }
): Promise<UnifiedAnalysisResult & { translatedTitle?: string }> {
  // 1. 检测文章语言
  const articleLanguage = detectLanguage(options?.originalTitle || content)
  
  // 2. 决定是否需要翻译
  const needsTranslation = options?.autoTranslateEnabled && 
    options?.interfaceLanguage !== articleLanguage
  
  // 3. 选择 prompt 语言
  const promptLanguage = needsTranslation 
    ? options.interfaceLanguage 
    : articleLanguage
  
  // 4. 构建 prompt（包含翻译标题要求）
  const prompt = promptManager.getAnalyzeContentPrompt(
    promptLanguage,
    content,
    options?.userProfile,
    options?.useReasoning,
    needsTranslation ? { originalTitle: options.originalTitle } : undefined
  )
  
  // 5. 调用 AI
  const response = await this.callChatAPI(prompt, ...)
  
  // 6. 解析结果（包含可选的 translatedTitle）
  const analysis = this.parseAnalysisResult(response.content)
  
  return {
    topicProbabilities: analysis.topics,
    summary: analysis.summary,
    translatedTitle: analysis.translatedTitle,  // 新增
    metadata: ...
  }
}
```

#### Step 3: 修改推荐管道

```typescript
// pipeline.ts
async process(input: RecommendationInput): Promise<RecommendationResult> {
  // ...
  
  // AI 分析时传递翻译参数
  const uiConfig = await getUIConfig()
  const interfaceLanguage = getCurrentLanguage()
  
  const analysis = await aiManager.analyzeContent(
    article.fullContent,
    {
      userProfile,
      useReasoning,
      originalTitle: article.title,  // 传递原标题
      autoTranslateEnabled: uiConfig.autoTranslate,
      interfaceLanguage
    }
  )
  
  // 如果 AI 返回了翻译标题，直接使用
  if (analysis.translatedTitle) {
    recommendedArticle.translation = {
      sourceLanguage: detectLanguage(article.title),
      targetLanguage: interfaceLanguage,
      translatedTitle: analysis.translatedTitle,
      translatedSummary: analysis.summary,  // 摘要已经是目标语言
      translatedAt: Date.now()
    }
  }
  
  // ...
}
```

## 实施计划

### Phase 1: 基础优化（✅ 已完成）
- [x] 根据界面语言动态选择 prompt 语言
- [x] `BaseAIService.initializeLanguage()` 从 chrome.storage 读取语言偏好
- [x] 摘要已自动生成为界面语言
待实施，高优先级）
- [ ] 增强 prompt 模板，添加标题翻译提示
- [ ] 修改 `BaseAIService.analyzeContent` 接口（传递原标题）
- [ ] 修改推荐管道，传递原标题给 AI
- [ ] 优化 `translateRecommendation()`：
  - 如果 AI 已返回 `translatedTitle`，跳过翻译服务
  - 摘要无需翻译（已是界面语言）vice.analyzeContent` 接口
- [ ] 修改推荐管道，传递翻译参数
- [ ] 添加回退机制（AI 未返回翻译时使用翻译服务）

### Phase 3: 测试验证
- [ ] 测试不同语言组合（中文文章、英文文章、中英混合）
- [ ] 验证翻译质量（AI 翻译 vs 专业翻译）
- [ ] 性能测试（延迟、成本）
- [ ] A/B 测试（用户满意度）

## 预期效果

**性能提升**：
- 推荐生成延迟：-20%（减少翻译 API 调用）
- AI 成本：持平或略降（翻译标题 token 少）

**用户体验**：
- 摘要和标题语言一致
- 推荐展示更流畅
- 翻译质量可能略有下降（可通过 prompt 工程优化）

## 风险评估

**低风险**：
- Prompt 语言选择（方案 2）：完全向后兼容

**中风险**：
- 标题翻译质量：需要测试验证
- Prompt 复杂度增加：可能影响主题识别准确性

**缓解措施**：
- 添加翻译质量对比测试
- 保留回退到专业翻译服务的选项
- 分阶段部署，先用于非关键场景

## 结论

**推荐实施**：混合方案（方案 3）

**优先级**：
1. **立即**：实施 Phase 1（prompt 语言选择）
2. **短期**：实施 Phase 2（标题翻译集成）
3. **中期**：测试验证和优化

**预期收益**：
- ✅ 减少 API 调用次数
- ✅ 降低推荐生成延迟
- ✅ 改善用户体验（语言一致性）
