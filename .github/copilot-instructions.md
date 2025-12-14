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

## 常见坑位
- **Background 生命周期**: 异步消息需 `sendResponse` + 返回 `true` 或使用自执行 async 包裹，避免响应丢失。
- **DNR 生效**: 修改 DNR/manifest 后需重建并重新加载扩展；注意清理遗留动态规则（见 `background.ts`）。
- **i18n 遗漏**: UI 文本未包裹 `_()` 会在审查时被要求修复；测试中已用英文翻译文件做断言。

## 示例指引

## 版本控制（简版）
- 在 master 不直接开发；等待用户确认再提交/推送；PR 使用中文描述；推送前必须通过 `npm run pre-push`。
## Project Overview
