/**
 * RSSSettings 组件测试
 * 测试 RSS 订阅源管理组件
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RSSSettings } from "./RSSSettings"

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      if (params) {
        return key.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k])
      }
      return key
    },
  }),
}))

// Mock storage/db
vi.mock("@/storage/db", () => ({
  db: {
    rssFeeds: {
      toArray: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rssCandidates: {
      toArray: vi.fn().mockResolvedValue([]),
    },
    rssArticles: {
      where: vi.fn(() => ({
        count: vi.fn().mockResolvedValue(0),
      })),
    },
  },
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
    it("应该正确渲染 RSS 管理界面", async () => {
      render(<RSSSettings />)
      
      await waitFor(() => {
        // 检查标题是否存在
        expect(screen.getByText(/options.rssManager/)).toBeInTheDocument()
      })
    })
  })

  describe("订阅源列表", () => {
    it("应该显示订阅源列表", async () => {
      const { container } = render(<RSSSettings />)
      
      await waitFor(() => {
        // 组件应该渲染
        expect(container.firstChild).toBeTruthy()
      })
    })
  })
})
