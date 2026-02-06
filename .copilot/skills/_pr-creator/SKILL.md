---
name: _pr-creator
description: PR 创建与版本控制流程技能。基于项目内脚本自动生成 PR，处理版本号、变基、推送与清理临时文件，避免常见失败。
---

# _pr-creator

## 📌 技能描述

- **用途**：使用项目内的 PR 创建脚本自动生成 PR，统一版本号变更与 PR 描述。
- **适用场景**：创建 PR、同步分支后更新 PR、需要小版本/补丁版本变更的 PR。
- **学习来源**：SilentFeed 项目 PR 创建流程与近期失败案例。

---

## ✅ 标准流程（8 步）

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

```bash
# 必须使用 create_file 生成
.github/pr-description.tmp
```

内容包含：PR 概要、主要变更、影响范围、验证、版本建议。

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
