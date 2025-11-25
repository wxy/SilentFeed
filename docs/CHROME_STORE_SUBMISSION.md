# Chrome Web Store 提交指南

本文档包含提交 Silent Feed 到 Chrome Web Store 所需的所有信息和资源。

---

## 📋 目录

1. [基本信息](#基本信息)
2. [商店详情](#商店详情)
3. [隐私相关](#隐私相关)
4. [图标和截图](#图标和截图)
5. [发布准备清单](#发布准备清单)
6. [提交流程](#提交流程)

---

## 基本信息

### 扩展信息

**名称 (中文主推)**:  
Silent Feed (静阅)

**名称 (英文)**:  
Silent Feed

**简短描述 (132字符以内)**:

**中文**:  
AI 驱动的 RSS 阅读器，自动学习你的兴趣，只推送你真正关心的内容。隐私优先，本地处理。

**English**:  
AI-powered RSS reader that learns your interests and recommends only what you care about. Privacy-first, local processing.

**分类**:  
生产工具 (Productivity)

**语言**:  
中文 (简体), English

---

## 商店详情

### 详细描述 (中文)

```
Silent Feed（静阅）- 让信息流安静下来

一个创新的 AI 驱动 RSS 阅读器，不同于传统的 RSS 阅读器：

🤫 核心理念
不是让你管理 RSS，而是让 AI 作为你的"信息守门员"。

✨ 核心特性

1. 静默学习
   • 在后台自动分析你的浏览行为
   • 无需任何设置，完全不打扰你
   • 基于真实行为而非设置

2. 智能推荐
   • AI 自动筛选出 3-5 条最相关的内容
   • 支持多种 AI 引擎（DeepSeek/OpenAI/Anthropic）
   • 或使用免费的规则引擎
   • 推荐分数可视化，理由详细说明

3. RSS 自动管理
   • 自动检测当前页面的 RSS 源
   • 一键订阅，批量导入 OPML
   • 智能抓取调度，文章质量评分

4. 隐私优先
   • 所有分析默认在本地进行
   • 或使用你自己的 AI API
   • 数据完全由你掌控
   • 代码开源，可审计

5. 渐进成长
   • 100 页面冷启动，逐步了解你的兴趣
   • 兴趣画像可视化
   • 成长可视化

🎯 适用场景

适合你，如果你：
• 订阅了大量 RSS 源（50+）
• 没时间查看所有内容
• 希望 AI 帮你过滤信息
• 关注隐私保护

不适合，如果你：
• 只订阅 1-2 个源
• 喜欢手动管理每条内容
• 不信任 AI 推荐

💰 成本透明

• DeepSeek Chat：¥0.001/篇（推荐）
• DeepSeek Reasoner：¥0.01/篇（深度推理）
• 规则引擎：完全免费
• 随时可切换引擎或查看成本统计

🛠️ 技术架构

• 框架：Plasmo (Chrome Extension MV3)
• 语言：TypeScript (严格模式)
• UI：React 18 + Tailwind CSS
• 数据库：Dexie.js (IndexedDB)
• 测试覆盖率：74%

📖 详细文档

• 用户手册：https://github.com/wxy/SilentFeed/blob/master/docs/USER_GUIDE.md
• 源代码：https://github.com/wxy/SilentFeed
• 问题反馈：https://github.com/wxy/SilentFeed/issues

🔒 隐私承诺

• 本地优先：所有分析默认在本地进行
• 数据掌控：你完全控制数据的存储和删除
• 透明开源：代码开源，可审计
• 最小权限：只请求必要的权限

开源协议：MIT License
```

### 详细描述 (English)

```
Silent Feed - Bringing Quiet to Your Information Stream

An innovative AI-powered RSS reader that works differently from traditional RSS readers:

🤫 Core Philosophy
Not about managing RSS, but letting AI be your "information gatekeeper".

✨ Key Features

1. Silent Learning
   • Automatically analyzes your browsing behavior in background
   • Zero configuration, completely non-intrusive
   • Based on actual behavior, not manual settings

2. Smart Recommendations
   • AI automatically filters out 3-5 most relevant articles
   • Multiple AI engines supported (DeepSeek/OpenAI/Anthropic)
   • Or use free rule-based engine
   • Recommendation score visualization with detailed reasoning

3. RSS Auto-Management
   • Auto-detect RSS feeds on current page
   • One-click subscription, batch OPML import
   • Smart fetch scheduling, article quality scoring

4. Privacy First
   • All analysis done locally by default
   • Or use your own AI API
   • You fully control your data
   • Open source, auditable code

5. Progressive Growth
   • 100-page cold start, gradually learns your interests
   • Interest profile visualization
   • Growth visualization

🎯 Use Cases

Good for you if you:
• Subscribe to many RSS feeds (50+)
• Don't have time to check all content
• Want AI to filter information
• Care about privacy

May not suit you if you:
• Only subscribe to 1-2 feeds
• Like manually managing every item
• Don't trust AI recommendations

💰 Transparent Costs

• DeepSeek Chat: $0.0001/article (Recommended)
• DeepSeek Reasoner: $0.001/article (Deep reasoning)
• Rule Engine: Completely free
• Switch engines anytime or check cost statistics

🛠️ Tech Stack

• Framework: Plasmo (Chrome Extension MV3)
• Language: TypeScript (Strict Mode)
• UI: React 18 + Tailwind CSS
• Database: Dexie.js (IndexedDB)
• Test Coverage: 74%

📖 Documentation

• User Guide: https://github.com/wxy/SilentFeed/blob/master/docs/USER_GUIDE.md
• Source Code: https://github.com/wxy/SilentFeed
• Issue Tracker: https://github.com/wxy/SilentFeed/issues

🔒 Privacy Commitment

• Local First: All analysis done locally by default
• Data Control: You fully control data storage and deletion
• Transparent Open Source: Code is open source, auditable
• Minimal Permissions: Only request necessary permissions

License: MIT License
```

---

## 隐私相关

### 权限说明

**请求的权限**:
- `tabs` - 检测当前页面的 RSS 源
- `storage` - 存储用户配置和数据
- `alarms` - 定时抓取 RSS 订阅
- `notifications` - 桌面通知
- `https://*/*` - 抓取 RSS 内容

**权限用途详细说明**:

1. **tabs (标签页)**
   - 用途：检测当前网页是否包含 RSS 订阅源
   - 数据：只读取页面 URL 和 HTML header 中的 RSS 链接
   - 不会：读取页面内容或用户输入

2. **storage (存储)**
   - 用途：保存用户配置、订阅列表、浏览历史、兴趣画像
   - 位置：全部存储在浏览器本地 IndexedDB
   - 不会：上传到任何服务器（除非用户配置了 AI API）

3. **alarms (定时器)**
   - 用途：定期抓取 RSS 订阅源的新文章
   - 频率：根据订阅源更新频率动态调整（默认 6-24 小时）
   - 不会：在用户不知情的情况下执行任何操作

4. **notifications (通知)**
   - 用途：当有高质量推荐时提醒用户
   - 频率：智能判断，避免频繁打扰
   - 控制：用户可完全关闭通知

5. **https://\*/\* (网络请求)**
   - 用途：抓取 RSS 订阅源的内容
   - 范围：仅访问用户订阅的 RSS 源 URL
   - 不会：追踪用户浏览行为或访问未授权的网站

### 隐私政策 URL

https://github.com/wxy/SilentFeed/blob/master/PRIVACY.md

（需要创建 PRIVACY.md 文件，内容见附录）

### 数据使用说明

**收集的数据**:
- 浏览历史（URL、标题、访问时间、停留时间）
- 用户兴趣画像（主题分数、关键词权重）
- RSS 订阅列表和文章
- 推荐记录和用户反馈

**数据存储**:
- 位置：浏览器本地 IndexedDB
- 加密：敏感配置（如 API Key）使用 Base64 编码
- 同步：默认不同步，用户可选择通过 Chrome 同步

**数据共享**:
- 默认情况：不与任何第三方共享
- 使用 AI 时：仅发送必要的特征数据（主题分数、关键词）到用户配置的 AI 服务
- 不包含：浏览 URL、个人身份信息

**数据删除**:
- 用户可随时在设置中删除部分或全部数据
- 卸载扩展时自动删除所有本地数据

---

## 图标和截图

### 应用图标

**要求**:
- 128x128 像素 PNG 格式
- 96x96 像素 PNG 格式（可选，用于详情页）

**文件**:
- `assets/icons/128/base-static.png` - 128x128 主图标
- `assets/icons/96/base-static.png` - 96x96（需创建）

### 截图（必需）

**要求**:
- 最少 1 张，最多 5 张
- 尺寸：1280x800 或 640x400 像素
- 格式：PNG 或 JPEG
- 内容：展示扩展的主要功能

**建议截图**:

1. **推荐界面** (screenshot-1-recommendations.png)
   - 展示 AI 推荐的文章列表
   - 显示推荐分数、引擎图标、推荐理由
   - 强调：智能推荐功能

2. **冷启动界面** (screenshot-2-cold-start.png)
   - 展示 100 页面倒计数
   - 显示当前收集进度
   - 强调：渐进成长特性

3. **兴趣画像** (screenshot-3-profile.png)
   - 展示主题分布图表
   - 显示关键词云图
   - 强调：兴趣分析可视化

4. **RSS 管理** (screenshot-4-rss-settings.png)
   - 展示订阅列表
   - 显示添加源和导入 OPML 功能
   - 强调：RSS 管理功能

5. **AI 配置** (screenshot-5-ai-config.png)
   - 展示 AI 引擎选择
   - 显示成本统计
   - 强调：AI 配置和成本控制

**截图保存位置**:
`docs/assets/screenshots/`

### 宣传图（可选）

**小型宣传图** (Promotional tile - Small):
- 尺寸：440x280 像素
- 格式：PNG 或 JPEG
- 用途：Chrome Web Store 列表页

**大型宣传图** (Promotional tile - Large):  
- 尺寸：920x680 像素
- 格式：PNG 或 JPEG
- 用途：Chrome Web Store 精选推荐

**跑马图** (Marquee):
- 尺寸：1400x560 像素
- 格式：PNG 或 JPEG
- 用途：Chrome Web Store 首页展示（如果被精选）

---

## 发布准备清单

### 代码准备

- [x] 代码通过所有测试
- [x] 测试覆盖率 ≥ 70%
- [x] 生产构建成功
- [x] 移除所有调试代码和 console.log
- [x] 优化性能（加载时间、内存占用）
- [ ] 移除未使用的权限
- [ ] 更新 manifest.json 版本号为 1.0.0

### 文档准备

- [x] README.md（入口文档）
- [x] README.zh-CN.md（中文详细文档）
- [x] README.en.md（英文详细文档）
- [x] docs/USER_GUIDE.md（用户手册）
- [x] docs/CHROME_STORE_SUBMISSION.md（本文档）
- [ ] PRIVACY.md（隐私政策）
- [ ] CHANGELOG.md（版本更新日志）

### 图标和截图

- [x] 128x128 应用图标
- [ ] 96x96 应用图标（可选）
- [ ] 至少 1 张功能截图（推荐 3-5 张）
- [ ] 440x280 小型宣传图（可选）
- [ ] 920x680 大型宣传图（可选）

### 测试

- [ ] Chrome 浏览器完整功能测试
- [ ] Edge 浏览器兼容性测试（可选）
- [ ] 不同系统测试（Windows/macOS/Linux）
- [ ] 不同语言测试（中文/English）
- [ ] 隐私模式测试
- [ ] 性能测试（内存占用、CPU 使用率）

### 法务和隐私

- [ ] 隐私政策文档
- [ ] 确认符合 Chrome Web Store 政策
- [ ] 确认符合 GDPR（如适用）
- [ ] 确认开源许可证正确（MIT License）

---

## 提交流程

### 1. 创建开发者账号

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 使用 Google 账号登录
3. 支付一次性注册费用（$5 USD）
4. 完成开发者信息填写

### 2. 打包扩展

```bash
# 1. 切换到 master 分支
git checkout master

# 2. 运行生产构建
npm run build

# 3. 打包扩展
npm run package

# 4. 生成的 zip 文件位于：
# build/chrome-mv3-prod.zip
```

### 3. 上传扩展

1. 进入 [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 点击"New Item"
3. 上传 `build/chrome-mv3-prod.zip`
4. 等待上传完成（可能需要几分钟）

### 4. 填写商店详情

按照本文档"商店详情"部分填写：

**Store Listing (商店列表)**:
- Product name (产品名称)
- Summary (简短描述)
- Detailed description (详细描述)
- Category (分类)
- Language (语言)

**Graphic Assets (图形资源)**:
- Icon (图标)
- Screenshots (截图)
- Promotional images (宣传图，可选)

**Privacy (隐私)**:
- Privacy policy (隐私政策 URL)
- Permission justification (权限说明)
- Data usage (数据使用说明)

**Pricing & Distribution (定价和分发)**:
- Pricing (定价): Free (免费)
- Visibility (可见性): Public (公开)
- Regions (地区): Worldwide (全球)

### 5. 提交审核

1. 检查所有必填项已完成
2. 点击"Submit for Review"
3. 等待审核（通常 1-3 个工作日）
4. 收到邮件通知审核结果

### 6. 审核通过后

- 扩展会在 Chrome Web Store 上架
- 更新 README.md 中的安装链接
- 发布 Release 公告
- 推广扩展

---

## 常见审核问题

### 权限过度

**问题**: 请求了不必要的权限

**解决**: 
- 移除未使用的权限
- 为每个权限提供详细说明
- 在隐私政策中说明权限用途

### 功能不清晰

**问题**: 审核员不清楚扩展的功能

**解决**:
- 改进详细描述
- 添加更多截图和说明
- 提供详细的用户手册链接

### 隐私政策不完整

**问题**: 隐私政策不符合要求

**解决**:
- 完善隐私政策文档
- 明确说明数据收集、使用和删除
- 提供易于访问的隐私政策 URL

### 性能问题

**问题**: 扩展影响浏览器性能

**解决**:
- 优化代码，减少内存占用
- 优化数据库查询
- 使用虚拟滚动和懒加载
- 提供性能测试报告

---

## 版本更新流程

### 更新扩展

1. 更新 `manifest.json` 中的 `version` 字段
2. 更新 `package.json` 中的 `version` 字段
3. 更新 `CHANGELOG.md`
4. 运行测试确保通过
5. 构建新版本: `npm run build && npm run package`
6. 在 Developer Dashboard 中上传新版本
7. 填写更新说明（中英文）
8. 提交审核

### 版本号规范

遵循语义化版本 (Semantic Versioning):
- **主版本号**: 不兼容的 API 修改
- **次版本号**: 向下兼容的功能性新增
- **修订号**: 向下兼容的问题修正

示例:
- `1.0.0` - 首次发布
- `1.1.0` - 新增功能
- `1.1.1` - Bug 修复
- `2.0.0` - 重大更新

---

## 附录

### A. 隐私政策模板

创建 `PRIVACY.md` 文件，包含以下内容：

```markdown
# Silent Feed 隐私政策 / Privacy Policy

**最后更新**: 2025-11-25

## 中文

### 1. 引言

Silent Feed（以下简称"我们"或"扩展"）尊重并保护用户的隐私。本隐私政策说明了我们如何收集、使用、存储和保护您的信息。

### 2. 信息收集

#### 2.1 自动收集的信息

- 浏览历史（URL、标题、访问时间、停留时间）
- 用户兴趣画像（主题分数、关键词权重）
- RSS 订阅列表和文章
- 推荐记录和用户反馈

#### 2.2 用户主动提供的信息

- AI API Key（如果配置）
- RSS 订阅源 URL
- 偏好设置

### 3. 信息使用

我们使用收集的信息用于：
- 构建个性化兴趣画像
- 生成 AI 推荐
- 改进推荐算法
- 提供统计和分析功能

### 4. 信息存储

- **本地存储**: 所有数据默认存储在浏览器本地 IndexedDB
- **不上传**: 除非使用 AI 推荐，否则不会上传任何数据
- **加密**: 敏感配置（如 API Key）使用 Base64 编码

### 5. 信息共享

- **默认情况**: 不与任何第三方共享
- **使用 AI 时**: 仅发送必要的特征数据到用户配置的 AI 服务
- **不包含**: 浏览 URL、个人身份信息

### 6. 数据删除

您可以随时：
- 在设置中删除部分或全部数据
- 卸载扩展（自动删除所有本地数据）

### 7. 第三方服务

如果您配置了 AI 推荐，数据可能会发送到：
- DeepSeek (https://www.deepseek.com/privacy)
- OpenAI (https://openai.com/policies/privacy-policy)
- Anthropic (https://www.anthropic.com/privacy)

请查阅相应服务的隐私政策。

### 8. 儿童隐私

本扩展不针对 13 岁以下儿童。如果您发现儿童向我们提供了个人信息，请联系我们。

### 9. 政策更新

我们可能会更新本隐私政策。重大更新将通过扩展通知用户。

### 10. 联系我们

如有隐私相关问题，请联系：
- Email: xingyu.wang@gmail.com
- GitHub: https://github.com/wxy/SilentFeed/issues

---

## English

### 1. Introduction

Silent Feed ("we" or "the extension") respects and protects user privacy. This privacy policy explains how we collect, use, store, and protect your information.

### 2. Information Collection

#### 2.1 Automatically Collected Information

- Browsing history (URL, title, visit time, dwell time)
- User interest profile (topic scores, keyword weights)
- RSS subscriptions and articles
- Recommendation records and user feedback

#### 2.2 User-Provided Information

- AI API Key (if configured)
- RSS feed URLs
- Preference settings

### 3. Information Use

We use collected information to:
- Build personalized interest profiles
- Generate AI recommendations
- Improve recommendation algorithms
- Provide statistics and analytics

### 4. Information Storage

- **Local Storage**: All data stored locally in browser IndexedDB by default
- **No Upload**: No data uploaded unless using AI recommendations
- **Encryption**: Sensitive configurations (like API Keys) encoded with Base64

### 5. Information Sharing

- **Default**: Not shared with any third parties
- **When Using AI**: Only necessary feature data sent to user-configured AI services
- **Not Included**: Browsing URLs, personal identifiable information

### 6. Data Deletion

You can anytime:
- Delete partial or all data in settings
- Uninstall extension (automatically deletes all local data)

### 7. Third-Party Services

If you configure AI recommendations, data may be sent to:
- DeepSeek (https://www.deepseek.com/privacy)
- OpenAI (https://openai.com/policies/privacy-policy)
- Anthropic (https://www.anthropic.com/privacy)

Please review their respective privacy policies.

### 8. Children's Privacy

This extension is not directed at children under 13. If you discover a child has provided personal information, please contact us.

### 9. Policy Updates

We may update this privacy policy. Significant updates will be notified through the extension.

### 10. Contact Us

For privacy-related questions, please contact:
- Email: xingyu.wang@gmail.com
- GitHub: https://github.com/wxy/SilentFeed/issues
```

### B. 提交检查清单

打印此清单，逐项检查：

```
□ 代码
  □ 所有测试通过
  □ 测试覆盖率 ≥ 70%
  □ 生产构建成功
  □ 移除调试代码
  □ 性能优化完成

□ 文档
  □ README.md 完整
  □ 用户手册完整
  □ 隐私政策完整
  □ 版本更新日志

□ 图形资源
  □ 128x128 图标
  □ 至少 1 张截图
  □ 图片质量清晰

□ 商店详情
  □ 产品名称
  □ 简短描述 (<132 字符)
  □ 详细描述 (完整)
  □ 分类选择
  □ 语言设置

□ 隐私
  □ 权限说明完整
  □ 数据使用说明清晰
  □ 隐私政策 URL 可访问

□ 测试
  □ Chrome 完整测试
  □ 多系统测试
  □ 多语言测试
  □ 隐私模式测试

□ 法务
  □ 开源许可证正确
  □ 符合 Chrome Web Store 政策
```

---

<div align="center">

**准备好后，开始提交吧！**

[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

</div>
