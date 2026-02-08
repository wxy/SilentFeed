/**
 * UI 配置存储测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  getSystemTheme,
  watchSystemTheme,
} from "./ui-config"

describe("ui-config", () => {
  beforeEach(() => {
    // 清理 storage
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("getSystemTheme", () => {
    it("应该根据系统设置返回主题", () => {
      // Mock window.matchMedia
      const matchMediaMock = vi.fn()

      // 测试暗色系统主题
      matchMediaMock.mockReturnValue({ matches: true })
      global.window.matchMedia = matchMediaMock

      let theme = getSystemTheme()
      expect(theme).toBe("dark")

      // 测试亮色系统主题
      matchMediaMock.mockReturnValue({ matches: false })

      theme = getSystemTheme()
      expect(theme).toBe("light")
    })

    it("应该在没有 matchMedia 时返回 light", () => {
      const originalMatchMedia = global.window.matchMedia
      // @ts-expect-error - 测试环境模拟
      delete global.window.matchMedia

      const theme = getSystemTheme()
      expect(theme).toBe("light")

      global.window.matchMedia = originalMatchMedia
    })
  })

  describe("watchSystemTheme", () => {
    it("应该注册系统主题变化监听器", () => {
      const addListenerMock = vi.fn()
      const matchMediaMock = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: addListenerMock,
        removeEventListener: vi.fn(),
      })
      global.window.matchMedia = matchMediaMock

      const callback = vi.fn()
      watchSystemTheme(callback)

      expect(matchMediaMock).toHaveBeenCalledWith("(prefers-color-scheme: dark)")
      expect(addListenerMock).toHaveBeenCalledWith("change", expect.any(Function))
    })

    it("应该在系统主题变化时调用回调", () => {
      const callback = vi.fn()
      let changeListener: any = null

      const addListenerMock = vi.fn((event, listener) => {
        if (event === "change") {
          changeListener = listener
        }
      })

      const matchMediaMock = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: addListenerMock,
        removeEventListener: vi.fn(),
      })
      global.window.matchMedia = matchMediaMock

      watchSystemTheme(callback)

      // 模拟系统主题变化到暗色
      changeListener({ matches: true })
      expect(callback).toHaveBeenCalledWith(true)

      // 模拟系统主题变化到亮色
      changeListener({ matches: false })
      expect(callback).toHaveBeenCalledWith(false)
    })

    it("应该返回取消监听的函数", () => {
      const removeListenerMock = vi.fn()
      const matchMediaMock = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: removeListenerMock,
      })
      global.window.matchMedia = matchMediaMock

      const callback = vi.fn()
      const unwatch = watchSystemTheme(callback)

      expect(typeof unwatch).toBe("function")

      unwatch()

      expect(removeListenerMock).toHaveBeenCalledWith("change", expect.any(Function))
    })

    it("应该在不支持 matchMedia 时返回空函数", () => {
      const originalMatchMedia = global.window.matchMedia
      // @ts-expect-error - 测试环境模拟
      delete global.window.matchMedia

      const callback = vi.fn()
      const unwatch = watchSystemTheme(callback)

      expect(typeof unwatch).toBe("function")
      unwatch() // 不应该抛出错误

      global.window.matchMedia = originalMatchMedia
    })
  })
})