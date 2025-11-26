# Chrome 扩展权限说明

## 权限列表

SilentFeed 使用以下 Chrome 扩展权限：

### 1. `storage` ✅
**用途**: 数据存储
- 存储用户画像（兴趣关键词、浏览历史）
- 存储 RSS 订阅配置
- 存储推荐设置和用户反馈
- 存储 AI 配置（API Key 等）

**隐私保护**:
- 所有数据仅存储在本地
- 可选同步到 Chrome 账户（需用户授权）
- 不上传到任何第三方服务器

---

### 2. `tabs` ✅
**用途**: 标签页管理
- 读取当前标签页 URL 和标题
- 跟踪用户浏览行为（构建兴趣画像）
- 打开推荐文章的新标签页

**隐私保护**:
- 仅收集公开访问的网页
- 自动排除敏感网站（内网、银行等）
- 原始数据 90 天后自动删除

---

### 3. `alarms` ⏰
**用途**: 定时任务调度

#### 使用场景：

**1. RSS 定期抓取** (Phase 5)
```typescript
// 每 30 分钟抓取一次 RSS 更新
chrome.alarms.create('fetch-rss', {
  periodInMinutes: 30
})
```
- 自动获取订阅源的最新文章
- 后台静默运行，不打扰用户

**2. 推荐数量定期评估** (Phase 6)
```typescript
// 每周评估一次推荐数量
chrome.alarms.create('evaluate-recommendations', {
  periodInMinutes: 7 * 24 * 60 // 7天
})
```
- 根据用户行为智能调整推荐数量（1-5条）
- 分析点击率、不想读率等指标

**3. 用户画像定期更新** (Phase 3)
```typescript
// 每天更新一次兴趣画像
chrome.alarms.create('update-profile', {
  periodInMinutes: 24 * 60
})
```
- 分析最近浏览记录
- 更新兴趣关键词权重

**为什么需要 `alarms` 而不是 `setTimeout`?**
- ✅ Service Worker 可能随时休眠，`setTimeout` 会失效
- ✅ `alarms` 保证在指定时间触发，即使扩展未激活
- ✅ 节省资源，不需要常驻后台

---

### 4. `notifications` 🔔
**用途**: 推送通知

#### 使用场景：

**1. 新推荐通知** (Phase 6)
```typescript
// 有新推荐时通知用户
chrome.notifications.create({
  title: "📚 Silent Feed - 新推荐 (3)",
  message: "Vue.js Composition API 深度指南\n\n来自: Vue.js 官方博客"
})
```

**2. 重要事件提醒**
- RSS 订阅源发现（可选）
- 学习阶段完成（1000页）
- 系统错误提示

**克制设计**:
- ✅ 默认静默时段：22:00 - 08:00
- ✅ 最小通知间隔：60分钟
- ✅ 用户可完全禁用
- ✅ 不强制交互（自动消失）

**与 `alarms` 的配合使用**:
```typescript
// alarms 定时检查是否有新推荐
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'check-recommendations') {
    const newRecs = await getNewRecommendations()
    
    if (newRecs.length > 0) {
      // 使用 notifications 通知用户
      await sendRecommendationNotification(newRecs.length)
    }
  }
})
```

---

### 5. `host_permissions: ["https://*/*"]` 🌐
**用途**: 网络请求权限
- 抓取 RSS 源内容
- 验证 RSS URL
- 全文抓取推荐文章（可选）

**限制**:
- 仅 HTTPS 网站
- 不访问本地文件（file://）
- 不访问内网（自动排除）

---

## 权限对比表

| 权限 | 触发方式 | 持久性 | 用户可见性 | 主要用途 |
|------|---------|--------|-----------|---------|
| **alarms** | 系统定时触发 | ✅ 持久化 | ❌ 后台静默 | 定期任务（RSS抓取、数据分析） |
| **notifications** | 代码主动触发 | ❌ 一次性 | ✅ 用户可见 | 重要事件提醒 |
| storage | 代码调用 | ✅ 持久化 | ❌ 后台 | 数据存储 |
| tabs | 事件监听 | ❌ 实时 | ❌ 后台 | 浏览行为跟踪 |

---

## 实际工作流示例

### 推荐系统完整流程：

```
1️⃣ [alarms] 每30分钟触发 RSS 抓取
   ↓
2️⃣ [host_permissions] 请求 RSS 源
   ↓
3️⃣ [storage] 保存文章到数据库
   ↓
4️⃣ [alarms] 每周评估推荐数量
   ↓
5️⃣ [tabs] 分析用户兴趣
   ↓
6️⃣ [storage] 生成推荐列表
   ↓
7️⃣ [notifications] 通知用户有新推荐
   ↓
8️⃣ [tabs] 用户点击后打开文章
```

---

## 隐私保护承诺

✅ **本地优先**: 所有数据默认仅存储在本地  
✅ **用户控制**: 用户可随时删除数据、禁用功能  
✅ **最小权限**: 仅申请必要权限  
✅ **透明公开**: 所有代码开源，可审计  
✅ **数据生命周期**: 原始数据 90 天后自动删除  

---

## 常见问题

### Q: 为什么需要 `tabs` 权限？
A: 用于分析浏览行为构建兴趣画像，这是推荐系统的基础。我们只收集 URL 和标题，不读取页面内容。

### Q: `notifications` 会不会很烦人？
A: 不会。我们设计了克制的通知策略：
- 默认静默时段（晚上不打扰）
- 最小通知间隔（1小时）
- 用户可完全禁用

### Q: `alarms` 会不会耗电？
A: 不会。Chrome 会智能调度定时器，只在必要时唤醒扩展，不影响电池寿命。

### Q: 数据会上传到服务器吗？
A: **不会**。所有数据仅存储在本地。如果使用云端 AI（如 OpenAI），只会发送文章文本用于分析，不会上传浏览历史。

---

**最后更新**: 2025年11月12日 (Phase 6)
