# Phase 5 Sprint 3: UI 优化说明

## 📋 优化目标

将 RSS 源列表从四行优化为三行紧凑布局，提升信息密度和可读性。

## 🎯 优化内容

### 1. 三行布局结构

**第一行：RSS 本身属性**
- RSS/XML 图标（橙色，与标题大小相近）
- 语言图标 🌐
- 标题（可点击预览）
- 质量图标 🟢🟡🔴
- 类别图标 🏷️

**第二行：订阅信息**
- 订阅时间（已订阅）或发现时间（未订阅）
- 订阅方式标签（发现/手动/导入）
- 暂停状态（如果暂停）

**第三行：抓取统计（仅已订阅源）**
- 文章数/未读数
- 上次抓取时间 → 下次抓取时间
- 平均每周文章数
- 格式警告（如果有）

### 2. 移除的信息

- ❌ 发现时的条目数（`itemCount`）- 订阅后不再显示
- ❌ 最后构建日期 - 不够有用
- ❌ 单独的质量评分详情 - 用图标表示

### 3. 新增功能

- ✅ 下次抓取时间计算和显示
- ✅ 统一"条目数"和"文章数"为"文章"
- ✅ 基于更新频率的智能提示

## 🔧 技术修改

### 新增函数

```typescript
// 计算下次抓取时间
const calculateNextFetchTime = (feed: DiscoveredFeed): number | null => {
  // 根据 quality.updateFrequency 计算
  // ≥7 篇/周 → 6 小时后
  // 3-7 篇/周 → 12 小时后
  // 1-2 篇/周 → 24 小时后
}

// 格式化时间间隔（如 "6小时后"）
const formatTimeUntil = (timestamp: number) => {
  // "现在" / "马上" / "X 分钟后" / "X 小时后" / "X 天后"
}
```

### 新增翻译 Key

**中文** (`zh-CN/translation.json`):
```json
"fetch": {
  "articles": "篇",
  "unread": "未读",
  "last": "上次",
  "perWeek": "篇/周"
},
"time": {
  "now": "现在",
  "soon": "马上",
  "minutesLater": "分钟后",
  "hoursLater": "小时后",
  "daysLater": "天后"
}
```

**英文** (`en/translation.json`):
```json
"fetch": {
  "articles": "articles",
  "unread": "unread",
  "last": "Last",
  "perWeek": "per week"
},
"time": {
  "now": "Now",
  "soon": "Soon",
  "minutesLater": "minutes later",
  "hoursLater": "hours later",
  "daysLater": "days later"
}
```

## 📝 手动修改步骤

由于 `RSSManager.tsx` 文件过大（984行），无法一次性自动替换，请按以下步骤手动修改：

### Step 1: 打开文件

```bash
code /Users/xingyuwang/develop/FeedAIMuter/src/components/settings/RSSManager.tsx
```

### Step 2: 找到 `renderFeedItem` 函数

- 搜索：`// 渲染源列表项`
- 大约在 line 530 附近

### Step 3: 替换整个函数

- 删除从 `const renderFeedItem = (` 到闭合的 `)` 整个函数
- 复制 `RSSManager-new-renderFeedItem.tsx` 中的新函数
- 粘贴替换

### Step 4: 验证构建

```bash
npm run build
```

## 🎨 UI 改进效果

### 优化前（四行）
```
XML/RSS  TechCrunch - techcrunch.com
📅 2025-11-01 | 🏷️ 技术 | 🌐 英文 | 📄 10 条
质量: 🟢 85 分 (优质) - 12 篇/周
来源: techcrunch.com | 订阅来源: 手动订阅
[暂停] [取消订阅] [删除]
```

### 优化后（三行）
```
RSS 🌐 TechCrunch - techcrunch.com 🟢 🏷️
📌 订阅于: 2025-11-01 10:30 • 手动订阅
📰 125 篇 / 5 未读 • ⏱️ 上次: 2小时前 → 4小时后 • 📊 12.0 篇/周
[暂停] [取消订阅] [删除]
```

## 🔍 关键优化点

1. **信息密度提升**: 从4行压缩到3行，节省 25% 空间
2. **重点突出**: 质量图标（🟢🟡🔴）更直观
3. **实用信息**: 下次抓取时间帮助用户了解更新频率
4. **语义清晰**: "文章" 统一替代 "条目"
5. **减少干扰**: 移除不必要的元数据

## ✅ 验收标准

- [ ] RSS/XML 图标大小合适，与标题协调
- [ ] 三行信息清晰易读
- [ ] 下次抓取时间正确显示
- [ ] 文章数/未读数统计正确
- [ ] 平均每周文章数基于实际抓取计算
- [ ] 候选源不显示发现时的条目数
- [ ] 明暗主题适配正常
- [ ] 响应式设计良好

## 📊 平均每周文章数说明

**计算逻辑** (在 `FeedQualityAnalyzer.ts` 中):

```typescript
// 基于最近的文章发布时间计算
const updateFrequency = calculateUpdateFrequency(items)
// 算法：
// 1. 获取最新和最旧文章的发布时间
// 2. 计算时间跨度（周）
// 3. 平均每周文章数 = 文章总数 / 时间跨度（周）
```

**特点**:
- ✅ 基于实际发布时间，不是抓取次数
- ✅ 即使只抓取一次也能估算
- ✅ 随着抓取次数增加，精度提升

## 🚀 后续优化

可选的进一步优化（不在本次范围）:

1. 添加筛选和排序功能
2. 支持批量操作
3. 添加搜索功能
4. 优化移动端显示

---

**创建日期**: 2025-11-11
**分支**: feature/phase-5-sprint-3-ui-fixes
**状态**: 待手动替换 renderFeedItem 函数
