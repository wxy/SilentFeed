/**
 * 容错机制工具库
 * 
 * 提供：
 * - 错误分类
 * - 指数退避重试
 * - 熔断器模式
 */

import { logger } from "./logger"

const resilienceLogger = logger.withTag("Resilience")

/**
 * 错误类型
 */
export enum ErrorType {
  TEMPORARY = "temporary", // 临时错误（网络、超时）
  RATE_LIMIT = "rate_limit", // API 限流
  PERMANENT = "permanent", // 永久错误（密钥、权限）
  BUDGET_EXCEEDED = "budget", // 预算超限
  UNKNOWN = "unknown"
}

/**
 * 错误分类器
 * 
 * 根据错误消息判断错误类型
 */
export function classifyError(error: unknown): ErrorType {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  // 限流错误
  if (
    message.includes("rate limit") ||
    message.includes("quota exceeded") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return ErrorType.RATE_LIMIT
  }

  // 永久错误
  if (
    message.includes("invalid key") ||
    message.includes("invalid api key") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("not found") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("404")
  ) {
    return ErrorType.PERMANENT
  }

  // 预算错误
  if (message.includes("budget") || message.includes("insufficient")) {
    return ErrorType.BUDGET_EXCEEDED
  }

  // 临时错误
  if (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    message.includes("etimedout") ||
    message.includes("enotfound") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return ErrorType.TEMPORARY
  }

  return ErrorType.UNKNOWN
}

/**
 * 指数退避重试选项
 */
export interface ExponentialBackoffOptions {
  /** 最大重试次数 */
  maxAttempts: number
  /** 初始延迟（ms） */
  baseDelay: number
  /** 最大延迟（ms） */
  maxDelay: number
  /** 是否添加抖动（避免惊群效应） */
  jitter: boolean
  /** 日志标签 */
  tag: string
  /** 自定义重试判断 */
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

/**
 * 带指数退避的重试
 * 
 * 特性：
 * - 指数退避：delay * 2^(attempt-1)
 * - 最大延迟上限
 * - Jitter（抖动）
 * - 错误分类（永久错误不重试）
 * - 限流错误延迟加倍
 * 
 * @example
 * ```ts
 * const result = await withExponentialBackoff(
 *   () => fetchData(),
 *   {
 *     maxAttempts: 3,
 *     baseDelay: 1000,
 *     maxDelay: 10000,
 *     jitter: true,
 *     tag: 'API.fetchData'
 *   }
 * )
 * ```
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

      // 检查自定义重试逻辑
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) {
        resilienceLogger.error(`[${options.tag}] 不可重试错误 (${errorType}):`, error)
        throw error
      }

      // 永久错误和预算错误不重试
      if (errorType === ErrorType.PERMANENT || errorType === ErrorType.BUDGET_EXCEEDED) {
        resilienceLogger.error(`[${options.tag}] ${errorType} 错误，停止重试:`, error)
        throw error
      }

      // 如果还有重试次数，计算延迟
      if (attempt < options.maxAttempts) {
        // 指数退避：baseDelay * 2^(attempt-1)
        let delay = Math.min(options.baseDelay * Math.pow(2, attempt - 1), options.maxDelay)

        // 限流错误使用更长延迟（加倍）
        if (errorType === ErrorType.RATE_LIMIT) {
          delay = Math.min(delay * 2, options.maxDelay)
        }

        // 添加抖动（±25%），避免惊群效应
        if (options.jitter) {
          const jitterFactor = 0.75 + Math.random() * 0.5
          delay = Math.floor(delay * jitterFactor)
        }

        resilienceLogger.warn(
          `[${options.tag}] 尝试 ${attempt}/${options.maxAttempts} 失败 (${errorType})，${delay}ms 后重试...`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  // 所有重试都失败
  resilienceLogger.error(`[${options.tag}] 所有 ${options.maxAttempts} 次重试失败`)
  throw lastError
}

/**
 * 熔断器状态
 */
export enum CircuitState {
  CLOSED = "closed", // 正常工作
  OPEN = "open", // 熔断（停止请求）
  HALF_OPEN = "half_open" // 半开（尝试恢复）
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 失败阈值（连续失败次数） */
  failureThreshold: number
  /** 重置超时（ms），熔断后多久尝试恢复 */
  resetTimeout: number
  /** 半开状态允许的测试请求数 */
  halfOpenRequests: number
  /** 日志标签 */
  tag: string
}

/**
 * 熔断器
 * 
 * 实现：
 * - CLOSED → OPEN：连续失败达到阈值
 * - OPEN → HALF_OPEN：超时后尝试恢复
 * - HALF_OPEN → CLOSED：测试请求成功
 * - HALF_OPEN → OPEN：测试请求失败
 * 
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeout: 60000,
 *   halfOpenRequests: 3,
 *   tag: 'OpenAI'
 * })
 * 
 * const result = await breaker.execute(() => callAPI())
 * ```
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
   * 
   * @throws Error 如果熔断器已打开
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // 检查熔断器状态
    if (this.state === CircuitState.OPEN) {
      // 检查是否到重置时间
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        resilienceLogger.info(`[${this.config.tag}] 熔断器进入半开状态`)
        this.state = CircuitState.HALF_OPEN
        this.halfOpenAttempts = 0
      } else {
        const remainingTime = Math.ceil(
          (this.config.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000
        )
        throw new Error(
          `熔断器已打开，${this.config.tag} 暂时不可用（${remainingTime}s 后重试）`
        )
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
        resilienceLogger.info(`[${this.config.tag}] 熔断器关闭，服务恢复正常`)
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
      resilienceLogger.warn(`[${this.config.tag}] 熔断器重新打开`)
      this.state = CircuitState.OPEN
      this.successCount = 0
      return
    }

    // 达到失败阈值，打开熔断器
    if (this.failureCount >= this.config.failureThreshold) {
      resilienceLogger.error(
        `[${this.config.tag}] 熔断器打开，连续 ${this.failureCount} 次失败`
      )
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
   * 获取失败计数
   */
  getFailureCount(): number {
    return this.failureCount
  }

  /**
   * 重置熔断器
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.halfOpenAttempts = 0
    resilienceLogger.info(`[${this.config.tag}] 熔断器已重置`)
  }
}
