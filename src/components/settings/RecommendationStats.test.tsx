/**
 * RecommendationStats 组件测试
 * 测试推荐统计的展示和交互
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RecommendationStats } from "./RecommendationStats"
import type { RecommendationStats as Stats } from "@/types/database"

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        "options.stats.noData": "暂无数据",
        "options.stats.recommendationOverview": "推荐效果概览",
        "options.stats.totalRecommendations": "总推荐数",
        "options.stats.readCount": "已读数",
        "options.stats.readRate": "阅读率",
        "options.stats.unreadCount": "未读数",
        "options.stats.feedbackStats": "用户反馈统计",
        "options.stats.read": "已读",
        "options.stats.readLater": "稍后读",
        "options.stats.dismissed": "不想读",
        "options.stats.hint": "阅读率反映了推荐内容的质量，持续使用可以提升准确度。",
      }
      return translations[key] || key
    },
  }),
}))

// Mock storage
const mockGetRecommendationStats = vi.fn()
vi.mock("@/storage/db", () => ({
  getRecommendationStats: () => mockGetRecommendationStats(),
}))

describe("RecommendationStats 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("加载状态", () => {
    it("应该显示加载动画", () => {
      mockGetRecommendationStats.mockImplementation(
        () => new Promise(() => {}) // 永不resolve
      )

      render(<RecommendationStats />)

      // 检查加载动画（skeleton）
      const skeleton = document.querySelector(".animate-pulse")
      expect(skeleton).toBeInTheDocument()
    })
  })

  describe("无数据状态", () => {
    it("当没有统计数据时应该显示提示", async () => {
      mockGetRecommendationStats.mockResolvedValue(null)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无数据")).toBeInTheDocument()
      })
    })
  })

  describe("有数据状态", () => {
    const mockStats: Stats = {
      totalCount: 100,
      readCount: 60,
      unreadCount: 40,
      readLaterCount: 20,
      dismissedCount: 10,
      avgReadDuration: 120,
      topSources: [
        { source: "Tech Blog", count: 30, readRate: 0.8 },
        { source: "News Site", count: 25, readRate: 0.6 },
      ],
    }

    it("应该显示推荐效果概览", async () => {
      mockGetRecommendationStats.mockResolvedValue(mockStats)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("推荐效果概览")).toBeInTheDocument()
      })

      // 检查总推荐数
      expect(screen.getByText("总推荐数")).toBeInTheDocument()
      expect(screen.getByText("100")).toBeInTheDocument()

      // 检查已读数
      expect(screen.getByText("已读数")).toBeInTheDocument()
      expect(screen.getByText("60")).toBeInTheDocument()

      // 检查未读数
      expect(screen.getByText("未读数")).toBeInTheDocument()
      expect(screen.getByText("40")).toBeInTheDocument()
    })

    it("应该正确计算阅读率", async () => {
      mockGetRecommendationStats.mockResolvedValue(mockStats)

      render(<RecommendationStats />)

      await waitFor(() => {
        // 阅读率 = 60/100 = 60%
        expect(screen.getByText("60% 阅读率")).toBeInTheDocument()
      })
    })

    it("应该显示用户反馈统计", async () => {
      mockGetRecommendationStats.mockResolvedValue(mockStats)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("用户反馈统计")).toBeInTheDocument()
      })

      // 检查已读统计
      expect(screen.getByText("✅ 已读")).toBeInTheDocument()
      expect(screen.getByText("60 (60%)")).toBeInTheDocument()

      // 检查稍后读统计
      expect(screen.getByText("📌 稍后读")).toBeInTheDocument()
      expect(screen.getByText("20 (20%)")).toBeInTheDocument()

      // 检查不想读统计
      expect(screen.getByText("❌ 不想读")).toBeInTheDocument()
      expect(screen.getByText("10 (10%)")).toBeInTheDocument()
    })

    it("应该显示提示信息", async () => {
      mockGetRecommendationStats.mockResolvedValue(mockStats)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(
          screen.getByText(/阅读率反映了推荐内容的质量/)
        ).toBeInTheDocument()
      })
    })

    it("应该渲染进度条", async () => {
      mockGetRecommendationStats.mockResolvedValue(mockStats)

      render(<RecommendationStats />)

      await waitFor(() => {
        const progressBars = document.querySelectorAll(".rounded-full.h-2")
        // 应该有 3 个进度条（已读、稍后读、不想读）
        expect(progressBars.length).toBeGreaterThanOrEqual(3)
      })
    })
  })

  describe("边界情况", () => {
    it("当总推荐数为 0 时应该显示 0% 阅读率", async () => {
      const emptyStats: Stats = {
        totalCount: 0,
        readCount: 0,
        unreadCount: 0,
        readLaterCount: 0,
        dismissedCount: 0,
        avgReadDuration: 0,
        topSources: [],
      }

      mockGetRecommendationStats.mockResolvedValue(emptyStats)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("0% 阅读率")).toBeInTheDocument()
      })
    })

    it("应该正确处理小数阅读率（四舍五入）", async () => {
      const stats: Stats = {
        totalCount: 3,
        readCount: 2, // 2/3 = 66.666... → 67%
        unreadCount: 1,
        readLaterCount: 0,
        dismissedCount: 0,
        avgReadDuration: 90,
        topSources: [],
      }

      mockGetRecommendationStats.mockResolvedValue(stats)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("67% 阅读率")).toBeInTheDocument()
      })
    })

    it("应该正确处理 100% 阅读率", async () => {
      const stats: Stats = {
        totalCount: 50,
        readCount: 50,
        unreadCount: 0,
        readLaterCount: 0,
        dismissedCount: 0,
        avgReadDuration: 150,
        topSources: [],
      }

      mockGetRecommendationStats.mockResolvedValue(stats)

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("100% 阅读率")).toBeInTheDocument()
      })
    })
  })

  describe("错误处理", () => {
    it("当加载失败时应该显示无数据状态", async () => {
      mockGetRecommendationStats.mockRejectedValue(new Error("Database error"))

      render(<RecommendationStats />)

      await waitFor(() => {
        expect(screen.getByText("暂无数据")).toBeInTheDocument()
      })

      // Note: Cannot directly test logger.error call because statsLogger is 
      // created at module initialization time, before the test can mock it.
      // The important behavior is that the component shows "no data" state.
    })
  })

  describe("UI 样式", () => {
    it("应该使用正确的颜色类", async () => {
      const stats: Stats = {
        totalCount: 100,
        readCount: 60,
        unreadCount: 40,
        readLaterCount: 20,
        dismissedCount: 10,
        avgReadDuration: 120,
        topSources: [],
      }

      mockGetRecommendationStats.mockResolvedValue(stats)

      render(<RecommendationStats />)

      await waitFor(() => {
        // 检查已读数使用绿色
        const readCountElement = screen
          .getByText("60")
          .closest(".text-green-600")
        expect(readCountElement).toBeInTheDocument()

        // 检查未读数使用橙色
        const unreadCountElement = screen
          .getByText("40")
          .closest(".text-orange-600")
        expect(unreadCountElement).toBeInTheDocument()
      })
    })

    it("应该有响应式网格布局", async () => {
      const stats: Stats = {
        totalCount: 100,
        readCount: 60,
        unreadCount: 40,
        readLaterCount: 20,
        dismissedCount: 10,
        avgReadDuration: 120,
        topSources: [],
      }

      mockGetRecommendationStats.mockResolvedValue(stats)

      render(<RecommendationStats />)

      await waitFor(() => {
        const gridElement = document.querySelector(".grid-cols-1.md\\:grid-cols-3")
        expect(gridElement).toBeInTheDocument()
      })
    })
  })
})
