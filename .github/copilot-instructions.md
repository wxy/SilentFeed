```instructions
---
applyTo: "**"
---

# FeedAIMuter - Chrome Extension Project

## 角色与对话风格

- **首选中文交流**: 在对话中可以适度风趣幽默,保持轻松氛围
- **代码注释与文档**: 保持专业、清晰与精确,使用中文注释
- **技术解释**: 使用简明易懂的语言,必要时分步骤说明
- **多方案建议**: 列出优缺点和适用场景
- **示例代码**: 短小、可运行并带必要中文注释

## Project Overview

FeedAIMuter is an AI-powered RSS reader browser extension that intelligently recommends content based on user browsing behavior, muting the information noise.

**Name Origin**: Feed + AI + Muter
- **Feed**: RSS 订阅源
- **AI**: 人工智能推荐
- **Muter**: 静音器,过滤噪音

## Technology Stack

- **Framework**: Plasmo (Chrome Extension MV3)
- **Language**: TypeScript (strict mode)
- **UI**: React 18 + Tailwind CSS 3.x
- **State Management**: Zustand
- **Storage**: Dexie.js (IndexedDB)
- **Testing**: Vitest + Testing Library
- **AI Integration**: User-provided APIs (OpenAI, Anthropic, DeepSeek)

## Core Features (MVP)

- 浏览历史收集（隐私保护）
- 用户兴趣画像构建（本地处理）
- RSS 自动发现和订阅
- AI 智能推荐（用户 API / Chrome AI）
- 静默通知（克制的提醒机制）
- 1000 页面冷启动倒计数

## Development Guidelines

### Code Quality

- **TypeScript**: 严格模式,所有函数需要类型标注
- **React**: 使用函数式组件和 Hooks,避免 class 组件
- **命名规范**: 
  - 组件: PascalCase (`ProfileBuilder`)
  - 函数/变量: camelCase (`getUserProfile`)
  - 常量: UPPER_SNAKE_CASE (`MAX_VISITS`)
  - 文件: kebab-case (`profile-builder.ts`)
- **注释**: 
  - 公共 API 必须有 JSDoc
  - 复杂逻辑需要中文解释
  - 避免显而易见的注释

### Testing Requirements

**⚠️ 重要**: 每个功能都必须编写测试,保持测试覆盖率

- **覆盖率要求**:
  - 行覆盖率 ≥ 70%
  - 函数覆盖率 ≥ 70%
  - 分支覆盖率 ≥ 60%
- **测试类型**:
  - 纯函数 → 单元测试
  - 类/模块 → 集成测试
  - React 组件 → 组件测试
  - API 交互 → Mock 测试
- **测试文件命名**: `*.test.ts` 或 `*.test.tsx`
- **运行测试**: 开发时使用 `npm test` 监听模式
- **提交前**: 运行 `npm run test:coverage` 检查覆盖率

详见 [测试指南](../docs/TESTING.md)

### Code Organization

```
src/
├── core/           # 核心业务逻辑 (纯 TypeScript)
│   ├── profile/    # 用户画像
│   ├── recommender/# 推荐引擎
│   ├── ai/         # AI 适配器
│   └── rss/        # RSS 管理
├── storage/        # 数据持久化 (Dexie)
├── components/     # React 组件
├── utils/          # 工具函数
└── test/           # 测试配置和辅助
```

### Privacy & Security

- **隐私优先**: 所有用户数据本地处理
- **三层数据模型**:
  1. 原始数据 (仅本地)
  2. 特征数据 (可选同步)
  3. 概率云 (匿名聚合)
- **敏感信息**: 
  - 切勿在代码中硬编码 API key
  - 使用 `chrome.storage` 安全存储
  - 日志中不记录用户数据

### UI/UX Principles

- **克制设计**: 最小化干扰,信息密度低
- **主题适配**: 自动支持 light/dark 模式
- **性能优先**: 
  - 虚拟滚动处理长列表
  - 懒加载图片和内容
  - 节流/防抖用户交互
- **无障碍**: 支持键盘导航,语义化 HTML

## Version Control Workflow

### Branching Strategy

- **主分支**: `master` (受保护,仅通过 PR 合并)
- **开发分支**: 
  - `feature/功能名` - 新功能
  - `fix/问题描述` - Bug 修复
  - `test/测试范围` - 测试改进
  - `docs/文档主题` - 文档更新
  - `chore/任务说明` - 构建/配置变更

### Commit Messages (中文)

遵循约定式提交 (Conventional Commits):

```
<类型>: <简短描述>

[可选的详细描述]

[可选的 footer]
```

**类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `test`: 添加/修改测试
- `docs`: 文档变更
- `style`: 代码格式 (不影响功能)
- `refactor`: 重构 (不改变功能)
- `perf`: 性能优化
- `chore`: 构建/工具变更

**示例**:
```
feat: 实现浏览历史收集功能

- 添加 content script 监听页面访问
- 过滤有效页面 (停留时间 > 30s)
- 存储到 IndexedDB

关联 issue #12
```

### Git Workflow

1. **开发前**: 从 `master` 创建功能分支
   ```bash
   git checkout -b feature/browsing-history
   ```

2. **开发中**: 
   - 频繁提交,保持提交原子化
   - 运行测试确保通过: `npm test`
   - 检查覆盖率: `npm run test:coverage`

3. **提交代码**:
   ```bash
   git add .
   git commit -m "feat: 实现浏览历史收集"
   ```

4. **推送分支**:
   ```bash
   git push origin feature/browsing-history
   ```

5. **创建 PR**:
   - 标题和描述使用中文
   - 关联相关 issue
   - 确保 CI 测试通过

6. **合并后**: 删除功能分支
   ```bash
   git branch -d feature/browsing-history
   ```

### Copilot 交互惯例

- **明确要求时才提交**: "在我测试你的修改后,明确要求提交时,再进行提交"
- **提供完整上下文**: 说明功能需求、约束条件、参考文档
- **增量开发**: 先骨架后细节,逐步完善功能
- **测试驱动**: 
  - 实现功能 → 编写测试 → 验证通过 → 提交
  - 可以先写测试,再实现功能 (TDD)

## Performance Targets

- **冷启动**: < 1000ms (popup 打开)
- **页面分析**: < 100ms (后台处理)
- **AI 推荐**: < 3s (网络请求)
- **内存占用**: < 50MB (空闲状态)

## Documentation

- **代码注释**: 使用中文,解释"为什么"而不是"是什么"
- **README**: 中英双语,面向用户
- **技术文档**: 中文,面向开发者 (`docs/` 目录)
- **变更日志**: 记录所有 breaking changes

## Security Guidelines

- **Content Security Policy**: 严格遵循 MV3 要求
- **权限最小化**: 只请求必需的 Chrome 权限
- **输入验证**: 所有外部输入都需验证和清理
- **XSS 防护**: 使用 React 的自动转义,避免 `dangerouslySetInnerHTML`

## Useful Commands

```bash
# 开发
npm run dev              # 启动开发服务器

# 测试
npm test                 # 监听模式
npm run test:run         # 运行一次
npm run test:ui          # 可视化 UI
npm run test:coverage    # 生成覆盖率报告

# 构建
npm run build            # 生产构建
npm run package          # 打包扩展

# 代码质量
npm run lint             # (需配置) 代码检查
npm run format           # (需配置) 代码格式化
```

## Resources

- [PRD](../docs/PRD.md) - 产品需求文档
- [TDD](../docs/TDD.md) - 技术设计文档
- [测试指南](../docs/TESTING.md) - 完整测试教程
- [Plasmo 文档](https://docs.plasmo.com/)
- [Vitest 文档](https://vitest.dev/)

```
