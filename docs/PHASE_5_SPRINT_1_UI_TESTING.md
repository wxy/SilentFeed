# Phase 5 Sprint 1 - RSS Discovery UI 浏览器测试指南

## 测试目标

验证 RSS 发现、存储、徽章通知和弹窗展示的完整流程。

## 测试前准备

1. **加载扩展**:
   ```bash
   # 在 Chrome 中打开扩展管理页面
   chrome://extensions/
   
   # 启用"开发者模式"
   # 点击"加载已解压的扩展程序"
   # 选择项目的 build/chrome-mv3-dev 目录
   ```

2. **打开开发者工具**:
   - 右键点击扩展图标 → "检查弹出内容"（查看 Popup 日志）
   - chrome://extensions/ → 点击扩展的"Service Worker"链接（查看 Background 日志）

## 测试场景

### 场景 1：基础 RSS 检测和 UI 显示

**测试步骤**:
1. 访问有 RSS 源的网站：https://techcrunch.com/
2. 观察扩展图标徽章：
   - ✅ **预期**: 显示橙色徽章，数字为检测到的 RSS 源数量（如 "2"）
   
3. 点击扩展图标打开弹窗：
   - ✅ **预期**: 弹窗顶部显示 "📡 发现 X 个 RSS 源" 卡片
   - ✅ **预期**: 列表显示每个源的标题和来源域名
   - ✅ **预期**: 每个源有 "🔗 查看" 和 "🚫 忽略" 按钮

4. **控制台日志验证**:
   - Service Worker 控制台应显示:
     ```
     [RSS Detector] 检测到 2 个 RSS 源 [...]
     [Background] 检测到 RSS 源，开始处理...
     [Background] RSS 源已保存到数据库
     [Background] 徽章已更新：2 个候选 RSS 源
     ```
   - Popup 控制台应显示:
     ```
     [DiscoveredFeedsCard] 加载候选源...
     ```

### 场景 2：查看 RSS 源

**测试步骤**:
1. 在弹窗的 RSS 源列表中，点击某个源的 "🔗 查看" 按钮
2. ✅ **预期**: 在新标签页打开该 RSS 源的 URL
3. ✅ **预期**: 弹窗仍然显示该源（未被移除）

### 场景 3：忽略 RSS 源

**测试步骤**:
1. 在弹窗的 RSS 源列表中，点击某个源的 "🚫 忽略" 按钮
2. ✅ **预期**: 该源立即从列表中移除
3. ✅ **预期**: 徽章数字减少（如从 "2" 变为 "1"）
4. ✅ **预期**: Service Worker 控制台显示:
   ```
   [FeedManager] 已更新源状态: xxx ignored
   [Background] RSS 源已忽略，更新徽章...
   [Background] 徽章已更新：1 个候选 RSS 源
   ```

### 场景 4：忽略所有源后徽章消失

**测试步骤**:
1. 逐个忽略所有检测到的 RSS 源
2. ✅ **预期**: 最后一个源被忽略后：
   - 徽章从橙色数字变为冷启动状态（或推荐状态）
   - 弹窗中的 RSS 发现卡片消失（不再显示）

### 场景 5：多页面检测

**测试步骤**:
1. 依次访问以下网站：
   - https://www.theverge.com/ （有 RSS）
   - https://example.com/ （无 RSS）
   - https://blog.cloudflare.com/ （有 RSS）

2. ✅ **预期**:
   - 徽章数字累计增加（如 2 → 3 → 4）
   - 弹窗显示所有页面检测到的源

3. **数据库验证**:
   - 打开 Chrome DevTools → Application → IndexedDB → SilentFeedDB → discoveredFeeds
   - ✅ **预期**: 看到所有检测到的源，status 为 "candidate"

### 场景 6：重复检测去重

**测试步骤**:
1. 访问 https://techcrunch.com/
2. 刷新页面 2-3 次
3. ✅ **预期**: 徽章数字不变（同一 URL 的源不会重复添加）
4. ✅ **预期**: Service Worker 显示:
   ```
   [FeedManager] 源已存在: https://techcrunch.com/feed
   ```

## 数据库检查

打开 Chrome DevTools → Application → IndexedDB → SilentFeedDB → discoveredFeeds

**字段验证**:
- ✅ `url`: RSS 源 URL
- ✅ `title`: 源标题
- ✅ `discoveredFrom`: 发现来源页面 URL
- ✅ `discoveredAt`: 时间戳
- ✅ `status`: "candidate" 或 "ignored"
- ✅ `enabled`: true

## 常见问题排查

### 问题 1: 徽章未显示
- **检查**: Service Worker 是否正常运行（chrome://extensions/ → Service Worker）
- **检查**: Console 是否有错误
- **解决**: 重新加载扩展

### 问题 2: 弹窗不显示 RSS 卡片
- **检查**: Popup Console 是否有错误
- **检查**: IndexedDB 中是否有 candidate 状态的源
- **解决**: 检查 DiscoveredFeedsCard 组件逻辑

### 问题 3: 点击忽略无反应
- **检查**: Popup Console 是否有错误
- **检查**: 消息是否发送到 background（chrome.runtime.sendMessage）
- **解决**: 检查 background.ts 的 RSS_IGNORED 处理逻辑

## 测试完成标准

- ✅ 所有 6 个场景测试通过
- ✅ 徽章显示正确（橙色 + 数字）
- ✅ 弹窗 UI 显示正常（手绘风格）
- ✅ 查看/忽略操作正常
- ✅ 数据库数据一致
- ✅ 无控制台错误

## 下一步

测试通过后：
1. 提交代码到 feature/phase-5-sprint-1-ui 分支
2. 更新 DEVELOPMENT_PLAN.md 标记任务完成
3. 准备进入 Sprint 2（内容分析）
