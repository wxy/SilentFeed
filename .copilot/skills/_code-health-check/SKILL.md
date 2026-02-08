---
name: _code-health-check
description: 代码健康检查技能。在代码提交前进行全面的质量检查，包括 VSCode 错误面板、TypeScript 编译、Linting、测试覆盖率等。确保代码质量，防止隐蔽的故障。
---

# _code-health-check

## 📌 技能描述

- **用途**：在每次提交前，对代码进行系统性的健康检查，确保没有遗漏的错误、警告、类型问题。
- **适用场景**：完成文件编辑后、提交代码前、创建 PR 前。
- **学习来源**：SilentFeed 项目日常工作中发现的代码质量问题。

---

## 🔍 问题背景

### 常见现象

❌ **常见做法**：
1. 编辑文件，看到 VSCode 的红线/黄线
2. 不处理，直接提交
3. 等到测试运行或部署时才发现问题
4. 问题可能已经影响其他工作或引入隐蔽故障

**为什么会这样**：
- 急着完成工作，觉得"稍后再处理"
- 没有明确的检查流程和规范
- 不知道错误的严重程度
- 缺少"提交前强制检查"的意识

### 隐蔽性风险

- ⚠️ **TypeScript 类型错误**：可能导致运行时崩溃（特别是在生产环境）
- ⚠️ **Linting 警告**：积累后导致代码维护成本增加
- ⚠️ **测试覆盖不足**：新改动可能破坏现有功能
- ⚠️ **编译错误**：提交后才发现，浪费时间定位

---

## ✅ 执行流程（5 步）

### 1️⃣ 检查 VSCode 错误面板

打开 VSCode 的 **Problems** 面板（快捷键 `Cmd+Shift+M` 或点击底部栏）。

**检查项目**：

| 类型 | 处理方式 | 说明 |
|------|--------|------|
| **错误** (红) | ❌ 必须修复 | 代码将无法运行，不允许提交 |
| **警告** (黄) | ⚠️ 强烈建议修复 | 可能导致隐蔽问题，除非有充分理由，否则应修复 |
| **信息** (蓝) | ✅ 可选 | 代码风格建议，可根据团队规范决定 |

**示例**：

```
✅ Problems: 0 (OK - 可以继续)
⚠️ Problems: 3 warnings (需要检查是否应该修复)
❌ Problems: 2 errors + 5 warnings (必须修复所有错误)
```

### 2️⃣ TypeScript 编译检查

运行编译检查，确保没有类型错误：

```bash
npm run build
# 或者进行快速检查而不生成输出：
npx tsc --noEmit
```

**预期结果**：
```
✅ Found 0 errors in... (成功)
❌ error TS1234: ... (需要修复)
```

**常见 TypeScript 错误**：
- `TS2339`: 对象上不存在属性
- `TS2322`: 类型不兼容
- `TS7053`: 元素隐式具有 any 类型
- `TS2345`: 参数类型不兼容

### 3️⃣ Linting 检查

运行 ESLint 或其他 linter，检查代码风格和潜在问题：

```bash
npm run lint
# 或者仅检查修改的文件：
npm run lint -- --changed
```

**检查内容**：
- 未使用的变量/导入
- 风格不一致
- 潜在的逻辑错误
- 安全问题

**修复 linting 错误**：
```bash
npm run lint -- --fix
```

### 4️⃣ 测试覆盖率检查

运行测试并检查覆盖率：

```bash
npm run test:coverage
```

**检查项目**：

- 新增代码是否有对应的测试？
- 修改的代码是否有测试覆盖？
- 覆盖率是否达到项目标准（通常 ≥70%）？

**如果测试失败**：

```bash
# 以 watch 模式运行测试，逐个解决
npm run test
```

### 5️⃣ 整体健康评估

汇总所有检查结果：

| 检查项 | 状态 | 是否允许提交 |
|-------|------|----------|
| VSCode Problems | ✅ 0 errors | ✅ |
| TypeScript 编译 | ✅ 0 errors | ✅ |
| Linting | ✅ 0 errors | ✅ |
| 测试 | ✅ 所有通过 | ✅ |
| **整体** | **✅ 健康** | **✅ 可以提交** |

---

## 🧰 快速检查清单

提交前必须检查：

- [ ] **VSCode Problems 面板**是否有错误（红线）？
  - [ ] 如果有，是否都已修复？
- [ ] **TypeScript 编译**是否通过？
  - [ ] 运行 `npm run build` 是否成功？
- [ ] **Linting 检查**是否通过？
  - [ ] 运行 `npm run lint` 是否通过？
- [ ] **测试覆盖**是否满足标准？
  - [ ] 新代码是否有对应的测试？
  - [ ] 覆盖率是否 ≥70%？
- [ ] 所有检查都通过后，才能使用 _git-commit 技能创建提交

---

## 🚀 完整工作流示例

### 场景 1：编辑单个文件后

```bash
# 1. 编辑完成后，检查 VSCode Problems 面板 (Cmd+Shift+M)
# 2. 如果有错误，修复它们
# 3. 快速运行编译检查
npm run build

# 4. 运行 linting（可以自动修复）
npm run lint -- --fix

# 5. 确认修改相关的测试通过
npm run test -- src/path/to/changed/file.ts

# 6. 所有检查通过后，才使用 _git-commit 技能提交
```

### 场景 2：大型重构前

```bash
# 1. 完成主要代码改动
# 2. 检查 VSCode 错误面板
# 3. 运行完整的检查流程
npm run build
npm run lint -- --fix
npm run test:run

# 4. 如果测试覆盖率不足，补充测试
npm run test:coverage

# 5. 所有检查通过后才提交
```

### 场景 3：准备 PR 前

```bash
# 运行 pre-push 检查（项目提供的命令）
npm run pre-push

# 这通常包括：
# - 完整的 TypeScript 编译
# - 完整的 linting
# - 完整的测试套件
# - 覆盖率报告

# 如果 pre-push 全部通过，PR 可以安全地创建
```

---

## 💡 常见错误与修复

### 错误 1：忽视 VSCode 的黄线（警告）

**问题**：觉得"黄线不重要"就不处理

```typescript
// ❌ 不好：有 unused variable 警告
function processData(data: string, unused: string) {
  return data.toUpperCase();
}

// ✅ 好：移除或使用未使用的参数
function processData(data: string) {
  return data.toUpperCase();
}
```

**为什么重要**：
- 警告经常是隐蔽问题的信号
- 积累的警告会被误认为是合理的代码
- 新维护者会复制有警告的模式

### 错误 2：类型错误只在编译时才修复

**问题**：开发时看不到类型错误，提交后才运行编译

```typescript
// ❌ 不好：看起来没错，但 VSCode 没有提示（tsconfig 配置不当）
const result = someFunction(); // 返回类型是 string | null
result.toUpperCase(); // ❌ 编译时才报错：null 没有 toUpperCase

// ✅ 好：马上处理类型检查
const result = someFunction();
if (result) {
  result.toUpperCase();
}
```

**修复**：
```bash
# 定期运行 TypeScript 检查
npx tsc --noEmit

# 或在 VSCode 中启用 "TypeScript: Check JS" 选项
```

### 错误 3：不运行测试就提交

**问题**：假设"修改很小，不会破坏测试"

```typescript
// ❌ 不好：假设改动不影响现有功能
// 修改了 calculateScore 的逻辑，但没运行测试
function calculateScore(data: any) {
  return data.score * 1.1; // 改成 * 1.2
}

// ✅ 好：运行测试确认没有破坏现有功能
// npm run test 确认所有相关测试通过
```

---

## 🔗 与其他技能的关系

- **_git-commit**：代码质量检查通过后，使用此技能创建提交
- **_typescript-type-safety**：处理具体的 TypeScript 类型错误
- **_evolution-core**：当遇到新的代码质量问题时，沉淀为规范

**工作流顺序**：
```
编辑代码 
  ↓
_code-health-check 检查
  ├─ VSCode Problems
  ├─ TypeScript 编译
  ├─ Linting
  └─ 测试
  ↓
修复所有问题
  ↓
_git-commit 创建提交
```

---

## 🧠 最佳实践

### 1. 实时检查而非事后检查

**❌ 不好**：完成所有改动后才检查
**✅ 好**：每个文件编辑完后立即检查

### 2. 自动修复优先

```bash
# 很多工具可以自动修复
npm run lint -- --fix
prettier --write src/
```

### 3. CI/CD 作为最后防线

这个技能的检查是**本地开发阶段**的最后防线。CI/CD 会再次运行这些检查，但希望在本地就全部通过。

### 4. 渐进式修复

如果继承的代码有很多错误，不要一次修复全部：
- 优先修复当前改动相关的错误
- 逐步改进其他错误（可以在单独的 PR 中）

---

## 📚 参考资料

### 项目命令

```bash
npm run build          # TypeScript 编译
npm run lint           # ESLint 检查
npm run lint -- --fix  # 自动修复
npm run test           # 以 watch 模式运行测试
npm run test:run       # 运行一次测试
npm run test:coverage  # 生成覆盖率报告
npm run pre-push       # 提交前的完整检查
```

### VSCode 快捷键

- `Cmd+Shift+M`：打开 Problems 面板
- `Cmd+K Cmd+0`：折叠所有代码块
- `F8`：跳转到下一个错误/警告

### 相关技能

- `.copilot/skills/_git-commit/SKILL.md` - Git 提交规范
- `.copilot/skills/_typescript-type-safety/SKILL.md` - TypeScript 类型安全

---

## 🎖️ 技能签名指导

本技能提供的检查流程应该在使用 _git-commit 技能**之前**运行。

当创建提交时，应该注明提交已经通过 _code-health-check 的检查。这可以通过在 git log 中看到提交时间顺序来反映。

---

## 🔄 改进建议

- 未来可添加 Git Hooks 自动化这个检查流程（pre-commit hook）
- 可集成 GitHub Actions 作为 CI/CD 的补充检查
- 可添加性能检查（如打包大小、运行时性能）
- 可扩展为针对不同文件类型的特定检查
---

## 💡 与文件输出的关系

当发现需要生成大型文档或配置文件时，健康检查不仅要确保代码质量，还要确保**文件生成策略正确**：
- 预计内容 > 5KB 时，在生成前就计划分段写入，不要等到失败后补救
- 参考 `_file-output-guard` 和 `_session-safety` 的规则
- 大文件分段创建本身也是"代码健康"的一部分