/**
 * useTheme Hook 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useTheme } from "./useTheme"
import * as uiConfig from "@/storage/ui-config"

// Mock ui-config 模块
vi.mock("@/storage/ui-config", () => ({
  getSystemTheme: vi.fn(),
  watchSystemTheme: vi.fn(),
}))

describe("useTheme", () => {
  let mockUnwatchSystem: () => void

  beforeEach(() => {
    // 重置所有 mock
    vi.clearAllMocks()

    // 创建 unwatch 函数
    mockUnwatchSystem = vi.fn()

    // 默认 mock 实现
    vi.mocked(uiConfig.getSystemTheme).mockReturnValue("light")
    vi.mocked(uiConfig.watchSystemTheme).mockReturnValue(mockUnwatchSystem)

    // Mock document.documentElement
    document.documentElement.classList.remove("dark")
  })

  afterEach(() => {
    vi.clearAllMocks()
    document.documentElement.classList.remove("dark")
  })

  describe("初始化", () => {
    it("应该从系统获取初始主题", async () => {
      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("dark")

      const { result } = renderHook(() => useTheme())

      await waitFor(() => {
        expect(result.current.theme).toBe("dark")
      })

      expect(uiConfig.getSystemTheme).toHaveBeenCalled()
    })

    it("应该默认使用亮色主题", async () => {
      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("light")

      const { result } = renderHook(() => useTheme())

      await waitFor(() => {
        expect(result.current.theme).toBe("light")
      })
    })
  })

  describe("主题应用", () => {
    it("应该在暗色主题时添加 dark 类", async () => {
      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("dark")

      renderHook(() => useTheme())

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true)
      })
    })

    it("应该在亮色主题时移除 dark 类", async () => {
      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("light")

      // 先添加 dark 类
      document.documentElement.classList.add("dark")

      renderHook(() => useTheme())

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false)
      })
    })
  })

  describe("系统主题监听", () => {
    it("应该注册系统主题变化监听器", () => {
      renderHook(() => useTheme())

      expect(uiConfig.watchSystemTheme).toHaveBeenCalled()
    })

    it("应该在系统主题变化时更新主题", async () => {
      let systemThemeCallback: ((isDark: boolean) => void) | null = null

      vi.mocked(uiConfig.watchSystemTheme).mockImplementation((callback) => {
        systemThemeCallback = callback
        return mockUnwatchSystem
      })

      const { result } = renderHook(() => useTheme())

      // 模拟系统主题切换到暗色
      await waitFor(() => {
        expect(systemThemeCallback).not.toBeNull()
      })

      systemThemeCallback!(true)

      await waitFor(() => {
        expect(result.current.theme).toBe("dark")
        expect(result.current.isDark).toBe(true)
      })

      // 模拟系统主题切换到亮色
      systemThemeCallback!(false)

      await waitFor(() => {
        expect(result.current.theme).toBe("light")
        expect(result.current.isDark).toBe(false)
      })
    })
  })

  describe("清理", () => {
    it("应该在组件卸载时清理监听器", () => {
      const { unmount } = renderHook(() => useTheme())

      unmount()

      expect(mockUnwatchSystem).toHaveBeenCalled()
    })
  })

  describe("isDark 计算属性", () => {
    it("应该在暗色主题时返回 true", async () => {
      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("dark")

      const { result } = renderHook(() => useTheme())

      await waitFor(() => {
        expect(result.current.isDark).toBe(true)
      })
    })

    it("应该在亮色主题时返回 false", async () => {
      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("light")

      const { result } = renderHook(() => useTheme())

      await waitFor(() => {
        expect(result.current.isDark).toBe(false)
      })
    })
  })

  describe("DOM 更新", () => {
    it("应该在主题切换时正确更新 DOM", async () => {
      let systemThemeCallback: ((isDark: boolean) => void) | null = null

      vi.mocked(uiConfig.watchSystemTheme).mockImplementation((callback) => {
        systemThemeCallback = callback
        return mockUnwatchSystem
      })

      vi.mocked(uiConfig.getSystemTheme).mockReturnValue("light")

      renderHook(() => useTheme())

      // 初始应该是亮色（无 dark 类）
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false)
      })

      // 切换到暗色
      systemThemeCallback!(true)

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true)
      })

      // 切换回亮色
      systemThemeCallback!(false)

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false)
      })
    })
  })
})