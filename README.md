<div align="center">

# 🤫 Silent Feed (静阅)

**An AI-powered RSS reader that brings you quiet, focused reading experience.**

*让信息流安静下来*

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/wxy/SilentFeed)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61dafb.svg)](https://reactjs.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/wxy/SilentFeed)
[![Test Coverage](https://img.shields.io/badge/coverage-74%25-yellow.svg)](https://github.com/wxy/SilentFeed)

[📖 中文文档](README.zh-CN.md) | [📖 English](README.en.md)

[🚀 快速开始](#快速开始) | [📚 用户手册](docs/USER_GUIDE.md) | [🤝 参与贡献](CONTRIBUTING.md)

---

</div>

## 🌟 核心特性

<table>
<tr>
<td width="50%">

### 🤫 静默学习
在后台自动分析你的浏览行为，构建个性化兴趣画像，**完全不打扰你的日常使用**。

</td>
<td width="50%">

### 🎯 AI 智能推荐
**AI 驱动**的个性化推荐，基于真实行为分析，只推送你**真正感兴趣**的内容，过滤 95% 的信息噪音。

</td>
</tr>
<tr>
<td width="50%">

### 🔒 隐私优先
**数据只保存在本地**，支持本地 AI 或自定义 AI 服务。使用远程 AI 时，数据隐私由提供商负责。

</td>
<td width="50%">

### 🌱 渐进成长
**100 页面冷启动**，逐步了解你的兴趣，成长可视化，让每一步都有意义。

</td>
</tr>
</table>

## 📸 预览

<div align="center">
<img src="docs/assets/screenshots/popup-recommendations.png" width="400" alt="推荐界面" />
<img src="docs/assets/screenshots/settings-profile.png" width="400" alt="设置界面" />
</div>

> 更多截图见 [用户手册](docs/USER_GUIDE.md#界面预览)

## 🚀 快速开始

### 安装扩展

**即将上线 Chrome Web Store**

安装后首次使用：

1. **配置 AI 服务**（必需）
   - 选择 AI 引擎（OpenAI / Anthropic / DeepSeek / 本地 AI）
   - 配置 API Key 或本地服务地址
   - 测试连接确保可用

2. **订阅 RSS 源**（可选）
   - 自动检测当前页面的 RSS 源
   - 或手动添加感兴趣的订阅源

3. **正常浏览网页**
   - 扩展会在后台学习你的兴趣
   - 100 页面后开始个性化推荐

详细使用说明见 [用户手册](docs/USER_GUIDE.md)

> **开发者**: 如需参与开发，请查看 [贡献指南](CONTRIBUTING.md)

## 🛠️ 技术栈

- **框架**: Plasmo (Chrome Extension MV3)
- **语言**: TypeScript (Strict Mode)
- **UI**: React 18 + Tailwind CSS
- **状态管理**: Zustand
- **数据库**: Dexie.js (IndexedDB)
- **AI**: OpenAI / Anthropic / DeepSeek / 本地 AI（必需）
- **测试**: Vitest + Testing Library
- **国际化**: i18next

## 📊 项目状态

| 指标 | 状态 |
|------|------|
| **MVP 功能** | ✅ 已完成 (100%) |
| **测试覆盖率** | 🟡 74% (行覆盖) |
| **国际化** | ✅ 中英文支持 |
| **文档完整度** | 🟡 进行中 |
| **发布状态** | 🚧 准备中 |

## 📝 开发路线图

- [x] **Phase 1-7**: MVP 核心功能
- [x] **Phase 8**: 国际化支持
- [x] **Phase 9**: Onboarding 引导流程
- [ ] **Phase 10**: 发布准备（文档、商店提交）
- [ ] **V1.0**: Chrome Web Store 发布

详见 [开发计划](docs/DEVELOPMENT_PLAN.md)

## 🤝 参与贡献

我们欢迎所有形式的贡献！

- 🐛 [报告 Bug](https://github.com/wxy/SilentFeed/issues)
- 💡 [提出新功能建议](https://github.com/wxy/SilentFeed/issues)
- 📖 改进文档
- 🔧 提交代码

详见 [贡献指南](CONTRIBUTING.md)

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

## 🙏 致谢

- [Plasmo](https://www.plasmo.com/) - 强大的浏览器扩展框架
- [Dexie.js](https://dexie.org/) - 优雅的 IndexedDB 封装
- 所有参与测试和反馈的用户

---

<div align="center">

**Made with ❤️ by Silent Feed Team**

[⭐ Star on GitHub](https://github.com/wxy/SilentFeed) | [🐛 Report Issues](https://github.com/wxy/SilentFeed/issues)

</div>
