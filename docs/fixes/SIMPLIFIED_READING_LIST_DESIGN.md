# 阅读清单模式 - 简化方案

## 核心理念

**关注点分离**：
- 弹窗模式已完全正确处理：条目生成、URL 决策、翻译、标题处理
- 阅读清单模式只是**显示位置的切换**，不涉及额外的 URL 决策
- 清单模式直接使用弹窗已处理好的标题和链接，无需重复处理

---

## 设计方案

### 1. 数据模型

在 `Recommendation` 表添加单一字段来标识显示位置：

```typescript
interface Recommendation {
  // ... 现有字段
  
  // 显示位置：
  // - 'popup': 仅在弹窗展示（默认）
  // - 'readingList': 仅在阅读清单展示
  // - 'both': 同时在弹窗和清单展示（扩展用）
  displayLocation?: 'popup' | 'readingList' | 'both'
}
```

### 2. 弹窗模式正常流程（不变）

```
1. RecommendationService.generateRecommendations()
   ├─ 生成推荐
   ├─ 保存到 recommendations 表
   ├─ 自动翻译（如启用）
   └─ 发送通知
   
2. 前端展示
   └─ 根据 translation/sourceUrl/useGoogleTranslate 决策 URL
   └─ 弹窗显示
```

### 3. 切换到阅读清单模式

```typescript
// src/background.ts - DELIVERY_MODE_CHANGED
case 'DELIVERY_MODE_CHANGED':
  if (deliveryMode === 'readingList') {
    // 1. 获取当前弹窗中活跃的推荐
    const activeRecs = await db.recommendations
      .filter(rec => {
        const isActive = !rec.status || rec.status === 'active'
        const isUnread = !rec.isRead
        const notDismissed = rec.feedback !== 'dismissed'
        return isActive && isUnread && notDismissed
      })
      .toArray()
    
    // 2. 对每个推荐：获取弹窗中使用的 URL 和标题
    for (const rec of activeRecs) {
      try {
        // 这里调用弹窗中已有的 URL 决策逻辑
        // 而不是重新查询或决策
        const { url, title } = decideUrlForDisplay(rec)  // 复用弹窗逻辑
        
        // 3. 添加到阅读清单（使用弹窗的 URL 和标题）
        await chrome.readingList.addEntry({
          title: title,
          url: url,
          hasBeenRead: rec.isRead
        })
        
        // 4. 标记推荐为"在清单中"
        await db.recommendations.update(rec.id, {
          displayLocation: 'readingList'
        })
        
        // 5. 记录映射关系
        await db.readingListEntries.put({
          normalizedUrl: normalizeUrl(url),
          url: url,
          recommendationId: rec.id
        })
      } catch (error) {
        bgLogger.warn('加入阅读清单失败', { id: rec.id, error })
      }
    }
  }
```

### 4. 切换回弹窗模式

```typescript
case 'DELIVERY_MODE_CHANGED':
  if (deliveryMode === 'popup') {
    // 1. 获取清单中由扩展管理的条目（🤫 前缀）
    const entries = await chrome.readingList.query({})
    const ourEntries = entries.filter(e => e.title?.startsWith('🤫 '))
    
    // 2. 逐个删除
    for (const entry of ourEntries) {
      try {
        await chrome.readingList.removeEntry({ url: entry.url })
        
        // 3. 获取对应的推荐
        const normalizedUrl = normalizeUrl(entry.url)
        const rlEntry = await db.readingListEntries.get(normalizedUrl)
        
        if (rlEntry?.recommendationId) {
          // 4. 恢复推荐到弹窗模式
          await db.recommendations.update(rlEntry.recommendationId, {
            displayLocation: 'popup'
          })
        }
        
        // 5. 清理映射关系
        await db.readingListEntries.delete(normalizedUrl)
      } catch (error) {
        bgLogger.warn('删除清单条目失败', { url: entry.url, error })
      }
    }
  }
```

---

## 关键改动点

### 变更 1: RecommendationService.generateRecommendations()

**删除**阅读清单投递逻辑：

```typescript
// ❌ 删除这部分
if (deliveryMode === 'readingList' && ReadingListManager.isAvailable()) {
  for (const rec of recommendations) {
    await ReadingListManager.saveRecommendation(...)
  }
}

// ✅ 只在弹窗模式下发送通知
if (deliveryMode === 'popup') {
  await sendRecommendationNotification(...)
}

// 或更简化：不在这里处理投递，只生成推荐
// 投递由背景脚本或前端选择性调用
```

### 变更 2: ReadingListManager 的角色简化

```typescript
// 只保留基础的"添加到清单"功能
static async addToReadingList(
  title: string,
  url: string,
  hasBeenRead: boolean = false
): Promise<boolean> {
  if (!this.isAvailable()) return false
  
  try {
    await chrome.readingList.addEntry({
      title,
      url,
      hasBeenRead
    })
    return true
  } catch (error) {
    return false
  }
}

// 删除复杂的 saveRecommendation 逻辑
// 改为直接从外部传入已处理好的 URL 和标题
```

### 变更 3: 前端展示逻辑提取为公共函数

```typescript
// src/utils/recommendation-display.ts
export function decideUrlForDisplay(rec: Recommendation, config: {
  autoTranslate: boolean
  interfaceLanguage: string
  feedUseGoogleTranslate: boolean
}): { url: string; title: string } {
  // 复用现有的 URL 决策逻辑（来自弹窗组件或 ReadingListManager.decideRecommendationUrl）
  
  const baseUrl = normalizeUrlForTracking(rec.url)
  
  if (!config.feedUseGoogleTranslate) {
    return { url: baseUrl, title: rec.title }
  }
  
  if (config.autoTranslate && rec.translation) {
    const encodedUrl = encodeURIComponent(baseUrl)
    return {
      url: `https://translate.google.com/translate?sl=auto&tl=${config.interfaceLanguage}&u=${encodedUrl}`,
      title: rec.translation.translatedTitle
    }
  }
  
  return { url: baseUrl, title: rec.title }
}
```

---

## 数据流简化对比

### 旧设计（复杂）
```
生成推荐 → 自动翻译 → 投递阶段重新处理 URL → 阅读清单API
                    ↓
                 重复查询订阅源设置
                 重复 URL 决策
                 可能产生不一致
```

### 新设计（简化）
```
生成推荐 → 自动翻译 → [按需投递]
                    ↓
                 前端决策 URL 显示
                 ↓
                 调用阅读清单 API（使用已决策的 URL）
                 ↓
                 单向同步，无额外处理
```

---

## 问题解决

### 问题1: 重复的 URL 决策
**根本原因**：RecommendationService 在投递时重新调用了 saveRecommendation
**解决**：删除这部分逻辑，直接使用弹窗的 URL 决策结果

### 问题2: 模式切换时的不一致
**根本原因**：两次查询订阅源设置可能得到不同结果
**解决**：只查询一次（弹窗展示时），后续直接使用该结果

### 问题3: 推荐恢复失败
**根本原因**：URL 类型不一致导致数据库查询失败
**解决**：URL 类型始终一致（来自同一个决策），查询必然成功

---

## 核心改动清单

| 组件 | 改动 | 复杂度 |
|------|------|--------|
| `Recommendation` 类型 | 添加 `displayLocation` 字段 | 低 |
| `RecommendationService` | 删除阅读清单投递逻辑 | 低 |
| `ReadingListManager` | 简化为基础添加函数，删除复杂的 URL 决策 | 中 |
| `background.ts` | 模式切换时简单地同步清单 | 低 |
| `recommendation-display.ts` | 新建公共 URL 决策函数 | 低 |

**总体复杂度**: **低** ✅

---

## 实施步骤

### Step 1: 数据模型扩展（30分钟）
- [ ] 添加 `displayLocation` 字段到 `Recommendation` 类型
- [ ] 默认值：`'popup'`

### Step 2: 提取 URL 决策逻辑（1小时）
- [ ] 从 ReadingListManager 或弹窗组件提取通用 URL 决策函数
- [ ] 创建 `src/utils/recommendation-display.ts`

### Step 3: 简化 ReadingListManager（1小时）
- [ ] 删除复杂的 `saveRecommendation` 逻辑
- [ ] 添加简单的 `addToReadingList()` 函数
- [ ] 保留 `normalizeUrlForTracking()` 和基础工具函数

### Step 4: 删除 RecommendationService 中的阅读清单投递逻辑（30分钟）
- [ ] 删除 `generateRecommendations()` 中的阅读清单分支
- [ ] 简化为仅弹窗投递

### Step 5: 改造 background.ts 的模式切换（1.5小时）
- [ ] 使用新的 `decideUrlForDisplay()` 函数
- [ ] 简化切换到阅读清单的逻辑
- [ ] 简化切换回弹窗的逻辑

### Step 6: 测试（1.5小时）
- [ ] 弹窗模式正常操作（应无变化）
- [ ] 切换到阅读清单
- [ ] 清单中条目正确显示
- [ ] 切换回弹窗
- [ ] 条目正确恢复

**总计**: 5.5 小时 ⚡

---

## 为什么这个设计更好

1. **简单**: 无额外复杂性，关注点明确
2. **可维护**: 不需要多层兜底、快照等复杂机制
3. **可靠**: URL 类型一致性得到根本保证
4. **易于扩展**: 未来支持"同时显示在弹窗和清单"只需改 `displayLocation` 字段
5. **性能**: 减少数据库查询，无额外网络请求

---

## 验证清单

在实施前，需要验证：

- [ ] 弹窗中的 URL 决策逻辑是否正确？
- [ ] 是否有其他地方依赖 `saveRecommendation()` 的副作用？
- [ ] 用户手动在清单中修改条目时如何处理？（设为只读/提示）

