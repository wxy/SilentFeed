# 技能库独立项目设计文档

## 1. 项目概览

### 项目名称选项
基于用户需求"重点是进化和技能组"，候选名称：

| 名称 | 说明 | 评分 |
|-----|------|-----|
| `copilot-evolution-skills` | 明确指向 Copilot + 进化 + 技能 | ⭐⭐⭐⭐⭐ |
| `ai-evolution-skills` | 通用 AI + 进化 + 技能 | ⭐⭐⭐⭐ |
| `evolution-skills` | 简洁，突出进化和技能 | ⭐⭐⭐⭐ |
| `skills-evolution-kit` | 更强调是一个工具包 | ⭐⭐⭐ |

**推荐**: `copilot-evolution-skills` - 明确、完整、易于搜索

### 项目定位
- **类型**: AI 助手技能库 + 工程规范框架
- **受众**: Copilot/Claude 用户，跨项目使用
- **核心价值**: 提供通用的 AI 进化框架和可复用的工程技能
- **集成方式**: Git Submodule

---

## 2. 项目结构设计

```
copilot-evolution-skills/
├── .github/
│   ├── ai-evolution-constitution.md     [通用进化宪法]
│   ├── INSTALLATION.md                  [安装指南（AI 可读）]
│   ├── CONFLICT_RESOLUTION.md           [冲突解决指南]
│   └── EVOLUTION.md                     [技能演进机制]
├── README.md                            [项目主页]
├── SETUP.md                             [AI 可执行的一行指令 + 交互式安装]
├── constitution/
│   └── ai-evolution-constitution.md     [核心框架文件]
├── skills/
│   ├── README.md                        [技能库说明]
│   ├── _evolution-core/
│   │   └── SKILL.md
│   ├── _typescript-type-safety/
│   │   └── SKILL.md
│   ├── _git-commit/
│   │   └── SKILL.md
│   ├── _pr-creator/
│   │   └── SKILL.md
│   ├── _code-health-check/
│   │   └── SKILL.md
│   └── [11 more custom skills...]
├── templates/
│   ├── SKILL_TEMPLATE.md                [新技能的标准模板]
│   ├── INSTRUCTION_TEMPLATE.md          [新项目指令模板]
│   └── copilot-instructions-base.md     [新项目的 Part 2 基础模板]
├── scripts/
│   ├── setup-interactive.sh             [交互式安装脚本]
│   ├── validate-installation.sh         [验证安装]
│   └── resolve-conflicts.sh             [冲突解决辅助]
├── docs/
│   ├── AI_INTEGRATION_GUIDE.md          [AI 如何使用本库]
│   ├── SKILL_CREATION_GUIDE.md          [创建新技能的流程]
│   ├── MULTI_PROJECT_GUIDE.md           [多项目共享策略]
│   └── VERSIONING.md                    [版本管理策略]
└── version.txt                          [版本号]
```

---

## 3. 核心文件设计

### 3.1 SETUP.md - 一行指令 + 交互式安装

```markdown
# 快速开始

## 一行指令（用于 AI）

\`\`\`
bash <(curl -s https://raw.githubusercontent.com/YOUR_ORG/copilot-evolution-skills/main/scripts/setup-interactive.sh) --target-dir
\`\`\`

## 交互式安装

或直接运行以下命令开始交互式设置：

\`\`\`bash
./scripts/setup-interactive.sh
\`\`\`

### 设置流程

1. **选择安装目录**（默认 `.copilot/`，可选 `.claude/`, `.github/`, 自定义）
2. **选择组件**（完整/最小/自定义）
3. **生成项目指令**（自动生成 copilot-instructions.md Part 2）
4. **验证安装**（检查文件完整性）
5. **初始化 Git**（如需要）

\`\`\`
```

**脚本设计** (`setup-interactive.sh`):
```bash
#!/bin/bash

# 步骤 1: 显示欢迎信息
# 步骤 2: 选择安装目录（带默认值）
#   - Default: .copilot/
#   - Option 1: .claude/
#   - Option 2: .github/
#   - Option 3: Custom path
# 步骤 3: 选择要安装的组件
#   - [x] All skills (13)
#   - [ ] Minimal (core + type-safety + git)
#   - [ ] Custom (checkbox selection)
# 步骤 4: 确认并执行安装
# 步骤 5: 验证完整性
# 步骤 6: 生成报告
```

### 3.2 .github/INSTALLATION.md - AI 参考指南

```markdown
# 安装指南（为 AI 助手编写）

## 快速参考

| 场景 | 命令 |
|-----|------|
| 新项目完整安装 | `bash setup-interactive.sh` 选择完整模式 |
| 添加到现有项目 | `bash setup-interactive.sh` 选择自定义目录 |
| 仅安装特定技能 | `bash setup-interactive.sh` 选择最小模式 |
| 更新现有安装 | `git submodule update --remote` |

## 安装后检查清单

- [ ] 所有技能文件存在
- [ ] copilot-instructions.md 已生成
- [ ] 进化宪法 attachment 链接正确
- [ ] Git submodule 已初始化（如使用）
```

### 3.3 .github/CONFLICT_RESOLUTION.md

```markdown
# 冲突解决策略

## 场景 1: 多项目同时修改同一技能

**示例**: 项目 A 和项目 B 都修改了 `_typescript-type-safety/SKILL.md`

### 解决方案 1: Three-way Merge（推荐）
- 合并两方的改进
- 在 submodule 中解决冲突
- 推送更新的 submodule 版本

### 解决方案 2: Derived Version
- 在项目中创建 `.copilot/skills-overrides/`
- 复制需要定制的技能文件
- 在项目指令中加载 override 版本

示例结构:
```
project-a/
├── .copilot/
│   ├── skills/        [Submodule]
│   └── skills-overrides/
│       └── _typescript-type-safety/
│           └── SKILL.md  [项目 A 的定制版本]
```

### 解决方案 3: Rebase
- 同步 submodule 最新版本
- 基于最新版本重新应用项目修改

## 场景 2: 技能演进 vs 项目冻结

如果某项目不想采用最新的技能更新：
- 使用 `git submodule update --checkout <commit-hash>`
- 固定到特定版本
- 在需要时手动升级
```

### 3.4 .github/EVOLUTION.md

```markdown
# 技能演进机制

## 演进触发条件

| 触发事件 | 例子 | 输出 |
|---------|------|------|
| 新的错误模式 | 多次 TypeScript mock 错误 | 技能改进或新技能 |
| 用户反馈 | 用户指出某工作流效率低 | 优化流程 |
| 新场景需求 | 首次集成特定框架 | 创建新技能 |
| 工程实践演进 | 发现更好的模式 | 更新已有技能 |

## 版本管理

采用 Semantic Versioning：
- **MAJOR**: 架构变化（文件结构、用法改变）
- **MINOR**: 新技能、主要改进
- **PATCH**: 文档更新、小修复

示例: `1.2.3`
- 1: 架构版本
- 2: 包含 2 个新技能
- 3: 第 3 个修补

## PR 流程

1. 在 submodule 中创建功能分支
2. 更新或创建技能文件
3. 更新版本号和 CHANGELOG
4. 创建 PR（中文描述）
5. 合并后标记 Git tag
6. 各项目 `git submodule update --remote`

## CHANGELOG 格式

\`\`\`markdown
## [1.2.0] - 2024-01-15

### Added
- `_new-skill-name`: 新技能描述

### Changed
- `_existing-skill`: 改进说明

### Fixed
- Bug in skill X

### Deprecated
- Old pattern: 说明迁移路径
\`\`\`
```

---

## 4. AI 友好的文档

### 4.1 docs/AI_INTEGRATION_GUIDE.md

```markdown
# 为 AI 助手的集成指南

## 如何读取和使用本库

### 步骤 1: 初始化
项目在首次使用时，应该：
1. 读取 `.github/ai-evolution-constitution.md`（战略框架）
2. 读取 `.github/copilot-instructions.md`（战术规范）
3. 浏览 `skills/*/SKILL.md`（可用技能目录）

### 步骤 2: 遇到问题时
当遇到以下情况，按优先级处理：
1. 检查对应的 SKILL.md 文件
2. 查阅 constitution（确认思维框架）
3. 若问题重复出现，考虑改进或创建技能

### 步骤 3: 创建新技能
遵循流程（详见本文档下方）

## 技能快速检索

\`\`\`
_evolution-core       → 进化能力本身
_typescript-type-safety → TypeScript mock/类型问题
_git-commit          → Git 提交规范
_pr-creator          → PR 创建流程
_code-health-check   → 提交前检查
...等（见 skills/ 目录）
\`\`\`

## 判断何时创建新技能

你应该创建新技能，如果：
- ✅ 某类任务重复 3+ 次，每次都需要特殊处理
- ✅ 用户明确反馈某行为不符合预期
- ✅ 发现新的工程最佳实践

你不应该创建新技能，如果：
- ❌ 仅是一次性问题
- ❌ 是特定项目的小规则（放在项目指令中）
- ❌ 内容不足以填充一个结构化技能
```

### 4.2 docs/SKILL_CREATION_GUIDE.md

```markdown
# 创建新技能的完整流程

## SKILL.md 标准结构

\`\`\`markdown
---
name: _skill-name
description: 一句话描述
triggers: 
  - 触发场景 1
  - 触发场景 2
---

# 技能名称

## 何时使用
明确的使用场景

## 步骤
1. Step 1
2. Step 2
3. Step 3

## 常见错误
- 错误 1 及解决方案
- 错误 2 及解决方案

## 参考
- 相关技能
- 外部资源
\`\`\`

## 提交新技能
1. 在 submodule 中创建分支
2. 按上述格式编写 SKILL.md
3. 创建 PR，描述触发条件和使用场景
4. 合并后，各项目自动继承（通过 `git submodule update --remote`）
```

---

## 5. 与现有项目集成

### 5.1 SilentFeed 迁移步骤

```bash
# 1. 在 SilentFeed 仓库中添加 submodule
git submodule add https://github.com/YOUR_ORG/copilot-evolution-skills.git .copilot/skills

# 2. 更新 copilot-instructions.md 中的 constitution 引用
# 改为指向 submodule 中的文件：
<attachment filePath=".copilot/skills/constitution/ai-evolution-constitution.md">

# 3. 删除本地的 .copilot/skills/ 下的旧技能文件（保留 override 文件夹如有）

# 4. 验证所有链接和引用
bash .copilot/skills/scripts/validate-installation.sh

# 5. 提交
git add .gitmodules .github/copilot-instructions.md .copilot/skills
git commit -m "refactor: 迁移到独立的技能库 submodule"
```

---

## 6. 项目维护计划

### 6.1 版本发布流程

```
技能改进/新技能创建
    ↓
更新 CHANGELOG
    ↓
版本号 bump (manual tag)
    ↓
创建 GitHub Release
    ↓
各项目通知更新可用
    ↓
各项目选择更新时机
    ↓
git submodule update --remote
```

### 6.2 定期审查

- **月度**: 评估新的错误模式
- **季度**: 审查现有技能，决定改进或弃用
- **年度**: 架构调整、大版本规划

---

## 7. 成功指标

- ✅ 所有自定义技能从 SilentFeed 成功迁移
- ✅ 至少有 2 个项目通过 submodule 使用该库
- ✅ 有至少 1 个"衍生版本"的成功案例（项目定制技能）
- ✅ 文档清晰到 AI 助手可以独立使用
- ✅ 冲突解决实践通过测试验证

---

## 8. 后续行动清单

- [ ] 确定项目最终名称
- [ ] 创建独立仓库（`copilot-evolution-skills`）
- [ ] 迁移所有 13 个技能文件
- [ ] 编写 SETUP.md 和交互式脚本
- [ ] 编写所有 .github/ 文档
- [ ] 在 SilentFeed 中测试 submodule 集成
- [ ] 发布 v1.0.0
- [ ] 更新 SilentFeed 以使用 submodule
- [ ] 文档和示例完善

