# 诊断推荐问题

## 问题描述

用户报告:
1. RSS 的 `recommendedCount` 增加了，但推荐统计和弹窗中看不到新推荐
2. 无法确认 RSS 定时抓取是否正常工作
3. 低频 RSS (VSCode Feed, 0.4篇/周) 缺少下次抓取计划

## 诊断步骤

### 步骤 1: 检查数据库状态

打开 Chrome 扩展页面，点击 "Service Worker" 旁边的 "inspect"，在 Console 中运行以下代码：

```javascript
(async () => {
  // 直接打开 IndexedDB
  const dbRequest = indexedDB.open('SilentFeedDB');
  const db = await new Promise((resolve, reject) => {
    dbRequest.onsuccess = () => resolve(dbRequest.result);
    dbRequest.onerror = () => reject(dbRequest.error);
  });
  
  // 辅助函数：从 object store 获取所有数据
  const getAll = (storeName, filter = null) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const data = request.result;
        resolve(filter ? data.filter(filter) : data);
      };
      request.onerror = () => reject(request.error);
    });
  };
  
  // 1. 检查订阅的 RSS 源
  console.log('=== RSS 源状态 ===');
  const allFeeds = await getAll('discoveredFeeds');
  const subscribedFeeds = allFeeds.filter(f => f.status === 'subscribed');
  
  for (const feed of subscribedFeeds) {
    const unanalyzed = feed.latestArticles?.filter(a => !a.analysis).length || 0;
    const recommended = feed.latestArticles?.filter(a => a.recommended).length || 0;
    
    console.log(`[${feed.title}]`);
    console.log(`  URL: ${feed.url}`);
    console.log(`  recommendedCount: ${feed.recommendedCount || 0}`);
    console.log(`  recommendedReadCount: ${feed.recommendedReadCount || 0}`);
    console.log(`  未分析文章: ${unanalyzed}`);
    console.log(`  标记为推荐的文章: ${recommended}`);
    console.log(`  最后抓取: ${feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString() : '从未'}`);
    console.log(`  下次抓取: ${feed.nextScheduledFetch ? new Date(feed.nextScheduledFetch).toLocaleString() : '未安排'}`);
    console.log(`  更新频率: ${feed.updateFrequency || 0} 篇/周`);
    console.log('');
  }
  
  // 2. 检查推荐池
  console.log('=== 推荐池状态 ===');
  const allRecs = await getAll('recommendations');
  const unreadRecs = allRecs.filter(r => !r.isRead);
  
  console.log(`总推荐数: ${allRecs.length}`);
  console.log(`未读推荐: ${unreadRecs.length}`);
  console.log('');
  
  // 3. 检查 sourceUrl 匹配
  console.log('=== sourceUrl 匹配检查 ===');
  const feedUrls = new Set(subscribedFeeds.map(f => f.url));
  const unmatchedRecs = allRecs.filter(rec => !feedUrls.has(rec.sourceUrl));
  
  if (unmatchedRecs.length > 0) {
    console.warn(`⚠️ 发现 ${unmatchedRecs.length} 条推荐的 sourceUrl 不匹配:`);
    unmatchedRecs.forEach(rec => {
      console.log(`  - ${rec.title}`);
      console.log(`    推荐的 sourceUrl: ${rec.sourceUrl}`);
      console.log(`    可能的匹配源:`);
      subscribedFeeds.forEach(feed => {
        if (rec.url.includes(new URL(feed.url).hostname)) {
          console.log(`      * ${feed.title} (${feed.url})`);
        }
      });
    });
  } else {
    console.log('✅ 所有推荐的 sourceUrl 都匹配订阅源');
  }
  
  // 4. 显示最近的推荐
  console.log('=== 最近 5 条推荐 ===');
  const recentRecs = allRecs
    .sort((a, b) => b.recommendedAt - a.recommendedAt)
    .slice(0, 5);
  
  recentRecs.forEach(rec => {
    console.log(`[${rec.isRead ? '已读' : '未读'}] ${rec.title}`);
    console.log(`  评分: ${rec.score.toFixed(2)}`);
    console.log(`  来源: ${rec.source}`);
    console.log(`  sourceUrl: ${rec.sourceUrl}`);
    console.log(`  推荐时间: ${new Date(rec.recommendedAt).toLocaleString()}`);
    console.log('');
  });
})();
```

### 步骤 2: 检查后台任务日志

在同一个 Console 中运行：

```javascript
// 查看最近的日志（如果启用了日志持久化）
chrome.storage.local.get(['logs'], (result) => {
  if (result.logs) {
    console.log('=== 最近日志 ===');
    const recentLogs = result.logs
      .filter(log => 
        log.tag === 'Background' || 
        log.tag === 'FeedScheduler' || 
        log.tag === 'RecommendationService'
      )
      .slice(-20);
    
    recentLogs.forEach(log => {
      console.log(`[${log.tag}] ${log.level}: ${log.message}`);
    });
  } else {
    console.log('日志未启用持久化');
  }
});

// 检查定时器状态
chrome.alarms.getAll((alarms) => {
  console.log('=== 定时器状态 ===');
  alarms.forEach(alarm => {
    console.log(`${alarm.name}:`);
    console.log(`  下次触发: ${new Date(alarm.scheduledTime).toLocaleString()}`);
    if (alarm.periodInMinutes) {
      console.log(`  间隔: ${alarm.periodInMinutes} 分钟`);
    }
  });
});
```

### 步骤 3: 手动触发推荐生成

```javascript
// 手动触发一次推荐生成
(async () => {
  const { recommendationService } = await import('./core/recommender/RecommendationService.js');
  
  console.log('开始手动生成推荐...');
  const result = await recommendationService.generateRecommendations(
    1,  // 生成 1 条
    'subscribed',
    10
  );
  
  console.log('推荐生成结果:', result.stats);
  console.log('生成的推荐:', result.recommendations);
})();
```

### 步骤 4: 检查 feed-scheduler 状态

```javascript
(async () => {
  const { feedScheduler } = await import('./background/feed-scheduler.js');
  const { db } = await import('./storage/db.js');
  
  console.log('=== Feed Scheduler 状态 ===');
  console.log('运行中:', feedScheduler.isRunning);
  
  // 检查需要抓取的源
  const now = Date.now();
  const feeds = await db.discoveredFeeds
    .where('status')
    .equals('subscribed')
    .and(feed => feed.isActive !== false)
    .toArray();
  
  const needFetch = feeds.filter(feed => 
    !feed.nextScheduledFetch || feed.nextScheduledFetch <= now
  );
  
  console.log(`订阅源总数: ${feeds.length}`);
  console.log(`需要抓取: ${needFetch.length}`);
  
  if (needFetch.length > 0) {
    console.log('待抓取的源:');
    needFetch.forEach(feed => {
      console.log(`  - ${feed.title}`);
      console.log(`    下次抓取: ${feed.nextScheduledFetch ? new Date(feed.nextScheduledFetch).toLocaleString() : '未安排'}`);
    });
  }
})();
```

## 可能的问题和解决方案

### 问题 1: sourceUrl 不匹配

**症状**: `recommendedCount` 增加，但推荐在池中找不到

**原因**: `RecommendationService.saveRecommendations()` 中设置的 `sourceUrl` 与实际 RSS 源的 `url` 字段不一致

**解决方案**: 
1. 检查 `extractBaseUrl()` 逻辑是否正确
2. 确保使用 `feed.url` 而不是 `feed.link`
3. 修复 `updateFeedStats()` 查询逻辑

### 问题 2: 推荐生成但未保存

**症状**: 日志显示生成了推荐，但数据库中没有

**原因**: 
- 推荐池已满且新推荐分数不够高
- 推荐是重复的（7天内已推荐过）
- 数据库保存失败

**解决方案**: 检查日志中的详细信息

### 问题 3: RSS 定时抓取不工作

**症状**: `lastFetchedAt` 和 `nextScheduledFetch` 没有更新

**原因**:
- feed-scheduler 未启动
- 所有源都有 `nextScheduledFetch` 且时间未到
- 源被标记为 `isActive: false`

**解决方案**: 
1. 检查 feed-scheduler.isRunning
2. 手动触发一次抓取测试
3. 检查 Chrome alarms 是否正常

### 问题 4: 低频 RSS 缺少调度计划

**症状**: VSCode Feed (0.4篇/周) 没有 `nextScheduledFetch`

**原因**:
- `updateFrequency` 计算错误或为 0
- 调度逻辑未正确计算下次抓取时间
- 首次抓取后未设置 `nextScheduledFetch`

**解决方案**: 检查 feed-scheduler 中的频率计算逻辑

## 预期修复

基于诊断结果，可能需要：

1. **修复 sourceUrl 设置**: 确保使用准确的 feed.url
2. **改进调度逻辑**: 为低频源设置合理的默认抓取间隔
3. **添加日志**: 在关键路径添加更多日志便于调试
4. **缓存问题**: 检查 statsCache 是否影响了统计显示
