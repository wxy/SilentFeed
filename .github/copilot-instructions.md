```instructions
---
applyTo: "**"
---

# Silent Feed - Chrome Extension Project

## 角色与对话风格

- **首选中文交流**: 在对话中可以适度风趣幽默,保持轻松氛围
- **代码注释与文档**: 保持专业、清晰与精确,使用中文注释
- **技术解释**: 使用简明易懂的语言,必要时分步骤说明
- **多方案建议**: 列出优缺点和适用场景
- **示例代码**: 短小、可运行并带必要中文注释

## 输出内容控制

**⚠️ 重要**: 控制单次输出内容大小,避免生成失败

- **文档生成**: 单个文件不超过 500 行（超过时分段生成 Part 1, Part 2...）
- **代码文件**: 单个文件不超过 300 行（大文件拆分为多个模块）
- **代码块示例**: 不超过 50 行（聚焦核心逻辑，使用 `// ...` 省略非关键代码）
- **文件创建**: 优先使用 `create_file` 工具一次性创建完整内容

### 大文件创建策略

**⚠️ 重要**: 处理大型文件创建和修改的最佳实践

#### 方法1: 累加式创建（推荐）

适用于需要创建大型文件（>300行）的场景:

1. **先创建基础结构**: 使用 `create_file` 创建文件骨架
```typescript
// 示例：创建基础接口和导入
export interface BaseInterface {
  // 基础结构
}
```

2. **逐步添加内容**: 使用 `replace_string_in_file` 逐步添加功能模块
```typescript
// 第一次添加：接口定义
// 第二次添加：类实现
// 第三次添加：工具函数
// 第四次添加：导出语句
```

3. **验证每次添加**: 确保每次添加后文件语法正确

**累加式创建的优势**:
- 避免单次输出过大导致失败
- 便于分步骤验证和调试
 
# Silent Feed — AI Agent Guide

## 大图景与架构
- **MV3 结构**: Content Script ↔ Popup ↔ Background(Service Worker)。业务在 `src/core/**`，持久化在 `src/storage/**`，UI 在 `src/components/**`。
- **数据流**: `src/contents/rss-detector.ts` 发现源 → 向 Background 发送消息（如 `RSS_DETECTED`）→ `FeedManager` 入库（Dexie）→ 定时抓取与推荐 → Popup 展示与徽章更新。
- **AI 集成**: `src/core/ai/AICapabilityManager.ts` 统筹 Provider；`AIUsageTracker` 统计 tokens/费用；本地 Ollama 通过 DNR 规避 CORS（`public/dnr-rules.json` + `scripts/pre-build-dnr.sh`）。

## 关键工作流
- **开发**: `npm run dev`（预生成 DNR → Plasmo 开发）。
- **构建**: `npm run build`（预生成 DNR → Plasmo 构建 → 拷贝多语言）。
- **测试**: `npm run test` 监听；`npm run test:run` 单次；`npm run test:coverage` 覆盖率。
- **推送前检查**: `npm run pre-push`（运行测试、覆盖率、构建）。

## 项目特有约定
- **路径别名**: 使用 `@/` 指向 `src`，`~` 指向仓库根（见 `tsconfig.json` 与 `vitest.config.ts`）。
- **国际化**: 所有用户可见文本必须用 `translate as _` 包裹（`src/i18n/helpers.ts`）；开发日志保持中文不需 i18n。
- **消息通信**: 统一通过 `chrome.runtime.sendMessage/onMessage`，消息类型集中由 Background 处理（例如 `SAVE_PAGE_VISIT`、`RSS_DETECTED`、`ONBOARDING_STATE_CHANGED`）。
- **画像学习门控**: 上线引导阶段（setup）跳过采集，状态变更需调用调度器重配置（`background.ts` → `reconfigureSchedulersForState`）。
- **图标/徽章**: 使用 `utils/IconManager.ts` 按优先级更新，含 AI 配置状态、未读推荐、RSS 发现提示。

## 存储与数据
- **Dexie**: 数据库入口 `src/storage/db/**`，事务/聚合在 `src/storage/transactions.ts`、统计在 `db-stats.ts`。
- **模型类型**: 统一放在 `src/types/**`；`ConfirmedVisit`、`Recommendation`、`DiscoveredFeed` 等贯穿全流程。

## AI 与 DNR 要点
- **Provider 策略**: 在 `src/core/ai/providers/**` 管理多家厂商；成本计算与预算在 `CostCalculator.ts`、`BudgetChecker.ts`。
- **Ollama CORS**: 依赖 DeclarativeNetRequest 移除 `Origin/Referer`，请确保 `public/dnr-rules.json` 与 manifest 静态资源一致；开发脚本会预处理并清理动态规则。

## 测试规范（Vitest）
- **环境**: `jsdom`，统一 `src/test/setup.ts` 注入 `chrome` Mock、`fake-indexeddb`，并 Mock `react-i18next`。
- **覆盖率阈值**: 行/函数 ≥ 70%，分支 ≥ 60%（详见 `vitest.config.ts`）。
- **命名**: 新增文件需同时提供 `*.test.ts(x)`；组件测试使用 Testing Library；核心模块写集成测试。

## 代码风格
- **TypeScript 严格**: 所有导出函数/对象需显式类型；避免 `any`。
- **React 约定**: 仅函数组件 + Hooks；Tailwind 做样式；Zustand 在 `src/stores/**` 管理状态。
- **文件命名**: 组件 PascalCase；函数/变量 camelCase；常量 UPPER_SNAKE_CASE；文件 kebab-case。
- **⚠️ 禁止动态导入**: Service Worker (background.ts) 中禁止使用 `import()` 或 `importScripts()` 动态导入，所有导入必须在文件顶部静态声明。动态导入仅允许在测试代码中使用。

## 常见坑位
- **Background 生命周期**: 异步消息需 `sendResponse` + 返回 `true` 或使用自执行 async 包裹，避免响应丢失。
- **DNR 生效**: 修改 DNR/manifest 后需重建并重新加载扩展；注意清理遗留动态规则（见 `background.ts`）。
- **i18n 遗漏**: UI 文本未包裹 `_()` 会在审查时被要求修复；测试中已用英文翻译文件做断言。

## TypeScript 类型安全与 Mock 数据创建

**⚠️ 关键原则**: 在创建测试 mock 数据时，必须严格遵循以下规范，避免常见的类型错误。参考技能: `.claude/skills/typescript-type-safety/SKILL.md`

### Mock 数据创建的标准流程（5步）

```
1️⃣ read_file 查看完整的类型定义（不要假设）
2️⃣ 识别所有必需字段（无 ? 和 undefined 的字段）
3️⃣ 对于 enum 字段，验证有效值范围
4️⃣ 为复杂类型创建工厂函数，不要内联初始化
5️⃣ 运行 get_errors 验证，预期结果：0 个错误
```

### 常见 TypeScript Mock 错误与预防

| 错误 | 表现 | 预防 |
|------|------|-----|
| **空对象假设** | `topics: {}` | 初始化所有必需字段，使用工厂函数 |
| **Enum 值无效** | `status: 'pending'` | 查看 enum 定义，只用有效值 |
| **字段缺失** | `缺少属性: read, starred` | 从类型定义复制完整的字段列表 |
| **字符串代替 Enum** | `topics: { tech: 0.5 }` | 使用 `Topic.TECHNOLOGY` enum 键 |
| **类型断言滥用** | `{} as Type` | 信任 TypeScript 编译器，显式初始化 |

### 工厂函数编写规范

```typescript
/**
 * 创建用于测试的 mock FeedArticle
 * @param overrides - 要覆盖的字段（类型检查）
 * @returns 完整的 FeedArticle 对象，所有必需字段已初始化
 */
function createMockArticle(overrides: Partial<FeedArticle> = {}): FeedArticle {
  return {
    id: `article-${Math.random()}`,
    feedId: 'feed-1',
    title: 'Test Article',
    link: 'https://example.com',
    published: Date.now(),
    fetched: Date.now(),
    read: false,      // ✅ 必需的布尔字段
    starred: false,   // ✅ 必需的布尔字段
    ...overrides      // ✅ 类型安全的覆盖
  }
}
```

**工厂函数最佳实践：**
- ✅ 提供所有必需字段的合理默认值
- ✅ 参数使用 `Partial<Type>` 而不是 `any`
- ✅ 添加 JSDoc 文档
- ✅ 复杂嵌套类型使用级联工厂函数


## 示例指引

## 版本控制（简版）
- 在 master 不直接开发；等待用户确认再提交/推送；PR 使用中文描述；推送前必须通过 `npm run pre-push`。
- 说明文件约定：创建 PR 或创建提交时，必须在 `.github` 目录下生成临时说明文件作为描述来源，禁止在命令中使用 HERE 文档；流程结束后可清理该临时文件。

## OpenSkills 技能系统

项目已集成 OpenSkills，提供领域特定的 AI 辅助能力。技能文件位于 `.claude/skills/` 目录。

### 可用技能清单

- **设计类**: `canvas-design`, `frontend-design`, `algorithmic-art`, `slack-gif-creator`, `theme-factory`
- **文档类**: `docx`, `pptx`, `pdf`, `xlsx`, `doc-coauthoring`, `internal-comms`
- **开发类**: `mcp-builder`, `web-artifacts-builder`, `webapp-testing`, `skill-creator`
- **品牌类**: `brand-guidelines`

### 使用方式

AI Agent 会根据任务自动加载对应技能。你也可以明确要求使用特定技能，例如：
- "使用 frontend-design 技能创建一个落地页"
- "用 docx 技能生成项目文档"
- "按 brand-guidelines 技能应用品牌样式"

### 技能管理

```bash
# 同步最新技能（推荐定期执行）
openskills sync

# 查看可用技能
ls .claude/skills/
```

**注意**: `.claude/skills/` 目录已纳入版本控制，团队成员 clone 后即可使用。

## Project Overview
