# Chrome Storage 架构重构方案

## 背景

当前存储结构存在以下问题：

1. **命名不一致**：`aiConfig` vs `recommendation-config` vs `notification-config`
2. **阈值分散**：硬编码在代码中，不便于遥测和动态调整
3. **缺少统计缓存**：频繁查询 IndexedDB 增加性能开销
4. **配置分散**：相关配置散落在不同位置，难以维护

## 设计原则

### 1. 命名规范统一

**规则：所有配置 key 使用 camelCase 命名**

- ✅ `aiConfig`
- ❌ `recommendation-config` → 改为 `recommendationConfig`
- ❌ `notification-config` → 改为 `notificationConfig`
- ❌ `ui_style` → 改为 `uiConfig`

### 2. Storage 分离原则

**Sync vs Local 的选择标准**：

| 类型 | Storage | 原因 |
|------|---------|------|
| 用户偏好配置 | `sync` | 跨设备一致体验 |
| 设备特定阈值 | `local` | 不同设备独立优化 |
| 实时统计数据 | `local` | 设备独立状态，不应同步 |
| 临时追踪数据 | `local` | 生命周期短，不需同步 |

**核心逻辑**：
- 📱 **配置同步**：用户选择和偏好应该跨设备一致
- 🖥️ **数据隔离**：统计、阈值、状态是设备特定的
- 🚫 **避免冲突**：同步统计数据会导致设备间互相覆盖

### 3. 兜底策略必备

**三层防护**：
1. **内存缓存**：减少 Storage 访问频率
2. **持久化存储**：可靠的数据源
3. **默认值兜底**：确保系统永不崩溃

**实现要求**：
- ✅ 所有配置读取必须有 try-catch
- ✅ Storage 为空时自动初始化默认值
- ✅ 读取失败时返回默认值而不是 throw
- ✅ 过期数据优于无数据（先返回旧数据，后台刷新）

### 2. Storage 类型选择

**chrome.storage.sync**（跨设备同步，100KB 限制）：
- ✅ 用户配置（UI、通知、推荐偏好）
- ✅ AI 配置（加密后的 API Key）
- ✅ 语言设置
- ❌ **不应包含**：统计数据、阈值、设备特定状态

**chrome.storage.local**（本地存储，设备特定，无限制）：
- ✅ 系统阈值（设备特定优化）
- ✅ 统计数据缓存（设备实时状态）
- ✅ 引导状态（`onboardingStatus`）
- ✅ 临时数据（tab tracking）
- ✅ 大容量缓存
- ✅ 遥测数据暂存

**IndexedDB**（持久化数据库）：
- 历史记录（visits, recommendations）
- 用户画像（profile, snapshots）
- RSS 数据（feeds, articles）
- AI 用量记录

## 兜底策略设计

### 核心原则

**永不崩溃**：所有配置和统计读取必须有兜底逻辑，确保系统在任何情况下都能正常运行。

### 策略层次

```typescript
/**
 * 三层兜底策略
 * 
 * Level 1: 内存缓存（最快）
 * - 5 分钟内有效
 * - 避免频繁 Storage 访问
 * 
 * Level 2: Chrome Storage（可靠）
 * - 持久化存储
 * - 读取失败时进入 Level 3
 * 
 * Level 3: 默认值（兜底）
 * - 硬编码的默认配置
 * - 保证系统基本功能
 */
```

### 实现示例

#### 1. 配置读取兜底

```typescript
/**
 * 安全的配置读取模板
 */
async function getSafeConfig<T>(
  storageKey: string,
  defaultValue: T,
  storage: 'sync' | 'local' = 'sync'
): Promise<T> {
  try {
    const result = await chrome.storage[storage].get(storageKey)
    
    if (result[storageKey]) {
      // 深度合并默认值（处理新增字段）
      return deepMerge(defaultValue, result[storageKey])
    }
    
    // 不存在时初始化默认值
    await chrome.storage[storage].set({ [storageKey]: defaultValue })
    return defaultValue
    
  } catch (error) {
    console.warn(`Failed to load ${storageKey}, using default:`, error)
    return defaultValue
  }
}
```

#### 2. 缓存过期处理

```typescript
/**
 * 带过期检查的缓存读取
 */
interface CachedData<T> {
  data: T
  timestamp: number
  version: number  // 用于强制失效
}

async function getCachedData<T>(
  storageKey: string,
  defaultValue: T,
  expirationMs: number,
  refreshFn: () => Promise<T>
): Promise<T> {
  try {
    const result = await chrome.storage.local.get(storageKey)
    const cached = result[storageKey] as CachedData<T> | undefined
    
    if (cached) {
      const age = Date.now() - cached.timestamp
      
      if (age < expirationMs) {
        // 未过期，直接返回
        return cached.data
      }
      
      // 过期，后台刷新（不阻塞）
      refreshFn().then(fresh => {
        chrome.storage.local.set({
          [storageKey]: {
            data: fresh,
            timestamp: Date.now(),
            version: 1
          }
        })
      }).catch(err => console.warn('Failed to refresh cache:', err))
      
      // 返回过期数据（总比没有好）
      return cached.data
    }
    
    // 缓存不存在，立即刷新
    const fresh = await refreshFn()
    await chrome.storage.local.set({
      [storageKey]: {
        data: fresh,
        timestamp: Date.now(),
        version: 1
      }
    })
    return fresh
    
  } catch (error) {
    console.warn(`Cache read failed for ${storageKey}:`, error)
    return defaultValue
  }
}
```

#### 3. 迁移失败兜底

```typescript
/**
 * 安全的配置迁移
 */
async function migrateConfigSafely<TOld, TNew>(
  oldKey: string,
  newKey: string,
  transform: (old: TOld) => TNew,
  defaultValue: TNew
): Promise<void> {
  try {
    // 1. 检查新配置是否已存在
    const newConfig = await chrome.storage.sync.get(newKey)
    if (newConfig[newKey]) {
      console.log(`${newKey} already exists, skip migration`)
      return
    }
    
    // 2. 读取旧配置
    const oldConfig = await chrome.storage.sync.get(oldKey)
    
    if (oldConfig[oldKey]) {
      // 3. 转换并保存
      const transformed = transform(oldConfig[oldKey])
      await chrome.storage.sync.set({ [newKey]: transformed })
      
      // 4. 删除旧配置
      await chrome.storage.sync.remove(oldKey)
      
      console.log(`Migrated ${oldKey} → ${newKey}`)
    } else {
      // 5. 旧配置不存在，初始化默认值
      await chrome.storage.sync.set({ [newKey]: defaultValue })
      console.log(`Initialized ${newKey} with default`)
    }
    
  } catch (error) {
    // 6. 迁移失败不影响系统运行
    console.warn(`Migration failed: ${oldKey} → ${newKey}`, error)
    
    // 7. 确保新配置存在（即使迁移失败）
    try {
      const check = await chrome.storage.sync.get(newKey)
      if (!check[newKey]) {
        await chrome.storage.sync.set({ [newKey]: defaultValue })
      }
    } catch (e) {
      console.error('Failed to ensure config exists:', e)
    }
  }
}
```

#### 4. 统计同步失败兜底

```typescript
/**
 * 容错的统计同步
 */
async function syncStatsWithFallback(): Promise<void> {
  const TIMEOUT = 5000 // 5 秒超时
  
  try {
    // 使用 Promise.race 添加超时
    await Promise.race([
      syncSystemStats(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sync timeout')), TIMEOUT)
      )
    ])
  } catch (error) {
    console.warn('Stats sync failed, using stale cache:', error)
    
    // 确保缓存存在（即使是空值）
    const stats = await chrome.storage.local.get('systemStats')
    if (!stats.systemStats) {
      await chrome.storage.local.set({
        systemStats: createEmptyStats()
      })
    }
  }
}
```

### 错误处理原则

1. **分层降级**：缓存 → Storage → 默认值
2. **静默失败**：记录日志但不中断用户体验
3. **后台重试**：非关键操作异步重试
4. **状态通知**：关键错误通过 UI 告知用户

### 测试要求

每个配置读取函数必须测试：

```typescript
describe('Config fallback', () => {
  it('should return cached value when valid', async () => { ... })
  it('should return default when storage is empty', async () => { ... })
  it('should return default when storage.get throws', async () => { ... })
  it('should refresh expired cache in background', async () => { ... })
  it('should initialize default value on first read', async () => { ... })
})
```

## 配置重构方案

### Phase 1: 统一命名（Breaking Change）

#### 1.1 重命名配置 Key

```typescript
// 旧 → 新
'recommendation-config' → 'recommendationConfig'
'notification-config' → 'notificationConfig'
'ui_style' → 'uiConfig.style'
'auto_translate' → 'uiConfig.autoTranslate'
'i18nextLng' → 'language'
```

#### 1.2 迁移脚本

创建 `src/storage/migrations/storage-key-migration.ts`：

```typescript
/**
 * Storage Key 命名规范迁移
 * 从 kebab-case 和 snake_case 统一到 camelCase
 */
export async function migrateStorageKeys(): Promise<void> {
  const migrations = [
    { old: 'recommendation-config', new: 'recommendationConfig' },
    { old: 'notification-config', new: 'notificationConfig' },
    { old: 'ui_style', new: 'uiConfig' }, // 同时合并为对象
    { old: 'auto_translate', new: 'uiConfig' },
  ]
  
  const sync = await chrome.storage.sync.get(null)
  const updates: Record<string, any> = {}
  const removes: string[] = []
  
  // ui_style + auto_translate → uiConfig
  if (sync['ui_style'] || sync['auto_translate']) {
    updates.uiConfig = {
      style: sync['ui_style'] || 'normal',
      autoTranslate: sync['auto_translate'] ?? true
    }
    removes.push('ui_style', 'auto_translate')
  }
  
  // 其他简单重命名
  for (const { old, new: newKey } of migrations) {
    if (old === 'ui_style' || old === 'auto_translate') continue
    if (sync[old] && !sync[newKey]) {
      updates[newKey] = sync[old]
      removes.push(old)
    }
  }
  
  // 批量更新
  if (Object.keys(updates).length > 0) {
    await chrome.storage.sync.set(updates)
    await chrome.storage.sync.remove(removes)
    console.log('✅ Storage keys 迁移完成:', updates)
  }
}
```

### Phase 2: 系统阈值配置化

#### 2.1 新增 `systemThresholds` 配置

⚠️ **存储位置**：`chrome.storage.local`（设备特定）

**原因**：
- 阈值根据设备使用情况动态调整
- 不同设备的使用模式可能不同（PC vs 移动设备）
- 避免跨设备同步导致的配置冲突

```typescript
/**
 * 系统阈值配置
 * 存储在 chrome.storage.local（设备特定）
 * 支持根据设备使用情况动态调整
 */
export interface SystemThresholds {
  /**
   * 学习阶段完成所需页面数
   * 当前固定值：100
   * 未来可根据用户行为动态调整
   */
  learningCompletePages: number
  
  /**
   * Feed 抓取间隔阈值（小时）
   */
  feedFetchIntervals: {
    /** 高频源（≥7 篇/周）*/
    highFrequency: number  // 默认 6
    /** 中频源（3-7 篇/周）*/
    mediumFrequency: number  // 默认 12
    /** 低频源（1-2 篇/周）*/
    lowFrequency: number  // 默认 24
    /** 超低频源（<1 篇/周）*/
    ultraLowFrequency: number  // 默认 168 (7天)
  }
  
  /**
   * 推荐生成间隔阈值（分钟）
   */
  recommendationIntervals: {
    /** 待推荐 ≥20 条 */
    veryHigh: number  // 默认 1
    /** 待推荐 10-19 条 */
    high: number  // 默认 3
    /** 待推荐 5-9 条 */
    medium: number  // 默认 5
    /** 待推荐 1-4 条 */
    low: number  // 默认 10
    /** 待推荐 0 条 */
    idle: number  // 默认 20
  }
  
  /**
   * 推荐质量阈值
   */
  recommendationQuality: {
    /** 推荐池最低质量分数（0-1）*/
    minQualityScore: number  // 默认 0.6
    /** TF-IDF 最低分数（0-1）*/
    minTfidfScore: number  // 默认 0.1
  }
  
  /**
   * 通知阈值
   */
  notification: {
    /** 最小间隔（分钟）*/
    minIntervalMinutes: number  // 默认 60
  }
  
  /**
   * UI 相关阈值
   */
  ui: {
    /** RSS 列表最大显示数量 */
    maxVisibleFeeds: number  // 默认 50
    /** 冷启动阶段阈值 */
    coldStartStages: Array<{
      ratio: number  // 进度比例
      title: string  // 阶段标题
    }>
  }
  
  /**
   * 缓存阈值
   */
  cache: {
    /** 统计缓存过期时间（毫秒）*/
    statsExpiration: number  // 默认 30000 (30s)
  }
  
  /**
   * 容错阈值
   */
  resilience: {
    /** 熔断器失败阈值 */
    circuitBreakerFailures: number  // 默认 5
    /** 熔断器重置超时（毫秒）*/
    circuitBreakerResetMs: number  // 默认 60000
    /** 指数退避最大重试次数 */
    maxRetries: number  // 默认 3
  }
}

/**
 * 默认系统阈值
 */
export const DEFAULT_SYSTEM_THRESHOLDS: SystemThresholds = {
  learningCompletePages: 100,
  
  feedFetchIntervals: {
    highFrequency: 6,
    mediumFrequency: 12,
    lowFrequency: 24,
    ultraLowFrequency: 168
  },
  
  recommendationIntervals: {
    veryHigh: 1,
    high: 3,
    medium: 5,
    low: 10,
    idle: 20
  },
  
  recommendationQuality: {
    minQualityScore: 0.6,
    minTfidfScore: 0.1
  },
  
  notification: {
    minIntervalMinutes: 60
  },
  
  ui: {
    maxVisibleFeeds: 50,
    coldStartStages: [
      { ratio: 0, title: '刚起步' },
      { ratio: 0.2, title: '初步了解' },
      { ratio: 0.5, title: '深入探索' },
      { ratio: 0.8, title: '即将完成' },
      { ratio: 1.0, title: '准备就绪' }
    ]
  },
  
  cache: {
    statsExpiration: 30000
  },
  
  resilience: {
    circuitBreakerFailures: 5,
    circuitBreakerResetMs: 60000,
    maxRetries: 3
  }
}
```

#### 2.2 系统阈值管理接口

创建 `src/storage/system-thresholds.ts`：

```typescript
const STORAGE_KEY = 'systemThresholds'
const CACHE_DURATION = 5 * 60 * 1000 // 5 分钟缓存

// 内存缓存
let cachedThresholds: SystemThresholds | null = null
let cacheTimestamp: number = 0

/**
 * 获取系统阈值配置（带缓存和兜底）
 * 
 * 策略：
 * 1. 优先使用内存缓存（5 分钟内有效）
 * 2. 从 chrome.storage.local 读取
 * 3. 如果不存在或读取失败，使用默认值
 * 4. 自动保存默认值到 storage（初始化）
 */
export async function getSystemThresholds(): Promise<SystemThresholds> {
  // 1. 检查内存缓存
  const now = Date.now()
  if (cachedThresholds && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedThresholds
  }
  
  try {
    // 2. 从 storage 读取
    const result = await chrome.storage.local.get(STORAGE_KEY)
    
    if (result[STORAGE_KEY]) {
      // 合并默认值（处理新增字段）
      const merged = deepMerge(DEFAULT_SYSTEM_THRESHOLDS, result[STORAGE_KEY])
      
      // 更新缓存
      cachedThresholds = merged
      cacheTimestamp = now
      
      return merged
    }
    
    // 3. 不存在时初始化默认值
    await chrome.storage.local.set({ 
      [STORAGE_KEY]: DEFAULT_SYSTEM_THRESHOLDS 
    })
    
    cachedThresholds = DEFAULT_SYSTEM_THRESHOLDS
    cacheTimestamp = now
    
    return DEFAULT_SYSTEM_THRESHOLDS
  } catch (error) {
    // 4. 兜底：读取失败时使用默认值
    console.warn('Failed to load system thresholds, using defaults:', error)
    return DEFAULT_SYSTEM_THRESHOLDS
  }
}

/**
 * 更新系统阈值（部分更新）
 */
export async function updateSystemThresholds(
  updates: Partial<SystemThresholds>
): Promise<void> {
  const current = await getSystemThresholds()
  const merged = deepMerge(current, updates)
  
  await chrome.storage.local.set({ [STORAGE_KEY]: merged })
  
  // 更新缓存
  cachedThresholds = merged
  cacheTimestamp = Date.now()
}

/**
 * 重置为默认阈值
 */
export async function resetSystemThresholds(): Promise<void> {
  await chrome.storage.local.set({ 
    [STORAGE_KEY]: DEFAULT_SYSTEM_THRESHOLDS 
  })
  
  // 清除缓存
  cachedThresholds = null
  cacheTimestamp = 0
}

/**
 * 清除内存缓存（强制下次重新读取）
 */
export function invalidateThresholdsCache(): void {
  cachedThresholds = null
  cacheTimestamp = 0
}
```

### Phase 3: 轻量级统计缓存

#### 3.1 新增 `systemStats` 配置

⚠️ **存储位置**：`chrome.storage.local`（设备特定）

**原因**：
- 统计数据是设备实时状态，不应跨设备同步
- 不同设备的统计数据独立（各有自己的推荐、阅读记录）

```typescript
/**
 * 系统统计数据（轻量级缓存）
 * 存储在 chrome.storage.local（设备特定）
 * 减少频繁的 IndexedDB 查询
 */
export interface SystemStats {
  /**
   * 最近更新时间
   */
  lastUpdated: number
  
  /**
   * 推荐相关统计
   */
  recommendations: {
    /** 最后生成时间 */
    lastGeneratedAt: number
    /** 最后查看时间 */
    lastViewedAt: number
    /** 当前未读数量 */
    unreadCount: number
    /** 今日生成数量 */
    generatedToday: number
    /** 今日阅读数量 */
    readToday: number
  }
  
  /**
   * Feed 相关统计
   */
  feeds: {
    /** 订阅数量 */
    subscribedCount: number
    /** 最后抓取时间 */
    lastFetchedAt: number
    /** 未读文章数量 */
    unreadArticleCount: number
  }
  
  /**
   * AI 用量统计（今日）
   */
  aiUsage: {
    /** 今日请求次数 */
    requestsToday: number
    /** 今日 tokens */
    tokensToday: number
    /** 今日成本（CNY）*/
    costToday: number
  }
  
  /**
   * 学习进度
   */
  learning: {
    /** 当前页面数 */
    pageCount: number
    /** 是否完成学习 */
    isComplete: boolean
  }
}
```

#### 3.2 统计缓存管理

创建 `src/storage/system-stats.ts`：

```typescript
const STORAGE_KEY = 'systemStats'
const STATS_EXPIRATION = 60 * 1000 // 1 分钟过期

/**
 * 创建空统计对象
 */
function createEmptyStats(): SystemStats {
  return {
    lastUpdated: Date.now(),
    recommendations: {
      lastGeneratedAt: 0,
      lastViewedAt: 0,
      unreadCount: 0,
      generatedToday: 0,
      readToday: 0
    },
    feeds: {
      subscribedCount: 0,
      lastFetchedAt: 0,
      unreadArticleCount: 0
    },
    aiUsage: {
      requestsToday: 0,
      tokensToday: 0,
      costToday: 0
    },
    learning: {
      pageCount: 0,
      isComplete: false
    }
  }
}

/**
 * 检查统计数据是否过期
 */
function isStatsExpired(stats: SystemStats): boolean {
  return (Date.now() - stats.lastUpdated) > STATS_EXPIRATION
}

/**
 * 获取系统统计（带缓存过期检查和兜底）
 * 
 * 策略：
 * 1. 从 chrome.storage.local 读取
 * 2. 如果不存在，返回空统计并触发后台同步
 * 3. 如果过期（>1分钟），返回当前值但触发后台刷新
 * 4. 读取失败时返回空统计
 */
export async function getSystemStats(): Promise<SystemStats> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const stats = result[STORAGE_KEY] as SystemStats | undefined
    
    if (!stats) {
      // 不存在时，创建空统计并触发同步
      const empty = createEmptyStats()
      syncSystemStats().catch(err => 
        console.warn('Failed to sync stats:', err)
      )
      return empty
    }
    
    // 检查是否过期
    if (isStatsExpired(stats)) {
      // 后台刷新（不阻塞）
      syncSystemStats().catch(err => 
        console.warn('Failed to refresh stats:', err)
      )
    }
    
    return stats
  } catch (error) {
    // 兜底：读取失败时返回空统计
    console.warn('Failed to load system stats, using empty:', error)
    return createEmptyStats()
  }
}

/**
 * 更新系统统计（增量更新）
 */
export async function updateSystemStats(
  updates: Partial<SystemStats>
): Promise<void> {
  try {
    const current = await getSystemStats()
    const merged = { 
      ...current, 
      ...updates, 
      lastUpdated: Date.now() 
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: merged })
  } catch (error) {
    console.warn('Failed to update system stats:', error)
  }
}

/**
 * 定期从 IndexedDB 同步统计到缓存
 * 
 * 调用时机：
 * - Background Service Worker 启动时
 * - 每次推荐生成后
 * - 每次用户操作后（阅读、忽略等）
 * - 定期刷新（每 30-60 秒）
 */
export async function syncSystemStats(): Promise<void> {
  try {
    // 获取系统阈值（用于判断学习是否完成）
    const thresholds = await getSystemThresholds()
    
    // 并行查询数据库
    const [recStats, feedCount, pageCount] = await Promise.all([
      getRecommendationStats(),
      db.discoveredFeeds.where('status').equals('subscribed').count(),
      getPageCount()
    ])
    
    // 更新缓存
    await updateSystemStats({
      recommendations: {
        unreadCount: recStats.unreadCount,
        lastGeneratedAt: Date.now(), // TODO: 从数据库获取
        lastViewedAt: Date.now(),     // TODO: 从数据库获取
        generatedToday: 0,  // TODO: 计算今日生成数量
        readToday: 0        // TODO: 计算今日阅读数量
      },
      feeds: {
        subscribedCount: feedCount,
        lastFetchedAt: Date.now(),
        unreadArticleCount: 0  // TODO: 计算未读文章数
      },
      learning: {
        pageCount,
        isComplete: pageCount >= thresholds.learningCompletePages
      }
    })
  } catch (error) {
    console.warn('Failed to sync system stats:', error)
    // 同步失败不影响主流程，静默处理
  }
}
```

### Phase 4: 遥测接口

#### 4.1 遥测数据上报

创建 `src/core/telemetry/telemetry-service.ts`：

```typescript
/**
 * 遥测服务
 * 收集匿名使用数据，用于优化系统参数
 */
export interface TelemetryEvent {
  event: string
  timestamp: number
  data: Record<string, any>
}

/**
 * 记录遥测事件
 */
export async function recordTelemetryEvent(
  event: string,
  data: Record<string, any>
): Promise<void> {
  // 1. 本地记录（chrome.storage.local）
  const key = `telemetry_${Date.now()}`
  await chrome.storage.local.set({
    [key]: { event, timestamp: Date.now(), data }
  })
  
  // 2. 批量上报（可选，需要用户同意）
  // TODO: 实现上报逻辑
}

/**
 * 定期收集系统指标
 */
export async function collectSystemMetrics(): Promise<void> {
  const thresholds = await getSystemThresholds()
  const stats = await getSystemStats()
  
  await recordTelemetryEvent('system_metrics', {
    thresholds,
    stats,
    // 其他关键指标
  })
}
```

#### 4.2 动态阈值调整（未来）

```typescript
/**
 * 根据遥测数据调整阈值
 * 需要服务端分析后推送
 */
export async function applyRemoteThresholds(
  remoteThresholds: Partial<SystemThresholds>
): Promise<void> {
  await updateSystemThresholds(remoteThresholds)
  
  // 触发系统重新配置
  await reconfigureSchedulersForThresholds()
}
```

## 实施计划

### Stage 1: 命名统一（1-2天）

1. ✅ 创建迁移脚本
2. ✅ 更新所有配置文件接口
3. ✅ 更新代码引用
4. ✅ 添加迁移测试
5. ✅ 在 background.ts 启动时执行迁移

### Stage 2: 阈值配置化（2-3天）

1. ✅ 定义 `SystemThresholds` 接口
2. ✅ 实现管理接口
3. ✅ 重构硬编码阈值使用新配置
4. ✅ 添加单元测试

### Stage 3: 统计缓存（1-2天）

1. ✅ 定义 `SystemStats` 接口
2. ✅ 实现缓存同步逻辑
3. ✅ 在 Background 中定期同步
4. ✅ 更新 UI 使用缓存数据

### Stage 4: 遥测（可选，1-2天）

1. ✅ 实现本地遥测记录
2. ⏳ 设计上报机制（需要隐私政策）
3. ⏳ 实现远程阈值调整

## 收益分析

### 1. 维护性提升

- **命名一致**：降低认知负担，减少命名混乱
- **集中管理**：所有阈值在一处定义，易于查找和修改
- **类型安全**：TypeScript 类型检查防止配置错误
- **分离清晰**：sync 管配置，local 管状态，职责明确

### 2. 性能优化

- **减少 DB 查询**：轻量级统计缓存在 chrome.storage.local
- **批量更新**：统一的配置更新接口
- **智能同步**：仅在需要时同步
- **内存缓存**：减少 Storage 访问频率

### 3. 可扩展性

- **遥测能力**：收集匿名数据优化系统（存储在 local，避免隐私问题）
- **设备独立优化**：每个设备可以有不同的优化策略
- **A/B 测试**：可对不同设备使用不同参数

### 4. 用户体验

- **跨设备同步配置**：用户偏好在设备间同步
- **设备独立状态**：每个设备的统计数据独立，不会互相干扰
- **响应更快**：UI 读取缓存而非查询数据库
- **永不崩溃**：完善的兜底策略确保系统鲁棒性

### 5. 数据一致性

- **避免冲突**：统计数据不跨设备同步，避免覆盖冲突
- **版本控制**：配置迁移有版本号，支持回滚
- **原子操作**：配置更新使用事务，保证一致性

## 风险评估

### 1. 存储限制

**chrome.storage.sync 限制：100KB**

当前配置估算：
- `aiConfig`: ~2KB（加密 API Key）
- `recommendationConfig`: ~0.5KB
- `notificationConfig`: ~0.3KB
- `uiConfig`: ~0.2KB
- `language`: ~0.1KB
- **总计**: ~3.1KB（充足）

**chrome.storage.local 限制：无限制**

当前配置估算：
- `systemThresholds`: ~1KB
- `systemStats`: ~1KB
- `onboardingStatus`: ~0.5KB
- 临时数据: ~10KB
- **总计**: ~12.5KB（完全无压力）

### 2. 迁移风险

- ✅ **数据丢失**：迁移前备份，失败时回滚
- ✅ **版本冲突**：检测旧版本数据，兼容处理
- ✅ **用户体验**：后台静默迁移，不影响使用
- ✅ **兜底保障**：迁移失败时使用默认值，确保可用性

### 3. 同步策略

- ✅ **配置同步**：chrome.storage.sync 处理跨设备配置同步
- ✅ **数据隔离**：统计和阈值存储在 local，避免设备间冲突
- ✅ **缓存失效**：定期刷新缓存，确保数据新鲜度
- ✅ **冲突解决**：设备特定数据不同步，天然避免冲突

### 4. 降级策略

**当 Storage API 不可用时**：

```typescript
// 完全离线模式
const FALLBACK_CONFIG = {
  inMemory: true,  // 标记为内存模式
  ...DEFAULT_CONFIG
}

// 所有操作降级为内存操作
class InMemoryStorage {
  private cache = new Map<string, any>()
  
  get(key: string): any {
    return this.cache.get(key) || getDefaultValue(key)
  }
  
  set(key: string, value: any): void {
    this.cache.set(key, value)
  }
}
```

## 后续优化

1. **配置导入/导出**：支持用户备份和迁移配置
2. **配置验证**：防止非法值导致系统异常
3. **配置历史**：记录配置变更历史，支持回滚
4. **智能推荐**：根据用户行为自动调整推荐参数
5. **成本优化**：根据预算自动调整 AI 引擎选择

## 参考文档

- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Phase 9 AI 配置架构](./AI_ARCHITECTURE.md)
- [推荐系统设计](./PRD.md)
