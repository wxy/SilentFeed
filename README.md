<div align="center">

<img src="assets/icons/128/base-static.png" width="128" height="128" alt="Silent Feed Logo" />

# 🤫 Silent Feed

> 当前版本：`0.3.1`

**AI-powered RSS reader that learns what you love**

*让信息流安静下来 · Making the feed quieter*

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca)
[![GitHub Release](https://img.shields.io/github/v/release/wxy/SilentFeed?style=for-the-badge)](https://github.com/wxy/SilentFeed/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=for-the-badge)](LICENSE)

![Test Coverage](https://img.shields.io/badge/coverage-72.7%25-brightgreen?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/wxy/SilentFeed?style=for-the-badge&color=yellow)
![Last Commit](https://img.shields.io/github/last-commit/wxy/SilentFeed?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-90%25-blue?style=for-the-badge&logo=typescript&logoColor=white)
![Issues](https://img.shields.io/github/issues/wxy/SilentFeed?style=for-the-badge)

[English](#english) | [中文](#中文)

---

</div>

## English

### 🎯 What is Silent Feed?

Silent Feed is a **browser extension** that uses AI to understand what you're interested in by analyzing your browsing history, then automatically discovers and recommends RSS articles that match your interests.

**No more information overload. Just the content you care about.**

### ✨ Key Features

- **🤖 AI-Powered Recommendations** - Understands your interests from browsing behavior, powered by AI-generated interest summaries
- **🔍 Auto RSS Discovery** - Finds RSS feeds from websites you visit
- **🎨 Clean Interface** - Minimal design for distraction-free reading
- **🔒 Privacy First** - All data stays local, you control your API keys
- **⚡ Smart Engine Assignment** - Optimize cost by assigning different AI engines for different tasks (reduce costs by up to 95%)
- **📊 AI Usage Tracking** - Monitor API usage, tokens, and estimated costs
- **📈 Recommendation Funnel** - Visualize content flow from RSS feeds to recommendations with conversion rates
- **🌐 Bilingual** - Full support for English & 中文

### 📸 Screenshots

<div align="center">

<img src="docs/assets/screenshots/screenshot-1-recommendations-en.png" width="600" alt="AI Recommendations" />

*AI-powered personalized recommendations*

<img src="docs/assets/screenshots/screenshot-3-profile-en.png" width="600" alt="Interest Profile" />

*Visual interest profile based on your reading habits*

</div>

### 🚀 Get Started

1. **Install** - [Chrome Web Store](https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca)
2. **Browse** - Visit websites you like (100+ pages recommended)
3. **Configure AI** - Choose your preferred option:
   - **Option 1**: [Install Ollama](docs/OLLAMA_SETUP_GUIDE.md) for free local AI (recommended)
   - **Option 2**: Add your OpenAI/Anthropic/DeepSeek API key
4. **Enjoy** - Get personalized RSS recommendations

### 📚 Learn More

- 📖 **[User Guide](docs/USER_GUIDE.md)** - Complete usage documentation for users
  - [中文版本](docs/USER_GUIDE_ZH.md)
- 🤝 **[Contributing Guide](CONTRIBUTING.md)** - Development guide for contributors
  - [中文版本](CONTRIBUTING_ZH.md)
- 🔐 [Privacy Policy](PRIVACY.md) - How we protect your data
- 💡 [Product Overview](docs/PRD.md) - Product philosophy and vision

### 🛠️ For Developers

```bash
# Clone repository
git clone https://github.com/wxy/SilentFeed.git
cd SilentFeed

# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test
```

See [Technical Documentation](docs/TDD.md) for architecture details.

### 📊 Project Status

- **Version**: 0.3.1 (Test Stability & Typing Fixes)
- **Status**: ✅ Released
- **Test Coverage**: 71%+
- **Supported**: Chrome/Edge (Manifest V3)

### 💬 Community & Support

- 🐛 [Report Issues](https://github.com/wxy/SilentFeed/issues)
- 💡 [Feature Requests](https://github.com/wxy/SilentFeed/issues)
- ⭐ [Star this repo](https://github.com/wxy/SilentFeed) if you find it useful!

---

## 中文

### 🎯 Silent Feed 是什么？

Silent Feed 是一个**浏览器扩展**，通过分析你的浏览历史，用 AI 理解你的兴趣，然后自动发现和推荐符合你兴趣的 RSS 文章。

**不再信息过载，只看你真正关心的内容。**

### ✨ 核心功能

- **🤖 AI 智能推荐** - 从浏览行为理解你的兴趣，基于 AI 生成的兴趣总结
- **🔍 自动发现订阅源** - 从你访问的网站发现 RSS
- **🎨 简洁界面** - 极简设计，专注阅读
- **🔒 隐私优先** - 数据本地存储，你掌控 API 密钥
- **⚡ 智能引擎分配** - 为不同任务分配不同 AI 引擎，优化成本（最高节省 95% 费用）
- **📊 AI 用量追踪** - 监控 API 使用量、Token 和预估费用
- **📈 推荐筛选漏斗** - 可视化从 RSS 文章到推荐的完整流程，包含转化率统计
- **🌐 双语支持** - 完整支持 English & 中文

### 📸 截图

<div align="center">

<img src="docs/assets/screenshots/screenshot-1-recommendations-cn.png" width="600" alt="AI 推荐" />

*AI 驱动的个性化推荐*

<img src="docs/assets/screenshots/screenshot-3-profile-cn.png" width="600" alt="兴趣画像" />

*基于阅读习惯的可视化兴趣画像*

</div>

### 🚀 快速开始

1. **安装扩展** - [Chrome 应用商店](https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca)
2. **浏览网页** - 访问你喜欢的网站（建议 100+ 页面）
3. **配置 AI** - 选择你喜欢的方式：
   - **方式一**：[安装 Ollama](docs/OLLAMA_SETUP_GUIDE.md) 获得免费本地 AI（推荐）
   - **方式二**：添加你的 OpenAI/Anthropic/DeepSeek API 密钥
4. **开始使用** - 获取个性化 RSS 推荐

### 📚 了解更多

- 📖 **[用户手册](docs/USER_GUIDE_ZH.md)** - 面向用户的完整使用文档
  - [English Version](docs/USER_GUIDE.md)
- 🤝 **[贡献指南](CONTRIBUTING_ZH.md)** - 面向开发者的开发指南
  - [English Version](CONTRIBUTING.md)
- 🔐 [隐私政策](PRIVACY.md) - 我们如何保护你的数据
- 💡 [产品概述](docs/PRD.md) - 产品理念和愿景

### 🛠️ 开发者

```bash
# 克隆仓库
git clone https://github.com/wxy/SilentFeed.git
cd SilentFeed

# 安装依赖
npm install

# 启动开发
npm run dev

# 运行测试
npm test
```

详见[技术文档](docs/TDD.md)了解架构细节。

### 📊 项目状态

- **版本**: 0.3.1（测试稳定与类型修复）
- **状态**: ✅ 已发布
- **测试覆盖率**: 71%+
- **支持浏览器**: Chrome/Edge (Manifest V3)

### 💬 社区与支持

- 🐛 [报告问题](https://github.com/wxy/SilentFeed/issues)
- 💡 [功能建议](https://github.com/wxy/SilentFeed/issues)
- ⭐ 如果觉得有用，[给个星标](https://github.com/wxy/SilentFeed)！

---

<div align="center">

**Made with ❤️ by Silent Feed Team**

[Website](https://github.com/wxy/SilentFeed) · [Report Bug](https://github.com/wxy/SilentFeed/issues) · [Request Feature](https://github.com/wxy/SilentFeed/issues)

</div>
