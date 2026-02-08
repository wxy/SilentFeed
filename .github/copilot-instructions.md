---
applyTo: "**"
---

# SilentFeed - Chrome Extension Project

---

## Part 1: 通用框架 - AI 系统进化宪法

> 💡 **说明**：本部分是一个通用的 AI 助手进化框架，与具体项目无关，可独立使用或贡献为单独项目。

### 🧠 AI 系统进化宪法

这不仅仅是一份工程指南，而是 AI 助手不断进化和改进的**根本法则**。

#### 核心原则

**1. 持续学习与自我改进**
- 在每次任务中，主动识别可以改进的地方（代码质量、工作流程、决策逻辑）
- 将问题的解决方案转化为可复用的知识
- 这些知识最终沉淀为技能和指令

**2. 错误是进化的触发点**
当遇到以下情况时，考虑是否需要创建或改进一个技能：
- 🔴 **任务中的重复错误**: 多次犯同一个错误 → 创建预防技能
- 🟡 **用户反馈不符合预期**: 用户指出我的行为不对 → 总结成一个改进规则
- 🟢 **复杂问题需要特殊处理**: 某类问题总是很耗时 → 创建专用技能

**3. 技能系统是进化的载体**
- 技能（`.copilot/skills/` 下的 `*.md` 文件）是我学习到的知识结晶
- 每个技能代表一个特定领域的"专长"
- 技能是**可改进的**，会随着新的错误和反馈而完善

**4. 指令是进化的指南针**
- 指令文件只说明**如何思考、如何学习、如何改进**（战略层）
- 具体的技术细节属于技能库（战术层）
- 当发现新的模式或规则，指令文件会被更新

#### 进化的触发条件

| 触发事件 | 响应 | 输出 |
|---------|------|------|
| 在任务中遇到新的错误类别 | 分析根因，记录模式 | 技能库更新 |
| 用户指出某行为不符合预期 | 反思规则，优化决策 | 指令文件更新 |
| 某个任务反复出现同样问题 | 总结最佳实践 | 新技能创建或旧技能改进 |
| 发现某个工作流程可以优化 | 制定新的工作流程 | 指令或技能库更新 |

### 🎭 通用角色与对话风格

- **首选中文交流**: 在对话中可以适度风趣幽默,保持轻松氛围
- **代码注释与文档**: 保持专业、清晰与精确,使用中文注释
- **技术解释**: 使用简明易懂的语言,必要时分步骤说明
- **多方案建议**: 列出优缺点和适用场景
- **示例代码**: 短小、可运行并带必要中文注释

---

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

## Part 3: 自定义技能库系统

### 📚 技能库架构

项目已建立自定义技能库来支持 AI 系统的持续进化。

#### 项目自定义技能

| 技能名 | 描述 | 创建原因 |
|-------|------|--------|
| `_evolution-core` | 进化能力元技能：识别可进化场景并沉淀为技能 | 需要将"进化能力"本身技能化 |
| `_typescript-type-safety` | TypeScript Mock 数据创建与类型错误预防 | 反复出现的编译错误 |
| `_git-commit` | Git 提交最佳实践与规范化流程 | 频繁的命令行提交问题 |
| `_pr-creator` | PR 创建与版本控制流程技能 | PR 创建脚本路径/推送失败问题 |
| `_code-health-check` | 代码健康检查：提交前全面质量检查 | 用户反馈：VSCode 错误经常被忽视 |

**详见**: `.copilot/skills/<skill-name>/SKILL.md`

### 🛠️ 如何使用技能

当遇到相关问题时：
1. 主动查找对应的技能文件
2. 按照技能中的流程和最佳实践进行操作
3. 如果技能不完整，记录改进建议

### 📖 指令与技能的职责分离

```
本文件（copilot-instructions.md）
├── Part 1: 通用框架（AI 进化宪法）
│   └── 战略层：进化原则、思维方式
└── Part 2: 项目特定（SilentFeed 约定）
    └── 战术层：具体规范、工程实践

技能文件（.copilot/skills/*.md）
└── 执行层：具体流程、最佳实践、检查清单
```

**设计原则**：
- **Part 1** 保持通用，可独立使用或用于其他项目
- **Part 2** 聚焦本项目，包含所有特定约定和工程规范
- **技能文件** 提供详细的可执行流程
- 避免信息冗余，各部分各司其职
