# Phase: AI 提示词国际化与架构重构

## 背景

在完成 Phase 5 RSS 发现功能后，发现了三个国际化问题：

1. **OPML 导出硬编码中文**：导出 OPML 文件时标题和"未分类"标签使用硬编码中文
2. **AI 提示词固定中文**：用户画像生成和内容分析的提示词始终使用中文，即使用户界面语言设置为英文
3. **语言读取方式不当**：第一版从 DOM/localStorage 读取语言，应该从配置统一读取

## 目标

1. ✅ 实现 OPML 导出国际化
2. ✅ 实现 AI 提示词多语言支持
3. ✅ 重构提示词管理架构，解耦 AI 提供商和提示词
4. ✅ 统一语言配置读取方式

## 技术方案

### 1. OPML 导出国际化

**修改文件**：
- `src/core/rss/OPMLImporter.ts`
- `src/components/settings/RSSSettings.tsx`
- `public/locales/zh-CN/translation.json`
- `public/locales/en/translation.json`

**实现方式**：
```typescript
// OPMLImporter.generate() 支持语言参数
static generate(feeds: RSSFeed[], language: 'zh-CN' | 'en' = 'zh-CN'): string {
  const title = language === 'en' 
    ? 'Silent Feed Subscriptions' 
    : 'Silent Feed 订阅列表'
  
  const uncategorized = language === 'en' 
    ? 'Uncategorized' 
    : '未分类'
  
  // 生成 OPML XML...
}

// RSSSettings 调用时传递当前语言
const blob = new Blob([
  OPMLImporter.generate(feeds, currentLanguage)
], { type: 'application/xml' })
```

**测试覆盖**：23/23 通过，包含 5 个新增的国际化测试

### 2. AI 提示词架构重构

#### 第一版（已废弃）

```
src/core/ai/
├── BaseAIService.ts         # 硬编码中文提示词
├── prompts-en.ts            # 独立的英文提示词文件
└── providers/
    ├── DeepSeekProvider.ts
    └── OpenAIProvider.ts
```

**问题**：
- 提示词与 AI 提供商耦合
- 从 localStorage 读取语言，不够统一
- 提示词以代码形式存储，难以维护

#### 第二版（新架构）

```
src/core/ai/
├── prompts/                     # 独立的提示词管理模块 ✅
│   ├── types.ts                # 类型定义
│   ├── index.ts                # PromptManager
│   └── templates/              # JSON 数据文件
│       ├── zh-CN.json          # 中文提示词（350+ 行）
│       └── en.json             # 英文提示词（350+ 行）
├── BaseAIService.ts            # 使用 PromptManager ✅
└── providers/                  # 只负责 API 调用
    ├── DeepSeekProvider.ts
    ├── OpenAIProvider.ts
    └── OllamaProvider.ts
```

### 3. PromptManager 核心设计

#### 类型定义（types.ts）

```typescript
export type SupportedLanguage = 'zh-CN' | 'en'

export interface PromptTemplate {
  system?: string
  user: string
}

export interface UserProfile {
  interests: string
  preferences: string[]
  avoidTopics: string[]
}

export interface PromptVariables {
  content?: string
  interests?: string
  preferences?: string
  avoidTopics?: string
  behaviorSummary?: string
  currentProfileInterests?: string
  currentProfilePreferences?: string
  currentProfileAvoidTopics?: string
}

export interface PromptTemplates {
  analyzeContent: {
    withProfile: PromptTemplate
    withoutProfile: PromptTemplate
  }
  analyzeContentReasoning: {
    withProfile: PromptTemplate
    withoutProfile: PromptTemplate
  }
  generateProfileFull: PromptTemplate
  generateProfileIncremental: PromptTemplate
}
```

#### PromptManager 实现（index.ts）

```typescript
export class PromptManager {
  private templates: Map<SupportedLanguage, PromptTemplates>

  constructor() {
    // 预加载所有语言模板
    this.templates = new Map([
      ['zh-CN', zhCNTemplates],
      ['en', enTemplates]
    ])
  }

  /**
   * 获取指定语言的模板
   */
  getTemplates(language: SupportedLanguage): PromptTemplates {
    return this.templates.get(language) || this.templates.get('zh-CN')!
  }

  /**
   * 渲染模板（变量替换）
   */
  render(template: PromptTemplate, variables: PromptVariables): string {
    let result = template.user
    
    // 替换所有变量：{{variable}}
    Object.entries(variables).forEach(([key, value]) => {
      if (value !== undefined) {
        result = result.replace(
          new RegExp(`{{${key}}}`, 'g'),
          String(value)
        )
      }
    })
    
    return result
  }

  /**
   * 便捷方法：获取内容分析提示词
   */
  getAnalyzeContentPrompt(
    language: SupportedLanguage,
    content: string,
    userProfile?: UserProfile,
    useReasoning: boolean = false
  ): string {
    const templates = this.getTemplates(language)
    const category = useReasoning ? 'analyzeContentReasoning' : 'analyzeContent'
    const template = userProfile 
      ? templates[category].withProfile 
      : templates[category].withoutProfile

    return this.render(template, {
      content,
      interests: userProfile?.interests,
      preferences: userProfile?.preferences.join('、'),
      avoidTopics: userProfile?.avoidTopics.join('、')
    })
  }

  // 类似方法：getGenerateProfileFullPrompt、getGenerateProfileIncrementalPrompt
}

// 全局单例
export const promptManager = new PromptManager()
```

#### JSON 模板结构（zh-CN.json / en.json）

```json
{
  "analyzeContent": {
    "withProfile": {
      "user": "你是一个智能内容分析助手...\n\n# 用户画像\n- **兴趣领域**: {{interests}}\n- **内容偏好**: {{preferences}}\n- **避免主题**: {{avoidTopics}}\n\n# 文章内容\n{{content}}\n\n# 分析要求\n1. 识别文章的 3-5 个主要主题\n2. 评估每个主题与用户兴趣的相关性\n..."
    },
    "withoutProfile": {
      "user": "分析以下文本的主题分布...\n\n文本：\n{{content}}\n\n请识别 3-5 个主要主题..."
    }
  },
  "analyzeContentReasoning": { /* 推理模式提示词 */ },
  "generateProfileFull": {
    "user": "你是一个用户兴趣分析专家...\n\n# 用户行为数据\n{{behaviorSummary}}\n\n# 任务要求\n1. 综合分析用户的兴趣领域..."
  },
  "generateProfileIncremental": {
    "user": "你是一个用户兴趣分析专家...\n\n# 当前画像\n- **兴趣领域**: {{currentProfileInterests}}\n...\n\n# 最新用户行为数据\n{{behaviorSummary}}\n..."
  }
}
```

**英文版（en.json）结构完全相同**，只是提示词内容翻译为英文。

### 4. BaseAIService 集成

```typescript
export abstract class BaseAIService implements AIProvider {
  protected language: SupportedLanguage = 'zh-CN'
  
  constructor(config: AIProviderConfig) {
    this.config = config
    this.initializeLanguage()
  }
  
  /**
   * 从 chrome.storage 读取语言配置（与 i18n 保持一致）
   */
  private async initializeLanguage(): Promise<void> {
    try {
      const lng = await ChromeStorageBackend.loadLanguage()
      this.language = lng === 'en' ? 'en' : 'zh-CN'
    } catch (error) {
      console.warn('[AI] Failed to load language config, using zh-CN:', error)
      this.language = 'zh-CN'
    }
  }
  
  /**
   * 分析内容
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult> {
    // 1. 预处理内容
    const processedContent = this.preprocessContent(content, options)
    
    // 2. 使用 promptManager 构建提示词
    const prompt = promptManager.getAnalyzeContentPrompt(
      this.language,
      processedContent,
      options?.userProfile,
      options?.useReasoning
    )
    
    // 3. 调用 API
    const response = await this.callChatAPI(prompt, { ... })
    
    // 4. 解析和返回结果
    // ...
  }
  
  /**
   * 生成用户画像
   */
  async generateUserProfile(
    request: UserProfileGenerationRequest
  ): Promise<UserProfileGenerationResult> {
    // 1. 构建行为摘要
    const behaviorSummary = this.buildBehaviorSummary(request)
    
    // 2. 使用 promptManager 构建提示词
    const prompt = request.currentProfile
      ? promptManager.getGenerateProfileIncrementalPrompt(
          this.language,
          behaviorSummary,
          request.currentProfile
        )
      : promptManager.getGenerateProfileFullPrompt(
          this.language,
          behaviorSummary
        )
    
    // 3. 调用 API
    // ...
  }
}
```

## 架构改进亮点

### 1. 完全解耦

- ✅ **提示词独立**：AI 提供商不关心提示词内容
- ✅ **数据驱动**：提示词以 JSON 存储，易于维护和扩展
- ✅ **单一职责**：PromptManager 专注提示词管理，BaseAIService 专注逻辑

### 2. 易于扩展

添加新语言只需：
1. 创建 `templates/ja.json`（日语）
2. 在 types.ts 添加 `'ja'` 到 `SupportedLanguage`
3. 在 PromptManager 预加载新模板

添加新提示词类型只需：
1. 在 PromptTemplates 接口添加字段
2. 在所有语言的 JSON 文件添加对应模板
3. 在 PromptManager 添加便捷方法

### 3. 类型安全

- TypeScript 严格类型检查
- 编译时发现缺失的模板或变量
- IDE 智能提示支持

### 4. 便捷使用

```typescript
// 旧方式（已废弃）
const prompt = this.prompts.analyzeContent(content, userProfile)

// 新方式
const prompt = promptManager.getAnalyzeContentPrompt(
  this.language,
  content,
  userProfile,
  useReasoning
)
```

### 5. 统一语言管理

```typescript
// 统一从 chrome.storage 读取（与 i18n 保持一致）
const lng = await ChromeStorageBackend.loadLanguage()
this.language = lng === 'en' ? 'en' : 'zh-CN'
```

## 测试结果

### 全量测试

```
Test Files  85 passed (85)
     Tests  1378 passed | 1 skipped (1379)
  Duration  15.02s
```

### OPML 国际化测试

新增 5 个测试用例：
- ✅ 中文导出（默认）
- ✅ 英文导出
- ✅ 分类标签国际化
- ✅ "未分类" 标签国际化
- ✅ 导出文件名包含时间戳

### AI 提示词测试

所有 AI 相关测试通过：
- ✅ BaseAIService 初始化语言
- ✅ DeepSeekProvider 调用
- ✅ OpenAIProvider 调用
- ✅ OllamaProvider 调用
- ✅ 内容分析提示词生成
- ✅ 用户画像提示词生成

## 文件清单

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/core/ai/prompts/types.ts` | 50 | 提示词类型定义 |
| `src/core/ai/prompts/index.ts` | 100+ | PromptManager 实现 |
| `src/core/ai/prompts/templates/zh-CN.json` | 350+ | 中文提示词模板 |
| `src/core/ai/prompts/templates/en.json` | 350+ | 英文提示词模板 |

### 修改文件

| 文件 | 修改说明 |
|------|----------|
| `src/core/ai/BaseAIService.ts` | 使用 PromptManager，从 chrome.storage 读取语言 |
| `src/core/rss/OPMLImporter.ts` | 支持语言参数 |
| `src/core/rss/OPMLImporter.test.ts` | 新增国际化测试 |
| `src/components/settings/RSSSettings.tsx` | 传递语言参数 |
| `public/locales/zh-CN/translation.json` | 添加 OPML 翻译键 |
| `public/locales/en/translation.json` | 添加 OPML 翻译键 |

### 删除文件

- ❌ `src/core/ai/prompts-en.ts`（第一版，已废弃）

## 语言支持矩阵

| 功能 | 中文 | 英文 | 说明 |
|------|------|------|------|
| UI 界面 | ✅ | ✅ | i18next 自动切换 |
| OPML 导出 | ✅ | ✅ | 根据当前语言 |
| 内容分析提示词 | ✅ | ✅ | PromptManager 自动选择 |
| 用户画像提示词 | ✅ | ✅ | PromptManager 自动选择 |
| RSS 分类 | 🔄 | 🔄 | 待实现（稍后决定） |

## 使用示例

### 用户切换语言流程

1. **用户在设置页切换语言**：`en` → `zh-CN`
2. **i18n 更新 chrome.storage**：`chrome.storage.sync.set({ i18nextLng: 'zh-CN' })`
3. **下次 AI 初始化时**：
   ```typescript
   const lng = await ChromeStorageBackend.loadLanguage() // 'zh-CN'
   this.language = 'zh-CN'
   ```
4. **调用 AI 时自动使用中文提示词**：
   ```typescript
   const prompt = promptManager.getAnalyzeContentPrompt(
     'zh-CN', // 从 this.language 读取
     content,
     userProfile
   )
   ```

### 添加新语言示例（日语）

```typescript
// 1. 添加类型
export type SupportedLanguage = 'zh-CN' | 'en' | 'ja'

// 2. 创建模板文件
// src/core/ai/prompts/templates/ja.json
{
  "analyzeContent": {
    "withProfile": {
      "user": "あなたはコンテンツ分析アシスタントです..."
    }
  }
}

// 3. 预加载模板
import jaTemplates from './templates/ja.json'

export class PromptManager {
  constructor() {
    this.templates = new Map([
      ['zh-CN', zhCNTemplates],
      ['en', enTemplates],
      ['ja', jaTemplates]  // 新增
    ])
  }
}

// 4. BaseAIService 自动支持
const lng = await ChromeStorageBackend.loadLanguage()
if (lng === 'ja') this.language = 'ja'
```

## 最佳实践

### 1. 提示词模板编写

- ✅ 使用 `{{variable}}` 语法标记变量
- ✅ 提供清晰的上下文和任务说明
- ✅ 指定明确的输出格式（JSON）
- ✅ 包含示例和约束条件

### 2. 变量命名

- ✅ 使用语义化名称：`{{content}}`, `{{interests}}`
- ✅ 保持多语言一致：所有语言使用相同变量名
- ✅ 类型定义约束：在 PromptVariables 中定义

### 3. 测试覆盖

- ✅ 每个提示词类型都有测试
- ✅ 多语言切换测试
- ✅ 变量替换测试
- ✅ 边界情况测试

## 注意事项

### 1. 语言配置读取

⚠️ **不要**从 localStorage 读取语言：
```typescript
// ❌ 错误
const lng = localStorage.getItem('i18nextLng')

// ✅ 正确
const lng = await ChromeStorageBackend.loadLanguage()
```

### 2. 提示词变量

⚠️ **确保**所有语言使用相同的变量名：
```json
// zh-CN.json
"user": "分析内容：\n{{content}}\n用户兴趣：{{interests}}"

// en.json ✅ 相同变量名
"user": "Analyze content:\n{{content}}\nUser interests: {{interests}}"

// en.json ❌ 错误示例
"user": "Analyze content:\n{{text}}\nUser interests: {{hobbies}}"
```

### 3. 新增提示词类型

⚠️ **必须**更新所有语言的模板文件：
- 更新 zh-CN.json
- 更新 en.json
- 更新 types.ts 中的 PromptTemplates 接口
- 在 PromptManager 中添加便捷方法

## 后续计划

### RSS 分类国际化（待定）

当前 RSS 分类策略：
1. 读取 RSS 源自带的分类（category 字段）
2. 如无分类，使用"未分类"

可能的改进：
1. **基于 TF-IDF**：从标题提取关键词自动分类
2. **AI 分类**：使用 AI 分析 RSS 源内容并建议分类
3. **手动标签**：用户手动设置标签（支持多语言）

是否实现取决于用户反馈和优先级。

## 总结

本次重构实现了：

1. ✅ **OPML 导出国际化**：支持中英文导出
2. ✅ **AI 提示词多语言**：中英文提示词自动切换
3. ✅ **架构解耦**：提示词管理独立于 AI 提供商
4. ✅ **统一语言配置**：从 chrome.storage 读取，与 i18n 一致
5. ✅ **类型安全**：完整的 TypeScript 类型系统
6. ✅ **易于扩展**：新增语言或提示词类型只需简单修改
7. ✅ **测试覆盖**：1378 个测试全部通过

**架构价值**：
- 🎯 **关注点分离**：提示词、AI 逻辑、API 调用各司其职
- 🔧 **易于维护**：JSON 数据文件，修改提示词不需要改代码
- 🌍 **国际化友好**：新增语言只需添加 JSON 文件
- 🚀 **性能优化**：预加载模板，运行时直接查找
- 📝 **可读性强**：类型定义清晰，代码结构简洁

此架构为未来支持更多语言（日语、韩语等）和更复杂的提示词管理奠定了坚实基础。
