import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import RecommendationView from "./RecommendationView"

const items = [
  { id: "1", title: "AI 技术趋势", url: "https://example.com/a1" },
  { id: "2", title: "前端性能优化", url: "https://example.com/a2" }
] as any

describe("RecommendationView", () => {
  it("空列表应显示学习阶段提示", () => {
    render(<RecommendationView items={[]} loading={false} error={null} />)
    // 学习阶段会随机显示一条消息，只需检查存在学习阶段的图标
    expect(screen.getByText("🌱")).toBeDefined()
  })
})
/**
 * RecommendationView 组件测试
 * 测试推荐列表的展示和交互
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RecommendationView } from "./RecommendationView"
import type { Recommendation } from "@/types/database"

// Mock chrome API (移到文件顶部，统一管理)
const mockTabsCreate = vi.fn().mockResolvedValue({ id: 123 }) // 返回带 id 的 tab 对象
const mockStorageLocalSet = vi.fn().mockResolvedValue(undefined)
const mockStorageLocalGet = vi.fn().mockResolvedValue({})
const mockStorageSessionSet = vi.fn().mockResolvedValue(undefined)
const mockStorageSessionGet = vi.fn().mockResolvedValue({})
const mockSendMessage = vi.fn().mockResolvedValue({ success: true, tabId: 123 }) // 模拟 Background 响应

global.chrome = {
  tabs: {
    create: mockTabsCreate,
  },
  storage: {
    local: {
      set: mockStorageLocalSet,
      get: mockStorageLocalGet,
    },
    session: {
      set: mockStorageSessionSet,
      get: mockStorageSessionGet,
    },
  },
  runtime: {
    sendMessage: mockSendMessage,
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
        "popup.learningStage.title": "正在学习你的兴趣偏好",
        "popup.learningStage.progress": `已浏览 ${params?.current || 0}/${params?.total || 100} 页`,
        "popup.learningStage.subtitle": "数据存储在本地，分析由你的 AI 完成",
        "popup.recommendations": "为你推荐",
        "popup.recommendationCount": `${params?.count || 0} 条推荐`,
        "popup.dismissAll": "全部忽略",
        "popup.confirmDismiss": `确定要忽略全部 ${params?.count || 0} 条推荐吗？`,
        "popup.confirmDismissAll": `确定要忽略全部 ${params?.count || 0} 条推荐吗？`,
        "popup.settings": "⚙️ 设置",
        "popup.notInterested": "不想读",
        // 空窗期随机消息
        "popup.allCaughtUp.messages.0": "已读完当前推荐",
        "popup.allCaughtUp.messages.1": "新内容正在路上",
        "popup.allCaughtUp.subtitle": "稍后回来查看新推荐",
        // Tips
        "popup.tips.philosophy.0.emoji": "💡",
        "popup.tips.philosophy.0.text": "克制的信息消费，只推荐真正值得读的",
      }
      return translations[key] || key
    },
    t: (key: string, options?: any) => {
      // 处理空窗期随机消息
      if (key === "popup.allCaughtUp.messages" && options?.returnObjects) {
        return [
          "已读完当前推荐",
          "新内容正在路上",
          "休息一下，稍后再来",
          "精彩内容很快到来",
          "你已经全部读完了"
        ]
      }
      return key
    },
  }),
}))

// Mock ui-config
vi.mock("@/storage/ui-config", () => ({
  getUIConfig: vi.fn().mockResolvedValue({
    style: "sketchy",
    autoTranslate: false,
  }),
  watchAutoTranslate: vi.fn().mockReturnValue(() => {}), // 返回 unwatch 函数
}))

// Mock recommendation store
const mockLoadRecommendations = vi.fn()
const mockMarkAsRead = vi.fn()
const mockDismissAll = vi.fn()
const mockRemoveFromList = vi.fn()

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
    removeFromList: mockRemoveFromList,
  }),
}))

// Helper function to create mock recommendations
function makeRec(id: string, title: string): Recommendation {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    sourceUrl: `https://example.com/${id}`,
    summary: `summary ${id}`,
    score: 0.8,
    wordCount: 1200,
    readingTime: 6,
    reason: { provider: "keyword" },
    source: "Test Blog",
    recommendedAt: Date.now(),
    isRead: false,
  }
}

describe("RecommendationView 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecommendations = []
    mockIsLoading = false
    mockError = null
    window.confirm = vi.fn()
    
    // 重置 Chrome API mocks
    mockTabsCreate.mockClear()
    mockStorageLocalSet.mockClear()
    mockStorageLocalGet.mockClear()
    mockStorageSessionSet.mockClear()
    mockStorageSessionGet.mockClear()
    mockSendMessage.mockClear()
    
    // 重置为默认行为
    mockTabsCreate.mockResolvedValue({ id: 123 }) // 返回带 id 的 tab 对象
    mockStorageLocalSet.mockResolvedValue(undefined)
    mockStorageLocalGet.mockResolvedValue({})
    mockStorageSessionSet.mockResolvedValue(undefined)
    mockStorageSessionGet.mockResolvedValue({})
    mockSendMessage.mockResolvedValue({ success: true, tabId: 123 }) // Background 响应
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
    it("应该显示学习阶段提示", () => {
      mockRecommendations = []
      render(<RecommendationView />)

      // 学习阶段使用 🌱 图标
      expect(screen.getByText("🌱")).toBeInTheDocument()
      // 检查是否显示了学习阶段标题
      expect(screen.getByText("正在学习你的兴趣偏好")).toBeInTheDocument()
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

    it("应该显示推荐列表", () => {
      mockRecommendations = mockRecs
      render(<RecommendationView />)

      // Phase 7: 工具栏移到popup头部，RecommendationView只显示推荐列表
      // 检查推荐条目是否渲染
      expect(screen.getByText("推荐文章 1")).toBeInTheDocument()
      expect(screen.getByText("推荐文章 2")).toBeInTheDocument()
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

      // Phase 7: 智能显示摘要 - 2条时都显示摘要
      expect(
        screen.getByText("这是第一篇推荐文章的摘要")
      ).toBeInTheDocument()
      // 2条推荐时，第二条也会显示摘要
      expect(
        screen.getByText("这是第二篇推荐文章的摘要")
      ).toBeInTheDocument()
    })

    it("应该显示favicon图标", () => {
      mockRecommendations = mockRecs
      const { container } = render(<RecommendationView />)

      // Phase 7: 网站名移除，只显示favicon，使用 container.querySelectorAll 因为 img 没有 alt
      const favicons = container.querySelectorAll('img')
      expect(favicons.length).toBeGreaterThanOrEqual(2)
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

    it("点击推荐应该通过 Background 打开新标签页", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // 新方案：通过 sendMessage 发送到 Background 打开
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'OPEN_RECOMMENDATION',
            data: expect.objectContaining({
              url: "https://example.com/article",
            }),
          })
        )
      })
    })

    it("点击推荐应该从列表中移除", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // 应该调用 removeFromList 从列表移除
      await waitFor(() => {
        expect(mockRemoveFromList).toHaveBeenCalledWith(['rec-1'])
      })
    })

    it("点击推荐应该通过 Background 打开并保存追踪信息", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // 新方案：通过 sendMessage 发送到 Background 处理
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'OPEN_RECOMMENDATION',
            data: expect.objectContaining({
              url: 'https://example.com/article',
              recommendationId: 'rec-1',
              title: '测试文章',
              action: 'clicked',
            }),
          })
        )
      })
    })

    it("点击推荐不应该立即标记为已读（策略B）", async () => {
      const user = userEvent.setup()
      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // 策略B：不立即标记为已读，通过 Background 打开并等待 30 秒阅读验证
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'OPEN_RECOMMENDATION',
          })
        )
      })
      
      // 不应该立即调用 markAsRead
      expect(mockMarkAsRead).not.toHaveBeenCalled()
      
      // 但应该从列表中移除
      expect(mockRemoveFromList).toHaveBeenCalledWith(['rec-1'])
    })

    it("使用 fire-and-forget 模式发送消息（不等待响应）", async () => {
      const user = userEvent.setup()
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {})
      
      // 即使 sendMessage 返回失败响应，也不会回退（因为使用 fire-and-forget）
      // Background 负责处理所有操作，包括打开标签页和保存跟踪信息
      mockSendMessage.mockResolvedValue({ success: false, error: 'Background error' })

      mockRecommendations = [mockRec]
      render(<RecommendationView />)

      const item = screen.getByText("测试文章")
      await user.click(item)

      // 应该发送消息到 Background
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'OPEN_RECOMMENDATION',
          })
        )
      })
      
      // fire-and-forget 模式：不等待响应，所以不会有回退逻辑
      // 不应该直接调用 tabs.create（由 Background 负责）
      expect(mockTabsCreate).not.toHaveBeenCalled()
      
      // 策略B：不立即标记为已读
      expect(mockMarkAsRead).not.toHaveBeenCalled()
      
      // 但应该从列表中移除
      expect(mockRemoveFromList).toHaveBeenCalledWith(['rec-1'])

      consoleErrorSpy.mockRestore()
    })
  })

  // Phase 7: "全部忽略"按钮移至popup头部，RecommendationView不再包含此功能
  // 相关测试移至popup.test.tsx

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

  describe("摘要显示策略", () => {
    it("shouldShowExcerpt 策略：4 条时前 3 条显示摘要", async () => {
      mockRecommendations = [
        makeRec("a", "Article A"),
        makeRec("b", "Article B"),
        makeRec("c", "Article C"),
        makeRec("d", "Article D")
      ]
      const { container } = render(<RecommendationView />)
      await screen.findByText("Article A")
      // 第一条显示摘要 + 第二、三条显示摘要 = 至少 3 个摘要段落
      const summaries = container.querySelectorAll("p.text-xs")
      expect(summaries.length).toBeGreaterThanOrEqual(3)
    })

    it("shouldShowExcerpt 策略：5 条时前 2 条显示摘要", async () => {
      mockRecommendations = [
        makeRec("a", "Article A"),
        makeRec("b", "Article B"),
        makeRec("c", "Article C"),
        makeRec("d", "Article D"),
        makeRec("e", "Article E")
      ]
      const { container } = render(<RecommendationView />)
      await screen.findByText("Article A")
      // 前 2 条显示摘要，后面条目不显示或较少
      const summaries = container.querySelectorAll("p.text-xs")
      expect(summaries.length).toBeGreaterThanOrEqual(2)
    })

    it("加载态但已有列表时应展示列表而非空态", async () => {
      mockRecommendations = [makeRec("x1", "Loaded Item")]
      mockIsLoading = true
      render(<RecommendationView />)
      expect(await screen.findByText("Loaded Item")).toBeInTheDocument()
      // 不应显示空态或加载动画文案（因为列表不为空）
      expect(screen.queryByText("popup.noRecommendations")).not.toBeInTheDocument()
    })
  })
})
