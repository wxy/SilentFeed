# Phase 3.2d: 画像重建与演化历程策略

## 问题背景

用户提出三个关键问题：

1. **假数据问题**: 重建用户画像后，兴趣演化历程没有改变（测试数据不会被清除）
2. **重建策略**: 重建画像时是否应该清除历史演化数据？
3. **UI 问题**: Tooltip 被上方元素遮蔽，需要改为左右显示

## 设计决策

### 1. 重建数据策略（方案 C：保留历史 + 标记重建）

**为什么不选择完全清除？**
- ❌ 方案A（完全清除）：丢失用户兴趣演化轨迹，无法回溯
- ❌ 方案B（保留但不标记）：数据混乱，用户看不出哪里发生了重建

**选择方案 C 的理由：**
- ✅ **保留历史价值**：用户可以看到完整的兴趣演化轨迹
- ✅ **清晰标记重建节点**：用户知道哪些数据是重建前的，哪些是重建后的
- ✅ **支持数据分析**：可以对比重建前后的兴趣变化
- ✅ **符合产品理念**：透明化数据处理过程

**实现方式：**
```typescript
// 1. 重建时创建特殊快照，标记为 trigger: 'rebuild'
// 2. UI 上用特殊样式展示重建节点（如：🔄 图标）
// 3. Tooltip 中显示 "用户主动重建画像"
```

### 2. 清除测试数据

**问题：** `__generateInterestChanges()` 生成的假数据不会被清除

**解决：** 添加清除命令
```javascript
// 在浏览器控制台中
window.__clearInterestHistory() // 清除所有演化历程数据
```

### 3. Tooltip 位置优化

**问题：** 悬浮提示框被上方元素遮蔽

**解决方案：** 根据节点位置动态调整 tooltip 方向
- 前 2 个节点：显示在右侧
- 后 2 个节点：显示在左侧
- 中间节点：显示在上方（提升 z-index）

## 技术实现

### 1. 数据结构（无需修改）

`InterestSnapshot.trigger` 已支持 `'rebuild'` 类型：
```typescript
trigger: 'manual' | 'primary_change' | 'periodic' | 'rebuild'
```

### 2. 后端逻辑修改

#### ProfileManager.rebuildProfile()
```typescript
async rebuildProfile(): Promise<UserProfile> {
  // 1. 构建新画像
  const newProfile = await profileBuilder.buildFromVisits(analyzedVisits)
  
  // 2. 保存到数据库
  await db.userProfile.put(newProfile)
  
  // 3. 创建重建快照（自动标记 trigger: 'rebuild'）
  await InterestSnapshotManager.handleProfileUpdate(newProfile, 'rebuild')
  
  return newProfile
}
```

#### 新增清除命令
```typescript
// src/debug/clear-interest-history.ts
export async function clearInterestHistory() {
  await db.interestSnapshots.clear()
  console.log("✅ 已清除所有兴趣演化历程数据")
}

// 挂载到 window
window.__clearInterestHistory = clearInterestHistory
```

### 3. UI 层修改

#### Tooltip 位置优化
```tsx
{/* 根据位置动态调整 tooltip 方向 */}
const tooltipPosition = index <= 1 
  ? 'left-full ml-2'      // 前两个节点：右侧
  : index >= totalCount - 2
    ? 'right-full mr-2'   // 后两个节点：左侧
    : 'bottom-full mb-2'  // 中间节点：上方

<div className={`absolute ${tooltipPosition} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 z-30`}>
  {/* Tooltip 内容 */}
</div>
```

#### 重建节点特殊样式
```tsx
{/* 重建标记 */}
{snapshot.trigger === 'rebuild' && (
  <div className="absolute -top-2 -right-2 text-xl bg-white dark:bg-gray-800 rounded-full p-1 shadow-lg">
    🔄
  </div>
)}
```

## 实现步骤

### Step 1: 验证当前逻辑
- ✅ `rebuildProfile()` 已调用 `handleProfileUpdate(newProfile, 'rebuild')`
- ✅ `InterestSnapshot.trigger` 支持 `'rebuild'` 类型
- ✅ 数据结构完整

### Step 2: 添加清除命令
- [ ] 创建 `src/debug/clear-interest-history.ts`
- [ ] 挂载到 `window.__clearInterestHistory`
- [ ] 更新 `src/debug/index.ts` 统一导出

### Step 3: 优化 UI 显示
- [ ] 修改 Tooltip 位置策略（左右动态调整）
- [ ] 添加重建节点特殊标记
- [ ] 提升 z-index 防止遮挡

### Step 4: 测试验证
- [ ] 测试重建画像是否创建 `rebuild` 快照
- [ ] 测试清除命令是否正常工作
- [ ] 测试 Tooltip 位置是否正确
- [ ] 测试重建节点标记是否显示

## 用户使用流程

### 场景 1：清除测试数据
```javascript
// 1. 清除假数据
__clearInterestHistory()

// 2. 重建画像
__rebuildProfile()

// 3. 查看演化历程（应该只有一个重建节点）
```

### 场景 2：正常使用
```
1. 用户浏览 100 页 → 自动创建快照 1（首次建立）
2. 用户浏览 200 页 → 自动创建快照 2（兴趣变化）
3. 用户点击"重建画像" → 创建快照 3（重建标记 🔄）
4. 继续浏览 → 自动创建快照 4, 5...（基于重建后的画像）
```

**UI 效果：**
```
快照1 -----> 快照2 -----> [🔄 快照3] -----> 快照4 -----> 快照5
  🐱          🐶            🐼              🐼            🦊
 首次       兴趣变化        重建           保持稳定      兴趣变化
```

## 数据一致性保证

### 问题：重建后的演化数据是否可信？

**答案：可信，因为重建会重新计算整个画像**

1. **重建前的快照**：基于历史数据，反映当时的真实兴趣
2. **重建快照**：基于所有数据重新计算，反映最新的准确画像
3. **重建后的快照**：基于重建后的画像继续演化

**数据连续性：**
- 重建前后的数据可能出现跳跃（因为算法重新计算）
- 这是正常现象，应该保留这种跳跃（体现了重建的效果）
- UI 上通过 🔄 标记清晰标识重建节点

## 性能考虑

### 重建是否会计算太多？

**当前实现：** 重建时遍历所有确认的访问记录 → 时间复杂度 O(n)

**优化策略：**
1. **数据量小时（< 1000 页）**：直接全量计算，性能无影响
2. **数据量大时（> 1000 页）**：
   - 可选优化：仅使用最近 6 个月的数据
   - 或者：后台异步计算，显示进度条
   - MVP 阶段：暂不优化，直接全量计算

**预计性能：**
- 100 页：< 100ms
- 1000 页：< 500ms
- 10000 页：< 3s（未来优化）

## 文档更新

- [ ] 更新 `docs/TESTING.md` 添加清除命令说明
- [ ] 更新 `docs/TDD.md` 说明重建策略
- [ ] 更新 `README.md` 添加调试命令列表

## 验收标准

- [ ] 重建画像创建 `trigger: 'rebuild'` 快照
- [ ] `__clearInterestHistory()` 可清除所有快照
- [ ] Tooltip 不会被遮挡（左右动态显示）
- [ ] 重建节点显示 🔄 标记
- [ ] 所有测试通过
- [ ] 文档更新完成
