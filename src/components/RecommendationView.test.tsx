/**
 * RecommendationView 组件测试
 * 测试推荐列表的展示和交互
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RecommendationView } from "./RecommendationView"
import type { Recommendation } from "@/storage/types"

// Mock chrome API
global.chrome = {
  tabs: {
    create: vi.fn().mockResolvedValue({}),
  },
  storage: {
    local: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
    },
  },
} as any

// Mock i18n
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        "popup.loading": "加载中...",
        "popup.retry": "重试",
        "popup.noRecommendations": "暂无推荐",
        "popup.checkBackLater": "稍后再来看看吧",
        "popup.recommendations": "为你推荐",
        "popup.recommendationCount": `${params?.count || 0} 条推荐`,
        "popup.dismissAll": "全部忽略",
        "popup.confirmDismiss": `确定要忽略全部 ${params?.count || 0} 条推荐吗？`,
        "popup.confirmDismissAll": `确定要忽略全部 ${params?.count || 0} 条推荐吗？`,
        "popup.settings": "⚙️ 设置",
        "popup.notInterested": "不想读",
      }
      return translations[key] || key
    },
  }),
}))

// Mock recommendation store
const mockLoadRecommendations = vi.fn()
const mockMarkAsRead = vi.fn()
const mockDismissAll = vi.fn()

let mockRecommendations: Recommendation[] = []
let mockIsLoading = false
let mockError: string | null = null

vi.mock("@/stores/recommendationStore", () => ({
  useRecommendationStore: () => ({
    recommendations: mockRecommendations,
    isLoading: mockIsLoading,
    error: mockError,
    loadRecommendations: mockLoadRecommendations,
    markAsRead: mockMarkAsRead,
    dismissAll: mockDismissAll,
  }),
}))

describe("RecommendationView 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecommendations = []
    mockIsLoading = false
    mockError = null
    window.confirm = vi.fn()
  })

  describe("加载状态", () => {
    it("应该在首次加载时调用 loadRecommendations", () => {
      mockIsLoading = true
      render(<RecommendationView />)
      expect(mockLoadRecommendations).toHaveBeenCalled()
    })

    it("应该显示加载动画", () => {
      mockIsLoading = true
      render(<RecommendationView />)

      expect(screen.getByText("⏳")).toBeInTheDocument()
      expect(screen.getByText("加载中...")).toBeInTheDocument()
    })
  })

  describe("错误状态", () => {
    it("应该显示错误消息", () => {
      mockError = "网络错误"
      render(<RecommendationView />)

      expect(screen.getByText("⚠️")).toBeInTheDocument()
      expect(screen.getByText("网络错误")).toBeInTheDocument()
    })

    it("点击重试按钮应该重新加载", async () => {
      const user = userEvent.setup()
      mockError = "加载失败"
      render(<RecommendationView />)

      const retryButton = screen.getByText("重试")
      await user.click(retryButton)

      expect(mockLoadRecommendations).toHaveBeenCalledTimes(2) // 一次 mount, 一次点击
    })
  })

  describe("空推荐状态", () => {
    it("应该显示暂无推荐提示", () => {
      mockRecommendations = []
      render(<RecommendationView />)

      expect(screen.getByText("✨")).toBeInTheDocument()
      expect(screen.getByText("暂无推荐")).toBeInTheDocument()
      expect(screen.getByText("稍后再来看看吧")).toBeInTheDocument()
    })
  })

  describe("推荐列表展示", () => {
    const mockRecs: Recommendation[] = [
      {
        id: "rec-1",
        url: "https://example.com/1",
        title: "推荐文章 1",
        summary: "这是第一篇推荐文章的摘要",
        source: "Tech Blog",
        sourceUrl: "https://techblog.com",
        score: 0.95,
        recommendedAt: Date.now(),
        isRead: false,
      },
      {
        id: "rec-2",
        url: "https://example.com/2",
        title: "推荐文章 2",
        summary: "这是第二篇推荐文章的摘要",
        source: "Dev News",
        sourceUrl: "https://devnews.com",
        score: 0.88,
        recommendedAt: Date.now() - 1000,
        isRead: false,
      },
    ]

    it("应该显示推荐列表头部", () => {
      mockRecommendations = mockRecs
      render(<RecommendationView />)

      // Phase 6: 组件结构变更，不再显示 "为你推荐" 和推荐数量标题
      // 改为检查操作按钮
      expect(screen.getByText(/设置/)).toBeInTheDocument()
      expect(screen.getByText(/全部忽略/)).toBeInTheDocument()
    })

    it("应该渲染所有推荐条目", () => {
      mockRecommendations = mockRecs
      render(<RecommendationView />)

      expect(screen.getByText("推荐文章 1")).toBeInTheDocument()
      expect(screen.getByText("推荐文章 2")).toBeInTheDocument()
    })

    it("应该显示推荐摘要", () => {
      mockRecommendations = mockRecs
      render(<RecommendationView />)

      // 第一条推荐会显示摘要（isTopItem=true）
      expect(
        screen.getByText("这是第一篇推荐文章的摘要")
      ).toBeInTheDocument()
      // 第二条不显示摘要（使用紧凑布局）
      expect(
        screen.queryByText("这是第二篇推荐文章的摘要")
      ).not.toBeInTheDocument()
    })

    it("应该显示推荐来源", () => {
      mockRecommendations = mockRecs
      render(<RecommendationView />)

      // 使用正则表达式匹配，因为文本被 emoji 分割
      expect(screen.getByText(/Tech Blog/)).toBeInTheDocument()
      expect(screen.getByText(/Dev News/)).toBeInTheDocument()
    })

    it("应该显示推荐分数（百分比）", () => {
      mockRecommendations = mockRecs
      render(<RecommendationView />)

      // 使用正则表达式或查询所有包含分数的元素
      expect(screen.getByText(/95/)).toBeInTheDocument()
      expect(screen.getByText(/88/)).toBeInTheDocument()
    })

    it("当没有摘要时不应该显示摘要区域", () => {
      mockRecommendations = [
        {
          id: "rec-1",
          url: "https://example.com/1",
          title: "无摘要文章",
          summary: "",
          source: "Blog",
          sourceUrl: "https://example.com",
          recommendedAt: Date.now(),
          score: 0.8,
          isRead: false,
        },
      ]

      const { container } = render(<RecommendationView />)

      // 标题有 line-clamp-2 但是 text-sm
      // 摘要有 line-clamp-2 且是 text-xs
      // 所以查找 line-clamp-2.text-xs 应该找不到（没有摘要）
      const summaryElements = container.querySelectorAll(".line-clamp-2.text-xs")
      expect(summaryElements.length).toBe(0)
    })

    it("当没有分数时不应该显示分数", () => {
      mockRecommendations = [
        {
          id: "rec-1",
          url: "https://example.com/1", 
          title: "无分数文章",
          summary: "这是一篇没有分数的测试文章",
          source: "Blog",
          recommendedAt: Date.now(),
          score: 0,
          isRead: false,
          sourceUrl: "https://example.com",
        },
      ]

      render(<RecommendationView />)

      // 不应该有百分比文本
      expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
    })
  })

  describe("推荐条目交互", () => {
    const mockRec: Recommendation = {
      id: "rec-1",
      url: "https://example.com/article",
      title: "测试文章",
      summary: "测试摘要",
      source: "Test Blog",
      sourceUrl: "https://example.com",
      score: 0.9,
      recommendedAt: Date.now(),
      isRead: false,
    }

    it("点击推荐应该打开新标签页", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: "https://example.com/article",
      })
    })

    it("点击推荐应该保存追踪信息到 chrome.storage", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // Phase 6: 改为使用 adaptive-metrics 追踪点击次数
      await waitFor(() => {
        expect(chrome.storage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            "adaptive-metrics": expect.objectContaining({
              clickCount: expect.any(Number),
              lastUpdated: expect.any(Number),
            }),
          })
        )
      })
    })

    it("点击推荐应该标记为已读", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      await waitFor(() => {
        expect(mockMarkAsRead).toHaveBeenCalledWith("rec-1")
      })
    })

    it("当保存追踪信息失败时应该继续打开链接", async () => {
      const user = userEvent.setup()
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})
      
      // trackRecommendationClick 内部会捕获存储错误并输出到 console
      chrome.storage.local.set = vi
        .fn()
        .mockRejectedValue(new Error("Storage error"))

      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // 即使保存失败，仍应该打开链接并标记为已读
      expect(chrome.tabs.create).toHaveBeenCalled()
      expect(mockMarkAsRead).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe("全部忽略功能", () => {
    const mockRecs: Recommendation[] = [
      {
        id: "rec-1",
        url: "https://example.com/1",
        title: "文章 1",
        summary: "这是第一篇测试文章的摘要",
        source: "Blog",
        recommendedAt: Date.now(),
        score: 0.9,
        isRead: false,
        sourceUrl: "https://example.com",
      },
      {
        id: "rec-2",
        url: "https://example.com/2",
        title: "文章 2",
        summary: "这是第二篇测试文章的摘要",
        source: "Blog",
        recommendedAt: Date.now(),
        score: 0.8,
        isRead: false,
        sourceUrl: "https://example.com",
      },
    ]

    it("点击全部忽略应该显示确认对话框", async () => {
      const user = userEvent.setup()
      window.confirm = vi.fn().mockReturnValue(false)

      mockRecommendations = mockRecs
      render(<RecommendationView />)

      const dismissButton = screen.getByText("全部忽略")
      await user.click(dismissButton)

      expect(window.confirm).toHaveBeenCalledWith("确定要忽略全部 2 条推荐吗？")
    })

    it("确认后应该调用 dismissAll", async () => {
      const user = userEvent.setup()
      window.confirm = vi.fn().mockReturnValue(true)

      mockRecommendations = mockRecs
      render(<RecommendationView />)

      const dismissButton = screen.getByText("全部忽略")
      await user.click(dismissButton)

      expect(mockDismissAll).toHaveBeenCalled()
    })

    it("取消后不应该调用 dismissAll", async () => {
      const user = userEvent.setup()
      window.confirm = vi.fn().mockReturnValue(false)

      mockRecommendations = mockRecs
      render(<RecommendationView />)

      const dismissButton = screen.getByText("全部忽略")
      await user.click(dismissButton)

      expect(mockDismissAll).not.toHaveBeenCalled()
    })

    it("当推荐列表为空时点击忽略不应该有任何操作", async () => {
      const user = userEvent.setup()
      window.confirm = vi.fn()
      mockRecommendations = []

      render(<RecommendationView />)

      // 空列表时不应该显示全部忽略按钮
      expect(screen.queryByText("全部忽略")).not.toBeInTheDocument()
    })
  })

  describe("UI 样式", () => {
    it("推荐条目应该有 hover 效果", () => {
      const mockRec: Recommendation = {
        id: "rec-1",
        url: "https://example.com/1",
        title: "测试文章",
        summary: "这是一篇测试文章的摘要",
        source: "Blog",
        recommendedAt: Date.now(),
        score: 0.85,
        isRead: false,
        sourceUrl: "https://example.com",
      }

      mockRecommendations = [mockRec]
      const { container } = render(<RecommendationView />)

      const item = container.querySelector(".hover\\:bg-gray-50")
      expect(item).toBeInTheDocument()
    })

    it("推荐条目应该有光标指针", () => {
      const mockRec: Recommendation = {
        id: "rec-1",
        url: "https://example.com/1",
        title: "测试文章",
        summary: "这是一篇测试文章的摘要",
        source: "Blog",
        recommendedAt: Date.now(),
        score: 0.85,
        isRead: false,
        sourceUrl: "https://example.com",
      }

      mockRecommendations = [mockRec]
      const { container } = render(<RecommendationView />)

      const item = container.querySelector(".cursor-pointer")
      expect(item).toBeInTheDocument()
    })

    it("推荐列表应该可滚动", () => {
      const mockRec: Recommendation = {
        id: "rec-1",
        url: "https://example.com/1",
        title: "测试文章",
        summary: "这是一篇测试文章的摘要",
        source: "Blog",
        recommendedAt: Date.now(),
        score: 0.85,
        isRead: false,
        sourceUrl: "https://example.com",
      }

      mockRecommendations = [mockRec]
      const { container } = render(<RecommendationView />)

      // Phase 6: 移除了滚动容器，改为固定高度布局
      // 检查推荐列表容器存在
      const listContainer = container.querySelector("[data-recommendation-id]")
      expect(listContainer).toBeInTheDocument()
    })
  })
})
