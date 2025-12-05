# AI 配置保存问题修复

**状态**: 🚧 进行中  
**优先级**: P0 (紧急)  
**发现时间**: 2025-12-05  
**关联 Issue**: docs/bugs - AI 配置自动保存失败

## 📋 问题描述

### Bug 1: AI 配置自动保存失败
**现象**: 在 AI 配置页面切换快速预设或修改高级配置后，刷新页面发现配置没有保存

**根本原因**: `AIConfig.tsx` 组件中的保存逻辑还在使用废弃的字段结构：
- `provider` (已废弃)
- `enabled` (已废弃)
- `apiKeys` (已废弃)
- `model` (已废弃 - 应该在每个 provider 内部)
- `enableReasoning` (已废弃 - 应该在每个 provider 内部)

### Bug 2: 快速预设切换未更新引擎分配
**现象**: 切换快速预设（如"智能优先"、"隐私优先"）后，`engineAssignment` 虽然在组件状态中更新了，但由于保存逻辑问题，实际并未持久化到 storage

### Bug 3: 高级配置与预设方案冲突
**现象**: 手动修改高级配置后，预设按钮仍显示选中状态，且无法区分用户是使用预设还是自定义配置

## 🔍 受影响的代码

### 需要修复的文件

1. **src/components/settings/AIConfig.tsx** (主要问题)
   - `handleSave()` - 第 485 行
   - `handleDisable()` - 第 524 行
   - `autoSaveConfig()` - 第 398 行
   - `handleTestConnection()` - 第 304 行
   - 初始化逻辑需要适配新结构

2. **src/components/settings/AIEngineAssignment.tsx**
   - `handlePresetSelect()` - 需要触发父组件保存
   - `detectPreset()` - 已实现，但需要添加"自定义"标记

## 🛠️ 修复方案

### 方案 1: 更新 AIConfig.tsx 保存逻辑

#### 1.1 重构保存函数

**旧代码** (有问题的):
```typescript
await saveAIConfig({
  provider: currentProvider,  // ❌ 废弃字段
  apiKeys,                    // ❌ 废弃字段
  enabled: true,              // ❌ 废弃字段
  monthlyBudget,
  model,                      // ❌ 废弃字段
  enableReasoning,            // ❌ 废弃字段
  local: buildLocalConfigForSave()
})
```

**新代码** (正确的):
```typescript
// 构建 providers 结构
const providers: Record<string, RemoteProviderConfig> = {}

// 只保存有 API key 的 provider
if (apiKeys.openai) {
  providers.openai = {
    apiKey: apiKeys.openai,
    model: model.startsWith('gpt') ? model : 'gpt-4o-mini',
    enableReasoning: enableReasoning && currentProvider === 'openai'
  }
}

if (apiKeys.deepseek) {
  providers.deepseek = {
    apiKey: apiKeys.deepseek,
    model: model.startsWith('deepseek') ? model : 'deepseek-chat',
    enableReasoning: enableReasoning && currentProvider === 'deepseek'
  }
}

await saveAIConfig({
  providers,
  monthlyBudget,
  local: buildLocalConfigForSave(),
  engineAssignment: engineAssignment || getDefaultEngineAssignment()
})
```

#### 1.2 修复初始化逻辑

需要从新的 `providers` 结构中读取配置：
```typescript
const config = await getAIConfig()

// 提取所有 provider 的 API keys
const newApiKeys = {
  openai: config.providers.openai?.apiKey || '',
  deepseek: config.providers.deepseek?.apiKey || ''
}
setApiKeys(newApiKeys)

// 确定当前选中的模型和 provider
// 优先使用有配置的 provider
const firstConfiguredProvider = Object.entries(config.providers)
  .find(([_, cfg]) => cfg && cfg.apiKey && cfg.model)

if (firstConfiguredProvider) {
  const [provider, cfg] = firstConfiguredProvider
  setModel(cfg.model)
  setEnableReasoning(cfg.enableReasoning || false)
}
```

### 方案 2: 添加自定义配置标记

在 AIConfig 接口中添加 `isCustomConfig` 字段（可选）：
```typescript
export interface AIConfig {
  providers: { ... }
  monthlyBudget: number
  local: LocalAIConfig
  engineAssignment: AIEngineAssignment
  isCustomConfig?: boolean  // 标记用户是否自定义了配置
}
```

在 AIEngineAssignment 组件中：
- 用户选择预设 → `isCustomConfig: false`
- 用户修改高级配置 → `isCustomConfig: true`
- UI 根据 `isCustomConfig` 决定是否高亮预设按钮

### 方案 3: 改进自动保存触发

**问题**: 当前 `useEffect` 依赖可能不完整，导致某些更改未触发自动保存

**修复**:
```typescript
useEffect(() => {
  if (!isInitializedRef.current) return
  
  // 确保所有关键字段变化都触发保存
  triggerAutoSave()
}, [
  monthlyBudget,
  engineAssignment,  // ✅ 确保包含
  maxRecommendations,
  model,
  apiKeys.openai,    // ✅ 分别监听
  apiKeys.deepseek,  // ✅ 分别监听
  enableReasoning,
  localConfig.enabled,
  localConfig.model
])
```

## 📝 实施步骤

1. ✅ 创建修复文档
2. ⏳ 更新 AIConfig.tsx 所有保存调用（4 处）
3. ⏳ 更新初始化逻辑
4. ⏳ 修复自动保存依赖
5. ⏳ 添加 isCustomConfig 支持（可选）
6. ⏳ 更新相关测试
7. ⏳ 浏览器实际测试验证

## ✅ 验收标准

1. **保存测试**:
   - [ ] 切换快速预设后刷新页面，配置正确保存
   - [ ] 修改高级配置后刷新页面，配置正确保存
   - [ ] 修改 API Key 后刷新页面，配置正确保存

2. **预设测试**:
   - [ ] 选择"智能优先"预设，engineAssignment 正确设置
   - [ ] 选择"隐私优先"预设，engineAssignment 正确设置
   - [ ] 手动修改高级配置后，预设按钮取消选中（如果实现了自定义标记）

3. **自动保存测试**:
   - [ ] 修改配置后 1 秒内自动保存
   - [ ] 频繁修改时防抖正常工作
   - [ ] 保存失败时有明确错误提示

## 🔗 相关文件

- `docs/fixes/REFACTOR_DEPRECATE_ENABLED_FIELD.md` - 字段废弃重构文档
- `src/storage/ai-config.ts` - AIConfig 接口定义
- `src/types/ai-engine-assignment.ts` - 引擎分配类型定义
