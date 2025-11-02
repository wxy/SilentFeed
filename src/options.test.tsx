import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import IndexOptions from "./options"

// Mock i18n
vi.mock("@/i18n", () => ({
  default: {
    changeLanguage: vi.fn(),
  },
}))

vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        "app.name": "Feed AI Muter",
        "app.shortName": "RSS 静音器",
        "options.title": "设置",
        "options.general.title": "常规设置",
        "options.general.language": "语言",
        "options.general.languageAuto": "跟随浏览器",
        "options.general.languageZh": "简体中文",
        "options.general.languageEn": "English",
        "options.general.theme": "主题",
        "options.general.themeAuto": "自动适配系统",
        "options.rss.title": "RSS 源管理",
        "options.rss.disabled": "将在完成 1000 页面后启用",
        "options.ai.title": "AI 配置",
        "options.ai.disabled": "将在完成 1000 页面后启用",
        "options.privacy.title": "数据与隐私",
        "options.privacy.disabled": "将在完成 1000 页面后启用",
      }
      return translations[key] || key
    },
  }),
}))

describe("IndexOptions 组件", () => {
  beforeEach(() => {
    // 清理 localStorage
    localStorage.clear()
  })

  describe("基本渲染", () => {
    it("应该正确渲染标题和副标题", () => {
      render(<IndexOptions />)

      expect(screen.getByText("Feed AI Muter")).toBeInTheDocument()
      expect(screen.getByText("设置")).toBeInTheDocument()
    })

    it("应该显示常规设置区域", () => {
      render(<IndexOptions />)

      expect(screen.getByText("常规设置")).toBeInTheDocument()
      expect(screen.getByText("语言")).toBeInTheDocument()
      expect(screen.getByText("主题")).toBeInTheDocument()
    })

    it("应该显示三个语言选项按钮", () => {
      render(<IndexOptions />)

      expect(screen.getByText("跟随浏览器")).toBeInTheDocument()
      expect(screen.getByText("简体中文")).toBeInTheDocument()
      expect(screen.getByText("English")).toBeInTheDocument()
    })

    it("应该显示预留的配置区域", () => {
      render(<IndexOptions />)

      expect(screen.getByText("RSS 源管理")).toBeInTheDocument()
      expect(screen.getByText("AI 配置")).toBeInTheDocument()
      expect(screen.getByText("数据与隐私")).toBeInTheDocument()
    })

    it("预留区域应该显示禁用提示", () => {
      render(<IndexOptions />)

      const disabledMessages = screen.getAllByText("将在完成 1000 页面后启用")
      expect(disabledMessages).toHaveLength(3)
    })
  })

  describe("语言切换功能", () => {
    it("默认应该选中跟随浏览器", () => {
      render(<IndexOptions />)

      const autoButton = screen.getByText("跟随浏览器")
      expect(autoButton.className).toContain("bg-green-500")
    })

    it("点击中文按钮应该切换语言", async () => {
      const user = userEvent.setup()
      const { default: i18n } = await import("@/i18n")

      render(<IndexOptions />)

      const zhButton = screen.getByText("简体中文")
      await user.click(zhButton)

      expect(i18n.changeLanguage).toHaveBeenCalledWith("zh-CN")
    })

    it("点击英文按钮应该切换语言", async () => {
      const user = userEvent.setup()
      const { default: i18n } = await import("@/i18n")

      render(<IndexOptions />)

      const enButton = screen.getByText("English")
      await user.click(enButton)

      expect(i18n.changeLanguage).toHaveBeenCalledWith("en")
    })

    it("点击跟随浏览器应该清除本地存储", async () => {
      const user = userEvent.setup()
      localStorage.setItem("i18nextLng", "zh-CN")

      render(<IndexOptions />)

      const autoButton = screen.getByText("跟随浏览器")
      await user.click(autoButton)

      expect(localStorage.getItem("i18nextLng")).toBeNull()
    })

    it("localStorage 有语言设置时应该显示对应的选中状态", () => {
      localStorage.setItem("i18nextLng", "zh-CN")

      render(<IndexOptions />)

      const zhButton = screen.getByText("简体中文")
      expect(zhButton.className).toContain("bg-green-500")
    })
  })

  describe("主题适配", () => {
    it("应该显示自动适配系统主题", () => {
      render(<IndexOptions />)

      expect(screen.getByText("自动适配系统")).toBeInTheDocument()
    })

    it("应该使用明暗主题样式类", () => {
      const { container } = render(<IndexOptions />)

      const mainDiv = container.firstChild as HTMLElement
      expect(mainDiv.className).toContain("bg-gray-50")
      expect(mainDiv.className).toContain("dark:bg-gray-900")
    })
  })

  describe("页面布局", () => {
    it("应该有页脚信息", () => {
      render(<IndexOptions />)

      const footer = screen.getByText((content, element) => {
        return (
          element?.tagName === "P" &&
          content.includes("Feed AI Muter") &&
          content.includes("RSS 静音器")
        )
      })
      expect(footer).toBeInTheDocument()
    })

    it("预留区域应该有半透明效果", () => {
      const { container } = render(<IndexOptions />)

      // 找到所有 section 元素
      const sections = container.querySelectorAll("section")
      
      // 后三个是预留区域，应该有 opacity-50
      const rssSection = sections[1]
      const aiSection = sections[2]
      const privacySection = sections[3]

      expect(rssSection.className).toContain("opacity-50")
      expect(aiSection.className).toContain("opacity-50")
      expect(privacySection.className).toContain("opacity-50")
    })
  })
})
