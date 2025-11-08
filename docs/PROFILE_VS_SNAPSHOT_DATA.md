# 兴趣画像与演化历程的数据关系说明

## 📊 数据来源

### 1. 兴趣画像（当前状态）

**数据源**：`getUserProfile()` → 当前用户画像  
**展示内容**：
- 基于**所有历史浏览数据**的实时计算
- 反映**当前时刻**的兴趣偏好
- 每次画像更新时重新计算

**示例**：
```typescript
profile = {
  totalPages: 1000,
  topics: {
    technology: 0.42,  // 当前技术兴趣占42%
    business: 0.25,
    design: 0.18,
    // ...
  },
  lastUpdated: Date.now()
}
```

### 2. 兴趣演化历程（历史快照）

**数据源**：`getEvolutionHistory()` → 历史快照记录  
**展示内容**：
- 基于**特定时间点**的兴趣状态
- 反映**过去某个时刻**的兴趣偏好
- 记录兴趣变化的轨迹

**示例**：
```typescript
snapshots = [
  {
    timestamp: 1699430400000,  // 11月8日
    primaryTopic: 'technology',
    primaryScore: 0.42,
    basedOnPages: 1000
  },
  {
    timestamp: 1698825600000,  // 11月1日
    primaryTopic: 'technology',
    primaryScore: 0.28,
    basedOnPages: 800
  },
  {
    timestamp: 1698220800000,  // 10月25日
    primaryTopic: 'business',
    primaryScore: 0.35,
    basedOnPages: 600
  }
]
```

## 🤔 为什么会有差异？

### 正常差异（预期行为）

#### 1. 时间点不同

**兴趣画像**：
- 显示的是**最新的、实时的**兴趣状态
- 基于全部1000页浏览数据

**演化历程最新快照**：
- 显示的是**快照创建时**的兴趣状态
- 可能基于950页数据（快照后又浏览了50页）

#### 2. 更新时机不同

**触发画像更新**：
- 用户点击"重建画像"
- 定期自动更新（每天1次）
- 新增大量浏览数据

**触发快照创建**：
- 主导兴趣变化（技术→商业）
- 主导程度变化（相对→绝对）
- 手动重建画像时

**结果**：画像可能更新了，但快照还没创建

#### 3. 计算方式相同但数据量不同

```typescript
// 画像：基于1000页
技术: 420页 / 1000页 = 42% (绝对主导)

// 快照：基于800页
技术: 224页 / 800页 = 28% (相对主导)
```

### 异常差异（需要检查）

#### 1. 快照未及时创建

**问题**：重建画像后没有创建快照  
**检查**：
```typescript
// ProfileManager.rebuildProfile() 应该调用
await InterestSnapshotManager.handleProfileUpdate(newProfile, 'rebuild')
```

#### 2. 快照数据错误

**问题**：快照保存的数据与画像不一致  
**检查**：
```typescript
// 确保 createSnapshot 正确保存数据
snapshot = {
  primaryTopic: primaryTopic.topic,
  primaryScore: primaryTopic.score,
  primaryLevel: primaryTopic.level,  // ← 必须保存
  topics: { ...profile.topics },
  basedOnPages: profile.totalPages
}
```

## ✅ 理想状态

### 数据一致性保证

**最新快照应该与当前画像基本一致**：

```typescript
// 当前画像
profile = {
  totalPages: 1000,
  topics: { technology: 0.42 }
}

// 最新快照（如果是重建画像时创建的）
latestSnapshot = {
  timestamp: Date.now(),
  basedOnPages: 1000,  // ← 应该相同
  primaryTopic: 'technology',
  primaryScore: 0.42,  // ← 应该相同
  primaryLevel: 'absolute'
}
```

### 如何确保一致性

#### 1. 重建画像时自动创建快照

```typescript
// ProfileManager.rebuildProfile()
const newProfile = await this.buildProfile()
await saveUserProfile(newProfile)

// ✅ 立即创建快照
await InterestSnapshotManager.handleProfileUpdate(newProfile, 'rebuild')

return newProfile
```

#### 2. 定期更新时创建快照

```typescript
// ProfileUpdateScheduler
if (shouldUpdate) {
  const updatedProfile = await profileManager.updateProfile()
  
  // ✅ 创建快照
  await InterestSnapshotManager.handleProfileUpdate(updatedProfile, 'periodic')
}
```

## 🔍 如何验证数据一致性

### 方法1：浏览器控制台

```javascript
// 1. 获取当前画像
const profile = await chrome.storage.local.get(['userProfile'])
console.log('当前画像:', profile.userProfile)

// 2. 获取最新快照
const { getInterestHistory } = await import('./storage/db')
const snapshots = await getInterestHistory(1)
console.log('最新快照:', snapshots[0])

// 3. 对比
console.log('页面数一致?', 
  profile.userProfile.totalPages === snapshots[0].basedOnPages
)
console.log('主导兴趣一致?',
  profile.userProfile.topics[snapshots[0].primaryTopic] === snapshots[0].primaryScore
)
```

### 方法2：重建画像后验证

```javascript
// 1. 重建画像
await profileManager.rebuildProfile()

// 2. 等待1秒
await new Promise(r => setTimeout(r, 1000))

// 3. 验证最新快照
const snapshots = await getInterestHistory(1)
console.log('快照触发原因:', snapshots[0].trigger)  // 应该是 'rebuild'
console.log('快照时间:', new Date(snapshots[0].timestamp))  // 应该是刚才
```

## 📋 调试清单

遇到数据不一致时，检查以下项目：

- [ ] 最新快照的 `trigger` 是什么？（manual/rebuild/periodic/primary_change）
- [ ] 最新快照的时间戳是多久前的？
- [ ] 快照的 `basedOnPages` 和当前 `totalPages` 差多少？
- [ ] 快照的 `primaryScore` 和当前主导兴趣分数差多少？
- [ ] 是否启用了定期更新？（`ProfileUpdateScheduler`）
- [ ] 重建画像后是否立即创建了快照？

## 🎯 正常场景示例

### 场景1：初次使用

```
时间线：
10/1  - 浏览100页 → 创建首个快照
10/8  - 浏览500页 → 兴趣变化，创建快照
10/15 - 浏览800页 → 强度变化，创建快照
10/22 - 浏览1000页 → 当前画像（无新快照）

结果：
- 兴趣画像显示：1000页，技术42%（绝对主导）
- 最新快照显示：800页，技术28%（相对主导）
- 差异原因：最后200页还没触发快照创建
```

### 场景2：重建画像

```
操作：点击"重建画像"

结果：
- 兴趣画像显示：1000页，技术42%（绝对主导）
- 最新快照显示：1000页，技术42%（绝对主导）
- ✅ 完全一致！
```

### 场景3：定期更新

```
时间线：
每天凌晨2点自动更新画像

今天凌晨：
- 更新画像：1000页，技术42%
- 创建快照：1000页，技术42%

今天下午：
- 又浏览了50页
- 画像：1050页，技术43%（实时计算）
- 快照：1000页，技术42%（凌晨的状态）

结果：
- 存在小幅差异（预期行为）
- 明天凌晨会同步
```

## 💡 最佳实践

1. **定期创建快照**：建议每次画像更新都创建快照
2. **重建时必创建**：重建画像后一定要创建快照
3. **变化时立即创建**：检测到兴趣变化立即创建
4. **清理旧快照**：定期清理6个月前的快照（保留最近10个）

## 🔗 相关代码

- 快照创建：`src/core/profile/InterestSnapshotManager.ts` → `handleProfileUpdate()`
- 画像重建：`src/core/profile/ProfileManager.ts` → `rebuildProfile()`
- 定期更新：`src/core/profile/ProfileUpdateScheduler.ts` → `checkAndScheduleUpdate()`
- 数据展示：`src/components/settings/UserProfileDisplay.tsx`
