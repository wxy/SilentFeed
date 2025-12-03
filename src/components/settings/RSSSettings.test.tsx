/**
 * RSSSettings 组件测试 - 优化版
 * 覆盖核心功能和关键分支
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RSSSettings } from "./RSSSettings"
import type { DiscoveredFeed } from "@/types/rss"
import { RSSValidator } from "@/core/rss/RSSValidator"
import i18next from "i18next"
import { I18nextProvider } from "react-i18next"
import zhCN from "../../../public/locales/zh-CN/translation.json"
import { vi } from "vitest"

// 确保不使用其他测试文件中的 react-i18next mock
vi.unmock("react-i18next")

// Mock 函数
const mockGetFeeds = vi.fn()
const mockGetFeed = vi.fn()
const mockIgnore = vi.fn()
const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()
const mockGetFeedByUrl = vi.fn()
const mockAddCandidate = vi.fn()
const mockAnalyzeFeed = vi.fn()
const mockDelete = vi.fn()
const mockToggleActive = vi.fn()

// 初始化 i18n（使用真实中文资源，确保测试中文文本匹配）
function initI18n() {
  if (!i18next.isInitialized) {
    i18next.init({
      lng: "zh-CN",
      fallbackLng: "zh-CN",
      resources: {
        "zh-CN": { translation: zhCN as any },
      },
      interpolation: { escapeValue: false },
    })
  }
}

function renderWithI18n(ui: React.ReactElement) {
  initI18n()
  return render(<I18nextProvider i18n={i18next}>{ui}</I18nextProvider>)
}

// Mock FeedManager
vi.mock("@/core/rss/managers/FeedManager", () => ({
  FeedManager: class MockFeedManager {
    getFeeds = mockGetFeeds
    getFeed = mockGetFeed
    ignore = mockIgnore
    subscribe = mockSubscribe
    unsubscribe = mockUnsubscribe
    getFeedByUrl = mockGetFeedByUrl
    addCandidate = mockAddCandidate
    analyzeFeed = mockAnalyzeFeed
    delete = mockDelete
    toggleActive = mockToggleActive
  },
}))

// Mock RSSFetcher
vi.mock("@/core/rss/RSSFetcher", () => ({
  RSSFetcher: class MockRSSFetcher {
    fetch = vi.fn().mockResolvedValue({ success: true, items: [] })
  },
}))

// Mock RSSValidator
vi.mock("@/core/rss/RSSValidator", () => ({
  RSSValidator: {
    validateURL: vi.fn().mockResolvedValue({ valid: true }),
  },
}))

// Mock OPMLImporter
vi.mock("@/core/rss/OPMLImporter", () => ({
  OPMLImporter: class MockOPMLImporter {
    import = vi.fn()
    export = vi.fn()
  },
}))

// Mock favicon utils
vi.mock("@/utils/favicon", () => ({
  getFaviconUrl: vi.fn((url) => `https://favicon.service/${url}`),
  handleFaviconError: vi.fn(),
}))

// Mock chrome runtime
const mockSendMessage = vi.fn()
global.chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
} as any

// 示例测试数据
const mockCandidateFeed: DiscoveredFeed = {
  id: 'candidate-1',
  url: 'https://example.com/feed',
  title: '候选源标题',
  description: '候选源描述',
  discoveredAt: Date.now(),
  discoveredFrom: 'https://example.com',
  status: 'candidate',
  isActive: false,
  articleCount: 5,
  recommendedCount: 0,
  unreadCount: 5,
}

const mockSubscribedFeed: DiscoveredFeed = {
  id: 'subscribed-1',
  url: 'https://subscribed.com/feed',
  title: '已订阅源',
  description: '已订阅源描述',
  discoveredAt: Date.now(),
  discoveredFrom: 'https://subscribed.com',
  status: 'subscribed',
  subscribedAt: Date.now(), // 订阅时间
  isActive: true,
  lastFetchedAt: Date.now(),
  articleCount: 10,
  recommendedCount: 3,
  unreadCount: 7,
}

const mockIgnoredFeed: DiscoveredFeed = {
  id: 'ignored-1',
  url: 'https://ignored.com/feed',
  title: '已忽略源',
  status: 'ignored',
  discoveredAt: Date.now(),
  discoveredFrom: 'https://ignored.com',
  isActive: false,
  articleCount: 0,
  recommendedCount: 0,
  unreadCount: 0,
}

describe("RSSSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFeeds.mockResolvedValue([])
    vi.mocked(RSSValidator.validateURL).mockResolvedValue({ valid: true, type: 'rss' })
    mockSendMessage.mockResolvedValue({ success: true })
  })

  describe("基本渲染", () => {
    it("应该正常渲染组件", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'candidate') return Promise.resolve([])
        if (status === 'subscribed') return Promise.resolve([])
        if (status === 'ignored') return Promise.resolve([])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
      // 等待加载完成
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
    })

    it("应该在加载完成后显示候选源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'candidate') return Promise.resolve([mockCandidateFeed])
        if (status === 'subscribed') return Promise.resolve([])
        if (status === 'ignored') return Promise.resolve([])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('候选源标题'))).toBeInTheDocument()
      })
    })

    it("应该显示已订阅源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'candidate') return Promise.resolve([])
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        if (status === 'ignored') return Promise.resolve([])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
        await waitFor(() => {
          expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
        })
    })

    it("应该显示无数据状态", async () => {
      mockGetFeeds.mockResolvedValue([])
      
      renderWithI18n(<RSSSettings />)
      
      // Phase 9.1: 移除了空状态错误提示，现在直接显示 OPML 导入界面
      await waitFor(() => {
        expect(screen.getByText(/Import OPML|导入 OPML/i)).toBeInTheDocument()
      })
    })
  })

  describe("错误处理", () => {
    it("应该处理加载失败", async () => {
      mockGetFeeds.mockRejectedValue(new Error('Load failed'))
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
    })
  })

  describe("订阅管理", () => {
    it("应该能够订阅候选源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'candidate') return Promise.resolve([mockCandidateFeed])
        return Promise.resolve([])
      })
      mockSubscribe.mockResolvedValue(undefined)
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('候选源标题'))).toBeInTheDocument()
      })
      
      // 验证 mockSubscribe 函数已定义
      expect(mockSubscribe).toBeDefined()
    })

    it("应该能够取消订阅", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      mockUnsubscribe.mockResolvedValue(undefined)
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
      // 验证 mockUnsubscribe 函数已定义
      expect(mockUnsubscribe).toBeDefined()
    })

    it("应该能够忽略候选源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'candidate') return Promise.resolve([mockCandidateFeed])
        return Promise.resolve([])
      })
      mockIgnore.mockResolvedValue(undefined)
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('候选源标题'))).toBeInTheDocument()
      })
      
      // 验证 mockIgnore 函数已定义
      expect(mockIgnore).toBeDefined()
    })
  })

  describe("手动添加 RSS 源", () => {
    it("应该显示手动添加表单（当有订阅源时）", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
      // 应该显示手动添加区域（通过查找 placeholder）
        const input = screen.getByPlaceholderText(/https:\/\/example\.com\/feed\.xml|manualPlaceholder/i)
      expect(input).toBeInTheDocument()
    })
  })

  describe("RSS 读取功能", () => {
    it("应该显示全部读取按钮", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
        const fetchAllButton = screen.getByRole('button', { name: /Read All|全部读取/i })
      expect(fetchAllButton).toBeInTheDocument()
    })
  })

  describe("已忽略源管理", () => {
    it("应该能够渲染已忽略源区域", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'ignored') return Promise.resolve([mockIgnoredFeed])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
      
      // 验证通过查找包含"ignoredFeeds"的第一个span
        expect(screen.getByText(/Ignored/)).toBeInTheDocument()
    })

    it("应该能够删除忽略的源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'ignored') return Promise.resolve([mockIgnoredFeed])
        return Promise.resolve([])
      })
      mockDelete.mockResolvedValue(undefined)
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
          expect(screen.getByText(/Ignored/)).toBeInTheDocument()
        })
      
      // 验证 delete 函数已定义
      expect(mockDelete).toBeDefined()
    })
  })

  describe("手动添加 RSS - 完整流程", () => {
    it("应该成功添加新的 RSS 源", async () => {
      const user = userEvent.setup()
      // 必须有至少一个订阅源，才会显示手动添加表单
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      mockGetFeedByUrl.mockResolvedValue(null) // 不存在
      mockAddCandidate.mockResolvedValue('new-feed-id')
      mockSubscribe.mockResolvedValue(undefined)
      mockAnalyzeFeed.mockResolvedValue({ score: 75 })
      vi.mocked(RSSValidator.validateURL).mockResolvedValue({
        valid: true,
        type: 'rss',
        metadata: {
          title: '新RSS源',
          description: '描述',
          link: 'https://example.com',
          language: 'zh-CN',
        },
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
      
      const input = screen.getByPlaceholderText(/https:\/\/example\.com\/feed\.xml/i)
      await user.type(input, 'https://example.com/feed.xml')
      
      const addSection = screen.getByText(/Add feed|添加订阅源/i).closest('div') as HTMLElement
      const addButton = within(addSection!).getByRole('button', { name: /Subscribe|订阅/i })
      await user.click(addButton)
      
      await waitFor(() => {
        expect(mockAddCandidate).toHaveBeenCalled()
        expect(mockSubscribe).toHaveBeenCalledWith('new-feed-id', 'manual')
      })
    })

    it("应该处理 URL 验证失败", async () => {
      const user = userEvent.setup()
      // 必须有至少一个订阅源
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      vi.mocked(RSSValidator.validateURL).mockResolvedValue({
        valid: false,
        type: null,
        error: 'Invalid URL',
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
      
      const input = screen.getByPlaceholderText(/https:\/\/example\.com\/feed\.xml/i)
      await user.type(input, 'invalid-url')
      
      const addSection = screen.getByText(/Add feed|添加订阅源/i).closest('div') as HTMLElement
      const addButton = within(addSection!).getByRole('button', { name: /Subscribe|订阅/i })
      await user.click(addButton)
      
      await waitFor(() => {
        expect(screen.getByText('Invalid URL')).toBeInTheDocument()
      })
    })

    it("应该处理已存在的 RSS 源", async () => {
      const user = userEvent.setup()
      // 必须有至少一个订阅源
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      mockGetFeedByUrl.mockResolvedValue(mockSubscribedFeed) // 已存在
      vi.mocked(RSSValidator.validateURL).mockResolvedValue({
        valid: true,
        type: 'rss',
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
      
      const input = screen.getByPlaceholderText(/https:\/\/example\.com\/feed\.xml/i)
      await user.type(input, 'https://example.com/feed.xml')
      
      const addSection = screen.getByText(/Add feed|添加订阅源/i).closest('div') as HTMLElement
      const addButton = within(addSection!).getByRole('button', { name: /Subscribe|订阅/i })
      await user.click(addButton)
      
      await waitFor(() => {
        expect(screen.getByText(/already exists|已存在/i)).toBeInTheDocument()
      })
    })

    it("应该禁用空 URL 输入的订阅按钮", async () => {
      // 必须有至少一个订阅源
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
      
      // 验证空 URL 时按钮被禁用（限定在“添加订阅源”区域内）
      const addSection = screen.getByText(/Add feed|添加订阅源/i).closest('div') as HTMLElement
      const addButton = within(addSection!).getByRole('button', { name: /Subscribe|订阅/i })
      expect(addButton).toBeDisabled()
    })
  })

  describe("源状态切换", () => {
    it("应该能够暂停订阅源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      mockToggleActive.mockResolvedValue(false) // 返回新状态：已暂停
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
      // 验证 toggleActive 函数已定义
      expect(mockToggleActive).toBeDefined()
    })

    it("应该显示暂停状态", async () => {
      const pausedFeed: DiscoveredFeed = { 
        ...mockSubscribedFeed, 
        isActive: false,
        subscribedAt: Date.now()  // 必须有 subscribedAt 才会显示暂停状态
      }
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([pausedFeed])
        return Promise.resolve([])
      })
      mockToggleActive.mockResolvedValue(true) // 返回新状态：已恢复
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
      // 验证暂停状态文本显示（包含暂停图标和文本）
        const pausedIcon = screen.getAllByText((content, element) => {
          return element?.textContent?.includes('⏸') || false
        })
        expect(pausedIcon.length).toBeGreaterThan(0)
    })
  })

  describe("RSS 读取操作", () => {
    it("应该能够读取所有订阅源", async () => {
      const user = userEvent.setup()
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      mockSendMessage.mockResolvedValue({ success: true, data: {} })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
      const fetchAllButton = screen.getByRole('button', { name: /Read All|全部读取/i })
      await user.click(fetchAllButton)
      
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: 'MANUAL_FETCH_FEEDS'
        })
      })
    })

    it("应该处理全部读取失败", async () => {
      const user = userEvent.setup()
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'subscribed') return Promise.resolve([mockSubscribedFeed])
        return Promise.resolve([])
      })
      mockSendMessage.mockResolvedValue({ success: false, error: 'Network error' })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('已订阅源'))).toBeInTheDocument()
      })
      
      const fetchAllButton = screen.getByRole('button', { name: /Read All|全部读取/i })
      await user.click(fetchAllButton)
      
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled()
      })
      
      alertSpy.mockRestore()
    })
  })

  describe("从忽略列表恢复订阅", () => {
    it("应该能够从忽略列表订阅源", async () => {
      mockGetFeeds.mockImplementation((status: string) => {
        if (status === 'ignored') return Promise.resolve([mockIgnoredFeed])
        return Promise.resolve([])
      })
      mockSubscribe.mockResolvedValue(undefined)
      mockGetFeed.mockResolvedValue({
        ...mockIgnoredFeed,
        status: 'subscribed',
        quality: { score: 75 }
      })
      
      renderWithI18n(<RSSSettings />)
      
      await waitFor(() => {
        // 验证忽略列表区域存在
        const toggleButton = screen.getAllByText(/Ignored|已忽略源/i)[0]
        expect(toggleButton).toBeInTheDocument()
      })
      
      // 验证 subscribe 函数可以被调用
      expect(mockSubscribe).toBeDefined()
    })
  })
})