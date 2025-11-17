import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import IndexPopup from "./popup"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, options?: any) => {
      // 简单的测试翻译函数，直接返回 key 的最后一部分
      const translations: Record<string, (options?: any) => string> = {
        "app.name": () => "Feed AI Muter",
        "app.shortName": () => "RSS 静音器",
        "popup.welcome": () => "欢迎使用智能 RSS 阅读器",
        "popup.learning": () => "正在学习你的兴趣...",
        "popup.progress": (opt) =>
          `${opt?.current || 0}/${opt?.total || LEARNING_COMPLETE_PAGES} 页`,
        "popup.stage.explorer": () => "探索者阶段",
        "popup.stage.learner": () => "学习者阶段",
        "popup.stage.grower": () => "成长者阶段",
        "popup.stage.master": () => "大师阶段",
        "popup.hint": () => "开始浏览，我会自动学习你的兴趣",
        "popup.settings": () => "设置"
      }
      const fn = translations[key]
      return fn ? fn(options) : key
    }
  })
}))

describe("IndexPopup 组件", () => {
  beforeEach(() => {
    // Mock chrome.runtime.openOptionsPage
    global.chrome = {
      ...global.chrome,
      runtime: {
        ...global.chrome.runtime,
        openOptionsPage: vi.fn()
      }
    } as any
  })

  it("应该正确渲染基本信息", async () => {
    render(<IndexPopup />)

    // 等待加载完成
    await waitFor(() => {
      expect(screen.queryByText("⏳")).not.toBeInTheDocument()
    })

    // 检查标题
    await waitFor(() => {
      expect(screen.getByText("Feed AI Muter")).toBeInTheDocument()
    })
    expect(screen.getByText("RSS 静音器")).toBeInTheDocument()

    // 检查欢迎信息
    expect(screen.getByText("欢迎使用智能 RSS 阅读器")).toBeInTheDocument()
    expect(screen.getByText("正在学习你的兴趣...")).toBeInTheDocument()
  })

  it("应该显示初始化进度 0/100", async () => {
    render(<IndexPopup />)

    // 等待加载完成
    // Phase 6: 临时改为 100 页阈值
    await waitFor(() => {
      const expected = `0/${LEARNING_COMPLETE_PAGES} 页`
      expect(screen.getByText(expected)).toBeInTheDocument()
    })
  })

  it("应该显示探索者阶段（🌱）当页面数 < 250", async () => {
    render(<IndexPopup />)

    // 等待加载完成
    await waitFor(() => {
      // 检查阶段名称
      expect(screen.getByText(/探索者阶段/)).toBeInTheDocument()
    })

    // 检查图标（通过 emoji）
    const container = screen.getByText("🌱")
    expect(container).toBeInTheDocument()
  })

  it("应该显示提示信息", async () => {
    render(<IndexPopup />)

    // 等待加载完成
    await waitFor(() => {
      expect(
        screen.getByText("开始浏览，我会自动学习你的兴趣")
      ).toBeInTheDocument()
    })
  })

  it("点击设置按钮应该打开设置页面", async () => {
    const user = userEvent.setup()
    render(<IndexPopup />)

    // 等待组件加载
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /设置/i })).toBeInTheDocument()
    })

    const settingsButton = screen.getByRole("button", { name: /设置/i })
    await user.click(settingsButton)

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled()
  })

  it("进度条应该显示正确的宽度", async () => {
    render(<IndexPopup />)

    // 等待加载完成
    await waitFor(() => {
      const progressBar = document.querySelector(".sketchy-progress-bar, .bg-green-500")
      expect(progressBar).toBeInTheDocument()
    })

    // 初始状态进度应该是 0%
    const progressBar = document.querySelector(
      ".sketchy-progress-bar, .bg-green-500"
    ) as HTMLElement
    expect(progressBar.style.width).toBe("0%")
  })
})
