---
name: _evolution-core
description: 进化能力元技能。用于识别可进化场景（重复错误、用户反馈、复杂工作流），并将经验沉淀为可复用技能或指令更新。
---

# _evolution-core

## 📌 技能描述
- **用途**：把“经验总结与改进”变成可执行流程。
- **适用场景**：出现重复错误、用户反馈指出偏差、某类任务反复耗时或高风险。
- **学习来源**：SilentFeed 项目进化宪法实践。

## 🔍 触发条件（任一命中即可触发）
1. **重复错误**：同类错误在同一会话或多个会话出现。
2. **用户反馈**：用户明确指出行为不符合预期。
3. **复杂工作流**：同类任务反复耗时/高风险/易错。

## ✅ 执行流程（6 步）
1. **识别**：用一句话描述问题与触发类型。
2. **归因**：找出根因（流程缺失/类型误解/工具使用不当）。
3. **抽象**：提炼为可复用规则或流程。
4. **落地**：
   - 若是通用规则 → 更新 `.github/copilot-instructions.md`（宪法/指南层）。
   - 若是可复用流程 → 创建或改进技能文件（`.copilot/skills/.../SKILL.md`）。
5. **登记**：
   - 在 `.github/copilot-instructions.md` 的"自定义技能库"表格中记录
   - 在 `AGENTS.md` 的 `<project_skills>` 部分添加技能定义（见下文）
6. **验证**：在后续工作中应用该改进，并确认问题不再复现。

## 🧭 输出决策
- **创建新技能**：当规则需要独立沉淀、可长期复用。
- **改进现有技能**：当问题是既有技能的缺口或变体。
- **更新指令**：当规则应成为“宪法级/指南级”行为规范。

## 🧰 快速检查清单
- [ ] 触发条件是否明确？（重复错误/用户反馈/复杂工作流）
- [ ] 根因是否可复用？
- [ ] 是否需要新技能？如果否，是否应更新指令？
- [ ] 是否已在技能表中登记？
- [ ] 是否完成后验验证？

## 💡 命名约定（建议）
- **项目自定义技能**统一加前缀 `_`，例如：`_evolution-core`。
- 前缀用于与 OpenSkills 官方技能区分。
- 如需按领域分类，可使用 `_evo-`、`_proj-` 等统一前缀策略。

## 📝 例子
**场景**：TypeScript mock 重复报错。
- 触发：重复错误
- 处理：创建 `_typescript-type-safety` 技能
- 登记：加入自定义技能表格 + AGENTS.md
- 验证：后续 mock 错误显著减少

---

## 🔧 技能维护指南

### 如何在 AGENTS.md 中注册新技能

当创建新的自定义技能后，需要在 `AGENTS.md` 中手动添加：

**位置**：`AGENTS.md` 的 `<project_skills>` 部分（在 `<!-- PROJECT_SKILLS_START -->` 和 `<!-- PROJECT_SKILLS_END -->` 之间）

**格式**：
```xml
<skill>
<name>_your-skill-name</name>
<description>技能的简要描述，说明用途、适用场景、核心能力</description>
<location>project</location>
<path>.copilot/skills/_your-skill-name/SKILL.md</path>
</skill>
```

**要点**：
- `<name>` 使用 `_` 前缀（区分自定义技能）
- `<description>` 简明扼要，突出核心价值
- `<location>` 固定为 `project`
- `<path>` 提供完整的相对路径

**为什么手动维护**：
- `.copilot/skills/` 不由 OpenSkills 管理
- `openskills sync` 只更新 `<available_skills>` 部分
- `<project_skills>` 部分是项目特定的，不会被覆盖

---

## 📚 参考资料

本技能是 SilentFeed 项目 AI 进化系统的一部分，相关文档：

### 核心文档
- `.github/copilot-instructions.md` - AI 系统进化宪法（根本法则）
- `.github/AI_EVOLUTION_SYSTEM.md` - 进化系统完整说明（架构与机制）
- `.github/COPILOT_CONSTITUTION.md` - 宪法框架的元文档（设计理念）

### 知识库
- `.github/type-error-patterns.md` - TypeScript 错误模式库（沉淀的错误模式）
- `.github/ERROR_ANALYSIS_SESSION.md` - 错误分析会话案例（历史记录）
- `.github/ARCHITECTURE_EVOLUTION.md` - 架构演进说明（转变历程）

### 文档与技能的关系
- **文档** = "为什么"和"是什么"（说明性、知识性）
- **技能** = "怎么做"（执行性、操作性）
- 技能引用文档，但不替代文档
- 文档在 `.github/`，技能在 `.copilot/skills/`

---

## 🔄 改进建议

- 目前技能路径固定为 `.copilot/skills/`，未来可考虑按领域分类
- 当技能数量增多时，可在 AGENTS.md 中按类别分组
- 考虑添加技能依赖关系声明（如某技能依赖另一技能）
