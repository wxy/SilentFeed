<div align="center">

<img src="assets/icons/128/base-static.png" width="128" height="128" alt="Silent Feed Logo" />

# 🤫 Silent Feed

> 当前版本：`0.6.2`

**AI-powered RSS reader that learns what you love**

*让信息流安静下来 · Making the feed quieter*

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca)
[![GitHub Release](https://img.shields.io/github/v/release/wxy/SilentFeed?style=for-the-badge)](https://github.com/wxy/SilentFeed/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-green.svg?style=for-the-badge)](LICENSE)

![Test Coverage](https://img.shields.io/badge/coverage-69%25-brightgreen?style=for-the-badge)
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
- **🎯 AI Strategy Decision System** - Intelligent recommendation pool management with dynamic quality control
- **🔍 Auto RSS Discovery** - Finds RSS feeds from websites you visit, with complete Google Translate URL support
- **🎨 Visual Feed Management** - Colorful block progress bars showing article flow with semantic colors
- **📚 Read Later** - Save recommendations to Chrome's native reading list with one click
- **🌍 Feed-Level Translation** - Independent translation control for each RSS feed
- **🔒 Privacy First** - All data stays local, you control your API keys
- **⚡ Smart Engine Assignment** - Optimize cost by assigning different AI engines for different tasks (reduce costs by up to 95%)
- **📊 AI Usage Tracking** - Monitor API usage, tokens, and estimated costs
- **🌐 Bilingual** - Full support for English & 中文

### 📸 Screenshots

<div align="center">

<img src="docs/assets/screenshots/screenshot-1-recommendations-en.png" width="720" alt="AI Recommendations" />
<br/>
<em>AI-powered personalized recommendations with intelligent quality control</em>
<br/>

<img src="docs/assets/screenshots/screenshot-2-rss-settings-en.png" width="720" alt="RSS Settings with Translation" />
<br/>
<em>Visual feed management with colored blocks and feed-level translation control</em>
<br/>

<img src="docs/assets/screenshots/screenshot-3-profile-en.png" width="720" alt="Interest Profile" />
<br/>
<em>AI-generated interest summary and preference features</em>
<br/>

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

- **Version**: 0.5.1 (AI Strategy System & Visual Enhancements)
- **Status**: ✅ Released
- **Test Coverage**: 69%+ (2156 tests)
- **Commits since v0.3.6**: 158
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
- **🎯 AI 策略决策系统** - 智能推荐池管理，动态质量控制
- **🔍 自动发现订阅源** - 从你访问的网站发现 RSS，完整支持 Google 翻译链接
- **🎨 可视化源管理** - 彩色方块进度条，语义化颜色展示文章流
- **📚 稍后阅读** - 一键保存推荐到 Chrome 原生阅读列表
- **🌍 源级翻译设置** - 每个订阅源可独立控制翻译
- **🔒 隐私优先** - 数据本地存储，你掌控 API 密钥
- **⚡ 智能引擎分配** - 为不同任务分配不同 AI 引擎，优化成本（最高节省 95% 费用）
- **📊 AI 用量追踪** - 监控 API 使用量、Token 和预估费用
- **🌐 双语支持** - 完整支持 English & 中文

### 📸 截图

<div align="center">

<img src="docs/assets/screenshots/screenshot-1-recommendations-zh.png" width="720" alt="AI 推荐" />
<br/>
<em>AI 驱动的个性化推荐，智能质量控制</em>
<br/>

<img src="docs/assets/screenshots/screenshot-2-rss-settings-zh.png" width="720" alt="RSS 设置与翻译" />
<br/>
<em>彩色方块可视化源管理，源级翻译控制</em>
<br/>

<img src="docs/assets/screenshots/screenshot-3-profile-zh.png" width="720" alt="兴趣画像" />
<br/>
<em>AI 生成的兴趣总结和偏好特征</em>
<br/>

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

- **版本**: 0.6.2（清单模式优化与国际化增强）
- **状态**: ✅ 已发布
- **测试覆盖率**: 66%+
- **支持浏览器**: Chrome/Edge (Manifest V3)

**v0.6.x 主要更新**:
- 🔄 清单模式数据一致性修复（三层同步机制）
- 🌍 完整国际化支持（时间、字数、阅读时间）
- 📊 推荐池架构重构（移除单独的推荐表）
- 🤖 AI 生成的中文摘要优先显示
- 📈 全文抓取增强（字数和阅读时间）
- 🎯 短 ID 追踪机制提升清单管理

### 💬 社区与支持

- 🐛 [报告问题](https://github.com/wxy/SilentFeed/issues)
- 💡 [功能建议](https://github.com/wxy/SilentFeed/issues)
- ⭐ 如果觉得有用，[给个星标](https://github.com/wxy/SilentFeed)！

---

<div align="center">

**Made with ❤️ by Silent Feed Team**

[Website](https://github.com/wxy/SilentFeed) · [Report Bug](https://github.com/wxy/SilentFeed/issues) · [Request Feature](https://github.com/wxy/SilentFeed/issues)

</div>
