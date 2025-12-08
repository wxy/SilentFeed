/**
 * 容错机制测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  ErrorType,
  classifyError,
  withExponentialBackoff,
  CircuitBreaker,
  CircuitState
} from "./resilience"

describe("resilience", () => {
  describe("classifyError", () => {
    it("应该识别限流错误", () => {
      expect(classifyError(new Error("Rate limit exceeded"))).toBe(ErrorType.RATE_LIMIT)
      expect(classifyError(new Error("Quota exceeded"))).toBe(ErrorType.RATE_LIMIT)
      expect(classifyError(new Error("Too many requests"))).toBe(ErrorType.RATE_LIMIT)
      expect(classifyError(new Error("HTTP 429"))).toBe(ErrorType.RATE_LIMIT)
    })

    it("应该识别永久错误", () => {
      expect(classifyError(new Error("Invalid API key"))).toBe(ErrorType.PERMANENT)
      expect(classifyError(new Error("Unauthorized"))).toBe(ErrorType.PERMANENT)
      expect(classifyError(new Error("Forbidden"))).toBe(ErrorType.PERMANENT)
      expect(classifyError(new Error("Not found"))).toBe(ErrorType.PERMANENT)
      expect(classifyError(new Error("HTTP 401"))).toBe(ErrorType.PERMANENT)
      expect(classifyError(new Error("HTTP 403"))).toBe(ErrorType.PERMANENT)
      expect(classifyError(new Error("HTTP 404"))).toBe(ErrorType.PERMANENT)
    })

    it("应该识别预算错误", () => {
      expect(classifyError(new Error("Budget exceeded"))).toBe(ErrorType.BUDGET_EXCEEDED)
      expect(classifyError(new Error("Insufficient funds"))).toBe(ErrorType.BUDGET_EXCEEDED)
    })

    it("应该识别临时错误", () => {
      expect(classifyError(new Error("Timeout"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("Network error"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("ECONNREFUSED"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("Fetch failed"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("HTTP 500"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("HTTP 502"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("HTTP 503"))).toBe(ErrorType.TEMPORARY)
      expect(classifyError(new Error("HTTP 504"))).toBe(ErrorType.TEMPORARY)
    })

    it("应该识别未知错误", () => {
      expect(classifyError(new Error("Something went wrong"))).toBe(ErrorType.UNKNOWN)
      expect(classifyError("string error")).toBe(ErrorType.UNKNOWN)
    })
  })

  describe("withExponentialBackoff", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("第一次尝试成功应该直接返回", async () => {
      const operation = vi.fn().mockResolvedValue("success")

      const promise = withExponentialBackoff(operation, {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: false,
        tag: "Test"
      })

      const result = await promise

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it("临时错误应该重试", async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValue("success")

      const promise = withExponentialBackoff(operation, {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: false,
        tag: "Test"
      })

      // 快进时间
      await vi.advanceTimersByTimeAsync(1000) // 第一次重试
      await vi.advanceTimersByTimeAsync(2000) // 第二次重试（指数退避）

      const result = await promise

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(3)
    })

    it("永久错误应该立即失败不重试", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Invalid API key"))

      await expect(
        withExponentialBackoff(operation, {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          jitter: false,
          tag: "Test"
        })
      ).rejects.toThrow("Invalid API key")

      expect(operation).toHaveBeenCalledTimes(1)
    })

    it("预算错误应该立即失败不重试", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Budget exceeded"))

      await expect(
        withExponentialBackoff(operation, {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          jitter: false,
          tag: "Test"
        })
      ).rejects.toThrow("Budget exceeded")

      expect(operation).toHaveBeenCalledTimes(1)
    })

    it("限流错误应该使用加倍延迟", async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error("Rate limit exceeded"))
        .mockResolvedValue("success")

      const promise = withExponentialBackoff(operation, {
        maxAttempts: 2,
        baseDelay: 1000,
        maxDelay: 10000,
        jitter: false,
        tag: "Test"
      })

      // 限流错误延迟：1000 * 2 = 2000ms
      await vi.advanceTimersByTimeAsync(2000)

      const result = await promise

      expect(result).toBe("success")
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it("应该遵循指数退避", async () => {
      const delays: number[] = []
      const operation = vi.fn().mockImplementation(() => {
        delays.push(Date.now())
        return Promise.reject(new Error("Network error"))
      })

      const promise = withExponentialBackoff(operation, {
        maxAttempts: 4,
        baseDelay: 100,
        maxDelay: 10000,
        jitter: false,
        tag: "Test"
      }).catch(() => {}) // 捕获以避免 unhandled rejection

      // 快进所有重试
      await vi.advanceTimersByTimeAsync(100) // 第1次重试：100ms
      await vi.advanceTimersByTimeAsync(200) // 第2次重试：200ms
      await vi.advanceTimersByTimeAsync(400) // 第3次重试：400ms

      await promise

      expect(operation).toHaveBeenCalledTimes(4)
      // 验证延迟间隔：100, 200, 400
      expect(delays[1] - delays[0]).toBeGreaterThanOrEqual(100)
      expect(delays[2] - delays[1]).toBeGreaterThanOrEqual(200)
      expect(delays[3] - delays[2]).toBeGreaterThanOrEqual(400)
    })

    it("应该遵循最大延迟上限", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Network error"))

      const promise = withExponentialBackoff(operation, {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 3000, // 最大延迟 3s
        jitter: false,
        tag: "Test"
      }).catch(() => {}) // 捕获以避免 unhandled rejection

      await vi.advanceTimersByTimeAsync(1000) // 1000ms
      await vi.advanceTimersByTimeAsync(2000) // 2000ms
      await vi.advanceTimersByTimeAsync(3000) // 应该被限制为 3000ms
      await vi.advanceTimersByTimeAsync(3000) // 应该被限制为 3000ms

      await promise

      expect(operation).toHaveBeenCalledTimes(5)
    })

    it("自定义 shouldRetry 应该控制重试", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("Custom error"))

      await expect(
        withExponentialBackoff(operation, {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 10000,
          jitter: false,
          tag: "Test",
          shouldRetry: () => false // 禁止重试
        })
      ).rejects.toThrow("Custom error")

      expect(operation).toHaveBeenCalledTimes(1)
    })
  })

  describe("CircuitBreaker", () => {
    it("初始状态应该是 CLOSED", () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      expect(breaker.getState()).toBe(CircuitState.CLOSED)
    })

    it("成功执行应该返回结果", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      const result = await breaker.execute(() => Promise.resolve("success"))

      expect(result).toBe("success")
      expect(breaker.getState()).toBe(CircuitState.CLOSED)
    })

    it("连续失败达到阈值应该打开熔断器", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      // 3 次失败
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN)
    })

    it("熔断器打开后应该拒绝请求", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      // 触发熔断
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN)

      // 下一个请求应该被拒绝
      await expect(breaker.execute(() => Promise.resolve("ok"))).rejects.toThrow("熔断器已打开")
    })

    it("超时后应该进入半开状态", async () => {
      vi.useFakeTimers()

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      // 触发熔断
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN)

      // 快进 5s
      vi.advanceTimersByTime(5000)

      // 下一个请求应该进入半开状态
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN) // 半开失败，重新打开

      vi.useRealTimers()
    })

    it("半开状态成功应该关闭熔断器", async () => {
      vi.useFakeTimers()

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      // 触发熔断
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN)

      // 快进 5s
      vi.advanceTimersByTime(5000)

      // 半开状态：2 次成功
      await breaker.execute(() => Promise.resolve("ok"))
      await breaker.execute(() => Promise.resolve("ok"))

      expect(breaker.getState()).toBe(CircuitState.CLOSED)

      vi.useRealTimers()
    })

    it("半开状态失败应该重新打开熔断器", async () => {
      vi.useFakeTimers()

      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      // 触发熔断
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN)

      // 快进 5s
      vi.advanceTimersByTime(5000)

      // 半开状态：1 次失败
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN)

      vi.useRealTimers()
    })

    it("reset 应该重置熔断器状态", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        tag: "Test"
      })

      // 触发熔断
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()
      await expect(breaker.execute(() => Promise.reject(new Error("Fail")))).rejects.toThrow()

      expect(breaker.getState()).toBe(CircuitState.OPEN)
      expect(breaker.getFailureCount()).toBe(2)

      // 重置
      breaker.reset()

      expect(breaker.getState()).toBe(CircuitState.CLOSED)
      expect(breaker.getFailureCount()).toBe(0)
    })
  })
})
