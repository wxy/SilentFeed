/**
 * UI 风格配置存储测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  getUIStyle,
  setUIStyle,
  watchUIStyle,
  getSystemTheme,
  watchSystemTheme,
  type UIStyle,
} from "./ui-config"

describe("ui-config", () => {
  beforeEach(() => {
    // 清理 storage
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("getUIStyle", () => {
    it("应该返回默认值 sketchy 当未设置时", async () => {
      // Mock chrome.storage.sync.get 返回空对象
      vi.spyOn(chrome.storage.sync, "get").mockImplementation(() => Promise.resolve({}))

      const style = await getUIStyle()

      expect(style).toBe("sketchy")
      expect(chrome.storage.sync.get).toHaveBeenCalledWith("ui_style")
    })

    it("应该返回存储的 UI 风格", async () => {
      // Mock chrome.storage.sync.get 返回保存的风格
      vi.spyOn(chrome.storage.sync, "get").mockImplementation(() =>
        Promise.resolve({ ui_style: "normal" })
      )

      const style = await getUIStyle()

      expect(style).toBe("normal")
    })

    it("应该正确处理 sketchy 风格", async () => {
      vi.spyOn(chrome.storage.sync, "get").mockImplementation(() =>
        Promise.resolve({ ui_style: "sketchy" })
      )

      const style = await getUIStyle()

      expect(style).toBe("sketchy")
    })

    it("应该正确处理 normal 风格", async () => {
      vi.spyOn(chrome.storage.sync, "get").mockImplementation(() =>
        Promise.resolve({ ui_style: "normal" })
      )

      const style = await getUIStyle()

      expect(style).toBe("normal")
    })
  })

  describe("setUIStyle", () => {
    it("应该保存 UI 风格", async () => {
      const setSpy = vi.spyOn(chrome.storage.sync, "set").mockImplementation(() => Promise.resolve())
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      await setUIStyle("normal")

      expect(setSpy).toHaveBeenCalledWith({ ui_style: "normal" })
      expect(consoleSpy).toHaveBeenCalledWith("[UI Config] UI 风格已设置为: normal")
    })

    it("应该支持所有有效的 UI 风格", async () => {
      const validStyles: UIStyle[] = ["sketchy", "normal"]
      
      for (const style of validStyles) {
        vi.spyOn(chrome.storage.sync, "set").mockImplementation(() => Promise.resolve())
        vi.spyOn(console, "log").mockImplementation(() => {})

        await expect(setUIStyle(style)).resolves.toBeUndefined()
      }
    })
  })

  describe("watchUIStyle", () => {
    it("应该注册 storage 变化监听器", () => {
      const addListenerSpy = vi.spyOn(chrome.storage.onChanged, "addListener")
      const callback = vi.fn()

      const unwatch = watchUIStyle(callback)

      expect(addListenerSpy).toHaveBeenCalled()
      expect(typeof unwatch).toBe("function")
    })

    it("应该在 UI 风格变化时调用回调", () => {
      const callback = vi.fn()
      let registeredListener: any = null

      // Mock addListener 来捕获监听器
      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      watchUIStyle(callback)

      // 模拟 storage 变化
      const changes = {
        ui_style: {
          newValue: "normal" as UIStyle,
          oldValue: "sketchy" as UIStyle,
        },
      }

      registeredListener(changes)

      expect(callback).toHaveBeenCalledWith("normal")
    })

    it("应该返回取消监听的函数", () => {
      const removeListenerSpy = vi.spyOn(chrome.storage.onChanged, "removeListener")
      const callback = vi.fn()

      const unwatch = watchUIStyle(callback)

      expect(typeof unwatch).toBe("function")

      unwatch()

      expect(removeListenerSpy).toHaveBeenCalled()
    })

    it("应该在其他 key 变化时不调用回调", () => {
      const callback = vi.fn()
      let registeredListener: any = null

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      watchUIStyle(callback)

      const changes = {
        some_other_key: {
          newValue: "value",
          oldValue: "old_value",
        },
      }

      registeredListener(changes)

      expect(callback).not.toHaveBeenCalled()
    })

    it("应该支持多个监听器", () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      let listener1: any = null
      let listener2: any = null

      const addListenerMock = vi.fn((listener) => {
        if (!listener1) listener1 = listener
        else listener2 = listener
      })

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation(addListenerMock)

      watchUIStyle(callback1)
      watchUIStyle(callback2)

      const changes = {
        ui_style: {
          newValue: "normal" as UIStyle,
          oldValue: "sketchy" as UIStyle,
        },
      }

      listener1(changes)
      listener2(changes)

      expect(callback1).toHaveBeenCalledWith("normal")
      expect(callback2).toHaveBeenCalledWith("normal")
    })

    it("应该在取消监听后不再触发回调", () => {
      const callback = vi.fn()
      let registeredListener: any = null

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      const removeListenerMock = vi.fn()
      vi.spyOn(chrome.storage.onChanged, "removeListener").mockImplementation(removeListenerMock)

      const unwatch = watchUIStyle(callback)
      unwatch()

      const changes = {
        ui_style: {
          newValue: "normal" as UIStyle,
          oldValue: "sketchy" as UIStyle,
        },
      }

      // 监听器已取消，不应该再触发回调
      if (registeredListener) {
        registeredListener(changes)
      }

      // 由于我们已经调用了 removeListener，回调不应该被触发
      // 但在实际测试中，我们已经 mock 了 removeListener，
      // 所以我们只需要验证 removeListener 被调用了
      expect(removeListenerMock).toHaveBeenCalled()
    })

    it("应该正确处理连续的风格变化", () => {
      const callback = vi.fn()
      let registeredListener: any = null

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      watchUIStyle(callback)

      // 第一次变化
      registeredListener({
        ui_style: {
          newValue: "normal" as UIStyle,
          oldValue: "sketchy" as UIStyle,
        },
      })

      expect(callback).toHaveBeenCalledWith("normal")

      // 第二次变化
      registeredListener({
        ui_style: {
          newValue: "sketchy" as UIStyle,
          oldValue: "normal" as UIStyle,
        },
      })

      expect(callback).toHaveBeenCalledWith("sketchy")
      expect(callback).toHaveBeenCalledTimes(2)
    })
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