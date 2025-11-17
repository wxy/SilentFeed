/**
 * 错误处理模块测试
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import {
  AppError,
  ErrorCode,
  toAppError,
  handleAsync,
  handleSync,
  logError
} from './errors'

describe('AppError', () => {
  describe('构造函数', () => {
    test('应该创建基本错误', () => {
      const error = new AppError('测试错误')
      
      expect(error.message).toBe('测试错误')
      expect(error.name).toBe('AppError')
      expect(error.code).toBe(ErrorCode.UNKNOWN)
      expect(error.context).toBeUndefined()
      expect(error.cause).toBeUndefined()
      expect(error.timestamp).toBeInstanceOf(Date)
    })

    test('应该创建带错误码的错误', () => {
      const error = new AppError('网络错误', ErrorCode.NETWORK_ERROR)
      
      expect(error.message).toBe('网络错误')
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
    })

    test('应该创建带上下文的错误', () => {
      const context = { url: 'https://example.com', timeout: 5000 }
      const error = new AppError('请求超时', ErrorCode.TIMEOUT, context)
      
      expect(error.context).toEqual(context)
    })

    test('应该创建带原始错误的错误', () => {
      const originalError = new Error('原始错误')
      const error = new AppError(
        '包装错误',
        ErrorCode.UNKNOWN,
        undefined,
        originalError
      )
      
      expect(error.cause).toBe(originalError)
    })
  })

  describe('toJSON', () => {
    test('应该序列化为 JSON', () => {
      const error = new AppError(
        '测试错误',
        ErrorCode.VALIDATION_ERROR,
        { field: 'email' }
      )
      
      const json = error.toJSON()
      
      expect(json.name).toBe('AppError')
      expect(json.message).toBe('测试错误')
      expect(json.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(json.context).toEqual({ field: 'email' })
      expect(json.timestamp).toBeDefined()
      expect(json.stack).toBeDefined()
    })

    test('应该包含原始错误信息', () => {
      const originalError = new Error('原始错误')
      const error = new AppError('包装错误', ErrorCode.UNKNOWN, undefined, originalError)
      
      const json = error.toJSON()
      
      expect(json.cause).toBeDefined()
      expect(json.cause?.message).toBe('原始错误')
    })
  })

  describe('toUserMessage', () => {
    test('应该返回画像未准备的友好消息', () => {
      const error = new AppError('内部消息', ErrorCode.PROFILE_NOT_READY)
      expect(error.toUserMessage()).toContain('兴趣画像')
    })

    test('应该返回网络错误的友好消息', () => {
      const error = new AppError('内部消息', ErrorCode.NETWORK_ERROR)
      expect(error.toUserMessage()).toContain('网络')
    })

    test('应该返回数据不足的友好消息', () => {
      const error = new AppError('内部消息', ErrorCode.INSUFFICIENT_DATA)
      expect(error.toUserMessage()).toContain('数据不足')
    })

    test('应该为未知错误返回原始消息', () => {
      const error = new AppError('自定义错误消息', ErrorCode.UNKNOWN)
      expect(error.toUserMessage()).toBe('自定义错误消息')
    })
  })
})

describe('toAppError', () => {
  test('应该保持 AppError 不变', () => {
    const original = new AppError('测试', ErrorCode.VALIDATION_ERROR)
    const result = toAppError(original)
    
    expect(result).toBe(original)
  })

  test('应该转换 Error 对象', () => {
    const original = new Error('测试错误')
    const result = toAppError(original)
    
    expect(result).toBeInstanceOf(AppError)
    expect(result.message).toBe('测试错误')
    expect(result.cause).toBe(original)
  })

  test('应该使用提供的错误码', () => {
    const original = new Error('测试')
    const result = toAppError(original, ErrorCode.DATABASE_ERROR)
    
    expect(result.code).toBe(ErrorCode.DATABASE_ERROR)
  })

  test('应该添加上下文信息', () => {
    const original = new Error('测试')
    const context = { userId: 123 }
    const result = toAppError(original, ErrorCode.UNKNOWN, context)
    
    expect(result.context).toEqual(context)
  })

  test('应该推断网络错误码', () => {
    const networkError = new Error('Network request failed')
    const result = toAppError(networkError)
    
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR)
  })

  test('应该推断 API 错误码', () => {
    const apiError = new Error('API Error: 401 Unauthorized')
    const result = toAppError(apiError)
    
    expect(result.code).toBe(ErrorCode.API_ERROR)
  })

  test('应该推断数据库错误码', () => {
    const dbError = new Error('IndexedDB operation failed')
    const result = toAppError(dbError)
    
    expect(result.code).toBe(ErrorCode.DATABASE_ERROR)
  })

  test('应该处理 AbortError', () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    const result = toAppError(abortError)
    
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR)
  })

  test('应该转换字符串错误', () => {
    const result = toAppError('字符串错误')
    
    expect(result).toBeInstanceOf(AppError)
    expect(result.message).toBe('字符串错误')
    expect(result.code).toBe(ErrorCode.UNKNOWN)
  })

  test('应该转换其他类型', () => {
    const result = toAppError({ custom: 'error' })
    
    expect(result).toBeInstanceOf(AppError)
    expect(result.message).toBe('[object Object]')
  })
})

describe('handleAsync', () => {
  test('应该处理成功的异步操作', async () => {
    const [result, error] = await handleAsync(async () => 'success')
    
    expect(result).toBe('success')
    expect(error).toBeNull()
  })

  test('应该捕获异步错误', async () => {
    const [result, error] = await handleAsync(async () => {
      throw new Error('异步错误')
    })
    
    expect(result).toBeNull()
    expect(error).toBeInstanceOf(AppError)
    expect(error?.message).toBe('异步错误')
  })

  test('应该使用提供的错误码', async () => {
    const [, error] = await handleAsync(
      async () => { throw new Error('测试') },
      { code: ErrorCode.RSS_FETCH_ERROR }
    )
    
    expect(error?.code).toBe(ErrorCode.RSS_FETCH_ERROR)
  })

  test('应该添加上下文信息', async () => {
    const context = { url: 'https://example.com' }
    const [, error] = await handleAsync(
      async () => { throw new Error('测试') },
      { context }
    )
    
    expect(error?.context).toEqual(context)
  })

  test('应该调用错误回调', async () => {
    const onError = vi.fn()
    
    await handleAsync(
      async () => { throw new Error('测试') },
      { onError }
    )
    
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.any(AppError))
  })

  test('应该处理错误回调中的异常', async () => {
    const onError = vi.fn(() => {
      throw new Error('回调错误')
    })
    
    // 不应该抛出错误
    const [, error] = await handleAsync(
      async () => { throw new Error('测试') },
      { onError }
    )
    
    expect(error).toBeInstanceOf(AppError)
  })

  test('应该支持禁用日志', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    await handleAsync(
      async () => { throw new Error('测试') },
      { logError: false }
    )
    
    // 注意：实际日志通过 logger，这里只是示例
    // 真实测试需要 mock logger
    
    consoleSpy.mockRestore()
  })
})

describe('handleSync', () => {
  test('应该处理成功的同步操作', () => {
    const [result, error] = handleSync(() => 'success')
    
    expect(result).toBe('success')
    expect(error).toBeNull()
  })

  test('应该捕获同步错误', () => {
    const [result, error] = handleSync(() => {
      throw new Error('同步错误')
    })
    
    expect(result).toBeNull()
    expect(error).toBeInstanceOf(AppError)
    expect(error?.message).toBe('同步错误')
  })

  test('应该处理 JSON 解析错误', () => {
    const [result, error] = handleSync(
      () => JSON.parse('invalid json'),
      { operation: '解析 JSON' }
    )
    
    expect(result).toBeNull()
    expect(error).toBeInstanceOf(AppError)
  })

  test('应该使用提供的错误码', () => {
    const [, error] = handleSync(
      () => { throw new Error('测试') },
      { code: ErrorCode.VALIDATION_ERROR }
    )
    
    expect(error?.code).toBe(ErrorCode.VALIDATION_ERROR)
  })

  test('应该调用错误回调', () => {
    const onError = vi.fn()
    
    handleSync(
      () => { throw new Error('测试') },
      { onError }
    )
    
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('logError', () => {
  test('应该记录错误', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    const error = new Error('测试错误')
    logError(error)
    
    // logger 会调用 console.error
    // 这里只是基础测试，实际需要 mock logger
    
    consoleSpy.mockRestore()
  })

  test('应该添加上下文', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    logError(new Error('测试'), { userId: 123 })
    
    consoleSpy.mockRestore()
  })

  test('应该使用自定义标签', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    logError(new Error('测试'), undefined, 'CustomTag')
    
    consoleSpy.mockRestore()
  })
})

describe('错误码推断', () => {
  test('应该推断网络相关错误', () => {
    const errors = [
      new Error('network error'),
      new Error('fetch failed'),
      new Error('request timeout')
    ]
    
    errors.forEach(err => {
      const appError = toAppError(err)
      expect(appError.code).toBe(ErrorCode.NETWORK_ERROR)
    })
  })

  test('应该推断 API 错误', () => {
    const errors = [
      new Error('API error'),
      new Error('401 Unauthorized'),
      new Error('403 Forbidden')
    ]
    
    errors.forEach(err => {
      const appError = toAppError(err)
      expect(appError.code).toBe(ErrorCode.API_ERROR)
    })
  })

  test('应该推断数据库错误', () => {
    const errors = [
      new Error('database error'),
      new Error('IndexedDB failure'),
      new Error('Dexie transaction failed')
    ]
    
    errors.forEach(err => {
      const appError = toAppError(err)
      expect(appError.code).toBe(ErrorCode.DATABASE_ERROR)
    })
  })

  test('应该推断 RSS 错误', () => {
    const errors = [
      new Error('RSS fetch failed'),
      new Error('Invalid feed format'),
      new Error('XML parse error')
    ]
    
    errors.forEach(err => {
      const appError = toAppError(err)
      expect(appError.code).toBe(ErrorCode.RSS_FETCH_ERROR)
    })
  })
})
