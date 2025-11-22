/**
 * RSSSettings 组件测试 - 简化版
 * 专注于核心功能测试以快速提升覆盖率
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RSSSettings } from "./RSSSettings"

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock FeedManager
vi.mock("@/core/rss/FeedManager", () => ({
  FeedManager: vi.fn(() => ({
    getFeeds: vi.fn().mockResolvedValue([]),
    getFeed: vi.fn(),
    ignore: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    delete: vi.fn(),
    toggleActive: vi.fn(),
  })),
}))

// Mock RSSFetcher
vi.mock("@/core/rss/RSSFetcher", () => ({
  RSSFetcher: vi.fn(() => ({
    fetch: vi.fn().mockResolvedValue({ success: true, items: [] }),
  })),
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
  })

  describe("基本渲染", () => {
    it("应该显示加载状态", () => {
      render(<RSSSettings />)
      expect(screen.getByText("options.rssManager.loading")).toBeInTheDocument()
    })

    it("应该在无数据时显示空状态提示", async () => {
      render(<RSSSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("options.rssManager.noFeeds")).toBeInTheDocument()
      })
    })
  })
})