import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import IndexPopup, { getGrowthStage } from "./popup"

describe("getGrowthStage 函数", () => {
  it("当页面数 < 250 时应该返回探索者", () => {
    expect(getGrowthStage(0)).toEqual({ icon: "🌱", name: "探索者" })
    expect(getGrowthStage(100)).toEqual({ icon: "🌱", name: "探索者" })
    expect(getGrowthStage(249)).toEqual({ icon: "🌱", name: "探索者" })
  })

  it("当页面数 250-599 时应该返回学习者", () => {
    expect(getGrowthStage(250)).toEqual({ icon: "🌿", name: "学习者" })
    expect(getGrowthStage(400)).toEqual({ icon: "🌿", name: "学习者" })
    expect(getGrowthStage(599)).toEqual({ icon: "🌿", name: "学习者" })
  })

  it("当页面数 600-999 时应该返回成长者", () => {
    expect(getGrowthStage(600)).toEqual({ icon: "🌳", name: "成长者" })
    expect(getGrowthStage(800)).toEqual({ icon: "🌳", name: "成长者" })
    expect(getGrowthStage(999)).toEqual({ icon: "🌳", name: "成长者" })
  })

  it("当页面数 >= 1000 时应该返回大师", () => {
    expect(getGrowthStage(1000)).toEqual({ icon: "🌲", name: "大师" })
    expect(getGrowthStage(1500)).toEqual({ icon: "🌲", name: "大师" })
    expect(getGrowthStage(2000)).toEqual({ icon: "🌲", name: "大师" })
  })
})

describe("IndexPopup 组件", () => {
  beforeEach(() => {
    // Mock chrome.runtime.openOptionsPage
    global.chrome = {
      runtime: {
        openOptionsPage: vi.fn()
      }
    } as any
  })

  it("应该正确渲染基本信息", () => {
    render(<IndexPopup />)

    // 检查标题
    expect(screen.getByText("Feed AI Muter")).toBeInTheDocument()
    expect(screen.getByText("RSS 静音器")).toBeInTheDocument()

    // 检查欢迎信息
    expect(screen.getByText("欢迎使用智能 RSS 阅读器")).toBeInTheDocument()
    expect(screen.getByText("正在学习你的兴趣...")).toBeInTheDocument()
  })

  it("应该显示初始化进度 0/1000", () => {
    render(<IndexPopup />)

    expect(screen.getByText(/0\/1000 页/)).toBeInTheDocument()
  })

  it("应该显示探索者阶段（🌱）当页面数 < 250", () => {
    render(<IndexPopup />)

    // 检查阶段名称
    expect(screen.getByText(/探索者阶段/)).toBeInTheDocument()

    // 检查图标（通过 emoji）
    const container = screen.getByText("🌱")
    expect(container).toBeInTheDocument()
  })

  it("应该显示提示信息", () => {
    render(<IndexPopup />)

    expect(
      screen.getByText("开始浏览，我会自动学习你的兴趣")
    ).toBeInTheDocument()
  })

  it("点击设置按钮应该打开设置页面", async () => {
    const user = userEvent.setup()
    render(<IndexPopup />)

    const settingsButton = screen.getByRole("button", { name: "设置" })
    await user.click(settingsButton)

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled()
  })

  it("进度条应该显示正确的宽度", () => {
    render(<IndexPopup />)

    // 初始状态进度应该是 0%
    const progressBar = document.querySelector(
      ".bg-green-500"
    ) as HTMLElement
    expect(progressBar).toBeInTheDocument()
    expect(progressBar.style.width).toBe("0%")
  })
})
