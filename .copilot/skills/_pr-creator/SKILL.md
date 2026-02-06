---
name: _pr-creator
description: PR 创建与版本控制流程技能。基于项目内脚本自动生成 PR，处理版本号、变基、推送与清理临时文件，避免常见失败。支持智能版本检测、多语言、PR 模板。
---

# _pr-creator

## 📌 技能描述

- **用途**：使用项目内的 PR 创建脚本自动生成 PR，统一版本号变更与 PR 描述。
- **适用场景**：创建 PR、同步分支后更新 PR、需要小版本/补丁版本变更的 PR。
- **学习来源**：SilentFeed 项目 PR 创建流程与近期失败案例，继承自原 pr-creator 技能。

---

## 🎯 核心能力

✅ **智能版本检测**：根据提交类型自动建议 major/minor/patch
- `BREAKING CHANGE` 或 `!:` → major
- `feat:` → minor  
- `fix:`, `refactor:`, `docs:` 等 → patch

✅ **多语言支持**：根据对话语言自动选择 PR 模板（中文/英文）

✅ **PR 模板**：提供标准化的 PR 描述结构（references/ 目录）

✅ **智能 PR 更新**：检测已存在的 PR 并更新，避免重复创建

✅ **版本文件支持**：package.json, manifest.json, pyproject.toml, setup.py

✅ **Dry-run 模式**：预览变更而不实际执行

---

## 🚀 快速开始

直接告诉 AI：
- "创建 PR"（中文）
- "Create a PR"（English）

AI 会自动：
1. 分析当前分支的提交
2. 检测提交类型并建议版本
3. 生成 PR 标题和描述
4. 执行 PR 创建流程

---

## ✅ 标准流程（8 步）

### 0️⃣ AI 分析与决策（自动）

AI 应该先分析提交，做出决策：

```python
# 分析提交历史
commits = git log origin/master..HEAD

# 检测提交类型
has_breaking = any("BREAKING" in commit or "!:" in commit)
has_feat = any("feat:" in commit)
has_fix = any("fix:" in commit)

# 决定版本策略
if has_breaking:
    bump = "major"
elif has_feat:
    bump = "minor"
else:
    bump = "patch"

# 生成 PR 描述（参考模板）
# 中文对话 → references/pull_request_template_zh.md
# 英文对话 → references/pull_request_template.md
```

### 1️⃣ 确认当前分支

```bash
git status -sb
```

确保分支为目标分支，例如：`chore/ai-evolution`。

### 2️⃣ 清理工作区与临时文件

确保没有未提交变更，尤其是 `.github/pr-description.tmp`：

```bash
git status -sb
rm -f .github/pr-description.tmp
```

### 3️⃣ 与远端同步，避免非快进推送

```bash
git fetch origin
git rebase origin/<current-branch>
```

如出现重复提交提示，可按提示选择是否 `--reapply-cherry-picks`。

### 4️⃣ 准备 PR 描述文件（必须）

使用 `create_file` 生成 `.github/pr-description.tmp`，内容应参考模板：

**中文模板**：`.copilot/skills/_pr-creator/references/pull_request_template_zh.md`

**英文模板**：`.copilot/skills/_pr-creator/references/pull_request_template.md`

模板包含：
- 概述/Overview
- 变更内容/Changes
- 版本管理/Versioning
- 测试/Testing
- 影响/Impact
- 检查清单/Checklist
- 备注/Notes

示例：
```python
create_file(
  filePath=".github/pr-description.tmp",
  content="""## 概述
本 PR 完成 AI 进化系统的关键完善...

## 变更内容
- 建立 AI 进化系统框架
- 新增 4 个自定义技能

## 版本管理
- 当前版本: 0.6.4
- 建议提升: minor
- 最终决定: 0.7.0
...
"""
)
```

### 5️⃣ 版本策略（小版本）

- **本次为小版本**：`minor`
- 版本文件使用 `package.json`

若脚本已完成版本更新，后续运行请使用 `skip`：

```
VERSION_BUMP_AI=skip
CURRENT_VERSION=0.7.0
NEW_VERSION=0.7.0
```

### 6️⃣ 运行 PR 创建脚本

```bash
PR_BRANCH="<current-branch>" \
PR_TITLE_AI="<title>" \
PR_LANG="zh-CN" \
VERSION_BUMP_AI="minor|patch|skip" \
CURRENT_VERSION="<current>" \
NEW_VERSION="<new>" \
VERSION_FILE="package.json" \
bash .copilot/skills/_pr-creator/scripts/create-pr.sh
```

### 7️⃣ 验证推送与 PR 状态

- 若出现 **non-fast-forward**：先 rebase，再重跑脚本
- 若出现 **uncommitted change**：检查并删除 `.github/pr-description.tmp`

### 8️⃣ 清理临时文件

```bash
rm -f .github/pr-description.tmp
```

---

## ❗ 常见问题与修复

### 问题 1：脚本路径错误

**症状**：`bash: skills/pr-creator/scripts/create-pr.sh: No such file or directory`

**修复**：使用正确路径：
```
bash .copilot/skills/_pr-creator/scripts/create-pr.sh
```

### 问题 2：推送失败（非快进）

**症状**：`failed to push some refs (non-fast-forward)`

**修复**：
```bash
git fetch origin
git rebase origin/<current-branch>
```

### 问题 3：PR 脚本提示未提交变更

**症状**：`Warning: 1 uncommitted change`

**原因**：`.github/pr-description.tmp` 未清理

**修复**：
```bash
rm -f .github/pr-description.tmp
```

### 问题 4：重复版本 bump

**症状**：多次运行脚本导致重复 bump

**修复**：
- 第一次设置 `VERSION_BUMP_AI=minor`（或 patch）
- 后续设置 `VERSION_BUMP_AI=skip`

---

## 🧰 快速检查清单

- [ ] 当前分支正确且工作区干净
- [ ] 已清理 `.github/pr-description.tmp`
- [ ] 已 rebase 远端分支，避免非快进
- [ ] PR 描述文件已生成
- [ ] 版本策略正确（minor/patch/skip）
- [ ] 脚本路径正确（.copilot/skills/_pr-creator/scripts/create-pr.sh）

---

## 🔗 与其他技能的关系

- **_git-commit**：在 PR 创建前完成规范化提交
- **_code-health-check**：提交前完成质量检查
- **_evolution-core**：当出现新问题时，沉淀为改进点

---

## 📚 参考资料

### PR 模板

- 中文模板：`.copilot/skills/_pr-creator/references/pull_request_template_zh.md`
- 英文模板：`.copilot/skills/_pr-creator/references/pull_request_template.md`

### 版本检测规则

根据 [Conventional Commits](https://www.conventionalcommits.org/) 规范：
- **BREAKING CHANGE** 或 `!:` 前缀 → major 版本
- **feat:** 前缀 → minor 版本
- 其他（fix, refactor, docs, etc.） → patch 版本

### 脚本变量

| 变量 | 用途 | 示例 |
|------|------|------|
| `PR_BRANCH` | 当前分支 | `feat/my-feature` |
| `PR_TITLE_AI` | PR 标题 | `feat: 添加认证` |
| `PR_LANG` | 语言 | `zh-CN` 或 `en` |
| `VERSION_BUMP_AI` | 版本策略 | `major/minor/patch/skip` |
| `CURRENT_VERSION` | 当前版本 | `0.6.4` |
| `NEW_VERSION` | 新版本 | `0.7.0` |
| `VERSION_FILE` | 版本文件 | `package.json` |
| `DRY_RUN` | 预览模式 | `true/false` |

---

## 🎖️ 技能签名指导

PR 描述末尾应包含：

```markdown
---

**PR Tool**: _pr-creator Skill
```

---

## 🔄 改进建议

- 增加脚本的自动清理临时文件步骤
- 在脚本中自动检测并提示 rebase
- 支持自动识别版本文件（package.json / manifest.json）
- 添加提交分析功能到脚本中（自动检测版本策略）

---

## 💡 使用示例

### 示例 1：创建新功能 PR

```python
# AI 分析提交
commits = ["feat: add user profile", "feat: add settings page"]
# → 建议 minor 版本

# 生成 PR 描述
create_file(
  filePath=".github/pr-description.tmp",
  content="""## 概述
添加用户配置功能模块

## 变更内容
- 新增用户资料页面
- 新增设置页面

## 版本管理
- 当前版本: 0.6.4
- 建议提升: minor
- 最终决定: 0.7.0

## 测试
- [x] 单元测试通过
- [x] 手动验证完成

---

> 🤖 本 PR 由 _pr-creator 技能自动生成
"""
)

# 执行脚本
run_in_terminal(
  command="bash .copilot/skills/_pr-creator/scripts/create-pr.sh",
  env={
    "PR_BRANCH": "feat/user-profile",
    "PR_TITLE_AI": "feat: 添加用户配置功能",
    "PR_LANG": "zh-CN",
    "VERSION_BUMP_AI": "minor",
    "CURRENT_VERSION": "0.6.4",
    "NEW_VERSION": "0.7.0",
    "VERSION_FILE": "package.json"
  }
)
```

### 示例 2：修复 bug PR

```python
# AI 分析提交
commits = ["fix: resolve login issue"]
# → 建议 patch 版本

# 生成 PR 描述
create_file(
  filePath=".github/pr-description.tmp",
  content="""## Overview
Fix critical login bug

## Changes
- Fixed authentication token refresh issue
- Added error handling for edge cases

## Versioning
- Current version: 0.7.0
- Suggested bump: patch
- Final decision: 0.7.1

## Testing
- [x] Unit tests pass
- [x] Manual verification completed

---

> 🤖 This PR was generated by _pr-creator skill
"""
)

# 执行脚本
run_in_terminal(
  command="bash .copilot/skills/_pr-creator/scripts/create-pr.sh",
  env={
    "PR_BRANCH": "fix/login-bug",
    "PR_TITLE_AI": "fix: resolve login issue",
    "PR_LANG": "en",
    "VERSION_BUMP_AI": "patch",
    "CURRENT_VERSION": "0.7.0",
    "NEW_VERSION": "0.7.1",
    "VERSION_FILE": "package.json"
  }
)
```

### 示例 3：Dry-run 预览

```bash
# 预览而不实际执行
DRY_RUN=true \
PR_BRANCH="feat/test" \
PR_TITLE_AI="feat: test feature" \
PR_LANG="zh-CN" \
VERSION_BUMP_AI="minor" \
CURRENT_VERSION="0.7.0" \
NEW_VERSION="0.8.0" \
VERSION_FILE="package.json" \
bash .copilot/skills/_pr-creator/scripts/create-pr.sh
```
