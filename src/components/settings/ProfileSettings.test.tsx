/**
 * ProfileSettings 组件测试
 * 测试用户画像展示组件的基本功能
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { ProfileSettings } from "./ProfileSettings"

// Mock i18n helpers  
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => key,
  }),
}))

// Mock storage/db - 返回 null 模拟无数据状态
vi.mock("@/storage/db", () => ({
  getUserProfile: vi.fn().mockResolvedValue(null),
  getPageCount: vi.fn().mockResolvedValue(50),
}))

// Mock AI config
vi.mock("@/storage/ai-config", () => ({
  getAIConfig: vi.fn().mockResolvedValue({
    selectedEngine: "keyword",
    enabled: false,
    provider: null,
  }),
  getProviderDisplayName: vi.fn(() => ""),
}))

// Mock ProfileManager
vi.mock("@/core/profile/ProfileManager", () => ({
  profileManager: {
    getProfile: vi.fn().mockResolvedValue(null),
    rebuildProfile: vi.fn(),
  },
}))

// Mock InterestSnapshotManager - mock 静态方法
vi.mock("@/core/profile/InterestSnapshotManager", () => {
  return {
    InterestSnapshotManager: {
      getEvolutionHistory: vi.fn().mockResolvedValue([]),
    },
  }
})

describe("ProfileSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("基本渲染", () => {
    it("应该正确渲染无数据状态", async () => {
      render(<ProfileSettings />)
      
      // 无数据时应该显示提示信息
      await waitFor(() => {
        expect(screen.getByText("options.userProfile.noData.message")).toBeInTheDocument()
      })
    })
  })

  describe("无数据状态", () => {
    it("应该显示引导提示", async () => {
      render(<ProfileSettings />)
      
      await waitFor(() => {
        // 检查是否显示了无数据提示
        expect(screen.getByText("options.userProfile.noData.hint")).toBeInTheDocument()
        expect(screen.getByText("options.userProfile.noData.tip")).toBeInTheDocument()
      })
    })
  })
})
