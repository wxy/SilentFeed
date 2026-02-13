---
name: _pr-creator
description: PR 创建与版本控制流程技能。智能分析提交、生成 PR、管理版本号。支持多语言模板、自动检测版本策略。
---

# _pr-creator

## 📌 技能描述

自动化 PR 创建流程，包括智能版本检测、PR 描述生成、分支同步与推送。

**适用场景**：创建/更新 PR、版本变更、分支合并前

**学习来源**：SilentFeed PR 创建流程实践与常见失败案例

---

## 🎯 核心能力

| 能力 | 说明 |
|-----|------|
| **智能版本检测** | BREAKING → major, feat → minor, fix → patch |
| **多语言模板** | 中文/英文 PR 描述模板 |
| **智能更新** | 检测已存在 PR 并更新，避免重复 |
| **Dry-run 预览** | 执行前预览变更 |
| **多格式支持** | package.json, manifest.json, pyproject.toml, setup.py |

---

## 🚀 快速使用

### 标准指令："提交并 PR"

当用户说**"提交并 PR"**或**"commit and create PR"**时，执行以下标准流程：

**步骤 0：检查分支（前置约束 ⚠️）**
```bash
git rev-parse --abbrev-ref HEAD
```
- ✅ **必须在开发分支上**（非 master）
- ❌ **禁止直接在 master 分支提交开发代码**
- 推荐分支命名：`feature/*`、`fix/*`、`chore/*`、`docs/*`（遵循 Conventional Commits）

**为什么？**
1. master 分支只用于发布和 GitHub Release
2. 所有开发工作都应在独立分支上进行
3. 保持 master 分支的发布就绪状态（release-ready）
4. PR 审查过程在独立分支上进行

**若在 master 分支**：
- 创建新分支：`git checkout -b <branch-name>`
- 将最后一个提交移到新分支：`git reset --soft HEAD~1 && git checkout <branch-name> && git commit`
- 重置 master：`git checkout master && git reset --hard HEAD~1`

---

**步骤 1：检查工作区状态**
```bash
git status --porcelain
```
- 若有未暂存变更 → 提示用户确认要提交的文件
- 若暂存区为空 → 先使用 _git-commit 技能完成提交
- 若已有提交 → 直接跳到步骤 3

**步骤 2：完成提交（若需要）**
- 使用 _git-commit 技能创建提交
- 确保提交说明完整且符合 Conventional Commits 规范

**步骤 3：分析提交并决定版本策略**
```bash
git log --oneline origin/master..HEAD
```
- 检测提交类型 → 决定版本号策略（major/minor/patch/skip）

**步骤 4：创建 PR**
- 生成 PR 描述文件
- 使用项目脚本创建 PR（**禁止直接 gh 命令**）

### 旧版快速使用说明（已整合到上方）

直接告诉 AI："创建 PR" 或 "Create a PR"

AI 会自动完成：
1. 分析提交类型 → 决定版本策略
2. 生成 PR 标题和描述（基于模板）
3. 同步分支 → 运行脚本 → 创建/更新 PR

---

## ⚠️ 强制约束

**必须使用项目脚本，禁止直接使用 gh 命令**

- ✅ **正确**：`bash .copilot/skills/_pr-creator/scripts/create-pr.sh`
- ❌ **错误**：`gh pr create --title ... --body ...`

**为什么？**
1. 脚本会自动处理版本号更新（package.json/manifest.json）
2. 脚本会自动清理临时文件
3. 脚本支持 dry-run 预览
4. 脚本确保流程一致性和可追溯性

**违反此约束时**：
- 版本号不会自动更新，需手动修改
- 临时文件不会清理，可能误提交
- 无法预览变更，风险更高

---

## ✅ 执行流程

### 1. AI 分析提交（自动）

```python
# 检测提交类型
commits = git log origin/master..HEAD
has_breaking = "BREAKING" in commits or "!:" in commits
has_feat = "feat:" in commits

# 决定版本策略
bump = "major" if has_breaking else "minor" if has_feat else "patch"
```

### 2. 生成 PR 描述

使用 `create_file` 创建 `.github/PR_DESCRIPTION.local.md`，参考模板：
- 中文：`.copilot/skills/_pr-creator/references/pull_request_template_zh.md`
- 英文：`.copilot/skills/_pr-creator/references/pull_request_template.md`

**提交摘要（必填）**：在 PR 描述中追加“提交摘要”段落，基于下述命令生成：
```bash
git log --oneline origin/master..HEAD
```
示例：
```
## 提交摘要
- abc1234 feat(ui): 新增设置入口
- def5678 chore: 更新技能模板
```

### 3. 同步并运行脚本

```bash
# 同步远端分支
git fetch origin && git rebase origin/<branch>

# 运行脚本（推荐：通过 PR_BODY_AI 传入说明文件内容）
PR_BODY_AI="$(cat .github/PR_DESCRIPTION.local.md)" \
PR_BRANCH="<branch>" \
PR_TITLE_AI="<title>" \
PR_LANG="zh-CN" \
VERSION_BUMP_AI="minor" \
CURRENT_VERSION="0.6.4" \
NEW_VERSION="0.7.0" \
VERSION_FILE="package.json" \
bash .copilot/skills/_pr-creator/scripts/create-pr.sh
```

**必需变量**：`PR_BRANCH`, `PR_TITLE_AI`, `VERSION_BUMP_AI`

**版本策略**：`major` | `minor` | `patch` | `skip`

---

## ❗ 常见问题

| 问题 | 原因 | 修复 |
|-----|------|------|
| 脚本路径错误 | 使用了旧路径 | 使用 `.copilot/skills/_pr-creator/scripts/create-pr.sh` |
| 推送失败 (non-fast-forward) | 分支落后远端 | `git fetch && git rebase origin/<branch>` |
| 未提交变更警告 | 临时文件未清理 | `rm -f .github/PR_DESCRIPTION.local.md` |
| 重复 version bump | 多次运行脚本 | 后续运行使用 `VERSION_BUMP_AI=skip` |

---

## 🧰 检查清单

**执行前（强制）**：
- [ ] ✅ 工作区干净，无未提交变更
- [ ] ✅ 已同步远端分支（`git fetch && rebase`）
- [ ] ✅ PR 描述文件已生成（`.github/PR_DESCRIPTION.local.md`）
- [ ] ✅ 版本策略已确定（major/minor/patch/skip）
- [ ] ✅ **确认使用脚本而非 gh 命令**

**执行后（验证）**：
- [ ] PR 已成功创建或更新
- [ ] 版本号已自动更新（若非 skip）
- [ ] 临时文件已自动清理
- [ ] PR 描述包含技能签名行

---

## ❌ 常见错误与修正

### 错误 1：直接使用 gh 命令创建 PR

**错误示例**：
```bash
# ❌ 错误：绕过项目流程
gh pr create --title "feat: xxx" --body "..."
```

**为什么错误**：
- 版本号不会自动更新
- 临时文件不会清理
- 无法执行预检查
- 破坏流程一致性

**正确做法**：
```bash
# ✅ 正确：使用项目脚本
PR_BODY_AI="$(cat .github/PR_DESCRIPTION.local.md)" \
PR_BRANCH="feat/xxx" \
PR_TITLE_AI="feat: xxx" \
VERSION_BUMP_AI="minor" \
bash .copilot/skills/_pr-creator/scripts/create-pr.sh
```

### 错误 2：忘记生成提交摘要

**症状**：PR 描述缺少提交列表

**修正**：
```bash
# 获取提交摘要
git log --oneline origin/master..HEAD

# 添加到 PR 描述的"提交摘要"段落
```

### 错误 3：版本策略错误

**症状**：chore 提交导致版本号增加

**修正**：chore/docs/test 类型应使用 `VERSION_BUMP_AI=skip`

---

## 📚 参考资料

**版本检测规则**（[Conventional Commits](https://www.conventionalcommits.org/)）：
- `BREAKING CHANGE` 或 `!:` → major
- `feat:` → minor
- `fix:`, `refactor:`, `docs:` → patch

**脚本变量**：

| 变量 | 示例 | 说明 |
|------|------|------|
| `PR_BRANCH` | `feat/my-feature` | 当前分支名 |
| `PR_TITLE_AI` | `feat: 添加认证` | PR 标题 |
| `PR_LANG` | `zh-CN` / `en` | 语言（决定模板） |
| `VERSION_BUMP_AI` | `minor` / `skip` | 版本策略 |
| `CURRENT_VERSION` | `0.6.4` | 当前版本 |
| `NEW_VERSION` | `0.7.0` | 目标版本 |
| `VERSION_FILE` | `package.json` | 版本文件路径 |
| `DRY_RUN` | `true` / `false` | 预览模式 |

**PR 模板路径**：
- `.copilot/skills/_pr-creator/references/pull_request_template_zh.md`
- `.copilot/skills/_pr-creator/references/pull_request_template.md`

---

## 💡 使用示例

### 创建功能 PR

```python
# 1. 分析提交 → 决定 minor 版本
# 2. 生成描述
create_file(
  filePath=".github/PR_DESCRIPTION.local.md",
  content="""## 概述
添加用户配置功能

## 变更内容
- 新增用户资料页面
- 新增设置页面

## 版本管理
- 当前版本: 0.6.4
- 最终决定: 0.7.0 (minor)

---
> 🤖 本 PR 由 _pr-creator 技能自动生成"""
)

# 3. 执行脚本
run_in_terminal(
  command="bash .copilot/skills/_pr-creator/scripts/create-pr.sh",
  env={
    "PR_BRANCH": "feat/user-profile",
    "PR_TITLE_AI": "feat: 添加用户配置",
    "PR_LANG": "zh-CN",
    "VERSION_BUMP_AI": "minor",
    "CURRENT_VERSION": "0.6.4",
    "NEW_VERSION": "0.7.0",
    "VERSION_FILE": "package.json"
  }
)
```

### Dry-run 预览

```bash
DRY_RUN=true \
PR_BRANCH="feat/test" \
PR_TITLE_AI="feat: test" \
PR_LANG="zh-CN" \
VERSION_BUMP_AI="minor" \
CURRENT_VERSION="0.7.0" \
NEW_VERSION="0.8.0" \
VERSION_FILE="package.json" \
bash .copilot/skills/_pr-creator/scripts/create-pr.sh
```

---

## 🔗 相关技能

- **_git-commit**：提交前使用，确保提交规范
- **_code-health-check**：PR 前使用，确保代码质量
- **_evolution-core**：发现问题时沉淀改进

---

## 🎖️ 技能签名

PR 描述末尾包含：

```markdown
---
**PR Tool**: _pr-creator Skill
```
