/**
 * ProfileSettings 组件测试 - 简化版
 * 专注于核心功能测试以快速提升覆盖率
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { ProfileSettings } from "./ProfileSettings"

// 简单的 mock 实现
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({ _: (key: string) => key }),
}))

vi.mock("@/storage/db", () => ({
  getUserProfile: vi.fn().mockResolvedValue(null),
  getPageCount: vi.fn().mockResolvedValue(50),
}))

vi.mock("@/storage/ai-config", () => ({
  getAIConfig: vi.fn().mockResolvedValue({
    enabled: false,
    provider: null,
    apiKeys: {},
    monthlyBudget: 0,
  }),
  getProviderDisplayName: vi.fn().mockReturnValue(""),
}))

vi.mock("@/core/profile/ProfileManager", () => ({
  profileManager: {
    getProfile: vi.fn(),
    rebuildProfile: vi.fn(),
  },
}))

vi.mock("@/core/profile/InterestSnapshotManager", () => ({
  InterestSnapshotManager: {
    getEvolutionHistory: vi.fn().mockResolvedValue({
      snapshots: [],
      totalSnapshots: 0,
    }),
  },
}))

global.alert = vi.fn()

describe("ProfileSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("基本渲染", () => {
    it("应该正确渲染无数据状态", async () => {
      render(<ProfileSettings />)
      
      await waitFor(() => {
        expect(screen.getByText("options.userProfile.noData.message")).toBeInTheDocument()
      })
    })
  })
})