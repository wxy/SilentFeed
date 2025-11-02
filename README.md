# FeedAIMuter

<div align="center">

**The AI that reads RSS for you - intelligently muting the noise.**

*RSS 订阅源 + AI 智能 + 静音过滤 = 克制的信息管家*

[English](#english) | [中文](#中文)

</div>

---

## 中文

### 📖 项目简介

FeedAIMuter 是一个 AI 驱动的 RSS 阅读器浏览器扩展，它会自动学习你的浏览习惯，从海量 RSS 订阅中为你筛选出真正感兴趣的内容，并以克制的方式提醒你。

**核心理念**：
- 🤫 **静默学习**：在后台自动分析你的浏览行为，构建兴趣画像
- 🎯 **智能推荐**：只推送你真正感兴趣的内容，过滤信息噪音
- 🔒 **隐私优先**：所有分析在本地进行，或使用你自己的 AI API
- 🌱 **渐进式成长**：1000 页面冷启动，逐步了解你的兴趣

### ✨ 核心功能（MVP）

- ✅ **浏览历史收集**：隐私保护模式下收集浏览行为
- ✅ **用户画像构建**：基于 TF-IDF 和行为分析的本地画像
- ✅ **RSS 自动发现**：检测当前页面的 RSS 源并自动订阅
- ✅ **AI 智能推荐**：支持用户 API（OpenAI/Anthropic/DeepSeek）和 Chrome AI
- ✅ **克制的通知**：智能判断提醒时机，避免打扰
- ✅ **游戏化体验**：1000 页面倒计数，成长可视化

### 🛠️ 技术栈

```
框架：Plasmo (Chrome Extension MV3)
语言：TypeScript
UI：React 18 + Tailwind CSS
状态：Zustand
存储：Dexie.js (IndexedDB)
AI：用户 API / Chrome Built-in AI
分析：natural, stopword, rss-parser
```

### 🚀 快速开始

#### 1. 安装依赖

```bash
npm install
```

#### 2. 运行开发服务器

```bash
npm run dev
```

#### 3. 加载扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目中的 `build/chrome-mv3-dev` 目录

#### 4. 开始使用

- 安装后会提示配置 AI API（可选）
- 正常浏览网页，扩展会在后台学习你的兴趣
- 当收集 1000 个有效页面后开始推荐
- 点击扩展图标查看推荐内容

### 📁 项目结构

```
src/
├── background/          # Service Worker（后台任务）
├── popup/               # 弹窗 UI（React 组件）
├── content/             # Content Script（页面注入）
├── core/                # 核心业务逻辑
│   ├── ai/             # AI 适配器
│   ├── profile/        # 用户画像构建
│   ├── recommender/    # 推荐引擎
│   └── rss/            # RSS 管理
├── storage/             # 数据库和存储
├── components/          # React 组件
├── utils/               # 工具函数
└── style.css           # 全局样式（自适应明暗主题）
```

### 🔧 开发指南

#### 添加新功能

1. 在 `src/core` 中添加业务逻辑
2. 在 `src/components` 中创建 UI 组件
3. 在 `src/storage` 中定义数据模型
4. 使用 Zustand 管理状态

#### 代码规范

- 使用 TypeScript 严格模式
- 遵循 Prettier 格式化规则
- 组件使用 React Hooks
- 样式使用 Tailwind CSS

#### 构建生产版本

```bash
npm run build
```

生产包会生成在 `build/chrome-mv3-prod` 目录。

### 🎨 UI 设计原则

- **极简主义**：只显示必要信息
- **自适应主题**：自动跟随系统明暗模式
- **游戏化**：成就、倒计数、成长可视化
- **克制提醒**：智能判断通知时机

### 🔐 隐私保护

- ✅ 默认所有处理在本地完成
- ✅ 只有使用平台 AI 时才上传概率云数据
- ✅ 用户可配置域名黑名单
- ✅ 随时可删除所有历史数据
- ✅ 开源透明，可审计

### 📝 开发路线图

**MVP（1 个月）**
- [x] 项目初始化
- [ ] 浏览历史收集
- [ ] 用户画像构建
- [ ] RSS 自动发现
- [ ] 基础推荐引擎
- [ ] 弹窗 UI
- [ ] Chrome Web Store 发布

**V2（2-3 个月）**
- [ ] 云端 AI 服务
- [ ] 高级推荐算法
- [ ] 数据可视化仪表板
- [ ] 移动应用同步
- [ ] 团队协作功能

### 🤝 贡献

欢迎贡献！请先阅读 [贡献指南](CONTRIBUTING.md)。

### 📄 许可证

[MIT License](LICENSE)

---

## English

### 📖 About

FeedAIMuter is an AI-powered RSS reader browser extension that intelligently recommends content based on your browsing behavior, muting the information noise.

**Core Principles:**
- 🤫 **Silent Learning**: Automatically analyze browsing behavior in background
- 🎯 **Smart Recommendations**: Only notify truly interesting content
- 🔒 **Privacy First**: All analysis done locally or with your own AI API
- 🌱 **Progressive Growth**: 1000-page cold start to learn your interests

### ✨ Key Features (MVP)

- ✅ **Browsing History Collection**: Privacy-protected behavior tracking
- ✅ **User Profile Building**: TF-IDF and behavior-based local profiling
- ✅ **RSS Auto-discovery**: Detect and subscribe to RSS feeds automatically
- ✅ **AI Recommendations**: Support user APIs (OpenAI/Anthropic/DeepSeek) and Chrome AI
- ✅ **Restrained Notifications**: Smart timing to avoid interruptions
- ✅ **Gamification**: 1000-page countdown and growth visualization

### 🚀 Getting Started

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Run Development Server

```bash
npm run dev
```

#### 3. Load Extension

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `build/chrome-mv3-dev` directory

#### 4. Start Using

- Configure AI API after installation (optional)
- Browse normally, the extension learns in background
- After 1000 valid pages, recommendations begin
- Click extension icon to view recommendations

### 🛠️ Tech Stack

```
Framework: Plasmo (Chrome Extension MV3)
Language: TypeScript
UI: React 18 + Tailwind CSS
State: Zustand
Storage: Dexie.js (IndexedDB)
AI: User API / Chrome Built-in AI
Analysis: natural, stopword, rss-parser
```

### 📁 Project Structure

```
src/
├── background/          # Service Worker
├── popup/               # Popup UI (React)
├── content/             # Content Scripts
├── core/                # Core business logic
│   ├── ai/             # AI adapters
│   ├── profile/        # User profiling
│   ├── recommender/    # Recommendation engine
│   └── rss/            # RSS management
├── storage/             # Database and storage
├── components/          # React components
├── utils/               # Utility functions
└── style.css           # Global styles (auto dark/light)
```

### 📝 Development Roadmap

**MVP (1 month)**
- [x] Project initialization
- [ ] Browsing history collection
- [ ] User profile building
- [ ] RSS auto-discovery
- [ ] Basic recommendation engine
- [ ] Popup UI
- [ ] Chrome Web Store release

**V2 (2-3 months)**
- [ ] Cloud AI service
- [ ] Advanced recommendation algorithms
- [ ] Data visualization dashboard
- [ ] Mobile app sync
- [ ] Team collaboration features

### 🤝 Contributing

Contributions welcome! Please read [Contributing Guide](CONTRIBUTING.md) first.

### 📄 License

[MIT License](LICENSE)

---

<div align="center">

Made with ❤️ by the FeedAIMuter Team

**[Website](https://feedaimuter.com)** • **[Documentation](https://docs.feedaimuter.com)** • **[Discord](https://discord.gg/feedaimuter)**

</div>

