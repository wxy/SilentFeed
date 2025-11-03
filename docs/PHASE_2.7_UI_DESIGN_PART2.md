# Phase 2.7 实时反馈界面设计文档 - Part 2

**接上文**: 本文档是 PHASE_2.7_UI_DESIGN.md 的第 2 部分

---

## 🏅 徽章系统设计

### 冷启动阶段（0-1000 页）

**显示方式**: 成长树 Emoji

```typescript
function getBadgeIcon(pageCount: number): string {
  if (pageCount < 250) return '🌱'      // 探索者
  if (pageCount < 600) return '🌿'      // 学习者
  if (pageCount < 1000) return '🌳'     // 成长者
  return '🌲'                            // 大师（即将完成）
}
```

**徽章表现**:
- 🌱 0-250 页: 小树苗（刚开始）
- 🌿 251-600 页: 小树丛（持续学习）
- 🌳 601-1000 页: 大树（即将成熟）
- 🌲 1000+ 页: 常青树（完成冷启动）

### 推荐阶段（1000+ 页）

**显示方式**: 数字徽章 `已读/推荐`

```typescript
function getBadgeText(stats: RecommendationStats): string {
  const { read, total } = stats
  return `${read}/${total}`
}
```

**徽章颜色**:
```typescript
function getBadgeColor(readRate: number): string {
  if (readRate >= 0.8) return '#4CAF50'  // 绿色（高阅读率）
  if (readRate >= 0.5) return '#FF9800'  // 橙色（中等）
  return '#F44336'                        // 红色（低阅读率）
}
```

**示例**:
- `3/10` - 10 条推荐，已读 3 条（30%）
- `8/10` - 10 条推荐，已读 8 条（80%）
- `0/5` - 5 条推荐，未读

### 徽章更新逻辑

```typescript
// src/background.ts

async function updateBadge(): Promise<void> {
  const pageCount = await getPageCount()
  
  if (pageCount < 1000) {
    // 冷启动阶段：显示树
    const icon = getBadgeIcon(pageCount)
    await chrome.action.setBadgeText({ text: icon })
    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF93' })
  } else {
    // 推荐阶段：显示数字
    const stats = await getRecommendationStats()
    const text = `${stats.unread}`  // 只显示未读数
    const color = getBadgeColor(stats.readRate)
    
    await chrome.action.setBadgeText({ text })
    await chrome.action.setBadgeBackgroundColor({ color })
  }
}

// 监听数据变化
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PAGE_RECORDED' || message.type === 'RECOMMENDATION_READ') {
    updateBadge()
  }
})
```

---

## ⚙️ 设置页设计

### 标签布局

```
┌──────────────────────────────────────────────────┐
│  RSS 静音器 - 设置                                 │
├───────────┬──────────────────────────────────────┤
│ 📊 推荐统计│                                        │
│           │  （推荐效果统计 - 主要内容）            │
│ 📚 数据统计│                                        │
│           │                                        │
│ ⚙️ 常规设置│                                        │
│           │                                        │
│ 🔒 隐私    │                                        │
└───────────┴──────────────────────────────────────┘
```

### 推荐统计标签（主要）

```
┌─────────────────────────────────────────┐
│  📊 推荐效果统计                          │
├─────────────────────────────────────────┤
│                                          │
│  ╔════════════════════════════════════╗ │
│  ║  推荐总数      已读      阅读率     ║ │
│  ║    156        98       62.8%       ║ │
│  ╚════════════════════════════════════╝ │
│                                          │
│  📈 近 7 天推荐趋势                      │
│  ┌────────────────────────────────────┐│
│  │      ╱╲                             ││
│  │     ╱  ╲      ╱╲                    ││
│  │    ╱    ╲    ╱  ╲                   ││
│  │   ╱      ╲  ╱    ╲                  ││
│  │  ╱        ╲╱      ╲                 ││
│  └────────────────────────────────────┘│
│                                          │
│  ⭐ 最受欢迎的推荐来源                   │
│  ┌────────────────────────────────────┐│
│  │ 1. React 官方博客         15 条 ✅ ││
│  │ 2. TypeScript Weekly      12 条 ✅ ││
│  │ 3. CSS-Tricks              8 条 ✅ ││
│  │ 4. MDN Web Docs            6 条 ✅ ││
│  │ 5. GitHub Blog             5 条 ✅ ││
│  └────────────────────────────────────┘│
│                                          │
│  [清空推荐历史]                          │
└─────────────────────────────────────────┘
```

### 数据统计标签（次要）

```
┌─────────────────────────────────────────┐
│  📚 数据收集统计                          │
├─────────────────────────────────────────┤
│                                          │
│  累计分析页面                             │
│  ╔════════════════════════════════════╗ │
│  ║         1,237 页                    ║ │
│  ╚════════════════════════════════════╝ │
│                                          │
│  💾 数据规模                             │
│  • 总记录数：1,237 条                    │
│  • 存储占用：12.5 MB                     │
│  • 平均停留：3.2 分钟                    │
│                                          │
│  🗂️ 按域名统计（Top 10）                 │
│  ┌────────────────────────────────────┐│
│  │ github.com             125 页 ████ ││
│  │ stackoverflow.com       98 页 ███  ││
│  │ medium.com              76 页 ███  ││
│  │ dev.to                  54 页 ██   ││
│  │ reactjs.org             43 页 ██   ││
│  │ ... 更多                            ││
│  └────────────────────────────────────┘│
│                                          │
│  ⚠️ 数据管理                             │
│  [重置用户画像]  [清空所有数据]          │
└─────────────────────────────────────────┘
```

### 组件结构

```tsx
// src/options.tsx

function OptionsPage() {
  const [activeTab, setActiveTab] = useState('recommendations')
  
  return (
    <div className="options-page">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <MainContent>
        {activeTab === 'recommendations' && <RecommendationStatsTab />}
        {activeTab === 'data' && <DataStatsTab />}
        {activeTab === 'general' && <GeneralSettingsTab />}
        {activeTab === 'privacy' && <PrivacyTab />}
      </MainContent>
    </div>
  )
}

// 推荐统计标签
function RecommendationStatsTab() {
  const stats = useRecommendationStats()
  
  return (
    <div>
      <StatsOverview stats={stats} />
      <TrendChart data={stats.weeklyTrend} />
      <TopSources sources={stats.topSources} />
      <ClearHistoryButton />
    </div>
  )
}

// 数据统计标签
function DataStatsTab() {
  const stats = useDataStats()
  
  return (
    <div>
      <PageCountCard count={stats.totalPages} />
      <StorageStats stats={stats.storage} />
      <DomainChart domains={stats.topDomains} />
      <DataManagementActions />
    </div>
  )
}
```

---

## 🔄 状态管理

### Zustand Store 设计

```typescript
// src/store/recommendationStore.ts

interface RecommendationStore {
  // 状态
  recommendations: Recommendation[]
  stats: RecommendationStats | null
  loading: boolean
  
  // 操作
  fetchRecommendations: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearHistory: () => Promise<void>
  
  // 计算属性
  unreadCount: () => number
  weeklyStats: () => WeeklyStats
}

export const useRecommendationStore = create<RecommendationStore>((set, get) => ({
  recommendations: [],
  stats: null,
  loading: false,
  
  fetchRecommendations: async () => {
    set({ loading: true })
    const recs = await db.recommendations
      .orderBy('recommendedAt')
      .reverse()
      .toArray()
    const stats = await getRecommendationStats()
    set({ recommendations: recs, stats, loading: false })
  },
  
  markAsRead: async (id: string) => {
    await markRecommendationAsRead(id)
    await get().fetchRecommendations()
  },
  
  markAllAsRead: async () => {
    await markAllRecommendationsAsRead()
    await get().fetchRecommendations()
  },
  
  clearHistory: async () => {
    await db.recommendations.clear()
    set({ recommendations: [], stats: null })
  },
  
  unreadCount: () => {
    return get().recommendations.filter(r => !r.isRead).length
  },
  
  weeklyStats: () => {
    const recs = get().recommendations
    const oneWeek = Date.now() - 7 * 24 * 60 * 60 * 1000
    const weekly = recs.filter(r => r.recommendedAt > oneWeek)
    
    return {
      total: weekly.length,
      read: weekly.filter(r => r.isRead).length,
      readRate: weekly.length > 0 
        ? weekly.filter(r => r.isRead).length / weekly.length 
        : 0
    }
  }
}))
```

---

**⏭️ 待续**: Part 3 将包含实现步骤、测试策略和验收标准
