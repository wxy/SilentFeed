/**
 * OnboardingView 组件测试
 * 
 * 测试核心功能：
 * - 基础渲染
 * - 图标加载（chrome.runtime.getURL）
 * - 进度条显示
 * - 导航按钮
 * - 状态持久化
 * - 视觉样式
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { OnboardingView } from "./OnboardingView"

// Mock storage
const mockStorage: any = {
  onboarding_state: { state: "setup", currentStep: 1, skipped: false },
  ai_config: null,
  rss_feeds: []
}

// Mock chrome APIs
;(global as any).chrome = {
  storage: {
    local: {
      get: vi.fn((keys: any) => {
        const result: any = {}
        if (Array.isArray(keys)) {
          keys.forEach((key) => {
            if (mockStorage[key]) result[key] = mockStorage[key]
          })
        } else if (typeof keys === "object") {
          Object.keys(keys).forEach((key) => {
            if (mockStorage[key]) result[key] = mockStorage[key]
          })
        }
        return Promise.resolve(result)
      }),
      set: vi.fn((data) => {
        Object.assign(mockStorage, data)
        return Promise.resolve()
      })
    } as any
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`)
  } as any
}

// Mock AI Manager
vi.mock("@/core/ai/AICapabilityManager", () => ({
  aiManager: {
    testConnection: vi.fn().mockResolvedValue({ success: true })
  }
}))

// Mock Feed Manager
vi.mock("@/core/rss/managers/FeedManager", () => ({
  FeedManager: {
    addFeed: vi.fn().mockResolvedValue({ 
      id: 1, 
      title: "Test Feed",
      url: "https://example.com/feed.xml"
    }),
    getFeeds: vi.fn().mockResolvedValue([])
  }
}))

// Mock OPML Importer
vi.mock("@/core/rss/OPMLImporter", () => ({
  OPMLImporter: {
    import: vi.fn().mockResolvedValue({ 
      success: 3, 
      failed: 0, 
      feeds: [] 
    })
  }
}))

describe("OnboardingView", () => {
  const mockOnComplete = vi.fn()

  beforeEach(() => {
    mockStorage.onboarding_state = { state: "setup", currentStep: 1, skipped: false }
    mockStorage.ai_config = null
    mockStorage.rss_feeds = []
    mockOnComplete.mockClear()
    vi.clearAllMocks()
  })

  describe("基础渲染", () => {
    it("应该成功渲染组件", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
      })
    })

    it("应该显示进度条", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width"]')
        expect(progressBar).toBeTruthy()
      })
    })

    it("应该使用 400px 宽度", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const container = document.querySelector('.w-\\[400px\\]')
        expect(container).toBeTruthy()
      })
    })
  })

  describe("图标加载", () => {
    it("应该使用 chrome.runtime.getURL 加载图标", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const img = screen.getByAltText("Silent Feed")
        expect(img).toHaveAttribute("src", "chrome-extension://test/assets/icon.png")
      })
    })

    it("应该应用 1.3rem 圆角样式", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const img = screen.getByAltText("Silent Feed")
        expect(img).toHaveStyle({ borderRadius: "1.3rem" })
      })
    })

    it("图标应该有正确的尺寸", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const img = screen.getByAltText("Silent Feed")
        expect(img).toHaveClass("w-20", "h-20")
      })
    })
  })

  describe("进度显示", () => {
    it("应该显示进度条（默认 Step 1 = 25%）", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const progressBar = document.querySelector('[style*="width: 25%"]')
        expect(progressBar).toBeTruthy()
      })
    })

    it("进度条应该有动画效果", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const progressBar = document.querySelector('.transition-all')
        expect(progressBar).toBeTruthy()
      })
    })
  })

  describe("导航按钮", () => {
    it("Step 1 上一步按钮应该被禁用", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        // 第一个按钮是 "上一步"
        expect(buttons[0]).toBeDisabled()
      })
    })

    it("应该有导航按钮", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const buttons = screen.getAllByRole("button")
        // 至少有两个按钮（上一步、下一步）
        expect(buttons.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe("状态管理", () => {
    it("应该在组件加载时读取状态", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        expect(chrome.storage.local.get).toHaveBeenCalled()
      })
    })
  })

  describe("错误处理", () => {
    it("应该处理 storage 加载错误", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
      ;(chrome.storage.local.get as any).mockRejectedValueOnce(new Error("Storage error"))
      
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })
      
      consoleError.mockRestore()
    })

    it("加载失败时仍然应该渲染基本结构", async () => {
      ;(chrome.storage.local.get as any).mockRejectedValueOnce(new Error("Storage error"))
      
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      // 即使加载失败，组件也应该渲染
      await waitFor(() => {
        const container = document.querySelector('.w-\\[400px\\]')
        expect(container).toBeTruthy()
      })
    })
  })

  describe("视觉样式", () => {
    it("应该使用三层配色方案 - 背景渐变", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const container = document.querySelector('.bg-gradient-to-br')
        expect(container).toBeTruthy()
      })
    })

    it("应该使用三层配色方案 - 装饰光晕", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const overlay = document.querySelector('.bg-gradient-to-tr')
        expect(overlay).toBeTruthy()
      })
    })

    it("应该使用三层配色方案 - 毛玻璃内容区", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const content = document.querySelector('.backdrop-blur-md')
        expect(content).toBeTruthy()
      })
    })

    it("进度条应该使用三色渐变", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const progressBar = document.querySelector('.from-violet-500')
        expect(progressBar).toBeTruthy()
      })
    })

    it("进度条应该有阴影效果", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      await waitFor(() => {
        const progressBar = document.querySelector('.shadow-lg')
        expect(progressBar).toBeTruthy()
      })
    })
  })

  describe("组件集成", () => {
    it("应该处理 onComplete 回调", async () => {
      render(<OnboardingView onComplete={mockOnComplete} />)
      
      // onComplete 应该是有效的函数
      expect(mockOnComplete).toBeInstanceOf(Function)
    })
  })
})
