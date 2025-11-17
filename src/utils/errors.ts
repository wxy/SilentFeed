/**
 * 统一错误处理模块
 * 
 * 提供：
 * 1. AppError 类 - 结构化的应用错误
 * 2. handleAsync - 异步操作错误处理包装器
 * 3. 错误转换和日志记录工具
 */

import { logger } from './logger'

const errorLogger = logger.withTag('ErrorHandler')

/**
 * 错误码枚举
 * 用于分类和识别不同类型的错误
 */
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 'UNKNOWN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  
  // 网络错误 (2xxx)
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // 数据库错误 (3xxx)
  DATABASE_ERROR = 'DATABASE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  
  // AI 相关错误 (4xxx)
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_RESPONSE_ERROR = 'AI_RESPONSE_ERROR',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
  
  // 用户画像错误 (5xxx)
  PROFILE_NOT_READY = 'PROFILE_NOT_READY',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  
  // RSS 相关错误 (6xxx)
  RSS_FETCH_ERROR = 'RSS_FETCH_ERROR',
  RSS_PARSE_ERROR = 'RSS_PARSE_ERROR',
  RSS_INVALID_FORMAT = 'RSS_INVALID_FORMAT',
  
  // 推荐系统错误 (7xxx)
  RECOMMENDATION_ERROR = 'RECOMMENDATION_ERROR',
  NO_RECOMMENDATIONS = 'NO_RECOMMENDATIONS',
}

/**
 * 应用错误类
 * 
 * 扩展原生 Error，添加错误码、上下文信息等结构化数据
 * 
 * @example
 * ```typescript
 * throw new AppError(
 *   '用户画像未准备好',
 *   ErrorCode.PROFILE_NOT_READY,
 *   { pageCount: 50, required: 100 }
 * )
 * ```
 */
export class AppError extends Error {
  /**
   * 错误码
   */
  public readonly code: ErrorCode
  
  /**
   * 上下文信息
   * 包含导致错误的相关数据
   */
  public readonly context?: Record<string, any>
  
  /**
   * 原始错误
   * 如果是从其他错误转换而来，保留原始错误
   */
  public readonly cause?: Error
  
  /**
   * 时间戳
   */
  public readonly timestamp: Date

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.context = context
    this.cause = cause
    this.timestamp = new Date()
    
    // 保持正确的原型链（TypeScript 类继承 Error 需要）
    Object.setPrototypeOf(this, AppError.prototype)
  }

  /**
   * 将错误转换为 JSON 格式（用于日志记录）
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } : undefined
    }
  }

  /**
   * 生成用户友好的错误消息
   */
  toUserMessage(): string {
    // 根据错误码返回用户友好的消息
    switch (this.code) {
      case ErrorCode.PROFILE_NOT_READY:
        return '您的兴趣画像还需要更多数据，请继续浏览网页'
      case ErrorCode.INSUFFICIENT_DATA:
        return '数据不足，无法完成操作'
      case ErrorCode.NETWORK_ERROR:
        return '网络连接失败，请检查网络设置'
      case ErrorCode.AI_QUOTA_EXCEEDED:
        return 'AI 服务配额已用完，请稍后再试'
      case ErrorCode.RSS_FETCH_ERROR:
        return '无法获取 RSS 源，请检查地址是否正确'
      case ErrorCode.DATABASE_ERROR:
        return '数据存储出错，请尝试重启扩展'
      default:
        return this.message || '发生未知错误，请稍后重试'
    }
  }
}

/**
 * 将任意错误转换为 AppError
 * 
 * @param error - 原始错误对象
 * @param code - 错误码（可选）
 * @param context - 上下文信息（可选）
 * @returns AppError 实例
 * 
 * @example
 * ```typescript
 * try {
 *   await fetch(url)
 * } catch (err) {
 *   throw toAppError(err, ErrorCode.NETWORK_ERROR, { url })
 * }
 * ```
 */
export function toAppError(
  error: unknown,
  code?: ErrorCode,
  context?: Record<string, any>
): AppError {
  // 已经是 AppError，直接返回
  if (error instanceof AppError) {
    return error
  }
  
  // Error 对象
  if (error instanceof Error) {
    // 尝试从错误消息推断错误码
    const inferredCode = code || inferErrorCode(error)
    return new AppError(
      error.message,
      inferredCode,
      context,
      error
    )
  }
  
  // 其他类型（字符串、对象等）
  return new AppError(
    String(error),
    code || ErrorCode.UNKNOWN,
    context
  )
}

/**
 * 从错误对象推断错误码
 * 
 * @param error - 错误对象
 * @returns 推断的错误码
 */
function inferErrorCode(error: Error): ErrorCode {
  const message = error.message.toLowerCase()
  
  // RSS 错误（需要优先判断，因为可能包含 fetch/network 等关键词）
  if (
    message.includes('rss') ||
    message.includes('feed') ||
    message.includes('xml')
  ) {
    return ErrorCode.RSS_FETCH_ERROR
  }
  
  // 网络错误
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    error.name === 'AbortError'
  ) {
    return ErrorCode.NETWORK_ERROR
  }
  
  // API 错误
  if (
    message.includes('api') ||
    message.includes('unauthorized') ||
    message.includes('403') ||
    message.includes('401')
  ) {
    return ErrorCode.API_ERROR
  }
  
  // 数据库错误
  if (
    message.includes('database') ||
    message.includes('indexeddb') ||
    message.includes('dexie')
  ) {
    return ErrorCode.DATABASE_ERROR
  }
  
  return ErrorCode.UNKNOWN
}

/**
 * 异步操作错误处理选项
 */
export interface HandleAsyncOptions {
  /**
   * 错误码
   */
  code?: ErrorCode
  
  /**
   * 上下文信息
   */
  context?: Record<string, any>
  
  /**
   * 是否记录错误日志（默认 true）
   */
  logError?: boolean
  
  /**
   * 日志标签（默认使用 ErrorHandler）
   */
  tag?: string
  
  /**
   * 错误发生时的回调
   */
  onError?: (error: AppError) => void
  
  /**
   * 操作描述（用于日志）
   */
  operation?: string
}

/**
 * 异步操作结果类型
 * 使用 Rust 风格的 Result 模式：[data, error]
 */
export type AsyncResult<T> = Promise<[T, null] | [null, AppError]>

/**
 * 包装异步操作，统一处理错误
 * 
 * 返回 [data, error] 元组，避免 try-catch 嵌套
 * 
 * @param fn - 异步函数
 * @param options - 错误处理选项
 * @returns Promise<[data, null] | [null, error]>
 * 
 * @example
 * ```typescript
 * // 基础用法
 * const [data, error] = await handleAsync(
 *   async () => fetchUserProfile(),
 *   { operation: '获取用户画像' }
 * )
 * 
 * if (error) {
 *   console.error('获取失败:', error.toUserMessage())
 *   return
 * }
 * 
 * // 使用数据
 * console.log('用户画像:', data)
 * 
 * // 带上下文和错误码
 * const [articles, error] = await handleAsync(
 *   async () => fetchRSS(url),
 *   {
 *     code: ErrorCode.RSS_FETCH_ERROR,
 *     context: { url },
 *     operation: '抓取 RSS'
 *   }
 * )
 * ```
 */
export async function handleAsync<T>(
  fn: () => Promise<T>,
  options: HandleAsyncOptions = {}
): AsyncResult<T> {
  const {
    code,
    context,
    logError = true,
    tag,
    onError,
    operation
  } = options
  
  try {
    const result = await fn()
    return [result, null]
  } catch (err) {
    // 转换为 AppError
    const appError = toAppError(err, code, context)
    
    // 记录日志
    if (logError) {
      const loggerInstance = tag ? logger.withTag(tag) : errorLogger
      const operationDesc = operation ? ` [${operation}]` : ''
      loggerInstance.error(`操作失败${operationDesc}`, appError.toJSON())
    }
    
    // 调用错误回调
    if (onError) {
      try {
        onError(appError)
      } catch (callbackError) {
        errorLogger.error('错误回调执行失败', callbackError)
      }
    }
    
    return [null, appError]
  }
}

/**
 * 记录错误日志（不抛出）
 * 
 * @param error - 错误对象
 * @param context - 上下文信息
 * @param tag - 日志标签
 * 
 * @example
 * ```typescript
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   // 仅记录日志，不影响程序流程
 *   logError(error, { userId: 123 }, 'UserService')
 * }
 * ```
 */
export function logError(
  error: unknown,
  context?: Record<string, any>,
  tag?: string
): void {
  const appError = toAppError(error, undefined, context)
  const loggerInstance = tag ? logger.withTag(tag) : errorLogger
  loggerInstance.error('错误发生', appError.toJSON())
}

/**
 * 同步操作错误处理包装器
 * 
 * @param fn - 同步函数
 * @param options - 错误处理选项
 * @returns [data, null] | [null, error]
 * 
 * @example
 * ```typescript
 * const [result, error] = handleSync(
 *   () => JSON.parse(jsonString),
 *   { operation: '解析 JSON' }
 * )
 * 
 * if (error) {
 *   console.error('解析失败:', error.message)
 *   return
 * }
 * 
 * console.log('解析结果:', result)
 * ```
 */
export function handleSync<T>(
  fn: () => T,
  options: HandleAsyncOptions = {}
): [T, null] | [null, AppError] {
  const {
    code,
    context,
    logError: shouldLog = true,
    tag,
    onError,
    operation
  } = options
  
  try {
    const result = fn()
    return [result, null]
  } catch (err) {
    // 转换为 AppError
    const appError = toAppError(err, code, context)
    
    // 记录日志
    if (shouldLog) {
      const loggerInstance = tag ? logger.withTag(tag) : errorLogger
      const operationDesc = operation ? ` [${operation}]` : ''
      loggerInstance.error(`操作失败${operationDesc}`, appError.toJSON())
    }
    
    // 调用错误回调
    if (onError) {
      try {
        onError(appError)
      } catch (callbackError) {
        errorLogger.error('错误回调执行失败', callbackError)
      }
    }
    
    return [null, appError]
  }
}
