# Silent Feed 隐私政策 / Privacy Policy

**最后更新 / Last Updated**: 2025-11-26

---

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

---

## 数据处理详情 / Data Processing Details

### 本地处理 / Local Processing

Silent Feed 采用"本地优先"的数据处理策略：

**Silent Feed uses a "local-first" data processing approach:**

1. **浏览历史分析 / Browsing History Analysis**
   - 处理位置 / Processing Location: 完全在浏览器本地 / Entirely in browser
   - 使用算法 / Algorithms Used: TF-IDF, 主题分类 / Topic Classification
   - 数据保留 / Data Retention: 用户可自定义，默认 90 天 / User-configurable, default 90 days

2. **兴趣画像构建 / Interest Profile Building**
   - 处理位置 / Processing Location: 浏览器本地 / Browser local
   - 输出数据 / Output Data: 主题分数、关键词权重（匿名化）/ Topic scores, keyword weights (anonymized)
   - 存储位置 / Storage Location: IndexedDB（本地）/ IndexedDB (local)

3. **AI 推荐（可选）/ AI Recommendations (Optional)**
   - 发送数据 / Data Sent: 仅主题分数和关键词（无 URL）/ Only topic scores and keywords (no URLs)
   - 接收服务 / Receiving Service: 用户配置的 AI API / User-configured AI API
   - 用户控制 / User Control: 完全可选，可随时禁用 / Completely optional, can be disabled anytime

### 数据安全 / Data Security

- **传输加密 / Transmission Encryption**: 所有网络请求使用 HTTPS / All network requests use HTTPS
- **本地加密 / Local Encryption**: API Keys 使用 Base64 编码存储 / API Keys stored with Base64 encoding
- **访问控制 / Access Control**: 仅扩展本身可访问数据 / Only extension itself can access data
- **审计能力 / Auditability**: 代码开源，可随时审查 / Code is open source, can be audited anytime

### 用户权利 / User Rights

您拥有以下权利 / You have the following rights:

1. **访问权 / Right to Access**: 随时查看所有存储的数据 / View all stored data anytime
2. **删除权 / Right to Deletion**: 随时删除部分或全部数据 / Delete partial or all data anytime
3. **导出权 / Right to Export**: 导出数据用于备份或迁移 / Export data for backup or migration
4. **拒绝权 / Right to Refuse**: 拒绝 AI 推荐功能 / Refuse AI recommendation features
5. **撤回权 / Right to Withdraw**: 随时撤回对数据处理的同意 / Withdraw consent for data processing anytime

### 合规声明 / Compliance Statement

- **GDPR**: 如适用于欧盟用户 / Applicable to EU users
- **CCPA**: 如适用于加州用户 / Applicable to California users
- **Chrome Web Store 政策**: 完全遵守 / Fully compliant
- **开源许可**: MIT License

---

## 版本历史 / Version History

- **v1.0** (2025-11-26): 初始版本 / Initial version
