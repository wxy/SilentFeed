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
- 支持用户反馈和调整
- 降低内容丢失风险

#### 方法2: 分段生成 + 合并（备选）

当累加式创建失败时的备选方案:

1. **分段创建**: 创建多个临时文件
```bash
create_file temp_part1.ts  # 基础定义
create_file temp_part2.ts  # 核心实现
create_file temp_part3.ts  # 工具函数
```

2. **Linux命令合并**: 使用系统命令合并
```bash
cat temp_part1.ts temp_part2.ts temp_part3.ts > final-file.ts
```

3. **清理临时文件**: 删除分段文件
```bash
rm temp_part*.ts
```

#### 方法3: 手动替换（最后手段）

- **触发条件**: 文件修改超过 50% 内容，或前两种方法失败
- **处理方式**: 直接输出完整的新文件内容，要求用户手动替换整个文件
- **操作说明**: 明确告知用户 "请手动复制以下内容替换整个文件"

**示例场景**:
- 创建大型测试文件（>300行）
- 复杂的类实现（多个方法）
- 完整的配置文件生成
- 重构测试文件的 mock 结构
- 大幅更新组件的 prop 类型

**选择策略的决策树**:
```
文件大小 < 300行 ？
├─ 是 → 直接使用 create_file
└─ 否 → 尝试累加式创建
   ├─ 成功 → 完成
   └─ 失败 → 尝试分段生成+合并
      ├─ 成功 → 完成  
      └─ 失败 → 手动替换方案
```

## Project Overview

FeedAIMuter 是一个 AI 驱动的 RSS 阅读器浏览器扩展，基于用户浏览行为智能推荐内容，静音信息噪音。

**命名含义**: Feed (RSS 订阅源) + AI (人工智能推荐) + Muter (静音器)

**技术栈**:
- Framework: Plasmo (Chrome Extension MV3)
- Language: TypeScript (strict mode)
- UI: React 18 + Tailwind CSS 3.x
- State: Zustand | Storage: Dexie.js (IndexedDB)
- Testing: Vitest + Testing Library
- AI: User APIs (OpenAI, Anthropic, DeepSeek)

**MVP 功能**:
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
  - 组件: PascalCase (ProfileBuilder)
  - 函数/变量: camelCase (getUserProfile)
  - 常量: UPPER_SNAKE_CASE (MAX_VISITS)
  - 文件: kebab-case (profile-builder.ts)
- **注释**: 公共 API 必须有 JSDoc，复杂逻辑需要中文解释

### Testing Requirements

**⚠️ 重要**: 每个功能都必须编写测试

- **覆盖率要求**: 行覆盖率 ≥ 70%，函数覆盖率 ≥ 70%，分支覆盖率 ≥ 60%
- **测试类型**: 纯函数→单元测试，类/模块→集成测试，React 组件→组件测试
- **测试命名**: *.test.ts 或 *.test.tsx
- **开发时**: npm test (监听模式)
- **提交前**: npm run test:coverage (检查覆盖率)
- **新文件规则**: 
  - 所有新增的代码文件都必须同时创建对应的测试文件
  - 新增测试必须确保覆盖率达标（行覆盖率 ≥ 70%）
  - 测试应该与代码一起提交，不允许先提交代码后补测试

详见 docs/TESTING.md

### Code Organization

项目结构:
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


### Privacy & Security

- **隐私优先**: 所有用户数据本地处理
- **三层数据模型**: 原始数据(仅本地) → 特征数据(可选同步) → 概率云(匿名聚合)
- **敏感信息**: 切勿硬编码 API key，使用 chrome.storage 安全存储，日志中不记录用户数据

### UI/UX Principles

- **克制设计**: 最小化干扰,信息密度低
- **主题适配**: 自动支持 light/dark 模式
- **国际化**: 用户可见文本必须使用 _() 函数包裹
- **性能优先**: 虚拟滚动、懒加载、节流/防抖
- **无障碍**: 支持键盘导航,语义化 HTML

## Internationalization (i18n)

### 基本规则

- **用户可见文本**: 必须使用 _() 函数包裹并添加到翻译文件
- **开发日志**: 保持中文,不需要国际化
- **错误消息**: 如果暴露给用户,需要国际化

### 使用示例

TypeScript 示例:
    import { useI18n } from "@/i18n/helpers"
    
    function MyComponent() {
      const { _ } = useI18n()
      return <div>{_("popup.welcome")}</div>  // ✅ 正确
      // return <div>欢迎使用</div>  // ❌ 错误 - 硬编码
    }

开发日志示例:
    console.log("开始初始化数据库...")  // ✅ 正确 - 开发日志保持中文
    throw new Error(_("errors.networkError"))  // ✅ 正确 - 用户消息国际化

### 工作流程

1. 开发时: 使用 _() 包裹用户可见文本
2. 添加中文: 编辑 public/locales/zh-CN/translation.json
3. 自动翻译: 运行 npm run i18n:translate
4. 审查质量: 检查生成的英文翻译,必要时手动调整

详见 docs/I18N.md

## Version Control Workflow

### Branching Strategy

- **主分支**: master (受保护,仅通过 PR 合并)
- **开发分支**: feature/功能名, fix/问题描述, test/测试范围, docs/文档主题, chore/任务说明

### Commit Messages (中文)

遵循约定式提交格式:
    <类型>: <简短描述>
    
    [可选的详细描述]
    
    [可选的 footer]

类型: feat (新功能), fix (Bug修复), test (测试), docs (文档), style (格式), refactor (重构), perf (性能), chore (构建/工具)

示例:
    feat: 实现浏览历史收集功能
    
    - 添加 content script 监听页面访问
    - 过滤有效页面 (停留时间 > 30s)
    - 存储到 IndexedDB
    
    关联 issue: 12号

### Git Workflow 关键步骤

1. 开发前: 从 master 创建功能分支 (git checkout -b feature/xxx)
2. 开发中: 频繁提交,保持提交原子化,运行测试确保通过
3. 提交代码: git add . && git commit -m "feat: xxx"
4. 推送分支: git push origin feature/xxx
5. 创建 PR: 标题和描述使用中文,关联相关 issue
6. 合并后: 删除功能分支 (git branch -d feature/xxx)

### Copilot 交互惯例

- **明确要求时才提交**: "在我测试你的修改后,明确要求提交时,再进行提交"
- **提供完整上下文**: 说明功能需求、约束条件、参考文档
- **增量开发**: 先骨架后细节,逐步完善功能
- **测试驱动**: 实现功能 → 编写测试 → 验证通过 → 提交 (或先写测试再实现 TDD)

### 开发流程规范

**⚠️ 重要**: 严格遵循以下流程

1. **创建功能分支**: 每个功能/任务都必须在独立分支开发
2. **开发过程**: 编写代码 → 编写测试 → 运行测试(npm test) → 确保通过
3. **浏览器测试**: 交付给用户进行浏览器实际测试,等待反馈,根据反馈修复
4. **提交代码**: 仅在用户明确要求时才提交,遵循约定式提交规范
5. **推送和 PR**: 仅在用户明确要求时才推送/创建 PR

**禁止行为**: 未经测试就交付代码 | 未经用户确认就提交代码 | 未经用户要求就推送代码 | 跳过浏览器测试环节

### 功能开发文档要求

**⚠️ 重要**: 每个功能/错误修复都必须有对应文档

- **开发前**: 创建功能文档 docs/PHASE_N_FEATURE.md (功能目标、技术方案、测试计划、预期效果)
- **开发中**: 按文档实现功能,遇到变更及时更新文档
- **完成后**: 对照文档验证验收标准,更新完成状态,更新 docs/DEVELOPMENT_PLAN.md 进度

详见 docs/DEVELOPMENT_PLAN.md

## Performance & Security

**性能目标**: 冷启动 < 1000ms | 页面分析 < 100ms | AI 推荐 < 3s | 内存占用 < 50MB

**安全要求**: 遵循 MV3 CSP | 权限最小化 | 输入验证 | XSS 防护(React 自动转义)

## Useful Commands

开发: npm run dev (启动开发服务器)
测试: npm test (监听) | npm run test:run (运行一次) | npm run test:coverage (覆盖率)
构建: npm run build (生产构建) | npm run package (打包扩展)

## Resources

- docs/PRD.md - 产品需求文档
- docs/TDD.md - 技术设计文档
- docs/TESTING.md - 完整测试教程
- docs/I18N.md - 国际化指南
- docs/DEVELOPMENT_PLAN.md - 开发计划
- Plasmo 文档: docs.plasmo.com
- Vitest 文档: vitest.dev


```
