---
applyTo: "**"
---

# Silent Feed - Chrome Extension Project

## 🧠 AI 系统进化宪法

这不仅仅是一份工程指南，而是 AI 助手不断进化和改进的**根本法则**。

### 核心原则

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
- 本文件只说明**如何思考、如何学习、如何改进**（战略层）
- 具体的技术细节属于技能库（战术层）
- 当发现新的模式或规则，本文件会被更新

### 进化的触发条件

| 触发事件 | 响应 | 输出 |
|---------|------|------|
| 在任务中遇到新的错误类别 | 分析根因，记录模式 | 技能库更新 |
| 用户指出某行为不符合预期 | 反思规则，优化决策 | 指令文件更新 |
| 某个任务反复出现同样问题 | 总结最佳实践 | 新技能创建或旧技能改进 |
| 发现某个工作流程可以优化 | 制定新的工作流程 | 指令或技能库更新 |

---

## 角色与对话风格

- **首选中文交流**: 在对话中可以适度风趣幽默,保持轻松氛围
- **代码注释与文档**: 保持专业、清晰与精确,使用中文注释
- **技术解释**: 使用简明易懂的语言,必要时分步骤说明
- **多方案建议**: 列出优缺点和适用场景
- **示例代码**: 短小、可运行并带必要中文注释

---

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

## 代码风格

- **TypeScript 严格**: 所有导出函数/对象需显式类型；避免 `any`。
- **React 约定**: 仅函数组件 + Hooks；Tailwind 做样式；Zustand 在 `src/stores/**` 管理状态。
- **文件命名**: 组件 PascalCase；函数/变量 camelCase；常量 UPPER_SNAKE_CASE；文件 kebab-case。
- **⚠️ 禁止动态导入**: Service Worker (background.ts) 中禁止使用 `import()` 或 `importScripts()` 动态导入，所有导入必须在文件顶部静态声明。动态导入仅允许在测试代码中使用。

## 测试规范（Vitest）

- **环境**: `jsdom`，统一 `src/test/setup.ts` 注入 `chrome` Mock、`fake-indexeddb`，并 Mock `react-i18next`。
- **覆盖率阈值**: 行/函数 ≥ 70%，分支 ≥ 60%（详见 `vitest.config.ts`）。
- **命名**: 新增文件需同时提供 `*.test.ts(x)`；组件测试使用 Testing Library；核心模块写集成测试。
- **Mock 数据**: 参考 `_typescript-type-safety` 技能（`.copilot/skills/_typescript-type-safety/SKILL.md`）创建类型安全的 mock 对象。

## 常见坑位

- **Background 生命周期**: 异步消息需 `sendResponse` + 返回 `true` 或使用自执行 async 包裹，避免响应丢失。
- **DNR 生效**: 修改 DNR/manifest 后需重建并重新加载扩展；注意清理遗留动态规则（见 `background.ts`）。
- **i18n 遗漏**: UI 文本未包裹 `_()` 会在审查时被要求修复；测试中已用英文翻译文件做断言。

---

## 版本控制

### 基本原则

- 在 master 不直接开发；等待用户确认再提交/推送；推送前必须通过 `npm run pre-push`。
- PR 和 commit 都使用中文描述。

### 提交与 PR 说明文件

创建 PR 或提交时，**必须使用说明文件方式**，禁止在命令行使用长篇幅说明（避免命令行问题）：

1. **Git 提交**：参考 `_git-commit` 技能（`.copilot/skills/_git-commit/SKILL.md`）
2. **GitHub PR**：使用官方 `pr-creator` 技能或脚本

---

## 自定义技能库

项目已建立自定义技能库来支持 AI 系统的持续进化。

### 项目自定义技能

| 技能名 | 描述 | 参考 |
|-------|------|------|
| `_evolution-core` | 进化能力元技能：识别可进化场景并沉淀为技能/指令 | `.copilot/skills/_evolution-core/SKILL.md` |
| `_typescript-type-safety` | TypeScript Mock 数据创建与类型错误预防 | `.copilot/skills/_typescript-type-safety/SKILL.md` |
| `_git-commit` | Git 提交最佳实践与规范化流程 | `.copilot/skills/_git-commit/SKILL.md` |

### 如何使用技能

当遇到相关问题时：
1. 主动查找对应的技能文件（见上表）
2. 按照技能中的流程和最佳实践进行操作
3. 如果技能不完整，记录改进建议

### 技能与指令的职责分离

```
本文件（copilot-instructions.md）
└── 战略层：原则、架构、宪法

技能文件（.copilot/skills/*.md）
└── 战术层：具体流程、最佳实践、检查清单
```

**原则**：
- 指令文件保持简洁，聚焦"为什么"和"是什么"
- 技能文件保持专业，聚焦"怎么做"和"做得对"
- 避免信息冗余，充分发挥每个文档的作用
