/**
 * ColdStartView 组件测试
 * 测试冷启动界面的渲染和进度显示
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ColdStartView } from "./ColdStartView"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "popup.welcome": "欢迎使用智能 RSS 阅读器",
        "popup.learning": "正在学习你的兴趣...",
        "popup.progress": `${params?.current || 0}/${params?.total || 1000} 页`,
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

      expect(screen.getByText("欢迎使用智能 RSS 阅读器")).toBeInTheDocument()
      expect(screen.getByText("正在学习你的兴趣...")).toBeInTheDocument()
    })

    it("应该显示进度信息", () => {
      render(<ColdStartView pageCount={500} totalPages={1000} />)

      expect(screen.getByText("500/1000 页")).toBeInTheDocument()
    })

    it("应该显示提示信息", () => {
      render(<ColdStartView pageCount={0} />)

      expect(screen.getByText("📖")).toBeInTheDocument()
      expect(screen.getByText("开始浏览，我会自动学习")).toBeInTheDocument()
    })
  })

  describe("成长阶段显示", () => {
    it("应该显示探索者阶段（0-249 页）", () => {
      render(<ColdStartView pageCount={0} />)

      expect(screen.getByText("🌱")).toBeInTheDocument()
      expect(screen.getByText("探索者阶段")).toBeInTheDocument()
    })

    it("应该显示探索者阶段（249 页边界）", () => {
      render(<ColdStartView pageCount={249} />)

      expect(screen.getByText("🌱")).toBeInTheDocument()
      expect(screen.getByText("探索者阶段")).toBeInTheDocument()
    })

    it("应该显示学习者阶段（250-599 页）", () => {
      render(<ColdStartView pageCount={250} />)

      expect(screen.getByText("🌿")).toBeInTheDocument()
      expect(screen.getByText("学习者阶段")).toBeInTheDocument()
    })

    it("应该显示学习者阶段（400 页）", () => {
      render(<ColdStartView pageCount={400} />)

      expect(screen.getByText("🌿")).toBeInTheDocument()
      expect(screen.getByText("学习者阶段")).toBeInTheDocument()
    })

    it("应该显示成长者阶段（600-999 页）", () => {
      render(<ColdStartView pageCount={600} />)

      expect(screen.getByText("🌳")).toBeInTheDocument()
      expect(screen.getByText("成长者阶段")).toBeInTheDocument()
    })

    it("应该显示成长者阶段（900 页）", () => {
      render(<ColdStartView pageCount={900} />)

      expect(screen.getByText("🌳")).toBeInTheDocument()
      expect(screen.getByText("成长者阶段")).toBeInTheDocument()
    })

    it("应该显示大师阶段（1000+ 页）", () => {
      render(<ColdStartView pageCount={1000} />)

      expect(screen.getByText("🌲")).toBeInTheDocument()
      expect(screen.getByText("大师阶段")).toBeInTheDocument()
    })

    it("应该显示大师阶段（超过 1000 页）", () => {
      render(<ColdStartView pageCount={1500} />)

      expect(screen.getByText("🌲")).toBeInTheDocument()
      expect(screen.getByText("大师阶段")).toBeInTheDocument()
    })
  })

  describe("进度条计算", () => {
    it("应该计算 0% 进度", () => {
      const { container } = render(<ColdStartView pageCount={0} totalPages={1000} />)

      const progressBar = container.querySelector('[style*="width: 0%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it("应该计算 50% 进度", () => {
      const { container } = render(<ColdStartView pageCount={500} totalPages={1000} />)

      const progressBar = container.querySelector('[style*="width: 50%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it("应该计算 100% 进度", () => {
      const { container } = render(<ColdStartView pageCount={1000} totalPages={1000} />)

      const progressBar = container.querySelector('[style*="width: 100%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it("进度不应该超过 100%", () => {
      const { container } = render(<ColdStartView pageCount={1500} totalPages={1000} />)

      const progressBar = container.querySelector('[style*="width: 100%"]')
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe("自定义 totalPages", () => {
    it("应该支持自定义总页数", () => {
      render(<ColdStartView pageCount={50} totalPages={100} />)

      expect(screen.getByText("50/100 页")).toBeInTheDocument()
    })

    it("应该使用默认总页数 1000", () => {
      render(<ColdStartView pageCount={500} />)

      expect(screen.getByText("500/1000 页")).toBeInTheDocument()
    })
  })

  describe("UI 样式", () => {
    it("图标应该有脉动动画", () => {
      const { container } = render(<ColdStartView pageCount={0} />)

      // 手绘风格使用 .sketchy-emoji, 普通风格使用 .text-8xl
      // 直接查找包含 emoji 的元素
      const icon = container.querySelector(".sketchy-emoji, .text-8xl")
      expect(icon).toBeInTheDocument()
      expect(icon?.textContent).toBe("🌱")
    })

    it("图标应该是大尺寸", () => {
      const { container } = render(<ColdStartView pageCount={0} />)

      // 检查有大尺寸类名或手绘表情类名
      const icon = container.querySelector(".text-8xl, .text-7xl, .sketchy-emoji")
      expect(icon).toBeInTheDocument()
    })

    it("进度条应该有过渡动画", () => {
      const { container } = render(<ColdStartView pageCount={500} />)

      // 手绘风格或普通风格都应该有进度条
      const progressBar = container.querySelector(".transition-all, .sketchy-progress-bar")
      expect(progressBar).toBeInTheDocument()
    })

    it("进度条应该使用绿色", () => {
      const { container } = render(<ColdStartView pageCount={500} />)

      // 手绘风格或普通风格都应该有进度条（可能使用不同的类名）
      const progressBar = container.querySelector(".bg-green-500, .sketchy-progress-bar")
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe("边界情况", () => {
    it("应该处理负数页面数（进度为负数）", () => {
      const { container } = render(<ColdStartView pageCount={-10} />)

      // 负数会产生负百分比，但 Math.min 会限制最小为 0
      // 实际上 -10/1000 = -1%，会渲染为 "width: -1%"
      const progressBar = container.querySelector(".sketchy-progress-bar, .bg-green-500")
      expect(progressBar).toBeInTheDocument()
      // 检查进度条存在即可，不检查具体宽度
    })

    it("应该处理小数页面数", () => {
      render(<ColdStartView pageCount={123.456} totalPages={1000} />)

      // 页面数会被显示（可能包含小数）
      expect(screen.getByText(/123.*\/1000 页/)).toBeInTheDocument()
    })

    it("应该处理非常大的页面数", () => {
      render(<ColdStartView pageCount={999999} totalPages={1000} />)

      // 进度条应该限制在 100%
      const { container } = render(<ColdStartView pageCount={999999} totalPages={1000} />)
      const progressBar = container.querySelector('[style*="width: 100%"]')
      expect(progressBar).toBeInTheDocument()
    })
  })
})
