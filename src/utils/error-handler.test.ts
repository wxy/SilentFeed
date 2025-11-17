/**
 * 错误处理工具测试
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AppError,
  withErrorHandling,
  withErrorHandlingSync,
  toResult,
  toResultSync,
  withRetry
} from './error-handler'

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    withTag: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    })
  }
}))

describe('AppError', () => {
  test('创建 AppError 实例', () => {
    const error = new AppError(
      'Something went wrong',
      'TEST_ERROR',
      '操作失败'
    )
    
    expect(error.message).toBe('Something went wrong')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.userMessage).toBe('操作失败')
    expect(error.name).toBe('AppError')
  })
  
  test('保留原始错误', () => {
    const originalError = new Error('Original error')
    const appError = new AppError(
      'Wrapped error',
      'TEST_ERROR',
      '操作失败',
      originalError
    )
    
    expect(appError.originalError).toBe(originalError)
  })
  
  test('保留原始错误堆栈', () => {
    const originalError = new Error('Original')
    const appError = new AppError(
      'Wrapped',
      'TEST_ERROR',
      '操作失败',
      originalError
    )
    
    expect(appError.stack).toBe(originalError.stack)
  })
})

describe('withErrorHandling', () => {
  test('成功执行操作', async () => {
    const operation = vi.fn().mockResolvedValue('success')
    
    const result = await withErrorHandling(operation, {
      tag: 'Test',
      fallback: 'fallback'
    })
    
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(1)
  })
  
  test('失败时返回 fallback', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Failed'))
    
    const result = await withErrorHandling(operation, {
      tag: 'Test',
      fallback: 'fallback'
    })
    
    expect(result).toBe('fallback')
  })
  
  test('重新抛出错误', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Failed'))
    
    await expect(
      withErrorHandling(operation, {
        tag: 'Test',
        fallback: 'fallback',
        rethrow: true,
        errorCode: 'TEST_ERROR',
        userMessage: '测试失败'
      })
    ).rejects.toThrow(AppError)
  })
  
  test('调用自定义错误处理', async () => {
    const onError = vi.fn()
    const operation = vi.fn().mockRejectedValue(new Error('Failed'))
    
    await withErrorHandling(operation, {
      tag: 'Test',
      fallback: 'fallback',
      onError
    })
    
    expect(onError).toHaveBeenCalledTimes(1)
  })
  
  test('保持 AppError 实例', async () => {
    const appError = new AppError('Test', 'TEST_ERROR', '测试')
    const operation = vi.fn().mockRejectedValue(appError)
    
    await expect(
      withErrorHandling(operation, {
        tag: 'Test',
        rethrow: true
      })
    ).rejects.toThrow(appError)
  })
})

describe('withErrorHandlingSync', () => {
  test('成功执行操作', () => {
    const operation = vi.fn().mockReturnValue('success')
    
    const result = withErrorHandlingSync(operation, {
      tag: 'Test',
      fallback: 'fallback'
    })
    
    expect(result).toBe('success')
  })
  
  test('失败时返回 fallback', () => {
    const operation = vi.fn().mockImplementation(() => {
      throw new Error('Failed')
    })
    
    const result = withErrorHandlingSync(operation, {
      tag: 'Test',
      fallback: 'fallback'
    })
    
    expect(result).toBe('fallback')
  })
  
  test('重新抛出错误', () => {
    const operation = vi.fn().mockImplementation(() => {
      throw new Error('Failed')
    })
    
    expect(() =>
      withErrorHandlingSync(operation, {
        tag: 'Test',
        rethrow: true,
        errorCode: 'TEST_ERROR',
        userMessage: '测试失败'
      })
    ).toThrow(AppError)
  })
})

describe('toResult', () => {
  test('成功返回 [data, null]', async () => {
    const promise = Promise.resolve('success')
    const [data, error] = await toResult(promise)
    
    expect(data).toBe('success')
    expect(error).toBeNull()
  })
  
  test('失败返回 [null, error]', async () => {
    const promise = Promise.reject(new Error('Failed'))
    const [data, error] = await toResult(
      promise,
      'TEST_ERROR',
      '操作失败'
    )
    
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(AppError)
    expect(error?.code).toBe('TEST_ERROR')
    expect(error?.userMessage).toBe('操作失败')
  })
  
  test('保持 AppError 实例', async () => {
    const appError = new AppError('Test', 'TEST_ERROR', '测试')
    const promise = Promise.reject(appError)
    const [data, error] = await toResult(promise)
    
    expect(data).toBeNull()
    expect(error).toBe(appError)
  })
  
  test('处理非 Error 类型的异常', async () => {
    const promise = Promise.reject('string error')
    const [data, error] = await toResult(promise, 'TEST_ERROR', '操作失败')
    
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(AppError)
    expect(error?.message).toBe('string error')
  })
})

describe('toResultSync', () => {
  test('成功返回 [data, null]', () => {
    const [data, error] = toResultSync(() => 'success')
    
    expect(data).toBe('success')
    expect(error).toBeNull()
  })
  
  test('失败返回 [null, error]', () => {
    const [data, error] = toResultSync(
      () => { throw new Error('Failed') },
      'TEST_ERROR',
      '操作失败'
    )
    
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(AppError)
    expect(error?.code).toBe('TEST_ERROR')
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })
  
  test('第一次尝试成功', async () => {
    const operation = vi.fn().mockResolvedValue('success')
    
    const promise = withRetry(operation, {
      maxAttempts: 3,
      delay: 1000,
      tag: 'Test'
    })
    
    const result = await promise
    
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(1)
  })
  
  test('重试后成功', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success')
    
    const promise = withRetry(operation, {
      maxAttempts: 3,
      delay: 1000,
      tag: 'Test'
    })
    
    // 快进时间，等待所有异步操作完成
    await vi.runAllTimersAsync()
    
    const result = await promise
    
    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(3)
  })
  
  test('所有重试失败', async () => {
    const error = new Error('Failed')
    const operation = vi.fn().mockRejectedValue(error)
    
    const promise = withRetry(operation, {
      maxAttempts: 3,
      delay: 1000,
      tag: 'Test'
    })
    
    // 等待异步定时器
    const timersPromise = vi.runAllTimersAsync()
    
    // 等待 promise 拒绝并捕获错误
    await expect(promise).rejects.toThrow('Failed')
    
    // 确保定时器完成
    await timersPromise
    
    expect(operation).toHaveBeenCalledTimes(3)
  })
  
  test('自定义重试条件', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('No retry'))
    
    const promise = withRetry(operation, {
      maxAttempts: 3,
      delay: 1000,
      tag: 'Test',
      shouldRetry: (error) => {
        return error instanceof Error && error.message !== 'No retry'
      }
    })
    
    await expect(promise).rejects.toThrow('No retry')
    expect(operation).toHaveBeenCalledTimes(1) // 不重试
  })
})
