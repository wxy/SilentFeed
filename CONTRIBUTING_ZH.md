# Silent Feed 贡献指南

> 📖 **English Contributing Guide**: [CONTRIBUTING.md](../CONTRIBUTING.md)

---

感谢你对 Silent Feed 项目的关注！

我们致力于提供友好和包容的环境，请在所有互动中保持尊重和建设性。

## 🚀 开始开发

### 前置条件

- Node.js 18+
- npm 9+
- Chrome 或 Edge 浏览器

### 设置开发环境

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/SilentFeed.git
cd SilentFeed

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 在 Chrome 中加载扩展
# - 打开 chrome://extensions/
# - 启用"开发者模式"
# - 点击"加载已解压的扩展程序"
# - 选择 build/chrome-mv3-dev 目录
```

详细说明请参考 [HOW_TO_LOAD_EXTENSION.md](docs/archive/HOW_TO_LOAD_EXTENSION.md)

## 🔄 开发流程

### 分支策略

- `master` - 生产就绪代码
- `feature/*` - 新功能
- `fix/*` - 问题修复
- `test/*` - 测试改进
- `docs/*` - 文档更新
- `chore/*` - 维护任务

### 工作流程

1. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **进行修改**
   - 编写代码
   - 添加测试
   - 更新文档

3. **运行测试**
   ```bash
   npm test                # 监听模式
   npm run test:run        # 运行一次
   npm run test:coverage   # 检查覆盖率
   ```

4. **推送前检查** (⚠️ **推送前必须执行**)
   ```bash
   npm run pre-push
   ```
   这会确保：
   - 所有测试通过（当前 2156 个测试）
   - 代码覆盖率达标（≥70% 行覆盖率，≥70% 函数覆盖率，≥60% 分支覆盖率）
     - 当前状态：语句 69%，分支 58.21%，函数 73.53%，行 69.11%
   - 生产构建成功
   
   > **注意**：v0.5.1 版本重构了多个核心模块，当前覆盖率为 69%，持续改进中

5. **提交变更**
   ```bash
   git add .
   git commit -m "feat: 你的功能描述"
   ```

6. **推送到你的 fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **创建 Pull Request**
   - 使用描述性标题
   - 包含详细说明
   - 引用相关 issue
   - 等待 CI 检查通过

## 📝 代码规范

### TypeScript

- 启用**严格模式**
- 所有函数必须有类型标注
- 禁止使用 `any` 类型（必要时使用 `unknown`）

### React

- 使用函数式组件和 Hooks
- 禁止使用 class 组件
- 遵循 Hooks 规则

### 命名规范

- **组件**: PascalCase (`ProfileBuilder`)
- **函数/变量**: camelCase (`getUserProfile`)
- **常量**: UPPER_SNAKE_CASE (`MAX_VISITS`)
- **文件**: kebab-case (`profile-builder.ts`)

### 注释

- **公共 API**: 必须有 JSDoc
- **复杂逻辑**: 用中文注释解释
- **避免无用注释**: 代码应该自解释

### 代码示例

```typescript
/**
 * 构建用户兴趣画像
 * @param visits - 用户访问记录
 * @returns 兴趣画像对象
 */
export function buildUserProfile(visits: PageVisit[]): UserProfile {
  // 过滤有效访问（停留时间 > 30s）
  const validVisits = visits.filter(v => v.duration > 30000)
  
  // 提取兴趣关键词
  const interests = extractInterests(validVisits)
  
  return {
    interests,
    timestamp: Date.now()
  }
}
```

## 🧪 测试要求

### 测试标准

- **覆盖率目标**: ≥70% 行覆盖率，≥70% 函数覆盖率，≥60% 分支覆盖率
- **当前状态**（v0.5.1）:
  - 测试数量: 2156 个测试全部通过 ✅
  - 语句覆盖率: 69%
  - 分支覆盖率: 58.21%
  - 函数覆盖率: 73.53%
  - 行覆盖率: 69.11%
- **新代码**: 必须包含测试
- **测试类型**:
  - 纯函数 → 单元测试
  - 类/模块 → 集成测试
  - React 组件 → 组件测试

> **v0.5.1 更新**：项目经历了大规模重构（AI 策略系统、内容脚本架构、存储层优化），覆盖率从 72.9% 降至 69%。我们正在逐步为新代码补充测试，欢迎贡献测试用例！

### 编写测试

```typescript
import { describe, it, expect } from 'vitest'
import { buildUserProfile } from './profile-builder'

describe('buildUserProfile', () => {
  it('应该过滤停留时间过短的访问', () => {
    const visits = [
      { url: 'https://example.com', duration: 10000 },  // 10s - 无效
      { url: 'https://example.com', duration: 60000 }   // 60s - 有效
    ]
    
    const profile = buildUserProfile(visits)
    
    expect(profile.interests.length).toBeGreaterThan(0)
  })
})
```

完整测试指南请参考 [TESTING.md](docs/TESTING.md)

## 📤 提交变更

### 提交信息格式

遵循[约定式提交](https://www.conventionalcommits.org/zh-hans/)：

```
<类型>: <描述>

[可选的正文]

[可选的脚注]
```

**类型**:
- `feat` - 新功能
- `fix` - Bug修复
- `test` - 添加/更新测试
- `docs` - 文档
- `style` - 代码格式
- `refactor` - 重构
- `perf` - 性能优化
- `chore` - 构建/工具变更

**示例**:

```bash
feat: 实现浏览历史收集功能

- 添加 content script 监听页面访问
- 过滤有效页面 (停留时间 > 30s)
- 存储到 IndexedDB

关联 issue: #12
```

### Pull Request 指南

1. **标题**: 清晰且描述性强
2. **描述**: 
   - 做了哪些变更
   - 为什么需要这些变更
   - 如何测试这些变更
3. **截图**: 包含 UI 变更的截图
4. **测试**: 确保所有测试通过
5. **文档**: 如有需要请更新

### PR 审查流程

1. **自动检查**:
   - 测试必须通过
   - 覆盖率要求满足
   - 构建成功

2. **代码审查**:
   - 至少需要一位维护者批准
   - 回应审查意见
   - 如有需要更新 PR

3. **合并**:
   - Squash 并合并到 master
   - 删除功能分支

## 📚 文档

### 何时更新文档

- 添加新功能
- 更改现有功能
- 修复重要 bug
- 改善用户体验

### 文档文件

- `README.md` - 项目概览（保持简洁）
- `docs/USER_GUIDE.md` - 面向用户的文档
- `docs/PRD.md` - 产品需求
- `docs/TDD.md` - 技术设计
- `docs/TESTING.md` - 测试指南
- `docs/I18N.md` - 国际化

### 编写文档

- **清晰简洁**: 避免行话
- **示例**: 包含代码示例
- **截图**: 添加可视化指南
- **双语**: 中文和英文

## 🌐 国际化

所有用户可见的文本必须国际化：

```typescript
import { useI18n } from "@/i18n/helpers"

function MyComponent() {
  const { _ } = useI18n()
  return <div>{_("popup.welcome")}</div>
}
```

详见 [I18N.md](docs/I18N.md)

## 🐛 报告 Bug

报告 bug 时，请包含：

1. **描述**: 发生了什么 vs. 期望发生什么
2. **复现步骤**: 详细的步骤
3. **环境**: 浏览器版本、操作系统、扩展版本
4. **截图/日志**: 如果适用
5. **建议修复**: 如果你有想法

## 💡 功能请求

我们欢迎功能请求！请：

1. **先搜索现有 issue**
2. **描述问题** 该功能将解决的问题
3. **提出解决方案** 如果你有的话
4. **考虑替代方案** 你思考过的

## 📞 获取帮助

- 📖 [用户指南](docs/USER_GUIDE_ZH.md)
- 🐛 [报告问题](https://github.com/wxy/SilentFeed/issues)
- 💬 [讨论区](https://github.com/wxy/SilentFeed/discussions)

## 🎉 致谢

贡献者将被认可于：
- README.md
- 发布说明
- 特别感谢部分

感谢你为 Silent Feed 做出贡献！🙏
