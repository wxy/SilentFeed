# Silent Feed User Guide · 用户手册

<div align="center">

**Silent Feed - An AI-powered RSS reader**

**Silent Feed - AI 驱动的 RSS 阅读器**

---

**Choose your language · 选择语言:**

[![English](https://img.shields.io/badge/English-blue?style=for-the-badge)](USER_GUIDE_EN.md)
[![中文](https://img.shields.io/badge/中文-red?style=for-the-badge)](USER_GUIDE_ZH.md)

---

</div>

## 📖 English Version

For the complete English user guide, please visit:
**[USER_GUIDE_EN.md](USER_GUIDE_EN.md)**

### Quick Links
- [Installation Guide](USER_GUIDE_EN.md#installation-guide)
- [Getting Started](USER_GUIDE_EN.md#getting-started)
- [Core Features](USER_GUIDE_EN.md#core-features)
- [Settings](USER_GUIDE_EN.md#settings)
- [FAQ](USER_GUIDE_EN.md#faq)

---

## 📖 中文版本

完整的中文用户手册，请访问：
**[USER_GUIDE_ZH.md](USER_GUIDE_ZH.md)**

### 快速链接
- [安装指南](USER_GUIDE_ZH.md#安装指南)
- [首次使用](USER_GUIDE_ZH.md#首次使用)
- [核心功能](USER_GUIDE_ZH.md#核心功能)
- [高级设置](USER_GUIDE_ZH.md#高级设置)
- [常见问题](USER_GUIDE_ZH.md#常见问题)

---

<div align="center">

**Need Help?**

[Report Issues](https://github.com/wxy/SilentFeed/issues) · 
[Discussions](https://github.com/wxy/SilentFeed/discussions)

</div>

### 📋 目录

1. [安装指南](#安装指南)
2. [首次使用](#首次使用)
3. [核心功能](#核心功能)
4. [高级设置](#高级设置)
5. [常见问题](#常见问题)
6. [隐私说明](#隐私说明)

---

### 安装指南

#### 方式 1：从 Chrome Web Store 安装（推荐）

1. 访问 [Silent Feed - Chrome Web Store](https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca)
2. 或在 Chrome Web Store 搜索 "Silent Feed"
3. 点击"添加至 Chrome"按钮
4. 确认权限请求
5. 安装完成后会自动打开引导页面

#### 方式 2：开发者模式安装（当前可用）

1. **下载扩展包**
   - 访问 [GitHub Releases](https://github.com/wxy/SilentFeed/releases)
   - 下载最新版本的 `chrome-mv3-prod-v0.1.0.zip`
   - 解压到任意目录

2. **加载到 Chrome**
   - 打开 Chrome 浏览器
   - 在地址栏输入 `chrome://extensions/` 并回车
   - 开启右上角的"开发者模式"开关
   - 点击"加载已解压的扩展程序"按钮
   - 选择刚才解压的目录

3. **验证安装**
   - 扩展图标应该出现在浏览器工具栏
   - 点击图标查看弹窗（初次使用会引导配置）

---

### 首次使用

#### 引导流程

安装完成后，扩展会自动打开引导页面，帮助你完成初始配置：

**步骤 1：欢迎页面**
- 了解 Silent Feed 的核心理念
- 查看主要功能介绍
- 点击"下一步"继续

**步骤 2：AI 配置**
- 选择 AI 提供商（OpenAI / Anthropic / DeepSeek）
- 输入你的 API Key
- 测试连接确保配置正确
- **注意**：AI 配置是推荐功能的必要条件

**步骤 3：RSS 订阅（可选）**
- 添加你喜欢的 RSS 源
- 导入 OPML 文件
- 快速添加示例源
- **或者稍后配置**

**步骤 4：完成**
- 开始正常浏览网页
- 扩展在后台收集数据
- 100 页面后开始推荐

#### 冷启动过程

Silent Feed 需要收集 **100 个有效页面访问** 才能建立完整的兴趣画像：

- **什么是有效页面？**
  - 停留时间 > 30 秒
  - 非敏感域名（排除银行、医疗等）
  - 包含足够的文本内容

- **查看进度**
  - 点击扩展图标
  - 查看倒计数：剩余 X 页面
  - 查看当前收集的数据统计

- **为什么需要 100 页面？**
  - 构建准确的兴趣画像
  - 识别主要兴趣主题
  - 提取关键词特征
  - 确保推荐质量

---

### 核心功能

#### 1. 查看推荐

**打开推荐界面**
- 点击扩展图标
- 或使用快捷键（可在设置中配置）

**推荐界面说明**
- 每次显示 3-5 条推荐
- 推荐分数：0-100%（越高越匹配）
- 推荐引擎：🧮 算法 / 🤖 AI / 👽 推理 AI
- 推荐理由：查看为什么推荐这篇文章

**文章操作**
- **阅读**：点击标题打开原文
- **不想读**：标记为"不感兴趣"，跳过这篇
- **稍后读**：（规划中）

#### 2. 管理 RSS 订阅

**打开设置页面**
1. 右键点击扩展图标
2. 选择"选项"
3. 进入"RSS 设置"标签

**添加订阅源**
- **方式 1**：输入 RSS 源 URL
- **方式 2**：在包含 RSS 的网页上点击扩展图标，自动检测
- **方式 3**：导入 OPML 文件

**管理订阅源**
- 查看所有订阅列表
- 查看订阅统计（文章数、抓取频率）
- 暂停/恢复订阅
- 删除订阅源

**OPML 导入/导出**
- 导入：从其他 RSS 阅读器迁移
- 导出：备份你的订阅列表

#### 3. 查看兴趣画像

**打开画像页面**
1. 进入设置页面
2. 选择"画像设置"标签

**画像信息**
- **主题分布**：11 个主题的兴趣分数
  - 技术、科学、商业、艺术、健康等
  - 饼图或柱状图可视化
- **关键词云图**：最常访问的关键词
- **浏览统计**：总页面数、有效页面数
- **更新时间**：最后更新时间

**画像操作**
- **重建画像**：基于当前数据重新分析
- **清空历史**：删除所有浏览数据（谨慎）

#### 4. 配置 AI

**AI 引擎选择**
- **DeepSeek Chat**（推荐）：成本低（¥0.001/篇），效果好
- **DeepSeek Reasoner**：深度推理模式，成本较高（¥0.01/篇）
- **本地 AI**：完全免费，自部署兼容 ChatGPT API 的服务
- **OpenAI**（即将支持）：GPT-4o / GPT-4o-mini
- **Anthropic**（即将支持）：Claude 3.5

**配置步骤**
1. 选择 AI 引擎
2. 输入 API Key
   - DeepSeek: 从 [platform.deepseek.com](https://platform.deepseek.com) 获取
   - OpenAI: 从 [platform.openai.com](https://platform.openai.com) 获取
3. 点击"测试连接"
4. 保存配置

**成本控制**
- 查看实时 AI 成本统计
- 查看每日/每月使用量
- 设置预算提醒（规划中）

---

### 高级设置

#### 偏好设置

- **自动翻译推荐**：将非界面语言的推荐翻译为界面语言
- **通知设置**：配置桌面通知规则
- **主题**：跟随系统 / 深色 / 浅色
- **语言**：中文 / English

#### 分析设置

- **推荐数量**：每次推荐的文章数（3-10）
- **分析引擎**：
  - 用于推荐：生成推荐时使用
  - 用于订阅源：分析 RSS 文章质量
- **更新频率**：RSS 抓取间隔

#### 数据管理

- **导出数据**：导出浏览历史、画像、订阅等
- **导入数据**：从备份恢复
- **清空数据**：删除所有数据（谨慎）

---

### 常见问题

#### Q: 为什么需要 100 页面才能开始推荐？

A: 构建准确的兴趣画像需要足够的数据样本。100 页面是经过测试的最小阈值，能确保推荐质量。你可以在设置中查看当前进度。

#### Q: 我的浏览数据安全吗？

A: 完全安全。所有数据默认只存储在你的浏览器本地（IndexedDB），不会上传到任何服务器。使用 AI 推荐时，只会发送必要的特征数据（关键词、主题分数），不包含 URL 或敏感信息。

#### Q: 可以使用免费的 AI 吗？

A: 可以。你可以自行部署本地 AI 服务（如 Ollama + LLaMA），只要兼容 ChatGPT API 格式即可。这样完全免费且隐私性更好。

#### Q: AI 推荐费用如何？

A: 以 DeepSeek Chat 为例，每篇文章约 ¥0.001，每天推荐 5 篇文章，月成本约 ¥0.15。你也可以使用本地 AI 服务完全免费。

#### Q: 如何导入其他 RSS 阅读器的订阅？

A: 大部分 RSS 阅读器支持导出 OPML 文件。导出后，在 Silent Feed 设置中导入即可。

#### Q: 推荐不准确怎么办？

A: 1) 确保已收集足够的浏览数据（>100 页）；2) 点击"不想读"帮助 AI 学习；3) 在设置中重建画像；4) 尝试不同的 AI 引擎。

#### Q: 如何卸载扩展？

A: 进入 `chrome://extensions/`，找到 Silent Feed，点击"移除"。所有本地数据将被删除。

---

### 隐私说明

#### 我们的承诺

- ✅ **本地优先**：所有分析默认在本地进行
- ✅ **数据掌控**：你完全控制数据的存储和删除
- ✅ **透明开源**：代码开源，可审计
- ✅ **最小权限**：只请求必要的权限

#### 收集的数据

**本地存储**（不上传）：
- 浏览历史（URL、标题、访问时间、停留时间）
- 用户画像（主题分数、关键词权重）
- RSS 订阅和文章
- 推荐记录

**使用 AI 时发送**（如使用 DeepSeek/OpenAI 等）：
- 用户画像特征（主题分数、关键词）
- 文章元数据（标题、摘要）
- **不包含**：浏览 URL、个人身份信息

#### 权限说明

- `tabs`：检测当前页面的 RSS 源
- `storage`：存储配置和数据
- `alarms`：定时抓取 RSS
- `notifications`：桌面通知
- `https://*/*`：抓取 RSS 内容

#### 数据删除

随时可以在设置中删除：
- 部分数据（如浏览历史）
- 完整数据（重置扩展）
- 卸载扩展（自动删除所有数据）

---

## English User Guide

### 📋 Table of Contents

1. [Installation](#installation)
2. [First Time Use](#first-time-use)
3. [Core Features](#core-features-en)
4. [Advanced Settings](#advanced-settings-en)
5. [FAQ](#faq)
6. [Privacy](#privacy)

---

### Installation

#### Method 1: From Chrome Web Store (Recommended)

> 🚧 **Coming Soon**: Extension is under review

1. Visit [Chrome Web Store](https://chrome.google.com/webstore)
2. Search for "Silent Feed"
3. Click "Add to Chrome"
4. Confirm permissions
5. Onboarding page opens automatically

#### Method 2: Developer Mode (Current)

1. **Download Extension Package**
   - Visit [GitHub Releases](https://github.com/wxy/SilentFeed/releases)
   - Download latest `silentfeed.zip`
   - Extract to any directory

2. **Load to Chrome**
   - Open Chrome browser
   - Enter `chrome://extensions/` in address bar
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select extracted directory

3. **Verify Installation**
   - Extension icon appears in toolbar
   - Click icon to view popup

---

### First Time Use

#### Onboarding Process

After installation, extension opens onboarding page automatically:

**Step 1: Welcome**
- Learn about Silent Feed's philosophy
- View main features
- Click "Next" to continue

**Step 2: AI Configuration (Optional)**
- Choose AI engine (DeepSeek / OpenAI / Anthropic)
- Input API Key
- Test connection
- **Or skip**: Use free rule engine

**Step 3: RSS Subscriptions (Optional)**
- Add your favorite RSS feeds
- Import OPML file
- Quick add sample feeds
- **Or configure later**

**Step 4: Complete**
- Start browsing normally
- Extension collects data in background
- Recommendations start after 100 pages

#### Cold Start Process

Silent Feed needs **100 valid page visits** before recommendations:

- **What is a valid page?**
  - Dwell time > 30 seconds
  - Non-sensitive domains (excludes banking, medical, etc.)
  - Contains sufficient text content

- **Check Progress**
  - Click extension icon
  - View countdown: X pages remaining
  - View current data statistics

- **Why 100 pages?**
  - Build accurate interest profile
  - Identify main interest topics
  - Extract keyword features
  - Ensure recommendation quality

---

### Core Features (EN)

#### 1. View Recommendations

**Open Recommendations**
- Click extension icon
- Or use keyboard shortcut (configurable in settings)

**Recommendation Interface**
- Shows 3-5 recommendations each time
- Recommendation score: 0-100% (higher = better match)
- Recommendation engine: 🧮 Algorithm / 🤖 AI / 👽 Reasoning AI
- Reasoning: Why this article is recommended

**Article Actions**
- **Read**: Click title to open article
- **Not Interested**: Mark as "disliked", skip
- **Read Later**: (Planned)

#### 2. Manage RSS Subscriptions

**Open Settings Page**
1. Right-click extension icon
2. Select "Options"
3. Enter "RSS Settings" tab

**Add Feed**
- **Method 1**: Input RSS feed URL
- **Method 2**: Click extension icon on page with RSS (auto-detect)
- **Method 3**: Import OPML file

**Manage Feeds**
- View all subscriptions
- View statistics (article count, fetch frequency)
- Pause/resume subscription
- Delete feed

**OPML Import/Export**
- Import: Migrate from other RSS readers
- Export: Backup your subscriptions

#### 3. View Interest Profile

**Open Profile Page**
1. Enter settings page
2. Select "Profile Settings" tab

**Profile Information**
- **Topic Distribution**: Interest scores for 11 topics
  - Technology, Science, Business, Arts, Health, etc.
  - Pie chart or bar chart visualization
- **Keyword Cloud**: Most frequently visited keywords
- **Browsing Statistics**: Total pages, valid pages
- **Update Time**: Last update timestamp

**Profile Actions**
- **Rebuild Profile**: Re-analyze based on current data
- **Clear History**: Delete all browsing data (caution)

#### 4. Configure AI

**AI Engine Selection**
- **DeepSeek Chat** (Recommended): Low cost ($0.0001/article), great performance
- **DeepSeek Reasoner**: Deep reasoning mode, higher cost ($0.001/article)
- **Rule Engine**: Completely free, keyword-based matching
- **OpenAI** (Coming soon): GPT-4o / GPT-4o-mini
- **Anthropic** (Coming soon): Claude 3.5

**Configuration Steps**
1. Select AI engine
2. Input API Key
   - DeepSeek: Get from [platform.deepseek.com](https://platform.deepseek.com)
   - OpenAI: Get from [platform.openai.com](https://platform.openai.com)
3. Click "Test Connection"
4. Save configuration

**Cost Control**
- View real-time AI cost statistics
- View daily/monthly usage
- Set budget alerts (planned)

---

### Advanced Settings (EN)

#### Preferences

- **Auto-translate Recommendations**: Translate non-UI language recommendations
- **Notification Settings**: Configure desktop notification rules
- **Theme**: Follow system / Dark / Light
- **Language**: 中文 / English

#### Analysis Settings

- **Recommendation Count**: Articles per recommendation (3-10)
- **Analysis Engine**:
  - For recommendations: Generate recommendations
  - For feeds: Analyze RSS article quality
- **Update Frequency**: RSS fetch interval

#### Data Management

- **Export Data**: Export browsing history, profile, subscriptions
- **Import Data**: Restore from backup
- **Clear Data**: Delete all data (caution)

---

### FAQ

#### Q: Why 100 pages required for recommendations?

A: Building an accurate interest profile requires sufficient data samples. 100 pages is the tested minimum threshold ensuring recommendation quality.

#### Q: Is my browsing data secure?

A: Completely secure. All data is stored locally in your browser (IndexedDB) by default. When using AI recommendations, only necessary feature data (keywords, topic scores) is sent, not URLs or sensitive information.

#### Q: Can I use it without AI configuration?

A: Yes. You can use the free rule engine based on keyword matching. While not as effective as AI, it's completely free and more private.

#### Q: How much does AI recommendation cost?

A: Using DeepSeek Chat as example, about $0.0001 per article. Recommending 5 articles daily, monthly cost is about $0.015. You can also use local AI service for completely free.

#### Q: How to import subscriptions from other RSS readers?

A: Most RSS readers support OPML export. After exporting, import in Silent Feed settings.

#### Q: What if recommendations are inaccurate?

A: 1) Ensure sufficient browsing data collected (>100 pages); 2) Click "Not Interested" to help AI learn; 3) Rebuild profile in settings; 4) Try different AI engines.

#### Q: How to uninstall extension?

A: Go to `chrome://extensions/`, find Silent Feed, click "Remove". All local data will be deleted.

---

### Privacy

#### Our Commitment

- ✅ **Local First**: All analysis done locally by default
- ✅ **Data Control**: You fully control data storage and deletion
- ✅ **Transparent Open Source**: Code is open source, auditable
- ✅ **Minimal Permissions**: Only request necessary permissions

#### Data Collected

**Local Storage** (not uploaded):
- Browsing history (URL, title, visit time, dwell time)
- User profile (topic scores, keyword weights)
- RSS subscriptions and articles
- Recommendation records

**Sent When Using AI** (if using DeepSeek/OpenAI, etc.):
- User profile features (topic scores, keywords)
- Article metadata (title, summary)
- **NOT included**: Browsing URLs, personal identifiable information

#### Permission Explanation

- `tabs`: Detect RSS feeds on current page
- `storage`: Store configurations and data
- `alarms`: Schedule RSS fetching
- `notifications`: Desktop notifications
- `https://*/*`: Fetch RSS content

#### Data Deletion

Can delete anytime in settings:
- Partial data (e.g., browsing history)
- Complete data (reset extension)
- Uninstall extension (auto-delete all data)

---

<div align="center">

**如有问题，欢迎联系我们 / Questions? Contact Us**

[GitHub Issues](https://github.com/wxy/SilentFeed/issues) | [Email](mailto:xingyu.wang@gmail.com)

</div>
