/**
 * 统一错误处理工具
 * 
 * 提供标准化的错误类型和错误处理包装器，用于替代分散的 try-catch 块
 */

import { logger } from "./logger"

const errorLogger = logger.withTag('ErrorHandler')

/**
 * 应用错误类
 * 
 * 扩展 Error，添加错误码和用户友好的错误消息
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'AppError'
    
    // 保持原始错误的堆栈跟踪
    if (originalError instanceof Error && originalError.stack) {
      this.stack = originalError.stack
    }
  }
}

/**
 * 错误处理选项
 */
export interface ErrorHandlingOptions<T> {
  /** 错误标签（用于日志） */
  tag: string
  /** 失败时返回的默认值 */
  fallback?: T
  /** 是否重新抛出错误（默认为 false） */
  rethrow?: boolean
  /** 错误码 */
  errorCode?: string
  /** 用户友好的错误消息 */
  userMessage?: string
  /** 自定义错误处理函数 */
  onError?: (error: unknown) => void
}

/**
 * 异步操作错误处理包装器
 * 
 * @param operation - 要执行的异步操作
 * @param options - 错误处理选项
 * @returns 操作结果或 fallback 值
 * 
 * @example
 * ```typescript
 * const result = await withErrorHandling(
 *   () => fetchData(),
 *   { tag: 'DataFetcher', fallback: [] }
 * )
 * ```
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options: ErrorHandlingOptions<T>
): Promise<T | typeof options.fallback> {
  try {
    return await operation()
  } catch (error) {
    // 记录错误日志
    errorLogger.error(`[${options.tag}] 操作失败:`, error)
    
    // 调用自定义错误处理
    if (options.onError) {
      options.onError(error)
    }
    
    // 重新抛出错误（如果配置了）
    if (options.rethrow) {
      // 包装为 AppError
      if (error instanceof AppError) {
        throw error
      }
      
      throw new AppError(
        error instanceof Error ? error.message : String(error),
        options.errorCode || 'UNKNOWN_ERROR',
        options.userMessage || '操作失败',
        error
      )
    }
    
    // 返回 fallback 值
    return options.fallback as T
  }
}

/**
 * 同步操作错误处理包装器
 * 
 * @param operation - 要执行的同步操作
 * @param options - 错误处理选项
 * @returns 操作结果或 fallback 值
 * 
 * @example
 * ```typescript
 * const result = withErrorHandlingSync(
 *   () => JSON.parse(data),
 *   { tag: 'JSONParser', fallback: {} }
 * )
 * ```
 */
export function withErrorHandlingSync<T>(
  operation: () => T,
  options: ErrorHandlingOptions<T>
): T | typeof options.fallback {
  try {
    return operation()
  } catch (error) {
    // 记录错误日志
    errorLogger.error(`[${options.tag}] 操作失败:`, error)
    
    // 调用自定义错误处理
    if (options.onError) {
      options.onError(error)
    }
    
    // 重新抛出错误（如果配置了）
    if (options.rethrow) {
      // 包装为 AppError
      if (error instanceof AppError) {
        throw error
      }
      
      throw new AppError(
        error instanceof Error ? error.message : String(error),
        options.errorCode || 'UNKNOWN_ERROR',
        options.userMessage || '操作失败',
        error
      )
    }
    
    // 返回 fallback 值
    return options.fallback as T
  }
}

/**
 * 结果/错误元组类型
 */
export type Result<T, E = AppError> = [T, null] | [null, E]

/**
 * 将 Promise 转换为 Result 元组
 * 
 * 适用于需要显式处理错误的场景，避免 try-catch
 * 
 * @param promise - 要执行的 Promise
 * @param errorCode - 错误码
 * @param userMessage - 用户友好的错误消息
 * @returns [data, null] 或 [null, error]
 * 
 * @example
 * ```typescript
 * const [profile, error] = await toResult(
 *   buildProfile(),
 *   'PROFILE_BUILD_ERROR',
 *   '构建用户画像失败'
 * )
 * 
 * if (error) {
 *   showToast(error.userMessage)
 *   return
 * }
 * 
 * // profile 类型安全，且确保无错误
 * useProfile(profile)
 * ```
 */
export async function toResult<T>(
  promise: Promise<T>,
  errorCode: string = 'UNKNOWN_ERROR',
  userMessage: string = '操作失败'
): Promise<Result<T>> {
  try {
    const data = await promise
    return [data, null]
  } catch (error) {
    const appError = error instanceof AppError
      ? error
      : new AppError(
          error instanceof Error ? error.message : String(error),
          errorCode,
          userMessage,
          error
        )
    
    return [null, appError]
  }
}

/**
 * 同步版本的 toResult
 */
export function toResultSync<T>(
  operation: () => T,
  errorCode: string = 'UNKNOWN_ERROR',
  userMessage: string = '操作失败'
): Result<T> {
  try {
    const data = operation()
    return [data, null]
  } catch (error) {
    const appError = error instanceof AppError
      ? error
      : new AppError(
          error instanceof Error ? error.message : String(error),
          errorCode,
          userMessage,
          error
        )
    
    return [null, appError]
  }
}

/**
 * 重试机制包装器
 * 
 * @param operation - 要执行的操作
 * @param options - 重试选项
 * @returns 操作结果
 * 
 * @example
 * ```typescript
 * const data = await withRetry(
 *   () => fetch('/api/data'),
 *   { maxAttempts: 3, delay: 1000, tag: 'APIFetch' }
 * )
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts: number
    delay: number
    tag: string
    shouldRetry?: (error: unknown) => boolean
  }
): Promise<T> {
  let lastError: unknown
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      // 检查是否应该重试
      if (options.shouldRetry && !options.shouldRetry(error)) {
        errorLogger.error(`[${options.tag}] 不可重试的错误:`, error)
        throw error
      }
      
      // 如果还有重试次数，等待后重试
      if (attempt < options.maxAttempts) {
        errorLogger.warn(`[${options.tag}] 尝试 ${attempt}/${options.maxAttempts} 失败，${options.delay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
    }
  }
  
  // 所有重试都失败
  errorLogger.error(`[${options.tag}] 所有 ${options.maxAttempts} 次尝试都失败`)
  throw lastError
}
