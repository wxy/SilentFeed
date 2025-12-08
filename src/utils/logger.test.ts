/**
 * Logger 工具测试
 * 确保日志工具在不同环境下正确工作
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { logger, LogLevel, isNetworkError } from "./logger"

describe("Logger", () => {
  let consoleLogSpy: any
  let consoleWarnSpy: any
  let consoleErrorSpy: any
  let originalEnv: string | undefined

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = process.env.NODE_ENV

    // Mock console 方法
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    // 恢复环境变量
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv as any
    }

    // 恢复 console 方法
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe("开发环境", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development"
      // 重新导入以应用新的环境变量
      vi.resetModules()
    })

    it("debug 应该输出日志", async () => {
      // 需要重新导入以获取新的 logger 实例
      const { logger: devLogger } = await import("./logger")

      devLogger.debug("测试调试消息")
      expect(consoleLogSpy).toHaveBeenCalledWith("测试调试消息", "")
    })

    it("debug 应该输出日志和数据", async () => {
      const { logger: devLogger } = await import("./logger")
      const testData = { key: "value" }

      devLogger.debug("测试消息", testData)
      expect(consoleLogSpy).toHaveBeenCalledWith("测试消息", testData)
    })

    it("info 应该输出日志", async () => {
      const { logger: devLogger } = await import("./logger")

      devLogger.info("测试信息消息")
      expect(consoleLogSpy).toHaveBeenCalledWith("测试信息消息", "")
    })

    it("info 应该输出日志和数据", async () => {
      const { logger: devLogger } = await import("./logger")
      const testData = { status: "ok" }

      devLogger.info("测试消息", testData)
      expect(consoleLogSpy).toHaveBeenCalledWith("测试消息", testData)
    })
  })

  describe("生产环境", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production"
      vi.resetModules()
    })

    it("debug 不应该输出日志", async () => {
      const { logger: prodLogger } = await import("./logger")

      prodLogger.debug("测试调试消息")
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it("info 不应该输出日志", async () => {
      const { logger: prodLogger } = await import("./logger")

      prodLogger.info("测试信息消息")
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it("warn 应该输出日志", async () => {
      const { logger: prodLogger } = await import("./logger")

      prodLogger.warn("测试警告消息")
      expect(consoleWarnSpy).toHaveBeenCalledWith("测试警告消息", "")
    })

    it("error 应该输出日志", async () => {
      const { logger: prodLogger } = await import("./logger")

      prodLogger.error("测试错误消息")
      expect(consoleErrorSpy).toHaveBeenCalledWith("测试错误消息", "")
    })
  })

  describe("warn 方法（所有环境）", () => {
    it("应该总是输出警告日志", () => {
      logger.warn("警告消息")
      expect(consoleWarnSpy).toHaveBeenCalledWith("警告消息", "")
    })

    it("应该输出警告日志和数据", () => {
      const warnData = { code: 404 }
      logger.warn("警告消息", warnData)
      expect(consoleWarnSpy).toHaveBeenCalledWith("警告消息", warnData)
    })
  })

  describe("error 方法（所有环境）", () => {
    it("应该总是输出错误日志", () => {
      logger.error("错误消息")
      expect(consoleErrorSpy).toHaveBeenCalledWith("错误消息", "")
    })

    it("应该输出错误日志和 Error 对象", () => {
      const error = new Error("测试错误")
      logger.error("错误消息", error)
      expect(consoleErrorSpy).toHaveBeenCalledWith("错误消息", error)
    })

    it("应该输出错误日志和错误数据", () => {
      const errorData = { stack: "..." }
      logger.error("错误消息", errorData)
      expect(consoleErrorSpy).toHaveBeenCalledWith("错误消息", errorData)
    })
  })

  describe("withTag 方法", () => {
    it("应该创建带标签的 logger", () => {
      const taggedLogger = logger.withTag("TestModule")
      
      taggedLogger.warn("测试消息")
      expect(consoleWarnSpy).toHaveBeenCalledWith("[TestModule] 测试消息", "")
    })

    it("应该在所有日志级别添加标签", () => {
      const taggedLogger = logger.withTag("Component")
      
      taggedLogger.warn("警告")
      taggedLogger.error("错误")
      
      expect(consoleWarnSpy).toHaveBeenCalledWith("[Component] 警告", "")
      expect(consoleErrorSpy).toHaveBeenCalledWith("[Component] 错误", "")
    })

    it("应该支持链式创建多个标签 logger", () => {
      const logger1 = logger.withTag("Module1")
      const logger2 = logger.withTag("Module2")
      
      logger1.warn("来自模块1")
      logger2.warn("来自模块2")
      
      expect(consoleWarnSpy).toHaveBeenCalledWith("[Module1] 来自模块1", "")
      expect(consoleWarnSpy).toHaveBeenCalledWith("[Module2] 来自模块2", "")
    })
  })

  describe("LogLevel 枚举", () => {
    it("应该导出所有日志级别", () => {
      expect(LogLevel.DEBUG).toBe("debug")
      expect(LogLevel.INFO).toBe("info")
      expect(LogLevel.WARN).toBe("warn")
      expect(LogLevel.ERROR).toBe("error")
    })
  })

  describe("边界情况", () => {
    it("warn 应该处理 null 数据（转为空字符串）", () => {
      logger.warn("消息", null)
      // logger 将 null 转为空字符串
      expect(consoleWarnSpy).toHaveBeenCalledWith("消息", "")
    })

    it("error 应该处理空字符串", () => {
      logger.error("")
      expect(consoleErrorSpy).toHaveBeenCalledWith("", "")
    })

    it("应该处理复杂对象", () => {
      const complexData = {
        nested: {
          array: [1, 2, 3],
          obj: { key: "value" },
        },
      }

      logger.warn("复杂数据", complexData)
      expect(consoleWarnSpy).toHaveBeenCalledWith("复杂数据", complexData)
    })
  })

  describe("isNetworkError", () => {
    it("应该识别 'Failed to fetch' 错误", () => {
      const error = new Error('Failed to fetch')
      expect(isNetworkError(error)).toBe(true)
    })

    it("应该识别包含 'Failed to fetch' 的错误字符串", () => {
      const error = new TypeError('Failed to fetch')
      expect(isNetworkError(error)).toBe(true)
    })

    it("应该识别 NetworkError", () => {
      const error = new Error('NetworkError: Connection lost')
      expect(isNetworkError(error)).toBe(true)
    })

    it("应该识别超时错误", () => {
      expect(isNetworkError(new Error('ETIMEDOUT'))).toBe(true)
      expect(isNetworkError(new Error('Request timeout'))).toBe(true)
      expect(isNetworkError(new Error('Gateway Timeout'))).toBe(true)
    })

    it("应该识别连接错误", () => {
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true)
      expect(isNetworkError(new Error('ECONNRESET'))).toBe(true)
      expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true)
    })

    it("应该识别服务不可用错误", () => {
      expect(isNetworkError(new Error('Service Unavailable'))).toBe(true)
      expect(isNetworkError(new Error('Too Many Requests'))).toBe(true)
    })

    it("应该识别 Chrome 网络错误", () => {
      expect(isNetworkError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(true)
      expect(isNetworkError(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(true)
    })

    it("应该识别字符串错误", () => {
      expect(isNetworkError('Failed to fetch')).toBe(true)
      expect(isNetworkError('Network request failed')).toBe(true)
    })

    it("不应该将其他错误识别为网络错误", () => {
      expect(isNetworkError(new Error('Syntax error'))).toBe(false)
      expect(isNetworkError(new Error('Undefined is not a function'))).toBe(false)
      expect(isNetworkError(new Error('Invalid JSON'))).toBe(false)
    })

    it("应该处理 null 和 undefined", () => {
      expect(isNetworkError(null)).toBe(false)
      expect(isNetworkError(undefined)).toBe(false)
    })
  })
})
