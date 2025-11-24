/**
 * RSSSettings 组件测试 - 基础版
 * 由于组件过大(1279行)，采用渐进式测试策略
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RSSSettings } from "./RSSSettings"

// Mock 函数
const mockGetFeeds = vi.fn()

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock FeedManager
vi.mock("@/core/rss/managers/FeedManager", () => ({
  FeedManager: vi.fn(() => ({
    getFeeds: mockGetFeeds,
    getFeed: vi.fn(),
    ignore: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getFeedByUrl: vi.fn(),
    addCandidate: vi.fn(),
    analyzeFeed: vi.fn(),
  })),
}))

// Mock RSSFetcher
vi.mock("@/core/rss/RSSFetcher", () => ({
  RSSFetcher: vi.fn(() => ({
    fetch: vi.fn().mockResolvedValue({ success: true, items: [] }),
  })),
}))

// Mock RSSValidator
vi.mock("@/core/rss/RSSValidator", () => ({
  RSSValidator: {
    validateURL: vi.fn().mockResolvedValue({ valid: true }),
  },
}))

// Mock OPMLImporter  
vi.mock("@/core/rss/OPMLImporter", () => ({
  OPMLImporter: vi.fn(() => ({
    import: vi.fn(),
  })),
}))

// Mock favicon utils
vi.mock("@/utils/favicon", () => ({
  getFaviconUrl: vi.fn((url) => `https://favicon.service/${url}`),
  handleFaviconError: vi.fn(),
}))

// Mock chrome runtime
global.chrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
} as any

describe("RSSSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFeeds.mockResolvedValue([])
  })

  describe("基本渲染", () => {
    it("应该正常渲染组件", async () => {
      mockGetFeeds.mockResolvedValue([])
      
      render(<RSSSettings />)
      
      // 等待加载完成
      await waitFor(() => {
        expect(screen.getByText("options.rssManager.noFeeds")).toBeInTheDocument()
      })
    })

    it("应该在加载完成后显示无数据状态", async () => {
      mockGetFeeds.mockResolvedValue([])
      
      render(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("options.rssManager.noFeeds")).toBeInTheDocument()
      })
    })
  })

  describe("错误处理", () => {
    it("应该处理加载失败", async () => {
      mockGetFeeds.mockRejectedValue(new Error('Load failed'))
      
      render(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.queryByText("options.rssManager.loading")).not.toBeInTheDocument()
      })
    })
  })

  describe("组件属性", () => {
    it.skip("应该支持 Sketchy 样式", async () => {
      mockGetFeeds.mockResolvedValue([])
      
      const { container } = render(<RSSSettings isSketchyStyle={true} />)
      
      await waitFor(() => {
        expect(container.querySelector('div')).toBeInTheDocument()
      })
    })

    it.skip("应该支持普通样式", async () => {
      mockGetFeeds.mockResolvedValue([])
      
      const { container } = render(<RSSSettings isSketchyStyle={false} />)
      
      await waitFor(() => {
        expect(container.querySelector('div')).toBeInTheDocument()
      })
    })
  })
})