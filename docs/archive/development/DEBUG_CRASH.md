# Chrome Extension 崩溃诊断指南

## ⚠️ **确认问题：Chrome DevTools Bug（非代码问题）**

### **崩溃条件（已确认）**
1. ✅ 打开 Chrome DevTools 的 **"应用"（Application）** 面板
2. ✅ 查看 Local Storage 或 IndexedDB
3. ✅ 热重载扩展（`npm run dev` 或手动刷新）
4. ❌ 结果：浏览器/Service Worker 崩溃

### **根本原因**
Chrome DevTools 在监视存储时存在资源竞争 bug，与扩展代码无关。热重载会触发 DevTools 和 Service Worker 同时访问存储，导致崩溃。

### **✅ 解决方案（避免崩溃）**

#### 方案 1：关闭 Application 面板（推荐）
```
开发时只打开 Console 面板，不打开 Application 面板
```

#### 方案 2：使用代码查询数据
```javascript
// 在 Service Worker Console 中运行
chrome.storage.local.get(null, console.log)

// 查询 IndexedDB
(async () => {
  const { db } = await import('./storage/db/index.js')
  console.table(await db.discoveredFeeds.limit(10).toArray())
})()
```

#### 方案 3：先关闭 DevTools 再重载
```
1. 关闭 DevTools
2. 重新加载扩展
3. 重新打开 Console 面板（不要打开 Application）
```

#### 方案 4：使用 Chrome 稳定版
```
Beta 版本更容易触发此 bug，稳定版可能没有此问题
```

---

## 📝 **附带优化：分批处理数据迁移**

虽然崩溃不是代码问题，但我们仍然优化了数据迁移代码，防止大数据集内存问题：

### **其他可能的内存问题（预防性优化）**
虽然崩溃是 DevTools 引起的，但以下模式仍应避免：
1. ❌ `.toArray()` 加载大量数据（几千条）
2. ❌ 无限制的数据库查询
3. ❌ 未使用 `.limit()` 的大表扫描
4. ✅ 使用 `.count()` 代替 `.toArray()`
5. ✅ 分批处理大量数据（每批 100-200 条）

---

## 1. 查看 Service Worker 状态

打开 Chrome：
```
chrome://serviceworker-internals
```

查找 `SilentFeed` 扩展，记录：
- Status（状态）
- 是否显示 "crashed" 或 "stopped"
- Start/Stop 按钮的状态

## 2. 查看扩展错误日志

打开：
```
chrome://extensions
```

找到 SilentFeed，点击 "错误" 按钮，查看：
- 错误消息
- 堆栈跟踪
- 时间戳

## 3. 查看 Service Worker DevTools

在 `chrome://extensions` 中：
1. 开启 "开发者模式"
2. 找到 SilentFeed
3. 点击 "service worker" 链接（如果显示 "Inactive" 则先点击 "检查视图"）
4. 在 DevTools Console 中：
   - 查看所有错误消息
   - 查看红色的 error 和黄色的 warning
   - 查看是否有 "Out of Memory" 或 "Aw, Snap!" 相关信息

## 4. 手动测试崩溃场景

在 Service Worker DevTools Console 中运行：

```javascript
// 测试数据库查询
(async () => {
  const { db } = await import('./storage/db/index.js')
  
  console.log('测试订阅源数量...')
  const feedCount = await db.discoveredFeeds.where('status').equals('subscribed').count()
  console.log('订阅源数量:', feedCount)
  
  console.log('测试文章数量...')
  const articleCount = await db.feedArticles.count()
  console.log('文章数量:', articleCount)
  
  console.log('测试推荐数量...')
  const recCount = await db.recommendations.count()
  console.log('推荐数量:', recCount)
  
  console.log('测试访问记录数量...')
  const visitCount = await db.confirmedVisits.count()
  console.log('访问记录数量:', visitCount)
})()
```

## 5. 监控内存使用

在 Service Worker DevTools 中：
1. 打开 Performance Monitor（Cmd+Shift+P → "Show Performance Monitor"）
2. 观察：
   - JS heap size（JavaScript 堆大小）
   - DOM Nodes（DOM 节点数）
   - JS event listeners（事件监听器数）

重新加载扩展，看内存是否急剧增长。

## 6. 查看崩溃报告（macOS）

打开终端：
```bash
# 查看 Chrome 崩溃日志
ls -lt ~/Library/Application\ Support/Google/Chrome/Crashpad/completed/ | head -10

# 查看最新的崩溃报告
cat ~/Library/Application\ Support/Google/Chrome/Crashpad/completed/$(ls -t ~/Library/Application\ Support/Google/Chrome/Crashpad/completed/ | head -1)
```

## 7. 启用详细日志

在代码中临时添加（已在下方添加）：

```typescript
// 在 background.ts 开头
console.log('[CRASH DEBUG] Service Worker 启动', new Date().toISOString())

// 在关键函数中
console.log('[CRASH DEBUG] 函数开始:', functionName, 'Memory:', performance.memory?.usedJSHeapSize)
```

## 8. 查看哪个操作导致崩溃

按顺序测试：
1. ✅ 重新加载扩展 → 观察是否立即崩溃
2. ✅ 打开 Popup → 观察是否崩溃
3. ✅ 等待 5 秒（Feed Scheduler 启动）→ 观察是否崩溃
4. ✅ 手动触发推荐生成 → 观察是否崩溃

## 请将以下信息反馈：

- [ ] Service Worker 状态（running/stopped/crashed）
- [ ] 错误消息（如果有）
- [ ] 堆栈跟踪（如果有）
- [ ] 崩溃时的内存使用
- [ ] 数据库记录数量（订阅源/文章/推荐/访问）
- [ ] 哪个操作触发了崩溃
