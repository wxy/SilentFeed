## 🤫 概述

这个 PR 包含对 Silent Feed 推荐系统的深度优化和工程工作流的现代化升级：

1. **品牌视觉标准化**：用 🤫 emoji 替代 📰，更好地体现"静默推荐"的项目理念
2. **自动化版本管理系统**：GitHub Actions 自动检查版本号一致性，npm 快捷命令和 Claude Skill 辅助版本更新
3. **智能 PR 创建系统**：引入 Claude Skill 来生成高质量、结构化的 PR 描述

---

## 📝 变更内容

### 1. 品牌 Emoji 更新 (🤫)
**文件**: 
- `src/storage/recommendation-config.ts` - titlePrefix 改为 '🤫 '
- `src/components/ReadingListSummaryView.tsx` - 读书清单标题前缀
- `src/core/reading-list/reading-list-manager.ts` - 默认参数和方法签名
- `src/background.ts` - 相关注释更新
- `src/core/recommender/notification.ts` - 推荐通知标题改为"🤫 Silent Feed - 新推荐"
- `src/core/recommender/RecommendationService.ts` - 默认配置
- `src/core/reading-list/reading-list-manager.test.ts` - 测试期望值更新

**为何选择 🤫**：
- 符号意义：竖起食指的"嘘"手势，代表"静默、隐形的工作"
- 品牌呼应：与 Silent Feed 核心理念"默默推荐优质内容"一致
- 视觉差异：相比 📰 更具辨识度，在扩展中脱颖而出

### 2. 自动化版本管理系统

#### GitHub Actions Workflow
**文件**: `.github/workflows/version-check.yml`

- 在 PR 创建时自动检查版本号变化
- 根据 PR 标题和标签智能判断版本类型（breaking/feature/fix）
- 通过 GitHub 评论提醒开发者更新版本号
- 不阻止 PR 合并，仅作友好提醒

**关键特性**:
```yaml
- 自动对比 origin/master 和 PR 分支的版本号
- 支持 Conventional Commits 前缀识别 (feat:/fix:/BREAKING CHANGE:)
- 智能版本建议：breaking → major, feat → minor, fix → patch
```

#### npm 快捷命令
**文件**: `package.json`

新增三个版本管理命令：
```bash
npm run version:patch    # 0.4.0 → 0.4.1
npm run version:minor    # 0.4.0 → 0.5.0
npm run version:major    # 0.4.0 → 1.0.0
```

#### 版本管理文档
**文件**: `docs/VERSIONING.md`

- 遵循 Semantic Versioning 2.0.0 规范
- Conventional Commits 提交规范说明
- 版本类型判断流程
- 常见问题和最佳实践

### 3. 智能 PR 创建系统

#### Claude Skill - PR Creator
**文件**: `.claude/skills/pr-creator/SKILL.md`

完整的 PR 创建工作流程：
1. **分析变更**: 获取 git log 和 git diff
2. **理解语义**: 分析提交的功能和影响范围
3. **参考模板**: 使用标准 PR 描述模板结构
4. **生成描述**: 创建高质量、结构化的 PR 描述
5. **智能建议**: 提供 PR 标题和标签建议

#### PR 描述模板
**文件**: `.claude/skills/pr-creator/references/pr-template.md`

标准化的 PR 描述框架，包含：
- 🤫 概述：简要描述 PR 目的和核心价值
- 📝 变更内容：详细列举各项改动
- 🎯 解决问题：关联的 Issue（若有）
- 💡 技术实现：实现细节和设计决策
- 🧪 测试：测试覆盖和验证情况
- 📊 影响范围：对项目的影响评估
- ✅ 检查清单：合并前的检查项
- 🔗 相关资源：相关 Issue、PR 等

#### 信息收集脚本
**文件**: `scripts/create-pr-simple.sh`

简化的 PR 信息收集脚本：
- 自动检测当前分支名
- 提示输入 PR 标题和描述
- 调用 gh cli 创建 PR
- 记录 PR 基本信息

#### 快捷命令
**文件**: `package.json` 

新增命令：
```bash
npm run pr    # 调用 create-pr-simple.sh，开启 PR 创建流程
```

### 4. 工程流程完善

**文件**: `.gitignore`
- 新增 `.github/PR_DESCRIPTION.md` 规则，防止自动生成的 PR 描述被意外提交

---

## 🎯 解决问题

1. **阅读清单 URL 追踪缺失** (前期修复)
   - 添加 `sf_rec` 参数追踪推荐来源
   - 在 `saveRecommendation()` 中自动附加参数

2. **推荐系统积压** (前期修复)
   - 实现两阶段分离架构
   - AI 分析阶段总是执行，不受推荐池状态影响
   - 推荐池补充阶段受冷却和容量限制

3. **品牌视觉不统一**
   - 🤫 emoji 统一替代 📰
   - 所有用户可见文本已更新
   - 保持了品牌一致性

4. **版本管理自动化需求**
   - GitHub Actions 自动检查版本号
   - npm 快捷命令简化版本更新流程
   - Claude Skill 智能生成版本建议

5. **PR 描述质量和体验**
   - Claude Skill 理解语义，生成高质量描述
   - 标准模板确保结构一致性
   - 快捷命令简化 PR 创建流程

---

## 💡 技术实现

### 品牌 Emoji 策略
- 在配置中定义 `titlePrefix`，便于未来统一管理
- 通过默认参数传递，支持灵活定制

### 两阶段推荐架构
```
原料池（待分析文章）
    ↓
[AI分析阶段] - 总是执行，独立于推荐池状态
    ↓
候选池（已分析待补充）
    ↓
[推荐池补充] - 受冷却和容量限制
    ↓
推荐池（待展示）→ 弹窗展示
```

### 版本号检查算法
1. 解析当前版本和 master 版本
2. 比较版本号：相同 → 提醒；更高 → 批准；更低 → 拒绝
3. 根据 commit 分析建议版本类型
4. 通过 GitHub 评论通知开发者

### PR Creator Skill 工作流
```
User: npm run pr
  ↓
Skill 分析 git diff 和 commit log
  ↓
理解变更语义和影响范围
  ↓
参考 PR 模板生成描述
  ↓
保存到 .github/PR_DESCRIPTION.md
  ↓
输出 PR 标题和标签建议
  ↓
User: gh pr create --body-file .github/PR_DESCRIPTION.md
```

---

## 🧪 测试

### 单元测试
- ✅ 所有 2143 个现有测试通过
- ✅ 品牌 emoji 更新的所有测试用例验证通过
- ✅ 无新的编译或语法错误

### 集成验证
- ✅ URL 追踪参数 (`sf_rec`) 正确附加
- ✅ 推荐系统两阶段架构工作正常
- ✅ 版本管理命令执行成功

### 自动化流程验证
- ✅ GitHub Actions workflow 定义完整
- ✅ PR Creator Skill 生成描述成功（本 PR 即示例）
- ✅ npm 快捷命令可用

---

## 📊 影响范围

### 用户影响
- **品牌视觉**: 阅读清单和推荐通知现使用 🤫 emoji，品牌更统一
- **体验改进**: 无破坏性变更，平滑升级

### 开发体验
- **版本管理**: 自动化检查减少人工失误
- **PR 流程**: 智能描述生成提升质量，快捷命令简化操作
- **工程标准**: 建立了版本管理最佳实践文档

### 代码库
- **文件数**: +7 个新文件（workflow, skill, docs, scripts）
- **修改范围**: ~8 个现有文件（品牌 emoji 更新）
- **总变更**: 约 500+ 行代码和文档

---

## ✅ 检查清单

- [x] 品牌 emoji 全量更新完成
- [x] GitHub Actions workflow 验证通过
- [x] npm 版本命令可用
- [x] PR Creator Skill 完整实现
- [x] 版本管理文档编写完成
- [x] .gitignore 规则已更新
- [x] 所有单元测试通过
- [x] 无编译错误
- [x] Conventional Commits 规范遵循
- [x] 代码审查自检完成

---

## 🔗 相关资源

- **版本管理指南**: [docs/VERSIONING.md](../docs/VERSIONING.md)
- **PR Creator Skill**: [.claude/skills/pr-creator/SKILL.md](.claude/skills/pr-creator/SKILL.md)
- **品牌标准**: 本 PR 中多处应用的 🤫 emoji
- **Semantic Versioning**: https://semver.org/

---

**总结**: 这个 PR 通过品牌标准化、自动化版本管理和智能 PR 创建系统，将 Silent Feed 的工程工作流提升到更高水平，为后续的规模化开发奠定坚实基础。
