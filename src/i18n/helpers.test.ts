/**
 * i18n helpers 测试
 * 
 * 测试翻译辅助函数
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"

// Mock i18n instance (必须在 import 之前)
vi.mock("./index", () => ({
  default: {
    t: (key: string, options?: any) => {
      // Mock 翻译逻辑
      if (key === "popup.welcome") return "欢迎使用"
      if (key === "errors.networkError") return "网络错误"
      if (key === "test.withOptions") {
        return `Hello ${options?.name || "User"}`
      }
      return key
    },
    language: "zh-CN"
  }
}))

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      // Mock 翻译逻辑
      if (key === "popup.welcome") return "欢迎使用"
      if (key === "errors.networkError") return "网络错误"
      if (key === "test.withOptions") {
        return `Hello ${options?.name || "User"}`
      }
      return key
    },
    i18n: {
      language: "zh-CN",
      changeLanguage: vi.fn()
    }
  })
}))

// 在 mock 之后导入
import { useI18n, translate, _ } from "./helpers"

describe("i18n helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("useI18n", () => {
    it("应该返回翻译函数", () => {
      const { result } = renderHook(() => useI18n())

      expect(result.current._).toBeDefined()
      expect(typeof result.current._).toBe("function")
    })

    it("应该正确翻译文本", () => {
      const { result } = renderHook(() => useI18n())

      expect(result.current._("popup.welcome")).toBe("欢迎使用")
      expect(result.current._("errors.networkError")).toBe("网络错误")
    })

    it("应该支持翻译选项", () => {
      const { result } = renderHook(() => useI18n())

      expect(result.current._("test.withOptions", { name: "Alice" })).toBe("Hello Alice")
    })

    it("应该返回 i18n 实例", () => {
      const { result } = renderHook(() => useI18n())

      expect(result.current.i18n).toBeDefined()
      expect(result.current.i18n.language).toBe("zh-CN")
    })

    it("应该返回原始 t 函数", () => {
      const { result } = renderHook(() => useI18n())

      expect(result.current.t).toBeDefined()
      expect(typeof result.current.t).toBe("function")
    })

    it("_ 函数应该返回字符串类型", () => {
      const { result } = renderHook(() => useI18n())

      const translation = result.current._("popup.welcome")
      expect(typeof translation).toBe("string")
    })
  })

  describe("translate 函数", () => {
    it("应该在非 React 组件中正常工作", () => {
      expect(translate("popup.welcome")).toBe("欢迎使用")
      expect(translate("errors.networkError")).toBe("网络错误")
    })

    it("应该支持翻译选项", () => {
      expect(translate("test.withOptions", { name: "Bob" })).toBe("Hello Bob")
    })

    it("应该返回字符串类型", () => {
      const result = translate("popup.welcome")
      expect(typeof result).toBe("string")
    })

    it("未找到翻译时应该返回 key", () => {
      const result = translate("unknown.key")
      expect(result).toBe("unknown.key")
    })
  })

  describe("_ 别名", () => {
    it("应该是 translate 函数的别名", () => {
      expect(_).toBe(translate)
    })

    it("应该正常工作", () => {
      expect(_("popup.welcome")).toBe("欢迎使用")
      expect(_("errors.networkError")).toBe("网络错误")
    })

    it("应该支持翻译选项", () => {
      expect(_("test.withOptions", { name: "Charlie" })).toBe("Hello Charlie")
    })
  })
})

