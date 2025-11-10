/**
 * UI 风格配置存储测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getUIStyle, setUIStyle, watchUIStyle, type UIStyle } from "./ui-config"

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

    it("应该返回存储的 sketchy 值", async () => {
      vi.spyOn(chrome.storage.sync, "get").mockImplementation(() =>
        Promise.resolve({
          ui_style: "sketchy",
        })
      )

      const style = await getUIStyle()

      expect(style).toBe("sketchy")
    })

    it("应该返回存储的 normal 值", async () => {
      vi.spyOn(chrome.storage.sync, "get").mockImplementation(() =>
        Promise.resolve({
          ui_style: "normal",
        })
      )

      const style = await getUIStyle()

      expect(style).toBe("normal")
    })
  })

  describe("setUIStyle", () => {
    it("应该保存 sketchy 风格", async () => {
      const setSpy = vi.spyOn(chrome.storage.sync, "set").mockImplementation(() => Promise.resolve())
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      await setUIStyle("sketchy")

      expect(setSpy).toHaveBeenCalledWith({ ui_style: "sketchy" })
      expect(consoleSpy).toHaveBeenCalledWith("[UI Config] UI 风格已设置为: sketchy")
    })

    it("应该保存 normal 风格", async () => {
      const setSpy = vi.spyOn(chrome.storage.sync, "set").mockImplementation(() => Promise.resolve())
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      await setUIStyle("normal")

      expect(setSpy).toHaveBeenCalledWith({ ui_style: "normal" })
      expect(consoleSpy).toHaveBeenCalledWith("[UI Config] UI 风格已设置为: normal")
    })

    it("应该处理存储失败的情况", async () => {
      const error = new Error("Storage error")
      vi.spyOn(chrome.storage.sync, "set").mockImplementation(() => Promise.reject(error))

      await expect(setUIStyle("sketchy")).rejects.toThrow("Storage error")
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

    it("应该在 ui_style 变化时调用回调", () => {
      const callback = vi.fn()
      let registeredListener: any = null

      // 捕获注册的监听器
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

    it("应该忽略其他键的变化", () => {
      const callback = vi.fn()
      let registeredListener: any = null

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      watchUIStyle(callback)

      // 模拟其他键的变化
      const changes = {
        other_key: {
          newValue: "value",
          oldValue: "old_value",
        },
      }

      registeredListener(changes)

      expect(callback).not.toHaveBeenCalled()
    })

    it("应该返回取消监听的函数", () => {
      const removeListenerSpy = vi.spyOn(chrome.storage.onChanged, "removeListener")
      let registeredListener: any = null

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      const callback = vi.fn()
      const unwatch = watchUIStyle(callback)

      // 调用取消监听函数
      unwatch()

      expect(removeListenerSpy).toHaveBeenCalledWith(registeredListener)
    })

    it("应该支持多个监听器同时工作", () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      let listener1: any = null
      let listener2: any = null

      const addListenerMock = vi.spyOn(chrome.storage.onChanged, "addListener")
      addListenerMock.mockImplementationOnce((listener) => {
        listener1 = listener
      })
      addListenerMock.mockImplementationOnce((listener) => {
        listener2 = listener
      })

      watchUIStyle(callback1)
      watchUIStyle(callback2)

      // 模拟变化
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
  })

  describe("集成测试", () => {
    it("应该支持完整的设置-获取流程", async () => {
      const storage: Record<string, any> = {}

      vi.spyOn(chrome.storage.sync, "get").mockImplementation(async (key) => {
        return { [key as string]: storage[key as string] }
      })

      vi.spyOn(chrome.storage.sync, "set").mockImplementation(async (items) => {
        Object.assign(storage, items)
        return Promise.resolve()
      })

      // 初始状态应该是默认值
      const initialStyle = await getUIStyle()
      expect(initialStyle).toBe("sketchy")

      // 设置为 normal
      await setUIStyle("normal")
      storage.ui_style = "normal"

      const style1 = await getUIStyle()
      expect(style1).toBe("normal")

      // 设置回 sketchy
      await setUIStyle("sketchy")
      storage.ui_style = "sketchy"

      const style2 = await getUIStyle()
      expect(style2).toBe("sketchy")
    })

    it("应该支持监听-设置-触发流程", async () => {
      const callback = vi.fn()
      let registeredListener: any = null

      vi.spyOn(chrome.storage.onChanged, "addListener").mockImplementation((listener) => {
        registeredListener = listener
      })

      vi.spyOn(chrome.storage.sync, "set").mockImplementation(async (items) => {
        // 模拟设置后触发 onChanged
        if (items.ui_style) {
          registeredListener({
            ui_style: {
              newValue: items.ui_style,
              oldValue: "sketchy",
            },
          })
        }
        return Promise.resolve()
      })

      // 注册监听
      watchUIStyle(callback)

      // 设置新值
      await setUIStyle("normal")

      // 验证回调被调用
      expect(callback).toHaveBeenCalledWith("normal")
    })
  })

  describe("类型安全", () => {
    it("应该只接受有效的 UIStyle 类型", async () => {
      const validStyles: UIStyle[] = ["sketchy", "normal"]

      for (const style of validStyles) {
        vi.spyOn(chrome.storage.sync, "set").mockImplementation(() => Promise.resolve())
        vi.spyOn(console, "log").mockImplementation(() => {})

        await expect(setUIStyle(style)).resolves.toBeUndefined()
      }
    })
  })
})
