# Phase 4 - Sprint 3: 页面追踪器 AI 集成

**状态**: 🚧 计划中  
**预计时间**: 2-3 小时  
**负责人**: Copilot + 用户  
**创建时间**: 2025-11-09

## 目标

将 Sprint 2 实现的 AI 能力集成到页面追踪器中，使用真实的 AI 分析替代关键词提取。

## 背景

**当前状态**:
- ✅ Sprint 1: AI 配置 UI 完成
- ✅ Sprint 2: AI Provider 架构完成
- ⏳ Sprint 3: 需要集成到实际页面分析流程

**问题**:
- 页面追踪器 (`src/contents/page-tracker.ts`) 目前使用 `TextAnalyzer` 提取关键词
- 没有利用用户配置的 AI 服务
- 分析质量受限于关键词匹配

**目标**:
- 集成 `aiManager` 到页面追踪流程
- 保持现有的流程和数据结构
- 确保降级策略正常工作

## 技术方案

### 1. 修改页面追踪器

**文件**: `src/contents/page-tracker.ts`

**当前流程**:
```typescript
// 1. 提取文本
const text = ContentExtractor.extractMainContent(document)

// 2. 分析内容 (使用 TextAnalyzer)
const analyzer = new TextAnalyzer()
const keywords = analyzer.extractKeywords(text)

// 3. 保存到数据库
await savePageVisit({
  ...
  analysis: {
    keywords,
    language: "en"
  }
})
```

**新流程**:
```typescript
// 1. 提取文本
const text = ContentExtractor.extractMainContent(document)

// 2. 初始化 AI Manager
await aiManager.initialize()

// 3. AI 分析内容 (自动降级到关键词)
const result = await aiManager.analyzeContent(text)

// 4. 保存到数据库 (保持兼容的数据结构)
await savePageVisit({
  ...
  analysis: {
    keywords: extractKeywordsFromTopics(result.topicProbabilities),
    language: detectLanguage(text),
    aiAnalysis: {
      topics: result.topicProbabilities,
      provider: result.metadata.provider,
      model: result.metadata.model,
      timestamp: result.metadata.timestamp,
      cost: result.metadata.cost
    }
  }
})
```

### 2. 扩展数据库 Schema

**文件**: `src/storage/db.ts`

**当前 PageVisit**:
```typescript
interface PageVisit {
  url: string
  title: string
  analysis?: {
    keywords: string[]
    language: string
  }
}
```

**新增字段**:
```typescript
interface PageVisit {
  url: string
  title: string
  analysis?: {
    keywords: string[]  // 保留兼容性
    language: string
    // 新增: AI 分析结果
    aiAnalysis?: {
      topics: Record<string, number>  // {"技术": 0.7, "设计": 0.3}
      provider: "deepseek" | "keyword" | "openai" | "anthropic"
      model: string
      timestamp: number
      cost?: number
      tokensUsed?: {
        prompt: number
        completion: number
        total: number
      }
    }
  }
}
```

**数据库版本升级**:
```typescript
// 添加到 db.ts version 5
version(5).stores({
  pageVisits: "++id, url, domain, timestamp, [domain+timestamp], visitedAt"
  // aiAnalysis 作为嵌套对象，不需要索引
})
```

### 3. 辅助函数

**文件**: `src/core/ai/helpers.ts` (新建)

```typescript
/**
 * 从主题概率提取关键词（用于向后兼容）
 */
export function extractKeywordsFromTopics(
  topics: Record<string, number>
): string[] {
  return Object.entries(topics)
    .filter(([_, prob]) => prob > 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, _]) => topic)
}

/**
 * 检测文本语言
 */
export function detectLanguage(text: string): string {
  // 简单的启发式检测
  const hasZh = /[\u4e00-\u9fa5]/.test(text)
  const hasJa = /[\u3040-\u309f\u30a0-\u30ff]/.test(text)
  
  if (hasZh) return "zh"
  if (hasJa) return "ja"
  return "en"
}
```

### 4. 成本统计

**考虑点**:
- Sprint 2 已经在 `aiManager` 中记录成本（console.log）
- Sprint 5 将实现持久化成本追踪
- 当前只需要将 cost 信息存入 PageVisit

## 实施步骤

### Step 1: 创建辅助函数 (15 分钟)
- [ ] 创建 `src/core/ai/helpers.ts`
- [ ] 实现 `extractKeywordsFromTopics`
- [ ] 实现 `detectLanguage`
- [ ] 编写单元测试 (helpers.test.ts)

### Step 2: 扩展数据库 Schema (20 分钟)
- [ ] 修改 `PageVisit` 接口添加 `aiAnalysis` 字段
- [ ] 升级数据库版本到 v5
- [ ] 更新相关类型定义
- [ ] 运行迁移测试

### Step 3: 修改页面追踪器 (30 分钟)
- [ ] 导入 `aiManager` 和辅助函数
- [ ] 替换 `TextAnalyzer` 为 `aiManager.analyzeContent`
- [ ] 构建兼容的 `analysis` 对象
- [ ] 处理错误和降级情况

### Step 4: 测试 (60 分钟)
- [ ] 单元测试: 测试新的数据结构
- [ ] 集成测试: Mock aiManager，测试页面追踪流程
- [ ] 浏览器测试:
  - [ ] 配置 DeepSeek API
  - [ ] 访问真实页面
  - [ ] 检查 IndexedDB 中的 `aiAnalysis` 数据
  - [ ] 验证成本计算
  - [ ] 测试降级到关键词的情况

### Step 5: 验证与文档 (30 分钟)
- [ ] 验证数据一致性（keywords 和 topics 对齐）
- [ ] 检查成本记录
- [ ] 更新文档
- [ ] 提交代码

## 验收标准

### 功能验收
- [x] 页面访问时自动调用 AI 分析
- [x] 分析结果正确保存到 IndexedDB
- [x] `keywords` 字段保持兼容性（从 topics 提取）
- [x] `aiAnalysis` 字段包含完整的 AI 元数据
- [x] 降级到关键词时 provider 为 "keyword"
- [x] 成本信息正确记录

### 性能验收
- [x] AI 分析时间 < 3s（DeepSeek API）
- [x] 关键词分析时间 < 100ms（降级情况）
- [x] 页面追踪延迟 < 200ms（除去 AI 分析时间）

### 质量验收
- [x] 所有测试通过
- [x] 代码覆盖率 ≥ 70%
- [x] TypeScript 无错误
- [x] 浏览器测试验证

## 风险与缓解

### 风险 1: API 调用失败影响体验
**影响**: 高  
**缓解**: 
- 自动降级到关键词分析（已实现）
- 设置合理的超时时间（30s）
- 不阻塞页面追踪主流程

### 风险 2: 成本失控
**影响**: 中  
**缓解**:
- Sprint 5 实现预算控制
- 当前记录成本但不限制
- 用户可以禁用 AI 分析

### 风险 3: 数据库升级失败
**影响**: 低  
**缓解**:
- Dexie.js 自动处理版本升级
- 新字段为可选（向后兼容）
- 测试环境先验证

## 后续计划

**Sprint 4**: OpenAI 和 Anthropic Providers (2-3 小时)
- 实现 OpenAIProvider
- 实现 AnthropicProvider
- 统一 Provider 测试套件

**Sprint 5**: 成本追踪和预算控制 (3-4 小时)
- 持久化成本记录
- 月度预算设置
- 超预算时自动降级
- 成本统计看板

**Sprint 6**: 用户画像升级 (AI Embeddings) (4-5 小时)
- 使用 AI 生成的 topics 构建画像
- 可选：支持 embeddings 的相似度推荐
- 优化推荐质量

## 参考资料

- Sprint 1 文档: `docs/PHASE_4_SPRINT_1_AI_CONFIG.md`
- Sprint 2 代码:
  - `src/core/ai/types.ts`
  - `src/core/ai/AICapabilityManager.ts`
  - `src/core/ai/providers/DeepSeekProvider.ts`
- 当前页面追踪器: `src/contents/page-tracker.ts`
- 数据库定义: `src/storage/db.ts`
