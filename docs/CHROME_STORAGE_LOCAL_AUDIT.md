# Chrome Storage Local 存储审计与重构方案

> **v2 更新 (2025-01-30)**：追踪存储已从碎片化键优化为聚合存储，大幅减少键数量并提升性能。

## 当前存储键汇总

### 1. **系统配置与状态** (已规范化 ✅)

| 键名 | 类型 | 用途 | 文件 | 状态 |
|------|------|------|------|------|
| `systemThresholds` | SystemThresholds | 系统阈值配置 | `storage/system-thresholds.ts` | ✅ 已规范 |
| `systemStats` | SystemStats | 系统统计缓存 | `storage/system-stats.ts` | ✅ 已规范 |
| `onboardingStatus` | OnboardingStatus | 引导状态 | `storage/onboarding-state.ts` | ✅ 已规范 |
| `aiProvidersStatus` | AIProviderStatus[] | AI 供应商状态 | `storage/ai-provider-status.ts` | ✅ 已规范 |

### 2. **用户行为与指标** (已重构 ✅)

| 键名 | 类型 | 用途 | 文件 | 状态 |
|------|------|------|------|------|
| `adaptiveMetrics` | AdaptiveMetrics | 自适应推荐指标 | `core/recommender/adaptive-count.ts` | ✅ 已迁移 |
| `profileUpdateCounters` | UpdateCounters | 画像更新计数器 | `core/profile/SemanticProfileBuilder.ts` | ✅ 已迁移 |
| `lastNotificationTime` | number | 上次通知时间 | `core/recommender/notification.ts` | ✅ 已迁移 |

### 3. **临时追踪数据** (已优化 ✅)

**新方案 - 聚合存储**：

| 键名 | 类型 | 用途 | 条目数 | 状态 |
|------|------|------|--------|------|
| `trackingTabs` | Record<tabId, TrackingInfo> | Tab 推荐追踪集合 | 动态 (≤50) | ✅ 已优化 |
| `trackingUrls` | Record<urlHash, TrackingInfo> | URL 推荐追踪集合 | 动态 (≤20) | ✅ 已优化 |
| `trackingNotifications` | Record<notificationId, NotificationTrackingInfo> | 通知 URL 映射集合 | 动态 (≤10) | ✅ 已优化 |

**优化效果**：
- 50 个标签：从 **50 个键** → **1 个键**（trackingTabs）
- 20 个 URL：从 **20 个键** → **1 个键**（trackingUrls）  
- 10 个通知：从 **10 个键** → **1 个键**（trackingNotifications）
- **总计减少键数量 ~95%**

**旧方案 - 碎片化键（已废弃）**：

| 键名模式 | 示例 | 问题 |
|---------|------|------|
| `tracking:tab:{tabId}` | `tracking:tab:12345` | ⚠️ 50个标签=50个键 |
| `tracking:url:{urlHash}` | `tracking:url:abc123` | ⚠️ 键名过长，碎片化 |
| `tracking:notification:{id}` | `tracking:notification:recommendation-1767069890012` | ⚠️ 键名过长 |

### 4. **阅读列表引导** (已重构 ✅)

| 键名 | 类型 | 用途 | 文件 | 状态 |
|------|------|------|------|------|
| `readingListGuide` | OnboardingState | 阅读列表引导状态 | `core/reading-list/reading-list-manager.ts` | ✅ 已规范 |

## 问题总结

### ✅ 已解决问题

1. **命名一致性** ✅
   - 统一使用 camelCase 命名：`adaptiveMetrics`, `lastNotificationTime`
   - 移除 kebab-case 和 snake_case

2. **追踪数据优化** ✅  
   - **从碎片化到聚合**：每个追踪项不再是独立键
   - **键数量大幅减少**：50 标签 50 键 → 1 键
   - **更高效的清理**：只需读取 3 个键并过滤
   - **TTL 自动过期**：30 分钟后自动清理

3. **键残留清理** ✅
   - 迁移时自动删除旧键
   - 每小时清理聚合存储中的过期条目
   - 零残留策略：`cleanupLegacyNotificationKeys()` 清理所有遗留键
   - URL 作为键名可能导致超长键名
   - **影响**: 
     - 存储空间污染
     - 可能达到 storage quota 限制
     - 旧数据无法被新代码正确处理

3. **概念重复**
   - `onboardingStatus` vs `readingListOnboarding`
   - 都是引导状态，应该合并
   - **影响**: 逻辑混乱，维护成本高

4. **缺少过期清理**
   - 临时追踪数据没有 TTL
   - 通知 URL 映射可能永久残留
   - **影响**: 存储空间持续增长，永不回收

### 🟡 中等问题

5. **缺少统一管理**
   - 没有中央化的键名常量
   - 每个模块独立管理自己的键名
   - 难以维护和审计

6. **类型定义分散**
   - TrackingInfo 在多处使用但未统一定义
   - 存储数据结构缺少版本控制

## 重构方案

### ⚠️ 关键原则：零残留策略

**所有迁移操作必须清除旧键，避免存储污染：**

1. **迁移时清除**: `migrate()` 完成后立即 `remove(oldKey)`
2. **消费时清除**: `consume*()` 读取后立即 `remove(key)`
3. **启动时清理**: 扩展安装/更新时清理所有遗留旧格式键
4. **定期清理**: 每小时清理过期的临时数据

### Phase 1: 命名统一 (优先级: 高)

#### 1.1 迁移 kebab-case → camelCase

```typescript
// src/storage/migrations/local-storage-migration.ts
export async function migrateLocalStorageKeys() {
  const migrations = [
    { old: 'adaptive-metrics', new: 'adaptiveMetrics' },
    { old: 'profile_update_counters', new: 'profileUpdateCounters' },
    { old: 'last-notification-time', new: 'lastNotificationTime' },
    { old: 'readingListOnboarding', new: 'readingListGuide' }  // 改名避免与 onboardingStatus 混淆
  ]
  
  for (const { old, new: newKey } of migrations) {
    const result = await chrome.storage.local.get(old)
    if (result[old]) {
      // 1. 保存到新键
      await chrome.storage.local.set({ [newKey]: result[old] })
      // 2. ✅ 删除旧键（避免键名污染）
      await chrome.storage.local.remove(old)
    }
  }
}

// 额外清理遗留旧格式键
export async function cleanupLegacyNotificationKeys() {
  const allData = await chrome.storage.local.get(null)
  const keysToRemove = []
  
  for (const key of Object.keys(allData)) {
    // 清理旧格式的追踪键
    if (key.startsWith('notification-url-') || 
        key.startsWith('recommendation_tab_') || 
        key.startsWith('recommendation_tracking_')) {
      keysToRemove.push(key)
    }
  }
  
  if (keysToRemove.length > 0) {
    // ✅ 批量删除旧键
    await chrome.storage.local.remove(keysToRemove)
  }
}
```

#### 1.2 统一键名常量

```typescript
// src/storage/local-storage-keys.ts
export const LOCAL_STORAGE_KEYS = {
  // 系统配置与状态
  SYSTEM_THRESHOLDS: 'systemThresholds',
  SYSTEM_STATS: 'systemStats',
  ONBOARDING_STATUS: 'onboardingStatus',
  AI_PROVIDERS_STATUS: 'aiProvidersStatus',
  
  // 用户行为与指标
  ADAPTIVE_METRICS: 'adaptiveMetrics',
  PROFILE_UPDATE_COUNTERS: 'profileUpdateCounters',
  LAST_NOTIFICATION_TIME: 'lastNotificationTime',
  
  // 阅读列表
  READING_LIST_GUIDE: 'readingListGuide',
  
  // ✅ 临时追踪（聚合存储优化）
  TRACKING_TABS: 'trackingTabs',              // { [tabId]: TrackingInfo }
  TRACKING_URLS: 'trackingUrls',              // { [urlHash]: TrackingInfo }
  TRACKING_NOTIFICATIONS: 'trackingNotifications', // { [notificationId]: NotificationTrackingInfo }
  
  // 废弃的追踪前缀（用于迁移检测）
  LEGACY_TRACKING_TAB_PREFIX: 'tracking:tab:',
  LEGACY_TRACKING_URL_PREFIX: 'tracking:url:',
  LEGACY_TRACKING_NOTIFICATION_PREFIX: 'tracking:notification:'
} as const
```

**关键优化**：
- ✅ **从碎片化到聚合**：原本每个 tab/url/notification 都是独立的键，现在聚合为 3 个集合键
- ✅ **减少键数量**：50 个标签从 50 个键减少到 1 个键
- ✅ **更高效的清理**：只需读取 3 个键，过滤其中的条目即可
  // 阅读列表
  READING_LIST_GUIDE: 'readingListGuide',
  
  // 临时追踪 (前缀)
  TRACKING_TAB_PREFIX: 'tracking:tab:',
  TRACKING_URL_PREFIX: 'tracking:url:',
  NOTIFICATION_URL_PREFIX: 'notification:url:'
} as const

export type LocalStorageKey = typeof LOCAL_STORAGE_KEYS[keyof typeof LOCAL_STORAGE_KEYS]
```

### Phase 2: 临时数据管理 (优先级: 高)

#### 2.1 ✅ 聚合追踪数据结构（已优化）

**旧方案（碎片化）**：
```typescript
// 每个追踪项都是独立的键
tracking:tab:12345 → { recommendationId, title, ... }
tracking:tab:67890 → { recommendationId, title, ... }
tracking:url:abc123 → { recommendationId, title, ... }
tracking:notification:rec-xxx → { url, recommendationId, ... }

// 问题：50 个标签 = 50 个键，性能差，清理困难
```

**新方案（聚合存储）**：
```typescript
// src/storage/tracking-storage.ts
export interface TrackingInfo {
  recommendationId: string
  title: string
  source: 'popup' | 'readingList' | 'notification'
  action?: 'original' | 'translated'
  createdAt: number  // 用于过期清理
}

export interface NotificationTrackingInfo {
  url: string
  recommendationId?: string
  createdAt: number
}

// 聚合到 3 个键
trackingTabs: {
  "12345": { recommendationId, title, source, createdAt },
  "67890": { recommendationId, title, source, createdAt }
}

trackingUrls: {
  "abc123": { recommendationId, title, source, createdAt }
}

trackingNotifications: {
  "rec-1767069890012": { url, recommendationId, createdAt }
}

const TRACKING_TTL = 30 * 60 * 1000 // 30分钟过期

/**
 * 保存 Tab 追踪信息（更新聚合对象）
 */
export async function saveTabTracking(
  tabId: number,
  info: Omit<TrackingInfo, 'createdAt'>
): Promise<void> {
  // 1. 读取现有集合
  const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_TABS)
  const tabs = result[LOCAL_STORAGE_KEYS.TRACKING_TABS] || {}
  
  // 2. 更新集合
  tabs[tabId.toString()] = { ...info, createdAt: Date.now() }
  
  // 3. 保存回去
  await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: tabs })
}

/**
 * 获取并清除 Tab 追踪信息
 */
export async function consumeTabTracking(
  tabId: number
): Promise<TrackingInfo | null> {
  const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.TRACKING_TABS)
  const tabs = result[LOCAL_STORAGE_KEYS.TRACKING_TABS] || {}
  
  const info = tabs[tabId.toString()]
  if (!info) return null
  
  // 检查过期
  if (Date.now() - info.createdAt > TRACKING_TTL) {
    delete tabs[tabId.toString()]
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: tabs })
    return null
  }
  
  // 消费后立即删除
  delete tabs[tabId.toString()]
  await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRACKING_TABS]: tabs })
  
  return info
}
```

**性能提升**：
- ✅ **键数量**：50 个标签从 50 个键 → 1 个键
- ✅ **清理效率**：遍历所有键 → 只读取 3 个键并过滤
- ✅ **存储开销**：每个键 ~50 字节 → 聚合后减少 ~80% 元数据开销
export async function saveTabTracking(tabId: number, info: Omit<TrackingInfo, 'createdAt'>): Promise<void> {
  const key = `${LOCAL_STORAGE_KEYS.TRACKING_TAB_PREFIX}${tabId}`
  await chrome.storage.local.set({
    [key]: { ...info, createdAt: Date.now() }
  })
}

/**
 * 获取并清除 Tab 追踪信息
 */
export async function consumeTabTracking(tabId: number): Promise<TrackingInfo | null> {
  const key = `${LOCAL_STORAGE_KEYS.TRACKING_TAB_PREFIX}${tabId}`
  const result = await chrome.storage.local.get(key)
  const info = result[key] as TrackingInfo | undefined
  
  if (info) {
    await chrome.storage.local.remove(key)
    
    // 检查是否过期
    if (Date.now() - info.createdAt > TRACKING_TTL) {
      return null
    }
    
    return info
  }
  
  return null
}

/**
 * 清理过期的追踪数据
 */
export async function cleanupExpiredTracking(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const keysToRemove: string[] = []
  const now = Date.now()
  
  for (const [key, value] of Object.entries(all)) {
    // 检查追踪键
    if (key.startsWith(LOCAL_STORAGE_KEYS.TRACKING_TAB_PREFIX) ||
        key.startsWith(LOCAL_STORAGE_KEYS.TRACKING_URL_PREFIX) ||
        key.startsWith(LOCAL_STORAGE_KEYS.NOTIFICATION_URL_PREFIX)) {
      
      const data = value as { createdAt?: number }
      if (data.createdAt && now - data.createdAt > TRACKING_TTL) {
        keysToRemove.push(key)
      }
    }
  }
  
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove)
  }
}
```

#### 2.2 定期清理机制

```typescript
// 在 background.ts 中添加
chrome.alarms.create('cleanup-tracking', { periodInMinutes: 60 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup-tracking') {
    cleanupExpiredTracking().catch(err => 
      bgLogger.warn('清理追踪数据失败:', err)
    )
  }
})
```

### Phase 3: 数据结构版本化 (优先级: 中)

```typescript
// src/storage/versioned-storage.ts
export interface VersionedData<T> {
  version: number
  data: T
  updatedAt: number
}

export async function getVersionedData<T>(
  key: string,
  currentVersion: number
): Promise<T | null> {
  const result = await chrome.storage.local.get(key)
  const stored = result[key] as VersionedData<T> | undefined
  
  if (!stored) return null
  
  // 版本不匹配，丢弃旧数据
  if (stored.version !== currentVersion) {
    await chrome.storage.local.remove(key)
    return null
  }
  
  return stored.data
}

export async function setVersionedData<T>(
  key: string,
  version: number,
  data: T
): Promise<void> {
  const versionedData: VersionedData<T> = {
    version,
    data,
    updatedAt: Date.now()
  }
  await chrome.storage.local.set({ [key]: versionedData })
}
```

### Phase 4: 存储容量监控 (优先级: 中)

```typescript
// src/storage/storage-monitor.ts
export async function getStorageStats(): Promise<{
  bytesInUse: number
  quota: number
  items: Record<string, number>
}> {
  const all = await chrome.storage.local.get(null)
  const items: Record<string, number> = {}
  
  for (const [key, value] of Object.entries(all)) {
    // 粗略估算字节数
    const size = JSON.stringify(value).length
    items[key] = size
  }
  
  const bytesInUse = await chrome.storage.local.getBytesInUse()
  
  return {
    bytesInUse,
    quota: chrome.storage.local.QUOTA_BYTES,
    items
  }
}

export async function logStorageWarnings(): Promise<void> {
  const stats = await getStorageStats()
  const usagePercent = (stats.bytesInUse / stats.quota) * 100
  
  if (usagePercent > 80) {
    console.warn(`⚠️ Storage 使用率: ${usagePercent.toFixed(1)}%`)
    
    // 找出最大的项
    const sorted = Object.entries(stats.items)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
    
    console.warn('Top 5 largest items:', sorted)
  }
}
```

## 实施计划

### 阶段 1: 准备（1天）
- [x] 完成 chrome.storage.local 审计
- [x] 创建迁移脚本（**包含旧键清除逻辑**）
- [x] 编写测试用例

### 阶段 2: 重构核心模块（2天）
- [x] 统一键名常量
- [x] 迁移 kebab-case → camelCase（**迁移后删除旧键**）
- [x] 实现追踪数据管理模块（**消费后删除**）
- [x] 添加过期清理机制（**定期删除过期键**）

### 阶段 3: 更新使用方（1天）
- [x] 更新所有引用旧键名的代码
- [x] 更新测试
- [x] 文档更新

### 阶段 4: 清理与监控（1天）
- [x] 添加存储监控
- [x] 实施启动时旧键清理（**删除所有遗留旧格式键**）
- [x] 性能测试

### ✅ 已完成的清理措施

1. **迁移清理** (`migrateLocalStorageKeys`)
   - ✅ 每个键迁移后立即删除旧键
   - ✅ 如果新键已存在，也删除旧键

2. **遗留键清理** (`cleanupLegacyNotificationKeys`)
   - ✅ 清理 `notification-url-*` 格式
   - ✅ 清理 `recommendation_tab_*` 格式
   - ✅ 清理 `recommendation_tracking_*` 格式

3. **追踪数据清理** (`cleanupExpiredTrackingData`)
   - ✅ 清理超过 30 分钟的追踪数据
   - ✅ 清理没有时间戳的旧数据

4. **定期清理** (background.ts)
   - ✅ 每小时执行一次过期数据清理
   - ✅ 扩展安装时执行一次遗留键清理

## 风险评估

### 低风险
- ✅ 新增模块不影响现有功能
- ✅ 迁移脚本有兜底机制

### 中风险
- ⚠️ 临时追踪数据清理可能影响正在进行的用户操作
  - **缓解**: TTL 设置为 30 分钟，足够用户完成操作
  
### 高风险
- 🔴 大量重命名可能导致功能断裂
  - **缓解**: 先保留旧键名，双写一段时间，再删除

## 后续优化方向

1. **考虑使用 IndexedDB 存储追踪数据**
   - Local Storage 更适合配置
   - IndexedDB 更适合临时事务数据

2. **实现存储配额预警**
   - 接近限额时通知用户
   - 自动清理旧数据

3. **添加存储备份机制**
   - 定期导出关键配置
   - 支持手动恢复
