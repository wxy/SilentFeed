# Silent Feed (静阅) - 中文文档

<div align="center">

**一个 AI 驱动的 RSS 阅读器，让你的信息流安静下来**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/wxy/SilentFeed)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Language](https://img.shields.io/badge/language-TypeScript-blue.svg)](https://www.typescriptlang.org/)

[English](README.en.md) | [返回主页](README.md)

</div>

---

## 目录

- [📖 项目简介](#-项目简介)
- [✨ 核心功能](#-核心功能)
- [🎯 为什么选择 Silent Feed](#-为什么选择-silent-feed)
- [🚀 快速开始](#-快速开始)
- [📱 使用指南](#-使用指南)
- [🛠️ 技术架构](#️-技术架构)
- [🧪 测试](#-测试)
- [🤝 参与贡献](#-参与贡献)
- [📄 许可证](#-许可证)

---

## 📖 项目简介

Silent Feed（静阅）是一个创新的 RSS 阅读器浏览器扩展，它不同于传统的 RSS 阅读器。

### 核心理念

**不是让你管理 RSS，而是让 AI 作为你的"信息守门员"**

传统 RSS 阅读器的问题：
- 📚 订阅 50+ 源，每天新增 200+ 文章
- 😰 未读累积焦虑，一键"全部已读"又怕遗漏
- ⏱️ 没时间逐条浏览，推荐不准确
- 🔧 需要频繁维护标签和分类

Silent Feed 的解决方案：
- 🤫 **静默学习**：在后台自动分析你的浏览行为，无需任何设置
- 🎯 **智能过滤**：AI 自动筛选出 3-5 条你最感兴趣的内容
- 🔒 **隐私优先**：所有分析默认在本地进行
- 🌱 **渐进成长**：100 页面冷启动，逐步了解你的兴趣

### 命名含义

- **Silent**（静默）：不打扰，在后台默默工作
- **Feed**（信息流）：RSS 订阅源
- **静阅**：安静地阅读，克制的信息消费

---

## ✨ 核心功能

### 1. 🤫 自动浏览行为分析

**无需任何设置，自动学习你的兴趣**

- 自动收集浏览历史（隐私保护模式）
- 智能过滤有效页面（停留时间 > 30秒）
- 使用 TF-IDF 辅助 AI 提取关键特征
- 构建本地化的用户兴趣画像

<details>
<summary>📊 画像构建细节</summary>

Silent Feed 会分析以下维度：
- **主题分类**：11 个主题（技术、科学、商业、艺术等）
- **关键词提取**：使用 TF-IDF 算法
- **行为权重**：停留时间、访问频率
- **隐私保护**：敏感域名自动过滤（银行、医疗等）

</details>

### 2. 🎯 AI 智能推荐

**只推送你真正感兴趣的内容**

- **多种 AI 引擎**：
  - 🤖 DeepSeek Chat（成本低，效果好）
  - 👽 DeepSeek Reasoner（深度推理模式）
  - ⚙️ 本地 AI（自行部署兼容 ChatGPT API 的服务）
  - ⚙️ 更多引擎即将支持（OpenAI, Anthropic）

- **推荐策略**：
  - 每次推荐 3-5 条内容
  - 根据用户画像和文章内容匹配
  - 支持推荐分数可视化
  - 推荐理由详细说明

<details>
<summary>💡 AI 成本控制</summary>

Silent Feed 提供透明的成本控制：
- **DeepSeek Chat**：¥0.001/篇 （推荐）
- **DeepSeek Reasoner**：¥0.01/篇 （深度推理）
- **本地 AI**：完全免费（需自行部署）

你可以：
- 查看实时 AI 成本统计
- 设置每日/每月预算
- 随时切换推荐引擎</details>

### 3. 📡 RSS 自动发现和管理

**智能的 RSS 订阅体验**

- 🔍 自动检测当前页面的 RSS 源
- ⚡ 一键订阅（支持快速添加）
- 📥 批量导入（OPML 文件）
- 🎯 文章质量评分
- ⏰ 智能抓取调度

<details>
<summary>🔧 RSS 管理功能</summary>

- **自动调度**：根据更新频率智能调整抓取间隔
- **质量评分**：评估文章质量（标题、摘要、内容完整性）
- **错误处理**：自动重试失败的抓取
- **数据统计**：订阅源分析、文章趋势
- **OPML 支持**：导入/导出订阅列表

</details>

### 4. 🔔 克制的通知

**只在有价值时才提醒你**

- 智能判断通知时机
- 避免频繁打扰
- 可自定义通知规则
- 桌面通知 + 扩展图标提示

### 5. 🌱 游戏化体验

**让兴趣成长可视化**

- 📊 100 页面冷启动倒计数
- 🎯 兴趣画像可视化
- 📈 数据收集进度
- 🏆 成就系统（规划中）

---

## 🎯 为什么选择 Silent Feed

### 对比传统 RSS 阅读器

| 特性 | 传统 RSS 阅读器 | Silent Feed |
|------|----------------|-------------|
| **信息过滤** | ❌ 手动分类和过滤 | ✅ AI 自动筛选 |
| **个性化** | ❌ 基于用户设置 | ✅ 基于实际行为 |
| **交互模式** | ❌ 主动打开查看 | ✅ 被动等待提醒 |
| **学习成本** | ❌ 需要配置管理 | ✅ 零配置自动学习 |
| **信息负担** | ❌ 未读累积焦虑 | ✅ 只看重要内容 |
| **隐私保护** | ⚠️ 数据上传到服务器 | ✅ 本地处理/自有 API |

### 适用场景

✅ **适合你，如果你：**
- 订阅了大量 RSS 源（50+）
- 没时间查看所有内容
- 希望 AI 帮你过滤信息
- 关注隐私保护
- 喜欢自动化工具

❌ **可能不适合，如果你：**
- 只订阅 1-2 个源
- 喜欢手动管理每条内容
- 不信任 AI 推荐
- 不想收集浏览数据

---

## 🚀 快速开始

### 用户安装（推荐）

> ⚠️ **注意**：扩展即将上线 Chrome Web Store，目前可通过开发者模式安装

#### 方式 1：从 Chrome Web Store 安装（即将上线）

1. 访问 Chrome Web Store
2. 搜索 "Silent Feed"
3. 点击"添加至 Chrome"
4. 完成引导流程

#### 方式 2：开发者模式安装（当前）

1. **下载最新版本**
   ```bash
   # 从 GitHub Releases 下载
   wget https://github.com/wxy/SilentFeed/releases/latest/download/silentfeed.zip
   unzip silentfeed.zip
   ```

2. **加载扩展**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择解压后的目录

3. **开始使用**
   - 点击扩展图标
   - 完成引导流程（可选配置 AI）
   - 正常浏览网页
   - 100 页面后开始推荐

详细使用教程见 [用户手册](docs/USER_GUIDE.md)

---

### 开发者安装

#### 系统要求

- **Node.js**: ≥ 18.0.0
- **npm**: ≥ 9.0.0
- **Chrome**: ≥ 121

#### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/wxy/SilentFeed.git
cd SilentFeed

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

#### 加载扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `build/chrome-mv3-dev` 目录

#### 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 打包扩展
npm run package

# 国际化翻译
npm run i18n:translate
```

---

## 📱 使用指南

### 首次使用

1. **安装扩展**后，会自动打开引导页面

2. **配置 AI（可选）**
   - 支持 DeepSeek / OpenAI / Anthropic
   - 可跳过，使用免费的规则引擎
   - 后续可在设置中配置

3. **正常浏览网页**
   - 扩展会在后台收集浏览数据
   - 进度可在弹窗中查看

4. **100 页面后**
   - 开始 AI 推荐
   - 点击扩展图标查看推荐

### 核心功能使用

#### 查看推荐

1. 点击扩展图标
2. 查看 AI 推荐的文章
3. 点击标题打开文章
4. 点击"不想读"跳过

#### 管理 RSS 订阅

1. 右键扩展图标 → "选项"
2. 进入"RSS 设置"标签
3. 添加/删除订阅源
4. 导入 OPML 文件

#### 查看兴趣画像

1. 打开设置页面
2. 进入"画像设置"标签
3. 查看主题分布
4. 查看关键词云图

#### 配置 AI

1. 打开设置页面
2. 进入"AI 配置"标签
3. 选择 AI 引擎
4. 输入 API Key
5. 测试连接

更多详细教程见 [用户手册](docs/USER_GUIDE.md)

---

## 🛠️ 技术架构

### 技术栈

#### 核心框架
- **Plasmo** 0.90.5 - Chrome Extension MV3 框架
- **TypeScript** 5.3 - 严格模式
- **React** 18.2 - 函数式组件 + Hooks

#### UI 层
- **Tailwind CSS** 3.4 - 样式框架
- **Zustand** 5.0 - 状态管理
- **i18next** 25.6 - 国际化

#### 数据层
- **Dexie.js** 4.2 - IndexedDB 封装
- **Chrome Storage API** - 配置存储

#### AI 层
- **OpenAI SDK** - GPT-4o / GPT-4o-mini
- **Anthropic SDK** - Claude 3.5
- **DeepSeek API** - DeepSeek Chat / Reasoner

#### 分析层
- **natural** 8.1 - NLP 处理
- **stopword** 3.1 - 停用词过滤
- **rss-parser** 3.13 - RSS 解析

#### 测试
- **Vitest** 4.0 - 测试框架
- **Testing Library** 16.3 - React 测试
- **Coverage**: 74% (行覆盖)

### 项目结构

```
SilentFeed/
├── src/
│   ├── background/              # Service Worker
│   │   ├── index.ts            # 后台主逻辑
│   │   ├── feed-scheduler.ts   # RSS 调度器
│   │   └── notification-scheduler.ts  # 通知调度
│   │
│   ├── contents/                # Content Scripts
│   │   └── page-tracker.ts     # 页面跟踪
│   │
│   ├── popup.tsx                # 弹窗入口
│   ├── options.tsx              # 设置页面入口
│   │
│   ├── components/              # React 组件
│   │   ├── OnboardingView.tsx  # 引导流程
│   │   ├── RecommendationView.tsx  # 推荐展示
│   │   ├── ColdStartView.tsx   # 冷启动倒计数
│   │   └── settings/           # 设置组件
│   │
│   ├── core/                    # 核心业务逻辑
│   │   ├── ai/                 # AI 适配器
│   │   │   ├── AICapabilityManager.ts  # AI 管理器
│   │   │   └── providers/      # AI 提供者
│   │   │       ├── DeepSeekProvider.ts
│   │   │       ├── OpenAIProvider.ts
│   │   │       └── KeywordProvider.ts
│   │   │
│   │   ├── profile/            # 用户画像
│   │   │   ├── ProfileBuilder.ts  # 画像构建
│   │   │   ├── TopicClassifier.ts # 主题分类
│   │   │   └── InterestSnapshotManager.ts  # 快照管理
│   │   │
│   │   ├── recommender/        # 推荐引擎
│   │   │   ├── RecommendationService.ts  # 推荐服务
│   │   │   ├── RuleBasedRecommender.ts   # 规则引擎
│   │   │   └── pipeline.ts     # 推荐流水线
│   │   │
│   │   ├── rss/                # RSS 管理
│   │   │   ├── RSSFetcher.ts   # RSS 抓取
│   │   │   ├── RSSValidator.ts # RSS 验证
│   │   │   ├── OPMLImporter.ts # OPML 导入
│   │   │   └── managers/
│   │   │       └── FeedManager.ts  # 源管理
│   │   │
│   │   ├── analyzer/           # 内容分析
│   │   │   └── TextAnalyzer.ts # 文本分析
│   │   │
│   │   └── tracker/            # 行为跟踪
│   │       └── DwellTimeCalculator.ts  # 停留时间
│   │
│   ├── storage/                 # 数据库
│   │   ├── db.ts               # Dexie 数据库定义
│   │   ├── ai-config.ts        # AI 配置存储
│   │   ├── ui-config.ts        # UI 配置存储
│   │   └── transactions.ts     # 事务辅助
│   │
│   ├── utils/                   # 工具函数
│   │   ├── logger.ts           # 日志工具
│   │   ├── error-handler.ts    # 错误处理
│   │   ├── IconManager.ts      # 图标管理
│   │   └── ...
│   │
│   └── i18n/                    # 国际化
│       ├── helpers.ts
│       └── locales/
│           ├── zh-CN/
│           └── en/
│
├── public/                      # 静态资源
│   ├── assets/icons/           # 图标资源
│   └── locales/                # 翻译文件
│
├── docs/                        # 文档
│   ├── PRD.md                  # 产品需求
│   ├── TDD.md                  # 技术设计
│   ├── TESTING.md              # 测试指南
│   ├── USER_GUIDE.md           # 用户手册
│   └── ...
│
└── tests/                       # 测试文件
```

### 数据库 Schema

使用 Dexie.js (IndexedDB)，主要表结构：

```typescript
// 1. visits - 浏览历史
{
  id: string,              // UUID
  url: string,            // 页面 URL
  title: string,          // 页面标题
  visitTime: number,      // 访问时间
  dwellTime: number,      // 停留时间 (秒)
  domain: string,         // 域名
  isValid: boolean        // 是否有效
}

// 2. profiles - 用户画像
{
  id: 'singleton',        // 单例
  topicScores: {},        // 主题分数
  keywords: Map,          // 关键词权重
  totalVisits: number,    // 总访问数
  validVisits: number,    // 有效访问数
  lastUpdated: number     // 最后更新时间
}

// 3. feeds - RSS 订阅源
{
  id: string,             // UUID
  url: string,            // 源 URL
  title: string,          // 源标题
  description: string,    // 描述
  lastFetched: number,    // 最后抓取时间
  fetchInterval: number   // 抓取间隔 (毫秒)
}

// 4. articles - RSS 文章
{
  id: string,             // UUID
  feedId: string,         // 所属源 ID
  title: string,          // 文章标题
  link: string,           // 文章链接
  summary: string,        // 摘要
  content: string,        // 内容
  pubDate: number,        // 发布时间
  analyzedAt: number,     // 分析时间
  qualityScore: number    // 质量分数 (0-1)
}

// 5. recommendations - 推荐记录
{
  id: string,             // UUID
  articleId: string,      // 文章 ID
  profileId: string,      // 画像 ID
  score: number,          // 推荐分数 (0-1)
  reason: string,         // 推荐理由
  engine: string,         // 推荐引擎
  createdAt: number,      // 创建时间
  status: string          // 状态 (unread/read/disliked)
}
```

### 架构特点

1. **模块化设计**：核心逻辑与 UI 分离
2. **类型安全**：TypeScript 严格模式
3. **测试覆盖**：核心模块 70%+ 覆盖率
4. **性能优化**：虚拟滚动、懒加载、缓存
5. **隐私保护**：本地处理优先
6. **可扩展性**：插件化 AI 提供者

---

## 🧪 测试

### 运行测试

```bash
# 监听模式（开发时使用）
npm test

# 运行一次（CI/CD 使用）
npm run test:run

# 生成覆盖率报告
npm run test:coverage

# 可视化 UI
npm run test:ui
```

### 测试覆盖率

当前覆盖率（v0.1.0）：

```
Overall Coverage:
- Lines: 74.07%
- Functions: 75.33%
- Branches: 65.82%

Core Modules (>90%):
- ProfileBuilder
- TopicClassifier
- RSSFetcher
- TextAnalyzer
- DwellTimeCalculator
```

详见 [测试文档](docs/TESTING.md)

---

## 🤝 参与贡献

我们欢迎各种形式的贡献！

### 贡献方式

- 🐛 [报告 Bug](https://github.com/wxy/SilentFeed/issues)
- 💡 [提出新功能](https://github.com/wxy/SilentFeed/issues)
- 📖 改进文档
- 🔧 提交代码
- 🌍 翻译到其他语言

### 开发流程

1. **Fork 仓库**
2. **创建分支**: `git checkout -b feature/your-feature`
3. **开发功能**: 遵循代码规范
4. **编写测试**: 确保覆盖率达标
5. **提交代码**: `git commit -m "feat: your feature"`
6. **推送分支**: `git push origin feature/your-feature`
7. **创建 PR**: 描述你的改动

### 代码规范

- **TypeScript**: 严格模式
- **React**: 函数式组件 + Hooks
- **样式**: Tailwind CSS
- **测试**: ≥70% 覆盖率
- **提交**: 约定式提交 (Conventional Commits)
- **注释**: 中文注释，公共 API 需 JSDoc

详见 [贡献指南](CONTRIBUTING.md) 和 [开发文档](.github/copilot-instructions.md)

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。

你可以：
- ✅ 商业使用
- ✅ 修改代码
- ✅ 分发代码
- ✅ 私有使用

前提是：
- 📝 保留版权声明
- 📝 保留许可证文本

---

## 🙏 致谢

### 技术栈

- [Plasmo](https://www.plasmo.com/) - 强大的浏览器扩展框架
- [Dexie.js](https://dexie.org/) - 优雅的 IndexedDB 封装
- [React](https://reactjs.org/) - UI 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Vitest](https://vitest.dev/) - 测试框架

### 社区

- 所有提供反馈和测试的用户
- 所有贡献代码的开发者
- 所有 Star 本项目的朋友

---

<div align="center">

**Made with ❤️ by Silent Feed Team**

[⭐ Star on GitHub](https://github.com/wxy/SilentFeed) | [🐦 Follow Updates](https://twitter.com/silentfeed)

如果你觉得这个项目有用，请给我们一个 Star ⭐

</div>
