import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import IndexOptions from "./options"

// Mock RSSSettings 组件
vi.mock("@/components/settings/RSSSettings", () => ({
  RSSSettings: () => <div>RSS Manager Loaded</div>
}))

// Mock i18n
vi.mock("@/i18n", () => ({
  default: {
    changeLanguage: vi.fn(),
  },
}))

vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "app.name": "Silent Feed",
        "app.shortName": "Silent Feed",
        "options.title": "设置",
        // Phase 10: 新标签名称（使用新的 kebab-case 格式）
        "options.tabs.preferences": "偏好",
        "options.tabs.feeds": "订阅源",
        "options.tabs.ai-engine": "AI 引擎",
        "options.tabs.analysis": "分析配置",
        "options.tabs.profile": "用户画像",
        "options.tabs.data": "采集统计",
        // 旧标签名称（向后兼容）
        "options.tabs.general": "常规",
        "options.tabs.rss": "RSS 源",
        "options.tabs.ai": "AI",
        "options.tabs.aiEngine": "AI 引擎",
        "options.tabs.recommendations": "推荐系统",
        "options.tabs.myData": "我的数据",
        "options.general.title": "常规设置",
        "options.general.preferencesTitle": "偏好设置",
        "options.general.language": "语言",
        "options.general.languageAuto": "跟随浏览器",
        "options.general.languageZh": "简体中文",
        "options.general.languageEn": "English",
        "options.general.languageDescription": "选择界面显示语言",
        "options.general.notifications": "通知设置",
        "options.rss.title": "RSS 源管理",
        "options.rss.description": "管理你的 RSS 订阅源",
        "options.rss.disabled": "将在完成 100 页面后启用",
        "options.ai.title": "AI 配置",
        "options.ai.description": "配置 AI 推荐引擎",
        "options.ai.disabled": "将在完成 100 页面后启用",
        "options.recommendations.title": "推荐效果统计",
        "options.data.title": "数据管理",
      }
      return translations[key] || key
    },
  }),
}))

// Mock recommendation store
vi.mock("@/stores/recommendationStore", () => ({
  useRecommendationStore: () => ({
    stats: {
      totalCount: 0,
      readCount: 0,
      unreadCount: 0,
      readRate: 0,
    },
    isLoading: false,
    error: null,
    fetchStats: vi.fn(),
  }),
}))

describe("IndexOptions 组件", () => {
  beforeEach(() => {
    localStorage.clear()
    // 重置 URL 参数，确保默认状态
    window.history.replaceState({}, '', window.location.pathname)
  })

  describe("基本渲染", () => {
    it("应该正确渲染标题", () => {
      render(<IndexOptions />)
      expect(screen.getByText("Silent Feed")).toBeInTheDocument()
      expect(screen.getByText("设置")).toBeInTheDocument()
    })

    it("应该显示五个标签按钮", () => {
      render(<IndexOptions />)
      // Phase 8: 新标签名称
      expect(screen.getByText("偏好")).toBeInTheDocument()
      expect(screen.getByText("订阅源")).toBeInTheDocument()
      expect(screen.getByText("AI 引擎")).toBeInTheDocument()
      expect(screen.getByText("分析配置")).toBeInTheDocument()
      expect(screen.getByText("用户画像")).toBeInTheDocument()
      expect(screen.getByText("采集统计")).toBeInTheDocument()
    })

    it("默认应该显示偏好设置页面", () => {
      render(<IndexOptions />)
      expect(screen.getByText("偏好设置")).toBeInTheDocument()
      expect(screen.getByText("选择界面显示语言")).toBeInTheDocument()
    })

    it("应该显示语言下拉框", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      const select = screen.getByLabelText("语言")
      expect(select).toBeInTheDocument()
      expect(select.tagName).toBe("SELECT")
    })
  })

  describe("标签切换", () => {
    it("点击订阅源标签应该切换到订阅源页面", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)

      // Phase 8: "RSS 源" → "订阅源"
      const feedsTab = screen.getByText("订阅源")
      await user.click(feedsTab)

      // RSS Manager 已被 mock，检查 mock 组件是否渲染
      expect(screen.getByText("RSS Manager Loaded")).toBeInTheDocument()
    })

    it("点击 AI 引擎标签应该切换到 AI 引擎页面", async () => {
      const user = userEvent.setup()
      const { container } = render(<IndexOptions />)

      // Phase 8: "AI" → "AI 引擎"
      const aiTab = screen.getByText("AI 引擎")
      await user.click(aiTab)

      // 验证 AI 标签已激活 (通过 URL 或 DOM 变化确认切换成功)
      await waitFor(() => {
        // AIConfig 组件会渲染一个包含配置表单的 div
        const configDivs = container.querySelectorAll('.space-y-6')
        expect(configDivs.length).toBeGreaterThan(0)
      })
    })

    it("点击采集统计标签应该切换到采集统计页面", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)

      // Phase 10: "我的数据" → "采集统计" （恢复到实际翻译）
      const dataTab = screen.getByText("采集统计")
      await user.click(dataTab)

      // Phase 6: CollectionStats 组件不再显示标题，检查组件已渲染
      // 通过查找该组件独有的元素来验证
      await waitFor(() => {
        expect(screen.queryByText("偏好设置")).not.toBeInTheDocument()
      })
    })

    it("切换标签后偏好设置应该消失", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)

      // Phase 8: 先切换到偏好标签，确保它是激活状态
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      expect(screen.getByText("偏好设置")).toBeInTheDocument()

      // Phase 8: 然后切换到订阅源标签
      const feedsTab = screen.getByText("订阅源")
      await user.click(feedsTab)

      expect(screen.queryByText("偏好设置")).not.toBeInTheDocument()
    })

    it("激活的标签应该有不同的样式", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)

      // Phase 8: 使用新标签名
      const preferencesTab = screen.getByText("偏好")
      const feedsTab = screen.getByText("订阅源")

      // 先点击偏好标签确保激活
      await user.click(preferencesTab)
      
      // Phase 8: 偏好标签应该是激活状态（渐变色样式）
      expect(preferencesTab.closest("button")?.className).toContain("from-indigo")

      // Phase 8: 点击订阅源标签
      await user.click(feedsTab)

      // Phase 8: 订阅源标签应该变为激活状态，偏好标签应该不再激活
      expect(feedsTab.closest("button")?.className).toContain("from-indigo")
      expect(preferencesTab.closest("button")?.className).not.toContain("from-indigo")
    })
  })

  describe("语言选择功能", () => {
    it("默认应该选中跟随浏览器", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      const select = screen.getByLabelText("语言") as HTMLSelectElement
      expect(select.value).toBe("auto")
    })

    it("应该显示三个语言选项", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      // 通过 labelText 获取语言 select
      const languageSelect = screen.getByLabelText("语言")
      const options = Array.from(languageSelect.querySelectorAll("option"))
      expect(options).toHaveLength(3)
      expect(options[0]).toHaveTextContent("跟随浏览器")
      expect(options[1]).toHaveTextContent("简体中文")
      expect(options[2]).toHaveTextContent("English")
    })

    it("选择中文应该调用 changeLanguage", async () => {
      const user = userEvent.setup()
      const { default: i18n } = await import("@/i18n")

      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      const select = screen.getByLabelText("语言")

      await user.selectOptions(select, "zh-CN")

      expect(i18n.changeLanguage).toHaveBeenCalledWith("zh-CN")
    })

    it("选择英文应该调用 changeLanguage", async () => {
      const user = userEvent.setup()
      const { default: i18n } = await import("@/i18n")

      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      const select = screen.getByLabelText("语言")

      await user.selectOptions(select, "en")

      expect(i18n.changeLanguage).toHaveBeenCalledWith("en")
    })

    it("选择跟随浏览器应该清除 localStorage", async () => {
      const user = userEvent.setup()
      localStorage.setItem("i18nextLng", "zh-CN")

      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      const select = screen.getByLabelText("语言")

      await user.selectOptions(select, "auto")

      expect(localStorage.getItem("i18nextLng")).toBeNull()
    })

    it("localStorage 有语言设置时应该显示对应值", async () => {
      const user = userEvent.setup()
      localStorage.setItem("i18nextLng", "zh-CN")

      render(<IndexOptions />)
      
      // Phase 8: 确保在偏好标签页
      const preferencesTab = screen.getByText("偏好")
      await user.click(preferencesTab)
      
      const select = screen.getByLabelText("语言") as HTMLSelectElement

      expect(select.value).toBe("zh-CN")
    })
  })

  describe("预留区域", () => {
    it("订阅源页面应该显示 RSS 管理器", async () => {
      const user = userEvent.setup()
      render(<IndexOptions />)

      // Phase 8: "RSS 源" → "订阅源"
      await user.click(screen.getByText("订阅源"))

      // RSS Manager 已被 mock
      expect(screen.getByText("RSS Manager Loaded")).toBeInTheDocument()
    })

    it("AI 引擎页面应该显示配置说明", async () => {
      const user = userEvent.setup()
      const { container } = render(<IndexOptions />)

      // Phase 8: "AI" → "AI 引擎"
      await user.click(screen.getByText("AI 引擎"))

      // 验证 AI 页面已加载 (检查容器变化)
      await waitFor(() => {
        const configDivs = container.querySelectorAll('.space-y-6')
        expect(configDivs.length).toBeGreaterThan(0)
      })
    })
  })

  describe("页面布局", () => {
    it("应该有页脚信息", () => {
      render(<IndexOptions />)
      const footer = screen.getByText((content, element) => {
        return (
          element?.tagName === "P" &&
          content.includes("Silent Feed")
        )
      })
      expect(footer).toBeInTheDocument()
    })

    it("应该有左侧导航栏", () => {
      const { container } = render(<IndexOptions />)
      const nav = container.querySelector("nav")
      expect(nav).toBeInTheDocument()
      expect(nav?.className).toContain("w-48")
    })

    it("应该使用明暗主题样式类", () => {
      const { container } = render(<IndexOptions />)
      const mainDiv = container.firstChild as HTMLElement
      // 手绘风格使用不同的类名
      expect(mainDiv.className).toContain("sketchy-container")
      expect(mainDiv.className).toContain("dark:text-gray-100")
    })
  })
})
