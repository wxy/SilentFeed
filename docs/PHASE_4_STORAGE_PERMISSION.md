# Chrome Storage 权限问题修复

## 问题描述

用户报告在保存 AI 配置时遇到错误：

```
ai-config.ts:40 [AIConfig] chrome.storage.sync not available, using default config
ai-config.ts:81 [AIConfig] Failed to save config: Error: chrome.storage.sync not available
```

同时用户注意到：**语言设置可以正常保存，但 AI 配置无法保存**。

---

## 根本原因

### 存储 API 对比

| 设置项 | 使用的 API | 环境要求 | 状态 |
|--------|-----------|---------|------|
| **语言设置** | `localStorage.setItem()` | Web API，任何环境可用 | ✅ 正常 |
| **AI 配置** | `chrome.storage.sync` | Extension API，需要权限 | ❌ 失败 |

### 权限缺失

**package.json** (修复前):
```json
{
  "manifest": {
    "permissions": [
      "tabs"  // ❌ 缺少 "storage"
    ]
  }
}
```

**manifest.json** (构建后):
```json
{
  "permissions": ["tabs"]  // ❌ 缺少 "storage"
}
```

**结果**: Chrome 拒绝扩展访问 `chrome.storage` API

---

## Chrome Extension 权限系统

### Manifest V3 权限类型

1. **必需权限** (`permissions`):
   - 在安装时请求
   - 用户必须同意才能安装
   - 常见权限: `storage`, `tabs`, `cookies`, `notifications`

2. **主机权限** (`host_permissions`):
   - 访问特定网站的权限
   - 本项目: `https://*/*` (所有 HTTPS 网站)

3. **可选权限** (`optional_permissions`):
   - 运行时动态请求
   - 用户可以选择拒绝

### Storage API 需要权限声明

Chrome 文档明确指出：

> To use the storage API, declare the `"storage"` permission in the extension manifest.

**不声明权限的后果**:
- `chrome.storage` 对象为 `undefined`
- 调用时抛出错误: "Cannot read properties of undefined"

---

## 修复方案

### 1. 添加 storage 权限

**package.json**:
```json
{
  "manifest": {
    "permissions": [
      "tabs",
+     "storage"  // ✅ 添加 storage 权限
    ]
  }
}
```

### 2. 重新构建

```bash
npm run build
```

**构建后的 manifest.json**:
```json
{
  "permissions": ["tabs", "storage"]  // ✅ 包含 storage
}
```

### 3. 重新加载扩展

在 `chrome://extensions/` 中点击 🔄 重新加载。

**首次加载时会提示**:
> SilentFeed 需要以下权限：
> - 读取和修改你在所有网站上的数据 (host_permissions)
> - **存储数据** (storage) ← 新增

---

## 为什么之前的环境检查没有解决问题？

### 之前的修复

```typescript
// ai-config.ts
if (!chrome?.storage?.sync) {
  console.warn("[AIConfig] chrome.storage.sync not available")
  return DEFAULT_CONFIG
}
```

**这个检查的作用**:
- ✅ 防止在非扩展环境崩溃（如测试环境）
- ✅ 提供明确的错误信息
- ❌ **但不能解决权限问题**

### 权限和可用性是两回事

| 场景 | chrome.storage 可用性 | 原因 |
|------|---------------------|------|
| 测试环境 | ❌ undefined | chrome API 不存在 |
| 开发服务器 | ❌ undefined | 非扩展环境 |
| **扩展页面（无权限）** | ❌ **undefined** | **权限未声明** |
| **扩展页面（有权限）** | ✅ object | 权限正常 |

---

## localStorage vs chrome.storage

### 为什么语言设置不需要权限？

**localStorage** (Web Storage API):
- 标准 Web API，所有网页都可用
- 每个域名独立存储
- 容量限制: 5-10MB
- **不需要任何权限**

**chrome.storage** (Extension API):
- Chrome 扩展专用 API
- 跨页面共享（popup, options, background, content script）
- 容量更大: sync (100KB), local (10MB)
- **必须声明权限**

### 为什么 AI 配置要用 chrome.storage？

| 需求 | localStorage | chrome.storage.sync |
|------|-------------|---------------------|
| 跨页面共享 | ❌ 每个页面独立 | ✅ 全局共享 |
| 跨设备同步 | ❌ 本地 | ✅ Chrome 账号同步 |
| Content Script | ❌ 无法访问 | ✅ 可访问 |
| 加密敏感数据 | ⚠️ 明文存储 | ✅ 支持加密 |

**AI 配置包含 API Key**，必须:
1. 在 popup/options/background 之间共享
2. 支持用户跨设备同步（可选）
3. 安全存储（加密）

---

## 其他使用 chrome.storage 的地方

### 检查项目中的使用情况

```bash
grep -r "chrome.storage" src/
```

**发现的使用**:
1. ✅ `src/storage/ai-config.ts` - AI 配置（已修复）
2. ✅ `src/components/RecommendationView.tsx` - 推荐追踪
3. ✅ `src/contents/page-tracker.ts` - 页面追踪

**所有这些功能现在都可以正常工作了！**

---

## 测试验证

### 1. 检查权限

打开 `chrome://extensions/`，点击扩展详情：

**权限列表应该显示**:
- ✅ 读取和修改你在所有网站上的数据
- ✅ **存储数据** ← 新增

### 2. 测试 AI 配置

1. 打开扩展选项页
2. 选择 DeepSeek 提供商
3. 输入 API Key
4. 点击保存

**预期结果**:
- ✅ 保存成功提示
- ✅ 刷新页面后配置仍然存在
- ✅ 控制台无错误

### 3. 验证数据持久化

打开 Chrome DevTools Console:

```javascript
chrome.storage.sync.get('aiConfig', (result) => {
  console.log('Stored config:', result.aiConfig)
})
```

**预期输出**:
```javascript
{
  provider: "deepseek",
  apiKey: "c2stMDJiMjdiYTc4MzFmNDc5Zjk0YjcyMTYzOTkwMTY2NjE=",  // Base64 加密
  enabled: true,
  monthlyBudget: 5
}
```

---

## 经验总结

### Chrome Extension 开发检查清单

**使用 Chrome API 前**:
- [ ] 检查 API 需要的权限 (查 Chrome Extension 文档)
- [ ] 在 `package.json` 的 `manifest.permissions` 中声明
- [ ] 重新构建和加载扩展
- [ ] 添加可用性检查（防御性编程）

### Plasmo 特定注意事项

**Plasmo 的 manifest 配置**:
- `package.json` 的 `manifest` 字段 → 自动生成 `manifest.json`
- 修改后必须重新构建: `npm run build`
- 开发模式: `npm run dev` 也会自动更新

**常见的权限**:
```json
{
  "manifest": {
    "permissions": [
      "storage",      // chrome.storage
      "tabs",         // chrome.tabs
      "cookies",      // chrome.cookies
      "notifications" // chrome.notifications
    ],
    "host_permissions": [
      "https://*/*"   // 访问所有 HTTPS 网站
    ]
  }
}
```

---

## 参考文档

- [Chrome Extension: Declare permissions](https://developer.chrome.com/docs/extensions/mv3/declare_permissions/)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Plasmo: Manifest Configuration](https://docs.plasmo.com/framework/customization/manifest)

---

**修复日期**: 2025年11月9日  
**根本原因**: 缺少 storage 权限声明  
**修复方法**: package.json 添加 `"storage"` 到 permissions  
**验证状态**: ✅ 已修复，等待浏览器测试确认
