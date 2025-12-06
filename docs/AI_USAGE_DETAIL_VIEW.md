# AI 用量详细统计视图设计

**日期**: 2025-12-06  
**功能**: 在系统数据页面添加详细的 AI 用量统计

---

## 需求

用户需要查看详细的 AI 用量统计，以便与提供商数据对比：

1. **最近 30 天**: 按天列出 API 请求数、token 数，分别区分推理和非推理
2. **所有时间**: 按月统计汇总数据

---

## UI 设计

### 位置

在 `CollectionStats.tsx` 的 AI 成本统计卡片中，添加"查看详情"按钮，点击后展开详细视图。

### 视图切换

```
┌─────────────────────────────────────┐
│ 📊 AI 用量详细统计                  │
├─────────────────────────────────────┤
│ [最近 30 天] [所有时间]  << 切换标签 │
├─────────────────────────────────────┤
│ 内容区域                             │
└─────────────────────────────────────┘
```

---

## 数据结构

### 按天统计（最近 30 天）

```typescript
interface DailyUsageStats {
  date: string  // YYYY-MM-DD
  推理模式: {
    请求数: number
    输入tokens: number
    输出tokens: number
    总tokens: number
    成本: number
  }
  非推理模式: {
    请求数: number
    输入tokens: number
    输出tokens: number
    总tokens: number
    成本: number
  }
  合计: {
    请求数: number
    输入tokens: number
    输出tokens: number
    总tokens: number
    成本: number
  }
}
```

### 按月统计（所有时间）

```typescript
interface MonthlyUsageStats {
  month: string  // YYYY-MM
  推理模式: { ... }
  非推理模式: { ... }
  合计: { ... }
}
```

---

## 实现方案

### 第一步：添加数据查询函数

在 `AIUsageTracker.ts` 中添加：

```typescript
/**
 * 获取按天统计的用量（最近 N 天）
 */
static async getDailyStats(days: number = 30): Promise<DailyUsageStats[]> {
  const records = await db.aiUsage.toArray()
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000
  
  const dailyMap = new Map<string, DailyUsageStats>()
  
  records
    .filter(r => r.timestamp >= startTime)
    .forEach(record => {
      const date = new Date(record.timestamp).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '-')
      
      if (!dailyMap.has(date)) {
        dailyMap.set(date, initDailyStats(date))
      }
      
      const stats = dailyMap.get(date)!
      accumulateStats(stats, record)
    })
  
  return Array.from(dailyMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * 获取按月统计的用量（所有时间）
 */
static async getMonthlyStats(): Promise<MonthlyUsageStats[]> {
  // 类似实现...
}
```

### 第二步：创建详细统计组件

```tsx
// src/components/settings/AIUsageDetailView.tsx

function AIUsageDetailView() {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily')
  const [dailyStats, setDailyStats] = useState<DailyUsageStats[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyUsageStats[]>([])
  
  useEffect(() => {
    if (viewMode === 'daily') {
      AIUsageTracker.getDailyStats(30).then(setDailyStats)
    } else {
      AIUsageTracker.getMonthlyStats().then(setMonthlyStats)
    }
  }, [viewMode])
  
  return (
    <div className="space-y-4">
      {/* 切换标签 */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('daily')}
          className={viewMode === 'daily' ? 'active' : ''}>
          最近 30 天
        </button>
        <button
          onClick={() => setViewMode('monthly')}
          className={viewMode === 'monthly' ? 'active' : ''}>
          所有时间
        </button>
      </div>
      
      {/* 数据表格 */}
      {viewMode === 'daily' ? (
        <DailyStatsTable data={dailyStats} />
      ) : (
        <MonthlyStatsTable data={monthlyStats} />
      )}
    </div>
  )
}
```

### 第三步：表格组件

```tsx
function DailyStatsTable({ data }: { data: DailyUsageStats[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th rowSpan={2}>日期</th>
            <th colSpan={4}>推理模式</th>
            <th colSpan={4}>非推理模式</th>
            <th colSpan={2}>合计</th>
          </tr>
          <tr className="border-b text-xs">
            <th>请求</th>
            <th>输入</th>
            <th>输出</th>
            <th>成本</th>
            <th>请求</th>
            <th>输入</th>
            <th>输出</th>
            <th>成本</th>
            <th>请求</th>
            <th>成本</th>
          </tr>
        </thead>
        <tbody>
          {data.map(day => (
            <tr key={day.date} className="border-b hover:bg-gray-50">
              <td>{day.date}</td>
              {/* 推理模式 */}
              <td>{day.推理模式.请求数}</td>
              <td>{formatTokens(day.推理模式.输入tokens)}</td>
              <td>{formatTokens(day.推理模式.输出tokens)}</td>
              <td>¥{day.推理模式.成本.toFixed(4)}</td>
              {/* 非推理模式 */}
              <td>{day.非推理模式.请求数}</td>
              <td>{formatTokens(day.非推理模式.输入tokens)}</td>
              <td>{formatTokens(day.非推理模式.输出tokens)}</td>
              <td>¥{day.非推理模式.成本.toFixed(4)}</td>
              {/* 合计 */}
              <td className="font-semibold">{day.合计.请求数}</td>
              <td className="font-semibold">¥{day.合计.成本.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### 第四步：集成到 CollectionStats

```tsx
// src/components/settings/CollectionStats.tsx

function CollectionStats() {
  const [showDetailView, setShowDetailView] = useState(false)
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">
        💰 AI 成本统计
      </h2>
      
      {/* 现有的汇总统计 */}
      <div className="space-y-4">
        {/* ... 现有内容 ... */}
      </div>
      
      {/* 查看详情按钮 */}
      <button
        onClick={() => setShowDetailView(!showDetailView)}
        className="mt-4 text-sm text-blue-600 hover:underline">
        {showDetailView ? '收起详情' : '查看详情'}
      </button>
      
      {/* 详细视图 */}
      {showDetailView && (
        <div className="mt-4 border-t pt-4">
          <AIUsageDetailView />
        </div>
      )}
    </div>
  )
}
```

---

## 数据格式示例

### 按天统计输出

```
日期       | 推理模式                          | 非推理模式                        | 合计
           | 请求  输入    输出   成本         | 请求  输入    输出   成本         | 请求  成本
-----------+----------------------------------+----------------------------------+-------------
2025-12-06 |   15  45.2K  12.3K  ¥0.0823     |   58  12.4K   3.2K  ¥0.0189     |   73  ¥0.1012
2025-12-05 |   12  38.1K  10.2K  ¥0.0654     |   62  13.8K   3.5K  ¥0.0201     |   74  ¥0.0855
2025-12-04 |   18  52.3K  14.1K  ¥0.0932     |   71  15.2K   3.9K  ¥0.0234     |   89  ¥0.1166
...
```

### 按月统计输出

```
月份    | 推理模式                          | 非推理模式                        | 合计
        | 请求   输入     输出   成本        | 请求   输入     输出   成本        | 请求   成本
--------+----------------------------------+----------------------------------+---------------
2025-12 |  180  540.2K  148.3K  ¥0.9823   |  698  148.4K   38.2K  ¥0.2189   |  878  ¥1.2012
2025-11 |  156  468.1K  126.2K  ¥0.8354   |  612  138.8K   35.5K  ¥0.2001   |  768  ¥1.0355
...
```

---

## 与提供商数据对比

用户可以：
1. 导出 CSV（可选功能）
2. 手动对比 DeepSeek 控制台的"用量统计"页面
3. 验证数据一致性

---

## 实施优先级

- **P0**: 数据查询函数（AIUsageTracker）
- **P1**: 基础表格展示
- **P2**: 视图切换（日/月）
- **P3**: 导出功能
- **P4**: 图表可视化

---

**预估工作量**: 4-6 小时

