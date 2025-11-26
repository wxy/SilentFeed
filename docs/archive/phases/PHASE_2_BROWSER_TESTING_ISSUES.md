# Phase 2 浏览器测试问题分析与解决方案

**日期**: 2025-11-04  
**状态**: 调查中

---

## 问题汇总

### 1. ✅ recommendationStore.ts 类型错误（已修复）

**问题描述**:
- `RecommendationStats` 接口字段与 `getRecommendationStats()` 返回值不匹配
- 编译错误：缺少 total, read, readRate 等字段

**原因**:
接口定义使用了早期设计的字段名，但实际实现使用了不同的命名（totalCount, readCount 等）

**解决方案**:
修改 `RecommendationStats` 接口，与数据库函数返回值保持一致：
```typescript
interface RecommendationStats {
  totalCount: number        // 总推荐数
  readCount: number         // 已读数
  unreadCount: number       // 未读数
  readLaterCount: number    // 稍后阅读数
  dismissedCount: number    // 已忽略数
  avgReadDuration: number   // 平均阅读时长（秒）
  topSources: Array<{...}>
}
```

**状态**: ✅ 已提交

---

### 2. 🔍 同一页面出现多条访问记录

**问题描述**:
- 用户访问一个页面后，数据库中出现多条相同 URL 的记录
- 可能原因：SPA 路由变化、页面多次加载 content script

**已知行为**:
- page-tracker.ts 中有 `isRecorded` 标志防止重复记录
- 但每次页面刷新或导航会重新初始化 content script
- SPA 内部路由变化（如 GitHub 仓库切换）可能触发新的 content script

**潜在原因**:
1. **SPA 路由导致 URL 变化**:
   - 用户在同一网站内导航（如 GitHub: repo1 → repo2）
   - 每个 URL 被视为独立页面
   - 停留超过 30 秒后都会被记录

2. **Content Script 多次注入**:
   - Plasmo 可能在某些情况下重复注入
   - 或者页面刷新导致重新初始化

3. **浏览器历史导航**:
   - 用户前进/后退到同一 URL
   - 每次访问都是新的会话

**调查方法**:
1. 在浏览器控制台粘贴 `debug_indexeddb.js` 脚本
2. 查看同一 URL 的多条记录的时间戳
3. 检查 `visitTime` 差异，判断是否为独立访问

**下一步**:
- [ ] 用户运行调试脚本，报告结果
- [ ] 确认是否需要"去重"逻辑
- [ ] 考虑添加"同一 URL 短时间内不重复记录"机制

---

### 3. 🔍 只能看到当前标签页的 URL

**问题描述**:
- 用户在 Chrome DevTools → Application → IndexedDB 中查看数据
- 只看到当前标签页 URL 的记录
- 怀疑 IndexedDB 按标签页隔离

**技术事实**:
❌ **IndexedDB 不是按标签页隔离的！**

IndexedDB 是按**扩展作用域**隔离的：
- 同一个 Chrome 扩展的所有页面共享同一个数据库
- Background、Popup、Content Script 都访问相同的数据库实例
- 数据是全局的，不受标签页影响

**可能原因**:

#### 原因 A: Chrome DevTools 显示问题
- Chrome DevTools 的 Application 面板可能有缓存
- 需要刷新或重新打开 DevTools

#### 原因 B: 查看位置错误
- 如果在**网页的 DevTools** 中查看：
  - 只能看到该网页自己的 IndexedDB（如果有）
  - 看不到**扩展的** IndexedDB
  
**正确查看方法**:
1. **通过扩展页面查看**（推荐）:
   ```
   1. 打开 chrome://extensions/
   2. 找到 SilentFeed
   3. 点击 "检查视图" → "service worker"（或 Popup）
   4. 在弹出的 DevTools 中：
      - Application → Storage → IndexedDB → SilentFeedDB
   ```

2. **使用调试脚本**:
   - 在**任意网页**的控制台粘贴 `debug_indexeddb.js`
   - 脚本会直接查询扩展的数据库

#### 原因 C: 数据库未正确初始化
- Background Service Worker 可能未启动
- 数据库未创建或打开失败

**验证方法**:
1. 运行 `debug_indexeddb.js` 脚本查看所有数据
2. 检查是否真的只有当前 URL，还是 DevTools 显示有问题

**下一步**:
- [ ] 用户使用正确方法查看扩展的 IndexedDB
- [ ] 报告实际看到的数据量

---

### 4. 🔍 徽章和弹窗显示采集数为 0

**问题描述**:
- 弹窗和徽章显示 0/1000 页
- 但数据库中有记录

**相关代码**:
- `src/popup.tsx` 使用 `getPageCount()` 获取计数
- `src/core/badge/BadgeManager.ts` 也使用 `getPageCount()`
- 函数定义在 `src/storage/db.ts`

**可能原因**:

#### 原因 A: Background Service Worker 未启动
- Badge 更新需要 background.ts 监听消息
- 如果 background 未运行，badge 不会更新

**验证方法**:
```javascript
// 在网页控制台运行
chrome.runtime.sendMessage({ type: 'GET_PAGE_COUNT' }, response => {
  console.log('Background 返回的页面数:', response)
})
```

#### 原因 B: 数据库未及时同步
- Content script 写入数据
- Background/Popup 读取时数据库未刷新

#### 原因 C: 查询逻辑问题
```typescript
// src/storage/db.ts
export async function getPageCount(): Promise<number> {
  const count = await db.confirmedVisits.count()
  return count
}
```

**调试步骤**:
1. 在 Popup DevTools 中运行：
   ```javascript
   import { getPageCount } from '~storage/db'
   const count = await getPageCount()
   console.log('页面计数:', count)
   ```

2. 检查 background.ts 日志：
   - 查找 `[Badge]` 相关日志
   - 确认是否收到更新消息

3. 手动触发更新：
   - 访问新页面
   - 等待 30 秒
   - 查看控制台是否有 "已记录到数据库" 消息

**下一步**:
- [ ] 用户在 Popup DevTools 中手动查询 `getPageCount()`
- [ ] 检查 background.ts 是否运行
- [ ] 报告实际计数值

---

## 调试工具

### 1. IndexedDB 查看脚本

在**任意网页**的控制台粘贴运行：

```javascript
// 查看扩展数据库的完整内容
const dbName = 'SilentFeedDB';
const request = indexedDB.open(dbName);

request.onsuccess = function(event) {
  const db = event.target.result;
  console.log('✅ 数据库打开成功');
  console.log('数据库版本:', db.version);
  console.log('表名:', Array.from(db.objectStoreNames));
  
  const transaction = db.transaction(['confirmedVisits'], 'readonly');
  const store = transaction.objectStore('confirmedVisits');
  const getAllRequest = store.getAll();
  
  getAllRequest.onsuccess = function() {
    const visits = getAllRequest.result;
    console.log('📊 confirmedVisits 表数据:');
    console.log('总记录数:', visits.length);
    
    // 按 URL 分组
    const urlMap = new Map();
    visits.forEach(v => {
      const count = urlMap.get(v.url) || 0;
      urlMap.set(v.url, count + 1);
    });
    
    console.log('\n📍 按 URL 统计:');
    for (const [url, count] of urlMap.entries()) {
      console.log(`  ${url}: ${count} 条记录`);
    }
    
    console.table(visits.map(v => ({
      url: v.url.substring(0, 50),
      title: v.title,
      duration: v.duration,
      visitTime: new Date(v.visitTime).toLocaleString(),
      source: v.source
    })));
  };
};
```

### 2. 页面计数查询

在 **Popup DevTools** 控制台运行：

```javascript
// 查询页面计数
const { db } = await import('~storage/db')
const count = await db.confirmedVisits.count()
console.log('📊 页面计数:', count)

// 查看最近 10 条记录
const recent = await db.confirmedVisits
  .orderBy('visitTime')
  .reverse()
  .limit(10)
  .toArray()
console.table(recent.map(v => ({
  url: v.url.substring(0, 40),
  title: v.title,
  duration: v.duration,
  time: new Date(v.visitTime).toLocaleString()
})))
```

### 3. Background 消息测试

在**任意网页**控制台运行：

```javascript
// 测试 background 通信
chrome.runtime.sendMessage(
  { type: 'UPDATE_BADGE' }, 
  response => {
    console.log('Background 响应:', response)
  }
)
```

---

## 下一步行动

### 立即执行（用户）:
1. ✅ 确认类型错误已修复（重新构建）
2. 🔍 运行 IndexedDB 查看脚本，报告：
   - 总记录数
   - 按 URL 统计结果
   - 同一 URL 的多条记录的时间差
3. 🔍 使用正确方法查看扩展的 IndexedDB
4. 🔍 在 Popup DevTools 中手动查询页面计数

### 待分析（开发者）:
- [ ] 根据用户反馈判断是否需要"去重"逻辑
- [ ] 确认 badge 更新机制是否正常工作
- [ ] 优化 SPA 路由变化的处理

---

**最后更新**: 2025-11-04  
**文档版本**: 1.0
