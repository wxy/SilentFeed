---
name: _change-summary
description: 自动汇总当前分支相对主分支的提交摘要，用于 PR/说明对齐。
---

# _change-summary

## 目标
为 PR/提交说明提供准确的提交摘要，避免遗漏主要变化。

## 适用范围
- 创建或更新 PR 描述
- 编写变更说明/变更摘要

## 必须遵循的流程
1. 生成提交摘要：
   ```bash
   git log --oneline origin/master..HEAD
   ```
2. 将摘要加入说明文档的“提交摘要”段落。
3. 若提交为空，写明“无新增提交”。

## 输出示例
```
## 提交摘要
- abc1234 feat(ui): 新增设置入口
- def5678 chore: 更新技能模板
```

## 检查清单
- [ ] 是否基于 `git log --oneline origin/master..HEAD` 生成？
- [ ] 是否已写入 PR/说明文档？
