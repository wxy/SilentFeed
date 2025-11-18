# 开发者工具和调试命令

## RSS 源统计更新

### 问题
在浏览器中查看 RSS 列表时,可能看不到新增的统计数据字段(analyzedCount, readCount, dislikedCount)。

### 原因
现有的 RSS 源数据可能是在添加新字段之前创建的,需要重新计算统计数据。

### 解决方案

#### 方法 1: 等待下次抓取
新的统计数据会在下次 RSS 抓取后自动更新。

#### 方法 2: 手动触发统计更新

**步骤 1**: 打开 Service Worker 控制台
- Chrome 扩展管理页面 (`chrome://extensions/`)
- 找到 FeedAIMuter
- 点击 "Service Worker" 下的 "inspect"

**步骤 2**: 在控制台中执行以下代码

```javascript
// 注意：db 对象已经在 background.ts 中全局可用
// 直接使用 Dexie 访问数据库

(async () => {
  // 使用全局的 Dexie 实例
  const dbName = 'FeedAIMuterDB';
  const idb = await indexedDB.databases();
  const hasDB = idb.some(db => db.name === dbName);
  
  if (!hasDB) {
    console.error('❌ 数据库不存在');
    return;
  }
  
  // 直接打开数据库
  const request = indexedDB.open(dbName);
  
  request.onsuccess = async (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['discoveredFeeds'], 'readwrite');
    const store = transaction.objectStore('discoveredFeeds');
    
    // 获取所有已订阅的源
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = async () => {
      const feeds = getAllRequest.result.filter(f => f.status === 'subscribed');
      console.log(`找到 ${feeds.length} 个已订阅源`);
      
      // 更新每个源的统计
      const updateTransaction = db.transaction(['discoveredFeeds'], 'readwrite');
      const updateStore = updateTransaction.objectStore('discoveredFeeds');
      
      for (const feed of feeds) {
        const articles = feed.latestArticles || [];
        
        const stats = {
          articleCount: articles.length,
          analyzedCount: articles.filter(a => a.analysis).length,
          recommendedCount: articles.filter(a => a.recommended).length,
          readCount: articles.filter(a => a.read).length,
          dislikedCount: articles.filter(a => a.disliked).length,
          unreadCount: articles.filter(a => !a.read).length
        };
        
        // 更新对象
        Object.assign(feed, stats);
        updateStore.put(feed);
        
        console.log(`✅ 更新: ${feed.title}`, stats);
      }
      
      updateTransaction.oncomplete = () => {
        console.log('✨ 所有统计数据已更新，请刷新 RSS 管理页面');
        db.close();
      };
    };
  };
  
  request.onerror = () => {
    console.error('❌ 打开数据库失败:', request.error);
  };
})();
```

#### 方法 3: 简化版本（推荐）

如果上面的脚本太复杂，可以使用这个简化版本：

```javascript
// 等待下次 RSS 抓取时自动更新
// 或者在设置页面手动点击"刷新"按钮
console.log('提示: 统计数据会在下次 RSS 抓取时自动更新');
console.log('您也可以在 RSS 管理页面手动触发抓取');
```

### 验证

更新后,在 RSS 管理页面中应该看到类似这样的统计信息:

```
📰 25 (✓12 / ⭐8 / 👁5 / 👎2)
```

说明:
- **📰 25** - 总文章数 (latestArticles 总数)
- **✓12** - 已分析数 (有 AI 分析的文章，蓝色)
- **⭐8** - 已推荐数 (进入过推荐池的文章，绿色)
- **👁5** - 推荐已读数 (推荐池中被阅读的推荐数，灰色) ⭐ **核心指标**
- **👎2** - 不想读数 (标记为不想读的文章，红色)

**重要说明**：
- `推荐已读数` 是从**推荐池（recommendations 表）**统计的，反映了用户点击阅读推荐的次数
- 这是一个**累计值**，包括历史上所有被阅读的推荐（即使文章已从 latestArticles 中移除）
- 与 `已推荐数` 对比，可以看出推荐的阅读转化率

## 自适应推荐间隔调试

### 查看当前间隔状态

```javascript
// 注意: 这些信息会在 Service Worker 日志中定期输出
// 查找包含 [RecommendationScheduler] 的日志
```

### 手动触发推荐生成

```javascript
// 方法 1: 使用 Chrome Alarms API
chrome.alarms.create('generate-recommendations', { when: Date.now() });
console.log('✅ 已触发推荐生成任务');

// 方法 2: 等待自动执行
// 推荐任务会根据待推荐文章数量自动调整间隔（1-20分钟）
```

## RSS 抓取调试

### 手动触发单个源的抓取

```javascript
// 使用 Chrome Alarms API 触发立即抓取
chrome.alarms.create('fetch-rss-feeds', { when: Date.now() });
console.log('✅ 已触发 RSS 抓取任务');

// 抓取结果会在 Service Worker 日志中显示
// 查找包含 [FeedScheduler] 的日志
```

## 清理测试数据

### 重置所有 RSS 源统计

```javascript
// 使用 IndexedDB API 直接操作
(async () => {
  const dbName = 'FeedAIMuterDB';
  const request = indexedDB.open(dbName);
  
  request.onsuccess = (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['discoveredFeeds'], 'readwrite');
    const store = transaction.objectStore('discoveredFeeds');
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      const feeds = getAllRequest.result;
      const updateTransaction = db.transaction(['discoveredFeeds'], 'readwrite');
      const updateStore = updateTransaction.objectStore('discoveredFeeds');
      
      for (const feed of feeds) {
        feed.articleCount = 0;
        feed.analyzedCount = 0;
        feed.recommendedCount = 0;
        feed.readCount = 0;
        feed.dislikedCount = 0;
        feed.unreadCount = 0;
        feed.latestArticles = [];
        updateStore.put(feed);
      }
      
      updateTransaction.oncomplete = () => {
        console.log('✅ 已重置所有 RSS 源统计');
        db.close();
      };
    };
  };
})();
```

## 日志查看

### 启用详细日志

在 `src/utils/logger.ts` 中设置日志级别:

```typescript
// 开发模式：显示所有日志
const LOG_LEVEL = 'debug'

// 生产模式：只显示重要日志
const LOG_LEVEL = 'info'
```

### 过滤特定标签的日志

```javascript
// 在浏览器控制台中过滤日志
// 例如: 只看推荐调度器的日志
// 使用 Chrome DevTools 的 Filter 功能，输入: [RecommendationScheduler]
```

## 推荐已读数说明

### 什么是"推荐已读数"？

`推荐已读数`（recommendedReadCount）是指从该 RSS 源生成的推荐中，被用户点击阅读的推荐数量。

**统计来源**：
```javascript
// 从推荐池（recommendations 表）统计
const recommendedReadCount = await db.recommendations
  .where('sourceUrl').equals(feedUrl)
  .and(rec => rec.isRead === true)
  .count()
```

**与其他指标的关系**：
- `总文章数`：RSS 源的所有文章
- `已推荐数`：进入推荐池的文章数
- `推荐已读数`：推荐池中被阅读的数量（**核心转化指标**）

**示例**：
```
📰 100 (✓80 / ⭐20 / 👁15 / 👎3)
```
- 100 篇文章
- 80 篇经过 AI 分析
- 20 篇进入推荐池
- 15 篇推荐被用户点击阅读 → **阅读转化率 75%**
- 3 篇被标记为不想读

### 为什么推荐已读数可能是 0？

1. **还没有点击阅读任何推荐**：正常情况，需要在弹窗中点击推荐
2. **推荐刚生成**：统计会在点击后立即更新
3. **sourceUrl 不匹配**：推荐的来源 URL 和 RSS 源 URL 不一致

### 如何验证推荐已读数？

#### 步骤 1: 检查推荐池中的已读记录

```javascript
// 使用 IndexedDB API 查询
(async () => {
  const dbName = 'FeedAIMuterDB';
  const request = indexedDB.open(dbName);
  
  request.onsuccess = (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['recommendations'], 'readonly');
    const store = transaction.objectStore('recommendations');
    const index = store.index('isRead');
    const readRequest = index.getAll(true); // 获取所有 isRead=true 的记录
    
    readRequest.onsuccess = () => {
      const readRecs = readRequest.result;
      console.log(`总共 ${readRecs.length} 条已读推荐`);
      
      // 按来源分组
      const bySource = {};
      readRecs.forEach(rec => {
        bySource[rec.sourceUrl] = (bySource[rec.sourceUrl] || 0) + 1;
      });
      
      console.log('各源的推荐已读数:');
      for (const [url, count] of Object.entries(bySource)) {
        console.log(`  ${url}: ${count} 条`);
      }
      
      db.close();
    };
  };
})();
```

#### 步骤 2: 触发统计更新

点击推荐后，系统会自动调用 `updateFeedStats(sourceUrl)` 更新统计。

如果统计未更新，可以手动触发：
```javascript
// 方法 1: 使用统计更新脚本（见上文"方法 2"）
// 方法 2: 等待下次 RSS 抓取自动更新
```

## 阅读数问题诊断（已废弃）

**注意**：Phase 7 优化后，已改用 `recommendedReadCount` 作为核心阅读指标。

原来的 `readCount`（latestArticles 中的 read 字段）已不再使用，因为：
1. latestArticles 只保留最近 20-50 篇文章，历史数据会丢失
2. 推荐可能来自不同时间的文章，无法准确反映推荐阅读情况
3. `recommendedReadCount` 直接从推荐池统计，更准确可靠

### 问题: 点击推荐后推荐已读数不增加

#### 诊断步骤 1: 检查推荐表的 isRead 状态

点击推荐后，应该看到推荐表中对应记录的 `isRead` 字段变为 `true`。

```javascript
// 使用 IndexedDB API 检查最新推荐的状态
(async () => {
  const dbName = 'FeedAIMuterDB';
  const request = indexedDB.open(dbName);
  
  request.onsuccess = (event) => {
    const db = event.target.result;
    
    // 获取最新的推荐
    const recTransaction = db.transaction(['recommendations'], 'readonly');
    const recStore = recTransaction.objectStore('recommendations');
    const recIndex = recStore.index('recommendedAt');
    const recRequest = recIndex.openCursor(null, 'prev'); // 倒序
    
    recRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        console.log('❌ 没有推荐记录');
        db.close();
        return;
      }
      
      const rec = cursor.value;
      console.log('📝 最新推荐信息:', {
        id: rec.id,
        title: rec.title,
        sourceUrl: rec.sourceUrl,
        isRead: rec.isRead,
        clickedAt: rec.clickedAt
      });
      
      // 查找对应的 RSS 源
      const feedTransaction = db.transaction(['discoveredFeeds'], 'readonly');
      const feedStore = feedTransaction.objectStore('discoveredFeeds');
      const feedIndex = feedStore.index('url');
      const feedRequest = feedIndex.get(rec.sourceUrl);
      
      feedRequest.onsuccess = () => {
        const feed = feedRequest.result;
        if (!feed) {
          console.log('❌ 未找到对应的 RSS 源:', rec.sourceUrl);
          console.log('💡 提示: sourceUrl 可能不匹配，检查 RSS 源列表');
        } else {
          console.log('📊 RSS 源统计:', {
            title: feed.title,
            url: feed.url,
            recommendedCount: feed.recommendedCount || 0,
            recommendedReadCount: feed.recommendedReadCount || 0
          });
          
          if (rec.isRead && feed.recommendedReadCount === 0) {
            console.log('⚠️ 推荐已标记为已读，但 recommendedReadCount 为 0');
            console.log('💡 可能需要手动触发统计更新（见上文"方法 2"）');
          }
        }
        
        db.close();
      };
    };
  };
  
  request.onerror = () => {
    console.error('❌ 打开数据库失败:', request.error);
  };
})();
```

#### 诊断步骤 2: 检查 updateFeedStats 执行日志

点击推荐后，在 Service Worker 控制台中应该看到:

```
[DB] markAsRead 开始: { id: 'rec-xxx', ... }
[DB] 找到推荐记录: { ... }
[DB] 开始更新 RSS 源统计: https://...
[DB] 更新 RSS 源统计: { feedUrl, feedTitle, 推荐已读: 1, ... }
✅ RSS 源统计已更新
```

如果看到错误或警告，说明统计更新失败。

#### 诊断步骤 3: 验证 sourceUrl 匹配

推荐的 `sourceUrl` 必须与 RSS 源的 `url` 完全匹配，统计才能正确更新。

```javascript
// 统计每个源的已读推荐数
(async () => {
  const dbName = 'FeedAIMuterDB';
  const request = indexedDB.open(dbName);
  
  request.onsuccess = (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['recommendations'], 'readonly');
    const store = transaction.objectStore('recommendations');
    const index = store.index('isRead');
    const readRequest = index.getAll(true); // 获取所有 isRead=true 的记录
    
    readRequest.onsuccess = () => {
      const readRecs = readRequest.result;
      console.log(`找到 ${readRecs.length} 条已读推荐`);
      
      // 按来源分组统计
      const readCountBySource = new Map();
      for (const rec of readRecs) {
        const count = readCountBySource.get(rec.sourceUrl) || 0;
        readCountBySource.set(rec.sourceUrl, count + 1);
      }
      
      console.log('各源的已读推荐数:');
      for (const [sourceUrl, count] of readCountBySource) {
        console.log(`  ${sourceUrl}: ${count} 条`);
      }
      
      db.close();
    };
  };
  
  request.onerror = () => {
    console.error('❌ 操作失败:', request.error);
  };
})();
```

