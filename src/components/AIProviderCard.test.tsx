import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AIProviderCard } from "./AIProviderCard"
import type { AIProviderStatus } from "@/storage/ai-provider-status"
import i18n from "@/i18n"

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
    withTag: vi.fn(() => ({
      debug: vi.fn(),
      error: vi.fn()
    }))
  }
}))

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        "options.aiConfig.card.statusAvailable": "可用",
        "options.aiConfig.card.statusUnavailable": "不可用",
        "options.aiConfig.card.statusNotConfigured": "未配置",
        "options.aiConfig.card.typeLocal": "本地",
        "options.aiConfig.card.typeRemote": "远程",
        "options.aiConfig.card.active": "在用",
        "options.aiConfig.card.supportsReasoning": "支持推理能力",
        "options.aiConfig.card.latency": "延迟: {{value}}",
        "options.aiConfig.card.lastChecked": "检测: {{time}}",
        "options.aiConfig.card.check": "检测",
        "options.aiConfig.card.checking": "检测中...",
        "options.aiConfig.card.configure": "配置",
        "options.aiConfig.card.budget": "月度预算"
      }
      let result = translations[key] || key
      // 简单的模板替换
      if (params) {
        Object.keys(params).forEach(paramKey => {
          result = result.replace(`{{${paramKey}}}`, params[paramKey])
        })
      }
      return result
    }
  })
}))

describe("AIProviderCard", () => {
  const mockOnCheck = vi.fn()
  const mockOnConfigure = vi.fn()

  const defaultProps = {
    providerId: "deepseek",
    providerName: "DeepSeek",
    status: null,
    onCheck: mockOnCheck,
    onConfigure: mockOnConfigure,
    checking: false
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("应该渲染未配置状态", () => {
    render(<AIProviderCard {...defaultProps} />)

    expect(screen.getByText("DeepSeek")).toBeInTheDocument()
    // 未配置状态显示灰色图标 ⚪
    const card = screen.getByText("DeepSeek").closest("div")
    expect(card).toHaveTextContent("⚪")
  })

  it("应该渲染可用状态", () => {
    const status: AIProviderStatus = {
      providerId: "deepseek",
      type: "remote",
      available: true,
      lastChecked: Date.now(),
      latency: 120
    }

    render(<AIProviderCard {...defaultProps} status={status} />)

    // 可用状态显示绿色图标 🟢
    const card = screen.getByText("DeepSeek").closest("div")
    expect(card).toHaveTextContent("🟢")
    expect(screen.getByText(/120ms/)).toBeInTheDocument()
  })

  it("应该渲染不可用状态", () => {
    const status: AIProviderStatus = {
      providerId: "deepseek",
      type: "remote",
      available: false,
      lastChecked: Date.now(),
      error: "连接失败"
    }

    render(<AIProviderCard {...defaultProps} status={status} />)

    // 不可用状态显示红色图标 🔴
    const card = screen.getByText("DeepSeek").closest("div")
    expect(card).toHaveTextContent("🔴")
    expect(screen.getByText("连接失败")).toBeInTheDocument()
  })

  it("应该显示类型图标 - 远程 AI", () => {
    const status: AIProviderStatus = {
      providerId: "deepseek",
      type: "remote",
      available: true,
      lastChecked: Date.now()
    }

    render(<AIProviderCard {...defaultProps} status={status} />)

    // 远程 AI 显示云图标
    const card = screen.getByText("DeepSeek").closest("div")
    expect(card).toHaveTextContent("☁️")
  })

  it("应该显示类型图标 - 本地 AI", () => {
    const status: AIProviderStatus = {
      providerId: "ollama",
      type: "local",
      available: true,
      lastChecked: Date.now()
    }

    render(<AIProviderCard {...defaultProps} providerId="ollama" providerName="Ollama" status={status} />)

    // 本地 AI 显示电脑图标
    const card = screen.getByText("Ollama").closest("div")
    expect(card).toHaveTextContent("💻")
  })

  it("应该显示'在用'标志", () => {
    const status: AIProviderStatus = {
      providerId: "deepseek",
      type: "remote",
      available: true,
      lastChecked: Date.now()
    }

    render(<AIProviderCard {...defaultProps} status={status} isActive={true} />)

    // 在用状态显示蓝色图标 🔵
    const card = screen.getByText("DeepSeek").closest("div")
    expect(card).toHaveTextContent("🔵")
  })

  it("应该调用 onCheck 当点击检测按钮", () => {
    render(<AIProviderCard {...defaultProps} />)

    const checkButton = screen.getByText("检测")
    fireEvent.click(checkButton)

    expect(mockOnCheck).toHaveBeenCalled()
  })

  it("应该调用 onConfigure 当点击配置按钮", () => {
    render(<AIProviderCard {...defaultProps} />)

    const configButton = screen.getByText("配置")
    fireEvent.click(configButton)

    expect(mockOnConfigure).toHaveBeenCalled()
  })

  it("检测中时应该禁用检测按钮", () => {
    render(<AIProviderCard {...defaultProps} checking={true} />)

    const checkButton = screen.getByText("检测中...")
    expect(checkButton).toBeDisabled()
  })

  it("应该格式化延迟显示", () => {
    const status: AIProviderStatus = {
      providerId: "deepseek",
      type: "remote",
      available: true,
      lastChecked: Date.now(),
      latency: 1500
    }

    render(<AIProviderCard {...defaultProps} status={status} />)

    expect(screen.getByText(/1.5s/)).toBeInTheDocument()
  })

  it("应该显示最后检测时间", () => {
    // Mock i18n 语言为中文
    vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
    
    const now = Date.now()
    const status: AIProviderStatus = {
      providerId: "deepseek",
      type: "remote",
      available: true,
      lastChecked: now - 60 * 1000 // 1 分钟前
    }

    render(<AIProviderCard {...defaultProps} status={status} />)

    expect(screen.getByText(/1分钟前/)).toBeInTheDocument()
  })

  // Phase 12.4: 预算显示测试
  describe("预算显示", () => {
    it("应该显示预算信息（USD）", () => {
      render(
        <AIProviderCard 
          {...defaultProps} 
          monthlyBudget={10}
          currentSpent={5.23}
          currency="USD"
        />
      )

      expect(screen.getByText("💰 月度预算")).toBeInTheDocument()
      expect(screen.getByText("$5.23 / $10")).toBeInTheDocument()
    })

    it("应该显示预算信息（CNY）", () => {
      render(
        <AIProviderCard 
          {...defaultProps} 
          monthlyBudget={100}
          currentSpent={38.5}
          currency="CNY"
        />
      )

      expect(screen.getByText("💰 月度预算")).toBeInTheDocument()
      expect(screen.getByText("¥38.50 / ¥100")).toBeInTheDocument()
    })

    it("预算未设置时不显示", () => {
      const { container } = render(<AIProviderCard {...defaultProps} />)
      
      expect(container.textContent).not.toContain("月度预算")
    })

    it("预算进度条应该反映使用百分比 - 绿色 (<70%)", () => {
      const { container } = render(
        <AIProviderCard 
          {...defaultProps} 
          monthlyBudget={100}
          currentSpent={50}
          currency="USD"
        />
      )

      const progressBar = container.querySelector('.bg-green-500')
      expect(progressBar).toBeInTheDocument()
      expect(progressBar).toHaveStyle({ width: '50%' })
    })

    it("预算进度条应该反映使用百分比 - 黄色 (70%-90%)", () => {
      const { container } = render(
        <AIProviderCard 
          {...defaultProps} 
          monthlyBudget={100}
          currentSpent={80}
          currency="USD"
        />
      )

      const progressBar = container.querySelector('.bg-yellow-500')
      expect(progressBar).toBeInTheDocument()
      expect(progressBar).toHaveStyle({ width: '80%' })
    })

    it("预算进度条应该反映使用百分比 - 红色 (>=90%)", () => {
      const { container } = render(
        <AIProviderCard 
          {...defaultProps} 
          monthlyBudget={100}
          currentSpent={95}
          currency="USD"
        />
      )

      const progressBar = container.querySelector('.bg-red-500')
      expect(progressBar).toBeInTheDocument()
      expect(progressBar).toHaveStyle({ width: '95%' })
    })

    it("超过预算时进度条不超过 100%", () => {
      const { container } = render(
        <AIProviderCard 
          {...defaultProps} 
          monthlyBudget={100}
          currentSpent={120}
          currency="USD"
        />
      )

      const progressBar = container.querySelector('.bg-red-500')
      expect(progressBar).toHaveStyle({ width: '100%' })
    })
  })
})
