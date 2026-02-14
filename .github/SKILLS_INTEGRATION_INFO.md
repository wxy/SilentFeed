# 技能库集成信息

此项目已集成 **copilot-evolution-skills**（通用 AI 助手技能库）。

## 集成信息

- **集成日期**: 2026-02-14 16:57:44
- **版本号**: 1.0.0-beta
- **技能数量**: 12 个自定义技能
- **位置**: `.copilot/skills/`
- **源**: /Users/xingyuwang/develop/copilot-evolution-skills

## 集成内容

### 技能库 (skills/)
12 个自定义技能可供 AI 助手使用：

1. `_evolution-core` - 进化能力元技能
2. `_typescript-type-safety` - TypeScript Mock 创建与错误预防
3. `_git-commit` - Git 提交规范化
4. `_pr-creator` - PR 创建与版本控制流程
5. `_code-health-check` - 提交前代码检查
6. `_release-process` - 完整的发布流程
7. `_context-ack` - 上下文校验与输出格式
8. `_instruction-guard` - 强制读取指令文件
9. `_file-output-guard` - 文件创建安全约束
10. `_change-summary` - 提交摘要汇总
11. `_traceability-check` - 说明与变更校验
12. `_session-safety` - 会话超长防护

### 进化宪法 (constitution/)
通用 AI 进化框架，定义了 AI 助手的核心原则和行为规范。

### 项目指令
`.github/copilot-instructions.md` 已更新，通过 `<attachment>` 标签引用进化宪法。

## 使用方式

你的 AI 助手现在可以使用所有 12 个技能。具体用法请参考各技能的 SKILL.md 文件。

## 更新技能库

如果需要更新到最新版本，请运行：
```bash
bash .copilot/skills/scripts/update-integration.sh --backup
```

## 更多信息

- 项目仓库：https://github.com/YOUR_ORG/copilot-evolution-skills
- AI 集成指南：.copilot/skills/AI_INTEGRATION_INSTRUCTIONS.md
- 技能库 README：.copilot/skills/README.md

---

*此文件由集成脚本自动生成，请勿手动修改。*

