# Phase 5 Sprint 1 浏览器测试指南

## 测试目标

验证 RSS 自动检测功能在真实浏览器环境中的工作情况。

---

## 测试准备

### 1. 构建扩展

```bash
npm run build
```

### 2. 加载扩展到 Chrome

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `build/chrome-mv3-dev` 目录

### 3. 打开开发者工具

- 右键点击扩展图标 → "检查弹出内容"（Popup DevTools）
- 访问 `chrome://extensions/` → 找到扩展 → "背景页" → "service worker"（Background DevTools）
- 在任意网页上右键 → "检查"（Page DevTools）

---

## 测试场景

### 场景 1: 检测 RSS 链接（基础功能）

#### 测试网站
推荐使用以下有 RSS 的网站：
- https://techcrunch.com
- https://www.theverge.com
- https://blog.cloudflare.com
- https://news.ycombinator.com

#### 操作步骤
1. 访问测试网站
2. 打开 Page DevTools → Console
3. 查找 RSS 检测相关日志

#### 预期结果

**Console 日志应显示**:
```
[RSS Detector] 页面加载完成，开始检测 RSS
[RSS Detector] 检测到 1 个 RSS 链接:
  - TechCrunch (https://techcrunch.com/feed/)
[RSS Detector] 已发送到 background 验证
```

**Background 日志应显示**:
```
[Background] 收到 RSS 发现请求: https://techcrunch.com/feed/
[RSSValidator] 开始验证: https://techcrunch.com/feed/
[RSSValidator] 验证成功: RSS 2.0
[FeedManager] 已添加候选源: TechCrunch
```

#### 验证数据存储

1. 打开 DevTools → Application → IndexedDB → SilentFeedDB → discoveredFeeds
2. 检查是否有新记录
3. 验证字段：
   - `url`: RSS 链接
   - `title`: 源名称
   - `status`: "candidate"
   - `discoveredFrom`: 当前页面 URL

---

### 场景 2: 尝试常见路径（增强功能）

#### 测试网站
使用没有明确 RSS 链接的网站：
- https://github.com
- 任意个人博客

#### 预期结果

**Console 日志**:
```
[RSS Detector] 未检测到 <link> 标签，尝试常见路径...
[RSS Detector] 尝试: /feed
[RSS Detector] 尝试: /rss
[RSS Detector] 尝试: /atom.xml
...
```

如果找到有效的 RSS：
```
[RSS Detector] 找到有效 RSS: /feed
```

---

### 场景 3: 重复检测过滤

#### 操作步骤
1. 访问 TechCrunch
2. 刷新页面 2-3 次
3. 检查 discoveredFeeds 表

#### 预期结果
- 只有 1 条记录
- 日志显示: `[FeedManager] 源已存在: https://techcrunch.com/feed/`

---

### 场景 4: 无 RSS 的网站

#### 测试网站
- https://www.google.com
- https://www.youtube.com

#### 预期结果
```
[RSS Detector] 未检测到任何 RSS 链接
```

---

## 常见问题排查

### 问题 1: Content Script 没有注入

**症状**: Console 没有任何 RSS 相关日志

**排查**:
1. 检查 `chrome://extensions/` 扩展是否启用
2. 检查 manifest.json 的 content_scripts 配置
3. 刷新扩展后重新加载页面

### 问题 2: 数据没有保存到 IndexedDB

**症状**: Console 有日志，但 IndexedDB 没有数据

**排查**:
1. 检查 Background DevTools 的 Console 是否有错误
2. 检查数据库版本是否匹配
3. 检查 FeedManager 的日志

### 问题 3: 验证失败

**症状**: `[RSSValidator] 验证失败: xxx`

**排查**:
1. 手动访问 RSS URL，检查是否可访问
2. 检查是否有 CORS 问题
3. 检查 RSS 格式是否正确

---

## 测试检查表

完成以下检查后，Sprint 1 浏览器测试通过：

- [ ] Content Script 成功注入到网页
- [ ] 检测到有 RSS 的网站的链接
- [ ] 数据正确保存到 discoveredFeeds 表
- [ ] 重复访问不会创建重复记录
- [ ] 无 RSS 的网站不会产生错误
- [ ] Console 日志清晰易读
- [ ] Background 验证逻辑正常工作

---

## 下一步

测试通过后，继续实现：
- **5.1.5 发现提示可视化** - Badge 和 Popup 提示
