# 版本管理指南

## 自动化版本检查

本项目使用 GitHub Actions 自动检查 PR 的版本号更新。

### 工作流程

1. **创建 PR** → GitHub Actions 自动运行版本检查
2. **自动判断**：
   - 根据 PR 标签（`breaking`、`feature`、`fix`）
   - 根据 PR 标题（符合 Conventional Commits 规范）
   - 建议应该使用的版本类型
3. **提示评论**：如果版本号未更新，会在 PR 中添加评论提醒
4. **不阻止合并**：版本检查是提醒性质，不会阻止 PR 合并

### 版本号规则

遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)：

| 版本类型 | 格式 | 何时使用 | 示例 |
|---------|------|---------|------|
| **Patch** | `0.4.x` | Bug 修复、文档更新、小优化 | 0.4.0 → 0.4.1 |
| **Minor** | `0.x.0` | 新功能、向后兼容的改进 | 0.4.0 → 0.5.0 |
| **Major** | `x.0.0` | 破坏性变更、重大架构调整 | 0.4.0 → 1.0.0 |

### 如何更新版本？

#### 方法 1: 使用 npm version（推荐）

```bash
# Bug 修复
npm run version:patch

# 新功能
npm run version:minor

# 破坏性变更
npm run version:major
```

这会自动：
- 更新 `package.json` 中的版本号
- 创建一个版本更新的 commit
- 创建一个 Git tag

#### 方法 2: 手动编辑

直接编辑 `package.json` 中的 `version` 字段：

```json
{
  "version": "0.4.1"
}
```

### PR 标签建议

为了让自动检查更准确，建议为 PR 添加合适的标签：

- `fix` / `bugfix` → 建议 patch
- `feature` / `enhancement` → 建议 minor
- `breaking` / `major` → 建议 major

### Conventional Commits

PR 标题遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**类型示例**：
- `fix: 修复阅读清单删除问题` → patch
- `feat: 添加 AI 摘要功能` → minor
- `feat!: 重构推荐系统架构` → major
- `feat(api)!: 变更 API 接口` → major

### 版本发布流程

1. **开发阶段**：在功能分支上开发
2. **创建 PR**：提交到 master
3. **版本检查**：GitHub Actions 自动检查并提示
4. **更新版本**：根据提示更新版本号
5. **合并 PR**：合并后自动构建
6. **打包发布**：
   ```bash
   npm run build
   npm run package
   ```
7. **创建 Release**：在 GitHub 上创建 Release 并上传 zip 包

### 示例场景

#### 场景 1: 修复一个 Bug

```bash
# 1. 创建分支
git checkout -b fix/reading-list-bug

# 2. 修复代码并提交
git commit -m "fix: 修复阅读清单删除逻辑"

# 3. 更新版本
npm run version:patch  # 0.4.0 → 0.4.1

# 4. 推送
git push origin fix/reading-list-bug

# 5. 创建 PR
gh pr create --title "fix: 修复阅读清单删除逻辑"
```

#### 场景 2: 添加新功能

```bash
# 1. 创建分支
git checkout -b feature/ai-summary

# 2. 开发功能并提交
git commit -m "feat: 添加 AI 文章摘要功能"

# 3. 更新版本
npm run version:minor  # 0.4.0 → 0.5.0

# 4. 推送和创建 PR
git push origin feature/ai-summary
gh pr create --title "feat: 添加 AI 文章摘要功能" --label "feature"
```

#### 场景 3: 破坏性变更

```bash
# 1. 创建分支
git checkout -b refactor/api-v2

# 2. 重构代码
git commit -m "feat!: 重构推荐系统 API"

# 3. 更新版本
npm run version:major  # 0.4.0 → 1.0.0

# 4. 推送和创建 PR
git push origin refactor/api-v2
gh pr create --title "feat!: 重构推荐系统 API" --label "breaking"
```

## 注意事项

1. **不要跳过版本号**：按照 semver 规范递增
2. **PR 合并前更新**：确保 PR 合并前版本号已更新
3. **只在 master 打 tag**：版本 tag 只在 master 分支创建
4. **CHANGELOG 更新**：重要版本更新时更新 `CHANGELOG.md`

## 常见问题

**Q: 忘记更新版本号怎么办？**  
A: GitHub Actions 会在 PR 中自动提醒，按提示更新即可。

**Q: 如何撤销版本更新？**  
A: 使用 `git reset --hard HEAD~1` 撤销版本 commit，重新更新。

**Q: 多个 PR 同时开发怎么处理版本冲突？**  
A: 第一个合并的 PR 更新版本，后续 PR rebase master 后再更新版本。

**Q: 开发版本如何标记？**  
A: 可以使用预发布版本如 `0.5.0-beta.1`（手动编辑 package.json）。
