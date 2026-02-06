```instructions
---
applyTo: "**"
---

# Silent Feed - Chrome Extension Project

## 🧠 AI 系统进化宪法

这不仅仅是一份工程指南，而是 AI 助手不断进化和改进的**根本法则**。

### 进化的核心原则

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
- 技能（`.claude/skills/` 下的 `*.md` 文件）是我学习到的知识结晶
- 每个技能代表一个特定领域的"专长"
- 技能是**可改进的**，会随着新的错误和反馈而完善

**4. 指令是进化的指南针**
- 本文件不详述具体技术，而是说明**如何思考、如何学习、如何改进**
- 具体的技术细节属于技能库
- 当发现新的模式或规则，本文件会被更新

### 进化的触发条件

| 触发事件 | 响应 | 输出 |
|---------|------|------|
| 在任务中遇到新的错误类别 | 分析根因，记录模式 | 技能库更新 |
| 用户指出某行为不符合预期 | 反思规则，优化决策 | 指令文件更新 |
| 某个任务反复出现同样问题 | 总结最佳实践 | 新技能创建或旧技能改进 |
| 发现某个工作流程可以优化 | 制定新的工作流程 | 指令或技能库更新 |

### 进化的执行步骤

```
识别问题 → 深度分析 → 提取原理 → 编码为规则 → 集成到系统
   (工作中)  (根本原因)  (可复用性)  (技能/指令)  (下次应用)
```

---

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

## 🔍 进化机会识别指南

这个章节说明如何在日常工作中发现和创建新技能。

### 识别模式 A: 重复错误

当在同一个会话或连续的会话中遇到相同或相似的错误时：
```
会话 1: 错误 A 出现 → 修复
会话 2: 错误 A 再次出现（或变体） → 🚩 技能创建机会

行动：
1. 分析为什么会重复出现
2. 提取通用的预防措施
3. 创建技能文件
4. 更新 Copilot 指令中的快速检查清单
```

**例子（本项目）**:
- TypeScript Mock 错误多次出现 → 创建 `_typescript-type-safety` 技能

### 识别模式 B: 用户反馈

当用户指出某个行为不符合预期时：
```
用户反馈: "你应该先查看类型定义，而不是直接写 mock"
       ↓
理解: 发现了我的工作流程中的缺陷
       ↓
改进: 将用户的建议编码为技能和指令
       ↓
验证: 在后续工作中应用改进
```

**行动清单**:
- [ ] 理解用户的具体指点
- [ ] 分析为什么我的做法不够好
- [ ] 思考是否这个问题有通用性
- [ ] 如果通用，创建或改进技能
- [ ] 更新 Copilot 指令
- [ ] 在下次遇到时验证改进是否有效

### 识别模式 C: 复杂工作流

当发现某个类型的任务总是费时或容易出错时：
```
观察: 每次处理 React 组件时都会踩某些坑
      ↓
分析: 这些坑有共同的根本原因吗？
      ↓
如果是: 创建 React 组件相关的技能
如果否: 记录为常见坑位
```

**示例工作流程**:
- 处理 Chrome Extension 消息传递问题 → `chrome-extension-patterns` 技能
- 处理 Dexie 数据库事务 → `database-operations` 技能
- 处理 Tailwind CSS 样式冲突 → `css-styling-patterns` 技能

### 🚀 技能创建决策树

```
遇到问题
  │
  ├─ 这个问题会重复出现吗？
  │  ├─ 否 → 记录为常见坑位
  │  └─ 是 → 继续
  │
  ├─ 问题的解决有通用的模式吗？
  │  ├─ 否 → 记录为项目特定的细节
  │  └─ 是 → 继续
  │
  ├─ 这个模式是否复杂到需要详细说明？
  │  ├─ 否 → 添加到 Copilot 指令的快速检查清单
  │  └─ 是 → 继续
  │
  └─ 创建新技能！
     ├─ 取一个清晰的名字
     ├─ 编写完整的 SKILL.md
     ├─ 添加到本指令文件的技能表格
     └─ 在相关工作中验证
```

### 📊 技能创建与改进的记录

每次创建或改进技能时，在 Commit Message 中说明：
```
feat(skills): 创建 react-component-patterns 技能

原因: React 组件中频繁出现 hooks 依赖和 re-render 问题
包含: 
- 5 个常见 React 错误模式
- 3 个最佳实践指南
- 实践场景和优化建议

技能位置: .claude/skills/react-component-patterns/SKILL.md
```

或改进现有技能：
```
docs(skills): 改进 _typescript-type-safety 技能

改进内容:
- 添加 interface vs type 的区别
- 扩展 Partial<Type> 误用的说明
- 添加新的错误模式：模板字符串类型

参考: #issue-123, 用户反馈
```

---

## 常见坑位

## TypeScript 类型安全与 Mock 数据创建

**⚠️ 关键原则**: 在创建测试 mock 数据时，必须严格遵循以下规范，避免常见的类型错误。参考技能: `.copilot/skills/_typescript-type-safety/SKILL.md`

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

## OpenSkills 技能系统与自定义技能库

项目已集成 OpenSkills，并建立了自定义技能库来支持 AI 系统的持续进化。

### 📚 技能库架构

技能文件位于两个地方：
- **官方技能** (`.claude/skills/` 中的外部库): `canvas-design`, `frontend-design`, `pptx` 等
- **自定义技能** (`.claude/skills/` 中的项目特有): 由项目学习过程积累而来
- **命名约定**: 自定义技能统一使用 `_` 前缀，用于与官方技能区分

### 🎯 项目自定义技能库（持续增长）

| 技能名 | 描述 | 状态 | 创建原因 |
|-------|------|------|--------|
| `_evolution-core` | 进化能力元技能：识别可进化场景并沉淀为技能/指令 | ✅ v1.0 | 需要将“进化能力”本身技能化 |
| `_typescript-type-safety` | TypeScript Mock 数据创建与类型错误预防 | ✅ v1.0 | 反复出现的 TypeScript 编译错误 || `_git-commit` | Git 提交最佳实践与规范化流程 | ✅ v1.0 | 频繁尝试在命令行写长篇提交说明导致问题 || `react-component-patterns` | React 组件最佳实践与常见陷阱 | 📋 计划中 | 组件相关错误出现时 |
| `database-operations` | Dexie 数据库操作与事务模式 | 📋 计划中 | 数据库相关问题出现时 |
| `chrome-extension-patterns` | Chrome 扩展特定模式和常见问题 | 📋 计划中 | Background/Content Script 错误 |

### 🔄 技能创建与改进流程

**如何发现需要新技能**:
```
任务进行中
  ├─ 遇到某类问题多次
  ├─ 用户指出某行为不符合预期
  └─ 需要的解决方案具有通用性
     ↓
  创建新技能 (或改进现有技能)
     ↓
  将技能放入 .claude/skills/[skill-name]/SKILL.md
     ↓
  在本指令文件中列出并链接
     ↓
  后续工作中自动应用
```

**改进现有技能的触发条件**:
- 遇到技能中未覆盖的新错误模式 → 添加到技能
- 用户提出更好的解决方案 → 更新技能
- 发现技能中的预防措施无效 → 重写相关部分
- 技能的应用过程发现可优化之处 → 改进流程

### 📖 技能文件规范

每个自定义技能应该包含：

```markdown
# [技能名称]

## 📌 技能描述
- 用途说明
- 适用场景
- 学习来源（哪个会话或任务中发现）

## 🔍 问题识别
- 常见症状
- 根本原因分析
- 为什么这是一个通用问题

## 📋 解决方案
- 完整的 5 步（或 N 步）流程
- 常见错误模式与修复
- 最佳实践与约定

## 💡 实践指南
- 场景 A：...
- 场景 B：...
- 边界情况：...

## ✅ 检查清单
- 修复前检查
- 修复后验证

## 🔄 改进建议
- 已知的限制
- 未来可能的改进方向
```

### 🛠️ 如何使用与改进技能

**使用技能**:
1. 在工作中，当遇到相关问题时，主动查找对应技能
2. 按照技能中的流程和最佳实践进行操作
3. 如果技能不完整或有改进空间，记录下来

**改进技能**:
1. 当发现技能中缺失的内容时，添加到技能文件
2. 更新技能文件中的"改进建议"部分
3. 在提交中说明做了什么改进和为什么

**创建新技能**:
1. 识别一类通用问题（多次出现或高度复杂）
2. 使用 `.claude/skills/skill-creator/SKILL.md` 中的模板
3. 创建新的技能文件夹和 SKILL.md
4. 在本指令文件中添加到技能表格
5. 在相关工作中应用并验证

---

## 示例指引

## 版本控制（简版）
- 在 master 不直接开发；等待用户确认再提交/推送；PR 使用中文描述；推送前必须通过 `npm run pre-push`。
- 说明文件约定：创建 PR 或创建提交时，必须在 `.github` 目录下生成临时说明文件作为描述来源，禁止在命令中使用 HERE 文档；流程结束后可清理该临时文件。

## Project Overview
