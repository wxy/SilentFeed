# Phase 2.7 实时反馈界面设计文档 - Part 3

**接上文**: 本文档是 PHASE_2.7_UI_DESIGN.md 的第 3 部分（最终部分）

---

## 🔄 设计调整（2025-11-03）

基于用户反馈，进行以下关键调整：

### 调整 1: 反馈机制重新设计

**原设计问题**: "标记全部已读"是虚假行为，无法区分有效/无效推荐

**新设计**: 明确的反馈信号

```typescript
// 推荐反馈类型
type RecommendationFeedback = 
  | 'clicked'        // 用户点击查看
  | 'dismissed'      // 主动忽略（单条）
  | 'batch_dismissed' // 批量忽略（"这些我都不想读"）

// 推荐有效性判断
interface RecommendationEffectiveness {
  isClicked: boolean          // 是否点击
  dwellTime?: number          // 停留时间（秒）
  isDismissed: boolean        // 是否忽略
  
  // 有效性评分
  effectiveness: 'effective' | 'neutral' | 'ineffective'
  // effective: clicked && dwellTime > 120
  // neutral: clicked && dwellTime < 120
  // ineffective: dismissed
}
```

**UI 变更**:
- ❌ 移除："标记全部已读"按钮
- ✅ 新增："这些我都不想读"按钮
- ❌ 移除："稍后阅读"按钮（无意义）
- ✅ 保留：单条忽略 ✕ 按钮

### 调整 2: 主动通知机制

**Chrome Extension 限制**: 不能主动弹出 Popup，只能使用系统通知

**新设计**: 两级通知策略

```typescript
// 通知策略
interface NotificationStrategy {
  // Level 1: 系统通知（需要用户授权）
  chromeNotification?: {
    enabled: boolean
    title: string
    message: string
    requireInteraction: boolean  // 是否需要用户操作才消失
  }
  
  // Level 2: 徽章提醒（始终可用）
  badge: {
    text: string          // "1"
    color: string         // "#FF6B35" (橙色表示新推荐)
    animation?: 'pulse'   // 可选：脉动动画
  }
}
```

**实现**:
- 默认启用徽章提醒
- 用户可选启用系统通知（需要授权 `notifications` 权限）
- 通知克制：每天最多 3 次系统通知

### 调整 3: 推荐内容学习策略（防止回音室）

**问题**: 如果推荐的内容也被学习，会导致兴趣越来越窄

**新策略**: 选择性学习 + 探索因子

```typescript
// 页面来源分类
enum PageSource {
  ORGANIC = 'organic',        // 用户主动访问
  RECOMMENDED = 'recommended', // 来自推荐
  SEARCH = 'search'           // 搜索结果
}

// 学习权重
interface LearningWeight {
  source: PageSource
  weight: number
  
  // 权重规则：
  // ORGANIC: 1.0 (完全学习)
  // RECOMMENDED: 0.3 (轻微学习，需深度阅读)
  // SEARCH: 0.5 (中等学习)
}

// 学习条件
function shouldLearnFromRecommendation(page: PageVisit): boolean {
  return (
    page.source === 'recommended' &&
    page.dwellTime > 120 &&           // 停留 > 2 分钟
    page.interactions.scrollDepth > 0.7 // 滚动超过 70%
  )
}
```

**探索因子**: 定期推荐不同类型的内容
```typescript
// 推荐组成
interface RecommendationMix {
  exploitation: 0.7,  // 70% 基于已知兴趣
  exploration: 0.3    // 30% 探索新领域
}
```

---

## 🛠️ 实现步骤

### Step 1: 数据库扩展（1 小时）

**任务**:
1. 新增 `recommendations` 表
2. 扩展 `statistics` 表
3. 实现辅助函数

**文件**:
- `src/storage/db.ts` - 表定义
- `src/storage/types.ts` - 类型定义

**验收**:
- [ ] 数据库升级成功
- [ ] 类型定义完整
- [ ] 辅助函数测试通过

### Step 2: 状态管理（30 分钟）

**任务**:
1. 创建 Zustand store
2. 实现推荐列表状态
3. 实现统计数据状态

**文件**:
- `src/store/recommendationStore.ts`
- `src/store/statsStore.ts`

**验收**:
- [ ] Store 测试通过
- [ ] 状态更新正确
- [ ] 无内存泄漏

### Step 3: Popup 界面重构（2 小时）

**任务**:
1. 检测冷启动 vs 推荐阶段
2. 实现两个界面组件
3. 实现推荐列表渲染
4. **新增**: 实现"这些我都不想读"功能
5. **新增**: 追踪推荐有效性

**文件**:
- `src/popup.tsx` - 主入口
- `src/components/PopupColdStart.tsx` - 冷启动界面
- `src/components/PopupRecommendations.tsx` - 推荐界面
- `src/components/RecommendationItem.tsx` - 推荐条目

**关键代码**:
```tsx
// src/popup.tsx
function Popup() {
  const { pageCount } = usePageCount()
  const isColdStart = pageCount < 1000
  
  return (
    <div className="popup-container">
      {isColdStart ? (
        <PopupColdStart pageCount={pageCount} />
      ) : (
        <PopupRecommendations />
      )}
    </div>
  )
}

// src/components/PopupRecommendations.tsx
function PopupRecommendations() {
  const recommendations = useRecommendationStore(s => s.recommendations)
  const dismissAll = useRecommendationStore(s => s.dismissAll)
  
  const handleDismissAll = async () => {
    if (confirm('确定忽略所有推荐吗？这将帮助我们改进推荐质量。')) {
      await dismissAll()
      // 发送负反馈信号
      chrome.runtime.sendMessage({ 
        type: 'BATCH_DISMISSED',
        count: recommendations.length 
      })
    }
  }
  
  return (
    <div className="recommendations-container">
      <div className="header">
        <h2>为你推荐</h2>
        <button onClick={handleDismissAll} className="dismiss-all">
          这些我都不想读
        </button>
      </div>
      
      <div className="recommendation-list">
        {recommendations.map(rec => (
          <RecommendationItem 
            key={rec.id} 
            recommendation={rec}
            onDismiss={(id) => handleDismiss(id)}
          />
        ))}
      </div>
    </div>
  )
}
```

**验收**:
- [ ] 冷启动界面显示正确
- [ ] 推荐界面显示正确
- [ ] "这些我都不想读"按钮工作正常
- [ ] 单条忽略正常
- [ ] 阶段切换流畅
- [ ] 组件测试通过

### Step 4: 通知系统（1.5 小时）

**任务**:
1. 实现系统通知（Chrome Notification）
2. 实现徽章提醒（始终可用）
3. 通知策略和克制机制
4. 监听数据变化更新通知

**文件**:
- `src/background.ts` - 通知逻辑
- `src/core/notification/NotificationManager.ts` - 通知管理器
- `src/core/badge/BadgeManager.ts` - 徽章管理器

**关键代码**:
```typescript
// src/core/notification/NotificationManager.ts
class NotificationManager {
  private dailyLimit = 3
  private todayCount = 0
  
  async notifyNewRecommendation(rec: Recommendation) {
    // Level 1: 徽章（始终启用）
    await this.updateBadge(rec)
    
    // Level 2: 系统通知（可选）
    const settings = await getSettings()
    if (settings.notifications.enabled && this.canNotify()) {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icon-128.png',
        title: '发现新推荐',
        message: rec.title,
        buttons: [
          { title: '立即查看' },
          { title: '稍后' }
        ],
        requireInteraction: false,  // 5 秒后自动消失
        priority: 1                 // 普通优先级
      })
      
      this.todayCount++
    }
  }
  
  private canNotify(): boolean {
    return this.todayCount < this.dailyLimit
  }
  
  private async updateBadge(rec: Recommendation) {
    const unread = await getUnreadCount()
    
    await chrome.action.setBadgeText({ text: `${unread}` })
    await chrome.action.setBadgeBackgroundColor({ 
      color: '#FF6B35'  // 橙色表示有新推荐
    })
    
    // 可选：脉动动画（通过定时改变颜色）
    await this.badgeAnimation()
  }
}

// src/background.ts
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // "立即查看" - 打开 popup
    chrome.action.openPopup()
  }
  // buttonIndex === 1: "稍后" - 什么都不做
  chrome.notifications.clear(notificationId)
})
```

**manifest.json 更新**:
```json
{
  "permissions": [
    "storage",
    "tabs",
    "notifications"  // 新增
  ]
}
```

**验收**:
- [ ] 徽章显示未读数量
- [ ] 徽章颜色正确（橙色）
- [ ] 系统通知正常（如果启用）
- [ ] 每日通知不超过 3 次
- [ ] 点击"立即查看"打开 popup
- [ ] 测试通过

### Step 5: 设置页扩展（2 小时）

**任务**:
1. 新增"推荐统计"标签
2. 新增"数据统计"标签
3. 实现趋势图表
4. 实现域名统计

**文件**:
- `src/options.tsx` - 标签布局
- `src/components/settings/RecommendationStatsTab.tsx`
- `src/components/settings/DataStatsTab.tsx`
- `src/components/charts/TrendChart.tsx` - 简单折线图
- `src/components/charts/DomainBarChart.tsx` - 柱状图

**图表库选择**:
- 使用 **Recharts**（轻量、React 友好）
- 或纯 CSS 实现简单图表（更轻量）

**验收**:
- [ ] 标签切换正常
- [ ] 推荐统计显示正确
- [ ] 数据统计显示正确
- [ ] 图表渲染正常
- [ ] 组件测试通过

### Step 6: 推荐有效性追踪（1.5 小时）

**任务**:
1. 追踪推荐点击和停留时间
2. 判断推荐有效性
3. 区分推荐来源的页面
4. 实现选择性学习策略

**文件**:
- `src/contents/page-tracker.ts` - 扩展页面追踪（新增来源标记）
- `src/core/profile/ProfileBuilder.ts` - 扩展学习策略
- `src/utils/recommendationTracker.ts` - 推荐追踪工具

**关键代码**:
```typescript
// src/utils/recommendationTracker.ts
interface RecommendationTracking {
  recommendationId: string
  clickedAt: number
  url: string
  isFromRecommendation: boolean
}

// 点击推荐时
async function trackRecommendationClick(rec: Recommendation) {
  // 1. 标记点击
  await db.recommendations.update(rec.id, {
    isClicked: true,
    clickedAt: Date.now()
  })
  
  // 2. 在 sessionStorage 标记来源
  sessionStorage.setItem('recommendationSource', JSON.stringify({
    id: rec.id,
    clickedAt: Date.now()
  }))
  
  // 3. 打开链接
  chrome.tabs.create({ url: rec.url })
}

// src/contents/page-tracker.ts (扩展)
class PageTracker {
  private getPageSource(): PageSource {
    // 检查是否来自推荐
    const recSource = sessionStorage.getItem('recommendationSource')
    if (recSource) {
      sessionStorage.removeItem('recommendationSource')
      return PageSource.RECOMMENDED
    }
    return PageSource.ORGANIC
  }
  
  async onPageUnload() {
    const visit = {
      url: window.location.href,
      source: this.getPageSource(),
      dwellTime: this.calculator.getTotalDwellTime(),
      scrollDepth: this.getScrollDepth(),
      // ...
    }
    
    // 保存时标记来源
    await this.saveVisit(visit)
  }
}

// src/core/profile/ProfileBuilder.ts (扩展)
class ProfileBuilder {
  async processPage(page: PageVisit): Promise<void> {
    // 根据来源决定学习权重
    const weight = this.getLearningWeight(page)
    
    if (weight === 0) {
      return // 不学习
    }
    
    // 加权学习
    await this.updateProfile(page, weight)
  }
  
  private getLearningWeight(page: PageVisit): number {
    switch (page.source) {
      case PageSource.ORGANIC:
        return 1.0  // 完全学习
      
      case PageSource.RECOMMENDED:
        // 只有深度阅读才学习
        if (page.dwellTime > 120 && page.scrollDepth > 0.7) {
          return 0.3  // 轻微学习
        }
        return 0  // 不学习
      
      case PageSource.SEARCH:
        return 0.5  // 中等学习
      
      default:
        return 1.0
    }
  }
  
  // 判断推荐有效性
  async evaluateRecommendationEffectiveness(recId: string) {
    const rec = await db.recommendations.get(recId)
    const visit = await db.confirmedVisits
      .where('url').equals(rec.url)
      .and(v => v.timestamp > rec.clickedAt)
      .first()
    
    if (!visit) {
      return 'neutral'  // 点击了但没追踪到（可能立即关闭）
    }
    
    if (visit.dwellTime > 120 && visit.scrollDepth > 0.7) {
      return 'effective'  // 有效推荐
    }
    
    return 'ineffective'  // 无效推荐
  }
}
```

**验收**:
- [ ] 推荐点击被追踪
- [ ] 来源标记正确
- [ ] 学习权重正确应用
- [ ] 推荐有效性判断正确
- [ ] 测试通过

---

## 🧪 测试策略

### 单元测试

```typescript
// src/storage/db.test.ts
describe('Recommendation Storage', () => {
  it('应该能添加推荐', async () => {
    await db.recommendations.add({
      id: 'test-1',
      url: 'https://example.com',
      title: 'Test',
      source: 'Example',
      recommendedAt: Date.now(),
      score: 0.9,
      isRead: false,
      isDismissed: false
    })
    
    const recs = await db.recommendations.toArray()
    expect(recs).toHaveLength(1)
  })
  
  it('应该能忽略推荐', async () => {
    const id = 'test-1'
    await dismissRecommendation(id)
    
    const rec = await db.recommendations.get(id)
    expect(rec.isDismissed).toBe(true)
    expect(rec.dismissedAt).toBeDefined()
  })
  
  it('应该能批量忽略推荐', async () => {
    await dismissAllRecommendations()
    
    const recs = await db.recommendations
      .where('isDismissed').equals(false)
      .toArray()
    expect(recs).toHaveLength(0)
  })
})

// src/core/profile/ProfileBuilder.test.ts
describe('选择性学习策略', () => {
  it('应该完全学习用户主动访问的页面', async () => {
    const page = { source: PageSource.ORGANIC, dwellTime: 60 }
    const weight = profileBuilder.getLearningWeight(page)
    expect(weight).toBe(1.0)
  })
  
  it('推荐页面需要深度阅读才学习', async () => {
    const shallowRead = { 
      source: PageSource.RECOMMENDED, 
      dwellTime: 30,
      scrollDepth: 0.3
    }
    expect(profileBuilder.getLearningWeight(shallowRead)).toBe(0)
    
    const deepRead = { 
      source: PageSource.RECOMMENDED, 
      dwellTime: 150,
      scrollDepth: 0.8
    }
    expect(profileBuilder.getLearningWeight(deepRead)).toBe(0.3)
  })
  
  it('应该正确判断推荐有效性', async () => {
    const rec = await createTestRecommendation()
    await trackRecommendationClick(rec)
    
    // 模拟深度阅读
    await simulatePageVisit(rec.url, { dwellTime: 180, scrollDepth: 0.9 })
    
    const effectiveness = await evaluateRecommendationEffectiveness(rec.id)
    expect(effectiveness).toBe('effective')
  })
})
```

### 组件测试

```typescript
// src/components/PopupRecommendations.test.tsx
describe('PopupRecommendations', () => {
  it('应该显示推荐列表', () => {
    const { getByText } = render(<PopupRecommendations />)
    
    expect(getByText('为你推荐')).toBeInTheDocument()
    expect(getByText('这些我都不想读')).toBeInTheDocument()
  })
  
  it('应该能忽略单条推荐', async () => {
    const user = userEvent.setup()
    const { getByLabelText } = render(<PopupRecommendations />)
    
    const dismissBtn = getByLabelText('忽略')
    await user.click(dismissBtn)
    
    expect(dismissRecommendation).toHaveBeenCalled()
  })
  
  it('应该能批量忽略推荐', async () => {
    const user = userEvent.setup()
    const { getByText } = render(<PopupRecommendations />)
    
    // Mock confirm
    window.confirm = vi.fn(() => true)
    
    const dismissAllBtn = getByText('这些我都不想读')
    await user.click(dismissAllBtn)
    
    expect(dismissAllRecommendations).toHaveBeenCalled()
  })
})
```

### 集成测试

```typescript
// src/test/integration/recommendation-flow.test.ts
describe('推荐流程集成测试', () => {
  it('完整流程：推荐 → 点击 → 追踪有效性', async () => {
    // 1. 添加推荐
    const rec = await db.recommendations.add(mockRecommendation)
    
    // 2. 用户点击
    await trackRecommendationClick(rec)
    
    // 3. 打开页面并深度阅读
    const visit = await simulatePageVisit(rec.url, {
      source: PageSource.RECOMMENDED,
      dwellTime: 180,
      scrollDepth: 0.9
    })
    
    // 4. 验证有效性
    const effectiveness = await evaluateRecommendationEffectiveness(rec.id)
    expect(effectiveness).toBe('effective')
    
    // 5. 验证学习权重
    const weight = profileBuilder.getLearningWeight(visit)
    expect(weight).toBe(0.3)
  })
  
  it('批量忽略 → 负反馈 → 不学习', async () => {
    // 1. 添加多条推荐
    await db.recommendations.bulkAdd([rec1, rec2, rec3])
    
    // 2. 批量忽略
    await dismissAllRecommendations()
    
    // 3. 验证所有推荐标记为忽略
    const dismissed = await db.recommendations
      .where('isDismissed').equals(true)
      .toArray()
    expect(dismissed).toHaveLength(3)
    
    // 4. 验证负反馈信号发送
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'BATCH_DISMISSED',
      count: 3
    })
  })
})
```

### 通知测试

```typescript
// src/core/notification/NotificationManager.test.ts
describe('NotificationManager', () => {
  it('应该在发现新推荐时更新徽章', async () => {
    const rec = mockRecommendation
    await notificationManager.notifyNewRecommendation(rec)
    
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '1' })
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#FF6B35'
    })
  })
  
  it('应该遵守每日通知限制', async () => {
    // 发送 3 次通知
    for (let i = 0; i < 3; i++) {
      await notificationManager.notifyNewRecommendation(mockRecommendation)
    }
    
    expect(chrome.notifications.create).toHaveBeenCalledTimes(3)
    
    // 第 4 次不应发送
    await notificationManager.notifyNewRecommendation(mockRecommendation)
    expect(chrome.notifications.create).toHaveBeenCalledTimes(3)
  })
})
```

---

## ✅ 验收标准

### Popup 界面

- [ ] **冷启动阶段**
  - [ ] 显示成长树图标（🌱🌿🌳🌲）
  - [ ] 显示进度条（X/1000 页）
  - [ ] 显示提示文本
  - [ ] 不显示主题分布
  
- [ ] **推荐阶段**
  - [ ] 显示推荐列表（倒序）
  - [ ] 显示"这些我都不想读"按钮
  - [ ] 点击推荐打开原文
  - [ ] 单条忽略按钮工作正常
  - [ ] 批量忽略按钮工作正常
  - [ ] 忽略后推荐消失
  - [ ] ❌ 无"标记已读"按钮（虚假行为）
  - [ ] ❌ 无"稍后阅读"按钮（无意义）

### 通知系统

- [ ] **徽章提醒**（始终可用）
  - [ ] 冷启动显示成长树 emoji
  - [ ] 推荐阶段显示未读数量
  - [ ] 有新推荐时徽章变橙色
  - [ ] 实时更新
  
- [ ] **系统通知**（可选）
  - [ ] 用户可在设置中启用/禁用
  - [ ] 发现新推荐时弹出通知
  - [ ] 显示推荐标题
  - [ ] "立即查看"按钮工作正常
  - [ ] 每日最多 3 次通知
  - [ ] 5 秒后自动消失

### 推荐有效性追踪

- [ ] **点击追踪**
  - [ ] 点击推荐时标记 `isClicked: true`
  - [ ] 记录 `clickedAt` 时间戳
  - [ ] 在 sessionStorage 标记来源
  
- [ ] **页面来源识别**
  - [ ] 推荐页面标记为 `RECOMMENDED`
  - [ ] 主动访问标记为 `ORGANIC`
  - [ ] 搜索结果标记为 `SEARCH`
  
- [ ] **有效性判断**
  - [ ] 深度阅读（停留 > 2 分钟 + 滚动 > 70%）→ effective
  - [ ] 浅阅读（停留 < 2 分钟）→ neutral
  - [ ] 主动忽略 → ineffective
  
- [ ] **选择性学习**
  - [ ] 主动访问页面：权重 1.0（完全学习）
  - [ ] 推荐有效页面：权重 0.3（轻微学习）
  - [ ] 推荐无效页面：权重 0（不学习）
  - [ ] 批量忽略发送负反馈信号

### 设置页

- [ ] **通知设置标签**
  - [ ] 启用/禁用系统通知开关
  - [ ] 每日通知次数限制设置
  - [ ] 通知权限请求说明
  
- [ ] **推荐统计标签**
  - [ ] 显示推荐总数、已点击数、有效率
  - [ ] 显示近 7 天趋势图
  - [ ] 显示 Top 5 推荐来源
  - [ ] "清空历史"按钮工作正常
  
- [ ] **数据统计标签**
  - [ ] 显示累计页面数
  - [ ] 显示存储占用
  - [ ] 显示 Top 10 域名
  - [ ] "重置画像"按钮工作正常
  - [ ] "清空数据"按钮工作正常

### 防止回音室效应

- [ ] **探索因子**
  - [ ] 70% 推荐基于已知兴趣
  - [ ] 30% 推荐探索新领域
  - [ ] 定期推荐不同类型内容
  
- [ ] **学习权重可视化**（设置页）
  - [ ] 显示各来源页面学习权重
  - [ ] 显示推荐页面学习比例

### 测试覆盖率

- [ ] 行覆盖率 ≥ 70%
- [ ] 函数覆盖率 ≥ 70%
- [ ] 分支覆盖率 ≥ 60%

### 性能要求

- [ ] Popup 打开 < 500ms
- [ ] 推荐列表渲染 < 100ms（虚拟滚动）
- [ ] 徽章更新 < 50ms
- [ ] 通知响应 < 200ms
- [ ] 内存占用 < 50MB

---

## 📝 开发检查清单

### 准备阶段
- [ ] 阅读完整设计文档（Part 1-3）
- [ ] 创建功能分支：`feature/phase-2.7-ui-feedback`
- [ ] 更新依赖：`npm install zustand recharts`（如需要）

### 开发阶段
- [ ] Step 1: 数据库扩展 ✅
- [ ] Step 2: 状态管理 ✅
- [ ] Step 3: Popup 界面 ✅
- [ ] Step 4: 徽章系统 ✅
- [ ] Step 5: 设置页 ✅
- [ ] Step 6: 用户操作 ✅

### 测试阶段
- [ ] 单元测试全部通过
- [ ] 组件测试全部通过
- [ ] 集成测试全部通过
- [ ] 浏览器手动测试通过
- [ ] 覆盖率达标

### 提交阶段
- [ ] 代码格式化：`npm run format`
- [ ] 运行完整测试：`npm run test:coverage`
- [ ] 构建成功：`npm run build`
- [ ] 浏览器测试：加载开发版和生产版
- [ ] 提交代码并推送
- [ ] 创建 Pull Request

---

## 📚 相关文档

- [PHASE_2.7_UI_DESIGN.md](./PHASE_2.7_UI_DESIGN.md) - Part 1: 概述和数据模型
- [PHASE_2.7_UI_DESIGN_PART2.md](./PHASE_2.7_UI_DESIGN_PART2.md) - Part 2: 徽章和设置页
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - 开发计划
- [PRD.md](./PRD.md) - 产品需求文档

---

## 🔑 关键设计决策总结

### 1. 真实反馈 vs 虚假行为

**问题**: "标记已读"是自欺欺人的行为
**解决**: 
- ✅ "这些我都不想读"（明确表达推荐无效）
- ✅ 点击 + 深度阅读 → 有效推荐
- ✅ 主动忽略 → 无效推荐
- ❌ 移除"标记已读"和"稍后阅读"

### 2. 主动通知 vs 被动查看

**限制**: Chrome Extension 不能主动弹出 Popup
**解决**:
- ✅ Level 1: 徽章提醒（始终可用，橙色表示新推荐）
- ✅ Level 2: 系统通知（可选，需要用户授权）
- ✅ 克制策略：每日最多 3 次通知

### 3. 防止回音室效应

**问题**: 推荐内容被学习 → 兴趣越来越窄
**解决**:
- ✅ 选择性学习：主动访问权重 1.0，推荐有效权重 0.3
- ✅ 深度阅读门槛：停留 > 2 分钟 + 滚动 > 70%
- ✅ 探索因子：70% 基于兴趣 + 30% 探索新领域
- ✅ 来源标记：区分 ORGANIC、RECOMMENDED、SEARCH

### 4. 推荐质量反馈循环

```
发现推荐 → 通知用户 → 用户交互
              ↓
    ┌─────────┴─────────┐
    │                   │
  点击查看           主动忽略
    │                   │
    ↓                   ↓
深度阅读?           负反馈信号
    │                   │
Yes │ No               │
    │  │               │
    ↓  ↓               ↓
有效 无效          改进推荐算法
    │                   │
    └───────────────────┘
            ↓
        优化画像
```

---

## 🎉 完成标志

当所有验收标准通过后，Phase 2.7 即告完成！

此时用户将能够：
- ✅ 在冷启动阶段看到清晰的进度
- ✅ 通过系统通知/徽章发现新推荐
- ✅ 明确表达推荐的有效性（点击深度阅读 vs 忽略）
- ✅ 系统持续优化，避免回音室效应

**下一步**: Phase 3 - 用户画像构建 🚀

---

**文档版本**: 1.1 (2025-11-03 更新)
**日期**: 2025-11-03  
**状态**: Design (已根据用户反馈调整)
**预计工时**: 8.5 小时（增加通知系统和追踪系统）

**主要变更**:
- 重新设计反馈机制："这些我都不想读" 替代 "标记已读"
- 新增主动通知系统（徽章 + 系统通知）
- 新增推荐有效性追踪
- 新增选择性学习策略（防止回音室）
- 移除"稍后阅读"功能
