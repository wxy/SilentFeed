---
applyTo: "**"
---

# SilentFeed - Chrome Extension Project

---

## Part 1: 强制执行

**⚠️ 在开始任何工作前，必须读取并完全理解执行**：
[../.evolution-skills/constitution/ai-evolution-constitution.md](../.evolution-skills/constitution/ai-evolution-constitution.md)

## Part 2: 项目特定 - SilentFeed 工程规范

### 🏗️ 项目大图景与架构

#### MV3 Chrome Extension 结构
- **Content Script** ↔ **Popup** ↔ **Background(Service Worker)**
- 业务逻辑在 `src/core/**`，持久化在 `src/storage/**`，UI 在 `src/components/**`

#### 核心数据流
```
RSS 源发现 → Background 消息处理 → Dexie 数据库 → 定时抓取 → AI 推荐 → Popup 展示
  (rss-detector)  (chrome API)    (FeedManager)   (scheduler)  (service)  (UI)
```

#### AI 集成架构
- **AICapabilityManager**: 统筹多个 AI Provider
- **AIUsageTracker**: 成本统计与预算管理
- **Ollama 本地集成**: 通过 DNR 规则规避 CORS 限制

### 📋 项目特有约定

#### 代码结构约定
- **路径别名**: 使用 `@/` 指向 `src`，`~` 指向仓库根（见 `tsconfig.json`）
- **国际化**: 用户可见文本必须用 `translate as _` 包裹（`src/i18n/helpers.ts`）；开发日志保持中文无需 i18n
- **消息通信**: 统一使用 `chrome.runtime.sendMessage/onMessage`，所有消息类型由 Background 集中处理
  - 例如：`SAVE_PAGE_VISIT`、`RSS_DETECTED`、`ONBOARDING_STATE_CHANGED`

#### 特定功能约定
- **画像学习门控**: Onboarding 阶段（setup）跳过数据采集，状态变更需调用 `reconfigureSchedulersForState()`
- **图标/徽章**: 使用 `utils/IconManager.ts` 按优先级更新，含 AI 配置状态、未读推荐、RSS 发现提示

#### 存储与数据约定
- **数据库**: Dexie 数据库入口在 `src/storage/db/**`，事务逻辑在 `src/storage/transactions.ts`
- **类型系统**: 统一在 `src/types/**` 定义，重要类型：`ConfirmedVisit`、`Recommendation`、`DiscoveredFeed`

#### AI 与 DNR 约定
- **多厂商管理**: Provider 策略在 `src/core/ai/providers/**`
- **成本计算**: `CostCalculator.ts`、`BudgetChecker.ts` 管理预算
- **Ollama CORS**: 依赖 DeclarativeNetRequest 移除 `Origin/Referer`，须确保 `public/dnr-rules.json` 与 manifest 一致

### 🎨 代码风格

#### TypeScript 约定
- **严格模式**: 所有导出函数/对象需显式类型，避免使用 `any`
- **⚠️ 禁止动态导入**: Service Worker (background.ts) 中禁止 `import()` 或 `importScripts()`，所有导入必须在顶部静态声明
- 动态导入仅允许在测试代码中使用
- **⚠️ 禁止 HERE 文档**: 创建文件时禁止使用 `cat > file << 'EOF'` 等 HERE 文档方式，必须使用 `create_file` 工具

#### React 约定
- **仅函数组件**: 禁止 Class Component，使用 Hooks 进行状态管理
- **样式**: Tailwind CSS 进行样式，Zustand 在 `src/stores/**` 管理全局状态
- **Testing Library**: 组件测试使用 Testing Library，核心模块写集成测试

#### 文件命名约定
- 组件: `PascalCase` (如 `RecommendationCard.tsx`)
- 函数/变量: `camelCase` (如 `fetchRecommendations`)
- 常量: `UPPER_SNAKE_CASE` (如 `MAX_FEED_COUNT`)
- 文件: `kebab-case` (如 `recommendation-service.ts`)

### 🧪 测试规范（Vitest）

#### 环境配置
- **Test Runner**: Vitest，环境为 `jsdom`
- **Mocks**: `src/test/setup.ts` 中注入：
  - `chrome` 全局 Mock（Chrome API 模拟）
  - `fake-indexeddb` （Dexie 数据库模拟）
  - `react-i18next` Mock

#### 覆盖率标准
- 行覆盖率: ≥ 70%
- 函数覆盖率: ≥ 70%
- 分支覆盖率: ≥ 60%

#### 测试文件约定
- 新增代码必须同时提供 `*.test.ts(x)` 文件
- 组件测试使用 Testing Library 进行 DOM 操作
- 核心模块（service、store、utils）写集成测试
- Mock 数据参考 `_typescript-type-safety` 技能创建

### 🚀 项目工作流

#### 开发与构建命令
- **开发**: `npm run dev` - 预生成 DNR → Plasmo 开发服务
- **构建**: `npm run build` - 预生成 DNR → Plasmo 构建 → 拷贝多语言资源
- **测试**: 
  - `npm run test` - 监听模式
  - `npm run test:run` - 单次运行
  - `npm run test:coverage` - 覆盖率报告
- **推送前检查**: `npm run pre-push` - 运行完整测试、覆盖率、构建验证

#### 版本控制流程

**基本原则**：
- 在 master 不直接开发；等待用户确认再提交/推送
- 推送前必须通过 `npm run pre-push`
- PR 和 commit 都使用中文描述

**提交与 PR 说明**：
创建 PR 或提交时，**必须使用说明文件方式**，禁止在命令行使用长篇幅说明：

1. **Git 提交**: 参考 `_git-commit` 技能（`.copilot/skills/_git-commit/SKILL.md`）
  - 在 `.github/COMMIT_DESCRIPTION.local.md` 中编写说明（本地文件，不入库）
   - 使用 Conventional Commits 规范
  - 执行 `git commit -F .github/COMMIT_DESCRIPTION.local.md`

2. **GitHub PR**: 使用官方 `pr-creator` 技能
  - 在 `.github/PR_DESCRIPTION.local.md` 中编写说明（本地文件，不入库）

### ⚠️ 常见坑位

- **Background 生命周期**: 异步消息需 `sendResponse` + 返回 `true` 或使用自执行 async 包裹，否则响应丢失
- **DNR 规则生效**: 修改 DNR/manifest 后需重建并重新加载扩展；注意清理遗留动态规则
- **i18n 遗漏**: UI 文本未包裹 `_()` 会在审查时被要求修复；测试中使用英文翻译文件做断言

---
