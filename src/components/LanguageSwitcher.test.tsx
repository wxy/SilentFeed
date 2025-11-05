/**
 * LanguageSwitcher 组件测试
 * 测试语言切换功能
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LanguageSwitcher } from "./LanguageSwitcher"

// Mock i18n
const mockChangeLanguage = vi.fn()
const mockI18n = {
  language: "zh-CN",
  changeLanguage: mockChangeLanguage,
}

vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        "common.selectLanguage": "选择语言",
      }
      return translations[key] || key
    },
    i18n: mockI18n,
  }),
}))

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
})

// Mock console.log
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

describe("LanguageSwitcher 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocalStorage.clear()
    mockI18n.language = "zh-CN"
  })

  describe("渲染", () => {
    it("应该渲染语言选择器", () => {
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox", { name: "选择语言" })
      expect(select).toBeInTheDocument()
    })

    it("应该显示所有语言选项", () => {
      render(<LanguageSwitcher />)

      expect(screen.getByText("简体中文")).toBeInTheDocument()
      expect(screen.getByText("English")).toBeInTheDocument()
    })

    it("应该显示当前选中的语言", () => {
      mockI18n.language = "zh-CN"
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox") as HTMLSelectElement
      expect(select.value).toBe("zh-CN")
    })

    it("应该支持英文默认语言", () => {
      mockI18n.language = "en"
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox") as HTMLSelectElement
      expect(select.value).toBe("en")
    })
  })

  describe("语言切换", () => {
    it("切换到英文时应该调用 changeLanguage", async () => {
      const user = userEvent.setup()
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "en")

      expect(mockChangeLanguage).toHaveBeenCalledWith("en")
    })

    it("切换到中文时应该调用 changeLanguage", async () => {
      const user = userEvent.setup()
      mockI18n.language = "en"
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "zh-CN")

      expect(mockChangeLanguage).toHaveBeenCalledWith("zh-CN")
    })

    it("应该保存语言选择到 localStorage", async () => {
      const user = userEvent.setup()
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "en")

      expect(mockLocalStorage.getItem("i18nextLng")).toBe("en")
    })

    it("应该输出切换日志", async () => {
      const user = userEvent.setup()
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      await user.selectOptions(select, "en")

      expect(consoleLogSpy).toHaveBeenCalledWith("切换语言到: en")
    })
  })

  describe("UI 样式", () => {
    it("应该有正确的样式类", () => {
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      expect(select).toHaveClass("px-3")
      expect(select).toHaveClass("py-1.5")
      expect(select).toHaveClass("rounded-md")
      expect(select).toHaveClass("border")
    })

    it("应该支持暗色主题", () => {
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      expect(select.className).toContain("dark:bg-gray-800")
      expect(select.className).toContain("dark:border-gray-600")
    })

    it("应该有焦点样式", () => {
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox")
      expect(select.className).toContain("focus:ring-2")
      expect(select.className).toContain("focus:ring-green-500")
    })
  })

  describe("可访问性", () => {
    it("应该有正确的 aria-label", () => {
      render(<LanguageSwitcher />)

      const select = screen.getByRole("combobox", { name: "选择语言" })
      expect(select).toHaveAttribute("aria-label", "选择语言")
    })

    it("每个选项应该有正确的 value", () => {
      render(<LanguageSwitcher />)

      const options = screen.getAllByRole("option")
      expect(options[0]).toHaveValue("zh-CN")
      expect(options[1]).toHaveValue("en")
    })
  })
})
