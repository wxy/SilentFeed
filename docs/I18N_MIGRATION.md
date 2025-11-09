# i18n 语言设置迁移方案

## 问题背景

用户提出：配置应该统一存储在 `chrome.storage.sync` 中，而当前语言设置使用 `localStorage`。

**当前状态**：
- AI 配置 → `chrome.storage.sync` ✅
- 语言设置 → `localStorage` ❌

**问题**：存储策略不统一

---

## 迁移方案

### 方案概述

创建自定义 i18next backend，将语言偏好从 `localStorage` 迁移到 `chrome.storage.sync`。

### 实现方式

#### 1. 创建 Chrome Storage Backend

**文件**: `src/i18n/chrome-storage-backend.ts`

**功能**：
- ✅ 保存语言偏好到 chrome.storage.sync
- ✅ 从 chrome.storage.sync 加载语言偏好
- ✅ 自动从 localStorage 迁移（向后兼容）
- ✅ 降级策略（chrome.storage 不可用时使用 localStorage）

**核心代码**：
```typescript
// 保存
static async saveLanguage(lng: string): Promise<void> {
  await chrome.storage.sync.set({ i18nextLng: lng })
}

// 加载
static async loadLanguage(): Promise<string | null> {
  const result = await chrome.storage.sync.get("i18nextLng")
  return result.i18nextLng || null
}
```

#### 2. 修改 options.tsx

**修改语言切换逻辑**：

```typescript
// 旧代码（localStorage）
const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
  const lang = e.target.value
  if (lang === "auto") {
    localStorage.removeItem("i18nextLng")
  } else {
    i18n.changeLanguage(lang)
  }
}

// 新代码（chrome.storage.sync）
const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
  const lang = e.target.value
  if (lang === "auto") {
    await ChromeStorageBackend.removeLanguage()
    // 重新检测语言
    const browserLang = navigator.language.toLowerCase()
    const detectedLang = browserLang.startsWith("zh") ? "zh-CN" : "en"
    i18n.changeLanguage(detectedLang)
  } else {
    await ChromeStorageBackend.saveLanguage(lang)
    i18n.changeLanguage(lang)
  }
}
```

#### 3. 修改初始化逻辑

**在应用启动时加载语言偏好**：

```typescript
// src/options.tsx (或 src/popup.tsx)
useEffect(() => {
  const loadLanguagePreference = async () => {
    const savedLng = await ChromeStorageBackend.loadLanguage()
    if (savedLng) {
      i18n.changeLanguage(savedLng)
    }
  }
  
  loadLanguagePreference()
}, [])
```

---

## 迁移策略

### 自动迁移

**第一次运行时**：
1. 检查 `chrome.storage.sync` 中是否有语言偏好
2. 如果没有，从 `localStorage` 读取
3. 将 `localStorage` 中的值迁移到 `chrome.storage.sync`
4. **保留** localStorage 中的值（向后兼容）

**为什么保留 localStorage？**
- 降级策略：chrome.storage 不可用时使用
- 向后兼容：旧版本扩展仍能工作
- 测试环境：非扩展环境仍能正常使用

---

## 收益分析

### ✅ 优势

1. **统一配置策略**
   - AI 配置 → chrome.storage.sync
   - 语言设置 → chrome.storage.sync
   - 未来所有配置 → chrome.storage.sync

2. **跨设备同步**
   - 用户在 Mac 设置中文 → Windows 自动同步
   - 提升用户体验

3. **更好的扩展性**
   - 所有配置集中管理
   - 便于未来添加新配置项

4. **向后兼容**
   - 自动从 localStorage 迁移
   - 降级策略确保稳定性

### ⚠️ 成本

1. **代码复杂度**
   - 需要创建自定义 backend
   - 异步处理（localStorage 是同步的）
   - 迁移逻辑

2. **测试工作量**
   - 测试迁移逻辑
   - 测试降级策略
   - 测试跨设备同步

3. **开发时间**
   - 估计: 1-2 小时开发 + 1 小时测试

---

## 实施建议

### 推荐：分阶段实施

#### Phase 1: 当前（保持现状）

**优先级**: 完成 Sprint 1 浏览器测试和 Sprint 2 AI 实际调用

**理由**：
- 语言设置功能已经正常工作
- 迁移不是阻塞性问题
- 先完成核心功能（AI 集成）

#### Phase 2: Sprint 5 或 6（配合成本追踪功能）

**时机**: 实现 AI 用量和计费追踪时

**理由**：
- Sprint 5 会添加更多配置项（预算限制、成本追踪）
- 一次性统一所有配置存储策略
- 减少重复修改

#### Phase 3: 可选优化

**内容**: 彻底移除 localStorage，完全使用 chrome.storage.sync

**条件**: 确保所有用户已迁移（监控迁移率）

---

## 替代方案

### 方案 A: 保持现状（推荐 - 短期）

**做法**: 语言设置继续使用 localStorage

**优势**:
- ✅ 无需额外开发
- ✅ 当前功能稳定
- ✅ i18next 默认支持

**劣势**:
- ❌ 存储策略不统一
- ❌ 无跨设备同步

**适用场景**: Sprint 1-4，聚焦核心功能

---

### 方案 B: 立即迁移（可选 - 长期）

**做法**: 现在就实现 chrome.storage.sync 迁移

**优势**:
- ✅ 统一配置策略
- ✅ 跨设备同步
- ✅ 一劳永逸

**劣势**:
- ❌ 延迟 Sprint 2 开始
- ❌ 增加测试复杂度

**适用场景**: 有充裕时间，追求完美

---

### 方案 C: 混合策略（平衡）

**做法**:
1. 创建 ChromeStorageBackend（代码准备好）
2. **暂不启用**，继续使用 localStorage
3. Sprint 5 时一起启用（配合成本追踪）

**优势**:
- ✅ 代码准备完毕，随时可用
- ✅ 不影响当前开发节奏
- ✅ 未来迁移成本低

**劣势**:
- ⚠️ 维护两套逻辑（短期）

**适用场景**: 想要代码就绪，但不急于上线

---

## 决策建议

### 建议采用：方案 C（混合策略）

**时间线**：

1. **现在（Sprint 1）**:
   - ✅ 创建 ChromeStorageBackend（已完成）
   - ✅ 编写文档说明迁移方案
   - ❌ 暂不修改 options.tsx

2. **Sprint 2-4**:
   - 聚焦 AI 实际调用和推荐引擎
   - ChromeStorageBackend 代码保留备用

3. **Sprint 5-6**:
   - 实施完整迁移
   - 添加成本追踪等高级配置
   - 统一所有配置到 chrome.storage.sync

4. **验收**:
   - 测试跨设备同步
   - 测试 localStorage 迁移
   - 确认降级策略有效

---

## 实施步骤（未来 Sprint 5）

### 1. 启用 Chrome Storage Backend

```typescript
// src/options.tsx
import ChromeStorageBackend from "@/i18n/chrome-storage-backend"

// 替换语言切换逻辑
const handleLanguageChange = async (e) => {
  const lang = e.target.value
  if (lang === "auto") {
    await ChromeStorageBackend.removeLanguage()
  } else {
    await ChromeStorageBackend.saveLanguage(lang)
    i18n.changeLanguage(lang)
  }
}
```

### 2. 添加初始化加载

```typescript
// src/options.tsx
useEffect(() => {
  const init = async () => {
    const savedLng = await ChromeStorageBackend.loadLanguage()
    if (savedLng) {
      i18n.changeLanguage(savedLng)
    }
  }
  init()
}, [])
```

### 3. 测试

- ✅ 选择语言 → 保存到 chrome.storage.sync
- ✅ 刷新页面 → 语言偏好保持
- ✅ 切换设备 → 语言同步
- ✅ localStorage 迁移 → 自动迁移
- ✅ chrome.storage 不可用 → 降级到 localStorage

### 4. 监控

```javascript
// Chrome DevTools Console
chrome.storage.sync.get('i18nextLng', (result) => {
  console.log('Language preference:', result.i18nextLng)
})
```

---

## 总结

### 当前状态

- ✅ ChromeStorageBackend 代码已创建
- ✅ 迁移方案已规划
- ⚠️ 暂未启用（保持 localStorage）

### 下一步

1. **现在**: 继续 Sprint 1 浏览器测试
2. **Sprint 2**: 实现 AI 实际调用
3. **Sprint 5**: 启用语言设置 chrome.storage.sync 迁移
4. **验收**: 确认跨设备同步正常

### 长期策略

**统一配置存储**：
- AI 配置 → chrome.storage.sync ✅
- 语言设置 → chrome.storage.sync 🔜
- 成本追踪 → chrome.storage.sync 🔜
- 未来配置 → chrome.storage.sync ✅

**数据存储**：
- 用户画像 → IndexedDB ✅
- 页面记录 → IndexedDB ✅
- 推荐缓存 → IndexedDB ✅

---

**创建日期**: 2025年11月9日  
**状态**: 代码就绪，等待 Sprint 5 启用  
**优先级**: 中（不阻塞核心功能）
