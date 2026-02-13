---
name: _git-commit
description: Git 提交最佳实践。提供规范化提交流程、说明文件模板、Conventional Commits 格式指导。用于确保提交信息清晰、一致、便于追踪。
---

# _git-commit

## 📌 技能描述

- **用途**：将繁琐的 git 提交流程标准化，避免命令行中的长篇幅说明导致问题
- **适用场景**：提交代码变更，特别是涉及多项改动或需要详细说明的提交
- **学习来源**：SilentFeed 项目的版本控制实践和 PR Creator Skill 经验

**核心资源**：
- 📄 **标准模板**（带签名行）：
  - 中文：`references/commit_template_zh.md`
  - 英文：`references/commit_template.md`
- ✅ **强制检查清单**：确保签名行和格式正确
- 🔄 **多语言支持**：根据项目语言选择合适模板

---

## 🔍 问题背景

**常见问题**：
- ❌ 直接在 `git commit -m "long message..."` 中输入长篇幅说明，导致命令行问题
- ❌ 提交信息杂乱，不符合 Conventional Commits 规范
- ❌ 缺少结构化的变更说明，难以理解提交的目的和影响
- ❌ 提交信息混用中英文，格式不统一

**解决方案**：
✅ 使用 `.github/COMMIT_DESCRIPTION.local.md` 作为说明文件（本地文件，不入库）  
✅ 提供标准模板（中英文，已含签名行）  
✅ 遵循 Conventional Commits 格式  
✅ 结构化的变更内容  
✅ 强制检查清单防止遗漏  
✅ 自动化提交和清理流程

---

## ✅ 执行流程（5 步）

### 0️⃣ 前置约束：确保在开发分支上（⚠️ 强制）

```bash
git rev-parse --abbrev-ref HEAD
```

**约束**：
- ✅ **必须在非 master 分支上开发**（如 feature/*、fix/*、chore/*、docs/*）
- ❌ **禁止直接在 master 分支进行开发提交**
- master 分支只用于：版本发布、GitHub Release 创建、发布标记

**为什么？**
1. 保持 master 分支的发布就绪状态
2. 所有开发工作应独立为 feature 分支
3. 便于 PR 审查和 CI/CD 检查
4. 发布工作在 master 分支单独进行

**若当前在 master 分支**：
```bash
git checkout -b feature/your-feature-name
```

---

### 1️⃣ 理解提交范围

在提交前，明确以下问题：
- 这次提交改动了什么？
- 是 feature、fix、docs、refactor、test、chore 中的哪一类？
- 涉及哪些文件或模块？
- 有没有破坏性改动（BREAKING CHANGE）？

**补充：分阶段提交（多个独立逻辑块）**

若开发中改动了多个逻辑上独立的部分（例如：修复 bug A + 重构函数 B + 添加测试 C），应分开提交，每个提交聚焦一个功能或修复。使用 `git add -p` 交互式添加：

```bash
# 交互式添加，git 会展示每个 hunk（代码块）
git add -p

# 工作流示例：
# 1. git add -p 选择第一组改动（y）
# 2. 跳过第二组（n）和第三组（n）
# 3. git commit -F .github/COMMIT_DESCRIPTION.md（提交第一部分）
# 4. git add -p 继续选择第二组改动
# 5. 重复此过程
```

**何时使用分阶段提交**：
- 修复 2+ 个独立 bug（各提交一次）
- 代码优化 + 新功能 + 文档更新（各提交一次）
- 重构 + 测试添加（各提交一次）

**何时不需要分开**：
- 一个功能相关的多文件改动（如：新增类 + 单元测试 + 使用处）→ 一次提交
- 配对的改动（如：删除旧代码 + 添加新代码替换）→ 一次提交

**好处**：
- 每个提交职责单一，易于理解和回溯
- 若需要 revert，可精确撤销某一部分
- 代码审查时更清晰

### 2️⃣ 使用标准模板创建说明文件

**推荐做法**：直接复制标准模板，填充实际内容

**模板位置**：
- 中文：`.copilot/skills/_git-commit/references/commit_template_zh.md`
- 英文：`.copilot/skills/_git-commit/references/commit_template.md`

**使用方法**：
```typescript
// 读取模板
const template = read_file(".copilot/skills/_git-commit/references/commit_template_zh.md");

// 填充实际内容
const content = template.replace("type(scope): 简短描述", "feat(ai): 添加推荐聚类算法")
                        .replace("关键改动 1", "添加 ClusterPrescreen 类")
                        // ... 填充其他内容

// 创建提交说明文件
create_file({
  filePath: "/path/to/SilentFeed/.github/COMMIT_DESCRIPTION.local.md",
  content: content
})
```

⚠️ **关键要求**：
- 模板末尾已包含签名行 `> 🤖 本提交由 _git-commit 技能生成`（或英文版本）
- 必须保留签名行，不可删除

### 3️⃣ 编写提交说明

基于模板编写 **Conventional Commits** 格式的说明：

```markdown
<type>(<scope>): <subject>

<body>

<footer>
```

#### 格式详解

**第一行（必需）**：`<type>(<scope>): <subject>`
- `<type>`: 提交类型（见下表）
- `<scope>`: 影响范围，如 storage、ui、core（可选）
- `<subject>`: 简短描述（50 字以内，现在式，无句号）

**主体部分（推荐）**：
- 详细说明为什么做这个改动
- 每行不超过 72 字符
- 可分多段，段落间空一行
- 说明技术实现细节或设计决策

**页脚部分（可选）**：
- `Fixes #123` - 关联 Issue
- `Closes #456` - 关闭 Issue
- `BREAKING CHANGE: description` - 破坏性改动

#### 提交类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(ai): 添加推荐聚类算法` |
| `fix` | 修复 bug | `fix(ui): 修正推荐卡片宽度问题` |
| `docs` | 文档更新 | `docs: 更新 AI 架构说明` |
| `style` | 代码风格（无逻辑改动） | `style: 格式化 TypeScript 代码` |
| `refactor` | 代码重构 | `refactor: 提取推荐评分逻辑` |
| `test` | 测试相关 | `test: 添加推荐系统集成测试` |
| `chore` | 工具、配置、依赖 | `chore: 升级 Tailwind CSS 依赖` |
| `perf` | 性能优化 | `perf: 优化推荐列表渲染` |
| `ci` | CI/CD 相关 | `ci: 添加 TypeScript 检查 workflow` |

#### 提交说明示例

**示例 1：简单修复**
```markdown
fix(storage): 修复 Dexie 事务超时问题

当推荐数据量超过 1000 条时，batch insert 容易超时。
改为分段事务处理，每次处理 100 条。

Fixes #456
```

**示例 2：功能特性**
```markdown
feat(core): 实现推荐聚类预筛选机制

为了减少低相关性推荐的干扰，在评分前添加聚类预筛选。

## 变更内容
- 添加 ClusterPrescreen 类处理聚类逻辑
- 配置可调的聚类阈值（默认 0.5）
- 添加单元测试覆盖 3 个场景

## 性能影响
- 初次加载增加 15ms（聚类时间）
- 减少 20% 的无关推荐

Fixes #123
```

**示例 3：重大重构**
```markdown
refactor(ai): 整合 AI Provider 架构

统一多家 AI 厂商的接口，简化成本计算和错误处理逻辑。

## 破坏性变更
BREAKING CHANGE: 移除 openai-direct 模块，所有厂商统一使用 AIProviderFactory

## 迁移指南
1. 移除对 openai-direct 的导入
2. 使用 AIProviderFactory.create() 替代
3. 检查错误处理逻辑（新增 ProviderError 类）
```

### 4️⃣ 执行提交

使用说明文件进行提交：

```bash
git add <files>
git commit -F .github/COMMIT_DESCRIPTION.local.md
```

⚠️ **重要警告**：
- **禁止使用** `git add .` 或 `git add --all`
- 必须**明确指定**要提交的文件，例如：
  ```bash
  git add src/core/ai/providers/openai.ts src/storage/db.ts
  git commit -F .github/COMMIT_DESCRIPTION.local.md
  ```
- 原因：防止本地说明文件被意外提交到仓库

或作为工作流的一部分（确保明确指定文件）：

```typescript
run_in_terminal({
  command: "git add src/path/to/files && git commit -F .github/COMMIT_DESCRIPTION.local.md",
  explanation: "提交变更到本地仓库"
})
```

**安全的完整工作流示例**：
```bash
# 明确指定要提交的文件
git add .copilot/skills/_git-commit/SKILL.md && \
git commit -F .github/COMMIT_DESCRIPTION.local.md && \
rm .github/COMMIT_DESCRIPTION.local.md
```

### 5️⃣ 提交前强制检查 ⚠️

**在执行 git commit 之前**，必须完成以下检查：

- [ ] ✅ **签名行已添加**：确认文件末尾有 `> 🤖 本提交由 _git-commit 技能生成`（或英文版本）
- [ ] ✅ **模板结构完整**：保留了模板的分段结构（变更内容、技术细节等）
- [ ] ✅ **类型格式正确**：第一行符合 `type(scope): subject` 格式
- [ ] ✅ **文件路径正确**：`.github/COMMIT_DESCRIPTION.local.md`

**检查方法（可选）**：
```bash
# 检查签名行
grep -q "_git-commit 技能生成\|_git-commit skill" .github/COMMIT_DESCRIPTION.local.md && echo "✅ 签名行存在" || echo "❌ 缺少签名行"

# 检查文件格式
head -1 .github/COMMIT_DESCRIPTION.local.md | grep -E "^(feat|fix|docs|style|refactor|test|chore|perf|ci)" && echo "✅ 类型正确" || echo "❌ 类型错误"

# 检查说明与变更是否一致（人工快速核对）
echo "变更文件列表：" && git diff --name-only --cached
```

### 6️⃣ 执行提交与清理

提交后立即清理临时文件：

完成签名后，删除临时说明文件：

```bash
rm .github/COMMIT_DESCRIPTION.local.md
```

或作为完整工作流：

```bash
git add <files> && \
git commit -F .github/COMMIT_DESCRIPTION.local.md && \
rm .github/COMMIT_DESCRIPTION.local.md
```

---

## 🧰 快速检查清单

在提交前检查：

- [ ] 是否选择了正确的 `<type>`？
- [ ] `<subject>` 是否清晰、简明（≤50 字）？
- [ ] 是否包含了必要的 `<body>` 说明？
- [ ] 所有行是否不超过 72 字符？
- [ ] 是否关联了相关的 Issue（如有）？
- [ ] 是否标记了破坏性改动（如有）？
- [ ] 说明文件使用的是 Markdown 格式吗？
- [ ] 是否遵循了中文规范（如有中文）？
- [ ] **❗ 提交说明是否覆盖所有已暂存变更文件？**（对照 `git diff --name-only --cached`）
- [ ] **❗ 是否在末尾添加了技能签名行？** (`> 🤖 本提交由 _git-commit 技能生成`)
- [ ] **❗ 是否明确指定了要提交的文件？**（禁止使用 `git add .`）

---

## 💡 最佳实践

### 1. 提交粒度

✅ **推荐**：一个逻辑功能 = 一次提交
```bash
# 好：每个提交完整且独立
feat: 添加推荐聚类功能
fix: 修正聚类参数校验
test: 添加聚类单元测试
```

❌ **避免**：混乱的、跨越多个关注点的提交
```bash
# 不好：包含无关改动
feat: 修复推荐并更新文档并优化数据库查询
```

### 2. 提交信息的时态

✅ **推荐**：现在式（命令式）
```
feat: 添加用户偏好学习模块  # ✅
feat: 添加了用户偏好学习模块  # ❌
```

### 3. 关联 Issue 的方式

✅ **推荐**：
```markdown
feat: 实现推荐缓存策略

采用 LRU 缓存减少数据库查询。

Fixes #123
```

❌ **避免**：在 subject 中直接提 Issue
```
feat: 实现推荐缓存策略 (#123)  # ❌
```

### 4. 说明文件不应包含的内容

❌ 不要写代码示例（除非绝对必要）  
❌ 不要列举每一行改动（git diff 已有）  
❌ 不要写"修复了之前的提交"（通过 rebase 处理）  
❌ 不要写过于技术细节的实现细节（代码注释处理）

### 5. 中文规范

当使用中文说明时：
- 标点符号：使用中文标点（。，、；：）
- 空格：中英文间不需要空格（项目约定）
- 术语：保持一致（推荐、推荐系统、AI 模型等）

### 6. 常见错误与修复

**❌ 错误 1：使用 `git add .` 导致临时文件被提交**

```bash
# 错误示例
git add .
git commit -F .github/COMMIT_DESCRIPTION.md
# ❌ 结果：COMMIT_DESCRIPTION.md 被提交到仓库
```

**✅ 正确做法**：明确指定文件
```bash
git add src/core/ai/providers/openai.ts
git commit -F .github/COMMIT_DESCRIPTION.md
rm .github/COMMIT_DESCRIPTION.md
```

**如何修复已提交的错误**：
```bash
# 使用 amend 修复最后一个提交
git reset --soft HEAD~1
git reset HEAD path/to/unwanted/file
git commit --amend --no-edit
```

**❌ 错误 2：忘记添加技能签名行**

提交说明末尾缺少：
```markdown
---

**Commit Tool**: _git-commit Skill
```

**✅ 修复方法**：重新编辑说明文件并重新提交

---

## 📚 参考资料

### 标准文档
- [Conventional Commits](https://www.conventionalcommits.org/) - 提交规范标准
- [Git Commit Best Practices](https://cbea.ms/git-commit/) - Git 提交最佳实践
- `docs/VERSIONING.md` - SilentFeed 版本管理规范

### 项目约定
- `.github/copilot-instructions.md` - 项目宪法（版本控制部分）
- `.github/PR_DESCRIPTION.md` - 使用 PR Creator Skill 的示例

### 相关技能
- `_evolution-core` - AI 进化能力（发现新技能的触发机制）
- 官方 `pr-creator` - PR 创建技能（类似的工作流）

---

## 🎖️ 技能签名指导

本技能提供的说明文件模板应在末尾包含致谢行，说明此提交是使用本技能创建的：

### 签名格式

在 `.github/COMMIT_DESCRIPTION.md` 的最后添加：

```markdown
---

**Commit Tool**: _git-commit Skill (`.copilot/skills/_git-commit/SKILL.md`)
```

或更简洁的版本：

```markdown
---

**Tool**: _git-commit Skill
```

### 完整示例

```markdown
feat(core): 实现推荐聚类预筛选机制

为了减少低相关性推荐的干扰，在评分前添加聚类预筛选。

## 变更内容
- 添加 ClusterPrescreen 类处理聚类逻辑
- 配置可调的聚类阈值（默认 0.5）
- 添加单元测试覆盖 3 个场景

---

**Commit Tool**: _git-commit Skill
```

### 为什么需要签名？

1. **追踪工具链**：明确显示提交是使用 AI 技能辅助生成的
2. **持续改进**：帮助识别哪些提交遵循了规范，便于统计和优化
3. **透明性**：对代码审查者和维护者提供清晰的信息
4. **一致性**：与 PR Creator Skill 的做法保持一致

### 签名行不会被提交

⚠️ **重要**：签名行 (`---` 及之后内容) 会被 git 忽略（或在提交说明中被精简）。

如果你想让签名行出现在提交消息中，应该：
```bash
git commit -F .github/COMMIT_DESCRIPTION.md
```

此时签名行会保留在原始提交消息中（在 `git log --format=fuller` 中可见）。

---

## 🔄 改进建议

- 未来可考虑添加交互式提交向导脚本
- 可添加 git hook 来自动检查提交信息格式
- 考虑集成 commitlint 进行自动验证
- 可创建预定义模板加快常见提交的创建
