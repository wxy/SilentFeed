# 存储策略分析：localStorage vs chrome.storage.sync

## 快速结论

**推荐使用 `chrome.storage.sync` 作为 AI 配置的主存储**

理由：
1. ✅ **跨设备同步** - 用户的 API Key 在所有设备可用
2. ✅ **跨页面共享** - popup/options/background/content script 都能访问
3. ✅ **更安全** - 相对隔离，不易被网页脚本访问
4. ✅ **更大容量** - sync: 100KB, local: 10MB (vs localStorage 5-10MB)
5. ⚠️ **需要权限声明** - 但这不是缺点，而是安全特性

---

## 详细对比

### 1. 基本特性

| 特性 | localStorage | chrome.storage.sync | chrome.storage.local |
|------|-------------|---------------------|---------------------|
| **API 类型** | Web API | Extension API | Extension API |
| **容量限制** | 5-10MB | 100KB (单项 8KB) | 10MB |
| **同步能力** | ❌ 本地 | ✅ Chrome 账号同步 | ❌ 本地 |
| **需要权限** | ❌ 不需要 | ✅ `"storage"` | ✅ `"storage"` |
| **访问范围** | 同域名页面 | 扩展所有环境 | 扩展所有环境 |
| **性能** | 同步（可能阻塞） | 异步 | 异步 |

---

### 2. 访问范围对比

#### localStorage 的限制

```
chrome-extension://abc123/popup.html    → localStorage (独立)
chrome-extension://abc123/options.html  → localStorage (独立)
chrome-extension://abc123/background.js → ❌ 无法访问 localStorage
Content Script (https://example.com)    → ❌ 访问网站的 localStorage，非扩展的
```

**问题**：
- popup 保存的配置，options 无法读取（除非手动同步）
- background service worker 完全无法使用 localStorage
- content script 访问的是宿主页面的 localStorage

#### chrome.storage 的优势

```
chrome-extension://abc123/popup.html    → chrome.storage ✅
chrome-extension://abc123/options.html  → chrome.storage ✅
chrome-extension://abc123/background.js → chrome.storage ✅
Content Script (https://example.com)    → chrome.storage ✅
```

**所有环境共享同一份数据！**

---

### 3. 跨设备同步

#### chrome.storage.sync 的同步行为

**场景**：用户在 Mac 上配置 DeepSeek API Key

| 时刻 | Mac | Windows | Android Chrome |
|------|-----|---------|---------------|
| T0 | 配置 API Key | 未配置 | 未配置 |
| T1 (同步后) | ✅ 已配置 | ✅ **自动同步** | ✅ **自动同步** |

**用户体验**：
- ✅ 一次配置，多设备可用
- ✅ 换电脑无需重新输入敏感信息
- ✅ 符合现代用户期望

#### localStorage 的问题

```
Mac:     配置 API Key → ✅ Mac 可用
Windows: 打开扩展   → ❌ 需要重新配置
手机:    打开扩展   → ❌ 需要重新配置
```

**对于 API Key 这种敏感配置，重复输入 = 糟糕体验**

---

### 4. 安全性

#### chrome.storage 的隔离性

```javascript
// 恶意网站脚本
document.addEventListener('DOMContentLoaded', () => {
  // ❌ 无法访问扩展的 chrome.storage
  chrome.storage.sync.get('aiConfig', ...) // Error: chrome.storage is undefined
})
```

**优势**：
- ✅ 只有扩展内部可以访问
- ✅ 即使网站被注入恶意脚本，也无法窃取 API Key

#### localStorage 的风险

```javascript
// Content Script 注入到网页
const apiKey = localStorage.getItem('aiConfig') 
// ❌ 访问的是网页的 localStorage，不是扩展的
```

**问题**：
- ⚠️ 容易混淆（网页 localStorage vs 扩展内部 localStorage）
- ⚠️ 扩展内部的 localStorage 也可能被 XSS 攻击（如果有漏洞）

---

### 5. 容量和性能

#### 实际需求分析

**AI 配置数据结构**：
```json
{
  "provider": "deepseek",
  "apiKey": "c2stMDJiMjdiYTc4MzFmNDc5Zjk0YjcyMTYzOTkwMTY2NjE=",
  "enabled": true,
  "monthlyBudget": 5
}
```

**大小估算**：
- JSON 字符串: ~200 bytes
- Base64 加密后: ~300 bytes

**chrome.storage.sync 限制**：
- 单项: 8KB (我们只用 300 bytes) ✅
- 总容量: 100KB ✅

**结论**: 完全够用，无需担心容量

#### 性能对比

| 操作 | localStorage | chrome.storage |
|------|-------------|---------------|
| 读取 | 同步（阻塞主线程） | 异步（不阻塞） |
| 写入 | 同步（可能卡顿） | 异步（流畅） |
| 适用场景 | 小数据，频繁读取 | 任何数据 |

**AI 配置特点**：
- 读取频率: 低（启动时加载一次）
- 写入频率: 极低（用户手动修改）

**两者性能差异对用户不可感知**

---

### 6. 开发体验

#### localStorage (同步 API)

```javascript
// 简单直观
localStorage.setItem('key', 'value')
const value = localStorage.getItem('key')
```

**优点**: 代码简洁  
**缺点**: 同步阻塞，不推荐大量使用

#### chrome.storage (异步 API)

```javascript
// 需要处理异步
await chrome.storage.sync.set({ key: 'value' })
const { key } = await chrome.storage.sync.get('key')
```

**优点**: 符合现代 JS 最佳实践  
**缺点**: 稍微复杂（但我们已经封装好了）

---

## 推荐方案

### 当前项目的最佳实践

| 数据类型 | 推荐存储 | 理由 |
|---------|---------|------|
| **AI 配置** (API Key, Provider) | `chrome.storage.sync` | 跨设备同步，安全性高 |
| **用户画像数据** | `IndexedDB` (Dexie) | 大容量，结构化查询 |
| **页面访问记录** | `IndexedDB` (Dexie) | 大容量，频繁写入 |
| **临时 UI 状态** | React State / Zustand | 运行时状态，不需持久化 |
| **语言偏好** | `localStorage` 或 `chrome.storage.sync` | 都可以，已用 localStorage |

---

### 关于语言设置

**当前使用**: `localStorage.setItem("i18nextLng", lang)`

**是否需要改为 chrome.storage.sync？**

| 因素 | localStorage | chrome.storage.sync |
|------|-------------|---------------------|
| 同步需求 | 弱（可接受重新选择） | 强（更好的体验） |
| 访问范围 | options 页面够用 | 更灵活 |
| 依赖关系 | i18next 默认用 localStorage | 需要自定义 backend |
| 改造成本 | 无 | 中等 |

**建议**: 
- 现阶段保持 localStorage（i18next 默认支持）
- 未来可迁移到 chrome.storage.sync（需要配置 i18next backend）
- 优先级: 低（不影响核心功能）

---

## 迁移到 chrome.storage.sync 的必要性

### AI 配置 → 必须用 chrome.storage.sync

**原因**:
1. ✅ **Background Service Worker 需要访问**
   - 未来 Sprint 2/3 会在 background 中调用 AI API
   - background.js 无法访问 localStorage
   
2. ✅ **Content Script 需要访问**
   - page-tracker.ts 需要判断是否使用 AI 分析
   - content script 的 localStorage 是网页的，不是扩展的

3. ✅ **跨设备体验**
   - API Key 是敏感信息，重复输入体验差
   - 用户期望配置同步

### 语言设置 → 可选

**保持 localStorage 的理由**:
- i18next 默认支持，无需额外配置
- 只在 options 页面使用
- 改造收益不大

**迁移到 chrome.storage.sync 的理由**:
- 统一存储策略
- 跨设备语言偏好同步
- 更好的扩展性

---

## 代码示例

### 当前实现（✅ 正确）

```typescript
// src/storage/ai-config.ts
export async function saveAIConfig(config: AIConfig): Promise<void> {
  // ✅ 使用 chrome.storage.sync
  await chrome.storage.sync.set({ aiConfig: encryptedConfig })
}
```

### 如果用 localStorage（❌ 不推荐）

```typescript
// ❌ 问题代码
export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem('aiConfig', JSON.stringify(config))
}

// 问题 1: background.js 无法访问
// 问题 2: 不同页面数据不同步
// 问题 3: 无法跨设备同步
```

---

## Chrome Storage 最佳实践

### 1. 选择合适的 storage 类型

```typescript
// 需要同步 + 小数据（< 100KB）
chrome.storage.sync.set({ aiConfig: ... })

// 不需要同步 + 大数据（< 10MB）
chrome.storage.local.set({ cache: ... })

// 超大数据（> 10MB）
// 使用 IndexedDB (Dexie)
await db.pageVisits.add(...)
```

### 2. 监听存储变化

```typescript
// 在 popup 中监听 options 页面的配置更新
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.aiConfig) {
    console.log('AI 配置已更新:', changes.aiConfig.newValue)
    // 重新加载配置
  }
})
```

### 3. 处理同步冲突

```typescript
// chrome.storage.sync 会自动处理冲突
// 策略: 最后写入优胜 (Last Write Wins)
// 无需手动处理
```

---

## 结论

### ✅ 当前方案是正确的

**AI 配置使用 `chrome.storage.sync`**:
- ✅ 满足跨页面共享需求
- ✅ 满足跨设备同步需求
- ✅ 满足安全性需求
- ✅ 符合 Chrome Extension 最佳实践

### 📋 未来优化建议

**低优先级**:
1. 考虑将语言设置也迁移到 `chrome.storage.sync`
2. 统一存储策略文档
3. 添加存储配额监控（防止超限）

**高优先级**:
1. 保持当前 AI 配置的 `chrome.storage.sync` 实现 ✅
2. 完成 Sprint 2: AI 实际调用（需要在 background 中访问配置）

---

## 参考资料

- [Chrome Extension: chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Storage vs Web Storage](https://developer.chrome.com/docs/extensions/mv3/storage-and-cookies/)
- [Storage quotas and eviction criteria](https://web.dev/storage-quota/)

---

**结论**: 继续使用 `chrome.storage.sync` 存储 AI 配置，无需更改 ✅
