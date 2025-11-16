/**
 * RecommendationSettings 组件测试
 * Phase 6: 推荐设置界面测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RecommendationSettings } from "./RecommendationSettings"

// Mock dependencies
vi.mock("@/storage/recommendation-config", () => ({
  getRecommendationConfig: vi.fn().mockResolvedValue({
    useReasoning: false,
    useLocalAI: false,
    maxRecommendations: 3,
    batchSize: 1,
    qualityThreshold: 0.6,
    tfidfThreshold: 0.1
  }),
  saveRecommendationConfig: vi.fn().mockResolvedValue(undefined)
}))

vi.mock("@/core/recommender/adaptive-count", () => ({
  getAdaptiveMetrics: vi.fn().mockResolvedValue({
    totalRecommendations: 10,
    clickCount: 5,
    dismissCount: 2,
    dismissAllCount: 1,
    popupOpenTimestamps: [],
    lastUpdated: Date.now()
  })
}))

vi.mock("@/stores/recommendationStore", () => ({
  useRecommendationStore: () => ({
    generateRecommendations: vi.fn().mockResolvedValue(undefined),
    isLoading: false
  })
}))

vi.mock("@/storage/db", () => ({
  resetRecommendationData: vi.fn().mockResolvedValue(undefined)
}))

// Mock chrome API
const mockChromeStorage = {
  local: {
    get: vi.fn().mockResolvedValue({
      "notification-config": {
        enabled: true,
        quietHours: {
          start: 22,
          end: 8
        },
        minInterval: 60
      }
    }),
    set: vi.fn().mockResolvedValue(undefined)
  }
}

const mockChromeRuntime = {
  sendMessage: vi.fn().mockResolvedValue({ success: true })
}

global.chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime
} as any

describe("RecommendationSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("基本渲染", () => {
    it("应该渲染推荐设置标题", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("推荐设置")).toBeInTheDocument()
      })
    })

    it("应该显示当前推荐模式", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/当前模式:/)).toBeInTheDocument()
        expect(screen.getByText(/标准AI推荐/)).toBeInTheDocument()
      })
    })

    it("应该显示推荐数量", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/智能推荐数量/)).toBeInTheDocument()
        expect(screen.getByText(/3 条/)).toBeInTheDocument()
      })
    })

    it("应该显示推荐统计", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("推荐统计")).toBeInTheDocument()
        expect(screen.getByText("10")).toBeInTheDocument() // 推荐总数
        expect(screen.getByText("5")).toBeInTheDocument() // 阅读数
        expect(screen.getByText("2")).toBeInTheDocument() // 不想读
      })
    })

    it("应该显示通知设置", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("推荐通知")).toBeInTheDocument()
        expect(screen.getByText(/启用推荐通知/)).toBeInTheDocument()
      })
    })
  })

  describe("配置交互", () => {
    it("应该能够切换推理AI模式", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/启用推理AI模式/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /启用推理AI模式/ })
      await user.click(checkbox)
      
      expect(checkbox).toBeChecked()
    })

    it("应该能够切换本地AI", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/使用本地 AI/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /使用本地 AI/ })
      await user.click(checkbox)
      
      expect(checkbox).toBeChecked()
    })

    it("应该能够切换通知开关", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/启用推荐通知/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /启用推荐通知/ })
      // 默认应该是选中的
      expect(checkbox).toBeChecked()
      
      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })

    it("应该能够保存设置", async () => {
      const user = userEvent.setup()
      const { saveRecommendationConfig } = await import("@/storage/recommendation-config")
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("保存设置")).toBeInTheDocument()
      })
      
      const saveButton = screen.getByText("保存设置")
      await user.click(saveButton)
      
      await waitFor(() => {
        expect(saveRecommendationConfig).toHaveBeenCalled()
        expect(mockChromeStorage.local.set).toHaveBeenCalled()
        expect(screen.getByText("✓ 保存成功")).toBeInTheDocument()
      })
    })

    it("应该能够生成推荐", async () => {
      const user = userEvent.setup()
      const store = await import("@/stores/recommendationStore")
      const mockGenerate = vi.fn().mockResolvedValue(undefined)
      
      vi.spyOn(store, "useRecommendationStore").mockReturnValue({
        generateRecommendations: mockGenerate,
        isLoading: false
      } as any)
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/马上推荐/)).toBeInTheDocument()
      })
      
      const generateButton = screen.getByText(/马上推荐/)
      await user.click(generateButton)
      
      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled()
      })
    })
  })

  describe("通知功能", () => {
    it("应该能够测试通知", async () => {
      const user = userEvent.setup()
      global.alert = vi.fn()
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/测试通知/)).toBeInTheDocument()
      })
      
      const testButton = screen.getByText(/测试通知/)
      await user.click(testButton)
      
      await waitFor(() => {
        expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith({
          type: "TEST_NOTIFICATION"
        })
        expect(global.alert).toHaveBeenCalledWith(
          expect.stringContaining("测试通知已发送")
        )
      })
    })

    it("通知开启时应该显示静默时段设置", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/静默时段/)).toBeInTheDocument()
        expect(screen.getByText("开始时间")).toBeInTheDocument()
        expect(screen.getByText("结束时间")).toBeInTheDocument()
      })
    })

    it("通知关闭时不应该显示静默时段设置", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/启用推荐通知/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /启用推荐通知/ })
      await user.click(checkbox)
      
      expect(screen.queryByText(/静默时段/)).not.toBeInTheDocument()
    })
  })

  describe("数据管理", () => {
    it("应该能够重置推荐数据", async () => {
      const user = userEvent.setup()
      global.confirm = vi.fn().mockReturnValue(true)
      global.alert = vi.fn()
      
      const { resetRecommendationData } = await import("@/storage/db")
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/重置数据/)).toBeInTheDocument()
      })
      
      const resetButton = screen.getByText(/重置数据/)
      await user.click(resetButton)
      
      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalled()
        expect(resetRecommendationData).toHaveBeenCalled()
        expect(global.alert).toHaveBeenCalledWith("✅ 推荐数据已重置")
      })
    })

    it("取消确认时不应该重置数据", async () => {
      const user = userEvent.setup()
      global.confirm = vi.fn().mockReturnValue(false)
      
      const { resetRecommendationData } = await import("@/storage/db")
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/重置数据/)).toBeInTheDocument()
      })
      
      const resetButton = screen.getByText(/重置数据/)
      await user.click(resetButton)
      
      expect(global.confirm).toHaveBeenCalled()
      expect(resetRecommendationData).not.toHaveBeenCalled()
    })
  })

  describe("UI 状态", () => {
    it("推理模式开启时应该显示推理AI推荐标签", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/启用推理AI模式/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /启用推理AI模式/ })
      await user.click(checkbox)
      
      await waitFor(() => {
        expect(screen.getByText(/推理AI推荐/)).toBeInTheDocument()
      })
    })

    it("保存中时按钮应该禁用", async () => {
      const user = userEvent.setup()
      const { saveRecommendationConfig } = await import("@/storage/recommendation-config")
      
      // Mock 延迟保存
      vi.mocked(saveRecommendationConfig).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      )
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("保存设置")).toBeInTheDocument()
      })
      
      const saveButton = screen.getByText("保存设置")
      await user.click(saveButton)
      
      // 保存中时按钮文字应该变化
      expect(screen.getByText("保存中...")).toBeInTheDocument()
    })
  })
})
