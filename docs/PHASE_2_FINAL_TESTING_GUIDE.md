# Phase 2.7 浏览器测试 - 最终指南

**日期**: 2025-11-04  
**版本**: 最新 (da7a93c)  
**状态**: 准备测试

---

## 📋 已修复的问题总结

### 1. ✅ recommendationStore.ts 类型错误
- **问题**: 接口字段与数据库函数不匹配
- **修复**: 更新接口定义
- **提交**: 6fab4a0

### 2. ✅ Chrome storage 访问失败
- **问题**: `chrome.storage.local` undefined 错误
- **修复**: 多层安全检查 + 可选链
- **提交**: 2b655b0

### 3. ✅ 数据库版本冲突导致数据丢失
- **问题**: 版本 20 → 2 时自动删除数据库
- **根因**: 过度保护的版本检查逻辑
- **修复**: 移除删除逻辑，信任 Dexie
- **提交**: da7a93c
- **影响**: 之前的 26 条测试数据已丢失，需重新收集

---

## 🎯 测试前准备

### 1. 重新加载扩展

```
方法 1: 刷新扩展
1. chrome://extensions/
2. 找到 SilentFeed
3. 点击 "刷新" 按钮 (🔄)

方法 2: 重新加载
1. chrome://extensions/
2. 删除旧扩展
3. "加载已解压的扩展程序"
4. 选择: build/chrome-mv3-prod
```

### 2. 清理旧数据（可选）

如果想重新开始：
```
1. chrome://settings/content/all
2. 搜索 "chrome-extension://" + 扩展ID
3. 点击垃圾桶图标删除
4. 或者使用开发者工具删除 IndexedDB
```

### 3. 验证扩展已启动

```
1. chrome://extensions/
2. SilentFeed → "检查视图" → "service worker"
3. 查看控制台应该有：
   ✅ [Background] 扩展已安装/更新，开始初始化...
   ✅ [DB] 数据库已打开（版本 2）
   ✅ [BadgeManager] 徽章已更新（冷启动）: 0
   ✅ [Background] Service Worker 启动完成
```

---

## 🧪 核心功能测试清单

### 测试 1: 页面访问追踪 ⭐⭐⭐⭐⭐

**目标**: 验证页面访问能正确记录

**步骤**:
1. 访问任意网页（如 https://github.com）
2. 打开控制台（F12）
3. 等待 30 秒，期间进行交互（滚动、点击）

**期望日志**:
```
🚀 [PageTracker] 页面访问追踪已启动
👆 [PageTracker] 用户交互: scroll
🎯 [PageTracker] 达到阈值，开始记录
💾 [PageTracker] 准备记录页面访问
✅ [PageTracker] 页面访问已记录到数据库
```

**验证数据库**:
在任意页面控制台运行：
```javascript
const request = indexedDB.open('SilentFeedDB');
request.onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction('confirmedVisits', 'readonly');
  const store = tx.objectStore('confirmedVisits');
  store.count().onsuccess = (e) => {
    console.log('📊 总记录数:', e.target.result);
  };
};
```

**通过标准**: 
- ✅ 控制台无错误
- ✅ 30秒后有 "已记录到数据库" 消息
- ✅ 数据库中记录数 +1

---

### 测试 2: 徽章更新 ⭐⭐⭐⭐⭐

**目标**: 验证徽章显示正确的页面计数

**步骤**:
1. 访问 3-5 个不同网页，每个停留 30 秒以上
2. 观察扩展图标上的徽章

**期望行为**:
- 初始: 显示 `0`（或不显示）
- 第 1 个页面记录后: 显示 `1`
- 第 2 个页面记录后: 显示 `2`
- ...依此类推

**颜色**:
- 0-1000 页: 🟢 绿色（柔和绿 #4CAF93）

**手动验证**:
```
1. 点击扩展图标打开 Popup
2. 右键 Popup → 检查
3. 在 DevTools 控制台运行：
```
```javascript
// 方法 1: 使用 Dexie（可能需要等待 import）
setTimeout(async () => {
  const module = await import(chrome.runtime.getURL('popup.js'));
  // 然后手动访问 db
}, 1000);

// 方法 2: 直接查询 IndexedDB
const request = indexedDB.open('SilentFeedDB');
request.onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction('confirmedVisits', 'readonly');
  tx.objectStore('confirmedVisits').count().onsuccess = (e) => {
    console.log('📊 实际页面计数:', e.target.result);
  };
};
```

**通过标准**:
- ✅ 徽章数字与数据库记录数一致
- ✅ 颜色为绿色
- ✅ Popup 中显示相同数字

---

### 测试 3: Popup 界面 ⭐⭐⭐⭐

**目标**: 验证冷启动界面显示正确

**步骤**:
1. 记录 5-10 个页面访问
2. 点击扩展图标打开 Popup

**期望显示**:
```
┌─────────────────────────────┐
│  🌱 RSS 静音器               │
├─────────────────────────────┤
│  欢迎使用智能 RSS 阅读器      │
│                              │
│  ╔═══════════════════════╗   │
│  ║ ██░░░░░░░░░░░░░░░░░░░ ║ 5/1000│
│  ╚═══════════════════════╝   │
│                              │
│  🌱 探索者阶段                │
│  📖 继续浏览，我会学习你的    │
│     兴趣...                   │
│                              │
│  [设置]                       │
└─────────────────────────────┘
```

**通过标准**:
- ✅ 显示正确的页面计数（如 5/1000）
- ✅ 进度条填充比例正确（5/1000 = 0.5%）
- ✅ 显示 "🌱 探索者阶段"
- ✅ 设置按钮可点击

---

### 测试 4: 设置页面 ⭐⭐⭐

**目标**: 验证设置页面正常工作

**步骤**:
1. 点击 Popup 中的 "设置" 按钮
2. 或直接右键图标 → "选项"

**期望显示**:
- 4 个标签页：常规、RSS 源管理、AI、数据与隐私
- 语言选择下拉框
- 各设置项为禁用状态（预留）

**通过标准**:
- ✅ 设置页面能打开
- ✅ 标签切换流畅
- ✅ 无控制台错误

---

### 测试 5: 多页面并发 ⭐⭐⭐

**目标**: 验证多个标签页同时记录

**步骤**:
1. 打开 5 个不同标签页
2. 每个标签停留 30+ 秒
3. 观察徽章更新

**期望行为**:
- 每个页面独立追踪
- 30 秒后各自记录
- 徽章实时更新（可能有延迟）

**通过标准**:
- ✅ 最终数据库中有 5 条记录
- ✅ 每条记录的 URL 不同
- ✅ 无重复记录（同一 URL 在短时间内只记录一次）

---

### 测试 6: SPA 路由变化 ⭐⭐

**目标**: 验证 GitHub 等 SPA 网站的行为

**步骤**:
1. 访问 https://github.com
2. 停留 30+ 秒（记录第 1 条）
3. 点击导航到另一个 repo
4. 停留 30+ 秒（应该记录第 2 条）

**期望行为**:
- URL 变化触发新的追踪会话
- 每个 URL 独立记录
- 不是 bug，是正常行为

**通过标准**:
- ✅ 两个 URL 都被记录
- ✅ duration 分别计算
- ✅ 无重复或丢失

---

### 测试 7: 来源检测（可选）⭐

**目标**: 验证 source 字段正确

**步骤**:
1. 直接访问网页（有机访问）
2. 从 Google 搜索结果点击（搜索来源）

**查看数据**:
```javascript
const request = indexedDB.open('SilentFeedDB');
request.onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction('confirmedVisits', 'readonly');
  tx.objectStore('confirmedVisits').getAll().onsuccess = (e) => {
    console.table(e.target.result.map(v => ({
      url: v.url.substring(0, 40),
      source: v.source || 'undefined',
      time: new Date(v.visitTime).toLocaleString()
    })));
  };
};
```

**期望**:
- 直接访问: `source: 'organic'`
- 搜索引擎: `source: 'search'`
- 未检测到: `source: undefined` 或 `'organic'`

**通过标准**:
- ✅ 大部分记录有 source 字段
- ✅ 逻辑合理（不强制 100% 准确）

---

## 🐛 已知问题和限制

### 1. 同一 URL 多条记录 ✅ 正常行为

**现象**: GitHub 等网站同一 URL 有多条记录

**原因**:
- 用户多次访问同一页面
- SPA 内部路由变化
- 每次访问都是独立会话

**不是 Bug**: 这是正确的设计

---

### 2. 徽章更新延迟 ✅ 可接受

**现象**: 页面记录后徽章可能不立即更新

**原因**:
- Background 消息传递有延迟
- 徽章更新需要查询数据库

**影响**: 关闭 Popup 重新打开会刷新

---

### 3. 开发模式下的上下文失效 ✅ 已处理

**现象**: Hot reload 后看到上下文错误

**影响**: 仅开发环境，已降级为 debug 日志

---

### 4. 数据库版本历史遗留 ✅ 已修复

**现象**: 之前有版本 20，现在是版本 2

**影响**: 旧数据已丢失，重新开始收集

**状态**: 不再自动删除数据库

---

## 📊 测试报告模板

完成测试后，请报告：

```markdown
### 测试环境
- Chrome 版本: ___
- 扩展版本: da7a93c
- 测试日期: 2025-11-04

### 测试结果
- [ ] 测试 1: 页面访问追踪
  - 状态: ✅ 通过 / ❌ 失败
  - 备注: ___

- [ ] 测试 2: 徽章更新
  - 状态: ✅ 通过 / ❌ 失败
  - 实际计数: ___
  - 徽章显示: ___

- [ ] 测试 3: Popup 界面
  - 状态: ✅ 通过 / ❌ 失败
  - 备注: ___

- [ ] 测试 4: 设置页面
  - 状态: ✅ 通过 / ❌ 失败

- [ ] 测试 5: 多页面并发
  - 状态: ✅ 通过 / ❌ 失败
  - 测试页面数: ___
  - 实际记录数: ___

### 发现的问题
1. ___
2. ___

### 控制台错误
```贴出任何错误信息```

### 数据库统计
- 总记录数: ___
- URL 数量: ___
- 时间跨度: ___
```

---

## ✅ 测试通过标准

满足以下条件即可合并到 master:

1. ✅ 页面访问能正常记录（30 秒阈值）
2. ✅ 数据库中有记录
3. ✅ 徽章显示正确数字
4. ✅ Popup 界面正常显示
5. ✅ 设置页面可访问
6. ✅ 无严重错误（允许 debug 日志）
7. ✅ 多标签页能并发工作

**非必须**:
- 来源检测（可选功能）
- 完美的实时更新（可接受延迟）
- 100% 的日志清洁（debug 日志可接受）

---

## 🚀 测试后操作

### 如果测试通过:
```bash
git checkout master
git merge feature/phase-2.7-ui-feedback
git push origin master
git tag v0.2.7 -m "Phase 2.7: 实时反馈界面完成"
git push origin v0.2.7
```

### 如果发现问题:
1. 报告问题详情
2. 等待修复
3. 重新测试

---

**准备好了吗？开始测试吧！** 🎉

---

**最后更新**: 2025-11-04  
**文档版本**: 2.0
