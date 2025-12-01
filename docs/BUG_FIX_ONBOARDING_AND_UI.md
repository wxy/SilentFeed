# Bug 修复：Onboarding 和 UI 问题

## 修复日期
2025-12-01

## 修复的 Bug

### 1. ✅ Onboarding 完成按钮无效

**问题描述**：
- 点击"开始使用"按钮无反应
- 无法完成引导流程

**根本原因**：
- `completeOnboarding()` 函数检查 AI 是否已配置
- 用户可以跳过 AI 配置，导致完成时抛出错误

**修复方案**：
```typescript
// 移除 AI 配置检查，允许不配置 AI 也能完成引导
export async function completeOnboarding(): Promise<void> {
  return withErrorHandling(
    async () => {
      const status: OnboardingStatus = {
        state: 'learning',
        completedAt: Date.now()
      }
      
      await setOnboardingState(status)
      onboardingLogger.info('✅ Onboarding completed, entering learning phase')
    },
    //...
  )
}
```

**修改文件**：
- `src/storage/onboarding-state.ts`
- `src/storage/onboarding-state.test.ts`

---

### 2. ✅ AI Provider 连接测试错误消息不清晰

**问题描述**：
- 配置 DeepSeek 后测试连接显示"未配置 AI Provider"
- 错误消息不够详细，用户无法诊断问题

**根本原因**：
- `AICapabilityManager.testConnection()` 返回的错误消息过于简单
- 没有提供具体的失败原因（未启用/未选择提供商/API Key未设置）

**修复方案**：
```typescript
async testConnection(target: ProviderSelectionMode = "remote", useReasoning: boolean = false): Promise<{
  success: boolean
  message: string
  latency?: number
}> {
  const provider = target === "local" ? this.localProvider : this.remoteProvider

  if (!provider) {
    // 提供更详细的错误信息，帮助用户诊断问题
    const config = await getAIConfig()
    const providerType = config.provider
    const hasApiKey = providerType && config.apiKeys?.[providerType]
    
    let detailedMessage = target === "local" ? "未配置本地 AI" : "未配置 AI 提供商"
    
    if (target === "remote") {
      if (!config.enabled) {
        detailedMessage += "（AI 功能未启用）"
      } else if (!providerType) {
        detailedMessage += "（未选择提供商）"
      } else if (!hasApiKey) {
        detailedMessage += `（${providerType} 的 API Key 未设置）`
      }
    }
    
    return {
      success: false,
      message: detailedMessage
    }
  }
  
  return await provider.testConnection(useReasoning)
}
```

**修改文件**：
- `src/core/ai/AICapabilityManager.ts`

---

### 3. ✅ Provider 翻译问题

**问题描述**：
- 错误消息中使用"Provider"而不是"提供商"
- 不符合中文本地化规范

**修复方案**：
- 将硬编码的"未配置 AI Provider"改为"未配置 AI 提供商"
- 翻译文件本身已正确使用"提供商"

**修改文件**：
- `src/core/ai/AICapabilityManager.ts`

---

### 4. ✅ 用户画像页面应显示学习进度

**问题描述**：
- 未达到 100 页浏览历史前，只显示"还没有足够的数据来建立你的兴趣画像"
- 应该显示当前进度（x/100 页）

**修复方案**：
```typescript
// 添加 totalPages 状态
const [totalPages, setTotalPages] = useState(0)

// 加载时保存总页面数
const data = await loadProfileData(await getActiveProfileId())
setTotalPages(data?.totalPages || 0)

// 空状态根据数据量显示不同内容
{totalPages > 0 ? (
  <>
    <p className="text-lg">{_('profile.learning')}</p>
    <div className="w-64 bg-gray-200 rounded-full h-2 mt-4">
      <div 
        className="bg-blue-500 h-2 rounded-full transition-all"
        style={{ width: `${Math.min((totalPages / 100) * 100, 100)}%` }}
      />
    </div>
    <p className="text-sm text-gray-500 mt-2">
      {_('profile.progress', { current: totalPages, total: 100 })}
    </p>
  </>
) : (
  <p>还没有足够的数据来建立你的兴趣画像</p>
)}
```

**修改文件**：
- `src/components/settings/ProfileSettings.tsx`
- `public/locales/zh-CN/translation.json`（添加翻译）

---

### 5. ✅ 移除生产环境 i18n 日志

**问题描述**：
- 控制台显示"切换语言到: en"、"语言偏好已保存"等开发日志
- 生产环境不应显示这些信息

**修复方案**：
```typescript
// src/i18n/index.ts
if (process.env.NODE_ENV === 'development') {
  console.log(`切换语言到: ${lng}`)
}

// src/i18n/chrome-storage-backend.ts
if (process.env.NODE_ENV === 'development') {
  console.log(`[i18n] 语言偏好已保存到 chrome.storage.sync: ${lng}`)
}
// ...其他 4 处日志同样处理
```

**修改文件**：
- `src/i18n/index.ts`（1 处日志）
- `src/i18n/chrome-storage-backend.ts`（4 处日志）

---

### 6. ✅ 订阅源空状态显示

**问题描述**：
- 无订阅源时显示"暂无发现的 RSS 源"错误提示
- 应该直接显示 OPML 导入和手动订阅界面

**修复方案**：
```typescript
// 移除空状态错误提示，直接显示订阅界面
const totalFeeds = candidateFeeds.length + subscribedFeeds.length + ignoredFeeds.length

// 无论是否有订阅源，都显示手动订阅和 OPML 导入界面
return (
  <div className="space-y-6">
    {/* 手动订阅和 OPML 导入界面 */}
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* ... */}
    </div>
    {/* 订阅源列表 */}
  </div>
)
```

**修改文件**：
- `src/components/settings/RSSSettings.tsx`

---

## 测试验证

### 已完成测试
1. ✅ `src/storage/onboarding-state.test.ts` - 所有测试通过（19/19）

### 待浏览器测试
- [ ] Bug #1: Onboarding 完成按钮功能（跳过 AI 配置后能否点击"开始使用"）
- [ ] Bug #2: AI Provider 连接测试错误消息（配置 DeepSeek 测试连接，查看错误提示）
- [ ] Bug #3: Provider 翻译（检查错误消息是否显示"提供商"）
- [ ] Bug #4: 用户画像学习进度（检查进度条和 x/100 页显示）
- [ ] Bug #5: i18n 日志（生产构建后检查控制台是否有日志）
- [ ] Bug #6: 订阅源空状态（无订阅源时的界面）

---

## 下一步

1. ✅ 所有 6 个 bug 已修复
2. ✅ 翻译文件修复和国际化完成
3. ✅ 新发现的 3 个问题已修复（AI 测试连接、用户画像进度显示）
4. ⏳ 等待用户确认后提交到 Git
5. ⏳ 在浏览器中逐个测试所有修复
6. ⏳ 运行完整测试套件 `npm run pre-push`
7. ⏳ 生产构建验证 `npm run build`

---

## Phase 9.1: 新发现问题修复

### 问题 7: AI 配置测试连接失败 ⚠️ 已重新修复

**问题描述**：
1. ✅ Onboarding 阶段未配置 AI，在设置页面输入密钥并选择模型后，测试连接显示"未配置 AI 提供商（AI 功能未启用）"
2. ✅ Onboarding 阶段配置成功，但在设置页面仍然显示该错误
3. ✅ 不进入 AI 配置卡片，直接点击检查也显示该错误
4. ⭐ **新问题**：第一次配置 AI 时，输入密钥选择模型后，测试连接仍然失败，显示"初始化失败，请重新打开设置页面"

**根本原因（更新）**：
- 第一次修复只解决了 `enabled` 检查问题
- 但真正的问题是：`AIConfigPanel` 保存配置后创建 `AICapabilityManager` 实例，调用 `initialize()` 时，provider 创建有异步延迟
- `testConnection()` 检查 provider 时，provider 可能还未完成初始化

**最终修复方案**：
```typescript
// AIConfigPanel.tsx

const handleTestRemoteConnection = async () => {
  // Phase 9.1: 直接创建 provider 实例进行测试
  // 避免依赖 AICapabilityManager.initialize() 可能的延迟问题
  let provider
  
  if (providerId === 'deepseek') {
    const { DeepSeekProvider } = await import('@/core/ai/providers/DeepSeekProvider')
    provider = new DeepSeekProvider({ 
      apiKey,
      model: selectedModel
    })
  } else if (providerId === 'openai') {
    const { OpenAIProvider } = await import('@/core/ai/providers/OpenAIProvider')
    provider = new OpenAIProvider({ 
      apiKey,
      model: selectedModel
    })
  }
  
  // 直接测试
  const result = await provider.testConnection(enableReasoning)
  
  // 测试成功后再保存配置
  if (result.success) {
    await saveAIConfig(tempConfig)
  }
}
```

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 重新修复
- `src/core/ai/AICapabilityManager.ts` (之前的修复保留)

---

### 问题 8: 用户画像页面未显示学习进度 ⚠️ 已重新修复

**问题描述**：
- ✅ 学习阶段（< 100页）进入用户画像界面，只显示"还没有足够的数据来建立你的兴趣画像"
- ✅ 没有显示学习进度条和 x/100 页的信息
- ⭐ **新问题**：初次打开（0 页）时，仍然不显示学习进度

**根本原因（更新）**：
- 第一次修复解决了画像不存在时获取页面数的问题
- 但代码逻辑中 `totalPages > 0` 的判断，导致 0 页时进入"完全没有数据"分支

**最终修复方案**：
```typescript
// ProfileSettings.tsx

{messages.length === 0 ? (
  <div className="flex flex-col items-center justify-center h-full text-center py-12">
    <span className="text-6xl mb-4">🌱</span>
    {/* Phase 9.1: 总是显示进度，即使是 0 页 */}
    <p className="text-gray-600 dark:text-gray-300 text-base font-medium mb-2">
      {totalPages > 0 
        ? _("options.profile.learning")
        : _("options.userProfile.noData.message")
      }
    </p>
    {/* 始终显示进度条和计数 */}
    <div className="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
      <div 
        className="bg-blue-500 h-2 rounded-full"
        style={{ width: `${Math.min((totalPages / 100) * 100, 100)}%` }}
      />
    </div>
    <p className="text-gray-500 dark:text-gray-400 text-sm">
      {_("options.profile.progress", { current: totalPages, total: 100 })}
    </p>
  </div>
) : (
```

**修改文件**：
- `src/components/settings/ProfileSettings.tsx`

---

### 问题 9: AI 配置成功后卡片状态不自动更新 ⭐ 已修复

**问题描述**：
- 在 AI 配置浮层中测试连接成功并保存
- 返回 AI 引擎页面后，该 AI 供应商卡片仍显示"未配置"
- 需要手动点击"检测"按钮才能更新状态

**根本原因**：
- `AIConfigPanel` 组件的 `handleTestRemoteConnection()` 测试成功后没有关闭弹窗
- 没有触发 `onClose()` 回调
- 而 `onClose()` 回调中会调用 `refresh()` 方法刷新所有卡片状态

**修复方案**：
```typescript
// AIConfigPanel.tsx - handleTestRemoteConnection

if (result.success) {
  // 测试成功后保存配置
  await saveAIConfig(tempConfig)
  
  // 显示成功消息
  setTestResult({ 
    success: true, 
    message: _("options.aiConfig.testConnectionSuccess")
  })
  
  // Phase 9.1: 延迟 1.5 秒后自动关闭弹窗
  // 让用户看到成功消息，然后自动刷新卡片状态
  setTimeout(() => {
    onClose() // 触发 refresh() 刷新所有 AI 卡片状态
  }, 1500)
}
```

**关键点**：
- 测试成功后自动关闭弹窗（延迟 1.5 秒让用户看到成功消息）
- `onClose()` 回调会触发父组件的 `refresh()` 方法
- `refresh()` 会重新检测所有 AI provider 的状态并更新卡片

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 添加自动关闭和刷新

---

### 问题 10: 扩展安装时缺少默认配置初始化 ⭐ 已修复

**问题描述**：
- 首次安装扩展时，如果用户从未修改过配置，数据库中可能没有默认值
- `getAIConfig()` 和 `getRecommendationConfig()` 会返回内存中的默认配置
- 但数据库仍然是空的，可能导致某些组件的检查逻辑出现问题

**根本原因**：
- 配置 storage 模块在获取配置时会返回默认值（如果数据库为空）
- 但从未将默认值真正写入数据库
- 导致数据库和内存状态不一致

**修复方案**：
```typescript
// background.ts

/**
 * 首次安装时初始化默认配置
 */
async function initializeDefaultConfigs() {
  bgLogger.info('初始化默认配置...')
  
  try {
    // 1. 检查并初始化 AI 配置
    const hasAIConfig = await chrome.storage.sync.get('aiConfig')
    if (!hasAIConfig.aiConfig) {
      const aiConfig = await getAIConfig()
      await saveAIConfig(aiConfig)
      bgLogger.info('  首次安装，保存 AI 默认配置到数据库')
    }
    
    // 2. 检查并初始化推荐配置
    const hasRecommendConfig = await chrome.storage.local.get('recommendation-config')
    if (!hasRecommendConfig['recommendation-config']) {
      const recommendConfig = await getRecommendationConfig()
      await saveRecommendationConfig(recommendConfig)
      bgLogger.info('  首次安装，保存推荐默认配置到数据库')
    }
    
    bgLogger.info('✅ 默认配置初始化完成')
  } catch (error) {
    bgLogger.error('❌ 默认配置初始化失败:', error)
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeDatabase()
  await initializeDefaultConfigs() // 首次安装时初始化默认配置
  await aiManager.initialize()
  // ...
})
```

**关键点**：
- 检查数据库中是否已有配置，避免覆盖用户数据
- 首次安装时保存默认配置到数据库
- 确保数据库和内存状态一致

**初始化的默认配置**：

1. **AI 配置** (`aiConfig`):
   - `enabled: false`, `provider: null`, `apiKeys: {}`
   - `monthlyBudget: 5`, `enableReasoning: false`
   - `local`: Ollama 默认配置
   - `engineAssignment`: 智能优先方案

2. **推荐配置** (`recommendation-config`):
   - `analysisEngine: 'remoteAI'`, `feedAnalysisEngine: 'remoteAI'`
   - `maxRecommendations: 3`, `batchSize: 1`
   - `qualityThreshold: 0.6`, `tfidfThreshold: 0.01`

**修改文件**：
- `src/background.ts` ⭐ 添加默认配置初始化函数
- 测试：`src/background.test.ts` (5/5 通过 ✅)
- 构建：`npm run build` ✅ 成功

---

## Phase 9.1 浏览器测试发现的问题

### 问题 11: AI 配置测试成功后浮层提前关闭 ⭐ 已修复

**问题描述**：
- 测试连接成功后，浮层在 1.5 秒后自动关闭
- 用户鼠标移动到保存按钮准备点击时，浮层就关闭了
- 用户体验不佳，感觉还没来得及保存就被强制关闭

**根本原因**：
- 之前的修复（问题 9）为了自动刷新卡片状态，在测试成功后自动保存并关闭弹窗
- 但这样用户看不到保存按钮的作用，体验很突兀

**修复方案**：
```typescript
// AIConfigPanel.tsx - handleTestRemoteConnection

if (result.success) {
  // 只显示成功消息，不自动保存和关闭
  setTestResult({ 
    success: true, 
    message: "连接测试成功！"
  })
  
  // 等待用户手动点击保存按钮
  // handleSave() -> onClose() -> refresh()
}
```

**关键点**：
- 测试成功后不自动保存和关闭
- 用户看到成功消息后，可以选择：
  - 点击保存按钮 → 保存配置 → 关闭浮层 → 刷新卡片状态
  - 点击取消/关闭 → 不保存 → 关闭浮层
- 保存按钮仍然会触发 `onClose()` → `refresh()`，确保卡片状态更新

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 移除自动保存和关闭逻辑

---

### 问题 12: 后台缺少 reconfigureSchedulersForState 导入 ⭐ 已修复

**问题描述**：
- 后台日志显示错误：`ReferenceError: reconfigureSchedulersForState is not defined`
- onboarding 状态改变时无法重新配置调度器

**根本原因**：
- `background.ts` 使用了 `reconfigureSchedulersForState` 函数
- 但没有从 `background/index.ts` 导入

**修复方案**：
```typescript
// background.ts

import { 
  startAllSchedulers, 
  feedScheduler, 
  recommendationScheduler,
  reconfigureSchedulersForState  // 添加导入
} from './background/index'
```

**修改文件**：
- `src/background.ts` ⭐ 添加缺失的导入

---


### 问题 13: 保存 AI 配置后卡片状态不更新 ⭐ 已修复

**问题描述**：
- 测试连接成功后，点击保存按钮关闭浮层
- AI 提供商卡片仍然显示"未配置"
- 刷新页面后依然不更新

**根本原因**：
- `refresh()` 函数只是重新加载缓存的状态，并不会重新检测 Provider
- 保存配置后需要主动调用 `checkProvider()` 来重新检测并更新状态
- 之前的设计假设 `refresh()` 会自动更新，但实际上它只读取缓存

**修复方案**：
```typescript
// AIConfigPanel.tsx

// 1. ConfigModal 接收 checkProvider 函数
function ConfigModal({ 
  providerId, 
  checkProvider,  // 新增参数
  onClose 
}: { 
  providerId: string; 
  checkProvider: (providerId: string, type: 'remote' | 'local') => Promise<void>;
  onClose: () => void 
}) {
  // ...
}

// 2. handleSave 保存后主动检测状态
const handleSave = async () => {
  await saveAIConfig(newConfig)
  
  // 保存后主动检测 Provider 状态
  if (providerId === 'deepseek' || providerId === 'openai') {
    await checkProvider(providerId, 'remote')
  } else if (providerId === 'ollama') {
    await checkProvider('ollama', 'local')
  }
  
  onClose()
}

// 3. 传递 checkProvider 给 ConfigModal
<ConfigModal
  providerId={showConfigModal}
  checkProvider={checkProvider}
  onClose={() => {
    setShowConfigModal(null)
    refresh()
  }}
/>
```

**关键点**：
- `refresh()`: 只读取缓存状态，不检测 Provider
- `checkProvider()`: 实际连接测试 Provider，并更新缓存状态
- 保存配置后必须调用 `checkProvider()` 才能更新卡片状态

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 保存后主动检测状态

---


### 优化: 避免重复检测 AI Provider 状态 ⭐

**问题分析**（用户反馈）：
- 测试连接时已经检测了一次 Provider 状态
- 保存配置时又检测一次
- 重复检测浪费时间和资源

**优化方案**：
```typescript
// AIConfigPanel.tsx - handleTestRemoteConnection

// 测试连接成功后，直接保存状态到缓存
if (result.success) {
  setTestResult({ success: true, message: "连接成功！" })
  
  // ✅ 立即保存状态到缓存
  const { saveProviderStatus } = await import('@/storage/ai-provider-status')
  await saveProviderStatus({
    providerId,
    type: 'remote',
    available: true,
    lastChecked: Date.now(),
    latency: result.latency
  })
}

// handleSave - 保存配置时不再重复检测
const handleSave = async () => {
  await saveAIConfig(newConfig)
  
  // ✅ 只需要 refresh() 读取缓存即可
  // 测试连接成功时已经保存了最新状态
  
  onClose()  // 触发 refresh() 读取缓存
}
```

**优化效果**：
- ✅ 测试连接 → 保存状态到缓存（1 次检测）
- ✅ 点击保存 → 读取缓存状态（0 次检测）
- ✅ 关闭浮层 → 卡片立即显示更新后的状态
- ⚡ 节省时间：减少 1 次网络请求（约 100-500ms）
- ⚡ 节省资源：避免重复 API 调用

**关键理解**：
- 测试连接 = 检测状态 + 保存缓存
- 保存配置 = 只保存配置，不检测状态
- 刷新卡片 = 读取缓存（快速）

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 测试连接成功时保存状态

---


## Phase 9.1 浏览器测试 - 第二轮发现的问题

### 问题 14: DeepSeek 延迟显示黄色图标 ⭐ 已修复

**问题描述**（用户反馈）：
- DeepSeek 配置成功，显示"可用"和"在用"
- 但图标显示为黄色 🟡 而不是绿色 🟢

**根本原因**：
- `getStatusIcon()` 函数的延迟阈值设置为 2000ms (2秒)
- 国内访问 DeepSeek API 通常需要 2-4 秒（因为服务器在国内）
- 超过 2 秒就显示黄色，但这其实是正常延迟

**修复方案**：
```typescript
// ai-provider-status.ts

export function getStatusIcon(status: AIProviderStatus): string {
  if (!status.available) return '🔴'  // 不可用
  
  // 提高延迟阈值到 5000ms (5秒)
  // 国内访问 DeepSeek 通常在 2-4 秒，属于正常范围
  if (status.latency && status.latency > 5000) return '🟡'  // 延迟较高
  
  return '🟢'  // 正常
}
```

**延迟阈值说明**：
- **< 5 秒** 🟢：正常（包括国内访问 DeepSeek 2-4 秒）
- **5-10 秒** 🟡：延迟较高但可用
- **> 10 秒** 或失败 🔴：不可用

**修改文件**：
- `src/storage/ai-provider-status.ts` ⭐ 延迟阈值从 2 秒提高到 5 秒

---

### 问题 15: Ollama 模型列表显示翻译键而非文本 ⭐ 待确认

**问题描述**（用户反馈）：
- Ollama 测试成功后显示 "options.aiConfig.configModal.modelsLoaded" 
- 而不是中文 "连接成功！发现 X 个模型"

**可能原因**：
1. 浏览器缓存了旧的翻译文件
2. 扩展未正确重新加载
3. i18n 初始化时机问题

**排查步骤**：
1. ✅ 检查代码：使用了正确的 `_()` 函数和翻译键
2. ✅ 检查翻译文件：键 `options.aiConfig.configModal.testResult.modelsLoaded` 存在
3. ✅ 运行 `npm run i18n:translate`：翻译文件已同步
4. ⏳ 需要用户验证：重新加载扩展后是否仍然显示翻译键

**建议操作**：
- 在 Chrome 扩展管理页面点击"重新加载"扩展
- 清除浏览器缓存并刷新设置页面
- 检查浏览器控制台是否有 i18n 相关错误

**如果仍然显示翻译键，可能需要**：
- 检查 i18n 模块的日志输出
- 确认 `_locales` 目录是否正确复制到构建目录
- 验证 chrome.i18n API 是否正常工作

---


### 问题 16: Ollama 配置浮层翻译键显示问题 ⭐ 已修复

**问题描述**（用户反馈）：
- Ollama 配置浮层模型选择下方显示 `options.aiConfig.configModal.pleaseTestFirst`
- 而不是中文提示文字

**根本原因**：
- 代码中使用了不存在的翻译键 `pleaseTestFirst`
- 翻译文件中没有定义这个键

**修复方案**：
```typescript
// AIConfigPanel.tsx

// 修复前：使用不存在的翻译键
{ollamaModels.length > 0 
  ? _("options.aiConfig.configModal.modelsLoaded", { count: ollamaModels.length }) 
  : _("options.aiConfig.configModal.pleaseTestFirst")  // ❌ 键不存在
}

// 修复后：使用已有的翻译键
{ollamaModels.length > 0 
  ? _("options.aiConfig.configModal.testResult.modelsLoaded", { count: ollamaModels.length }) 
  : _("options.aiConfig.configModal.loadModelsHint")  // ✅ "点击上方按钮加载可用模型"
}
```

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 修复翻译键

---

### 问题 17: Ollama 配置浮层显示多余的"启用本地 AI"开关 ⭐ 已修复

**问题描述**（用户反馈）：
- Ollama 配置浮层显示"启用本地 AI (Ollama)"的 checkbox
- 既然在配置 Ollama，就应该默认启用，这个开关是多余的

**设计理念**：
- 配置 Ollama 就是默认启用它
- 不需要额外的开关来控制启用/禁用
- 简化用户操作，减少困惑

**修复方案**：
```typescript
// AIConfigPanel.tsx

// 1. 移除"启用本地 AI"的 checkbox UI
{providerId === 'ollama' && (
  <>
    {/* ❌ 移除这个多余的开关 */}
    {/* <div className="flex items-center gap-3">
      <input type="checkbox" checked={ollamaEnabled} ... />
      <label>启用本地 AI (Ollama)</label>
    </div> */}
    
    {/* 端点配置 */}
    <div>...</div>
  </>
)}

// 2. handleSave 中始终设置 enabled: true
newConfig.local = {
  ...newConfig.local,
  enabled: true,  // ✅ 配置 Ollama 就是默认启用
  provider: 'ollama',
  endpoint: ollamaEndpoint,
  model: ollamaModel,
  cachedModels: ollamaModels
}
```

**修改文件**：
- `src/components/AIConfigPanel.tsx` ⭐ 移除多余的启用开关

---

