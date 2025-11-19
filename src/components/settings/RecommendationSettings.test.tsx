/**
 * RecommendationSettings 组件测试
 * Phase 6: 推荐设置界面测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RecommendationSettings } from "./RecommendationSettings"

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "options.recommendation.title": "Recommendation Settings",
        "options.recommendation.currentMode": "Current mode",
        "options.recommendation.reasoningAI": "🧠 Reasoning AI Recommendations",
        "options.recommendation.standardAI": "🤖 Standard AI Recommendations",
        "options.recommendation.enableReasoning": "🧠 Enable Reasoning AI Mode",
        "options.recommendation.smartCount": "Smart Recommendation Count",
        "options.recommendation.currentCount": "Current recommendation count",
        "options.recommendation.countItems": params?.count ? `${params.count} items` : "{{count}} items",
        "options.recommendation.notification": "Recommendation Notifications",
        "options.recommendation.enableNotification": "🔔 Enable Recommendation Notifications",
        "options.recommendation.quietHours": "🌙 Quiet Hours",
        "options.recommendation.quietStart": "Start time",
        "options.recommendation.quietEnd": "End time",
        "options.recommendation.stats": "Recommendation Statistics",
        "options.recommendation.totalRecommendations": "Total recommendations",
        "options.recommendation.readCount": "Read count",
        "options.recommendation.dismissCount": "Don't want to read",
        "options.recommendation.save": "Save Settings",
        "options.recommendation.saving": "Saving...",
        "options.recommendation.saveSuccess": "✓ Saved successfully",
        "options.recommendation.generateNow": "🔮 Generate Now",
        "options.recommendation.generating": "Generating...",
        "options.recommendation.resetData": "🗑️ Reset Data",
        "options.recommendation.resetSuccess": "✅ Recommendation data has been reset",
        "options.recommendation.useLocalAI": "🔒 Use Local AI",
        "options.recommendation.testNotification": "🔔 Test Notification",
        "options.recommendation.testNotificationSuccess": "✅ Test notification sent! Please check system notification center"
      }
      return translations[key] || key
    }
  })
}))

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
        expect(screen.getByText("Recommendation Settings")).toBeInTheDocument()
      })
    })

    it("应该显示当前推荐模式", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/Current mode/)).toBeInTheDocument()
        expect(screen.getByText(/Standard AI/)).toBeInTheDocument()
      })
    })

    it("应该显示推荐数量", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/Smart Recommendation Count/)).toBeInTheDocument()
        expect(screen.getByText(/3 items/)).toBeInTheDocument()
      })
    })

    it("应该显示推荐统计", async () => {
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("Recommendation Statistics")).toBeInTheDocument()
        expect(screen.getByText("10")).toBeInTheDocument() // 推荐总数
        expect(screen.getByText("5")).toBeInTheDocument() // 阅读数
        expect(screen.getByText("2")).toBeInTheDocument() // 不想读
      })
    })
  })

  describe("配置交互", () => {
    it("应该能够切换推理AI模式", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/Enable Reasoning AI Mode/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /Enable Reasoning AI Mode/ })
      await user.click(checkbox)
      
      expect(checkbox).toBeChecked()
    })

    it("应该能够切换本地AI", async () => {
      const user = userEvent.setup()
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/Use Local AI/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /Use Local AI/ })
      await user.click(checkbox)
      
      expect(checkbox).toBeChecked()
    })

    it("应该能够保存设置", async () => {
      const user = userEvent.setup()
      const { saveRecommendationConfig } = await import("@/storage/recommendation-config")
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      })
      
      const saveButton = screen.getByText("Save Settings")
      await user.click(saveButton)
      
      await waitFor(() => {
        expect(saveRecommendationConfig).toHaveBeenCalled()
        expect(screen.getByText("✓ Saved successfully")).toBeInTheDocument()
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
        expect(screen.getByText(/Generate Now/)).toBeInTheDocument()
      })
      
      const generateButton = screen.getByText(/Generate Now/)
      await user.click(generateButton)
      
      await waitFor(() => {
        expect(mockGenerate).toHaveBeenCalled()
      })
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
        expect(screen.getByText(/Reset Data/)).toBeInTheDocument()
      })
      
      const resetButton = screen.getByText(/Reset Data/)
      await user.click(resetButton)
      
      await waitFor(() => {
        expect(global.confirm).toHaveBeenCalled()
        expect(resetRecommendationData).toHaveBeenCalled()
        expect(global.alert).toHaveBeenCalledWith("✅ Recommendation data has been reset")
      })
    })

    it("取消确认时不应该重置数据", async () => {
      const user = userEvent.setup()
      global.confirm = vi.fn().mockReturnValue(false)
      
      const { resetRecommendationData } = await import("@/storage/db")
      
      render(<RecommendationSettings />)
      
      await waitFor(() => {
        expect(screen.getByText(/Reset Data/)).toBeInTheDocument()
      })
      
      const resetButton = screen.getByText(/Reset Data/)
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
        expect(screen.getByText(/Enable Reasoning AI Mode/)).toBeInTheDocument()
      })
      
      const checkbox = screen.getByRole("checkbox", { name: /Enable Reasoning AI Mode/ })
      await user.click(checkbox)
      
      await waitFor(() => {
        expect(screen.getByText("🧠 Reasoning AI Recommendations")).toBeInTheDocument()
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
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      })
      
      const saveButton = screen.getByText("Save Settings")
      await user.click(saveButton)
      
      // 保存中时按钮文字应该变化
      expect(screen.getByText("Saving...")).toBeInTheDocument()
    })
  })
})
