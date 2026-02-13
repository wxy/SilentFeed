---
name: _release-process
description: 完整的发布流程技能。包括发布分支创建、测试检查、文档更新（多语言）、截图验证、Chrome Store 物料准备、PR 合并、GitHub Release 创建等全链路工作。
---

# _release-process

## 📌 技能描述

SilentFeed 完整的发布工作流程，从发布前准备到 Chrome 商店上传的全生命周期管理。

**适用场景**：版本发布、新功能上线、Bug 修复发布

**学习来源**：SilentFeed 多次版本发布经验总结（v0.6.x → v0.7.x）

---

## 🎯 核心能力

| 能力 | 说明 |
|-----|------|
| **分支管理** | 创建发布分支、版本策略检测 |
| **质量检查** | 测试覆盖率验证、构建检查、Linting |
| **文档更新** | 多语言 README、CHANGELOG、USER_GUIDE 更新 |
| **物料准备** | 截图验证、Chrome Store 元数据准备 |
| **发布工作流** | PR 合并、GitHub Release 创建、版本标签 |
| **发布验证** | Release 验证、商店上传确认 |

---

## 🚀 发布流程（完整 7 步）

### 前置条件

- ✅ 所有功能开发已完成并已在 master 分支
- ✅ 代码已通过审查
- ✅ 测试通过，无编译错误
- ✅ 决定发布版本号（major/minor/patch）

### 第 1 步：发布前清理工作

在创建发布分支前，先清理过期文件和临时内容，确保发布的代码库干净：

#### 1.1) 清理过期文档和脚本

```bash
# 检查并删除过期的文档
ls docs/archive/  # 查看存档文件
rm -rf docs/archive/*  # 删除存档（如需）

# 检查并删除废弃的脚本
ls scripts/archive/  # 查看废弃脚本
rm -rf scripts/archive/*  # 删除废弃脚本（如需）

# 检查其他临时或过期文件
# 例如：docs/*.old, docs/*.tmp, *.bak 等
find . -name "*.bak" -o -name "*.tmp" -o -name "*.old" | xargs rm -f
```

**清理清单**：
- [ ] 查看 docs/ 中是否有过期或存档的文档
- [ ] 查看 scripts/archive/ 中是否有废弃脚本
- [ ] 删除任何临时文件（.bak、.tmp、.old）
- [ ] 检查是否有明显的"待删除"标记的文件

#### 1.2) 清理本地构建缓存

```bash
# 清理本地构建相关的临时文件（不影响后续 build）
rm -rf .plasmo  # Plasmo 缓存
rm -rf build/   # 旧的构建输出
rm -rf coverage/ # 旧的覆盖率报告
rm -rf node_modules/.vite  # Vite 缓存（可选）

# 确保 .gitignore 正确包含这些目录
cat .gitignore | grep -E "\.plasmo|build/|coverage/"
```

**说明**：
- 这些缓存会在下次 `npm run build` 或 `npm run test:coverage` 时自动重新生成
- 清理缓存确保发布前的构建是干净的

#### 1.3) 验证 .gitignore 配置

```bash
# 检查是否有本不应入库的文件被跟踪
git status --short

# 若有，添加到 .gitignore 后执行
git rm --cached <file>
git commit -m "chore: 从版本控制移除不应入库的文件"
```

**验证清单**：
- [ ] 工作区干净（git status 无未提交更改，或仅有发布准备的文件）
- [ ] 缓存目录在 .gitignore 中
- [ ] 临时文件不被版本控制跟踪

---

### 第 2 步：创建发布分支

```bash
# 从 master 创建发布分支
git checkout master
git pull origin master
git checkout -b release/v<VERSION>

# 示例：发布 v0.7.4
git checkout -b release/v0.7.4
```

**约定**：
- 发布分支命名：`release/v<VERSION>`（遵循语义化版本）
- 不在发布分支上进行功能开发，仅做发布前工作

---

### 第 3 步：测试检查与覆盖率验证

执行完整的测试与质量检查：

```bash
# 1. 运行完整测试
npm run test:run

# 2. 生成覆盖率报告
npm run test:coverage

# 3. 验证覆盖率达到要求
#    - 行覆盖率：≥ 70%
#    - 函数覆盖率：≥ 70%
#    - 分支覆盖率：≥ 60%

# 4. 构建检查
npm run build

# 5. 代码健康检查
npm run pre-push
```

**验证清单**：
- [ ] 所有测试通过（Test Files: all ✓）
- [ ] 覆盖率达到标准（查看 coverage/lcov-report/index.html）
- [ ] 构建成功（build/ 目录无错误）
- [ ] 无 TypeScript 编译错误
- [ ] 无 ESLint 警告

**若测试失败**：
- 提交修复至 master
- 重新基于 master 创建发布分支
- 返回第 1 步

---

### 第 4 步：更新文档（多语言）

需要更新的文档文件：

#### 3.1) CHANGELOG.md

```markdown
## [<VERSION>] - <DATE>

### Added
- （新功能列表）

### Changed
- （改进列表）

### Fixed
- （Bug 修复列表）

### Removed
- （移除功能列表）
```

**操作**：
- 在文件顶部添加新版本节点
- 按照 Keep a Changelog 格式组织
- 使用清晰的动词和链接

#### 3.2) README.md 和 README_CN.md

- 更新版本号引用（如有）
- 更新功能描述（如添加新功能）
- 更新屏幕截图引用（如有视觉变化）
- 更新安装指引（如有依赖变化）

**中英文对照检查**：
- [ ] README.md 内容准确
- [ ] README_CN.md 是中文版本且内容对应
- [ ] 两个版本的变更保持同步

#### 3.3) USER_GUIDE.md 和 USER_GUIDE_ZH.md

- 更新新增功能的使用说明
- 更新 UI 截图（如有界面变化）
- 更新快捷键、菜单项等（如有变化）
- 更新 FAQ 部分（如需）

#### 3.4) docs/ 目录中的其他文档

检查是否需要更新：
- `AI_ARCHITECTURE.md`
- `RECOMMENDATION_SYSTEM_*.md`
- 其他特定功能文档

**多语言更新原则**：
1. **中文优先更新**：主要文档先写中文版本
2. **英文同步更新**：确保英文版本内容对应
3. **术语一致性**：新引入的术语在两种语言版本中保持一致
4. **翻译审查**：重要更新由母语人士或 AI 翻译工具验证

---

### 第 5 步：检查和更新截图

#### 4.1) 截图变化评估

```bash
# 查看本版本的 UI 相关提交
git log --name-only --oneline release/v<VERSION>..master | \
  grep -E "(\.tsx|\.css|\.json)" | head -20
```

**判断标准**：
- UI 组件改动 → 需要更新相关截图
- 样式改动 → 需要检查视觉变化
- 功能移除 → 删除相关截图
- 纯逻辑改动 → 通常不需要更新截图

#### 4.2) 截图文件位置

参考 [docs/SCREENSHOT_PLAN.md](../../docs/SCREENSHOT_PLAN.md)：

| 序号 | 截图主题 | 英文文件 | 中文文件 | 尺寸 |
|-----|---------|---------|---------|------|
| 1 | AI 推荐界面 | screenshot-1-recommendations-en.png | screenshot-1-recommendations-zh.png | 1280×800 |
| 2 | RSS 设置 | screenshot-2-rss-settings-en.png | screenshot-2-rss-settings-zh.png | 1280×800 |
| 3 | 兴趣画像 | screenshot-3-profile-en.png | screenshot-3-profile-zh.png | 1280×800 |
| 4 | AI 配置 | screenshot-4-ai-config-en.png | screenshot-4-ai-config-zh.png | 1280×800 |
| 5 | 阅读列表 | screenshot-5-reading-list-en.png | screenshot-5-reading-list-zh.png | 1280×800 |

**更新流程**（如需）：
1. 使用最新扩展版本截图
2. 以 1280×800 或 640×400 尺寸保存
3. 添加文字说明或标注（可选）
4. 提交到 git

#### 4.3) 验证清单

- [ ] 所有截图尺寸正确（1280×800）
- [ ] 中英文截图内容一致
- [ ] 文字说明清晰可读
- [ ] 截图路径正确引用

**若无 UI 变化**：
- 添加注释：`# 本版本无截图变化`
- 保留原有截图不变

---

### 第 6 步：准备 Chrome Web Store 物料

#### 5.1) 元数据文件位置

```
项目根目录/
├── public/
│   ├── _locales/        ← i18n 多语言配置
│   ├── manifest.json    ← 扩展清单（版本号、权限等）
│   └── dnr-rules.json   ← 声明式网络请求规则
├── docs/
│   ├── SCREENSHOT_PLAN.md  ← 截图清单
│   └── USER_GUIDE*.md      ← 用户手册
└── build/
    └── chrome-mv3-prod/    ← 生产构建输出
```

#### 5.2) 需要检查/更新的物料

**manifest.json**：
```bash
# 检查版本号是否正确
cat public/manifest.json | grep '"version"'
```

- [ ] version 字段与 package.json 一致
- [ ] permissions 是否有变化
- [ ] 短描述（short_name）是否需要更新
- [ ] 图标路径是否正确

**manifest.json 多语言支持**：
```json
{
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "short_name": "__MSG_extName__"
}
```

- [ ] 所有用户可见文本都使用 `__MSG_*__` 占位符
- [ ] `public/_locales/zh-CN/messages.json` 中的键值正确
- [ ] `public/_locales/en/messages.json` 中的英文翻译准确

**public/_locales 多语言文件**：
```bash
# 检查是否有新的用户可见文本需要添加到翻译文件
ls -la public/_locales/*/
```

- [ ] zh-CN/messages.json 更新完整
- [ ] en/messages.json 更新完整
- [ ] 新增的 i18n key 在两个语言文件中都存在

#### 5.3) Chrome Store 信息检查清单

- [ ] **扩展名称**：是否需要更新（通常不变）
- [ ] **简短描述**（Short description）：≤ 132 字符
- [ ] **详细描述**（Detailed description）：≤ 4000 字符，需包含：
  - 功能概述
  - 主要特性列表
  - 隐私政策链接
  - 权限说明
- [ ] **版本号**：与 package.json 一致
- [ ] **语言**：支持中文（zh-CN）和英文
- [ ] **分类**：保持原有分类（如 Productivity）
- [ ] **图标**：各尺寸图标清晰可见
- [ ] **截图**：5 张中文 + 5 张英文
- [ ] **权限声明**：所有权限都有解释

---

### 第 7 步：创建 PR 并合并到主分支

#### 6.1) 在发布分支上进行最终提交

```bash
# 确认所有更新都已完成
git status

# 将所有文档和配置变更提交
git add .
git commit -m "chore(release): v<VERSION> 发布前准备

- 更新 CHANGELOG.md
- 更新多语言文档（README、USER_GUIDE）
- 验证 Chrome Store 物料
- 更新配置文件（manifest.json 等）"
```

**提交说明约定**：
- 使用 `chore(release)` 前缀
- 包含版本号
- 列出主要更新内容

#### 6.2) 使用 _pr-creator 创建 PR

```bash
# 使用标准"提交并 PR"流程
# AI 会根据 _pr-creator 技能自动：
# 1. 检查工作区状态
# 2. 完成提交（如需）
# 3. 分析提交决定版本策略
# 4. 创建 PR

# 或手动执行：
npm run pr
```

**PR 标题建议**：
```
release: v<VERSION> 发布前准备

例如：release: v0.7.4 发布前准备
```

**PR 描述应包含**：
- 新增功能列表
- 改进列表
- Bug 修复列表
- 截图变化说明（如有）
- Chrome Store 更新清单
- 发布清单（便于最终验证）

#### 6.3) PR 检查清单

在 PR 中添加以下验证确认：

```markdown
## 发布检查清单

### 代码质量
- [x] 所有测试通过
- [x] 覆盖率达到要求（≥70% 行覆盖率）
- [x] 构建成功，无错误

### 文档更新
- [x] CHANGELOG.md 已更新
- [x] README.md 已更新
- [x] README_CN.md 已更新
- [x] USER_GUIDE.md 已更新
- [x] USER_GUIDE_ZH.md 已更新

### Chrome Store 物料
- [x] manifest.json 版本号正确
- [x] _locales 多语言文件完整
- [x] 截图验证完成
- [x] 描述信息准确

### 版本管理
- [x] 版本号符合语义化规范
- [x] 分支命名规范（release/v<VERSION>）
```

#### 6.4) 分支合并

合并到 master 的两种方式：

**方式 1：通过 GitHub Web 界面（推荐）**
- 在 GitHub 上打开 PR
- 点击 "Squash and merge" 或 "Merge pull request"
- 确保 commit 说明清晰

**方式 2：本地合并（如需）**
```bash
git checkout master
git pull origin master
git merge --no-ff release/v<VERSION>
git push origin master
```

---

### 第 8 步：在主分支创建发布和相关物料

#### 7.1) 更新版本号（如未在第 6 步完成）

```bash
# 切换到 master
git checkout master

# 更新版本号
npm run version:patch  # 或 minor/major

# 此命令会自动：
# - 更新 package.json 版本
# - 创建版本更新的 commit
# - 创建 git tag
```

#### 7.2) 推送版本标签

```bash
# 推送所有提交和标签到远程
git push origin master --tags
```

#### 7.3) 验证 GitHub Release 自动创建

```bash
# GitHub Actions 会自动基于 tag 创建 Release
# 检查步骤：
```

1. 访问 GitHub 项目页面
2. 点击右侧 "Releases" 链接
3. 验证新版本的 Release 已创建
4. 检查 Release 描述是否从 CHANGELOG 正确提取

**若 Release 未自动创建**：
- 手动创建 Release：`gh release create v<VERSION> --generate-notes`
- 或在 GitHub Web 界面手动创建

#### 7.4) Chrome Web Store 上传（需手动操作）

Chrome Web Store 上传不支持自动化，需要手动进行：

```bash
# 1. 确保生产构建已生成
npm run build

# 2. 构建生成的扩展包位置
build/chrome-mv3-prod/

# 3. 上传流程：
#    a. 登录 Chrome Web Store Developer Dashboard
#       https://chrome.google.com/webstore/devconsole/
#    b. 点击你的扩展
#    c. 选择"程序包"标签页
#    d. 上传新的 .zip 文件（build/chrome-mv3-prod 打包）
#    e. 更新描述、截图、权限说明
#    f. 提交审查

# 4. Plasmo 提供的打包命令（可选）
npm run package
```

**上传清单**：
- [ ] 版本号在 Web Store 中正确显示
- [ ] 截图已上传（5 张英文 + 5 张中文）
- [ ] 描述信息完整且准确
- [ ] 权限声明清晰
- [ ] 隐私政策链接有效
- [ ] 已提交审查
- [ ] 等待 Google 审批（通常 1-3 天）

#### 7.5) 清理发布分支

```bash
# 删除本地发布分支
git branch -d release/v<VERSION>

# 删除远程发布分支（如已推送）
git push origin --delete release/v<VERSION>
```

---

### 第 9 步：清理工作（发布完成后）

#### 8.1) 清理临时文件

```bash
# 删除发布过程中生成的临时文件
rm -f .github/COMMIT_DESCRIPTION.local.md
rm -f .github/PR_DESCRIPTION.local.md
rm -f .github/RELEASE_NOTES.local.md

# 清理本地构建缓存（可选）
rm -rf .plasmo
rm -rf build/
```

**说明**：
- `.github/*.local.md` 文件是临时说明文件，不应入库
- 构建缓存会在下次 build 时自动重新生成

#### 8.2) 验证远程状态

```bash
# 确认 master 分支是最新的
git checkout master
git pull origin master

# 验证发布标签已推送
git tag -l | grep "v<VERSION>"

# 验证发布分支已删除
git branch -a | grep "release/v<VERSION>"  # 应该没有输出
```

**检查清单**：
- [ ] 本地和远程 master 分支已同步
- [ ] Git tag 已创建并推送（`git tag` 能看到新版本）
- [ ] 发布分支已完全删除（本地 + 远程）
- [ ] 临时说明文件已删除

#### 8.3) 验证发布完成

```bash
# 1. 检查 GitHub Release
gh release view v<VERSION>
# 或访问：https://github.com/wxy/SilentFeed/releases/tag/v<VERSION>

# 2. 检查 Chrome Web Store（需手动操作）
# 访问：https://chrome.google.com/webstore/detail/<EXTENSION_ID>
# 确认新版本已发布

# 3. 检查 NPM Package（如适用）
npm view silentfeed version
```

**发布验证清单**：
- [ ] GitHub Release 页面能正常访问
- [ ] Release 包含完整的变更说明（从 CHANGELOG 生成）
- [ ] Release 包含发布日期和版本号
- [ ] Chrome Web Store 已更新至新版本（需 24-48 小时）
- [ ] 用户反馈渠道已准备（如 Issue 讨论板）

#### 8.4) 发布后通知（可选）

若需要通知用户新版本发布：

```bash
# 选项 1：发布 GitHub Discussion（若启用）
# 在项目 Discussions 中创建主题，说明新版本的主要特性

# 选项 2：发送邮件通知（若有邮件列表）
# 发送发布公告邮件，包含 CHANGELOG 摘要

# 选项 3：社交媒体发布（若有）
# 在 Twitter、微博等分享新版本发布信息
```

---

## 📋 完整检查清单

### 发布前

- [ ] 在 master 分支，代码最新
- [ ] 所有特性分支已合并到 master
- [ ] 所有 PR 已审查通过

### 第 1 步：发布前清理工作

- [ ] 过期文档已清理
- [ ] 过期脚本已删除
- [ ] 构建缓存已清理（.plasmo、build/、coverage/）
- [ ] 工作区干净（git status 无多余文件）
- [ ] .gitignore 配置正确

### 第 2 步：创建发布分支

- [ ] 发布分支已创建：`release/v<VERSION>`
- [ ] 本地分支已切换到发布分支

### 第 3 步：测试检查

- [ ] 所有测试通过（npm run test:run）
- [ ] 覆盖率达到标准（npm run test:coverage）
- [ ] 构建成功（npm run build）
- [ ] pre-push 检查通过（npm run pre-push）

### 第 4 步：文档更新

- [ ] CHANGELOG.md 已更新，格式正确
- [ ] README.md 已更新
- [ ] README_CN.md 已更新
- [ ] USER_GUIDE.md 已更新
- [ ] USER_GUIDE_ZH.md 已更新
- [ ] 其他相关文档已审查

### 第 5 步：截图验证

- [ ] 检查是否需要更新截图
- [ ] 若需更新，截图已更新且尺寸正确（1280×800）
- [ ] 中英文截图内容一致

### 第 6 步：Chrome Store 物料

- [ ] manifest.json 版本号正确
- [ ] _locales 中文和英文文件完整
- [ ] 简短描述（≤132 字符）
- [ ] 详细描述（≤4000 字符）
- [ ] 权限声明完整

### 第 7 步：创建 PR

- [ ] PR 已创建，标题清晰
- [ ] PR 描述包含完整的变更说明
- [ ] PR 已通过审查
- [ ] PR 已合并到 master（或审查中）

### 第 8 步：GitHub Release

- [ ] 版本号已更新（npm run version:patch/minor/major）
- [ ] Git tag 已推送到远程
- [ ] GitHub Release 已自动创建或已手动创建
- [ ] Release 描述正确（从 CHANGELOG 提取或手动编写）

### 发布到 Chrome Store

- [ ] 生产构建已生成（npm run build）
- [ ] 扩展包已上传到 Chrome Web Store
- [ ] 店铺信息已更新（描述、截图、版本号）
- [ ] 已提交审查
- [ ] 待 Google 批准（通常 1-3 天）

### 第 9 步：清理工作

- [ ] 临时说明文件已删除（.github/*.local.md）
- [ ] 本地发布分支已删除
- [ ] 远程发布分支已删除
- [ ] master 分支已同步至远程
- [ ] GitHub Release 已验证并正确显示
- [ ] Chrome Web Store 版本已验证
- [ ] （可选）用户通知已发送

### 发布后

- [ ] 验证 Chrome Web Store 上新版本可用
- [ ] 监控用户反馈和 issue 报告
- [ ] 通知用户新版本发布（可选）

---

## 🔧 常见问题与故障排除

### 问题 1：测试失败或覆盖率不达标

**症状**：`npm run test:coverage` 覆盖率低于标准

**解决**：
1. 查看 coverage/lcov-report/index.html 找出低覆盖区域
2. 添加单元测试提高覆盖率
3. 重新运行测试
4. 若无法短期提高，在 PR 中说明原因

### 问题 2：文档更新遗漏

**症状**：发布后发现某份文档未更新

**解决**：
1. 在发布分支上添加补充提交
2. 重新创建/更新 PR
3. 若已合并，直接在 master 创建补充提交

### 问题 3：截图尺寸错误或内容过期

**症状**：Chrome Store 审批被拒，反馈截图问题

**解决**：
1. 重新生成正确尺寸的截图（1280×800）
2. 上传到 Chrome Web Store
3. 重新提交审查

### 问题 4：GitHub Release 未自动创建

**症状**：推送 tag 后，GitHub 没有自动创建 Release

**解决**：
```bash
# 手动创建 Release
gh release create v<VERSION> --generate-notes

# 或在 GitHub Web 界面手动创建
# https://github.com/wxy/SilentFeed/releases/new
```

### 问题 5：Chrome Store 上传失败

**症状**：上传 .zip 文件时报错

**解决**：
1. 确保 build/chrome-mv3-prod 存在且完整
2. 使用 `zip -r silentfeed-v<VERSION>.zip build/chrome-mv3-prod/*`
3. 检查 .zip 文件大小（通常 < 50MB）
4. 重新上传

---

## 💡 最佳实践

1. **尽早开始发布流程**：从创建发布分支开始，预留充足时间进行文档更新和测试
2. **分离关注点**：每个提交关注一个主题（文档、配置、物料等）
3. **多语言同步**：更新中文文档时同步更新英文版本
4. **充分测试**：发布前至少运行一次 `npm run pre-push`
5. **记录变更**：在 CHANGELOG 中清晰记录每个版本的变更，便于用户了解更新内容
6. **缓冲时间**：预留 1-2 天的缓冲时间，以便处理 Chrome Store 审批问题

---

## 🔗 相关技能和指令

- **_pr-creator**：PR 创建与版本控制
- **_git-commit**：提交规范
- **_code-health-check**：代码质量检查
- **copilot-instructions.md**：项目总体规范

