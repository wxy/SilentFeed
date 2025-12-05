# AI 配置重构：废弃 enabled 字段和清理遗留配置

> **状态**: 🚧 进行中  
> **分支**: `refactor/deprecate-enabled-field`  
> **开始时间**: 2025-12-05  
> **关联问题**: [BUG_FIX_ENGINE_ASSIGNMENT_IGNORED.md](./BUG_FIX_ENGINE_ASSIGNMENT_IGNORED.md)

---

## 📋 重构目标

### 1. 废弃 `enabled` 字段

**问题**：
- 全局 `enabled` 字段与 Phase 8 引入的 `engineAssignment`（任务级引擎分配）产生语义冲突
- 用户配置了 `engineAssignment` 但因 `enabled: false` 导致引擎未初始化
- Phase 4 设计的简单开关已不适用于当前的多引擎架构

**解决方案**：
- 从 `AIConfig` 接口中移除 `enabled` 字段
- 是否使用 AI 由 `engineAssignment` 和 `providers` 配置决定
- 简化判断逻辑：只要配置了任何 provider（有 apiKey 和 model），AI 就可用

### 2. 移除旧的单一 AI 模式字段

**废弃字段**：
- `provider: AIProviderType | null` - 全局提供商选择
- `apiKeys: { openai?: string, deepseek?: string }` - 旧的 API Keys 结构
- `model: string` - 全局模型
- `enableReasoning: boolean` - 全局推理设置

**保留字段**：
- `providers: { openai?: RemoteProviderConfig, deepseek?: RemoteProviderConfig }` - 新的 providers 结构
- `local: LocalAIConfig` - 本地 AI 配置
- `engineAssignment: AIEngineAssignment` - 引擎分配策略
- `monthlyBudget: number` - 月度预算

### 3. 修复 Ollama 模型硬编码

**问题**：
- `OllamaProvider` 中多处硬编码 `qwen2.5:7b`
- 如果用户没有这个模型，会导致错误
- 测试文件中也硬编码了该模型

**解决方案**：
- 移除 `DEFAULT_CONFIG` 中的硬编码默认模型（改为空字符串）
- 在 `OllamaProvider` 中检查模型是否配置，未配置则抛出错误
- 添加 `getFirstAvailableOllamaModel()` 工具函数，动态查询第一个可用模型
- 更新文档和UI，引导用户正确配置 Ollama 模型

---

## ✅ 已完成的修改

### 核心文件 (Core Files)

#### 1. `src/storage/ai-config.ts` ✅

**AIConfig 接口**：
```typescript
// 修改前
export interface AIConfig {
  provider?: AIProviderType | null
  providers?: { ... }
  apiKeys?: { ... }
  enabled: boolean
  model?: string
  enableReasoning?: boolean
  local?: LocalAIConfig
  engineAssignment?: AIEngineAssignment
}

// 修改后
export interface AIConfig {
  providers: {  // 必需，不再可选
    openai?: RemoteProviderConfig
    deepseek?: RemoteProviderConfig
  }
  monthlyBudget: number
  local: LocalAIConfig  // 必需，不再可选
  engineAssignment: AIEngineAssignment  // 必需，不再可选
}
```

**DEFAULT_CONFIG**：
- 移除 `provider: null`
- 移除 `apiKeys: {}`
- 移除 `enabled: false`
- 移除 `model: undefined`
- 移除 `enableReasoning: false`
- 修改 `local.model: ""` (不再硬编码 `qwen2.5:7b`)

**getAIConfig()**：
- 简化迁移逻辑，移除旧字段的兼容处理
- 只处理 `providers` 的解密

**saveAIConfig()**：
- 移除旧字段的加密逻辑
- 只保存新的配置结构

**isAIConfigured()**：
- 修改检查逻辑：
  ```typescript
  // 修改前
  if (!config.enabled || !config.provider) return false
  
  // 修改后
  return Object.values(config.providers).some(
    p => p && p.apiKey && p.model
  )
  ```

**新增函数**：
- `getFirstAvailableOllamaModel(endpoint)`: 动态查询 Ollama 第一个可用模型

#### 2. `src/core/ai/providers/OllamaProvider.ts` ✅

修改 3 个方法，移除 `qwen2.5:7b` 硬编码：

**callLegacyAPI()**:
```typescript
// 修改前
model: this.config.model || "qwen2.5:7b"

// 修改后
if (!this.config.model) {
  throw new Error('Ollama 模型未配置，请在 AI 配置中设置模型')
}
model: this.config.model
```

同样修改应用到：
- `callGenerateAPI()`
- `callOpenAICompatibleAPI()`

### 业务逻辑文件 (Business Logic)

#### 3. `src/components/OnboardingView.tsx` ✅

```typescript
// 修改前
if (aiConfig.enabled && aiConfig.provider && aiConfig.model) {
  // ...
}

// 修改后
const hasAIProvider = Object.values(aiConfig.providers).some(
  p => p && p.apiKey && p.model
)
if (hasAIProvider) {
  // ...
}
```

#### 4. `src/components/settings/ProfileSettings.tsx` ✅

```typescript
// 修改前
setAiConfigured(aiConfig.enabled && aiConfig.provider !== null)

// 修改后
const hasAIProvider = Object.values(aiConfig.providers).some(
  p => p && p.apiKey && p.model
)
setAiConfigured(hasAIProvider)
```

#### 5. `src/components/settings/CollectionStats.tsx` ✅

```typescript
// 修改前
setAiConfigStatus({
  enabled: aiConfig.enabled,
  provider: getProviderDisplayName(aiConfig.provider || null),
  configured: aiConfig.enabled && aiConfig.provider !== null && ...
})

// 修改后
const hasAIProvider = Object.values(aiConfig.providers).some(
  p => p && p.apiKey && p.model
)
const firstProvider = Object.entries(aiConfig.providers).find(
  ([_, p]) => p && p.apiKey
)
setAiConfigStatus({
  enabled: hasAIProvider,
  provider: firstProvider ? getProviderDisplayName(firstProvider[0]) : 'None',
  configured: hasAIProvider
})
```

#### 6. `src/core/recommender/ai-strategy-executor.ts` ✅

```typescript
// 修改前
if (!aiConfig.enabled || !aiConfig.provider) {
  throw new Error('AI未配置')
}

// 修改后
const hasAIProvider = Object.values(aiConfig.providers).some(
  p => p && p.apiKey && p.model
)
if (!hasAIProvider) {
  throw new Error('AI未配置')
}
```

#### 7. `src/core/translator/TranslationService.ts` ✅

```typescript
// 修改前
const hasApiKey = aiConfig.apiKeys?.openai || aiConfig.apiKeys?.deepseek
if (!aiConfig.enabled || !hasApiKey) {
  // ...
}

// 修改后
const hasAIProvider = Object.values(aiConfig.providers).some(
  p => p && p.apiKey && p.model
)
if (!hasAIProvider) {
  // ...
}
```

### 测试文件 (Partial Fix)

#### 8. `src/core/ai/AICapabilityManager.test.ts` ✅ (部分)

修复了一个测试用例：
```typescript
// 修改前
aiConfig: {
  enabled: false,
  provider: null,
  apiKey: "",
  local: { ... }
}

// 修改后
aiConfig: {
  providers: {},
  local: { enabled: true, provider: "ollama", ... }
}
```

---

## ⚠️ 待修复的问题

### 测试文件编译错误

#### 1. `src/core/recommender/RecommendationService.test.ts` (6 个错误)

**错误 1**: `totalDwellTime` 不在 `UserProfile` 中
- **位置**: 第 218 行
- **原因**: `UserProfile` 接口没有 `totalDwellTime` 字段
- **修复**: 移除该字段

**错误 2-4**: `pageCount` 不在 `UserProfile` 中
- **位置**: 第 410, 436 行
- **原因**: `UserProfile` 接口没有 `pageCount` 字段
- **修复**: 移除该字段

**错误 5-6**: `RecommendationConfig` 缺少字段
- **位置**: 第 497, 529 行
- **原因**: mock 数据缺少 `feedAnalysisEngine`, `useReasoning`, `useLocalAI`
- **修复**: 补充缺失的字段

**错误 7**: Dexie transaction 类型不匹配
- **位置**: 第 332 行
- **原因**: mock 函数返回类型不正确
- **修复**: 使用正确的 Dexie mock 类型

#### 2. `src/utils/analysis-engine-capability.test.ts` (11 个错误)

**所有错误**: 使用了废弃的 `provider`, `apiKeys`, `enabled` 字段
- **修复方案**: 将所有测试用例中的配置改为新的 `providers` 结构

示例修复：
```typescript
// 修改前
createAIConfig({
  provider: 'openai',
  apiKeys: { openai: 'sk-test123456789' },
  enabled: true
})

// 修改后
createAIConfig({
  providers: {
    openai: {
      apiKey: 'sk-test123456789',
      model: 'gpt-4o-mini'
    }
  }
})
```

#### 3. `src/hooks/useAIProviderStatus.test.ts` (1 个错误)

**错误**: `enabled` 不在 `AIConfig` 中
- **位置**: 第 57 行
- **修复**: 移除 `enabled: true`

---

## 📝 需要更新的文件清单

### 测试文件（必须修复才能通过 CI）

- [ ] `src/core/recommender/RecommendationService.test.ts` (6 errors)
- [ ] `src/utils/analysis-engine-capability.test.ts` (11 errors)
- [ ] `src/hooks/useAIProviderStatus.test.ts` (1 error)
- [ ] `src/core/ai/AICapabilityManager.test.ts` (还有其他测试用例需要检查)
- [ ] 所有包含 `qwen2.5:7b` 硬编码的测试文件

### UI 组件（可能需要更新）

- [ ] `src/components/settings/AIConfig.tsx` - 检查是否使用了废弃字段
- [ ] `src/components/settings/AIEngineAssignment.tsx` - 检查逻辑是否兼容
- [ ] 其他 AI 配置相关的组件

### 文档

- [ ] `docs/TDD.md` - 更新 AI 配置数据结构
- [ ] `docs/PRD.md` - 更新 AI 配置相关描述
- [ ] `docs/TESTING.md` - 添加测试修复指南
- [ ] `README.md` - 更新 AI 配置说明

---

## 🎯 下一步行动

### 优先级 P0（阻塞发布）

1. **修复所有测试文件编译错误** 
   - 更新 `analysis-engine-capability.test.ts` (11 errors)
   - 更新 `RecommendationService.test.ts` (6 errors)
   - 更新 `useAIProviderStatus.test.ts` (1 error)

2. **运行完整测试套件**
   ```bash
   npm run test:run
   ```

3. **确保覆盖率达标**
   ```bash
   npm run test:coverage
   ```

### 优先级 P1（重要）

4. **检查所有组件是否兼容新配置结构**
   - 搜索所有 `aiConfig.provider` 的使用
   - 搜索所有 `aiConfig.enabled` 的使用
   - 搜索所有 `aiConfig.apiKeys` 的使用

5. **更新文档**
   - 技术文档更新
   - 用户文档更新

### 优先级 P2（优化）

6. **添加配置迁移逻辑**（可选）
   - 如果需要兼容旧用户数据，添加自动迁移
   - 在 `getAIConfig()` 中检测旧配置并转换

7. **优化 Ollama 模型配置体验**
   - UI 中添加"自动检测模型"按钮
   - 使用 `getFirstAvailableOllamaModel()` 自动填充

---

## 🔍 测试策略

### 单元测试

- [ ] 所有 `ai-config.ts` 相关测试通过
- [ ] OllamaProvider 测试通过（模型未配置时正确抛出错误）
- [ ] 业务逻辑文件测试通过

### 集成测试

- [ ] Onboarding 流程正常工作
- [ ] AI 配置页面正常保存和读取
- [ ] 推荐系统正常使用配置的 AI

### 浏览器测试

- [ ] 加载扩展后检查 AI 配置状态
- [ ] 配置 AI 后测试推荐功能
- [ ] 测试 Ollama 集成（模型选择）

---

## 💡 技术决策记录

### 决策 1: 废弃 `enabled` 字段而不是重新定义

**原因**：
- Phase 8 的 `engineAssignment` 已经提供了细粒度控制
- 全局开关与任务级配置存在语义冲突
- 简化配置结构，减少用户困惑

**替代方案**：
- ❌ 重新定义 `enabled` 为"是否允许使用远程 AI" - 增加复杂度
- ❌ 保持现状 - 语义模糊，容易引发 Bug
- ✅ 完全废弃 - 最简洁明确

### 决策 2: 移除 Ollama 默认模型硬编码

**原因**：
- 不同用户可能使用不同的模型
- 硬编码假设用户已安装 `qwen2.5:7b`，容易出错
- 应该让用户显式配置或自动检测

**实现**：
- 提供 `getFirstAvailableOllamaModel()` 工具函数
- UI 中添加"检测可用模型"功能
- 未配置时抛出清晰的错误提示

### 决策 3: 不保留向后兼容的迁移逻辑

**原因**：
- 当前处于预发布阶段，用户数量少
- 简化代码，避免维护旧逻辑
- 如果需要，可以在用户反馈后再添加

**风险**：
- 现有用户需要重新配置 AI
- 可以通过文档和提示缓解

---

## 📊 影响范围评估

### 数据结构变更

- **Breaking Change**: 是
- **影响用户**: 所有配置了 AI 的用户
- **缓解措施**: 
  - 清晰的错误提示
  - 更新用户文档
  - 可选：添加配置迁移工具

### 代码修改统计

- **修改文件**: 9 个（不含测试）
- **待修复测试**: 3-5 个文件
- **新增代码**: ~50 行
- **删除代码**: ~100 行

### 测试覆盖率影响

- **预期**: 覆盖率保持不变或略微提升
- **原因**: 简化逻辑减少了边界情况

---

## 🐛 已知问题

1. **测试文件未全部修复** - 阻塞 CI
2. **缺少配置迁移逻辑** - 可能影响现有用户
3. **Ollama 模型配置需要手动** - UX 待优化

---

## 📚 参考资料

- [BUG_FIX_ENGINE_ASSIGNMENT_IGNORED.md](./BUG_FIX_ENGINE_ASSIGNMENT_IGNORED.md) - 引发此重构的 Bug
- [PHASE_8_AI_ENGINE_ASSIGNMENT.md](../archive/phases/PHASE_8_AI_ENGINE_ASSIGNMENT.md) - 引擎分配设计
- [PHASE_4_AI_INTEGRATION.md](../archive/phases/PHASE_4_AI_INTEGRATION.md) - enabled 字段的初始设计

---

**最后更新**: 2025-12-05  
**更新人**: GitHub Copilot
