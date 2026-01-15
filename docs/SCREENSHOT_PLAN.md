# Silent Feed v0.5.1 截图方案

## 🎯 核心约束

**Chrome Web Store 限制**:
- 最多 5 张本地语言图片（中文版本）
- 最多 5 张全球可用图片（英文版本）
- 尺寸：1280×800 或 640×400
- 英文截图同时作为全球可用版本

**方案**:
- 为 Chrome Web Store 准备：**英文 5 张** + **中文 5 张**
- 其他截图放在项目文档中（README, USER_GUIDE 等）

---

## 📋 Chrome Web Store 截图清单（英文 5 张 + 中文 5 张）

### 第 1 张：AI 推荐界面

- **文件名**: 
  - `screenshot-1-recommendations-en.png` (全球可用)
  - `screenshot-1-recommendations-zh.png` (中文版)
- **尺寸**: 1280×800（Web Store 要求）或 640×400
- **显示内容**:
  - 推荐弹窗完整视图（3-5 条推荐）
  - 推荐卡片含：标题、分数、引擎标签、阅读按钮
  - 推荐理由说明
  - 核心功能：AI 智能推荐
- **用途**: 
  - Chrome Web Store 主要展示图片
  - README.md
  - docs/USER_GUIDE.md

### 第 2 张：RSS 设置与源级翻译（⭐ 最重要 - v0.5.1 核心新功能）

- **文件名**: 
  - `screenshot-2-rss-settings-en.png` (全球可用) ✅
  - `screenshot-2-rss-settings-cn.png` (中文版) ✅
- **尺寸**: 1280×800
- **显示内容**:
  - RSS 订阅源列表
  - **v0.5.1 新增**: 彩色方块进度条
    - 🩶 淘汰（灰色）
    - 🟢 未处理（浅绿）
    - 💚 候选（绿色）
    - 🔵 推荐（深绿）
    - 💙 已处理（蓝色）
  - **v0.5.1 新增**: 源级翻译开关
  - 订阅源统计
  - 汇总行显示
- **用途**: 
  - Chrome Web Store 亮点功能展示
  - README.md 第 1 张
  - docs/USER_GUIDE.md 核心功能部分
  - docs/RELEASE_0.5.1.md

### 第 3 张：兴趣画像

- **文件名**: 
  - `screenshot-3-profile-en.png` (全球可用) ✅
  - `screenshot-3-profile-cn.png` (中文版) ✅
- **尺寸**: 1280×800
- **显示内容**:
  - AI 兴趣总结（自然语言）
  - 偏好特征列表
  - 避免主题
  - 浏览统计（总页数、有效页数、最后分析时间）
  - 重建画像按钮
- **用途**: 
  - Chrome Web Store 展示 AI 学习能力
  - README.md 第 2 张
  - docs/USER_GUIDE.md

### 第 4 张：AI 配置与成本控制

- **文件名**: 
  - `screenshot-4-ai-config-en.png` (全球可用) ✅
  - `screenshot-4-ai-config-cn.png` (中文版) ✅
- **尺寸**: 1280×800
- **显示内容**:
  - AI 引擎选择（DeepSeek/OpenAI/Ollama 等）
  - API Key 配置
  - 成本控制面板
  - AI 用量统计
  - 预算设置
- **用途**: 
  - Chrome Web Store 展示灵活性
  - docs/USER_GUIDE.md 配置部分

### 第 5 张：推荐漏斗统计（多池架构）

- **文件名**: 
  - `screenshot-5-funnel-stats-en.png` (全球可用) ✅
  - `screenshot-5-funnel-stats-cn.png` (中文版) ✅
- **尺寸**: 1280×800
- **显示内容**:
  - 推荐漏斗恒等式
  - RSS 总数 → 已分析 → 候选 → 推荐 → 已读 流程
  - 各阶段转化率
  - 蛛网图展示源质量
  - 质量统计
- **用途**: 
  - Chrome Web Store 展示智能决策系统
  - docs/USER_GUIDE.md 数据管理部分

---

## � 最终截图清单（v0.5.3 发布）

### 已完成的 10 张截图 ✅

**英文版本**（全球可用）:
1. ✅ `screenshot-1-recommendations-en.png` 
2. ✅ `screenshot-2-rss-settings-en.png` 
3. ✅ `screenshot-3-profile-en.png`
4. ✅ `screenshot-4-ai-config-en.png`
5. ✅ `screenshot-5-funnel-stats-en.png`

**中文版本**（中文版 Web Store）:
1. ✅ `screenshot-1-recommendations-cn.png` 
2. ✅ `screenshot-2-rss-settings-cn.png` 
3. ✅ `screenshot-3-profile-cn.png`
4. ✅ `screenshot-4-ai-config-cn.png`
5. ✅ `screenshot-5-funnel-stats-cn.png`

**总计**: 10 张截图（5 英文 + 5 中文）✅ **完成**

---

## 🖼️ 截图规范

### 尺寸要求
- **Web Store 标准**: 1280×800 (推荐) 或 640×400
- **文档中使用**: 可缩小到 720px 宽度
- **格式**: PNG（无损质量）

### 拍摄环境
- 使用 v0.5.1 最新版本扩展
- 设置界面：确保展示完整的内容区域（1280×800 分辨率）
- 弹窗界面：弹窗占 Popup 空间（640×800 左右），可能需要放大截图以满足尺寸要求
- 清晰的浏览器窗口，避免过多背景干扰

### 数据准备
- RSS 源列表：5-10 个源，展示不同的转化率和彩色方块
- 推荐列表：3-5 条项目，包括不同的推荐引擎标签
- 画像页面：显示完整的兴趣总结和丰富的统计数据
- AI 配置：显示至少 2-3 个 Provider 的配置

### 敏感信息处理
- 模糊或删除个人兴趣关键词（如需要）
- 隐藏 API Key 等敏感信息
- 可保留成本数据示例（帮助说明功能）

---

## 📐 文件名规范

统一格式：`screenshot-NN-name-LANG.png`

```
screenshot-1-recommendations-en.png   ← 英文
screenshot-1-recommendations-zh.png   ← 中文
screenshot-2-rss-settings-en.png
screenshot-2-rss-settings-zh.png
...
```

---

## 🔄 更新说明

### Chrome Web Store 提交流程

1. **上传 5 张英文截图**
   ```
   screenshot-1-recommendations-en.png
   screenshot-2-rss-settings-en.png
   screenshot-3-profile-en.png
   screenshot-4-ai-config-en.png
   screenshot-5-funnel-stats-en.png
   ```

2. **上传 5 张中文截图**（仅在中文版本 Web Store）
   ```
   screenshot-1-recommendations-zh.png
   screenshot-2-rss-settings-zh.png
   screenshot-3-profile-zh.png
   screenshot-4-ai-config-zh.png
   screenshot-5-funnel-stats-zh.png
   ```

3. **保留宣传图片**（不需要更新）
   ```
   marquee-1400x560.png      ← Web Store 宣传条（不变）
   promo-tile-small-440x280.png  ← Web Store 宣传瓷砖（不变）
   ```

### 文档中的引用

```markdown
<!-- README.md -->
<img src="assets/screenshots/screenshot-2-rss-settings-zh.png" width="720" alt="RSS 设置与翻译" />

<!-- USER_GUIDE.md -->
<img src="assets/screenshots/screenshot-1-recommendations-en.png" width="720" alt="AI Recommendations" />
```

---

## ✅ 提交清单

完成截图后：

- [ ] 准备 10 张截图（5 英文 + 5 中文，1280×800）
- [ ] 放入 `docs/assets/screenshots/`
- [ ] 更新 README.md 中的占位符（6 个）
- [ ] 更新 docs/USER_GUIDE.md 中的占位符（1 个）
- [ ] 更新 docs/USER_GUIDE_ZH.md 中的占位符（1 个）
- [ ] 验证所有 Markdown 链接有效
- [ ] 提交：`git commit -m "docs: add v0.5.1 release screenshots"`
- [ ] 验证截图尺寸和质量
- [ ] 准备 Chrome Web Store 上传

---

## 💡 与前面版本的对比

**v0.3.6 的截图**（旧版本，可归档）:
```
screenshot-2-system-data-*           → 已过时，用新的 rss-settings 替换
screenshot-4-rss-settings-*          → 已过时，用新的 ai-config 替换
screenshot-5-ai-config-*             → 已过时，用新的 funnel-stats 替换
popup-recommendations-*              → 归档（Web Store 不需要）
settings-profile-*                   → 归档（功能相同，用新的 profile 替换）
```

**v0.5.1 的新特色**（必须在截图中体现）:
- 彩色方块进度条（RSS 设置）✓
- 源级翻译开关（RSS 设置）✓
- AI 策略决策（漏斗统计）✓

