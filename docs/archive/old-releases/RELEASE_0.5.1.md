# Silent Feed v0.5.1 Release Notes

🎉 **发布日期**: 2026年1月14日

这是 Silent Feed 自 v0.3.6 (2025-12-22) 以来的重大更新，包含 **158 个提交**，历时 **23 天**的开发工作。本次更新带来了 AI 策略决策系统、全新的 RSS 可视化、Google Translate URL 完整支持等重要特性。

---

## 🌟 亮点功能

### 1. AI 策略决策系统 (Phase 13)

Silent Feed 现在拥有完整的 AI 驱动策略决策能力：

- **智能推荐池管理**: AI 根据您的画像和内容质量动态决策
- **候选池准入控制**: 自动调整质量阈值，确保推荐精准度
- **自适应学习**: 系统随着您的使用不断优化推荐策略

**用户价值**: 更精准的推荐，更少的低质量内容，更智能的学习系统。

---

### 2. RSS 订阅源可视化革新

告别复杂的数学公式，迎来直观的视觉展示：

**彩色方块进度条**:
- 🩶 淘汰（灰色）
- 🟢 未处理（浅绿）
- 💚 候选（绿色）
- 🔵 推荐（深绿）
- 💙 已处理（蓝色）

每个方块代表一篇文章，Hover 显示详细统计。配合恢复的推荐漏斗恒等式，让数据流一目了然。

**截图**: [待用户提供]

---

### 3. Google Translate URL 完整支持

**核心问题已解决**: 以前在翻译版页面发现的 RSS 源会被系统视为新源，导致重复订阅。现在：

```
原始链接: example.com/feed.xml
翻译链接: example-com.translate.goog/feed.xml
↓
系统自动识别为同一个源 ✓
```

**技术实现**:
- Content Script 中的 URL 转换
- FeedManager 中的多层防守机制
- 增强的 URL 规范化逻辑

详细调查: [INVESTIGATION_TRANSLATE_URL_DEDUP.md](../docs/INVESTIGATION_TRANSLATE_URL_DEDUP.md)

---

### 4. 订阅源级别翻译控制

现在您可以为每个订阅源单独设置是否翻译：

- 🌐 独立翻译开关
- 🔤 智能语言检测
- 🎯 符合预期的默认行为

非常适合订阅多语言源的用户！

---

### 5. 页面浏览去重机制

30 分钟时间窗口内，同一页面不会被重复学习：

- ⏱️ 避免短时间内重复学习
- 💰 降低 AI API 成本
- 🚀 更智能的行为追踪

---

## 🐛 重要 Bug 修复

### Google Translate URL 去重（关键修复）

完全解决翻译页面 RSS 源重复订阅的问题。FeedManager 现在拥有完整的 translate.goog URL 处理能力，确保去重的可靠性。

### 阅读列表集成优化

修复保存到阅读列表时翻译设置被忽略的问题，改进推荐追踪和移除逻辑。

### AI 分析和推荐系统

- 修复 AI 分析时语言检测失败
- 修复多池架构迁移不完整
- 修正冷却期检查位置
- 改进错误处理

### 其他修复

- RSS favicon 显示问题
- 按钮点击事件冒泡
- 运行时错误修复
- 测试覆盖率优化

---

## 🏗️ 技术改进

### Content Script 架构重构

- **统一架构**: 所有功能整合到 SilentFeed.ts
- **轻量化**: 减少内存占用
- **模块化**: 更易维护和扩展

### 测试和质量

- **测试用例**: 2156 个测试（127 个测试文件）
- **覆盖率**: Statements 68%, Functions 69%
- **CI/CD**: 完善的自动化检查

### 开发者体验

- **OpenSkills 集成**: Claude Skills 自动化工作流
- **文档完善**: 新增多份技术文档和调查报告
- **项目整理**: 清理归档 15+ 过时文档

---

## 📊 版本统计

| 指标 | 数值 |
|------|------|
| 提交数量 | 158 |
| 开发周期 | 23 天 |
| 功能新增 | ~40 个 |
| Bug 修复 | ~35 个 |
| 代码重构 | ~25 个 |
| 测试用例 | 2156 个 |
| 测试覆盖率 | ~70% |

---

## 🔄 从 v0.3.6 升级

### 数据兼容性

✅ **完全兼容** - 无需任何迁移操作，直接升级即可。

### 新功能自动启用

- AI 策略决策系统将自动开始工作
- 新的 RSS 可视化会立即生效
- Google Translate URL 去重自动启用

### 推荐操作

1. **检查 AI 配置**: 确保 AI 引擎配置正确
2. **查看新的可视化**: 访问 RSS 设置查看彩色进度条
3. **尝试源级翻译**: 为不同语言的源设置翻译偏好

---

## 🎯 后续计划

### 短期（v0.5.x）

- [ ] 提取 URL 转换逻辑到共享 utility 模块
- [ ] 增强端到端测试覆盖

### 中期（v0.6.x）

- [ ] 继续优化 AI 策略决策
- [ ] 改进推荐质量评估
- [ ] UI 进一步美化

### 长期

- [ ] 多平台支持
- [ ] 社区功能探索
- [ ] AI 能力扩展

---

## 🙏 致谢

感谢所有使用 Silent Feed 的用户！您的反馈和建议是我们持续改进的动力。

特别感谢：
- Chrome Web Store 审核团队
- 所有提交 Issue 和 PR 的贡献者
- OpenSkills 项目提供的开发工具支持

---

## 📚 相关资源

- **详细变化分析**: [RELEASE_0.5.1_ANALYSIS.md](../docs/RELEASE_0.5.1_ANALYSIS.md)
- **完整变更日志**: [CHANGELOG.md](../CHANGELOG.md)
- **用户指南**: [USER_GUIDE_ZH.md](../docs/USER_GUIDE_ZH.md)
- **贡献指南**: [CONTRIBUTING_ZH.md](../CONTRIBUTING_ZH.md)

---

## 📮 反馈和支持

- **GitHub Issues**: https://github.com/wxy/SilentFeed/issues
- **Chrome Web Store**: https://chromewebstore.google.com/detail/pieiedlagbmcnooloibhigmidpakneca
- **Email**: xingyu.wang@gmail.com

---

**Happy Reading! 🤫**
