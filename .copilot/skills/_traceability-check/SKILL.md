---
name: _traceability-check
description: 校验“说明内容 ↔ 实际变更文件”的一致性，避免描述遗漏或偏差。
---

# _traceability-check

## 目标
确保说明文档覆盖所有实际变更文件，并与变更内容一致。

## 适用范围
- 提交说明（COMMIT_DESCRIPTION.local.md）
- PR 描述（PR_DESCRIPTION.local.md）

## 必须遵循的流程
1. 获取已暂存文件列表：
   ```bash
   git diff --name-only --cached
   ```
2. 对照说明文档的“变更内容/文件变更概览”，确认每个文件都有对应描述。
3. 若有遗漏，补充说明后再提交/创建 PR。

## 检查清单
- [ ] 说明文档是否覆盖全部暂存文件？
- [ ] 说明内容与变更类型一致？
- [ ] 是否遗漏新增文件或关键改动？
