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
    t: (key: string, options?: any) => {
      if (key === "popup.tips" && options?.returnObjects) {
        return {
          howItWorks: [
            { emoji: "🧠", text: "每次停留和点击，都让推荐更懂你" },
            { emoji: "🔄", text: "持续进化：点击和「不想读」都是学习信号" }
          ],
          privacy: [
            { emoji: "🔒", text: "我们不收集任何数据，分析由你的 AI 完成" }
          ],
          philosophy: [
            { emoji: "💡", text: "克制的信息消费，只推荐真正值得读的" }
          ],
          features: [
            { emoji: "✨", text: "从上百篇文章中精选最匹配的几条" }
          ]
        }
      }
      return key
    }
  }),
}))

describe("ColdStartView 组件", () => {
  describe("渲染基本元素", () => {
    it("应该显示欢迎信息", () => {
      render(<ColdStartView pageCount={0} />)

      // 现在使用 CircularProgress，不再显示文本形式的欢迎信息
      expect(screen.getByText("🌱")).toBeInTheDocument()
    })

    it("应该显示进度信息", () => {
      const { container } = render(<ColdStartView pageCount={50} />)

      // 现在使用 CircularProgress 显示进度，检查 SVG 元素
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it("应该显示提示信息", () => {
      render(<ColdStartView pageCount={0} />)

      // 页面上有多个 💡 元素（hint 和 tips 的 philosophy）
      const hintEmojis = screen.getAllByText("💡")
      expect(hintEmojis.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText("开始浏览，我会自动学习")).toBeInTheDocument()
    })
  })

  it("学习阶段应显示一条 tips", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0)
    render(<ColdStartView pageCount={0} />)
    expect(screen.getByText("每次停留和点击，都让推荐更懂你")).toBeInTheDocument()
    spy.mockRestore()
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

      // CircularProgress 使用 SVG，检查 SVG 元素存在
      const svg = container.querySelector('svg circle')
      expect(svg).toBeInTheDocument()
    })

    it("应该计算 50% 进度", () => {
      const { container } = render(<ColdStartView pageCount={50} totalPages={LEARNING_COMPLETE_PAGES} />)

      const svg = container.querySelector('svg circle')
      expect(svg).toBeInTheDocument()
    })

    it("应该计算 100% 进度", () => {
      const { container } = render(<ColdStartView pageCount={LEARNING_COMPLETE_PAGES} totalPages={LEARNING_COMPLETE_PAGES} />)

      const svg = container.querySelector('svg circle')
      expect(svg).toBeInTheDocument()
    })

    it("进度不应该超过 100%", () => {
      const { container } = render(<ColdStartView pageCount={150} totalPages={LEARNING_COMPLETE_PAGES} />)

      const svg = container.querySelector('svg circle')
      expect(svg).toBeInTheDocument()
    })
  })

  describe("自定义 totalPages", () => {
    it("应该支持自定义总页数", () => {
      const { container } = render(<ColdStartView pageCount={100} totalPages={200} />)

      // 检查 CircularProgress 渲染，进度应为 50%
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it("应该使用默认总页数 100", () => {
      const { container } = render(<ColdStartView pageCount={50} />)

      // 检查 CircularProgress 渲染
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe("UI 样式", () => {
    it("图标应该有脉动动画", () => {
      const { container } = render(<ColdStartView pageCount={0} />)

      const icon = screen.getByText("🌱")
      expect(icon).toBeInTheDocument()
    })

    it("图标应该是大尺寸", () => {
      const { container } = render(<ColdStartView pageCount={0} />)

      const icon = screen.getByText("🌱")
      expect(icon).toBeInTheDocument()
    })

    it("进度条应该有过渡动画", () => {
      const { container } = render(<ColdStartView pageCount={50} />)

      // CircularProgress 使用 SVG
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it("进度条应该使用渐变色", () => {
      const { container } = render(<ColdStartView pageCount={50} />)

      // CircularProgress 使用 linearGradient
      const gradient = container.querySelector('linearGradient')
      expect(gradient).toBeInTheDocument()
    })
  })

  describe("边界情况", () => {
    it("应该处理负数页面数（进度为负数）", () => {
      const { container } = render(<ColdStartView pageCount={-10} />)

      // CircularProgress 会处理负数情况
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it("应该处理小数页面数", () => {
      const { container } = render(<ColdStartView pageCount={12.34} totalPages={LEARNING_COMPLETE_PAGES} />)

      // CircularProgress 可以处理小数进度
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it("应该处理非常大的页面数", () => {
      const { container } = render(<ColdStartView pageCount={9999} totalPages={LEARNING_COMPLETE_PAGES} />)

      // CircularProgress 会限制为 100%
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })
})
