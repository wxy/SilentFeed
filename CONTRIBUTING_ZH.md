# Silent Feed 贡献指南

> ⚠️ **注意**: 本文档正在从原有的英文版本中翻译和扩展。
>
> 当前请参考 [CONTRIBUTING.md](CONTRIBUTING.md) 了解完整的贡献指南（英文）。
>
> 中文版本将在后续完成。

## 临时导航

请查看 CONTRIBUTING.md 文件中的以下部分（英文）：

- [Getting Started](CONTRIBUTING.md#getting-started) - 开始开发
- [Development Workflow](CONTRIBUTING.md#development-workflow) - 开发流程
- [Coding Standards](CONTRIBUTING.md#coding-standards) - 代码规范
- [Testing](CONTRIBUTING.md#testing) - 测试要求
- [Submitting Changes](CONTRIBUTING.md#submitting-changes) - 提交变更

## 快速参考

### 环境准备
```bash
# Node.js 18+, npm 9+
npm install
npm run dev
```

### 开发流程
1. Fork 仓库
2. 创建功能分支: `git checkout -b feature/xxx`
3. 编写代码和测试
4. 运行 `npm run pre-push` 确保测试通过
5. 提交并创建 PR

### 代码规范
- TypeScript 严格模式
- 函数式组件 + Hooks
- 测试覆盖率 ≥70%
- 中文注释
