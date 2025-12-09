# Phase 12 - Task 2: 统一容错机制

## 目标

为所有 AI Provider 实现统一的容错机制，包括：
- ✅ 指数退避重试
- ✅ 熔断器模式
- ✅ 错误分类（临时/永久/限流）
- ✅ 自动降级

## 当前状态分析

### 已有机制

1. **基础重试** (`src/utils/error-handler.ts`)
   - ✅ `withRetry` 函数支持固定延迟重试
   - ❌ 缺少指数退避
   - ❌ 缺少熔断器
   - ❌ 缺少错误分类

2. **AI Provider 错误处理**
   - ✅ OpenAIProvider: 超时处理 (AbortSignal)
   - ✅ DeepSeekProvider: 网络错误日志区分
   - ✅ OllamaProvider: API 降级 (403 → /api/generate)
   - ❌ 各 Provider 错误处理不一致
   - ❌ 无统一重试策略

3. **降级机制**
   - ✅ AICapabilityManager: 自动降级到 FallbackKeywordProvider
   - ✅ 网络错误用 warn 级别日志
   - ❌ 缺少熔断器阈值控制

### 需要实现

1. **增强 withRetry 函数**
   - 指数退避：`delay * (2 ^ attempt)`
   - 最大延迟上限
   - Jitter（抖动）避免惊群效应

2. **错误分类器**
   ```typescript
   enum ErrorType {
     TEMPORARY = 'temporary',      // 可重试（网络错误、超时）
     RATE_LIMIT = 'rate_limit',    // 限流（需要更长延迟）
     PERMANENT = 'permanent',       // 不可重试（密钥错误、模型不存在）
     BUDGET_EXCEEDED = 'budget'     // 预算超限
   }
   ```

3. **熔断器模式**
   ```typescript
   enum CircuitState {
     CLOSED = 'closed',     // 正常
     OPEN = 'open',         // 熔断（停止请求）
     HALF_OPEN = 'half_open' // 半开（尝试恢复）
   }
   
   interface CircuitBreakerConfig {
     failureThreshold: number    // 失败阈值（如 5）
     resetTimeout: number        // 重置时间（如 60s）
     halfOpenRequests: number    // 半开状态允许的请求数
   }
   ```

## 技术设计

### 1. 增强错误处理工具

**文件**: `src/utils/resilience.ts`

```typescript
/**
 * 错误类型
 */
export enum ErrorType {
  TEMPORARY = 'temporary',      // 临时错误（网络、超时）
  RATE_LIMIT = 'rate_limit',    // API 限流
  PERMANENT = 'permanent',       // 永久错误（密钥、权限）
  BUDGET_EXCEEDED = 'budget',    // 预算超限
  UNKNOWN = 'unknown'
}

/**
 * 错误分类器
 */
export function classifyError(error: unknown): ErrorType {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  
  // 限流错误
  if (message.includes('rate limit') || message.includes('quota exceeded') || message.includes('too many requests')) {
    return ErrorType.RATE_LIMIT
  }
  
  // 永久错误
  if (message.includes('invalid key') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('not found')) {
    return ErrorType.PERMANENT
  }
  
  // 预算错误
  if (message.includes('budget') || message.includes('insufficient')) {
    return ErrorType.BUDGET_EXCEEDED
  }
  
  // 临时错误
  if (message.includes('timeout') || message.includes('network') || message.includes('econnrefused') || message.includes('fetch failed')) {
    return ErrorType.TEMPORARY
  }
  
  return ErrorType.UNKNOWN
}

/**
 * 指数退避重试选项
 */
export interface ExponentialBackoffOptions {
  maxAttempts: number
  baseDelay: number      // 初始延迟（ms）
  maxDelay: number       // 最大延迟（ms）
  jitter: boolean        // 是否添加抖动
  tag: string
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

/**
 * 带指数退避的重试
 */
export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  options: ExponentialBackoffOptions
): Promise<T> {
  let lastError: unknown
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      // 错误分类
      const errorType = classifyError(error)
      
      // 检查是否应该重试
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) {
        logger.error(`[${options.tag}] 不可重试错误 (${errorType}):`, error)
        throw error
      }
      
      // 永久错误不重试
      if (errorType === ErrorType.PERMANENT) {
        logger.error(`[${options.tag}] 永久错误，停止重试:`, error)
        throw error
      }
      
      // 如果还有重试次数，计算延迟
      if (attempt < options.maxAttempts) {
        let delay = Math.min(
          options.baseDelay * Math.pow(2, attempt - 1),
          options.maxDelay
        )
        
        // 限流错误使用更长延迟
        if (errorType === ErrorType.RATE_LIMIT) {
          delay = Math.min(delay * 2, options.maxDelay)
        }
        
        // 添加抖动（±25%）
        if (options.jitter) {
          const jitterFactor = 0.75 + Math.random() * 0.5
          delay = Math.floor(delay * jitterFactor)
        }
        
        logger.warn(`[${options.tag}] 尝试 ${attempt}/${options.maxAttempts} 失败 (${errorType})，${delay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  logger.error(`[${options.tag}] 所有 ${options.maxAttempts} 次重试失败`)
  throw lastError
}

/**
 * 熔断器状态
 */
export enum CircuitState {
  CLOSED = 'closed',       // 正常
  OPEN = 'open',           // 熔断
  HALF_OPEN = 'half_open'  // 半开
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number    // 失败阈值
  resetTimeout: number        // 重置超时（ms）
  halfOpenRequests: number    // 半开状态允许的请求数
  tag: string
}

/**
 * 熔断器
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0
  private halfOpenAttempts = 0
  
  constructor(private config: CircuitBreakerConfig) {}
  
  /**
   * 执行操作
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // 检查熔断器状态
    if (this.state === CircuitState.OPEN) {
      // 检查是否到重置时间
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        logger.info(`[${this.config.tag}] 熔断器进入半开状态`)
        this.state = CircuitState.HALF_OPEN
        this.halfOpenAttempts = 0
      } else {
        throw new Error(`熔断器已打开，${this.config.tag} 暂时不可用`)
      }
    }
    
    // 半开状态：限制请求数
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenRequests) {
        throw new Error(`熔断器半开，${this.config.tag} 达到测试请求上限`)
      }
      this.halfOpenAttempts++
    }
    
    // 执行操作
    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  /**
   * 成功回调
   */
  private onSuccess(): void {
    this.failureCount = 0
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      // 半开状态连续成功，关闭熔断器
      if (this.successCount >= this.config.halfOpenRequests) {
        logger.info(`[${this.config.tag}] 熔断器关闭，服务恢复正常`)
        this.state = CircuitState.CLOSED
        this.successCount = 0
      }
    }
  }
  
  /**
   * 失败回调
   */
  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态失败，重新打开熔断器
      logger.warn(`[${this.config.tag}] 熔断器重新打开`)
      this.state = CircuitState.OPEN
      this.successCount = 0
      return
    }
    
    // 达到失败阈值，打开熔断器
    if (this.failureCount >= this.config.failureThreshold) {
      logger.error(`[${this.config.tag}] 熔断器打开，连续 ${this.failureCount} 次失败`)
      this.state = CircuitState.OPEN
    }
  }
  
  /**
   * 获取状态
   */
  getState(): CircuitState {
    return this.state
  }
  
  /**
   * 重置熔断器
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.halfOpenAttempts = 0
    logger.info(`[${this.config.tag}] 熔断器已重置`)
  }
}
```

### 2. 集成到 BaseAIService

**文件**: `src/core/ai/BaseAIService.ts`

```typescript
import { withExponentialBackoff, CircuitBreaker, type CircuitBreakerConfig } from '@/utils/resilience'

export abstract class BaseAIService implements AIProvider {
  // 熔断器实例
  protected circuitBreaker: CircuitBreaker
  
  constructor(protected config: AIProviderConfig) {
    // 初始化熔断器
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,      // 连续 5 次失败触发熔断
      resetTimeout: 60000,      // 60s 后尝试恢复
      halfOpenRequests: 3,      // 半开状态允许 3 个测试请求
      tag: this.name
    })
  }
  
  /**
   * 包装 API 调用：添加重试和熔断器
   */
  protected async callWithResilience<T>(
    operation: () => Promise<T>,
    taskType: string = 'API call'
  ): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return withExponentialBackoff(operation, {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: true,
        tag: `${this.name}.${taskType}`,
        shouldRetry: (error, attempt) => {
          const errorType = classifyError(error)
          // 永久错误和预算错误不重试
          return errorType !== ErrorType.PERMANENT && errorType !== ErrorType.BUDGET_EXCEEDED
        }
      })
    })
  }
  
  /**
   * 分析内容（添加容错）
   */
  async analyzeContent(
    content: string,
    options?: AnalyzeOptions
  ): Promise<UnifiedAnalysisResult> {
    return this.callWithResilience(
      () => super.analyzeContent(content, options),
      'analyzeContent'
    )
  }
}
```

### 3. 更新 AICapabilityManager

**文件**: `src/core/ai/AICapabilityManager.ts`

```typescript
/**
 * 选择 Provider 并执行（带熔断器检查）
 */
private async selectAndExecute<T>(
  operation: (provider: AIProvider) => Promise<T>,
  mode: ProviderSelectionMode,
  taskType: AITaskType
): Promise<T> {
  const provider = await this.selectProvider(mode, taskType)
  
  if (!provider) {
    aiLogger.warn(`⚠️ No provider available for ${taskType}`)
    throw new Error('No AI provider available')
  }
  
  try {
    // 检查熔断器状态
    if (provider instanceof BaseAIService) {
      const state = provider.circuitBreaker.getState()
      if (state === CircuitState.OPEN) {
        aiLogger.warn(`⚠️ ${provider.name} circuit breaker is OPEN, using fallback`)
        throw new Error(`Circuit breaker open for ${provider.name}`)
      }
    }
    
    return await operation(provider)
  } catch (error) {
    // 熔断器已打开或其他错误，降级
    aiLogger.error(`❌ Provider ${provider.name} failed for ${taskType}`, error)
    throw error
  }
}
```

## 实施计划

### Step 1: 创建容错工具库 ✅

- [ ] 创建 `src/utils/resilience.ts`
- [ ] 实现 `ErrorType` 枚举
- [ ] 实现 `classifyError` 函数
- [ ] 实现 `withExponentialBackoff` 函数
- [ ] 实现 `CircuitBreaker` 类
- [ ] 编写测试 `src/utils/resilience.test.ts`

### Step 2: 集成到 BaseAIService

- [ ] 在 `BaseAIService` 构造函数中初始化熔断器
- [ ] 添加 `callWithResilience` 方法
- [ ] 更新 `analyzeContent` 方法使用容错包装
- [ ] 更新 `generateUserProfile` 方法使用容错包装
- [ ] 更新 `testConnection` 方法使用容错包装

### Step 3: 更新各 Provider

- [ ] OpenAIProvider: 移除自定义超时处理，使用统一机制
- [ ] DeepSeekProvider: 移除自定义错误日志，使用统一机制
- [ ] OllamaProvider: 保留 API 降级逻辑，添加熔断器
- [ ] AnthropicProvider: 添加容错机制

### Step 4: 集成到 AICapabilityManager

- [ ] 更新 `selectAndExecute` 检查熔断器状态
- [ ] 熔断时自动降级到 fallback
- [ ] 添加熔断器状态监控接口

### Step 5: 测试

- [ ] 单元测试：容错工具函数
- [ ] 单元测试：熔断器状态转换
- [ ] 集成测试：模拟网络错误触发重试
- [ ] 集成测试：模拟连续失败触发熔断
- [ ] 集成测试：熔断器自动恢复
- [ ] 浏览器测试：验证 UI 反馈

## 验收标准

1. ✅ 所有 AI Provider 使用统一的重试机制
2. ✅ 支持指数退避和 Jitter
3. ✅ 错误自动分类（临时/永久/限流/预算）
4. ✅ 永久错误和预算错误不重试
5. ✅ 限流错误使用更长延迟
6. ✅ 熔断器在连续失败时打开
7. ✅ 熔断器自动恢复（半开 → 关闭）
8. ✅ 熔断时自动降级到 fallback
9. ✅ 所有测试通过（覆盖率 ≥ 70%）
10. ✅ 文档更新（README、TDD）

## 参考资料

- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://cloud.google.com/iot/docs/how-tos/exponential-backoff)
- [AWS SDK Retry Strategy](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)
