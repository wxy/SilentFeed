# Silent Feed v0.5.1 截图方案

## 📋 截图清单

### 第一优先级（必需截图）

这些截图在 README 和发布说明中出现，必须提供：

#### 1. AI 推荐界面
- **文件位置**: `docs/assets/screenshots/01-recommendations-en.png` / `-zh.png`
- **显示内容**:
  - 推荐弹窗完整视图（3-5 条推荐）
  - 推荐卡片含：标题、分数、引擎标签、阅读按钮
  - 推荐理由（"为什么推荐"）说明
  - 不想读/稍后读操作按钮
- **尺寸**: 720x1200 (竖屏弹窗)
- **在文件中的位置**:
  - README.md 第 1 张截图
  - docs/USER_GUIDE.md "核心功能 - 查看推荐" 部分
  - docs/RELEASE_0.5.1.md（可选）

#### 2. RSS 设置与源级翻译控制
- **文件位置**: `docs/assets/screenshots/02-rss-settings-en.png` / `-zh.png`
- **显示内容**:
  - RSS 订阅源列表
  - **新增 v0.5.1**: 彩色方块进度条（左侧）
  - **新增 v0.5.1**: 源级翻译开关（与语言标签合并）
  - 订阅源统计数据
  - 操作按钮（暂停/恢复/删除）
  - 汇总行（右侧显示池内数据）
- **尺寸**: 1200x800 (横屏设置页)
- **重要**: 这是最能展示 v0.5.1 新功能的截图
- **在文件中的位置**:
  - README.md 第 3 张截图
  - docs/USER_GUIDE.md "核心功能 - 管理 RSS" 部分
  - docs/RELEASE_0.5.1.md（强烈推荐）
  - CHANGELOG.md（可选配图）

#### 3. 兴趣画像
- **文件位置**: `docs/assets/screenshots/03-profile-en.png` / `-zh.png`
- **显示内容**:
  - AI 兴趣总结（自然语言描述）
  - 偏好特征列表
  - 避免主题
  - 浏览统计（总页数、有效页数、最后分析时间）
  - 重建画像/清空历史按钮
- **尺寸**: 1200x800 (横屏设置页)
- **在文件中的位置**:
  - README.md 第 2 张截图
  - docs/USER_GUIDE.md "核心功能 - 查看兴趣画像" 部分

---

### 第二优先级（补充截图，有更好但不必需）

#### 4. AI 配置页面
- **文件位置**: `docs/assets/screenshots/04-ai-config-en.png` / `-zh.png`
- **显示内容**:
  - AI 引擎选择（DeepSeek/OpenAI/Ollama 等）
  - API Key 输入
  - 连接测试按钮
  - 成本控制面板
  - 提供商级预算设置
- **尺寸**: 1200x800
- **在文件中的位置**:
  - docs/USER_GUIDE.md "核心功能 - 配置 AI" 部分
  - docs/RELEASE_0.5.1.md（可选）

#### 5. 冷启动进度
- **文件位置**: `docs/assets/screenshots/05-cold-start-en.png` / `-zh.png`
- **显示内容**:
  - 倒计数（剩余 X 页面）
  - 进度条
  - 已收集数据统计
  - 进度说明文案
- **尺寸**: 720x1200
- **在文件中的位置**:
  - docs/USER_GUIDE.md "首次使用 - 冷启动过程" 部分

#### 6. 推荐漏斗统计
- **文件位置**: `docs/assets/screenshots/06-funnel-stats-en.png` / `-zh.png`
- **显示内容**:
  - 推荐漏斗恒等式
  - 各阶段转化率
  - RSS 总数 → 已分析 → 候选 → 推荐 → 已读 流程
- **尺寸**: 1200x600
- **在文件中的位置**:
  - docs/USER_GUIDE.md "高级设置 - 数据管理" 部分
  - docs/RELEASE_0.5.1.md（可选）

#### 7. 阅读清单模式
- **文件位置**: `docs/assets/screenshots/07-reading-list-en.png` / `-zh.png`
- **显示内容**:
  - 阅读清单模式弹窗
  - 汇总视图（从 Chrome Reading List 同步）
  - 统计数据
- **尺寸**: 720x1200
- **在文件中的位置**:
  - docs/USER_GUIDE.md "高级设置 - 偏好设置" 部分

---

### 第三优先级（可选截图，用于文档）

#### 8. 推荐分析中的呼吸效果
- **文件位置**: GIF 动画 `docs/assets/screenshots/08-breathing-effect.gif`
- **显示内容**: 推荐分析过程中的呼吸灯效果
- **尺寸**: 720x400
- **在文件中的位置**: 可选装饰

#### 9. Google Translate URL 自动转换示例
- **文件位置**: 图表/流程图 (可用 mermaid 或截图)
- **显示内容**: 翻译链接如何自动识别并转换为原链接
- **在文件中的位置**: docs/RELEASE_0.5.1.md, USER_GUIDE.md

---

## 🎯 截图拍摄优先级建议

### 立即拍摄（用于发布）
1. ✅ **RSS 设置与源级翻译**（#2）- **最重要**
2. ✅ **AI 推荐界面**（#1）- **必需**
3. ✅ **兴趣画像**（#3）- **必需**

这 3 张截图足以展示 v0.5.1 的核心新功能。

### 稍后补充（提升文档质量）
4. AI 配置页面（#4）
5. 冷启动进度（#5）
6. 推荐漏斗统计（#6）

### 可选（锦上添花）
7. 阅读清单模式（#7）
8. 呼吸效果 GIF（#8）
9. Google Translate 流程图（#9）

---

## 📐 截图规范

### 通用要求
- **格式**: PNG（无损质量）
- **分辨率**: 标准 2x 倍数（720p/1080p）
- **文件名**: `NN-name-lang.png` 格式
  - 例: `01-recommendations-zh.png`, `02-rss-settings-en.png`
- **质量**: 截图前完成初始化和配置，展示真实功能状态

### 图片位置标准

```
docs/
  assets/
    screenshots/
      01-recommendations-en.png
      01-recommendations-zh.png
      02-rss-settings-en.png
      02-rss-settings-zh.png
      ...
```

### Markdown 引用格式

```markdown
<div align="center">
   <img src="assets/screenshots/01-recommendations-zh.png" width="720" alt="AI 推荐" />
   <br/>
   <em>AI 驱动的个性化推荐</em>
   <br/>
</div>
```

---

## 🔄 更新 CHANGELOG 前的清单

在将截图合并到发布之前，需要：

- [ ] 检查所有占位符位置是否已替换
- [ ] 验证英文和中文版本都包含对应的截图
- [ ] 确保文件名和引用路径一致
- [ ] 检查图片分辨率和文件大小合理
- [ ] 测试 Markdown 链接有效性

---

## 💡 截图内容建议

### 拍摄环境
- 使用最新版本的扩展（v0.5.1）
- 清晰的浏览器窗口，避免过多背景干扰
- 使用英文或中文界面，匹配对应版本的截图

### 数据要求
- RSS 源列表有 5-10 个源，展示不同的转化率
- 推荐列表有 3-5 条项目，最好包括不同的推荐引擎标签
- 画像页面显示完整的兴趣总结和统计

### 编辑后处理（可选）
- 添加箭头或标注指向重要功能（如彩色方块）
- 模糊或删除敏感信息（如个人兴趣关键词）
- 保持一致的亮度和对比度

---

## 📝 文档更新流程

### 现在的状态
- README.md 中有 6 个占位符
- docs/USER_GUIDE.md 中有 2 个占位符  
- docs/USER_GUIDE_ZH.md 中有 2 个占位符

### 更新步骤
1. 准备好截图文件
2. 上传到 `docs/assets/screenshots/`
3. 使用 `replace_string_in_file` 替换占位符
4. 验证所有链接有效
5. 提交：`git commit -m "docs: add v0.5.1 release screenshots"`

---

## ⚠️ 注意事项

### 如果暂时无法提供所有截图
- 优先使用第一优先级的 3 张截图（#1, #2, #3）
- 其他占位符可以保留，稍后补充
- 或者在发布说明中标注"截图敬请期待"

### 关于 v0.5.0 的截图
- v0.5.0 (阅读清单模式) 的截图如果有可单独添加
- 但 v0.5.1 的 3 张核心截图优先级更高

