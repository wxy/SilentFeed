# Silent Feed 截图资源

本目录用于存放 Chrome Web Store 提交和项目 README 所需的截图。

---

## 📋 截图清单

### Chrome Web Store 所需截图（5 张）

**要求**:
- 尺寸：1280x800 或 640x400 像素
- 格式：PNG 或 JPEG
- 质量：高清，无模糊
- 数量：最少 1 张，推荐 3-5 张

#### 1. 推荐界面 (screenshot-1-recommendations.png)

**内容**:
- 展示 Popup 界面的推荐列表
- 显示 3-5 条 AI 推荐的文章
- 包含：
  - 推荐分数（85-95 分）
  - AI 引擎图标（DeepSeek/OpenAI/规则）
  - 推荐理由文本
  - 文章标题和摘要
  - 操作按钮（阅读原文、忽略、收藏）

**强调功能**: 智能推荐，AI 驱动

**截图方式**:
1. 打开扩展 Popup
2. 确保有推荐内容（如果没有，可以手动触发推荐）
3. 截取完整界面
4. 尺寸调整为 1280x800

---

#### 2. 冷启动界面 (screenshot-2-cold-start.png)

**内容**:
- 展示冷启动倒计数界面
- 显示当前收集进度
- 包含：
  - 100 页面倒计数（例如：已收集 45/100 页面）
  - 进度条可视化
  - 鼓励文案："继续浏览，我们正在了解你的兴趣..."
  - 已收集页面的简要统计

**强调功能**: 渐进成长，无需配置

**截图方式**:
1. 清空数据库（或使用新的浏览器配置文件）
2. 浏览一些页面（例如 45 个）
3. 打开 Popup 查看冷启动界面
4. 截取完整界面

---

#### 3. 兴趣画像界面 (screenshot-3-profile.png)

**内容**:
- 展示设置页面的"兴趣画像"选项卡
- 显示主题分布图表
- 包含：
  - 主题分数柱状图（11 个主题）
  - 关键词云图或列表
  - 总访问页面数、有效页面数
  - 最后更新时间
  - "查看详情"、"重置画像"等操作按钮

**强调功能**: 兴趣分析可视化，透明的画像构建

**截图方式**:
1. 确保已收集足够页面（≥100）
2. 打开设置页面（右键扩展图标 → 选项）
3. 切换到"兴趣画像"选项卡
4. 截取完整界面

---

#### 4. RSS 管理界面 (screenshot-4-rss-settings.png)

**内容**:
- 展示设置页面的"RSS 订阅"选项卡
- 显示订阅列表
- 包含：
  - 已订阅的 RSS 源列表（3-5 个）
  - 每个源的标题、URL、最后抓取时间
  - "添加源"按钮
  - "导入 OPML"按钮
  - "导出 OPML"按钮
  - 订阅源管理操作（编辑、删除、禁用）

**强调功能**: RSS 自动管理，批量导入

**截图方式**:
1. 添加几个 RSS 订阅源（例如：阮一峰博客、酷壳、InfoQ）
2. 打开设置页面
3. 切换到"RSS 订阅"选项卡
4. 截取完整界面

---

#### 5. AI 配置界面 (screenshot-5-ai-config.png)

**内容**:
- 展示设置页面的"AI 配置"选项卡
- 显示 AI 引擎选择和配置
- 包含：
  - AI 引擎选择下拉菜单（DeepSeek/OpenAI/Anthropic/规则）
  - API Key 输入框（已填写，但部分隐藏）
  - 成本统计（已使用 ¥2.34，文章数 2340 篇）
  - 模型选择（DeepSeek Chat）
  - "测试连接"按钮
  - "保存配置"按钮

**强调功能**: AI 配置灵活，成本透明

**截图方式**:
1. 配置一个 AI 引擎（例如：DeepSeek）
2. 确保有成本统计数据（如果没有，可以手动模拟）
3. 打开设置页面
4. 切换到"AI 配置"选项卡
5. 截取完整界面

---

### 项目 README 所需截图（2 张）

**要求**:
- 尺寸：适中（宽度 400-800px）
- 格式：PNG
- 用途：在 README 中展示核心功能

#### 1. popup-recommendations.png

**内容**: 推荐界面（与上面的 screenshot-1 相同，但尺寸较小）

**使用位置**: README.md 的"预览"部分

---

#### 2. settings-profile.png

**内容**: 兴趣画像界面（与 screenshot-3 相同，但尺寸较小）

**使用位置**: README.md 的"核心功能"部分

---

## 🎨 宣传图（可选）

### 小型宣传图 (promo-tile-small.png)

**尺寸**: 440x280 像素  
**用途**: Chrome Web Store 列表页  
**设计建议**:
- 背景：渐变或纯色（与扩展图标配色一致）
- 标题：Silent Feed (静阅)
- Slogan：让信息流安静下来
- 图标：扩展图标
- 关键特性：AI 推荐、隐私优先、渐进成长

---

### 大型宣传图 (promo-tile-large.png)

**尺寸**: 920x680 像素  
**用途**: Chrome Web Store 精选推荐  
**设计建议**:
- 更详细的功能展示
- 可以包含界面截图
- 突出核心价值主张

---

### 跑马图 (marquee.png)

**尺寸**: 1400x560 像素  
**用途**: Chrome Web Store 首页展示（如果被精选）  
**设计建议**:
- 横幅式设计
- 包含扩展主要功能截图
- 吸引眼球的设计

---

## 📐 截图工具和技巧

### 推荐工具

**macOS**:
- Command + Shift + 4：区域截图
- Command + Shift + 4 + Space：窗口截图
- 使用预览应用调整尺寸

**Windows**:
- Snipping Tool / Snip & Sketch
- 使用画图应用调整尺寸

**Chrome DevTools**:
- F12 → Toggle device toolbar (Ctrl+Shift+M)
- 设置设备尺寸为 1280x800
- 右键 → Capture screenshot

**第三方工具**:
- Snagit (推荐，功能强大)
- Lightshot
- ShareX (Windows)

### 截图技巧

1. **设置合适的窗口尺寸**:
   - 使用 Chrome DevTools 设置精确尺寸
   - 或使用 window.resizeTo(1280, 800) 调整窗口

2. **准备测试数据**:
   - 添加真实的 RSS 订阅
   - 确保有推荐内容
   - 模拟足够的浏览历史

3. **优化显示效果**:
   - 使用高分辨率显示器
   - 避免模糊和失真
   - 确保文字清晰可读

4. **注意隐私**:
   - 不要包含敏感 URL
   - 隐藏或模糊 API Key
   - 使用示例数据而非真实数据

5. **保持一致性**:
   - 使用统一的浏览器主题
   - 保持相同的字体大小
   - 使用相同的语言（建议中文）

---

## 📁 文件命名规范

- `screenshot-1-recommendations.png` - Chrome Web Store 截图 1（推荐界面）
- `screenshot-2-cold-start.png` - Chrome Web Store 截图 2（冷启动）
- `screenshot-3-profile.png` - Chrome Web Store 截图 3（兴趣画像）
- `screenshot-4-rss-settings.png` - Chrome Web Store 截图 4（RSS 管理）
- `screenshot-5-ai-config.png` - Chrome Web Store 截图 5（AI 配置）
- `popup-recommendations.png` - README 截图（推荐界面，小尺寸）
- `settings-profile.png` - README 截图（兴趣画像，小尺寸）
- `promo-tile-small.png` - 小型宣传图（可选）
- `promo-tile-large.png` - 大型宣传图（可选）
- `marquee.png` - 跑马图（可选）

---

## ✅ 检查清单

创建完截图后，使用此清单检查：

```
Chrome Web Store 截图:
□ screenshot-1-recommendations.png (1280x800, 推荐界面)
□ screenshot-2-cold-start.png (1280x800, 冷启动)
□ screenshot-3-profile.png (1280x800, 兴趣画像)
□ screenshot-4-rss-settings.png (1280x800, RSS 管理)
□ screenshot-5-ai-config.png (1280x800, AI 配置)

README 截图:
□ popup-recommendations.png (400-800px 宽, 推荐界面)
□ settings-profile.png (400-800px 宽, 兴趣画像)

宣传图（可选）:
□ promo-tile-small.png (440x280)
□ promo-tile-large.png (920x680)
□ marquee.png (1400x560)

质量检查:
□ 所有截图清晰无模糊
□ 文字可读
□ 无敏感信息
□ 尺寸符合要求
□ 格式正确（PNG/JPEG）
□ 文件命名规范
```

---

## 📝 注意事项

1. **截图时机**: 建议在发布前统一截图，确保界面一致
2. **数据准备**: 提前准备好测试数据，避免截图时临时添加
3. **语言选择**: Chrome Web Store 支持中英文，建议中文截图（主要市场）
4. **更新频率**: 每次重大版本更新时，更新相关截图
5. **备份**: 保留高分辨率原图，方便后续调整

---

<div align="center">

**截图制作完成后，请更新 CHROME_STORE_SUBMISSION.md 中的检查清单**

</div>
