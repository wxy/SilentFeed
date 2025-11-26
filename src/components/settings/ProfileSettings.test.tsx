/**
 * ProfileSettings 组件测试
 * 
 * 测试 AI First 版本的用户画像组件
 */

import { render, screen, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { ProfileSettings } from "./ProfileSettings"
import { getUserProfile } from "@/storage/db"
import { getAIConfig } from "@/storage/ai-config"
import { profileManager } from "@/core/profile/ProfileManager"
import { Topic } from "@/core/profile/topics"
import type { TopicDistribution } from "@/core/profile/TopicClassifier"

// 辅助函数：创建完整的 topics 对象
function createTopics(partial: Partial<TopicDistribution> = {}): TopicDistribution {
  return {
    [Topic.TECHNOLOGY]: 0,
    [Topic.SCIENCE]: 0,
    [Topic.DESIGN]: 0,
    [Topic.ARTS]: 0,
    [Topic.BUSINESS]: 0,
    [Topic.HEALTH]: 0,
    [Topic.SPORTS]: 0,
    [Topic.ENTERTAINMENT]: 0,
    [Topic.NEWS]: 0,
    [Topic.EDUCATION]: 0,
    [Topic.OTHER]: 0,
    ...partial,
  }
}

// Mock dependencies
vi.mock("@/storage/db")
vi.mock("@/storage/ai-config")
vi.mock("@/core/profile/ProfileManager")
vi.mock("@/i18n/helpers", () => ({
  useI18n: () => ({
    _: (key: string) => key, // 直接返回 key，便于测试
  }),
}))

const mockGetUserProfile = vi.mocked(getUserProfile)
const mockGetAIConfig = vi.mocked(getAIConfig)
const mockRebuildProfile = vi.fn()

vi.mocked(profileManager).rebuildProfile = mockRebuildProfile

describe("ProfileSettings 组件", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserProfile.mockResolvedValue(null)
    mockGetAIConfig.mockResolvedValue({
      enabled: false,
      provider: null,
      apiKeys: {},
      monthlyBudget: 0,
    })
  })

  describe("加载状态", () => {
    it("应该显示加载动画", () => {
      render(<ProfileSettings />)
      const loadingElement = document.querySelector(".animate-pulse")
      expect(loadingElement).toBeInTheDocument()
    })
  })

  describe("无数据状态", () => {
    it("应该显示无数据提示", async () => {
      mockGetUserProfile.mockResolvedValue(null)

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.noData.message/)).toBeInTheDocument()
      })
    })

    it("应该在 totalPages 为 0 时显示无数据提示", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 0,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.noData.message/)).toBeInTheDocument()
      })
    })
  })

  describe("基础统计信息", () => {
    beforeEach(() => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
    })

    it("应该显示总页面数", async () => {
      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText("100")).toBeInTheDocument()
        expect(screen.getByText(/options.profile.basicStats.totalPages/)).toBeInTheDocument()
      })
    })

    it("应该显示更新时间", async () => {
      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.updateTime.label/)).toBeInTheDocument()
      })
    })
  })

  describe("AI 配置状态", () => {
    it("应该显示 AI 未配置提示", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
      mockGetAIConfig.mockResolvedValue({
        enabled: false,
        provider: null,
        apiKeys: {},
        monthlyBudget: 0,
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.profile.aiProfile.notConfiguredTitle/)).toBeInTheDocument()
        expect(screen.getByText(/options.userProfile.analysisQuality.notConfigured/)).toBeInTheDocument()
      })
    })

    it("应该显示 AI 已配置状态", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: "openai",
        apiKeys: { openai: "test-key" },
        monthlyBudget: 100,
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.analysisQuality.aiAnalysis/)).toBeInTheDocument()
        expect(screen.getByText(/options.userProfile.analysisQuality.aiHint/)).toBeInTheDocument()
      })
    })
  })

  describe("AI 画像展示", () => {
    beforeEach(() => {
      // 每个测试都需要配置 AI
      mockGetAIConfig.mockResolvedValue({
        enabled: true,
        provider: "openai",
        apiKeys: { openai: "test-key" },
        monthlyBudget: 100,
      })
    })

    it("应该显示 AI 生成的兴趣总结", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户对人工智能、机器学习和深度学习技术非常感兴趣，经常关注相关领域的前沿研究和应用案例。",
          preferences: [
            "偏好深度技术文章，不喜欢浅显的入门教程",
            "喜欢实践案例和代码示例",
            "关注行业动态和技术趋势",
          ],
          avoidTopics: [
            "八卦新闻",
            "娱乐内容",
          ],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.profile.aiProfile.title/)).toBeInTheDocument()
        expect(screen.getByText(/人工智能/)).toBeInTheDocument()
        expect(screen.getByText(/机器学习/)).toBeInTheDocument()
      })
    })

    it("应该显示偏好特征列表", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户兴趣总结",
          preferences: [
            "偏好深度技术文章",
            "喜欢实践案例",
          ],
          avoidTopics: [],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/偏好深度技术文章/)).toBeInTheDocument()
        expect(screen.getByText(/喜欢实践案例/)).toBeInTheDocument()
      })
    })

    it("应该显示避免主题列表", async () => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
        aiSummary: {
          interests: "用户兴趣总结",
          preferences: [],
          avoidTopics: [
            "八卦新闻",
            "娱乐内容",
          ],
          metadata: {
            provider: "openai",
            model: "gpt-4",
            timestamp: Date.now(),
            basedOn: { browses: 100, reads: 50, dismisses: 10 },
          },
        },
      })

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/八卦新闻/)).toBeInTheDocument()
        expect(screen.getByText(/娱乐内容/)).toBeInTheDocument()
      })
    })
  })

  describe("重建画像功能", () => {
    beforeEach(() => {
      mockGetUserProfile.mockResolvedValue({
        id: "singleton",
        version: 1,
        totalPages: 100,
        topics: createTopics(),
        keywords: [],
        domains: [],
        lastUpdated: Date.now(),
      })
    })

    it("应该显示重建按钮", async () => {
      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.actions.rebuild/)).toBeInTheDocument()
      })
    })

    it("应该在点击重建按钮时调用重建函数", async () => {
      const user = userEvent.setup()
      mockRebuildProfile.mockResolvedValue(undefined)

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.actions.rebuild/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/options.userProfile.actions.rebuild/)
      await user.click(rebuildButton)

      await waitFor(() => {
        expect(mockRebuildProfile).toHaveBeenCalled()
      })
    })

    it("应该在重建时禁用按钮", async () => {
      const user = userEvent.setup()
      mockRebuildProfile.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<ProfileSettings />)

      await waitFor(() => {
        expect(screen.getByText(/options.userProfile.actions.rebuild/)).toBeInTheDocument()
      })

      const rebuildButton = screen.getByText(/options.userProfile.actions.rebuild/).closest("button")
      expect(rebuildButton).not.toBeDisabled()

      await user.click(rebuildButton!)

      // 重建中应该禁用
      expect(rebuildButton).toBeDisabled()
    })
  })

  describe("错误处理", () => {
    it("应该处理加载 profile 失败", async () => {
      mockGetUserProfile.mockRejectedValue(new Error("Load failed"))

      render(<ProfileSettings />)

      await waitFor(() => {
        // 应该停止加载状态
        const loadingElement = document.querySelector(".animate-pulse")
        expect(loadingElement).not.toBeInTheDocument()
      })
    })
  })
})
