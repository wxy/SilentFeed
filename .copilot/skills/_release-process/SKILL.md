---
name: _release-process
description: 完整的发布流程技能。包括发布分支创建、测试检查、文档更新（多语言）、截图验证、Chrome Store 物料准备、PR 创建（使用 _pr-creator 技能）、用户手工合并、GitHub Release 创建、构建压缩包等全链路工作。采用分支隔离策略，确保 master 分支稳定。
---

# _release-process

## 📌 技能描述

SilentFeed 完整的发布工作流程，从发布前准备到 Chrome 商店上传的全生命周期管理。强调流程规范化、技能集成化、物料完整化。

**适用场景**：版本发布、新功能上线、Bug 修复发布

**学习来源**：SilentFeed 多次版本发布经验总结（v0.6.x → v0.7.x）；已进化 v1 版本

**进化历史**：
- v0（初版）：基础 7 步发布流程
- v1（已实施）：分支隔离策略、10 步优化流程
- v2（当前）：技能集成、完整物料、用户手工合并、发布公告生成、文档/脚本归档

---

## 🎯 核心能力

| 能力 | 说明 |
|-----|------|
| **分支隔离** | Step 0-1：前置检查和发布分支创建，保持 master 稳定 |
| **清理与归档** | Step 2：清理过期文件、脚本归档、缓存清理，确保代码库干净 |
| **质量检查** | Step 3：测试覆盖率验证、构建检查、Linting |
| **文档更新** | Step 4：多语言 CHANGELOG、README、USER_GUIDE 更新 |
| **物料准备** | Step 5-6：截图验证、Chrome Store 元数据准备 |
| **规范化提交** | Step 7：使用 _git-commit、_pr-creator 技能规范化提交和 PR 创建 |
| **发布公告** | Step 7.5：生成发布公告（涵盖版本变更摘要） |
| **用户审核** | Step 7.6：用户手工审核 PR 和 CI，由用户决定合并时机 |
| **打包和发布** | Step 8：构建压缩包、版本更新、GitHub Release 创建 |
| **验证与清理** | Step 9：验证发布完成、清理临时文件和分支 |

---

## 🚀 发布流程（完整 10 步）

### 前置条件

- ✅ 所有功能开发已完成并已在 master 分支
- ✅ 代码已通过审查
- ✅ 测试通过，无编译错误
- ✅ 决定发布版本号（major/minor/patch）

### 第 0 步：前置检查（在 master 分支进行）

```bash
# 确保在 master 分支
git checkout master
git pull origin master

# 验证工作区干净
git status
# 应该显示：On branch master，working tree clean
```

**前置检查清单**：
- [ ] 在 master 分支上
- [ ] 工作区干净（无未提交更改）
- [ ] 本地 master 与远程同步

**为什么需要此步**：master 分支是发布的基线，所有发布工作基于此创建分支。确保状态干净可以避免意外合并无关内容。

---

### 第 1 步：创建发布分支

```bash
# 从 master 创建发布分支
git checkout -b release/v<VERSION>

# 示例：发布 v0.7.4
git checkout -b release/v0.7.4

# 验证分支创建成功
git branch
```

**约定**：
- 发布分支命名：`release/v<VERSION>`（遵循语义化版本）
- 所有后续步骤（第 2-8 步）都在该分支上进行
- 避免直接在 master 分支修改发布相关内容

**为什么采用分支隔离**：
- 保持 master 分支的稳定性和干净状态
- 所有发布前的工作（文档、配置、清理）都在独立分支上，便于回滚或调整
- PR 合并时能完整地追踪发布的变更历史

---

### 第 2 步：发布前清理工作（在发布分支上进行）

在创建发布分支前，先清理过期文件和临时内容，确保发布的代码库干净。此步仅在发布分支上执行，不影响 master：

#### 2.1) 清理过期文档和脚本

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

#### 2.2) 清理本地构建缓存

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

#### 2.3) 验证 .gitignore 配置

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

### 第 3 步：测试检查与覆盖率验证（在发布分支上进行）

执行完整的测试与质量检查。此步在发布分支上运行，不修改 master：

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

### 第 4 步：更新文档（多语言，在发布分支上进行）

需要更新的文档文件。所有文档修改都在发布分支上完成：

#### 4.1) CHANGELOG.md

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

#### 4.2) README.md 和 README_CN.md

- 更新版本号引用（如有）
- 更新功能描述（如添加新功能）
- 更新屏幕截图引用（如有视觉变化）
- 更新安装指引（如有依赖变化）

**中英文对照检查**：
- [ ] README.md 内容准确
- [ ] README_CN.md 是中文版本且内容对应
- [ ] 两个版本的变更保持同步

#### 4.3) USER_GUIDE.md 和 USER_GUIDE_ZH.md

- 更新新增功能的使用说明
- 更新 UI 截图（如有界面变化）
- 更新快捷键、菜单项等（如有变化）
- 更新 FAQ 部分（如需）

#### 4.4) docs/ 目录中的其他文档

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

### 第 5 步：检查和更新截图（在发布分支上进行）

#### 5.1) 截图变化评估

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

#### 5.2) 截图文件位置

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

#### 5.3) 验证清单

- [ ] 所有截图尺寸正确（1280×800）
- [ ] 中英文截图内容一致
- [ ] 文字说明清晰可读
- [ ] 截图路径正确引用

**若无 UI 变化**：
- 添加注释：`# 本版本无截图变化`
- 保留原有截图不变

---

### 第 6 步：准备 Chrome Web Store 物料（在发布分支上进行）

#### 6.1) 元数据文件位置

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

#### 6.2) 需要检查/更新的物料

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

#### 6.3) Chrome Store 信息检查清单

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

### 第 7 步：创建 PR（使用 _git-commit 和 _pr-creator 技能规范化）

在完成以上所有发布分支上的工作后，使用规范化的技能来创建 PR。

#### 7.1) 使用 _git-commit 技能进行最终提交

根据发布分支上已进行的所有变更，使用 _git-commit 技能进行规范提交：

**流程**：
1. 查看 `git status` 和 `git log master..release/v<VERSION>`，确认所有发布工作已完成
2. 创建 `.github/COMMIT_DESCRIPTION.local.md` 文件，说明所有改动汇总：
   - CHANGELOG.md 更新内容
   - 文档更新清单
   - 文件归档清单
   - Chrome Store 物料检查完成
3. 使用 `git add` 和 `git commit -F .github/COMMIT_DESCRIPTION.local.md` 进行提交
4. 删除临时说明文件
5. 推送发布分支

**示例提交说明**：
```
chore(release): v<VERSION> 发布前准备

- 更新 CHANGELOG.md（新增、改进、Bug 修复等）
- 更新多语言文档：README.md、README_CN.md、USER_GUIDE.md、USER_GUIDE_ZH.md
- 文档归档：移动 docs/ 中的临时和过期文档到 docs/archive/
- 脚本归档：清理 scripts/ 中的废弃脚本，归档至 scripts/archive/
- Chrome Store 物料检查：manifest.json、_locales、截图、描述验证完成
- 代码库清理：删除构建缓存、验证 .gitignore 配置

🤖 本提交由 _git-commit 技能生成
```

#### 7.2) 使用 _pr-creator 技能创建 PR

使用 _pr-creator 技能来规范化 PR 创建流程：

**流程**：
1. 确认在发布分支 `release/v<VERSION>` 上
2. 创建 `.github/PR_DESCRIPTION.local.md` 文件，包含：
   - **标题**：`release: v<VERSION> 发布前准备`
   - **变更说明**：从 CHANGELOG 提取的版本变更
   - **检查清单**：发布前必检项目
   - **后续步骤**：说明用户手工合并流程

**PR 描述示例**：
```markdown
# release: v<VERSION> 发布前准备

## 版本变更

### Added
- （如有新增功能）

### Changed
- （变更列表）

### Fixed
- （Bug 修复）

###Removed
- （移除功能）

### Chore
- 更新 CHANGELOG.md
- 文档和脚本归档
- 代码库清理

## 发布检查清单

### 代码质量
- [x] 所有测试通过（128 文件，2189+ 测试）
- [x] 覆盖率达标（≥70%）
- [x] 构建成功，无错误

### 文档更新
- [x] CHANGELOG.md 已更新
- [x] 多语言文档已更新（README、USER_GUIDE）
- [x] docs/ 和 scripts/ 已归档清理

### Chrome Store 物料
- [x] manifest.json 验证完成
- [x] _locales 多语言文件完整
- [x] 截图验证（如需更新）
- [x] 描述信息准确

## 合并说明

**重要**: 此 PR 需要：
1. ✅ CI 检查通过（GitHub Actions）
2. ✅ 手工代码审查（用户）
3. ✅ 用户确认后手工合并

请等待 CI 完成，审查变更后，在 GitHub Web 界面手工合并此 PR。
合并方式推荐使用 "Squash and merge"。
```

3. 推送发布分支并创建 PR（使用 `gh pr create` 或按照 _pr-creator 流程）

#### 7.3) PR 创建清单

- [ ] PR 标题清晰：`release: v<VERSION> 发布前准备`
- [ ] PR 描述完整，包含变更摘要和检查清单
- [ ] 发布分支已推送至远程
- [ ] PR 链接已获得（例如 #127）

#### 7.4) 等待 CI 和用户审核

**重要步骤**：
1. GitHub Actions CI 会自动运行（测试、构建等）
2. **不要自动合并**，等待 CI 完成
3. 用户审查 PR 变更和 CI 结果
4. 用户在 GitHub Web 界面手工合并（选择 "Squash and merge"）
5. 合并后，远程发布分支会自动删除

**验证清单**：
- [ ] 所有 CI 检查通过（✓）
- [ ] 审查无问题（用户确认）
- [ ] 选择合并方式（通常为 Squash and merge）
- [ ] PR 已合并，发布分支已删除

---

### 第 7.5 步：生成发布公告（可选但推荐）

生成一份用户友好的发布公告，可用于发布说明、邮件通知、社交媒体等。

#### 7.5.1) 自动提取版本变更

从 CHANGELOG.md 和 git log 提取本版本的主要变更：

```bash
# 查看本版本的 CHANGELOG 条目
grep -A 50 "^## \[<VERSION>\]" CHANGELOG.md | head -60

# 或查看 commit log 摘要
git log --oneline v<LAST_VERSION>..v<VERSION> | head -20
```

#### 7.5.2) 生成发布公告文档

创建发布公告（`.github/RELEASE_ANNOUNCEMENT.local.md`），包含：
- 版本号和发布日期
- 主要功能/改进
- Bug 修复
- 已知问题（如有）
- 升级建议
- 贡献者致谢（如适用）

**注意**：
- 创建大文件时使用相应的文件管理技能（如 create_file 工具）
- 保持语言风格一致（中文/英文）
- 突出用户关心的核心变更

#### 7.5.3) 用途

发布公告可用于：
- [ ] GitHub Release 说明（步骤 9 中添加）
- [ ] 用户邮件通知
- [ ] 社交媒体发布
- [ ] 项目网站更新

---

### 第 8 步：构建压缩包（Chrome Web Store 上传物料）

PR 合并后，准备可上传到 Chrome Web Store 的构建压缩包。

#### 8.1) 在发布分支或本地生成生产构建

```bash
# 确保在发布分支或已合并的 master 上
npm run build

# 验证生产构建输出
ls -lh build/chrome-mv3-prod/
```

#### 8.2) 打包为 ZIP 文件

```bash
# 切换到构建目录
cd build/

# 创建压缩包
zip -r ../silentfeed-v<VERSION>.zip chrome-mv3-prod/

# 验证压缩包
ls -lh ../silentfeed-v<VERSION>.zip

# 检查压缩包内容
unzip -l ../silentfeed-v<VERSION>.zip | head -20
```

**打包清单**：
- [ ] ZIP 文件已创建：`silentfeed-v<VERSION>.zip`
- [ ] 文件大小合理（通常 < 10MB）
- [ ] 包含所有必要文件（manifest、脚本、资源、i18n）
- [ ] 可以在本地解压验证

#### 8.3) 验证压缩包（可选但推荐）

```bash
# 解压到临时目录验证
mkdir -p /tmp/verify-v<VERSION>
unzip silentfeed-v<VERSION>.zip -d /tmp/verify-v<VERSION>/

# 检查关键文件存在
ls /tmp/verify-v<VERSION>/chrome-mv3-prod/manifest.json
ls /tmp/verify-v<VERSION>/chrome-mv3-prod/_locales/*/messages.json

# 清理临时目录
rm -rf /tmp/verify-v<VERSION>
```

**压缩包清单**：
- [ ] 压缩包内 manifest.json 存在且版本号正确
- [ ] _locales 中英文翻译文件完整
- [ ] 脚本和资源完整
- [ ] 文件结构正确（平级 chrome-mv3-prod/* 内容）

---

### 第 9 步：在主分支创建发布和相关物料

已注意：PR 已由用户手工合并到 master。现在在 master 分支上进行最终的版本更新和 GitHub Release 操作：

#### 9.1) 更新版本号（在 master 分支上进行）

PR 合并后，所有发布相关的工作都已在 master 分支上。现在进行最后的版本更新和 GitHub Release 操作：

#### 8.1) 更新版本号（在 master 分支上进行）

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

#### 8.2) 推送版本标签

```bash
# 推送所有提交和标签到远程
git push origin master --tags
```

#### 8.3) 验证 GitHub Release 自动创建

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

#### 8.4) Chrome Web Store 上传（需手动操作）

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

#### 8.5) 清理发布分支

```bash
# 删除本地发布分支
git branch -d release/v<VERSION>

# 删除远程发布分支（如已推送）
git push origin --delete release/v<VERSION>
```

---

### 第 9 步：清理工作（发布完成后）

验证发布完成，并清理发布过程中的临时文件和分支。

#### 9.1) 清理临时文件

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

#### 9.2) 验证远程状态

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

#### 9.3) 验证发布完成

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

#### 9.4) 发布后通知（可选）

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

### 第 0 步：前置检查（在 master 分支）

- [ ] 在 master 分支上
- [ ] 工作区干净（git status 无多余文件）
- [ ] 本地 master 与远程同步（git pull origin master）

### 第 1 步：创建发布分支

- [ ] 发布分支已创建：`release/v<VERSION>`
- [ ] 本地分支已切换到发布分支

### 第 2 步：发布前清理工作（在发布分支上）

- [ ] 过期文档已清理
- [ ] 过期脚本已删除
- [ ] 构建缓存已清理（.plasmo、build/、coverage/）
- [ ] 工作区干净（git status 无多余文件）
- [ ] .gitignore 配置正确

### 第 3 步：测试检查（在发布分支上）

- [ ] 所有测试通过（npm run test:run）
- [ ] 覆盖率达到标准（npm run test:coverage）
- [ ] 构建成功（npm run build）
- [ ] pre-push 检查通过（npm run pre-push）

### 第 4 步：文档更新（在发布分支上）

- [ ] CHANGELOG.md 已更新，格式正确
- [ ] README.md 已更新
- [ ] README_CN.md 已更新
- [ ] USER_GUIDE.md 已更新
- [ ] USER_GUIDE_ZH.md 已更新
- [ ] 其他相关文档已审查

### 第 5 步：截图验证（在发布分支上）

- [ ] 检查是否需要更新截图
- [ ] 若需更新，截图已更新且尺寸正确（1280×800）
- [ ] 中英文截图内容一致

### 第 6 步：Chrome Store 物料（在发布分支上）

- [ ] manifest.json 版本号正确
- [ ] _locales 中文和英文文件完整
- [ ] 简短描述（≤132 字符）
- [ ] 详细描述（≤4000 字符）
- [ ] 权限声明完整

### 第 7 步：创建 PR（发布分支 → master）

- [ ] PR 已创建，标题清晰
- [ ] PR 描述包含完整的变更说明
- [ ] PR 已通过审查
- [ ] PR 已合并到 master

### 第 8 步：GitHub Release（在 master 分支上）

- [ ] 版本号已更新（npm run version:patch/minor/major）
- [ ] Git tag 已推送到远程
- [ ] GitHub Release 已自动创建或已手动创建
- [ ] Release 描述正确（从 CHANGELOG 提取或手动编写）
- [ ] 生产构建已生成（npm run build）

### Chrome Store 上传

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

