# Silent Feed v0.3.5 发布公告

> 发布日期：2025年12月13日

## 🎉 概述

Silent Feed v0.3.5 是一个重要的 **功能增强和用户体验优化版本**，包含从 v0.3.4 以来的多项改进。本次更新专注于 **AI 成本可视化**、**冷启动体验优化** 和 **用户界面改进**。

---

## ✨ 主要新功能

### 多币种 AI 成本架构（PR #81）

**问题背景**：
- 旧版本混合计算不同货币的 AI 费用（USD + CNY）
- 预算检查、统计展示不准确
- 用户无法清晰了解各 Provider 的真实成本

**新架构特性**：
- ✅ **币种感知的成本计算**
  - OpenAI: 美元（USD）
  - DeepSeek: 人民币（CNY）
  - Ollama: 免费（FREE）
- ✅ **分币种统计展示**
  - CollectionStats、AIUsageBarChart、BudgetOverview 等所有费用视图
  - 零值货币自动隐藏，避免视觉干扰
  - CSV 导出包含 Currency 列
- ✅ **预算检查一致性**
  - 每个 Provider 独立预算限制
  - 按币种检查，不混合计算
- ✅ **费用图优化**
  - 移除顶部提示与列内辅助线，界面更简洁
  - 按用途仅展示币种总额（移除输入/输出细分）
  - 多币种堆叠展示，悬浮文本格式优化

**技术亮点**：
- 货币符号标准化：`$` (USD), `¥` (CNY)
- 类型安全的 `ProviderCurrency` 枚举
- 统一的 `formatCurrency()` 工具函数
- 100% 测试覆盖率，所有 pre-push 检查通过

---

## 🚀 冷启动体验优化

### AI 配置流程改进（PR #81）

- ✅ **本地 Ollama 支持**
  - 引导流程 Step 2 新增"本地 Ollama"选项
  - 自动检测本地 AI 服务可用性
  - 连接成功后自动保存配置并标记可用
- ✅ **预设方案联动**
  - 测试连接成功后自动应用推荐的预设方案
  - DeepSeek/OpenAI: 远程优先方案
  - Ollama: 本地优先方案
- ✅ **测试连接改进**
  - 修复 DeepSeek/OpenAI maxTokens 限制（100→200）
  - 抑制截断警告（仅测试时）
  - 优化"在用"状态判断逻辑

### 学习阶段体验优化（PR #79, #80）

- ✅ **Tips 卡片增强**
  - 学习阶段展示引导提示（与推荐空状态一致）
  - 提示卡片表情统一为 💡
  - 更温暖、人性化的文案
- ✅ **空状态消息优化**
  - 学习阶段："正在学习您的兴趣..."
  - 空窗期："暂时没有新推荐..."
  - 配合进度条和友好提示

### RSS 订阅优化（PR #81）

- ✅ **示例源一键订阅**
  - Onboarding 示例源点击即直接订阅
  - 无需再次点击"添加"按钮
  - 防止重复订阅同一源
- ✅ **真实订阅源名称**
  - 使用真实 RSS feed 标题（Hacker News, 奇客Solidot）
  - 替代原有的占位符文本

---

## 🎨 UI/UX 改进

### AI 提供商卡片优化（最新）

- ✅ **图标布局重组**
  - 状态图标（🟢🔴⚪）移到左侧，紧邻名称
  - 类型和特性图标（☁️🔬⭐🔵）右对齐显示
  - 所有图标添加帮助光标（cursor-help）
- ✅ **垂直对齐优化**
  - 使用 `items-center` 实现居中对齐
  - 左右两侧视觉平衡
- ✅ **按钮固定底部**
  - 检测和配置按钮始终在卡片底部
  - 响应式布局，适配不同内容高度

### 推荐视图改进（PR #80）

- ✅ **弹窗视图优化**
  - 改进推荐条目在弹窗中的展示
  - 优化空状态提示
  - 更清晰的视觉层次

---

## 🐛 Bug 修复

### AI 配置测试（PR #81）

- ✅ 修复 DeepSeek/OpenAI 测试连接时的 token 截断警告
- ✅ 修复"在用"状态判断错误（未配置时不显示）
- ✅ 修复抽象 provider 解析问题

### 国际化（PR #81）

- ✅ 修正翻译文件中的错误
- ✅ 修正国际化键值不一致问题
- ✅ 完善中英文对照

---

## 📊 测试与质量

### 测试覆盖率

- **1691 测试通过** (102 测试文件)
- **行覆盖率**: 71.94%
- **函数覆盖率**: 74.7%
- **分支覆盖率**: 60.39%

### Pre-push 检查

- ✅ 完整测试套件
- ✅ 覆盖率检查
- ✅ 生产构建验证

---

## 📦 技术细节

### 多币种架构

```typescript
// 新的货币类型系统
type ProviderCurrency = 'USD' | 'CNY' | 'FREE'

// Provider 配置
{
  openai: { currency: 'USD', costPerInputToken: 0.00015 },
  deepseek: { currency: 'CNY', costPerInputToken: 0.000001 },
  ollama: { currency: 'FREE', costPerInputToken: 0 }
}

// 格式化函数
formatCurrency(amount, currency)
// USD → "$1.23"
// CNY → "¥1.23"
// FREE → "免费"
```

### UI 组件优化

- AIProviderCard: Flexbox 布局，items-center 对齐
- AIUsageBarChart: 多币种堆叠展示
- BudgetOverview: 分币种预算追踪
- CollectionStats: 零值货币隐藏

---

## 🔄 升级指南

### 从 v0.3.4 升级

1. **自动迁移**
   - AI 配置自动迁移到新结构
   - 费用统计自动按币种分组
   - 无需手动操作

2. **建议操作**
   - 检查 AI Provider 预算设置
   - 查看多币种费用统计
   - 体验新的冷启动流程（可重置 onboarding）

3. **兼容性**
   - 完全向后兼容 v0.3.4
   - 旧数据自动升级

---

## 🙏 致谢

感谢所有用户的反馈和建议，帮助我们不断改进 Silent Feed！

---

## 📚 相关文档

- [用户手册](./USER_GUIDE_ZH.md)
- [AI 成本架构](./AI_COST_ARCHITECTURE.md)
- [测试指南](./TESTING.md)
- [Changelog](../CHANGELOG.md)

---

## 🔗 链接

- **GitHub**: https://github.com/wxy/SilentFeed
- **Issues**: https://github.com/wxy/SilentFeed/issues
- **Releases**: https://github.com/wxy/SilentFeed/releases/tag/v0.3.5
