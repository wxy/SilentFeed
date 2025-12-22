# 网络错误处理优化

## 问题描述

用户报告在使用过程中经常遇到以下错误日志：

```
[DeepSeekProvider] API call failed: TypeError: Failed to fetch
[AICapabilityManager] ❌ Provider DeepSeek failed for feedAnalysis Error: DeepSeek analyzeContent failed: Failed to fetch
[Translation] 翻译失败: TypeError: Failed to fetch
```

这些错误通常由以下原因导致：
- 网络连接问题
- AI 服务临时不可用
- 请求超时
- DNS 解析失败

## 核心问题

这类**临时性网络错误**被作为 `error` 级别记录，误导用户认为是严重问题，实际上：
1. 网络问题是正常且可恢复的
2. 系统已经有降级机制（fallback）
3. 不影响核心功能使用

## 解决方案

### 1. 网络错误识别

新增 `isNetworkError()` 函数，识别常见网络错误模式：

```typescript
export function isNetworkError(error: unknown): boolean {
  const networkErrorPatterns = [
    'Failed to fetch',           // Fetch API 网络错误
    'Network request failed',    // React Native 等
    'NetworkError',              // 通用网络错误
    'net::ERR_',                 // Chrome 网络错误
    'ECONNREFUSED',              // 连接被拒绝
    'ENOTFOUND',                 // DNS 解析失败
    'ETIMEDOUT',                 // 超时
    'ECONNRESET',                // 连接重置
    'socket hang up',            // Socket 挂起
    'Request timeout',           // 请求超时
    'Service Unavailable',       // 服务不可用 (503)
    'Gateway Timeout',           // 网关超时 (504)
    'Too Many Requests',         // 请求过多 (429)
  ]
  // ... 匹配逻辑
}
```

### 2. 日志级别降级

在 AI Provider、翻译服务等模块中，区分网络错误和其他错误：

**修改前**：
```typescript
catch (error) {
  logger.error('API call failed:', error)  // ❌ 所有错误都是 error
}
```

**修改后**：
```typescript
catch (error) {
  if (isNetworkError(error)) {
    logger.warn('⚠️ API 调用失败（网络问题）', error)  // ✅ 网络错误用 warn
  } else {
    logger.error('❌ API 调用失败', error)  // ❌ 其他错误仍用 error
  }
}
```

### 3. 涉及的模块

| 模块 | 文件 | 修改点 |
|------|------|--------|
| **日志工具** | `src/utils/logger.ts` | 新增 `isNetworkError()` |
| **AI Provider** | `src/core/ai/providers/DeepSeekProvider.ts` | API 调用错误处理 |
| **AI 管理器** | `src/core/ai/AICapabilityManager.ts` | 4 处错误处理点 |
| **翻译服务** | `src/core/translator/TranslationService.ts` | 翻译失败处理 |
| **推荐翻译** | `src/core/translator/recommendation-translator.ts` | 即时翻译失败处理 |

## 测试覆盖

### 单元测试

新增 10 个测试用例验证 `isNetworkError()` 函数：

```typescript
describe("isNetworkError", () => {
  it("应该识别 'Failed to fetch' 错误")
  it("应该识别 NetworkError")
  it("应该识别超时错误")
  it("应该识别连接错误")
  it("应该识别服务不可用错误")
  it("应该识别 Chrome 网络错误")
  it("应该识别字符串错误")
  it("不应该将其他错误识别为网络错误")
  it("应该处理 null 和 undefined")
})
```

### 集成测试

修复 `TranslationService.test.ts` 中的 mock，确保 `isNetworkError` 可用：

```typescript
vi.mock('@/utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/logger')>()
  return {
    ...actual,  // ✅ 保留 isNetworkError
    logger: { /* mock logger */ }
  }
})
```

### 测试结果

- ✅ 所有测试通过（1549 tests passed）
- ✅ logger.test.ts: 30 tests passed（新增 10 个）
- ✅ TranslationService.test.ts: 15 tests passed
- ✅ AICapabilityManager.test.ts: 15 tests passed
- ✅ DeepSeekProvider.test.ts: 11 tests passed

## 用户体验改进

### 修改前

```
❌ [DeepSeekProvider] API call failed: TypeError: Failed to fetch
❌ [AICapabilityManager] Provider DeepSeek failed for feedAnalysis Error: ...
❌ [Translation] 翻译失败: TypeError: Failed to fetch
```

用户看到大量错误日志，误以为系统出现严重问题。

### 修改后

```
⚠️ [DeepSeekProvider] API 调用失败（网络问题） TypeError: Failed to fetch
⚠️ [AICapabilityManager] Provider DeepSeek 暂时不可用（feedAnalysis），使用降级方案
⚠️ [Translation] 翻译服务暂时不可用（网络问题），显示原文
```

清晰标识是临时性网络问题，系统会自动降级处理。

## 降级策略

系统已有完善的降级机制：

1. **AI 分析失败** → 自动切换到关键词分析（FallbackKeywordProvider）
2. **翻译失败** → 显示原文内容
3. **推荐生成失败** → 使用基于规则的推荐

网络错误不会影响核心功能，只是暂时降低智能化程度。

## 后续建议

1. **重试机制**：考虑为网络错误添加自动重试（exponential backoff）
2. **用户提示**：在 UI 中显示网络状态提示，而非在控制台
3. **性能监控**：统计网络错误频率，识别问题模式
4. **离线模式**：增强离线功能，减少对网络的依赖

## 验收标准

- [x] `isNetworkError()` 函数正确识别常见网络错误
- [x] AI Provider 区分网络错误和其他错误
- [x] AICapabilityManager 所有错误处理点已更新
- [x] TranslationService 区分网络错误和其他错误
- [x] 所有现有测试通过
- [x] 新增测试覆盖网络错误识别
- [x] 测试中的 mock 正确导出 `isNetworkError`

## 相关文档

- `docs/TESTING.md` - 测试指南
- `src/utils/logger.ts` - 日志工具实现
- `docs/TDD.md` - 技术设计文档（错误处理策略）
