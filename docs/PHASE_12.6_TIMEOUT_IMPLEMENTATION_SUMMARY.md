# Phase 12.6: Provider 超时配置 - 实现总结

## 完成时间
2024-12-XX

## 实现内容

### 1. 类型定义 ✅

**src/storage/ai-config.ts**:
- 添加 `DEFAULT_TIMEOUTS` 常量（远程: 60s/120s，本地: 30s/180s）
- `RemoteProviderConfig` 添加可选字段：`timeoutMs`, `reasoningTimeoutMs`
- `LocalAIConfig` 更新：
  - `timeoutMs` 默认 30000ms
  - 新增 `reasoningTimeoutMs` 默认 180000ms

### 2. 核心逻辑 ✅

**src/core/ai/BaseAIService.ts**:
- 新增 `getConfiguredTimeout(useReasoning)` 方法
- 读取用户配置的超时值，未配置时使用 `DEFAULT_TIMEOUTS`
- 区分本地和远程 AI，分别使用不同默认值
- `analyzeContent()` 和 `generateUserProfile()` 集成超时配置

**src/core/ai/providers/DeepSeekProvider.ts**:
- 移除硬编码超时值（60s/120s）
- 使用 `getConfiguredTimeout()` 动态获取超时配置

### 3. UI 组件 ✅

**src/components/AIConfigPanel.tsx** (ConfigModal):

**远程 AI 配置（OpenAI, DeepSeek）**:
- 标准模式超时下拉选择：30s, 60s, 90s, 120s, 180s（默认60s）
- 推理模式超时下拉选择：60s, 120s, 180s, 240s, 300s（默认120s）
- 配置保存到 `providers[providerId].timeoutMs/reasoningTimeoutMs`

**本地 AI 配置（Ollama）**:
- 标准模式超时下拉选择：15s, 30s, 45s, 60s, 90s（默认30s）
- 推理模式超时下拉选择：120s, 180s, 240s, 300s, 600s（默认180s）
- 配置保存到 `local.timeoutMs/reasoningTimeoutMs`

**UI 说明文本**:
- 远程 AI: "API 请求超时时间（区别于网络延迟检测）。推理模式需要更长时间。"
- 本地 AI: "本地 AI 请求超时时间。性能较低的设备可能需要更长时间。"

**src/components/settings/AIConfig.tsx**:
- 添加 `providerTimeouts` 状态管理
- 加载配置时读取超时值
- 保存配置时（`handleTest` 和 `autoSaveConfig`）包含超时值

### 4. 测试 ✅

**src/storage/ai-config.test.ts**:
- 修复 chrome.storage mock，支持真实的读写行为
- 修复默认配置测试（更新 timeoutMs 和 reasoningTimeoutMs 默认值）
- 所有 27 个测试通过（包括 3 个超时配置测试）

### 5. 国际化 ✅

**public/locales/zh-CN/translation.json**:
```json
{
  "options.aiConfig.card.timeout": {
    "standard": "标准模式超时",
    "reasoning": "推理模式超时",
    "description": "API 请求超时时间"
  }
}
```

**public/locales/en/translation.json**: 自动翻译

## 设计决策

### 1. 超时配置位置
- ✅ **仅在 ConfigModal 中配置**，不在 AIProviderCard 上显示
- 理由：超时是高级配置项，属于"渐进式披露"UX 模式

### 2. 超时 vs 延迟
- **超时（Timeout）**: API 调用最大等待时间（用户配置）
- **延迟（Latency）**: 网络连通性测试结果（实时检测）
- 两者概念不同，UI 中明确区分

### 3. 默认值设计
| Provider | 标准模式 | 推理模式 | 理由 |
|----------|----------|----------|------|
| OpenAI   | 60s      | 120s     | 远程 API，网络延迟较高 |
| DeepSeek | 60s      | 120s     | 同上 |
| Ollama   | 30s      | 180s     | 本地 API 无网络延迟，但推理更复杂 |

### 4. 本地 AI 推理超时更长
- 本地 AI 虽然无网络延迟，但推理模式计算量大
- 性能较低的设备（如 M1/M2 MacBook Air 8GB）可能需要更长时间
- 因此 Ollama 推理超时默认 180s（而远程仅 120s）

## 已知问题

### TypeScript 编译错误（非本次引入）
以下错误在本次修改前已存在：
- `AIConfigPanel.tsx:99`: `config.model` 不存在（Phase 9.2 已废弃）
- `AIConfigPanel.tsx:413`: `apiKeys` 字段不存在（Phase 9.2 已废弃）
- `OnboardingView.tsx`: 使用了废弃字段

**说明**: 这些是历史遗留问题，需要在后续清理旧代码时统一解决。

## 浏览器测试要点

1. **远程 AI 超时配置**:
   - 打开 Options 页面 → AI 配置 → 配置 DeepSeek
   - 设置标准模式超时为 90s，推理模式为 150s
   - 测试连接 → 保存
   - 重新打开配置弹窗，验证超时值是否保留

2. **本地 AI 超时配置**:
   - 配置 Ollama → 设置标准 45s，推理 240s
   - 测试连接并加载模型 → 保存
   - 验证配置保留

3. **默认值验证**:
   - 新配置 Provider 时，确认超时下拉菜单显示"默认（60秒）"等提示
   - 不选择（留空）时，API 调用应使用默认超时值

4. **实际超时测试**:
   - 修改 Ollama 超时为 5s（极短）
   - 调用复杂的推理任务，验证是否在 5s 后超时

## 后续优化建议

1. **动态超时调整**: 根据历史调用耗时自动建议合适的超时值
2. **超时预警**: API 调用接近超时时间时显示警告
3. **重试机制**: 超时后可选择重试，使用更长的超时值
4. **性能分析**: 收集 API 调用耗时数据，生成性能报告

## 相关文档

- [PHASE_12.6_PROVIDER_TIMEOUT.md](./PHASE_12.6_PROVIDER_TIMEOUT.md) - 完整设计文档
- [TESTING.md](./TESTING.md) - 测试指南
- [TDD.md](./TDD.md) - 技术设计文档
