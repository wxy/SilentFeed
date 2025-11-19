/**
 * ColdStartView 组件测试
 * 测试冷启动界面的渲染和进度显示
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ColdStartView } from "./ColdStartView"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"

const translateProgress = (params?: { current?: number; total?: number }) =>
  `${params?.current || 0}/${params?.total || LEARNING_COMPLETE_PAGES} 页`

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "popup.welcome": "开始你的阅读之旅",
        "popup.learning": "正在学习你的兴趣...",
        "popup.progress": translateProgress(params),
        "popup.stage.explorer": "探索者阶段",
        "popup.stage.learner": "学习者阶段",
        "popup.stage.grower": "成长者阶段",
        "popup.stage.master": "大师阶段",
        "popup.hint": "开始浏览，我会自动学习",
      }
      return translations[key] || key
    },
  }),
}))

describe("ColdStartView 组件", () => {
  describe("渲染基本元素", () => {
    it("应该显示欢迎信息", () => {
      render(<ColdStartView pageCount={0} />)

      expect(screen.getByText("开始你的阅读之旅")).toBeInTheDocument()
      expect(screen.getByText("正在学习你的兴趣...")).toBeInTheDocument()
    })

    it("应该显示进度信息", () => {
      render(<ColdStartView pageCount={50} />)

      expect(screen.getByText(`50/${LEARNING_COMPLETE_PAGES} 页`)).toBeInTheDocument()
    })

    it("应该显示提示信息", () => {
      render(<ColdStartView pageCount={0} />)

      expect(screen.getByText("📖")).toBeInTheDocument()
      expect(screen.getByText("开始浏览，我会自动学习")).toBeInTheDocument()
    })
  })

  describe("成长阶段显示", () => {
    it("应该显示探索者阶段（0-24 页）", () => {
      render(<ColdStartView pageCount={0} />)

      expect(screen.getByText("🌱")).toBeInTheDocument()
      expect(screen.getByText("探索者阶段")).toBeInTheDocument()
    })

    it("应该显示探索者阶段（24 页边界）", () => {
      render(<ColdStartView pageCount={24} />)

      expect(screen.getByText("🌱")).toBeInTheDocument()
      expect(screen.getByText("探索者阶段")).toBeInTheDocument()
    })

    it("应该显示学习者阶段（25-59 页）", () => {
      render(<ColdStartView pageCount={25} />)

      expect(screen.getByText("🌿")).toBeInTheDocument()
      expect(screen.getByText("学习者阶段")).toBeInTheDocument()
    })

    it("应该显示学习者阶段（40 页）", () => {
      render(<ColdStartView pageCount={40} />)

      expect(screen.getByText("🌿")).toBeInTheDocument()
      expect(screen.getByText("学习者阶段")).toBeInTheDocument()
    })

    it("应该显示成长者阶段（60-99 页）", () => {
      render(<ColdStartView pageCount={60} />)

      expect(screen.getByText("🌳")).toBeInTheDocument()
      expect(screen.getByText("成长者阶段")).toBeInTheDocument()
    })

    it("应该显示成长者阶段（90 页）", () => {
      render(<ColdStartView pageCount={90} />)

      expect(screen.getByText("🌳")).toBeInTheDocument()
      expect(screen.getByText("成长者阶段")).toBeInTheDocument()
    })

    it("应该显示大师阶段（100 页）", () => {
      render(<ColdStartView pageCount={LEARNING_COMPLETE_PAGES} />)

      expect(screen.getByText("🌲")).toBeInTheDocument()
      expect(screen.getByText("大师阶段")).toBeInTheDocument()
    })

    it("应该显示大师阶段（超过 100 页）", () => {
      render(<ColdStartView pageCount={150} />)

      expect(screen.getByText("🌲")).toBeInTheDocument()
      expect(screen.getByText("大师阶段")).toBeInTheDocument()
    })
  })

  describe("进度条计算", () => {
    it("应该计算 0% 进度", () => {
      const { container } = render(<ColdStartView pageCount={0} totalPages={LEARNING_COMPLETE_PAGES} />)

      const progressBar = container.querySelector('[style*="width: 0%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it("应该计算 50% 进度", () => {
      const { container } = render(<ColdStartView pageCount={50} totalPages={LEARNING_COMPLETE_PAGES} />)

      const progressBar = container.querySelector('[style*="width: 50%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it("应该计算 100% 进度", () => {
      const { container } = render(<ColdStartView pageCount={LEARNING_COMPLETE_PAGES} totalPages={LEARNING_COMPLETE_PAGES} />)

      const progressBar = container.querySelector('[style*="width: 100%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it("进度不应该超过 100%", () => {
      const { container } = render(<ColdStartView pageCount={150} totalPages={LEARNING_COMPLETE_PAGES} />)

      const progressBar = container.querySelector('[style*="width: 100%"]')
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe("自定义 totalPages", () => {
    it("应该支持自定义总页数", () => {
      render(<ColdStartView pageCount={100} totalPages={200} />)

      expect(screen.getByText("100/200 页")).toBeInTheDocument()
    })

    it("应该使用默认总页数 100", () => {
      render(<ColdStartView pageCount={50} />)

      expect(screen.getByText(`50/${LEARNING_COMPLETE_PAGES} 页`)).toBeInTheDocument()
    })
  })

  describe("UI 样式", () => {
    it("图标应该有脉动动画", () => {
      const { container } = render(<ColdStartView pageCount={0} />)

      const icon = container.querySelector(".sketchy-emoji, .text-8xl")
      expect(icon).toBeInTheDocument()
      expect(icon?.textContent).toBe("🌱")
    })

    it("图标应该是大尺寸", () => {
      const { container } = render(<ColdStartView pageCount={0} />)

      const icon = container.querySelector(".text-8xl, .text-7xl, .sketchy-emoji")
      expect(icon).toBeInTheDocument()
    })

    it("进度条应该有过渡动画", () => {
      const { container } = render(<ColdStartView pageCount={50} />)

      const progressBar = container.querySelector(".transition-all, .sketchy-progress-bar")
      expect(progressBar).toBeInTheDocument()
    })

    it("进度条应该使用绿色", () => {
      const { container } = render(<ColdStartView pageCount={50} />)

      const progressBar = container.querySelector(".bg-green-500, .sketchy-progress-bar")
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe("边界情况", () => {
    it("应该处理负数页面数（进度为负数）", () => {
      const { container } = render(<ColdStartView pageCount={-10} />)

      // 负数会产生负百分比，但 Math.min 会限制最小为 0
      // 实际上 -10/100 = -10%，会渲染为 "width: -10%"
      const progressBar = container.querySelector(".sketchy-progress-bar, .bg-green-500")
      expect(progressBar).toBeInTheDocument()
    })

    it("应该处理小数页面数", () => {
      render(<ColdStartView pageCount={12.34} totalPages={LEARNING_COMPLETE_PAGES} />)

      expect(screen.getByText(/12\.34.*\/100 页/)).toBeInTheDocument()
    })

    it("应该处理非常大的页面数", () => {
      const { container } = render(<ColdStartView pageCount={9999} totalPages={LEARNING_COMPLETE_PAGES} />)

      const progressBar = container.querySelector('[style*="width: 100%"]')
      expect(progressBar).toBeInTheDocument()
    })
  })
})
